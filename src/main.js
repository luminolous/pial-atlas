import {MOTION,reducedMotion} from './motion.js';
import {decodeAtlas} from './data.js';
import {Store,SCHEMES,SURFACES,LOBES,hierarchy,parcelParent,structureGroups,cortexVisibility,subcorticalVisibility} from './state.js';
import {AtlasRenderer} from './renderer.js';
import {legendRows} from './appearance.js';

const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eye=visible=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/>${visible?'':'<path d="m3 3 18 18"/>'}</svg>`;
const side=h=>h==='lh'?'Left':h==='rh'?'Right':'Midline';
let atlas,renderer,groups,store=new Store(),journeyIndex=-1,toastTimer,inspectorDismissed=false,lastSelection='',lastNav='',lastLegend='';
let legendScheme='';
const labelMeasure=document.createElement('canvas').getContext('2d');
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function schemeName(id){return atlas.schemes.find(s=>s.id===id)?.name||id;}
function refData(ref){if(!ref)return null;if(ref.type==='parcel')return atlas.parcelById.get(ref.id);if(ref.type==='structure')return atlas.structures.find(s=>s.id===ref.id);return groups.get(ref.key);}
function parentOf(ref){if(ref.type==='parcel'){const p=refData(ref);return parcelParent(p);}if(ref.type==='structure'){const s=refData(ref);return s.group==='deep'?s.hemisphere+':deep':s.group==='cerebellum'?'cerebellum:'+s.hemisphere:s.group;}return groups.get(ref.key)?.parent;}
function refFor(item){return item.type==='group'?{type:'group',key:item.key}:{type:item.type,id:item.id};}
function pathFor(parent,tree=groups){const names=[];let g=tree.get(parent);while(g){names.unshift(g.name);g=tree.get(g.parent);}return names;}
function isHidden(ref){const s=store.state;return ref.type==='group'?s.hiddenGroups.includes(ref.key):ref.type==='parcel'?s.hiddenParcels.includes(ref.id):s.hiddenStructures.includes(ref.id);}
function toggleRef(ref){store.toggle(ref.type==='group'?'hiddenGroups':ref.type==='parcel'?'hiddenParcels':'hiddenStructures',ref.type==='group'?ref.key:ref.id);}
function select(ref,{focus=false,navigate=false}={}){
  inspectorDismissed=false;
  if(!ref){store.update({selection:null});return;}
  const item=refData(ref),patch={selection:ref};
  if(ref.type==='parcel'&&item.scheme!==store.state.scheme)patch.scheme=item.scheme;
  if(navigate)patch.nav=ref.type==='group'?ref.key:parentOf(ref);
  store.update(patch);renderInspector();if(focus)renderer.focus(ref);
}
function renderRows(items,target){
  const scroll=target.scrollTop;const html=items.map((item,index)=>{
    const ref=refFor(item),hidden=isHidden(ref),selection=store.state.selection,selected=selection?.type===ref.type&&(ref.type==='group'?selection.key===ref.key:selection.id===ref.id),title=item.name;
    const count=item.type==='group'?`${item.children.length} ${item.children.some(x=>x.type==='group')?(item.children.length===1?'region':'regions'):(item.children.length===1?'structure':'structures')}`:item.type==='parcel'?`${side(item.hemisphere)} · ${item.assigned?item.areaPercent.toFixed(1)+'% of cortex':'Unassigned'}`:side(item.hemisphere);
    return `<div style="--item-delay:${Math.min(index*MOTION.stagger,MOTION.staggerCap)}ms" class="structure-row${hidden?' is-hidden':''}${selected?' selected':''}"><button class="row-main" data-ref="${escape(JSON.stringify(ref))}" aria-label="${item.type==='group'?'Explore':'Inspect'} ${escape(title)}">${item.type==='group'?'<span class="group-swatch">+</span>':`<span class="swatch" style="background:rgb(${(item.type==='parcel'&&store.state.colourblindSafe?renderer.safeColours.get(item.id):item.color).join(',')})"></span>`}<span class="row-name">${escape(title)}<small>${escape(count)}</small></span></button><button class="visibility-button" data-toggle="${escape(JSON.stringify(ref))}" aria-label="${hidden?'Show':'Hide'} ${escape(title)}" aria-pressed="${!hidden}">${eye(!hidden)}</button>${item.type==='group'?'<span class="row-arrow">›</span>':''}</div>`;
  }).join('');
  if(target.innerHTML!==html){target.innerHTML=html;target.scrollTop=scroll;}
}
function renderExplorer(){
  const state=store.state;groups=hierarchy(atlas,state.scheme);let nav=groups.get(state.nav);
  if(!nav){state.nav='brain';nav=groups.get('brain');}
  $('nav-title').textContent=nav.name;$('nav-count').textContent=nav.children.length;$('nav-description').textContent=nav.description;
  $('parent-button').disabled=!nav.parent;
  const ancestry=[];let current=nav;while(current){ancestry.unshift(current);current=groups.get(current.parent);}
  $('breadcrumbs').innerHTML=ancestry.slice(0,-1).map(g=>`<button data-nav="${g.key}">${escape(g.name)}</button><span>›</span>`).join('');
  const changed=lastNav!==state.nav+'|'+state.scheme;lastNav=state.nav+'|'+state.scheme;
  renderRows(nav.children,$('structure-list'));
  if(changed){const list=$('structure-list');list.scrollTop=0;list.classList.remove('nav-enter');void list.offsetWidth;list.classList.add('nav-enter');setTimeout(()=>list.classList.remove('nav-enter'),MOTION.ui+MOTION.staggerCap);}
  requestAnimationFrame(updateScrollShadows);
  $('opacity').value=state.groupOpacity[state.nav]??(state.nav==='brain'?state.opacity:1);$('opacity-value').textContent=Math.round(Number($('opacity').value)*100)+'%';
  $('undo').disabled=!store.history.length;
  if(!$('legend-view').hidden)renderLegend();
}
function renderLegend(){
  if(legendScheme!==store.state.scheme){legendScheme=store.state.scheme;$('legend-filter').value='';}
  const s=store.state,query=$('legend-filter').value.trim().toLowerCase();
  const signature=JSON.stringify([s.scheme,s.selection,s.hiddenParcels,s.colourblindSafe,query]);if(signature===lastLegend)return;lastLegend=signature;
  const list=$('legend-list'),scroll=list.scrollTop,rows=legendRows(atlas,s.scheme);
  $('legend-filter-label').hidden=rows.filter(r=>r.assigned).length<=20;
  const filtered=rows.filter(r=>!r.assigned||!query||r.name.toLowerCase().includes(query)||[...r.lh,...r.rh].some(p=>p.nativeName.toLowerCase().includes(query)));
  list.innerHTML=filtered.map(row=>{
    const parcels=[...row.lh,...row.rh],p=parcels[0],selected=parcels.some(p=>s.selection?.type==='parcel'&&s.selection.id===p.id);
    const percentages=['lh','rh'].map(h=>row[h].reduce((sum,p)=>sum+(p.areaPercent||0),0));
    const tooltip=row.assigned?`Left: ${percentages[0].toFixed(2)}%; Right: ${percentages[1].toFixed(2)}%. Each percentage uses that hemisphere's assigned white-surface area. The row shows their arithmetic mean.`:'The medial wall and unassigned labels are excluded from cortical area percentages.';
    const colour=s.colourblindSafe?renderer.safeColours.get(p.id):p.color;
    const right=row.rh[0],rightColour=s.colourblindSafe?renderer.safeColours.get(right.id):right.color;
    const swatch=colour.join(',')===rightColour.join(',')?`rgb(${colour.join(',')})`:`linear-gradient(90deg,rgb(${colour.join(',')}) 50%,rgb(${rightColour.join(',')}) 50%)`;
    return `<div class="structure-row legend-row${row.assigned?'':' unassigned'}${selected?' selected':''}" data-legend-key="${row.key}"><button class="row-main" data-ref="${escape(JSON.stringify({type:'parcel',id:p.id}))}" title="${escape(row.name)}" aria-label="Inspect ${escape(row.name)}"><span class="swatch" style="background:${swatch}" title="Left and right hemisphere colours"></span><span class="row-name">${escape(row.name)}</span></button><span class="area-value" tabindex="0" title="${escape(tooltip)}" aria-label="${escape(tooltip)}">${row.assigned?((percentages[0]+percentages[1])/2).toFixed(1)+'%':'—'}</span>${['lh','rh'].map(h=>{const hidden=row[h].every(p=>s.hiddenParcels.includes(p.id));return `<button class="hemisphere-toggle" data-parcel-ids="${row[h].map(p=>p.id).join(',')}" title="${hidden?'Show':'Hide'} ${side(h).toLowerCase()} ${escape(row.name)}" aria-label="${hidden?'Show':'Hide'} ${side(h).toLowerCase()} ${escape(row.name)}" aria-pressed="${!hidden}">${h==='lh'?'L':'R'}</button>`;}).join('')}</div>`;
  }).join('');
  list.scrollTop=scroll;requestAnimationFrame(updateScrollShadows);
}
function renderInspector(){
  const ref=store.state.selection,item=refData(ref),el=$('inspector'),key=JSON.stringify(ref);
  if(lastSelection!==key){lastSelection=key;inspectorDismissed=false;}
  const popoverOpen=!$('display-popover').hidden||!$('slices-popover').hidden;
  el.hidden=!item||inspectorDismissed||journeyIndex>=0||popoverOpen;
  if(!el.hidden){
    const parent=parentOf(ref),tree=ref.type==='parcel'&&item.scheme!==store.state.scheme?hierarchy(atlas,item.scheme):groups,path=pathFor(parent,tree).join(' → ');
    const overlap=ref.type==='parcel'&&item.scheme!=='dk'?Object.entries(item.lobeOverlap).sort((a,b)=>b[1]-a[1]).filter(x=>x[1]>.01).map(([k,v])=>`${k} ${Math.round(v*100)}%`).join(', '):'';
    const heading=ref.type==='parcel'?'CORTICAL PARCEL':ref.type==='structure'?'ASEG STRUCTURE':'ANATOMICAL REGION';
    const html=`<div class="inspector-head"><div><span class="eyebrow">${heading}</span><h2>${escape(item.name)}</h2></div><button id="inspector-close" class="icon-button" aria-label="Close structure inspector" title="Close inspector (Esc)">×</button></div><div class="inspector-body" tabindex="0"><dl><dt>Hemisphere</dt><dd>${escape(item.hemisphere?side(item.hemisphere):'Bilateral / group')}</dd><dt>Scheme</dt><dd>${escape(ref.type==='parcel'?schemeName(item.scheme):ref.type==='structure'?'FreeSurfer aseg':'Anatomical hierarchy')}</dd><dt>Parent</dt><dd>${escape(path||'Whole brain')}</dd><dt>Source</dt><dd>${escape(item.source||'FreeSurfer anatomical labels')}</dd>${item.nativeName?`<dt>Source label</dt><dd>${escape(item.nativeName)}</dd>`:''}${overlap?`<dt>DK overlap</dt><dd>${escape(overlap)}</dd>`:''}</dl>${ref.type==='parcel'&&item.scheme==='destrieux'?'<p>Navigation parent: largest DK lobe overlap, not an official Destrieux lobe assignment.</p>':''}${item.description?`<p>${escape(item.description)}</p>`:''}</div><div class="inspector-buttons"><button data-inspect="focus">Focus</button><button data-inspect="isolate">${store.state.isolation?'End isolation':'Isolate'}</button><button data-inspect="hide">${isHidden(ref)?'Show':'Hide'}</button><button data-inspect="parent" ${parent?'':'disabled'}>Parent ↑</button></div>`;
    if(el.innerHTML!==html){const scroll=el.querySelector('.inspector-body')?.scrollTop||0;el.innerHTML=html;el.querySelector('.inspector-body').scrollTop=scroll;}
  }
  updateFraming();
}
function updateFraming(){
  if(!renderer)return;
  const stage=$('stage'),small=stage.clientWidth<580;
  document.querySelector('.workspace').style.setProperty('--stage-height',stage.clientHeight+'px');
  const overlay=!$('inspector').hidden?$('inspector'):!$('display-popover').hidden?$('display-popover'):!$('slices-popover').hidden?$('slices-popover'):null;
  renderer.setInsets({left:journeyIndex>=0&&!small?$('journey').offsetWidth+32:0,right:overlay&&!small?overlay.offsetWidth+30:0,top:30,bottom:38});
}
function updateScrollShadows(){for(const id of ['structure-list','legend-list']){const el=$(id),shell=el.parentElement;shell.classList.toggle('can-scroll-up',el.scrollTop>1);shell.classList.toggle('can-scroll-down',el.scrollTop+el.clientHeight<el.scrollHeight-2);}}
function setTab(legend){
  $('explorer-view').hidden=legend;$('legend-view').hidden=!legend;
  for(const [id,active] of [['explore-tab',!legend],['legend-tab',legend]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-selected',active);}
  document.querySelector('.panel-tabs').classList.toggle('legend-active',legend);if(legend)renderLegend();requestAnimationFrame(updateScrollShadows);
  renderer.structuresTab=!legend;renderer.update(store.state);
}
function renderControls(){
  const s=store.state;$('scheme').value=s.scheme;$('morph').value=s.morph;$('separation').value=s.separation;$('lift').value=s.lift;
  $('curvature-shading').checked=s.curvatureShading;$('colourblind-safe').checked=s.colourblindSafe;
  const state=SURFACES[Math.round(s.morph)],deformed=s.morph>1.01||s.separation>.01||s.lift>.01;
  $('space-badge').textContent=deformed?'Display layout · not anatomical coordinates':'MNI152 · anatomical position';
  $('morph-description').textContent=['Follow the natural folds of the cortex.','Explore the cortical white-matter boundary.','Open the folds; keep every parcel in place.','The same vertices, mapped onto a sphere.','A derived flat projection with an antipodal seam.'][Math.round(s.morph)];
  document.querySelectorAll('[data-morph]').forEach(b=>b.classList.toggle('active',+b.dataset.morph===Math.round(s.morph)));
  document.querySelectorAll('[data-material]').forEach(b=>{b.classList.toggle('active',b.dataset.material===s.material);b.setAttribute('aria-pressed',b.dataset.material===s.material);});
  $('labels-toggle').classList.toggle('active',s.labels);$('labels-toggle').setAttribute('aria-pressed',s.labels);
  $('auto-toggle').classList.toggle('active',s.auto);$('auto-toggle').setAttribute('aria-pressed',s.auto);
  const hidden=s.hiddenGroups.length+s.hiddenParcels.length+s.hiddenStructures.length;
  $('hidden-badge').hidden=!hidden&&!s.isolation;$('hidden-badge').textContent=s.isolation?`Isolation active${hidden?' · '+hidden+' hidden rules':''}`:hidden+' hidden rules';
  document.querySelectorAll('[data-layer]').forEach(el=>el.checked=!s.hiddenGroups.includes(el.dataset.layer));
  s.clips.forEach((c,i)=>{const box=$('clip-'+i);if(box){box.checked=c.enabled;$('clip-position-'+i).value=c.position;$('clip-value-'+i).textContent=['x','y','z'][i]+' = '+(c.position>=0?'+':'')+c.position+' mm';$('clip-reverse-'+i).checked=c.reverse;}});
  $('slice-warning').textContent=deformed?'The surface is displaced or deformed. Slices remain in MNI space. Return to aligned anatomy to compare them.':'Pial/white surfaces and aseg meshes share the slice coordinate frame.';
}
function installUI(){
  document.querySelector('.viewer-footer').insertBefore($('toast'),$('methods-link'));
  $('dataset-count').textContent=`fsaverage6 · ${(atlas.counts.verticesPerHemisphere*2).toLocaleString()} cortical vertices`;
  $('about-counts').innerHTML=[`${atlas.counts.importedSurfaceStates} imported surfaces`,`${atlas.counts.derivedFlatMaps} derived flat maps`,`${Object.values(atlas.counts.parcels).reduce((a,b)=>a+b,0)} hemisphere-specific labels`,`${atlas.counts.asegStructures} aseg structures`].map(s=>`<span>${s}</span>`).join('');
  $('license-notices').textContent=window.__LICENSES__;
  const showAbout=()=>$('about').showModal();$('about-button').onclick=showAbout;$('methods-link').onclick=showAbout;$('about-close').onclick=()=>$('about').close();
  $('about').addEventListener('click',e=>{if(e.target===$('about')){const r=$('about').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('about').close();}});
  document.querySelector('.brand').onclick=e=>{e.preventDefault();store.update({nav:'brain',selection:null});renderer.preset('home');};
  $('explore-tab').onclick=()=>setTab(false);$('legend-tab').onclick=()=>setTab(true);
  for(const id of ['structure-list','legend-list'])$(id).addEventListener('scroll',updateScrollShadows,{passive:true});
  new ResizeObserver(()=>{updateScrollShadows();updateFraming();}).observe($('stage'));
  for(const target of ['structure-list','legend-list'])$(target).addEventListener('click',e=>{
    const hemispheres=e.target.closest('[data-parcel-ids]');if(hemispheres){const ids=hemispheres.dataset.parcelIds.split(',').map(Number),hidden=store.state.hiddenParcels,show=ids.every(id=>hidden.includes(id));store.update({hiddenParcels:show?hidden.filter(id=>!ids.includes(id)):[...new Set([...hidden,...ids])]});return;}
    const toggle=e.target.closest('[data-toggle]');if(toggle){toggleRef(JSON.parse(toggle.dataset.toggle));return;}
    const row=e.target.closest('[data-ref]');if(row){const ref=JSON.parse(row.dataset.ref);select(ref,{navigate:ref.type==='group'});}
  });
  $('parent-button').onclick=()=>{const parent=groups.get(store.state.nav).parent;if(parent)store.update({nav:parent,selection:{type:'group',key:parent}});};
  $('breadcrumbs').onclick=e=>{const b=e.target.closest('[data-nav]');if(b)store.update({nav:b.dataset.nav,selection:{type:'group',key:b.dataset.nav}});};
  $('inspector').onclick=e=>{
    if(e.target.closest('#inspector-close')){inspectorDismissed=true;renderInspector();return;}
    const action=e.target.closest('[data-inspect]')?.dataset.inspect,ref=store.state.selection;if(!action||!ref)return;
    if(action==='focus')renderer.focus(ref);
    if(action==='hide')toggleRef(ref);
    if(action==='isolate'){store.update({isolation:store.state.isolation?null:ref});if(store.state.isolation)renderer.focus(ref);}
    if(action==='parent'){const parent=parentOf(ref);if(parent)store.update({nav:parent,selection:{type:'group',key:parent},...(ref.type==='parcel'?{scheme:refData(ref).scheme}:{})});}
  };
  $('scheme').onchange=e=>{$('legend-filter').value='';store.update({scheme:e.target.value});};
  $('legend-filter').oninput=()=>{renderLegend();$('legend-list').scrollTop=0;};
  $('curvature-shading').onchange=e=>store.update({curvatureShading:e.target.checked});
  $('colourblind-safe').onchange=e=>store.update({colourblindSafe:e.target.checked});
  const sliders=['morph','separation','lift','opacity'];
  sliders.forEach(id=>{
    const input=$(id);input.addEventListener('pointerdown',()=>store.begin());input.addEventListener('change',()=>store.end());input.addEventListener('pointerup',()=>store.end());input.addEventListener('blur',()=>store.end());
    input.oninput=()=>{const value=+input.value;store.update(id==='opacity'?{groupOpacity:{...store.state.groupOpacity,[store.state.nav]:value}}:{[id]:value});};
  });
  document.addEventListener('pointerup',()=>store.end());
  document.querySelectorAll('[data-morph]').forEach(b=>b.onclick=()=>store.update({morph:+b.dataset.morph}));
  const sourcePosition=()=>{store.update({morph:0,separation:0,lift:0});renderer.preset('home');};
  $('return-position').onclick=sourcePosition;$('slices-align').onclick=sourcePosition;
  $('undo').onclick=()=>store.undo();$('restore').onclick=()=>{store.restore();toast('All visibility and opacity settings have been restored.');};
  $('reset').onclick=()=>{closeJourney();store.reset();renderer.preset('home');$('search').value='';$('search-results').hidden=true;toast('The atlas has been reset. You can undo this action.');};
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{
    if(b.dataset.preset==='medial'){store.update({isolation:{type:'group',key:'lh'},selection:{type:'group',key:'lh'}});toast('The left hemisphere is isolated for its medial view. Existing hidden structures stay hidden.');}
    renderer.preset(b.dataset.preset);
  });
  document.querySelectorAll('[data-material]').forEach(b=>b.onclick=()=>store.update({material:b.dataset.material}));
  for(const [button,popover] of [['display-toggle','display-popover'],['slices-toggle','slices-popover']])$(button).onclick=()=>{const next=$(popover).hidden;$('display-popover').hidden=true;$('slices-popover').hidden=true;$(popover).hidden=!next;renderInspector();};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{$(b.dataset.close).hidden=true;renderInspector();});
  const layers=[['lh','Left cerebral hemisphere'],['rh','Right cerebral hemisphere'],['forebrain','Forebrain'],['diencephalon','Diencephalon'],['subcortical','Deep structures & brainstem'],['cerebellum','Cerebellum'],['brainstem','Brainstem'],['ventricles','Ventricular system']];
  $('layer-switches').innerHTML=layers.map(([key,name])=>`<label class="switch-row">${name}<input type="checkbox" checked data-layer="${key}" aria-label="Show ${name}"></label>`).join('');
  document.querySelectorAll('[data-layer]').forEach(el=>el.onchange=()=>store.toggle('hiddenGroups',el.dataset.layer));
  $('slice-controls').innerHTML=['Sagittal','Coronal','Axial'].map((name,i)=>`<div class="slice-item"><div class="slice-title"><label><input id="clip-${i}" type="checkbox" aria-label="Enable ${name.toLowerCase()} clipping">${name}</label><output id="clip-value-${i}"></output></div><input id="clip-position-${i}" aria-label="${name} clipping position" type="range" min="${[-90,-126,-72][i]}" max="${[90,90,108][i]}" step="1" value="0"><label class="reverse"><input id="clip-reverse-${i}" type="checkbox" aria-label="Reverse ${name.toLowerCase()} clipping">Reverse direction</label></div>`).join('');
  [0,1,2].forEach(i=>{
    const update=patch=>store.update({clips:store.state.clips.map((c,k)=>k===i?{...c,...patch}:c)});
    $('clip-'+i).onchange=e=>update({enabled:e.target.checked});$('clip-reverse-'+i).onchange=e=>update({reverse:e.target.checked});
    const range=$('clip-position-'+i);range.addEventListener('pointerdown',()=>store.begin());range.addEventListener('change',()=>store.end());range.oninput=()=>update({position:+range.value});
  });
  $('labels-toggle').onclick=()=>store.update({labels:!store.state.labels});$('auto-toggle').onclick=()=>store.update({auto:!store.state.auto});
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is not available in this browser window.');}};
  $('export').onclick=()=>{renderer.exportPNG();toast('The PNG image has been exported.');};
  $('search').oninput=renderSearch;$('search').onfocus=()=>{if($('search').value)renderSearch();};
  $('search').onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();$('search-results').querySelector('button')?.focus();}if(e.key==='Escape')$('search-results').hidden=true;};
  $('search-results').onclick=e=>{const b=e.target.closest('[data-search-ref]');if(b){const ref=JSON.parse(b.dataset.searchRef);select(ref,{focus:true,navigate:true});$('search').value=refData(ref).name;$('search-results').hidden=true;}};
  document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))$('search-results').hidden=true;});
  document.addEventListener('keydown',e=>{const input=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);if(e.key==='/'&&!input){e.preventDefault();$('search').focus();}if(e.key==='Escape'){$('search-results').hidden=true;$('display-popover').hidden=true;$('slices-popover').hidden=true;inspectorDismissed=true;renderInspector();}if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!input){e.preventDefault();store.undo();}});
  installPolish();
  $('journey-start').onclick=()=>{journeyIndex=0;showJourney();};$('journey-close').onclick=closeJourney;$('journey-next').onclick=()=>{if(journeyIndex===6)closeJourney();else {journeyIndex++;showJourney();}};$('journey-prev').onclick=()=>{journeyIndex=Math.max(0,journeyIndex-1);showJourney();};
}
function renderSearch(){
  const query=$('search').value.trim().toLowerCase(),results=$('search-results');if(!query){results.hidden=true;return;}
  const candidates=[...atlas.parcels.map(p=>({...p,type:'parcel'})),...atlas.structures.map(s=>({...s,type:'structure'})),...groups.values()];
  const matches=candidates.filter(i=>(i.name+' '+(i.nativeName||'')+' '+side(i.hemisphere)+' '+(i.scheme?schemeName(i.scheme):'')).toLowerCase().includes(query)).sort((a,b)=>Number(b.scheme===store.state.scheme)-Number(a.scheme===store.state.scheme)).slice(0,60);
  results.innerHTML=matches.length?matches.map(i=>`<button class="search-result" data-search-ref="${escape(JSON.stringify(refFor(i)))}"><b>${escape(i.name)}</b><small>${i.type==='group'?'Anatomical group':side(i.hemisphere)+' · '+escape(i.scheme?schemeName(i.scheme):'FreeSurfer aseg')}</small></button>`).join(''):'<p class="empty-search">No matching structures. Try “precentral”, “thalamus”, or “visual”.</p>';results.hidden=false;
}
const journeys=[
  ['One brain, many scales','Begin with the two cerebral hemispheres, the cerebellum, and the brainstem. Rotate the atlas to see how the whole is assembled.'],
  ['Start with the lobes','The frontal, parietal, temporal, and occipital lobes provide an anatomical route into the cortex. This grouping follows the FreeSurfer Desikan–Killiany mapping.'],
  ['Find a named parcel','The precentral gyrus is one of 34 labelled cortical parcels in each hemisphere of the Desikan–Killiany scheme. Select any parcel to inspect its source and hierarchy.'],
  ['Unfold the cortex','Inflation spreads the folds while preserving the identity of every vertex. These are non-anatomical display positions; sulcal shading and parcel labels remain attached to the surface.'],
  ['Change the map','Yeo’s 7-network parcellation groups vertices by the source study’s resting-state connectivity analysis. Networks can span lobes. Different conventions reveal different boundaries.'],
  ['Go beneath the cortex','A glass view and display lift reveal the aseg structures. These meshes were extracted from real segmentation labels and retain their registered source positions when the lift returns to zero.'],
  ['Keep exploring','Try a second parcellation, move an MNI slice, or isolate a structure. Population templates and parcellations are useful references; this atlas has not been clinically validated.']
];
function showJourney(){
  setTab(false);$('journey').hidden=false;$('display-popover').hidden=true;$('slices-popover').hidden=true;
  renderInspector();
  const [title,text]=journeys[journeyIndex];$('journey-step').textContent=`GUIDED JOURNEY · ${String(journeyIndex+1).padStart(2,'0')} / 07`;$('journey-title').textContent=title;$('journey-text').textContent=text;$('journey-prev').disabled=journeyIndex===0;$('journey-next').textContent=journeyIndex===6?'Finish ✓':'Continue →';$('journey-dots').textContent=journeys.map((_,i)=>i===journeyIndex?'●':'·').join('');
  // Guided changes preserve all user visibility rules. Restore all remains explicit.
  if(journeyIndex===0){store.update({morph:0,separation:0,lift:0,scheme:'dk',nav:'brain',material:'anatomical',selection:null,auto:false});renderer.preset('home');}
  if(journeyIndex===1){store.update({nav:'lh',scheme:'dk',morph:0,selection:{type:'group',key:'lh'}});renderer.preset('lateral');}
  if(journeyIndex===2){const p=atlas.parcels.find(p=>p.hemisphere==='lh'&&p.scheme==='dk'&&p.nativeName==='precentral');select({type:'parcel',id:p.id},{navigate:true});renderer.preset('lateral');}
  if(journeyIndex===3)store.update({morph:2,separation:27,material:'anatomical'});
  if(journeyIndex===4)store.update({scheme:'yeo7',selection:null,nav:'lh:networks',morph:2,separation:27});
  if(journeyIndex===5){store.update({morph:0,separation:20,lift:100,material:'glass',nav:'diencephalon',selection:{type:'structure',id:10}});renderer.preset('deep');}
  if(journeyIndex===6){store.update({morph:0,separation:0,lift:0,material:'anatomical',nav:'brain',selection:null});renderer.preset('home');}
}
function closeJourney(){journeyIndex=-1;$('journey').hidden=true;renderInspector();}
function updateLabels(){
  const layer=$('anatomical-labels');if(!store.state.labels){layer.innerHTML='';return;}
  const activeParcels=atlas.parcels.filter(p=>p.hemisphere==='lh'&&p.scheme===store.state.scheme&&p.assigned);
  const labelParcels=store.state.scheme==='dk'?activeParcels.filter(p=>['precentral','superiorparietal','middletemporal','lateraloccipital'].includes(p.nativeName)):activeParcels.sort((a,b)=>b.vertices-a.vertices).slice(0,5);
  const refs=store.state.selection?[store.state.selection]:labelParcels.map(p=>({type:'parcel',id:p.id}));
  const rect=$('stage').getBoundingClientRect(),placed=[];let html='';
  for(const ref of refs.slice(0,5)){
    if(isHidden(ref))continue;
    if(ref.type==='structure'&&subcorticalVisibility(store.state,refData(ref))<.005)continue;
    if(ref.type==='parcel'){
      const p=refData(ref),surface=atlas.surfaces.find(s=>s.hemisphere===p.hemisphere),si=SCHEMES.indexOf(p.scheme);
      let visible=false;for(let i=0;i<surface.vertices;i++)if(surface.labels[i*4+si]===p.id&&cortexVisibility(store.state,surface,i,atlas)>.005){visible=true;break;}
      if(!visible)continue;
    }
    const item=refData(ref),center=renderer.selectionCenter(ref);if(!center||renderer.isClipped(center))continue;
    const screen=center.clone().project(renderer.camera);if(Math.abs(screen.x)>.9||Math.abs(screen.y)>.82||screen.z>1)continue;
    const x=(screen.x+1)*rect.width/2,y=(1-screen.y)*rect.height/2;
    if(placed.some(p=>Math.abs(p[0]-x)<155&&Math.abs(p[1]-y)<28))continue;
    placed.push([x,y]);html+=`<span class="anatomical-label" style="left:${x}px;top:${y}px">${escape(item.name)}</span>`;
  }
  layer.innerHTML=html;
}
function installPolish(){
  $('licences-toggle').onclick=()=>{const expanded=$('licences-toggle').getAttribute('aria-expanded')!=='true';$('licences-toggle').setAttribute('aria-expanded',expanded);$('licences-body').classList.toggle('expanded',expanded);};
  const keys={'0':'[data-preset="home"]','1':'[data-preset="lateral"]','2':'[data-preset="medial"]','3':'[data-preset="dorsal"]','4':'[data-preset="ventral"]','5':'[data-preset="anterior"]','6':'[data-preset="posterior"]',d:'#display-toggle',s:'#slices-toggle',l:'#labels-toggle',a:'#auto-toggle',f:'#fullscreen',p:'#export'};
  const tooltip=document.createElement('div');tooltip.className='tool-tooltip';tooltip.hidden=true;tooltip.id='tool-tooltip';tooltip.role='tooltip';document.body.append(tooltip);
  for(const [key,selector] of Object.entries(keys)){
    const button=document.querySelector(selector),title=(button.getAttribute('title')||button.getAttribute('aria-label'))+' ('+key.toUpperCase()+')';button.setAttribute('title',title);button.setAttribute('aria-keyshortcuts',key);
    const show=()=>{tooltip.textContent=title;tooltip.hidden=false;const r=button.getBoundingClientRect(),t=tooltip.getBoundingClientRect();tooltip.style.left=Math.max(8,r.left-t.width-10)+'px';tooltip.style.top=Math.max(8,Math.min(innerHeight-t.height-8,r.top+(r.height-t.height)/2))+'px';button.setAttribute('aria-describedby','tool-tooltip');};
    const hide=()=>{tooltip.hidden=true;button.removeAttribute('aria-describedby');};button.addEventListener('mouseenter',show);button.addEventListener('focus',show);button.addEventListener('mouseleave',hide);button.addEventListener('blur',hide);button.addEventListener('click',hide);
  }
  document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)||$('about').open)return;const selector=keys[e.key.toLowerCase()];if(selector){e.preventDefault();document.querySelector(selector).click();}});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>renderer.update(store.state));
}
function updateLiftLabels(){
  const layer=$('lift-labels');if(renderer.lift<99||renderer.activePreset!=='deep'){layer.innerHTML='';return;}
  const width=$('stage').clientWidth,height=$('stage').clientHeight,placed=[];let html='';
  labelMeasure.font='550 11px '+getComputedStyle(document.documentElement).fontFamily;
  for(const group of renderer.liftLayout.groups){
    if(!group.ids.some(id=>subcorticalVisibility(store.state,atlas.structures.find(s=>s.id===id))>.005))continue;
    const point=renderer.camera.position.clone().fromArray(group.anchor).project(renderer.camera),x=(point.x+1)*width/2,y=(1-point.y)*height/2;
    const w=labelMeasure.measureText(group.name).width+18;if(x-w/2<5||x+w/2>width-5||y<12||y>height-20)continue;
    if(placed.some(r=>Math.abs(x-r.x)<(w+r.w)/2+4&&Math.abs(y-r.y)<26))continue;
    placed.push({x,y,w});html+=`<span class="lift-label" data-lift-group="${group.key}" style="left:${x}px;top:${y}px">${escape(group.name)}</span>`;
  }
  layer.innerHTML=html;
}
async function main(){
  try{
    atlas=await decodeAtlas(window.__ATLAS_DATA__);window.__ATLAS_DATA__=null;groups=hierarchy(atlas,'dk');
    renderer=new AtlasRenderer($('stage'),atlas,ref=>select(ref), (ref,event)=>{
      renderer.hover(ref);const label=$('hover-label');if(!ref){label.hidden=true;return;}const item=refData(ref),rect=$('stage').getBoundingClientRect();label.textContent=item.name+' · '+side(item.hemisphere);label.hidden=false;label.style.left=Math.min(event.clientX-rect.left+13,rect.width-230)+'px';label.style.top=Math.max(55,event.clientY-rect.top-40)+'px';
    });
    installUI();
    renderer.onPreset=name=>document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.toggle('active',b.dataset.preset===name);b.setAttribute('aria-pressed',b.dataset.preset===name);});
    renderer.onPreset(renderer.activePreset);
    let previousMorph=0,previousLift=0;
    store.subscribe(()=>{renderer.update(store.state);renderExplorer();renderInspector();renderControls();if(store.state.morph>=3.95&&previousMorph<3.95)renderer.preset('flat');if(store.state.lift>0&&previousLift===0)renderer.preset('deep');if(store.state.lift===0&&previousLift>0)renderer.preset('home');previousLift=store.state.lift;previousMorph=store.state.morph;});store.emit();
    let labelFrame=0;renderer.onFrame=()=>{if(++labelFrame%8===0){updateLabels();updateLiftLabels();}};
    $('loading').hidden=true;
    // This read-only-friendly interface also supports deterministic browser QA.
    window.atlasApp={atlas,store,renderer,hierarchy:()=>groups,select,ready:true};
    window.dispatchEvent(new Event('atlas-ready'));
  }catch(error){console.error(error);$('loading').innerHTML='<strong>The atlas could not be loaded.</strong><p>This application needs a recent browser with WebGL 2, WebAssembly, and DecompressionStream support. '+escape(error.message)+'</p>';window.atlasError=String(error);}
}
main();
