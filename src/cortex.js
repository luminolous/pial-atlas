import * as THREE from 'three';
import {SURFACES} from './state.js';

// Smooth categorical indicator fields for display, without modifying source IDs.
// Filtering avoids staircase boundaries caused by assigning whole triangles one ID.
// The same fields drive the shader and picking, on every corresponding morph state.
export function labelFields(surface){
  const neighbours=Array.from({length:surface.vertices},()=>new Set());
  for(let i=0;i<surface.index.length;i+=3){const ids=surface.index.subarray(i,i+3);for(const a of ids)for(const b of ids)if(a!==b)neighbours[a].add(b);}
  const fields=[];
  for(let scheme=0;scheme<4;scheme++){
    let field=Array.from({length:surface.vertices},(_,i)=>new Map([[surface.labels[i*4+scheme],1]]));
    for(let iteration=0;iteration<3;iteration++)field=field.map((own,i)=>{
      const next=new Map([...own].map(([id,v])=>[id,v*.3]));
      for(const vertex of neighbours[i])for(const [id,v] of field[vertex])next.set(id,(next.get(id)||0)+v*.7/neighbours[i].size);
      return new Map([...next].filter(([,v])=>v>.002));
    });
    fields.push(field);
  }
  const count=surface.index.length/3,width=4096,height=Math.ceil(count*16/width),values=new Float32Array(width*height*4);
  for(let face=0;face<count;face++)for(let scheme=0;scheme<4;scheme++){
    const vertices=surface.index.subarray(face*3,face*3+3),sum=new Map();
    for(const vertex of vertices)for(const [id,v] of fields[scheme][vertex])sum.set(id,(sum.get(id)||0)+v);
    const ids=[...sum].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([id])=>id);while(ids.length<4)ids.push(0);
    const base=(face*16+scheme*4)*4;values.set(ids,base);
    for(let corner=0;corner<3;corner++)values.set(ids.map(id=>fields[scheme][vertices[corner]].get(id)||0),base+4+corner*4);
  }
  const texture=new THREE.DataTexture(values,width,height,THREE.RGBAFormat,THREE.FloatType);texture.needsUpdate=true;
  return {values,width,height,texture};
}
export function fieldPick(field,face,barycentric,scheme){
  const base=(face*16+scheme*4)*4;let winner=0,best=-1;
  for(let i=0;i<4;i++){let mass=0;for(let corner=0;corner<3;corner++)mass+=field.values[base+4+corner*4+i]*barycentric[corner];if(mass>best){best=mass;winner=field.values[base+i];}}
  return winner;
}

// Source vertices retain all four integer label IDs and their morph correspondence.
// Triangle corners are expanded once on the GPU-facing geometry to carry barycentric
// coordinates. All schemes and morphs still share one mesh per hemisphere.
export function cortexGeometry(surface){
  const source=new THREE.BufferGeometry();
  source.setIndex(new THREE.BufferAttribute(surface.index,1));
  source.setAttribute('position',new THREE.BufferAttribute(surface.positions.pial,3));source.computeVertexNormals();
  source.setAttribute('sulcus',new THREE.BufferAttribute(surface.sulc,1));
  source.morphAttributes.position=[];source.morphAttributes.normal=[];
  for(const state of SURFACES.slice(1)){
    const temp=new THREE.BufferGeometry();temp.setIndex(source.index);temp.setAttribute('position',new THREE.BufferAttribute(surface.positions[state],3));temp.computeVertexNormals();
    source.morphAttributes.position.push(temp.getAttribute('position'));source.morphAttributes.normal.push(temp.getAttribute('normal'));temp.dispose();
  }
  const g=source.toNonIndexed();source.dispose();const n=surface.index.length;
  const faceIds=new Float32Array(n);for(let i=0;i<n;i++)faceIds[i]=Math.floor(i/3);g.setAttribute('atlasFace',new THREE.BufferAttribute(faceIds,1));
  const labels=[new Float32Array(n*4),new Float32Array(n*4),new Float32Array(n*4)],barycentric=new Float32Array(n*3),validity=new Float32Array(n).fill(1);
  for(let f=0;f<n;f+=3)for(let corner=0;corner<3;corner++){
    barycentric[(f+corner)*3+corner]=1;
    for(let sourceCorner=0;sourceCorner<3;sourceCorner++)labels[sourceCorner].set(surface.labels.subarray(surface.index[f+sourceCorner]*4,surface.index[f+sourceCorner]*4+4),(f+corner)*4);
  }
  for(const f of surface.flatSeamFaces)validity.fill(0,f*3,f*3+3);
  ['A','B','C'].forEach((name,i)=>g.setAttribute('atlasLabels'+name,new THREE.BufferAttribute(labels[i],4)));
  g.setAttribute('barycentric',new THREE.BufferAttribute(barycentric,3));
  g.setAttribute('atlasVisibility',new THREE.BufferAttribute(new Float32Array(n).fill(1),1));
  g.setAttribute('flatValidity',new THREE.BufferAttribute(validity,1));
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}

