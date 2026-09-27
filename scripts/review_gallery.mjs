import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),reports=path.join(root,'reports');
const report=JSON.parse(await fs.readFile(path.join(reports,'polish-tests.json'),'utf8'));
if(report.failure)throw new Error('The visual review gallery requires a successful browser test run.');
const names=new Set(report.screenshots.map(s=>s.replace(/^polish-\d+-/,'').replace('.png','')));
const rows=[...names].filter(s=>!s.includes('reachability')).map(name=>{
  const images=[1920,1440,1280].map(width=>`polish-${width}-${name}.png`).filter(file=>report.screenshots.includes(file));
  return `<section><h2>${name.replaceAll('-',' ')}</h2><div class="row">${images.map(file=>`<a href="${file}"><img src="${file}" alt="Pial Atlas ${name.replaceAll('-',' ')} screenshot"><span>${file}</span></a>`).join('')}</div></section>`;
});
rows.push(`<section><h2>Short viewport reachability</h2><div class="row">${report.screenshots.filter(file=>file.includes('reachability')).map(file=>`<a href="${file}"><img src="${file}" alt="Navigation and footer reachability at a short viewport height"><span>${file}</span></a>`).join('')}</div></section>`);
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pial Atlas visual verification</title><style>body{margin:0;background:#edf1f4;font:14px system-ui;color:#263c4b}header{padding:22px 28px;background:white}h1{font-size:24px;margin:0 0 8px}p{margin:0}main{padding:18px}section{margin-bottom:18px;border:1px solid #ccd8e2;border-radius:12px;background:white;padding:14px}h2{font-size:16px;margin:0 0 10px;text-transform:capitalize}.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}a{color:#315e79;text-decoration:none}img{display:block;width:100%;height:350px;object-fit:contain;background:#eef2f4;border:1px solid #d8e2e8}span{display:block;font-size:11px;padding:7px}footer{padding:20px}</style><header><h1>Pial Atlas visual verification</h1><p>Offline browser screenshots at 1920×1080, 1440×900, and 1280×720. Select any image to inspect its original resolution.</p></header><main>${rows.join('')}</main><footer>${report.passed} additional browser checks passed. No console errors or network requests. Complete evidence is in polish-tests.json.</footer></html>`;
await fs.writeFile(path.join(reports,'visual-review.html'),html);
if(process.argv.includes('--capture')){
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
  const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.goto(pathToFileURL(path.join(reports,'visual-review.html')).href);await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  const sections=page.locator('section');for(let i=0;i<await sections.count();i++)await sections.nth(i).screenshot({path:path.join(reports,`review-${i}.png`)});
  await browser.close();
}
console.log(`Created visual-review.html with ${report.screenshots.length} screenshot references.`);
