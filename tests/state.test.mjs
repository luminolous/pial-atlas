import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,defaultState,cortexVisibility,subcorticalVisibility,hierarchy} from '../src/state.js';
import fs from 'node:fs';
const atlas=JSON.parse(fs.readFileSync(new URL('../data/atlas.meshopt.json',import.meta.url)));
const surface={hemisphere:'lh',labels:new Uint16Array([3,8,20,50,4,9,21,51]),lobes:new Uint8Array([1,2])};
test('A hidden parcel remains hidden after scheme, morph, layout, and material changes',()=>{
  const store=new Store();store.toggle('hiddenParcels',3);
  for(const scheme of ['dk','destrieux','yeo7','yeo17'])for(const morph of [0,1,2,3,4])for(const material of ['anatomical','glass','wireframe','porcelain']){
    store.update({scheme,morph,material,separation:90,lift:80},{record:false});
    assert.equal(cortexVisibility(store.state,surface,0,atlas),0);
    assert.equal(cortexVisibility(store.state,surface,1,atlas),1);
  }
});
test('Hemisphere and lobe masks remain independent of active scheme',()=>{
  const state=defaultState();state.hiddenGroups=['lh:frontal'];
  assert.equal(cortexVisibility(state,surface,0,atlas),0);assert.equal(cortexVisibility(state,surface,1,atlas),1);
  state.hiddenGroups=['rh'];assert.equal(cortexVisibility(state,surface,0,atlas),1);
});
test('Undo restores grouped slider changes, visibility, and reset state',()=>{
  const s=new Store();s.toggle('hiddenStructures',10);s.begin();s.update({morph:1});s.update({morph:3});s.end();s.undo();
  assert.equal(s.state.morph,0);assert.deepEqual(s.state.hiddenStructures,[10]);s.reset();assert.deepEqual(s.state.hiddenStructures,[]);s.undo();assert.deepEqual(s.state.hiddenStructures,[10]);s.undo();assert.deepEqual(s.state.hiddenStructures,[]);
});
test('Isolation cannot resurrect explicitly hidden anatomy',()=>{
  const state=defaultState();state.hiddenParcels=[3];state.isolation={type:'parcel',id:3};
  assert.equal(cortexVisibility(state,surface,0,atlas),0);assert.equal(cortexVisibility(state,surface,1,atlas),0);
  state.hiddenStructures=[10];state.isolation={type:'structure',id:10};assert.equal(subcorticalVisibility(state,atlas.structures.find(s=>s.id===10)),0);
});
test('All imported labels and structures have reachable hierarchy membership',()=>{
  for(const scheme of ['dk','destrieux','yeo7','yeo17']){
    const nodes=hierarchy(atlas,scheme);const labels=[],structures=[],visited=new Set();
    function visit(node){assert.ok(!visited.has(node.key));visited.add(node.key);for(const child of node.children){if(child.type==='group')visit(child);else if(child.type==='parcel')labels.push(child.id);else structures.push(child.id);}}
    visit(nodes.get('brain'));
    assert.equal(visited.size,nodes.size);assert.equal(labels.length,atlas.parcels.filter(p=>p.scheme===scheme).length);assert.equal(new Set(labels).size,labels.length);assert.equal(structures.length,21);
  }
});
test('Group opacity composes with hidden masks and restore all',()=>{
  const s=new Store();s.update({groupOpacity:{brain:.8,'lh:frontal':.3}});assert.equal(cortexVisibility(s.state,surface,0,atlas),.3);assert.equal(cortexVisibility(s.state,surface,1,atlas),.8);s.toggle('hiddenGroups','lh');assert.equal(cortexVisibility(s.state,surface,0,atlas),0);s.restore();assert.equal(cortexVisibility(s.state,surface,0,atlas),1);
});
test('Repeated identical input events do not consume an undo step',()=>{
  const s=new Store();s.update({morph:2});s.update({morph:2});s.undo();assert.equal(s.state.morph,0);
});
