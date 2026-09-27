import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { MeshoptEncoder } from 'meshoptimizer';
import {BRAIN_GLYPH} from '../src/brand.js';
import {MOTION,EASING} from '../src/motion.js';

const root = path.resolve(import.meta.dirname, '..');
const assetPath = path.join(root, 'data/atlas.meshopt.json');
await MeshoptEncoder.ready;
async function packDescriptor(d) {
  const b = await fs.readFile(path.join(root, 'build', d.file));
  let bytes, count, stride, codec, scale;
  if (d.file.endsWith('-index.bin')) {
    const indices = new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    bytes = MeshoptEncoder.encodeIndexSequence(indices, indices.length, 4);
    codec = 'index'; count = indices.length; stride = 4;
  } else if (d.shape.length === 2 && d.shape[1] === 3 && d.dtype === '<f4') {
    const p = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    const quantized = new Int16Array(d.shape[0] * 4);
    for (let i = 0; i < d.shape[0]; i++) for (let c = 0; c < 3; c++) {
      const q = Math.round(p[i * 3 + c] * 100);
      if (Math.abs(q) > 32767) throw new Error(`Position exceeds quantization bounds: ${d.file}`);
      quantized[i * 4 + c] = q;
    }
    stride = 8; count = d.shape[0]; scale = 0.01; codec = 'position';
    bytes = MeshoptEncoder.encodeVertexBuffer(new Uint8Array(quantized.buffer), count, stride);
  } else {
    codec = 'gzip'; bytes = zlib.gzipSync(b, { level: 9 });
  }
  return { ...d, codec, count, stride, scale, encoded: Buffer.from(bytes).toString('base64') };
}
async function walk(value) {
  if (value?.file && value?.dtype) return packDescriptor(value);
  if (Array.isArray(value)) return Promise.all(value.map(walk));
  if (value && typeof value === 'object') {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k,v]) => [k, await walk(v)])));
  }
  return value;
}
let atlas;
try {
  atlas = JSON.parse(await fs.readFile(path.join(root, 'build/atlas.json'), 'utf8'));
  atlas = await walk(atlas);
  await fs.writeFile(assetPath, JSON.stringify(atlas));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  atlas = JSON.parse(await fs.readFile(assetPath, 'utf8'));
}
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
const notices = [`Pial Atlas source code · MIT licence\n${await fs.readFile(path.join(root,'LICENSE'),'utf8')}`];
for (const file of await fs.readdir(path.join(root, 'licenses'))) {
  if (file.endsWith('.txt')) notices.push(`${file}\n${await fs.readFile(path.join(root, 'licenses', file), 'utf8')}`);
}
for (const [name, file] of [['THREE-MIT.txt','node_modules/three/LICENSE'],['MESHOPT-MIT.txt','node_modules/meshoptimizer/LICENSE.md']]) {
  const text = await fs.readFile(path.join(root, file), 'utf8');
  await fs.writeFile(path.join(root, 'licenses', name), text);
  if (!notices.some(n => n.startsWith(name))) notices.push(`${name}\n${text}`);
}
const bundled = await build({entryPoints:[path.join(root,'src/main.js')],bundle:true,write:false,minify:true,format:'iife',target:'es2022',legalComments:'inline'});
const tokens=`:root{${Object.entries(MOTION).map(([key,value])=>`--motion-${key}:${value}ms;`).join('')}--ease-standard:${EASING.standard};--ease-toggle:${EASING.toggle};}`;
const css = tokens + await fs.readFile(path.join(root, 'src/style.css'), 'utf8');
const template = (await fs.readFile(path.join(root, 'src/index.html'), 'utf8')).replace('<!-- BRAIN GLYPH -->',BRAIN_GLYPH).replace('<!-- FAVICON -->','data:image/svg+xml,'+encodeURIComponent(BRAIN_GLYPH));
const encoded = zlib.gzipSync(Buffer.from(JSON.stringify(atlas)), {level:9}).toString('base64');
// Replacer functions preserve literal JavaScript replacement patterns such as $&.
const html = template.replace('/* STYLES */',()=>css).replace('/* DATA */',()=>`window.__ATLAS_DATA__=${JSON.stringify(encoded)};window.__LICENSES__=${JSON.stringify(notices.join('\n\n')).replaceAll('<','\\u003c')};`).replace('/* APPLICATION */',()=>bundled.outputFiles[0].text.replaceAll('</script','<\\/script'));
const dest = path.join(root, 'dist/Pial-Atlas.html');
await fs.writeFile(dest, html);
const size = Buffer.byteLength(html);
const report = {file:'Pial-Atlas.html',bytes:size,megabytes:size/1e6,sha256:crypto.createHash('sha256').update(html).digest('hex'),compression:'meshoptimizer 0.24 vertex and index codecs; positions quantized to 0.01 mm; gzip for labels, volume, and inline envelope',counts:atlas.counts};
await fs.writeFile(path.join(root,'reports/build.json'),JSON.stringify(report,null,2));
console.log(`Built Pial-Atlas.html: ${size.toLocaleString()} bytes (${(size/1e6).toFixed(2)} MB).`);
