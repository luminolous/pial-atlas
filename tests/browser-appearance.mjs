import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL==='bundled'?{}:{channel:process.env.BROWSER_CHANNEL||'chrome'})});
const context=await browser.newContext({offline:true,viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],requests=[],checks=[],screenshots=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
const settle=()=>page.waitForTimeout(950);
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
async function shot(width,name){const file=`appearance-${width}-${name}.png`;await page.screenshot({path:`reports/${file}`});screenshots.push(file);}
async function reset(scheme='dk'){
  await page.keyboard.press('Escape');await page.locator('#reset').click();await page.locator('#legend-tab').click();await page.selectOption('#scheme',scheme);await page.locator('[data-preset=lateral]').click();await page.mouse.move(10,10);await settle();
}
async function patch(value){await page.evaluate(value=>atlasApp.store.update(value),value);await settle();}
async function displayOption(selector,value){await page.locator('#display-toggle').click();await page.locator(selector).setChecked(value);await page.keyboard.press('Escape');await settle();}
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
      assert.deepEqual(await page.locator('.rail-label').allTextContents(),['Home','View','Display tools','Export']);
      const last=await page.locator('#export').boundingBox();assert.ok(last.y+last.height<height);
      await page.locator('#display-toggle').click();assert.equal(await page.locator('[data-material=anatomical]').getAttribute('aria-pressed'),'true');await shot(width,'display-options');await page.keyboard.press('Escape');
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
        await shot(width,`${scheme}-intact`);
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
        await shot(width,`${scheme}-accessible`);
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
        await page.evaluate(()=>{const c=document.createElement('canvas'),source=atlasApp.renderer.renderer.domElement;c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);window.curvaturePixels=ctx.getImageData(0,0,c.width,c.height).data;window.curvatureProjection=atlasApp.renderer.camera.projectionMatrix.elements.slice();});
        const before=await page.locator('#stage canvas').screenshot();
        await displayOption('#curvature-shading',false);assert.equal(await page.evaluate(()=>atlasApp.renderer.uniforms.uCurvature.value),0);await shot(width,`curvature-off-${morph}`);
        const after=await page.locator('#stage canvas').screenshot();assert.notDeepEqual(before,after);
        const modulation=await page.evaluate(()=>{
          const c=document.createElement('canvas'),source=atlasApp.renderer.renderer.domElement;c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const off=ctx.getImageData(0,0,c.width,c.height).data,on=window.curvaturePixels;
          let darker=0,lighter=0,outside=0;for(let i=c.width*4+4;i<off.length-c.width*4-4;i+=16){
            // Exclude raster boundary mixtures: HSL lightness is nonlinear under MSAA blending.
            if([-4,4,-c.width*4,c.width*4].some(offset=>[0,1,2].some(channel=>Math.abs(off[i+channel]-off[i+offset+channel])>10)))continue;
            const l=(Math.max(...off.slice(i,i+3))+Math.min(...off.slice(i,i+3)))/510,m=(Math.max(...on.slice(i,i+3))+Math.min(...on.slice(i,i+3)))/510;if(l<.15)continue;const ratio=m/l;if(ratio<.98)darker++;if(ratio>1.02)lighter++;if(ratio<.81||ratio>1.19)outside++;
          }
          return {darker,lighter,outside,projectionUnchanged:atlasApp.renderer.camera.projectionMatrix.elements.every((n,i)=>Math.abs(n-window.curvatureProjection[i])<1e-8)};
        });assert.equal(modulation.projectionUnchanged,true);assert.ok(modulation.darker>50&&modulation.lighter>50,JSON.stringify(modulation));assert.equal(modulation.outside,0,JSON.stringify(modulation));
        await displayOption('#curvature-shading',true);assert.equal(await page.evaluate(()=>atlasApp.renderer.uniforms.uCurvature.value),1);await shot(width,`curvature-on-${morph}`);
      }
    });
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await fs.writeFile('reports/appearance-tests.json',JSON.stringify({passed:checks.length,checks,errors,networkRequests:requests,viewports:[[1920,1080],[1280,720]],screenshots,browser:await browser.version(),identifiedMesh:{name:'Brainstem',asegLabel:16,baselineOpacity:1,method:'Label-ID ray picks on the inferior visible mesh in the left lateral view.',fix:'Opaque, front-sided, matte warm-grey context material; source aseg colour during lift, direct selection, or explicit Structures browsing.'}},null,2));
}catch(error){await fs.writeFile('reports/appearance-tests.json',JSON.stringify({passed:checks.length,checks,errors,networkRequests:requests,screenshots,failure:String(error)},null,2));await page.screenshot({path:'reports/appearance-failure.png'});throw error;}finally{await browser.close();}
