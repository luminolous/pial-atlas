import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import {decodeAtlas} from '../src/data.js';
import {accessibleColours,SAFE_COLOURS,deepUsesSourceColour,legendRows} from '../src/appearance.js';
import {Store,SCHEMES} from '../src/state.js';
const atlas=await decodeAtlas(zlib.gzipSync(await fs.readFile('data/atlas.meshopt.json')).toString('base64'));
test('Paired cortical legend covers every source label exactly once and excludes aseg',()=>{
  for(const [i,scheme] of SCHEMES.entries()){
    const rows=legendRows(atlas,scheme);assert.equal(rows.length,[35,75,8,18][i]);assert.equal(rows.at(-1).assigned,false);
    const ids=rows.flatMap(r=>[...r.lh,...r.rh].map(p=>p.id));assert.deepEqual(ids.sort((a,b)=>a-b),atlas.parcels.filter(p=>p.scheme===scheme).map(p=>p.id));
    for(const h of ['lh','rh'])assert.ok(Math.abs(rows.filter(r=>r.assigned).reduce((s,r)=>s+r[h][0].areaPercent,0)-100)<1e-9);
  }
});
test('Accessible palette covers all schemes, preserves bilateral label identity and original colours',()=>{
  const original=atlas.parcels.map(p=>[...p.color]),colours=accessibleColours(atlas);
  assert.equal(colours.size,atlas.parcels.length);const allowed=SAFE_COLOURS.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(','));
  for(const p of atlas.parcels){if(p.assigned){assert.ok(allowed.includes(colours.get(p.id).join(',')));const other=atlas.parcels.find(q=>q.scheme===p.scheme&&q.localId===p.localId&&q.hemisphere!==p.hemisphere);assert.deepEqual(colours.get(p.id),colours.get(other.id));}else assert.deepEqual(colours.get(p.id),p.color);}
  assert.deepEqual(atlas.parcels.map(p=>p.color),original);
});
test('Deep context colour follows lift, selection, and explicit Structures navigation',()=>{
  const store=new Store(),stem=atlas.structures.find(s=>s.id===16),cerebellum=atlas.structures.find(s=>s.id===8);
  assert.equal(deepUsesSourceColour(store.state,stem),false);
  store.update({lift:1});assert.equal(deepUsesSourceColour(store.state,cerebellum,false),true);
  store.update({lift:0,selection:{type:'structure',id:16}});assert.equal(deepUsesSourceColour(store.state,stem,false),true);assert.equal(deepUsesSourceColour(store.state,cerebellum,false),false);
  store.update({selection:null,nav:'cerebellum'});assert.equal(deepUsesSourceColour(store.state,cerebellum,true),true);assert.equal(deepUsesSourceColour(store.state,cerebellum,false),false);assert.equal(deepUsesSourceColour(store.state,stem,true),false);
});
test('Appearance controls participate in undo and reset without clearing hidden masks',()=>{
  const store=new Store();assert.equal(store.state.curvatureShading,true);assert.equal(store.state.colourblindSafe,false);
  store.update({hiddenParcels:[2],curvatureShading:false,colourblindSafe:true});store.update({colourblindSafe:false});store.undo();assert.equal(store.state.colourblindSafe,true);assert.deepEqual(store.state.hiddenParcels,[2]);store.reset();assert.equal(store.state.curvatureShading,true);assert.equal(store.state.colourblindSafe,false);
});
