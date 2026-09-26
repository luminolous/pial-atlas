import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
    this.container=container;this.atlas=atlas;this.onPick=onPick;this.onHover=onHover;
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
    this.controls.minZoom=.38;this.controls.maxZoom=7;this.controls.zoomSpeed=.85;
    this.controls.autoRotateSpeed=.65;
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
    this.uniforms={uScheme:{value:0},uPalette:{value:this.palette},uMode:{value:0},uSelected:{value:-1},uSelectionScheme:{value:0},uFlat:{value:0},uMorph:{value:0}};
    this.cortices=[];this.deep=[];
    for(const s of atlas.surfaces){
      const g=new THREE.BufferGeometry();g.setIndex(new THREE.BufferAttribute(s.index,1));g.setAttribute('position',new THREE.BufferAttribute(s.positions.pial,3));
      g.setAttribute('atlasLabels',new THREE.BufferAttribute(new Float32Array(s.labels),4));
      g.setAttribute('atlasVisibility',new THREE.BufferAttribute(new Float32Array(s.vertices).fill(1),1));
      g.setAttribute('sulcus',new THREE.BufferAttribute(s.sulc,1));
      const flatValidity=new Float32Array(s.vertices).fill(1);
      for(const face of s.flatSeamFaces)flatValidity[s.index[face*3+2]]=0;
      g.setAttribute('flatValidity',new THREE.BufferAttribute(flatValidity,1));
      g.computeVertexNormals();g.morphAttributes.position=[];g.morphAttributes.normal=[];
      for(const state of SURFACES.slice(1)){
        g.morphAttributes.position.push(new THREE.BufferAttribute(s.positions[state],3));
        const temp=new THREE.BufferGeometry();temp.setIndex(g.index);temp.setAttribute('position',new THREE.BufferAttribute(s.positions[state],3));temp.computeVertexNormals();g.morphAttributes.normal.push(temp.getAttribute('normal'));temp.dispose();
      }
      // Bounding volumes enclose all target states so morphs remain pickable.
      g.boundingBox=new THREE.Box3();for(const positions of Object.values(s.positions))g.boundingBox.expandByPoint(new THREE.Vector3().fromArray(positions,0));
      for(const positions of Object.values(s.positions))for(let i=0;i<positions.length;i+=3)g.boundingBox.expandByPoint(new THREE.Vector3().fromArray(positions,i));
      g.boundingSphere=new THREE.Sphere();g.boundingBox.getBoundingSphere(g.boundingSphere);
      const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.63,metalness:.02,side:THREE.DoubleSide,transparent:true,clippingPlanes:this.clipPlanes});
      mat.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,this.uniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
          attribute vec4 atlasLabels;
          attribute float atlasVisibility;
          attribute float sulcus;
          attribute float flatValidity;
          flat varying vec4 vAtlasLabels;
          flat varying float vAtlasVisibility;
          flat varying float vFlatValidity;
          varying float vSulcus;`)
          .replace('#include <begin_vertex>',`#include <begin_vertex>
          vAtlasLabels=atlasLabels; vAtlasVisibility=atlasVisibility; vSulcus=sulcus; vFlatValidity=flatValidity;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
          flat varying vec4 vAtlasLabels;
          flat varying float vAtlasVisibility;
          flat varying float vFlatValidity;
          varying float vSulcus;
          uniform int uScheme;
          uniform sampler2D uPalette;
          uniform int uMode;
          uniform float uSelected;
          uniform int uSelectionScheme;
          uniform float uFlat;
          float labelAt(int scheme) {return scheme==0?vAtlasLabels.x:scheme==1?vAtlasLabels.y:scheme==2?vAtlasLabels.z:vAtlasLabels.w;}`)
          .replace('#include <color_fragment>',`#include <color_fragment>
          if(vAtlasVisibility<0.005) discard;
          if(uFlat>0.985 && vFlatValidity<0.5) discard;
          float atlasId=labelAt(uScheme);
          vec3 parcelColor=texture2D(uPalette,vec2((atlasId+0.5)/512.0,0.5)).rgb;
          float fold=clamp(0.89-0.17*vSulcus,0.57,1.06);
          diffuseColor.rgb=(uMode==1?vec3(0.78,0.83,0.87):parcelColor)*fold;
          if(abs(labelAt(uSelectionScheme)-uSelected)<0.1) diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.12,0.47,0.64),0.70);
          diffuseColor.a*=vAtlasVisibility*(uMode==3?0.23:1.0)*mix(1.0,vFlatValidity,smoothstep(0.9,1.0,uFlat));`);
      };
      const mesh=new THREE.Mesh(g,mat);mesh.name=s.hemisphere;mesh.userData={type:'cortex',surface:s};this.brain.add(mesh);this.cortices.push(mesh);
    }
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
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.lastTime=performance.now();this.renderer.setAnimationLoop(t=>this.frame(t));
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.left=-120*w/h;this.camera.right=120*w/h;this.camera.top=120;this.camera.bottom=-120;this.camera.updateProjectionMatrix();}
  update(state){
    this.state=state;this.uniforms.uScheme.value=SCHEMES.indexOf(state.scheme);this.uniforms.uMode.value=['anatomical','porcelain','wireframe','glass'].indexOf(state.material);
    const selected=state.selection;
    this.uniforms.uSelected.value=selected?.type==='parcel'?selected.id:-1;
    this.uniforms.uSelectionScheme.value=selected?.type==='parcel'?SCHEMES.indexOf(this.atlas.parcelById.get(selected.id).scheme):0;
    for(const mesh of this.cortices){
      const attr=mesh.geometry.getAttribute('atlasVisibility'),surface=mesh.userData.surface;
      for(let i=0;i<surface.vertices;i++)attr.array[i]=cortexVisibility(state,surface,i,this.atlas);
      attr.needsUpdate=true;mesh.material.wireframe=state.material==='wireframe';mesh.material.depthWrite=state.material!=='glass'&&!attr.array.some(v=>v>.005&&v<.99);mesh.visible=attr.array.some(v=>v>.005);
    }
    for(const mesh of this.deep){
      const s=mesh.userData.structure,alpha=subcorticalVisibility(state,s);mesh.visible=alpha>.005;mesh.material.opacity=alpha*(state.material==='glass'?.72:1);mesh.material.depthWrite=alpha>.98;mesh.material.wireframe=state.material==='wireframe';
      mesh.material.color.copy(state.material==='porcelain'?new THREE.Color('#cbd4db'):mesh.userData.baseColor);
      if(selected?.type==='structure'&&selected.id===s.id)mesh.material.color.set('#4387a0');
    }
    this.controls.autoRotate=state.auto;
    state.clips.forEach((c,i)=>{
      const normal=new THREE.Vector3();normal.setComponent(i,c.enabled?(c.reverse?-1:1):0);
      this.clipPlanes[i].set(normal,c.enabled?-c.position*(c.reverse?-1:1):1);
      this.sliceMeshes[i].visible=c.enabled;
      if(c.enabled)this.updateSlice(i,c.position);
    });
    this.layers.update(state);
  }
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
    const dt=Math.min((time-this.lastTime)/1000,.05);this.lastTime=time;
    if(this.state){
      const k=1-Math.exp(-dt*9);this.morph+=(this.state.morph-this.morph)*k;this.separation+=(this.state.separation-this.separation)*k;this.lift+=(this.state.lift-this.lift)*k;
      this.uniforms.uFlat.value=Math.max(0,this.morph-3);
      for(const mesh of this.cortices){
        mesh.morphTargetInfluences.fill(0);const m=Math.max(0,Math.min(4,this.morph));const a=Math.floor(m),b=Math.min(4,a+1),f=m-a;
        if(a>0)mesh.morphTargetInfluences[a-1]+=1-f;if(b>0)mesh.morphTargetInfluences[b-1]+=f;
        // Spheres need sufficient display spacing; this is explicitly a layout.
        const sphereSpread=Math.max(0,1-Math.abs(m-3))*48;
        mesh.position.x=(mesh.name==='lh'?-1:1)*(this.separation*.68+sphereSpread);
      }
      for(const mesh of this.deep){
        const s=mesh.userData.structure;
        mesh.position.set(0,0,this.lift*1.35);
        if(s.group==='cerebellum')mesh.position.z=-this.lift*.38;
        if(s.group==='brainstem')mesh.position.y=-this.lift*.5;
      }
    }
    if(this.cameraTween){
      const tr=this.cameraTween,t=Math.min(1,(time-tr.start)/650),f=t*t*(3-2*t);
      this.camera.position.lerpVectors(tr.from,tr.to,f);this.controls.target.lerpVectors(tr.fromTarget,tr.target,f);this.camera.up.lerpVectors(tr.fromUp,tr.up,f).normalize();this.camera.zoom=THREE.MathUtils.lerp(tr.fromZoom,tr.zoom,f);this.camera.updateProjectionMatrix();if(t===1)this.cameraTween=null;
    }
    this.controls.update();this.renderer.render(this.scene,this.camera);this.onFrame?.();
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
      // GLSL's provoking vertex is the last vertex of each indexed triangle.
      // Picking uses exactly that vertex's categorical label, never RGB values.
      const vertex=hit.face.c;
      if(this.morph>3.985&&hit.object.geometry.getAttribute('flatValidity').array[vertex]<.5)continue;
      if(cortexVisibility(this.state,surface,vertex,this.atlas)<.005)continue;
      return {type:'parcel',id:surface.labels[vertex*4+SCHEMES.indexOf(this.state.scheme)],vertex,hemisphere:surface.hemisphere,point:hit.point.toArray()};
    }
    return null;
  }
  tweenCamera(position,target,up=new THREE.Vector3(0,0,1),zoom=1){this.cameraTween={start:performance.now(),from:this.camera.position.clone(),to:position,fromTarget:this.controls.target.clone(),target,fromUp:this.camera.up.clone(),up,fromZoom:this.camera.zoom,zoom};}
  preset(name){
    if(name==='flat'){
      const target=new THREE.Vector3(0,0,8),zoom=Math.min(.9,(this.camera.right-this.camera.left)/450);
      this.tweenCamera(new THREE.Vector3(0,-430,8),target,new THREE.Vector3(0,0,1),zoom);return;
    }
    if(name==='deep'){
      const target=new THREE.Vector3(-4,-17,42);
      this.tweenCamera(new THREE.Vector3(-285,-310,170).add(target),target,new THREE.Vector3(0,0,1),.8);return;
    }
    const target=new THREE.Vector3(-4,-17,10),vectors={lateral:[-420,0,30],medial:[420,0,30],dorsal:[0,0,430],ventral:[0,0,-430],anterior:[0,430,15],posterior:[0,-430,15],home:[-285,-310,155]};
    const up=['dorsal','ventral'].includes(name)?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
    this.tweenCamera(new THREE.Vector3(...(vectors[name]||vectors.home)).add(target),target,up,1);
  }
  focus(selection){
    const center=this.selectionCenter(selection);if(!center)return;
    const direction=this.camera.position.clone().sub(this.controls.target).normalize();
    this.tweenCamera(center.clone().addScaledVector(direction,430),center,this.camera.up.clone(),2.05);
  }
  selectionCenter(selection){
    if(selection?.type==='structure'){
      const mesh=this.deep.find(m=>m.userData.structure.id===selection.id);return new THREE.Vector3(...mesh.userData.structure.centroid).add(mesh.position);
    }
    if(selection?.type==='parcel'){
      const parcel=this.atlas.parcelById.get(selection.id),mesh=this.cortices.find(m=>m.name===parcel.hemisphere),surface=mesh.userData.surface,scheme=SCHEMES.indexOf(parcel.scheme),center=new THREE.Vector3(),v=new THREE.Vector3();let n=0;
      for(let i=0;i<surface.vertices;i++)if(surface.labels[i*4+scheme]===parcel.id){mesh.getVertexPosition(i,v);center.add(v);n++;}
      return center.divideScalar(n||1).add(mesh.position);
    }
    return this.controls.target.clone();
  }
  exportPNG(){this.renderer.render(this.scene,this.camera);const link=document.createElement('a');link.download='Pial-Atlas.png';link.href=this.renderer.domElement.toDataURL('image/png');link.click();}
  dispose(){this.resizeObserver.disconnect();this.renderer.setAnimationLoop(null);this.controls.dispose();this.layers.dispose();this.renderer.dispose();}
}
