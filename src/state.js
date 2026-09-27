export const SCHEMES=['dk','destrieux','yeo7','yeo17'];
export const SURFACES=['pial','white','inflated','sphere','flat'];
export const LOBES=['unassigned','frontal','parietal','temporal','occipital','cingulate','insula'];
export function defaultState() {
  return {scheme:'dk',morph:0,separation:0,lift:0,material:'anatomical',opacity:1,hiddenGroups:[],hiddenParcels:[],hiddenStructures:[],groupOpacity:{},isolation:null,selection:null,nav:'brain',labels:false,auto:false,clips:[{enabled:false,position:0,reverse:false},{enabled:false,position:-20,reverse:false},{enabled:false,position:20,reverse:false}]};
}
export class Store {
  constructor(){this.state=defaultState();this.history=[];this.listeners=new Set();this.grouping=false;}
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  emit(){for(const fn of this.listeners)fn(this.state);}
  checkpoint(){this.history.push(structuredClone(this.state));if(this.history.length>80)this.history.shift();}
  update(patch,{record=true}={}){
    if(Object.keys(patch).every(key=>JSON.stringify(this.state[key])===JSON.stringify(patch[key])))return;
    if(record&&!this.grouping)this.checkpoint();this.state={...this.state,...patch};this.emit();
  }
  begin(){if(!this.grouping)this.checkpoint();this.grouping=true;}
  end(){this.grouping=false;}
  undo(){if(this.history.length){this.state=this.history.pop();this.emit();}}
  reset(){this.update(defaultState());}
  restore(){this.update({hiddenGroups:[],hiddenParcels:[],hiddenStructures:[],groupOpacity:{},opacity:1,isolation:null});}
  toggle(field,key){const next=new Set(this.state[field]);next.has(key)?next.delete(key):next.add(key);this.update({[field]:[...next]});}
}
export function cortexGroups(hemi,lobe){return ['brain','forebrain','cortex',hemi,hemi+':cortex',hemi+':networks',hemi+':'+lobe];}
export function structureGroups(s){
  if(s.group==='ventricles')return ['brain','ventricles','subcortical'];
  if(s.group==='brainstem')return ['brain','brainstem','subcortical'];
  if(s.group==='cerebellum')return ['brain','cerebellum','cerebellum:'+s.hemisphere];
  if(s.group==='diencephalon')return ['brain','forebrain','diencephalon','subcortical'];
  return ['brain','forebrain',s.hemisphere,s.hemisphere+':deep','subcortical'];
}
function groupsOpacity(state,groups){
  if(groups.some(g=>state.hiddenGroups.includes(g)))return 0;
  return groups.reduce((a,g)=>Math.min(a,state.groupOpacity[g]??1),state.opacity);
}
export function cortexVisibility(state,surface,vertex,atlas) {
  const ids=Array.from(surface.labels.subarray(vertex*4,vertex*4+4));
  if(ids.some(id=>state.hiddenParcels.includes(id)))return 0;
  const groups=cortexGroups(surface.hemisphere,LOBES[surface.lobes[vertex]]);
  const isolate=state.isolation;
  if(isolate){
    if(isolate.type==='structure')return 0;
    if(isolate.type==='parcel'&&!ids.includes(isolate.id))return 0;
    if(isolate.type==='group'&&!groups.includes(isolate.key))return 0;
  }
  return groupsOpacity(state,groups);
}
export function subcorticalVisibility(state,structure){
  if(state.hiddenStructures.includes(structure.id))return 0;
  const groups=structureGroups(structure),isolate=state.isolation;
  if(isolate){
    if(isolate.type==='parcel')return 0;
    if(isolate.type==='structure'&&isolate.id!==structure.id)return 0;
    if(isolate.type==='group'&&!groups.includes(isolate.key))return 0;
  }
  return groupsOpacity(state,groups);
}
export function parcelParent(parcel){return parcel.hemisphere+':'+(parcel.scheme.startsWith('yeo')?'networks':parcel.lobe);}
export function hierarchy(atlas,scheme){
  const groups=new Map();
  function add(key,name,parent,description=''){const hemisphere=/(^|:)lh(?::|$)/.test(key)?'lh':/(^|:)rh(?::|$)/.test(key)?'rh':undefined;const g={key,name,parent,description,hemisphere,type:'group',children:[]};groups.set(key,g);return g;}
  add('brain','Brain',null,'A population-based view of human neuroanatomy.');
  add('forebrain','Forebrain','brain');
  add('cerebellum','Cerebellum','brain');
  add('brainstem','Brainstem','brain','The aseg brainstem is one undivided structure.');
  add('ventricles','Ventricular system','brain','Ventricular cavities are extracted from their original aseg labels.');
  add('diencephalon','Diencephalon','forebrain');
  for(const [h,side] of [['lh','Left'],['rh','Right']]){
    add(h,side+' cerebral hemisphere','forebrain');
    add(h+':deep','Deep cerebral structures',h);
    add('cerebellum:'+h,side+' cerebellar hemisphere','cerebellum');
    if(scheme.startsWith('yeo'))add(h+':networks','Distributed networks',h,'Networks can span multiple anatomical lobes.');
    else for(const lobe of LOBES){
      const name=lobe==='unassigned'?'Medial wall / unassigned':lobe==='insula'?'Insula':lobe==='cingulate'?'Cingulate cortex':lobe[0].toUpperCase()+lobe.slice(1)+' lobe';
      add(h+':'+lobe,name,h,scheme==='destrieux'?'Navigation is derived from the largest vertex overlap with the cited Desikan–Killiany lobe mapping. Parcels may cross lobes.':'Lobe membership follows the FreeSurfer Desikan–Killiany mapping.');
    }
  }
  for(const g of groups.values())if(g.parent)groups.get(g.parent).children.push(g);
  for(const p of atlas.parcels.filter(p=>p.scheme===scheme))groups.get(parcelParent(p))?.children.push({...p,type:'parcel',parent:parcelParent(p)});
  for(const s of atlas.structures){const parent=s.group==='deep'?s.hemisphere+':deep':s.group==='cerebellum'?'cerebellum:'+s.hemisphere:s.group;groups.get(parent).children.push({...s,type:'structure',parent});}
  return groups;
}
