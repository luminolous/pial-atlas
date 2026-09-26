import { MeshoptDecoder } from 'meshoptimizer';

export function fromBase64(text) {
  const binary = atob(text), bytes = new Uint8Array(binary.length);
  for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}
export async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function decodeAtlas(encoded) {
  await MeshoptDecoder.ready;
  const atlas=JSON.parse(new TextDecoder().decode(await inflate(fromBase64(encoded))));
  async function decode(d) {
    const encoded=fromBase64(d.encoded);
    let bytes;
    if (d.codec==='gzip') bytes=await inflate(encoded);
    else {
      bytes=new Uint8Array(d.count*d.stride);
      if(d.codec==='index') MeshoptDecoder.decodeIndexSequence(bytes,d.count,d.stride,encoded);
      else MeshoptDecoder.decodeVertexBuffer(bytes,d.count,d.stride,encoded);
    }
    if(d.codec==='position') {
      const raw=new Int16Array(bytes.buffer),out=new Float32Array(d.count*3);
      for(let i=0;i<d.count;i++)for(let c=0;c<3;c++)out[i*3+c]=raw[i*4+c]*d.scale;
      return out;
    }
    return new ({'<f4':Float32Array,'<u4':Uint32Array,'<u2':Uint16Array,'|u1':Uint8Array}[d.dtype] || Uint8Array)(bytes.buffer);
  }
  for(const surface of atlas.surfaces) {
    surface.index=await decode(surface.index);
    for(const key of Object.keys(surface.positions))surface.positions[key]=await decode(surface.positions[key]);
    for(const key of ['labels','lobes','sulc'])surface[key]=await decode(surface[key]);
  }
  for(const structure of atlas.structures) {
    structure.positions=await decode(structure.positions);structure.index=await decode(structure.index);
  }
  atlas.volume.data=await decode(atlas.volume.data);
  atlas.parcelById=new Map(atlas.parcels.map(p=>[p.id,p]));
  atlas.parcelByKey=new Map(atlas.parcels.map(p=>[p.key,p]));
  return atlas;
}
