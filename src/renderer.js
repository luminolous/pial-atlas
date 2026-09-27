import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {cortexGeometry,cortexMaterial,labelFields,fieldPick} from './cortex.js';
import {MOTION,ease,duration,reducedMotion,Tweens} from './motion.js';
import {buildLiftLayout} from './lift.js';
import {BRAIN_PATHS} from './brand.js';
import { SCHEMES, SURFACES, cortexVisibility, subcorticalVisibility } from './state.js';

// Future layers implement this small contract. Tracts, EEG, and connectomes are
// deliberately absent; every spatial layer must declare its source-to-RAS map.
export class LayerRegistry {
  constructor(scene){this.scene=scene;this.layers=new Map();}
  register(id,layer){if(this.layers.has(id))throw new Error(`Duplicate layer: ${id}`);this.layers.set(id,layer);if(layer.object)this.scene.add(layer.object);}
  update(state){for(const layer of this.layers.values())layer.update?.(state);}
  dispose(){for(const layer of this.layers.values())layer.dispose?.();this.layers.clear();}
}

export class AtlasRenderer {
  constructor(container,atlas,onPick,onHover){
    this.tweens=new Tweens();this.insets={left:0,right:0,top:30,bottom:38};this.activePreset='home';this.container=container;this.atlas=atlas;this.onPick=onPick;this.onHover=onHover;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#eef2f4');
    this.camera=new THREE.OrthographicCamera(-150,150,120,-120,.1,2500);
    this.camera.up.set(0,0,1);this.camera.position.set(-285,-310,155);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.localClippingEnabled=true;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.45;
    this.renderer.domElement.setAttribute('aria-label','Interactive three-dimensional brain atlas');
    this.renderer.domElement.setAttribute('role','img');this.renderer.domElement.tabIndex=0;
    container.prepend(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.target.set(-4,-17,10);
    this.controls.minZoom=.1;this.controls.maxZoom=7;this.controls.zoomSpeed=.85;
    this.controls.autoRotateSpeed=.65;this.controls.addEventListener('start',()=>{this.cameraTween=null;this.activePreset=null;this.onPreset?.(null);});
    this.scene.add(new THREE.HemisphereLight('#ffffff','#a5b4c4',2.2));
    const key=new THREE.DirectionalLight('#fff8ef',3.1);key.position.set(-220,-50,300);this.scene.add(key);
    const fill=new THREE.DirectionalLight('#dceeff',2.1);fill.position.set(180,60,140);this.scene.add(fill);
    const rim=new THREE.DirectionalLight('#ffffff',1.4);rim.position.set(10,-180,-80);this.scene.add(rim);
    this.layers=new LayerRegistry(this.scene);
    this.brain=new THREE.Group();this.layers.register('anatomy',{object:this.brain,coordinateSpace:atlas.coordinateSpace});
    this.clipPlanes=[0,1,2].map(()=>new THREE.Plane(new THREE.Vector3(0,0,0),1));
    const palette=new Float32Array(512*4);
    for(const p of atlas.parcels){const c=new THREE.Color().setRGB(...p.color.map(v=>v/255),THREE.SRGBColorSpace);palette.set([c.r,c.g,c.b,1],p.id*4);}
    this.palette=new THREE.DataTexture(palette,512,1,THREE.RGBAFormat,THREE.FloatType);this.palette.needsUpdate=true;
    this.uniforms={uHasHidden:{value:false},uPreviousScheme:{value:0},uSchemeMix:{value:1},uHovered:{value:-1},uHoverScheme:{value:0},uScheme:{value:0},uPalette:{value:this.palette},uMode:{value:0},uSelected:{value:-1},uSelectionScheme:{value:0},uFlat:{value:0},uMorph:{value:0}};
    this.cortices=[];this.deep=[];
    for(const s of atlas.surfaces){
      const field=labelFields(s),g=cortexGeometry(s),mat=cortexMaterial(this.uniforms,this.clipPlanes,field);
      const mesh=new THREE.Mesh(g,mat);mesh.name=s.hemisphere;
      mesh.userData={type:'cortex',surface:s,field,visibility:new Float32Array(s.vertices).fill(1)};
      this.brain.add(mesh);this.cortices.push(mesh);
    }
    this.liftLayout=buildLiftLayout(atlas.structures);
    for(const s of atlas.structures){
      const g=new THREE.BufferGeometry();g.setIndex(new THREE.BufferAttribute(s.index,1));g.setAttribute('position',new THREE.BufferAttribute(s.positions,3));g.computeVertexNormals();g.computeBoundingSphere();
      const color=new THREE.Color().setRGB(...s.color.map(c=>c/255),THREE.SRGBColorSpace);
      const mat=new THREE.MeshStandardMaterial({color,roughness:.53,metalness:.02,transparent:true,side:THREE.DoubleSide,clippingPlanes:this.clipPlanes});
      const mesh=new THREE.Mesh(g,mat);mesh.userData={type:'structure',structure:s,baseColor:color.clone()};this.brain.add(mesh);this.deep.push(mesh);
    }
    this.sliceGroup=new THREE.Group();this.layers.register('mni-slices',{object:this.sliceGroup,coordinateSpace:atlas.coordinateSpace});this.sliceMeshes=[];
    for(let axis=0;axis<3;axis++){
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true,opacity:.96,depthWrite:true}));mesh.visible=false;mesh.renderOrder=-1;this.sliceGroup.add(mesh);this.sliceMeshes.push(mesh);
    }
    this.morph=0;this.separation=0;this.lift=0;this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.cameraTween=null;
    let down;
    this.renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];this.cameraTween=null;});
    this.renderer.domElement.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<5){const result=this.pick(e);onPick(result);}down=null;});
    let lastHover=0;
    this.renderer.domElement.addEventListener('pointermove',e=>{if(performance.now()-lastHover>100&&!down){lastHover=performance.now();onHover?.(this.pick(e),e);}});
    this.renderer.domElement.addEventListener('pointerleave',()=>onHover?.(null));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();this.preset('home');
    this.lastTime=performance.now();this.renderer.setAnimationLoop(t=>this.frame(t));
  }
  resize(){
    const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;
    this.renderer.setSize(w,h);this.camera.left=-120*w/h;this.camera.right=120*w/h;this.camera.top=120;this.camera.bottom=-120;
    this.applyFrameOffset();this.camera.updateProjectionMatrix();
    if(this.state)this.preset(this.activePreset||'home');
  }
  applyFrameOffset(){
    const w=this.container.clientWidth,h=this.container.clientHeight,i=this.insets;
    // Off-axis projection centres the camera target in the unobstructed rectangle.
    this.camera.setViewOffset(w,h,(i.right-i.left)/2,(i.bottom-i.top)/2,w,h);
  }
  setInsets(insets){
    const next={...this.insets,...insets};if(JSON.stringify(next)===JSON.stringify(this.frameInsets||this.insets))return;
    const previous={...this.insets};this.tweens.to('insets',0,1,'layout',t=>{for(const key of Object.keys(next))this.insets[key]=previous[key]+(next[key]-previous[key])*t;this.applyFrameOffset();});
    this.frameInsets=next;
    if(this.state)this.preset(this.activePreset||'home');
  }
  update(state){
    const previous=this.state;this.state=state;
    const scheme=SCHEMES.indexOf(state.scheme);
    if(scheme!==this.uniforms.uScheme.value){
      this.uniforms.uPreviousScheme.value=this.uniforms.uScheme.value;this.uniforms.uScheme.value=scheme;
      this.uniforms.uSchemeMix.value=0;this.tweens.to('scheme',0,1,'scheme',v=>this.uniforms.uSchemeMix.value=v);
    }
    this.uniforms.uMode.value=['anatomical','porcelain','wireframe','glass'].indexOf(state.material);
    const selected=state.selection;
    this.uniforms.uSelected.value=selected?.type==='parcel'?selected.id:-1;
    this.uniforms.uSelectionScheme.value=selected?.type==='parcel'?SCHEMES.indexOf(this.atlas.parcelById.get(selected.id).scheme):0;
    const visibilityKeys=['hiddenGroups','hiddenParcels','hiddenStructures','groupOpacity','isolation','opacity'];
    const visibilityChanged=!previous||visibilityKeys.some(key=>JSON.stringify(previous[key])!==JSON.stringify(state[key]));
    if(!previous||JSON.stringify(previous.hiddenParcels)!==JSON.stringify(state.hiddenParcels)){
      const data=this.palette.image.data,from=data.slice();this.uniforms.uHasHidden.value=!!(state.hiddenParcels.length||previous?.hiddenParcels.length);
      this.tweens.to('label-alpha',0,1,'ui',t=>{for(const p of this.atlas.parcels){const target=state.hiddenParcels.includes(p.id)?0:1;data[p.id*4+3]=from[p.id*4+3]+(target-from[p.id*4+3])*t;}this.palette.needsUpdate=true;if(t===1)this.uniforms.uHasHidden.value=state.hiddenParcels.length>0;});
    }
    for(const mesh of this.cortices){
      const attr=mesh.geometry.getAttribute('atlasVisibility'),surface=mesh.userData.surface;
      if(visibilityChanged){
        const target=mesh.userData.visibility;
        for(let i=0;i<surface.vertices;i++)target[i]=cortexVisibility(state,surface,i,this.atlas);
        const from=attr.array.slice();mesh.visible=true;
        this.tweens.to('visibility-'+mesh.name,0,1,'ui',t=>{
          for(let i=0;i<attr.count;i++)attr.array[i]=from[i]+(target[surface.index[i]]-from[i])*t;
          attr.needsUpdate=true;mesh.visible=attr.array.some(v=>v>.005);
        });
      }
      mesh.material.wireframe=state.material==='wireframe';mesh.material.depthWrite=state.material!=='glass'&&!mesh.userData.visibility.some(v=>v>.005&&v<.99);
    }
    for(const mesh of this.deep){
      const s=mesh.userData.structure,alpha=subcorticalVisibility(state,s)*(state.material==='glass'?.72:1);
      mesh.visible=mesh.visible||alpha>.005;
      this.tweens.to('opacity-'+s.id,mesh.material.opacity,alpha,'ui',value=>{mesh.material.opacity=value;mesh.visible=value>.005;});
      mesh.material.depthWrite=alpha>.98;mesh.material.wireframe=state.material==='wireframe';
      mesh.material.color.copy(state.material==='porcelain'?new THREE.Color('#cbd4db'):mesh.userData.baseColor);
      const isSelected=selected?.type==='structure'&&selected.id===s.id;
      if(selected?.type==='structure'&&!isSelected){const c=mesh.material.color,g=c.r*.2126+c.g*.7152+c.b*.0722;c.lerp(new THREE.Color(g,g,g),.65).multiplyScalar(.35);}
      mesh.material.emissive.copy(isSelected?mesh.userData.baseColor:new THREE.Color(0));mesh.material.emissiveIntensity=isSelected?.12:0;
    }
    for(const key of ['morph','separation','lift'])if(!previous||state[key]!==previous[key])this.tweens.to(key,this[key],state[key],'layout',v=>this[key]=v);
    this.controls.autoRotate=state.auto&&!reducedMotion();this.controls.enableDamping=!reducedMotion();
    state.clips.forEach((c,i)=>{
      const normal=new THREE.Vector3();normal.setComponent(i,c.enabled?(c.reverse?-1:1):0);
      this.clipPlanes[i].set(normal,c.enabled?-c.position*(c.reverse?-1:1):1);this.sliceMeshes[i].visible=c.enabled;
      if(c.enabled&&(!previous||JSON.stringify(c)!==JSON.stringify(previous.clips[i])))this.updateSlice(i,c.position);
    });
    this.layers.update(state);
    if(previous&&state.lift!==previous.lift&&this.activePreset==='deep')this.preset('deep');
  }
  hover(ref){this.uniforms.uHovered.value=ref?.type==='parcel'?ref.id:-1;this.uniforms.uHoverScheme.value=SCHEMES.indexOf(this.state?.scheme||'dk');}
  updateSlice(axis,coordinate){
    const volume=this.atlas.volume,shape=volume.shape,uv=[0,1,2].filter(i=>i!==axis);
    const idx=Math.max(0,Math.min(shape[axis]-1,Math.round((coordinate-volume.affine[axis][3])/2)));
    const width=shape[uv[0]],height=shape[uv[1]],data=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const ijk=[0,0,0];ijk[axis]=idx;ijk[uv[0]]=x;ijk[uv[1]]=y;
      const intensity=volume.data[(ijk[0]*shape[1]+ijk[1])*shape[2]+ijk[2]],k=(y*width+x)*4;
      data.set([intensity,intensity,intensity,intensity>13?255:0],k);
    }
    const tex=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;
    const mesh=this.sliceMeshes[axis];mesh.material.map?.dispose();mesh.material.map=tex;mesh.material.needsUpdate=true;
    const p=new Float32Array(12);
    for(let corner=0;corner<4;corner++){
      const xyz=[0,0,0];xyz[axis]=coordinate;
      xyz[uv[0]]=volume.affine[uv[0]][3]+((corner%2)?width-1:0)*2;
      xyz[uv[1]]=volume.affine[uv[1]][3]+(corner<2?height-1:0)*2;
      p.set(xyz,corner*3);
    }
    mesh.geometry.setAttribute('position',new THREE.BufferAttribute(p,3));mesh.geometry.computeBoundingSphere();
  }
  frame(time){
    this.tweens.tick(time);this.lastTime=time;
    if(this.state){
      this.uniforms.uFlat.value=Math.max(0,this.morph-3);
      for(const mesh of this.cortices){
        mesh.morphTargetInfluences.fill(0);const m=Math.max(0,Math.min(4,this.morph)),a=Math.floor(m),b=Math.min(4,a+1),f=m-a;
        if(a>0)mesh.morphTargetInfluences[a-1]+=1-f;if(b>0)mesh.morphTargetInfluences[b-1]+=f;
        const spread=Math.max(0,1-Math.abs(m-3))*48;
        mesh.position.x=(mesh.name==='lh'?-1:1)*(this.separation*.68+spread);
      }
      for(const mesh of this.deep)mesh.position.fromArray(this.liftLayout.entries.get(mesh.userData.structure.id).offset).multiplyScalar(this.lift/100);
    }
    if(this.cameraTween){
      const tr=this.cameraTween,t=reducedMotion()?1:Math.min(1,(time-tr.start)/MOTION.camera),f=ease(t);
      this.camera.position.lerpVectors(tr.from,tr.to,f);this.controls.target.lerpVectors(tr.fromTarget,tr.target,f);this.camera.up.lerpVectors(tr.fromUp,tr.up,f).normalize();this.camera.zoom=THREE.MathUtils.lerp(tr.fromZoom,tr.zoom,f);this.camera.updateProjectionMatrix();if(t===1)this.cameraTween=null;
    }
    this.controls.autoRotate=!!this.state?.auto&&!reducedMotion();this.controls.update();this.renderer.render(this.scene,this.camera);this.onFrame?.();
  }
  isClipped(point){return this.clipPlanes.some(p=>p.normal.lengthSq()>0&&p.distanceToPoint(point)<0);}
  pick(event){
    if(!this.state)return null;
    const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObjects([...this.cortices,...this.deep].filter(m=>m.visible));
    for(const hit of hits){
      if(this.isClipped(hit.point))continue;
      if(hit.object.userData.type==='structure')return {type:'structure',id:hit.object.userData.structure.id,point:hit.point.toArray()};
      const surface=hit.object.userData.surface;
      const face=hit.faceIndex,sourceVertices=Array.from(surface.index.subarray(face*3,face*3+3));
      if(this.morph>3.985&&surface.flatSeamFaces.includes(face))continue;
      const triangle=new THREE.Triangle(...[hit.face.a,hit.face.b,hit.face.c].map(i=>hit.object.getVertexPosition(i,new THREE.Vector3())));
      const local=hit.object.worldToLocal(hit.point.clone()),barycentric=triangle.getBarycoord(local,new THREE.Vector3()).toArray();
      const si=SCHEMES.indexOf(this.state.scheme),id=fieldPick(hit.object.userData.field,face,barycentric,si);
      if(SCHEMES.some((_,scheme)=>this.state.hiddenParcels.includes(fieldPick(hit.object.userData.field,face,barycentric,scheme))))continue;
      const vertex=sourceVertices[barycentric.indexOf(Math.max(...barycentric))];
      if(cortexVisibility(this.state,surface,vertex,this.atlas)<.005)continue;
      return {type:'parcel',id,vertex,hemisphere:surface.hemisphere,point:hit.point.toArray()};
    }
    return null;
  }
  tweenCamera(position,target,up=new THREE.Vector3(0,0,1),zoom=1){this.cameraTween={start:performance.now(),from:this.camera.position.clone(),to:position,fromTarget:this.controls.target.clone(),target,fromUp:this.camera.up.clone(),up,fromZoom:this.camera.zoom,zoom};}
  fitZoom(width,height,fraction=.70){
    const i=this.frameInsets||this.insets,w=this.container.clientWidth,h=this.container.clientHeight;
    const freeW=Math.max(120,w-i.left-i.right),freeH=Math.max(120,h-i.top-i.bottom);
    return Math.min(240/height*fraction*freeH/h,240*w/h/width*.88*freeW/w);
  }
  anatomyFrame(direction,up){
    const back=direction.clone().normalize(),right=new THREE.Vector3().crossVectors(up,back).normalize(),vertical=new THREE.Vector3().crossVectors(back,right);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    const point=new THREE.Vector3(),include=(positions,dx=0)=>{for(let i=0;i<positions.length;i+=3){point.fromArray(positions,i);point.x+=dx;const x=point.dot(right),y=point.dot(vertical);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}};
    const m=Math.round(this.state?.morph||0),spread=Math.max(0,1-Math.abs(m-3))*48;
    for(const s of this.atlas.surfaces)include(s.positions[SURFACES[m]],(s.hemisphere==='lh'?-1:1)*((this.state?.separation||0)*.68+spread));
    if(m<2)for(const s of this.atlas.structures)include(s.positions);
    const target=new THREE.Vector3(-4,-17,10);target.addScaledVector(right,(minX+maxX)/2-target.dot(right));target.addScaledVector(vertical,(minY+maxY)/2-target.dot(vertical));
    return {target,zoom:this.fitZoom(maxX-minX,maxY-minY,.78)};
  }
  preset(name){
    this.activePreset=name;this.onPreset?.(name);
    if(name==='flat'){
      const target=new THREE.Vector3(0,0,8);this.tweenCamera(new THREE.Vector3(0,-430,8),target,new THREE.Vector3(0,0,1),this.fitZoom(460,200,.85));return;
    }
    if(name==='deep'){
      const b=this.liftLayout.bounds,fraction=(this.state?.lift||100)/100;
      const target=new THREE.Vector3((b.min[0]+b.max[0])/2,0,(b.min[2]+b.max[2])/2).multiplyScalar(fraction);
      const width=210+(b.max[0]-b.min[0]+30-210)*fraction,height=190+(b.max[2]-b.min[2]+40-190)*fraction;
      this.tweenCamera(target.clone().add(new THREE.Vector3(0,-700,0)),target,new THREE.Vector3(0,0,1),this.fitZoom(width,height,.92));return;
    }
    const vectors={lateral:[-420,0,0],medial:[420,0,0],dorsal:[0,0,430],ventral:[0,0,-430],anterior:[0,430,0],posterior:[0,-430,0],home:[-285,-310,155]};
    const up=['dorsal','ventral'].includes(name)?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
    const direction=new THREE.Vector3(...(vectors[name]||vectors.home)),{target,zoom}=this.anatomyFrame(direction,up);
    this.tweenCamera(direction.add(target),target,up,zoom);
  }
  focus(selection){
    const points=[],m=Math.min(4,this.morph),a=Math.floor(m),b=Math.min(4,a+1),f=m-a;
    const selectedParcel=selection?.type==='parcel'?this.atlas.parcelById.get(selection.id):null;
    const testState={...this.state,isolation:selection};
    for(const mesh of this.cortices){
      const s=mesh.userData.surface;if(selection.type==='structure')continue;
      for(let i=0;i<s.vertices;i++){
        if(selectedParcel?(s.labels[i*4+SCHEMES.indexOf(selectedParcel.scheme)]!==selection.id):cortexVisibility(testState,s,i,this.atlas)<.005)continue;
        points.push(new THREE.Vector3().fromArray(s.positions[SURFACES[a]],i*3).lerp(new THREE.Vector3().fromArray(s.positions[SURFACES[b]],i*3),f).add(mesh.position));
      }
    }
    for(const mesh of this.deep){const s=mesh.userData.structure;if(selection.type==='parcel'||(selection.type==='structure'?selection.id!==s.id:subcorticalVisibility(testState,s)<.005))continue;for(let i=0;i<s.positions.length;i+=3)points.push(new THREE.Vector3().fromArray(s.positions,i).add(mesh.position));}
    if(!points.length)return;
    const box=new THREE.Box3().setFromPoints(points),center=box.getCenter(new THREE.Vector3()),direction=this.camera.position.clone().sub(this.controls.target).normalize();
    if(selectedParcel){
      const mesh=this.cortices.find(m=>m.name===selectedParcel.hemisphere),positions=mesh.userData.surface.positions[SURFACES[Math.round(m)]],hemiCenter=new THREE.Vector3();
      for(let i=0;i<positions.length;i+=3)hemiCenter.add(new THREE.Vector3().fromArray(positions,i));hemiCenter.multiplyScalar(3/positions.length).add(mesh.position);
      direction.copy(m>3.5?new THREE.Vector3(0,-1,0):center.clone().sub(hemiCenter).normalize());
    }
    const up=Math.abs(direction.z)>.94?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1),right=new THREE.Vector3().crossVectors(up,direction).normalize(),vertical=new THREE.Vector3().crossVectors(direction,right);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const p of points){const x=p.dot(right),y=p.dot(vertical);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    this.activePreset=null;this.onPreset?.(null);
    this.tweenCamera(center.clone().addScaledVector(direction,430),center,up,Math.min(4,this.fitZoom(Math.max(45,maxX-minX),Math.max(45,maxY-minY),.76)));
  }
  selectionCenter(selection){
    if(selection?.type==='structure'){
      const mesh=this.deep.find(m=>m.userData.structure.id===selection.id);return new THREE.Vector3(...mesh.userData.structure.centroid).add(mesh.position);
    }
    if(selection?.type==='parcel'){
      const parcel=this.atlas.parcelById.get(selection.id),mesh=this.cortices.find(m=>m.name===parcel.hemisphere),surface=mesh.userData.surface,scheme=SCHEMES.indexOf(parcel.scheme),center=new THREE.Vector3(),v=new THREE.Vector3();let n=0;
      for(let i=0;i<surface.vertices;i++)if(surface.labels[i*4+scheme]===parcel.id){const m=Math.min(4,this.morph),a=Math.floor(m),b=Math.min(4,a+1),f=m-a;v.fromArray(surface.positions[SURFACES[a]],i*3).lerp(new THREE.Vector3().fromArray(surface.positions[SURFACES[b]],i*3),f);center.add(v);n++;}
      return center.divideScalar(n||1).add(mesh.position);
    }
    return this.controls.target.clone();
  }
  exportPNG(){
    this.renderer.render(this.scene,this.camera);const source=this.renderer.domElement,canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);const scale=this.renderer.getPixelRatio();
    ctx.save();ctx.scale(scale,scale);const h=canvas.height/scale,w=canvas.width/scale;
    ctx.fillStyle='rgba(255,255,255,0.94)';ctx.fillRect(0,h-48,w,48);ctx.fillStyle='#344e61';ctx.font='600 15px system-ui';ctx.fillText('Pial Atlas',64,h-20);
    ctx.font='11px system-ui';ctx.fillText('FreeSurfer fsaverage6 · ICBM 2009c population template',180,h-20);
    ctx.translate(16,h-43);ctx.scale(.66,.66);ctx.strokeStyle='#344e61';ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';for(const d of BRAIN_PATHS)ctx.stroke(new Path2D(d));ctx.restore();
    const link=document.createElement('a');link.download='Pial-Atlas.png';link.href=canvas.toDataURL('image/png');link.click();
  }
  dispose(){this.resizeObserver.disconnect();this.renderer.setAnimationLoop(null);this.controls.dispose();this.layers.dispose();this.renderer.dispose();}
}
