import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {MeshoptDecoder} from 'meshoptimizer';
await MeshoptDecoder.ready;
const atlas=JSON.parse(await fs.readFile('data/atlas.meshopt.json','utf8'));
let descriptors=0,maxError=0;
async function check(value){
  if(value?.encoded){
    const encoded=new Uint8Array(Buffer.from(value.encoded,'base64')),raw=await fs.readFile('build/'+value.file);
    if(value.codec==='gzip'){assert.deepEqual(zlib.gunzipSync(encoded),raw);}
    else {
      const target=new Uint8Array(value.count*value.stride);
      if(value.codec==='index'){MeshoptDecoder.decodeIndexSequence(target,value.count,value.stride,encoded);assert.deepEqual(Buffer.from(target),raw);}
      else {
        MeshoptDecoder.decodeVertexBuffer(target,value.count,value.stride,encoded);
        const q=new Int16Array(target.buffer),p=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
        for(let i=0;i<value.count;i++)for(let c=0;c<3;c++)maxError=Math.max(maxError,Math.abs(q[i*4+c]*.01-p[i*3+c]));
      }
    }
    descriptors++;
  }else if(value&&typeof value==='object')for(const child of Object.values(value))await check(child);
}
await check(atlas);assert.ok(maxError<=.00502);
const html=await fs.readFile('dist/Pial-Atlas.html','utf8');
assert.equal([...html.matchAll(/<script[^>]+src=/g)].length,0);
assert.ok(!/https?:\/\/[^"']+\.(?:woff2|css|js)["']/.test(html));
for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(script);
const report={descriptors,maximumPositionComponentErrorMm:maxError,exactIndexAndLabelRoundtrip:true,inlineScriptsParse:true,noExternalRuntimeAssets:true};
await fs.writeFile('reports/compression.json',JSON.stringify(report,null,2));console.log(report);
