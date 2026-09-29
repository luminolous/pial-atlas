import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeBrowserReport,writeBrowserFile} from './browser-report.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],...(process.env.BROWSER_CHANNEL==='bundled'?{}:{channel:process.env.BROWSER_CHANNEL||'chrome'})});
const context=await browser.newContext({offline:true,viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],requests=[],checks=[],screenshots=[],modulationResults=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
const settle=()=>page.waitForTimeout(950);
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
async function shot(width,name){const file=`appearance-${width}-${name}.png`;await writeBrowserFile(`reports/${file}`,await page.screenshot());screenshots.push(file);}
async function reset(scheme='dk'){
  await page.keyboard.press('Escape');await page.locator('#reset').click();await page.locator('#legend-tab').click();await page.selectOption('#scheme',scheme);await page.locator('[data-preset=lateral]').click();await page.mouse.move(10,10);await settle();
}
async function patch(value){await page.evaluate(value=>atlasApp.store.update(value),value);await settle();}
async function displayOption(selector,value){await page.locator('#display-toggle').click();await page.locator(selector).setChecked(value);await page.keyboard.press('Escape');await settle();}
function measureModulation(){
  const c=document.createElement('canvas'),source=atlasApp.renderer.renderer.domElement;c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const off=ctx.getImageData(0,0,c.width,c.height).data,on=window.curvaturePixels;
  const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
  let darker=0,lighter=0,outside=0,maxChromaticityError=0;const outliers=[];for(let i=c.width*4+4;i<off.length-c.width*4-4;i+=16){
    // Exclude mixed raster edges, which do not represent one surface sample.
    if([-4,4,-c.width*4,c.width*4].some(offset=>[0,1,2].some(channel=>Math.abs(off[i+channel]-off[i+offset+channel])>10)))continue;
    const rgb=[0,1,2].map(k=>linear(off[i+k])),shaded=[0,1,2].map(k=>linear(on[i+k]));
    const luminance=v=>v[0]*.2126+v[1]*.7152+v[2]*.0722,l=luminance(rgb),m=luminance(shaded);if(l<.04)continue;const ratio=m/l;if(ratio<.98)darker++;if(ratio>1.01)lighter++;
    // Quantized readback represents an interval, not an exact linear-light value.
    const interval=(pixels,delta)=>luminance([0,1,2].map(k=>linear(Math.max(0,Math.min(255,pixels[i+k]+delta)))));
    if(interval(on,.5)<.8*interval(off,-.5)-.000001||interval(on,-.5)>1.05*interval(off,.5)+.000001){outside++;if(outliers.length<5)outliers.push({x:(i/4)%c.width,y:Math.floor(i/4/c.width),ratio,off:[...off.slice(i,i+3)],on:[...on.slice(i,i+3)]});}
    const sum=rgb.reduce((a,b)=>a+b),shadedSum=shaded.reduce((a,b)=>a+b);maxChromaticityError=Math.max(maxChromaticityError,...rgb.map((v,k)=>Math.abs(v/sum-shaded[k]/shadedSum)));
  }
  return {darker,lighter,outside,outliers,maxChromaticityError,cameraUnchanged:atlasApp.renderer.camera.matrixWorld.elements.every((n,i)=>Math.abs(n-window.curvatureCamera[i])<1e-8),projectionUnchanged:atlasApp.renderer.camera.projectionMatrix.elements.every((n,i)=>Math.abs(n-window.curvatureProjection[i])<1e-8)};

}
async function curvaturePair(){
  await page.evaluate(()=>{const c=document.createElement('canvas'),source=atlasApp.renderer.renderer.domElement;c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);window.curvaturePixels=ctx.getImageData(0,0,c.width,c.height).data;window.curvatureProjection=atlasApp.renderer.camera.projectionMatrix.elements.slice();window.curvatureCamera=atlasApp.renderer.camera.matrixWorld.elements.slice();atlasApp.store.update({curvatureShading:false});});
  await page.waitForTimeout(120);const result=await page.evaluate(measureModulation);
  await page.evaluate(()=>atlasApp.store.update({curvatureShading:true}));await page.waitForTimeout(120);
  assert.equal(result.cameraUnchanged,true,JSON.stringify(result));assert.equal(result.outside,0,JSON.stringify(result));assert.ok(result.darker>50&&result.lighter>50,JSON.stringify(result));assert.ok(result.maxChromaticityError<.012,JSON.stringify(result));
  return result;
}
try{
  await page.goto(pathToFileURL(path.resolve('dist/Pial-Atlas.html')).href);
  await page.waitForFunction(()=>window.atlasApp?.ready||window.atlasError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.atlasError),undefined);await settle();
  for(const [width,height] of [[1920,1080],[1280,720]]){
    await page.setViewportSize({width,height});await reset();
    await check(`${width}: single heading, square 2×3 presets, active modes, and visible groups`,async()=>{
      assert.equal(await page.locator('.panel-title h1').count(),1);assert.equal(await page.locator('.panel-title .eyebrow,.mini-mark').count(),0);
      const buttons=await page.locator('.view-grid button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));
      assert.equal(buttons.length,6);for(const b of buttons)assert.ok(Math.abs(b.width-b.height)<1);
      assert.equal(buttons[0].top,buttons[1].top);assert.ok(buttons[2].top>buttons[0].bottom);assert.ok(buttons[4].top>buttons[2].bottom);
      assert.equal(await page.locator('[data-preset=lateral]').getAttribute('aria-pressed'),'true');
      assert.deepEqual(await page.locator('.rail-label').allTextContents(),['View','Display tools','Export']);
      assert.equal(await page.locator('.rail-group').first().locator('button').first().getAttribute('data-preset'),'home');
      const last=await page.locator('#export').boundingBox();assert.ok(last.y+last.height<height);
      await page.locator('#display-toggle').click();await settle();assert.equal(await page.locator('[data-material=anatomical]').getAttribute('aria-pressed'),'true');await shot(width,'display-options');await page.keyboard.press('Escape');
    });
    await check(`${width}: scheme chip is available from both tabs and opens the native selector`,async()=>{
      for(const tab of ['#explore-tab','#legend-tab']){
        await page.locator(tab).click();assert.equal(await page.locator('#scheme-chip').isVisible(),true);
        const positions=await page.locator('#space-badge,#scheme-chip').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().toJSON()));
        assert.ok(positions[1].left>=positions[0].right);assert.equal(positions[0].top,positions[1].top);
        await page.locator('#scheme-chip').click();assert.equal(await page.locator('#legend-view').isVisible(),true);
        assert.equal(await page.evaluate(()=>document.activeElement.id),'scheme');
        assert.equal(await page.locator('#scheme').evaluate(el=>el.matches(':open')),true);
        await page.keyboard.press('Escape');await page.selectOption('#scheme','yeo17');await settle();
        assert.match(await page.locator('#scheme-chip').textContent(),/17 networks/);await shot(width,tab==='#explore-tab'?'scheme-chip-from-structures':'scheme-chip-from-legend');
      }
    });
    await check(`${width}: structure rows are compact, and custom scrollbars only occupy space on overflow`,async()=>{
      await page.locator('#explore-tab').click();await patch({nav:'brainstem',selection:null});
      const metrics=()=>page.locator('#structure-list').evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight,gutter:el.offsetWidth-el.clientWidth,overflow:getComputedStyle(el).overflowY,arrow:getComputedStyle(el,'::-webkit-scrollbar-button').display,rows:[...el.querySelectorAll('.structure-row')].map(r=>r.getBoundingClientRect().height)}));
      const short=await metrics();assert.equal(short.client,short.scroll);assert.equal(short.gutter,0);assert.equal(short.overflow,'auto');assert.equal(short.arrow,'none');assert.ok(short.rows.every(h=>h>=40&&h<=44));await shot(width,'short-structure-list');
      await patch({scheme:'destrieux',nav:'lh:frontal'});const long=await metrics();assert.ok(long.scroll>long.client);assert.equal(long.gutter,6);assert.ok(long.rows.every(h=>h>=40&&h<=44));
      await page.locator('#structure-list').evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForTimeout(100);
      const last=await page.locator('#structure-list .structure-row').last().boundingBox(),list=await page.locator('#structure-list').boundingBox(),footer=await page.locator('.visibility-tools').boundingBox();assert.ok(last.y+last.height<=list.y+list.height+1);assert.ok(list.y+list.height<=footer.y+1);
      await shot(width,'compact-structure-list-bottom');
    });
    await reset();
    await check(`${width}: Home and all six camera highlights match actual poses and clear after rotation`,async()=>{
      for(const name of ['home','lateral','medial','dorsal','ventral','anterior','posterior']){
        await page.locator(`[data-preset=${name}]`).click();
        const moving=await page.evaluate(()=>({active:atlasApp.renderer.activePreset,tween:!!atlasApp.renderer.cameraTween}));assert.equal(moving.tween,true);assert.equal(moving.active,null);
        await page.mouse.move(10,10);await settle();assert.equal(await page.locator(`[data-preset=${name}]`).getAttribute('aria-pressed'),'true');
        await shot(width,`camera-${name}`);
        const b=await page.locator('#stage canvas').boundingBox();await page.mouse.move(b.x+b.width*.3,b.y+b.height*.45);await page.mouse.down();await page.mouse.move(b.x+b.width*.3+75,b.y+b.height*.45+28,{steps:8});await page.mouse.up();await page.mouse.move(10,10);await settle();
        assert.equal(await page.locator('[data-preset].active').count(),0);assert.equal(await page.evaluate(()=>atlasApp.renderer.activePreset),null);
        await page.waitForFunction(()=>{const p=atlasApp.renderer.camera.position.toArray(),last=window.stillCamera;window.stillCamera={p,count:last&&p.every((v,i)=>Math.abs(v-last.p[i])<.0001)?last.count+1:0};return window.stillCamera.count>=3;},null,{timeout:15000});
        const position=await page.evaluate(()=>atlasApp.renderer.camera.position.toArray());await page.locator('#display-toggle').click();await settle();await page.keyboard.press('Escape');await settle();
        const distance=await page.evaluate(p=>atlasApp.renderer.camera.position.distanceTo(atlasApp.renderer.camera.position.clone().fromArray(p)),position);assert.ok(distance<.02,`Opening a panel moved the manually placed camera by ${distance}`);assert.equal(await page.locator('[data-preset].active').count(),0);
        if(name==='home')await shot(width,'camera-manual-no-highlight');
      }
      await reset();await page.locator('#auto-toggle').click();await settle();assert.equal(await page.locator('[data-preset].active').count(),0);await page.locator('#auto-toggle').click();await reset();assert.equal(await page.evaluate(()=>atlasApp.renderer.activePreset),'lateral');
      const pose=await page.evaluate(()=>atlasApp.renderer.camera.matrixWorld.elements.slice());await page.waitForTimeout(400);assert.ok((await page.evaluate(()=>atlasApp.renderer.camera.matrixWorld.elements.slice())).every((v,i)=>Math.abs(v-pose[i])<1e-8));
    });
    for(const [scheme,count] of [['dk',35],['destrieux',75],['yeo7',8],['yeo17',18]]){
      await reset(scheme);
      await check(`${width} ${scheme}: intact anatomy is neutral and legend reports hemisphere areas`,async()=>{
        const deep=await page.evaluate(()=>atlasApp.renderer.deep.map(m=>({source:m.userData.sourceColour,colour:m.material.color.getHexString(),opacity:m.material.opacity,transparent:m.material.transparent})));
        for(const m of deep){assert.equal(m.source,false);assert.equal(m.colour,'9c9791');assert.equal(m.opacity,1);assert.equal(m.transparent,false);}
        assert.equal(await page.locator('.legend-row').count(),count);assert.equal(await page.locator('.legend-row .hemisphere-toggle').count(),count*2);
        assert.match(await page.locator('.legend-row').last().textContent(),/Medial wall \/ unassigned/);
        assert.equal(await page.locator('#legend-filter').isVisible(),count>20);
        assert.doesNotMatch(await page.locator('#legend-list').textContent(),/vertices|Brainstem|Cerebell/);
        if(scheme==='destrieux'){const swatch=page.locator('.legend-row').filter({has:page.getByRole('button',{name:'Inspect Subcallosal gyrus',exact:true})}).locator('.swatch');assert.match(await swatch.getAttribute('style'),/linear-gradient/);}
        const row=page.locator('.legend-row').first(),box=await row.boundingBox();assert.ok(box.height>=35&&box.height<=37);
        const title=await row.locator('.area-value').getAttribute('title');assert.match(title,/Left: \d+\.\d{2}%; Right: \d+\.\d{2}%/);
        modulationResults.push({width,scheme,palette:'original',...(await curvaturePair())});await shot(width,`${scheme}-intact`);
      });
      await check(`${width} ${scheme}: bilateral toggles persist across palettes, morphs, and undo`,async()=>{
        const toggle=page.locator('.legend-row').first().locator('.hemisphere-toggle').first();const ids=(await toggle.getAttribute('data-parcel-ids')).split(',').map(Number);
        await toggle.click();await settle();assert.equal(await toggle.getAttribute('aria-pressed'),'false');
        await displayOption('#colourblind-safe',true);
        await patch({morph:2});
        const hidden=await page.evaluate(ids=>({ids:atlasApp.store.state.hiddenParcels,alpha:ids.map(id=>atlasApp.renderer.palette.image.data[id*4+3])}),ids);for(const id of ids)assert.ok(hidden.ids.includes(id));assert.ok(hidden.alpha.every(a=>a===0));
        await page.locator('#undo').click();await settle();assert.equal(await page.evaluate(()=>atlasApp.store.state.morph),0);assert.equal(await page.evaluate(()=>atlasApp.store.state.colourblindSafe),true);
        await page.locator('#restore').click();await settle();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
        const changed=await page.evaluate(()=>atlasApp.atlas.parcels.filter(p=>p.scheme===atlasApp.store.state.scheme&&p.assigned).every(p=>atlasApp.renderer.safeColours.has(p.id)));assert.equal(changed,true);
        modulationResults.push({width,scheme,palette:'colourblind-safe',...(await curvaturePair())});await shot(width,`${scheme}-accessible`);
      });
      await check(`${width} ${scheme}: cortical selection retains palette identity and dims context`,async()=>{
        await displayOption('#colourblind-safe',false);
        const identity=await page.evaluate(()=>{
          const a=atlasApp,p=a.atlas.parcels.filter(p=>p.scheme===a.store.state.scheme&&p.hemisphere==='lh'&&p.assigned).sort((a,b)=>b.whiteAreaMm2-a.whiteAreaMm2)[0];
          const rgb=Array.from(a.renderer.palette.image.data.slice(p.id*4,p.id*4+3));a.select({type:'parcel',id:p.id});return {id:p.id,rgb};
        });await settle();
        assert.deepEqual(await page.evaluate(id=>Array.from(atlasApp.renderer.palette.image.data.slice(id*4,id*4+3)),identity.id),identity.rgb);
        assert.equal(await page.evaluate(()=>atlasApp.renderer.uniforms.uSelected.value),identity.id);await shot(width,`${scheme}-selection`);
        await patch({selection:null,lift:100});
        assert.equal(await page.evaluate(()=>atlasApp.renderer.deep.every(m=>m.userData.sourceColour)),true);await shot(width,`${scheme}-lift`);
        await patch({selection:{type:'structure',id:16}});assert.equal(await page.evaluate(()=>atlasApp.renderer.deep.find(m=>m.userData.structure.id===16).material.color.equals(atlasApp.renderer.deep.find(m=>m.userData.structure.id===16).userData.baseColor)),true);await shot(width,`${scheme}-deep-selection`);
      });
    }
    await reset('destrieux');
    await check(`${width}: label filtering, deep browsing, selection, and tab colour exceptions`,async()=>{
      await page.locator('#legend-filter').fill('precentral');assert.ok(await page.locator('.legend-row').count()<10);assert.ok(await page.locator('.legend-row').count()>1);await shot(width,'filtered-legend');await page.locator('#legend-filter').fill('');
      await page.locator('#legend-filter').fill('precentral');await patch({scheme:'yeo7'});assert.equal(await page.locator('#legend-filter').inputValue(),'');assert.equal(await page.locator('.legend-row').count(),8);await page.selectOption('#scheme','destrieux');
      await page.locator('#explore-tab').click();await page.getByRole('button',{name:'Explore Brainstem',exact:true}).click();await settle();
      assert.deepEqual(await page.evaluate(()=>atlasApp.renderer.deep.filter(m=>m.userData.sourceColour).map(m=>m.userData.structure.id)),[16]);await shot(width,'brainstem-browsed');
      await page.locator('#legend-tab').click();await settle();assert.equal(await page.evaluate(()=>atlasApp.renderer.deep.some(m=>m.userData.sourceColour)),false);
      await patch({selection:{type:'structure',id:16}});assert.deepEqual(await page.evaluate(()=>atlasApp.renderer.deep.filter(m=>m.userData.sourceColour).map(m=>m.userData.structure.id)),[16]);
      await patch({selection:null,lift:1});assert.equal(await page.evaluate(()=>atlasApp.renderer.deep.every(m=>m.userData.sourceColour)),true);
    });
    await reset('yeo17');
    await check(`${width}: source sulc shading toggles across all five corresponding morph states`,async()=>{
      for(const morph of [0,1,2,3,4]){
        await patch({morph,separation:morph===2?25:0});await page.evaluate(morph=>atlasApp.renderer.preset(morph===4?'flat':'lateral'),morph);await settle();
        await page.evaluate(()=>{const c=document.createElement('canvas'),source=atlasApp.renderer.renderer.domElement;c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);window.curvaturePixels=ctx.getImageData(0,0,c.width,c.height).data;window.curvatureProjection=atlasApp.renderer.camera.projectionMatrix.elements.slice();window.curvatureCamera=atlasApp.renderer.camera.matrixWorld.elements.slice();});
        const before=await page.locator('#stage canvas').screenshot();
        await displayOption('#curvature-shading',false);assert.equal(await page.evaluate(()=>atlasApp.renderer.uniforms.uCurvature.value),0);await shot(width,`curvature-off-${morph}`);
        const after=await page.locator('#stage canvas').screenshot();assert.notDeepEqual(before,after);
        const modulation=await page.evaluate(measureModulation);modulationResults.push({width,scheme:'yeo17',palette:'original',morph,...modulation});assert.equal(modulation.cameraUnchanged,true,JSON.stringify(modulation));assert.equal(modulation.projectionUnchanged,true);assert.ok(modulation.darker>50&&modulation.lighter>50,JSON.stringify(modulation));assert.equal(modulation.outside,0,JSON.stringify(modulation));assert.ok(modulation.maxChromaticityError<.012,JSON.stringify(modulation));
        await displayOption('#curvature-shading',true);assert.equal(await page.evaluate(()=>atlasApp.renderer.uniforms.uCurvature.value),1);await shot(width,`curvature-on-${morph}`);
      }
    });
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await writeBrowserReport('reports/appearance-tests.json',{passed:checks.length,checks,errors,networkRequests:requests,viewports:[[1920,1080],[1280,720]],screenshots,modulationResults,browser:await browser.version(),identifiedMesh:{name:'Brainstem',asegLabel:16,baselineOpacity:1,method:'Label-ID ray picks on the inferior visible mesh in the left lateral view.',fix:'Opaque, front-sided, matte warm-grey context material; source aseg colour during lift, direct selection, or explicit Structures browsing.'}});
}catch(error){await writeBrowserReport('reports/appearance-tests.json',{passed:checks.length,checks,errors,networkRequests:requests,screenshots,failure:String(error)});await writeBrowserFile('reports/appearance-failure.png',await page.screenshot());throw error;}finally{await browser.close();}
