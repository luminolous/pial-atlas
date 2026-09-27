import {SCHEMES,structureGroups} from './state.js';

// Paul Tol's muted qualitative palette (BSD-3-Clause). See licenses/Paul-Tol.txt.
export const SAFE_COLOURS=['#CC6677','#332288','#DDCC77','#117733','#88CCEE','#882255','#44AA99','#999933','#AA4499'];
export const WARM_GREY='#9c9791';
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));

export function accessibleColours(atlas){
  const colours=new Map();
  for(const [si,scheme] of SCHEMES.entries()){
    const parcels=atlas.parcels.filter(p=>p.scheme===scheme&&p.assigned),ids=new Map(parcels.map(p=>[p.id,p.localId]));
    const graph=new Map(parcels.map(p=>[p.localId,new Set()]));
    for(const s of atlas.surfaces)for(let f=0;f<s.index.length;f+=3)for(let c=0;c<3;c++){
      const a=ids.get(s.labels[s.index[f+c]*4+si]),b=ids.get(s.labels[s.index[f+(c+1)%3]*4+si]);
      if(a!==undefined&&b!==undefined&&a!==b){graph.get(a).add(b);graph.get(b).add(a);}
    }
    // Deterministic saturation-degree colouring shares each label's colour across hemispheres.
    // Colours are reused for large schemes; boundaries and names remain essential identifiers.
    const assigned=new Map(),usage=SAFE_COLOURS.map(()=>0);
    while(assigned.size<graph.size){
      const saturation=id=>new Set([...graph.get(id)].map(n=>assigned.get(n)).filter(n=>n!==undefined)).size;
      const id=[...graph.keys()].filter(id=>!assigned.has(id)).sort((a,b)=>saturation(b)-saturation(a)||graph.get(b).size-graph.get(a).size||a-b)[0];
      const conflicts=SAFE_COLOURS.map((_,i)=>[...graph.get(id)].filter(n=>assigned.get(n)===i).length);
      const index=SAFE_COLOURS.map((_,i)=>i).sort((a,b)=>conflicts[a]-conflicts[b]||usage[a]-usage[b]||a-b)[0];
      assigned.set(id,index);usage[index]++;
    }
    for(const p of atlas.parcels.filter(p=>p.scheme===scheme))colours.set(p.id,p.assigned?rgb(SAFE_COLOURS[assigned.get(p.localId)]):p.color);
  }
  return colours;
}

export function deepUsesSourceColour(state,structure,structuresTab=true){
  if(state.lift>0||state.selection?.type==='structure'&&state.selection.id===structure.id)return true;
  // Only explicit deep-anatomy navigation counts as browsing; the root also contains cortex.
  const deepParents=['cerebellum','cerebellum:lh','cerebellum:rh','brainstem','ventricles','diencephalon','lh:deep','rh:deep'];
  return structuresTab&&deepParents.includes(state.nav)&&structureGroups(structure).includes(state.nav);
}

export function legendRows(atlas,scheme){
  const rows=new Map();
  for(const p of atlas.parcels.filter(p=>p.scheme===scheme)){
    const key=p.assigned?String(p.localId):'unassigned';
    if(!rows.has(key))rows.set(key,{key,name:p.assigned?p.name:'Medial wall / unassigned',assigned:p.assigned,lh:[],rh:[]});
    rows.get(key)[p.hemisphere].push(p);
  }
  return [...rows.values()].sort((a,b)=>Number(b.assigned)-Number(a.assigned)||Number(a.key)-Number(b.key));
}
