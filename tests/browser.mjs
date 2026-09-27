import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const launch={headless:true};
if(process.env.BROWSER_CHANNEL!=='bundled')launch.channel=process.env.BROWSER_CHANNEL||'chrome';
const browser=await chromium.launch(launch);
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true,offline:true,hasTouch:true});
const page=await context.newPage();
const errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
async function scheme(value){const explorer=await page.locator('#explorer-view').isVisible();await page.locator('#legend-tab').click();await page.selectOption('#scheme',value);if(explorer)await page.locator('#explore-tab').click();}
async function settled(){await page.waitForTimeout(850);}
async function slider(id,value){await page.locator('#'+id).fill(String(value));await page.locator('#'+id).dispatchEvent('input');await page.locator('#'+id).dispatchEvent('change');}
try{
  await page.goto(pathToFileURL(path.resolve('dist/Pial-Atlas.html')).href);
  await page.waitForFunction(()=>window.atlasApp?.ready||window.atlasError,null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.atlasError),undefined);await settled();
  await check('Loads from file:// while browser networking is offline',async()=>{assert.equal(await page.evaluate(()=>window.atlasApp.ready),true);assert.equal(requests.length,0);});
  await page.screenshot({path:'reports/browser-initial.png'});
  await check('Anatomical hierarchy and inspector navigate to a real precentral parcel',async()=>{
    await page.getByRole('button',{name:'Explore Forebrain',exact:true}).click();
    await page.getByRole('button',{name:'Explore Left cerebral hemisphere',exact:true}).click();
    await page.getByRole('button',{name:'Explore Frontal lobe',exact:true}).click();
    await page.getByRole('button',{name:'Inspect Precentral gyrus',exact:true}).click();
    assert.match(await page.locator('#inspector').textContent(),/Desikan–Killiany/);
    assert.match(await page.locator('#inspector').textContent(),/Brain → Forebrain → Left cerebral hemisphere → Frontal lobe/);
    await page.locator('[data-inspect="parent"]').click();assert.equal(await page.locator('#nav-title').textContent(),'Frontal lobe');
    await page.getByRole('button',{name:'Inspect Precentral gyrus',exact:true}).click();
  });
  const initial=await page.evaluate(()=>({ids:atlasApp.renderer.cortices.map(m=>m.geometry.uuid),parcel:atlasApp.store.state.selection.id}));
  await check('Hidden vertex mask persists through every morph and scheme',async()=>{
    await page.locator('[data-inspect="hide"]').click();await settled();
    const hiddenCount=await page.evaluate(()=>atlasApp.renderer.cortices[0].geometry.getAttribute('atlasVisibility').array.filter(v=>v===0).length);assert.ok(hiddenCount>100);
    for(const scheme of ['destrieux','yeo7','yeo17','dk']){
      await page.locator('#legend-tab').click();await page.selectOption('#scheme',scheme);await page.locator('#explore-tab').click();
      assert.match(await page.locator('#inspector').textContent(),/Left cerebral hemisphere → Frontal lobe/);
      for(const morph of [0,1,2,3,4]){
        await slider('morph',morph);
        const current=await page.evaluate(()=>({ids:atlasApp.renderer.cortices.map(m=>m.geometry.uuid),hidden:atlasApp.renderer.cortices[0].geometry.getAttribute('atlasVisibility').array.filter(v=>v===0).length,selection:atlasApp.store.state.selection.id}));
        assert.deepEqual(current.ids,initial.ids);assert.equal(current.hidden,hiddenCount);assert.equal(current.selection,initial.parcel);
      }
    }
    await slider('separation',70);await slider('lift',60);
    await page.locator('#display-toggle').click();
    for(const material of ['glass','porcelain','wireframe','anatomical']){
      await page.locator(`[data-material="${material}"]`).click();
      assert.equal(await page.evaluate(()=>atlasApp.renderer.cortices[0].geometry.getAttribute('atlasVisibility').array.filter(v=>v===0).length),hiddenCount);
    }
    await page.locator('[data-close="display-popover"]').click();
    await page.locator('#return-position').click();await settled();
    assert.ok(await page.evaluate(()=>Math.abs(atlasApp.renderer.separation)<.1&&Math.abs(atlasApp.renderer.lift)<.1));
  });
  await check('Undo and restore all recover visibility and opacity',async()=>{
    await page.locator('#restore').click();assert.equal(await page.evaluate(()=>atlasApp.store.state.hiddenParcels.length),0);
    await page.locator('#undo').click();assert.equal(await page.evaluate(()=>atlasApp.store.state.hiddenParcels.length),1);
    await page.locator('#restore').click();await slider('opacity',.45);await settled();assert.ok(await page.evaluate(()=>atlasApp.renderer.cortices[0].geometry.getAttribute('atlasVisibility').array.some(v=>v>.44&&v<.46)));
    await page.locator('#undo').click();assert.equal(await page.locator('#opacity').inputValue(),'1');
  });
  await check('Search spans all schemes and selects independent subcortical meshes',async()=>{
    await page.locator('#search').fill('Visual Central');await page.locator('#search-results button').first().click();
    assert.equal(await page.locator('#scheme').inputValue(),'yeo17');assert.match(await page.locator('#inspector').textContent(),/Visual Central/);
    await page.locator('#search').fill('Left thalamus');await page.locator('#search-results button').first().click();
    assert.equal(await page.evaluate(()=>atlasApp.store.state.selection.type),'structure');
    await page.locator('[data-inspect="isolate"]').click();await settled();assert.equal(await page.evaluate(()=>atlasApp.renderer.deep.filter(m=>m.visible).length),1);
    await page.locator('[data-inspect="hide"]').click();await settled();assert.equal(await page.evaluate(()=>atlasApp.renderer.deep.filter(m=>m.visible).length),0);
    await page.locator('#undo').click();await settled();assert.equal(await page.evaluate(()=>atlasApp.renderer.deep.filter(m=>m.visible).length),1);
    await page.locator('#restore').click();await page.locator('#reset').click();await settled();
  });
  await check('Click picking returns a label ID and an inspectable structure',async()=>{
    const box=await page.locator('#stage').boundingBox();await page.mouse.click(box.x+box.width*.50,box.y+box.height*.5);
    const selected=await page.evaluate(()=>atlasApp.store.state.selection);assert.ok(selected?.id>0);assert.ok(['parcel','structure'].includes(selected.type));
    assert.notEqual(await page.locator('#inspector h2').textContent(),'Select a structure');
  });
  await check('All camera presets, free rotation, wheel zoom, and two-finger pinch operate',async()=>{
    for(const preset of ['lateral','medial','dorsal','ventral','anterior','posterior','home']){await page.locator(`[data-preset="${preset}"]`).click();await page.waitForTimeout(80);}
    await page.locator('#restore').click();await settled();
    const beforeZoom=await page.evaluate(()=>atlasApp.renderer.camera.zoom);const before=await page.evaluate(()=>atlasApp.renderer.camera.position.toArray());const box=await page.locator('#stage').boundingBox();
    await page.mouse.move(box.x+box.width*.55,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.68,box.y+box.height*.58,{steps:10});await page.mouse.up();await page.mouse.wheel(0,-140);await settled();
    const after=await page.evaluate(()=>({position:atlasApp.renderer.camera.position.toArray(),zoom:atlasApp.renderer.camera.zoom}));assert.notDeepEqual(after.position,before);assert.ok(after.zoom>beforeZoom);
    const client=await context.newCDPSession(page),cx=box.x+box.width*.5,cy=box.y+box.height*.5;
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-40,y:cy,id:1},{x:cx+40,y:cy,id:2}]});
    for(let d=45;d<=90;d+=5)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-d,y:cy,id:1},{x:cx+d,y:cy,id:2}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled();
    assert.ok(await page.evaluate(previous=>atlasApp.renderer.camera.zoom>previous,after.zoom));await client.detach();
    await page.locator('[data-preset="home"]').click();await settled();
  });
  await check('All three textured clipping planes expose coordinates and reverse direction',async()=>{
    await page.locator('#slices-toggle').click();
    for(const [i,value] of [[0,-24],[1,-20],[2,20]]){
      await page.locator('#clip-'+i).check();await slider('clip-position-'+i,value);await settled();
      const slice=await page.evaluate(i=>({visible:atlasApp.renderer.sliceMeshes[i].visible,texture:atlasApp.renderer.sliceMeshes[i].material.map.image.data.length,normal:atlasApp.renderer.clipPlanes[i].normal.toArray()}),i);
      assert.equal(slice.visible,true);assert.ok(slice.texture>30000);assert.equal(slice.normal[i],1);
      await page.locator('#clip-reverse-'+i).check();assert.equal(await page.evaluate(i=>atlasApp.renderer.clipPlanes[i].normal.getComponent(i),i),-1);
      await page.locator('#clip-reverse-'+i).uncheck();
    }
    await page.locator('[data-close="slices-popover"]').click();await page.screenshot({path:'reports/browser-slices.png'});
    await page.locator('#reset').click();await settled();
  });
  await check('Legend, labels, automatic exploration, and PNG export work',async()=>{
    await page.locator('#legend-tab').click();assert.equal(await page.locator('#legend-list .structure-row').count(),72);
    await page.locator('#labels-toggle').click();await settled();assert.ok(await page.locator('.anatomical-label').count()>0);
    await scheme('yeo7');await settled();assert.ok(await page.locator('.anatomical-label').count()>0);await scheme('dk');
    await page.locator('#auto-toggle').click();assert.equal(await page.evaluate(()=>atlasApp.renderer.controls.autoRotate),true);await page.locator('#auto-toggle').click();
    const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'Pial-Atlas.png');await download.saveAs('reports/exported-brain.png');
    await page.locator('#labels-toggle').click();await page.locator('#explore-tab').click();
  });
  await check('Inflated, spherical, and derived flat views render without geometry reload',async()=>{
    await scheme('yeo17');
    for(const [name,m] of [['inflated',2],['sphere',3],['flat',4]]){await slider('morph',m);await settled();await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:`reports/browser-${name}.png`});assert.deepEqual(await page.evaluate(()=>atlasApp.renderer.cortices.map(m=>m.geometry.uuid)),initial.ids);}
    await page.locator('#reset').click();await settled();
  });
  await check('Seven-step guided journey runs and keeps hidden rules intact',async()=>{
    await page.evaluate(()=>atlasApp.store.toggle('hiddenStructures',18));await page.locator('#journey-start').click();
    for(let i=0;i<7;i++){assert.match(await page.locator('#journey-step').textContent(),new RegExp(String(i+1).padStart(2,'0')));assert.ok(await page.evaluate(()=>atlasApp.store.state.hiddenStructures.includes(18)));await settled();if(i===5)await page.screenshot({path:'reports/browser-deep-journey.png'});await page.locator('#journey-next').click();}
    assert.equal(await page.locator('#journey').isVisible(),false);await page.locator('#reset').click();
  });
  await check('Data, methods, full redistribution notices, and template caveat are accessible',async()=>{
    await page.locator('#about-button').click();assert.equal(await page.locator('#about').isVisible(),true);
    const text=await page.locator('#about').textContent();assert.match(text,/population template/);assert.match(text,/PART B. DOWNLOADING AGREEMENT/);assert.match(text,/Computational Brain Imaging Group/);assert.match(text,/Louis Collins/);await page.locator('#about-close').click();
  });
  await check('Fullscreen enters and exits',async()=>{
    await page.locator('#fullscreen').click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true);await page.locator('#fullscreen').click();await page.waitForTimeout(200);
  });
  await check('Desktop, tablet, and narrow layouts have no structural overlaps or overflow',async()=>{
    for(const [width,height] of [[1440,1000],[1280,800],[900,900],[390,844]]){
      await page.setViewportSize({width,height});await page.locator('#reset').click();await settled();
      const layout=await page.evaluate(()=>{
        const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const ids=['.structure-panel','.viewer-column','.camera-rail'];return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,panels:ids.map(s=>rect(document.querySelector(s))),stage:rect(document.querySelector('#stage')),morph:rect(document.querySelector('.morph-panel'))};
      });
      assert.equal(layout.overflow,false,`Horizontal overflow at ${width}`);
      for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const a=layout.panels[i],b=layout.panels[j];assert.ok(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1,`Panel overlap at ${width}`);}
      assert.ok(layout.stage.bottom<=layout.morph.top+1);assert.ok(layout.stage.height>=300);
      await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:`reports/browser-${width}.png`,fullPage:true});
    }
  });
  assert.deepEqual(errors,[]);assert.equal(requests.length,0);
  checks.push('No JavaScript or WebGL console errors; no HTTP requests during the entire run');
  await fs.writeFile('reports/browser-tests.json',JSON.stringify({passed:checks.length,checks,errors,networkRequests:requests,browser:await browser.version(),offline:true,launchFlags:'No file-access or web-security overrides'},null,2));
  console.log(`${checks.length} browser checks passed.`);
}catch(error){
  console.error('Browser test failed:',error);console.error('Browser console:',errors);
  await page.screenshot({path:'reports/browser-failure.png',fullPage:true});
  await fs.writeFile('reports/browser-tests.json',JSON.stringify({passed:checks.length,checks,errors,failure:String(error)},null,2));process.exitCode=1;
}finally{await browser.close();}