export function cortexMaterial(uniforms,clippingPlanes,field){
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.68,metalness:.01,side:THREE.DoubleSide,transparent:true,clippingPlanes});
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    Object.assign(shader.uniforms,{uLabelField:{value:field.texture},uFieldSize:{value:new THREE.Vector2(field.width,field.height)}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec4 atlasLabelsA; attribute vec4 atlasLabelsB; attribute vec4 atlasLabelsC;
      attribute vec3 barycentric; attribute float atlasVisibility; attribute float sulcus; attribute float flatValidity; attribute float atlasFace; flat varying float vAtlasFace;
      flat varying vec4 vLabelsA; flat varying vec4 vLabelsB; flat varying vec4 vLabelsC;
      varying vec3 vBarycentric; varying float vAtlasVisibility; varying float vSulcus; flat varying float vFlatValidity;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
      vLabelsA=atlasLabelsA;vLabelsB=atlasLabelsB;vLabelsC=atlasLabelsC;vBarycentric=barycentric;vAtlasFace=atlasFace;
      vAtlasVisibility=atlasVisibility;vSulcus=sulcus;vFlatValidity=flatValidity;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      flat varying vec4 vLabelsA; flat varying vec4 vLabelsB; flat varying vec4 vLabelsC;
      varying vec3 vBarycentric; varying float vAtlasVisibility; varying float vSulcus; flat varying float vFlatValidity;
      uniform int uScheme; uniform int uPreviousScheme; uniform float uSchemeMix;
      uniform sampler2D uPalette; uniform int uMode; uniform float uSelected; uniform int uSelectionScheme; uniform bool uHasHidden;
      uniform float uHovered; uniform int uHoverScheme; uniform float uFlat;
      uniform sampler2D uLabelField; uniform vec2 uFieldSize; flat varying float vAtlasFace;
      vec4 fieldAt(float index){return texture2D(uLabelField,vec2((mod(index,uFieldSize.x)+0.5)/uFieldSize.x,(floor(index/uFieldSize.x)+0.5)/uFieldSize.y));}
      float channel(vec4 labels,int scheme){return scheme==0?labels.x:scheme==1?labels.y:scheme==2?labels.z:labels.w;}
      // Categorical mass combines corners carrying the same ID. No numeric label interpolation occurs.
      vec3 region(int scheme){
        float offset=vAtlasFace*16.0+float(scheme)*4.0;
        vec4 ids=fieldAt(offset),mass=fieldAt(offset+1.0)*vBarycentric.x+fieldAt(offset+2.0)*vBarycentric.y+fieldAt(offset+3.0)*vBarycentric.z;
        float first=mass.x,second=-1.0,id=ids.x,other=ids.x;
        if(mass.y>first){second=first;other=id;first=mass.y;id=ids.y;}else{second=mass.y;other=ids.y;}
        if(mass.z>first){second=first;other=id;first=mass.z;id=ids.z;}else if(mass.z>second){second=mass.z;other=ids.z;}
        if(mass.w>first){second=first;other=id;first=mass.w;id=ids.w;}else if(mass.w>second){second=mass.w;other=ids.w;}
        return vec3(id,other,second<0.0?2.0:first-second);
      }
      vec3 lookup(float id){return texture2D(uPalette,vec2((id+0.5)/512.0,0.5)).rgb;}
      vec3 colourFor(int scheme){
        vec3 r=region(scheme);float aa=max(fwidth(r.z),0.00001);
        vec3 colour=mix((lookup(r.x)+lookup(r.y))*0.5,lookup(r.x),smoothstep(0.0,aa,r.z));
        float line=1.0-smoothstep(aa*0.3,aa*1.05,r.z);
        return colour*mix(1.0,0.57,line);
      }`)
      .replace('#include <color_fragment>',`#include <color_fragment>
      if(vAtlasVisibility<0.005)discard;
      if(uFlat>0.985&&vFlatValidity<0.5)discard;
      float labelAlpha=1.0;
      if(uHasHidden)for(int scheme=0;scheme<4;scheme++){float id=region(scheme).x;labelAlpha*=texture2D(uPalette,vec2((id+0.5)/512.0,0.5)).a;}
      if(labelAlpha<0.005)discard;
      vec3 parcelColour=mix(colourFor(uPreviousScheme),colourFor(uScheme),uSchemeMix);
      vec3 base=uMode==1?vec3(0.78,0.83,0.87):parcelColour;
      vec3 selectedRegion=region(uSelectionScheme);bool selected=abs(selectedRegion.x-uSelected)<0.1;
      vec3 hoverRegion=region(uHoverScheme);bool hovered=abs(hoverRegion.x-uHovered)<0.1;
      if(selected){float edge=1.0-smoothstep(0.0,max(fwidth(selectedRegion.z)*2.5,0.0001),selectedRegion.z);base=mix(base,vec3(0.94),edge*0.8);}
      if(hovered){float edge=1.0-smoothstep(0.0,max(fwidth(hoverRegion.z)*1.8,0.0001),hoverRegion.z);base=mix(base,vec3(1.0),0.10+edge*0.35);}
      diffuseColor.rgb=base*clamp(0.92-0.12*vSulcus,0.66,1.04);
      diffuseColor.a*=vAtlasVisibility*labelAlpha*(uMode==3?0.23:1.0)*mix(1.0,vFlatValidity,smoothstep(0.9,1.0,uFlat));`)
      .replace('#include <colorspace_fragment>',`#include <colorspace_fragment>
      if(uSelected>0.0&&!selected){float grey=dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722));gl_FragColor.rgb=mix(vec3(grey),gl_FragColor.rgb,0.35)*0.35;}
      else if(uSelected<0.0&&uHovered>0.0&&!hovered){float grey=dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722));gl_FragColor.rgb=mix(vec3(grey),gl_FragColor.rgb,0.70)*0.70;}`);
  };
  return mat;
}

export function categoricalPick(ids,barycentric){
  const masses=new Map();ids.forEach((id,i)=>masses.set(id,(masses.get(id)||0)+barycentric[i]));
  return [...masses].sort((a,b)=>b[1]-a[1])[0][0];
}
