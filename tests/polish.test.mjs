import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import {decodeAtlas} from '../src/data.js';
import {buildLiftLayout,overlaps,LIFT_GROUPS} from '../src/lift.js';
import {categoricalPick,cortexGeometry,labelFields,fieldPick} from '../src/cortex.js';
import {MOTION,ease,duration,Tweens} from '../src/motion.js';
const atlas=await decodeAtlas(zlib.gzipSync(await fs.readFile('data/atlas.meshopt.json')).toString('base64'));

test('Lift layout covers every source structure and has no intersecting AABBs',()=>{
  const layout=buildLiftLayout(atlas.structures),entries=[...layout.entries];
  assert.equal(entries.length,27);assert.equal(new Set(LIFT_GROUPS.flatMap(g=>g.ids)).size,27);
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)assert.equal(overlaps(entries[i][1].bounds,entries[j][1].bounds,15.9),false,`${entries[i][0]} overlaps ${entries[j][0]}`);
  for(const [id,entry] of entries){const s=atlas.structures.find(s=>s.id===id);for(let i=0;i<s.positions.length;i++)assert.ok(s.positions[i]+entry.offset[i%3]>=entry.bounds.min[i%3]-.001);}
});
test('Barycentric categorical picking combines repeated labels without inventing IDs',()=>{
  assert.equal(categoricalPick([7,7,12],[.3,.3,.4]),7);
  assert.equal(categoricalPick([7,9,12],[.1,.35,.55]),12);
  assert.equal(categoricalPick([7,7,12],[.1,.2,.7]),12);
});
test('GPU triangle corners preserve every source morph vertex and all label schemes',()=>{
  for(const s of atlas.surfaces){const g=cortexGeometry(s);assert.equal(g.getAttribute('position').count,s.index.length);
    const states=['pial','white','inflated','sphere','flat'];for(let state=0;state<5;state++){
      const values=(state?g.morphAttributes.position[state-1]:g.getAttribute('position')).array;
      for(let corner=0;corner<s.index.length;corner+=37)for(let axis=0;axis<3;axis++)assert.equal(values[corner*3+axis],s.positions[states[state]][s.index[corner]*3+axis]);
    }
    for(let face=0;face<s.index.length;face+=3*127)for(let vertex=0;vertex<3;vertex++)for(let scheme=0;scheme<4;scheme++)assert.equal(g.getAttribute('atlasLabels'+['A','B','C'][vertex]).array[face*4+scheme],s.labels[s.index[face+vertex]*4+scheme]);
    g.dispose();
  }
});
test('Motion tokens, easing endpoints, and reduced-motion completion are deterministic',()=>{
  assert.deepEqual(MOTION,{micro:120,ui:220,layout:450,camera:700,scheme:300,stagger:20,staggerCap:200});
  assert.equal(ease(0),0);assert.equal(ease(1),1);let previous=0;for(let i=0;i<=100;i++){const next=ease(i/100);assert.ok(next>=previous&&next<=1);previous=next;}
  const original=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});let value=0;const tweens=new Tweens();tweens.to('test',0,100,'layout',v=>value=v);assert.equal(value,100);assert.equal(tweens.items.size,0);assert.equal(duration('camera'),0);globalThis.matchMedia=original;
});
test('Filtered boundary fields retain every named parcel and picking returns only source IDs',()=>{
  for(const surface of atlas.surfaces){const field=labelFields(surface);
    for(let scheme=0;scheme<4;scheme++){
      const allowed=new Set(atlas.parcels.filter(p=>p.hemisphere===surface.hemisphere&&p.scheme===['dk','destrieux','yeo7','yeo17'][scheme]).map(p=>p.id));
      const seen=new Set();for(let face=0;face<surface.index.length/3;face++){const id=fieldPick(field,face,[1/3,1/3,1/3],scheme);assert.ok(allowed.has(id));seen.add(id);}
      for(const p of atlas.parcels.filter(p=>allowed.has(p.id)&&p.assigned))assert.ok(seen.has(p.id),`The display filter removed ${p.name}`);
    }
    field.texture.dispose();
  }
});
