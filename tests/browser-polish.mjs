import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL==='bundled'?{}:{channel:process.env.BROWSER_CHANNEL||'chrome'})});
const context=await browser.newContext({offline:true,viewport:{width:1920,height:1080},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],requests=[],checks=[],screenshots=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
const settle=()=>page.waitForTimeout(900);
const rects=selectors=>page.evaluate(selectors=>Object.fromEntries(selectors.map(s=>[s,document.querySelector(s).getBoundingClientRect().toJSON()])),selectors);
const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
async function shot(width,name){const file=`reports/polish-${width}-${name}.png`;await page.screenshot({path:file});screenshots.push(file.replace('reports/',''));}
async function reset(){await page.locator('#reset').click();await page.locator('#explore-tab').click();await page.keyboard.press('Escape');await settle();}
async function setScheme(scheme){await page.locator('#legend-tab').click();await page.selectOption('#scheme',scheme);await settle();}
async function lastReachable(selector){
  return page.locator(selector).evaluate(el=>{el.scrollTop=el.scrollHeight;const row=[...el.querySelectorAll('.structure-row')].at(-1),a=el.getBoundingClientRect(),b=row.getBoundingClientRect();return {height:el.clientHeight,reachable:b.bottom<=a.bottom+1&&b.top>=a.top-1,scrollable:el.scrollHeight>el.clientHeight,scrollbar:getComputedStyle(el).overflowY};});
}
try{
  await page.goto(pathToFileURL(path.resolve('dist/Pial-Atlas.html')).href);
  await page.waitForFunction(()=>window.atlasApp?.ready||window.atlasError,null,{timeout:60000});assert.equal(await page.evaluate(()=>window.atlasError),undefined);await settle();
  await check('Pial Atlas branding, original shared SVG favicon, and removed decorative headings',async()=>{
    assert.equal(await page.title(),'Pial Atlas');assert.equal(await page.locator('.brand-mark svg').count(),1);
    const glyph=await page.evaluate(()=>({icon:decodeURIComponent(document.querySelector('link[rel=icon]').href.split(',')[1]),paths:[...document.querySelectorAll('.brand-mark path')].map(p=>p.getAttribute('d')),text:document.body.textContent}));
    for(const d of glyph.paths)assert.ok(glyph.icon.includes(d));assert.ok(glyph.icon.includes('currentColor'));
    assert.ok(!/Every fold has a place|The whole, and its parts|Population anatomy\. Many ways/.test(glyph.text));
  });
  for(const [width,height] of [[1920,1080],[1440,900],[1280,720]]){
    await page.setViewportSize({width,height});await reset();
    await check(`${width}×${height}: panels, visible footer, and anatomical framing`,async()=>{
      const r=await rects(['.structure-panel','.viewer-column','.camera-rail','#stage','.morph-panel','.visibility-tools']);
      for(const [a,b] of [['.structure-panel','.viewer-column'],['.viewer-column','.camera-rail'],['#stage','.morph-panel']])assert.equal(overlap(r[a],r[b]),false);
      assert.ok(r['.visibility-tools'].bottom<=height&&r['.visibility-tools'].top>=r['.structure-panel'].top);
      const framing=await page.evaluate(()=>{
        const a=atlasApp,r=a.renderer,c=r.camera,points=[];for(const mesh of [...r.cortices,...r.deep]){const pos=mesh.geometry.getAttribute('position');for(let i=0;i<pos.count;i+=5){const p=c.position.clone().fromBufferAttribute(pos,i).add(mesh.position).project(c);points.push(p.y);}}
        return {fraction:(Math.max(...points)-Math.min(...points))/2,overflow:document.documentElement.scrollWidth>innerWidth};
      });assert.ok(framing.fraction>.62&&framing.fraction<.78,JSON.stringify(framing));assert.equal(framing.overflow,false);
      await shot(width,'initial');
    });
    await check(`${width}×${height}: long legend is reachable with fixed selector and footer`,async()=>{
      await setScheme('destrieux');const bottom=await lastReachable('#legend-list');assert.ok(bottom.reachable&&bottom.scrollable);assert.equal(bottom.scrollbar,'scroll');
      await page.waitForTimeout(250);assert.ok(await page.locator('#legend-list').evaluate(el=>el.parentElement.classList.contains('can-scroll-up')));
      const r=await rects(['.scheme-control','#legend-list','.visibility-tools']);assert.ok(r['.scheme-control'].bottom<=r['#legend-list'].top);assert.ok(r['#legend-list'].bottom<=r['.visibility-tools'].top+1);await shot(width,'legend-bottom');
      await page.locator('#legend-list').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(250);assert.ok(await page.locator('#legend-list').evaluate(el=>el.parentElement.classList.contains('can-scroll-down')));
    });
    await check(`${width}×${height}: floating inspector scrolls with pinned actions and no toolbar collision`,async()=>{
      await page.evaluate(()=>{const p=atlasApp.atlas.parcels.find(p=>p.scheme==='destrieux'&&p.hemisphere==='lh'&&p.name.includes('Lateral occipitotemporal'));atlasApp.select({type:'parcel',id:p.id},{navigate:true});});await page.locator('#explore-tab').click();await settle();
      const r=await rects(['#inspector','.camera-rail','.inspector-body','.inspector-buttons','#stage']);assert.equal(overlap(r['#inspector'],r['.camera-rail']),false);assert.ok(r['#inspector'].bottom<=r['#stage'].bottom);assert.ok(r['.inspector-body'].bottom<=r['.inspector-buttons'].top+1);
      await page.locator('.inspector-body').evaluate(el=>el.scrollTop=el.scrollHeight);await shot(width,'inspector');
      await page.keyboard.press('Escape');assert.equal(await page.locator('#inspector').isVisible(),false);
      await page.evaluate(()=>atlasApp.select(atlasApp.store.state.selection));await settle();assert.equal(await page.locator('#inspector').isVisible(),true);await page.locator('#inspector-close').click();assert.equal(await page.locator('#inspector').isVisible(),false);
    });
    await check(`${width}×${height}: five corresponding surfaces and scheme transitions render`,async()=>{
      await reset();await setScheme('yeo17');await page.locator('#explore-tab').click();
      for(const [index,name] of ['pial','white','inflated','sphere','flat'].entries()){
        await page.locator('#morph').fill(String(index));await page.locator('#morph').dispatchEvent('input');await settle();await shot(width,name);
      }
    });
    await check(`${width}×${height}: display modes and slice controls stay clear of toolbar`,async()=>{
      await reset();await page.locator('#display-toggle').click();await settle();
      for(const mode of ['porcelain','wireframe','glass','anatomical']){await page.locator(`[data-material=${mode}]`).click();assert.ok(await page.locator(`[data-material=${mode}]`).evaluate(el=>el.classList.contains('active')));}
      let r=await rects(['#display-popover','.camera-rail','#stage','.morph-panel']);assert.equal(overlap(r['#display-popover'],r['.camera-rail']),false);assert.ok(r['#display-popover'].bottom<=r['#stage'].bottom);assert.equal(overlap(r['#display-popover'],r['.morph-panel']),false);await shot(width,'display');
      await page.locator('#slices-toggle').click();await page.locator('#clip-0').check();await settle();r=await rects(['#slices-popover','.camera-rail','#stage','.morph-panel']);assert.equal(overlap(r['#slices-popover'],r['.camera-rail']),false);assert.ok(r['#slices-popover'].bottom<=r['#stage'].bottom);assert.equal(overlap(r['#slices-popover'],r['.morph-panel']),false);await shot(width,'slices');await page.keyboard.press('Escape');
    });
    await check(`${width}×${height}: journey docking and subject remain in separate regions`,async()=>{
      await reset();await page.locator('#journey-start').click();
      for(let i=0;i<7;i++){
        await settle();const r=await rects(['#journey','#stage','.morph-panel']);assert.ok(r['#journey'].left-r['#stage'].left<20);assert.ok(r['#journey'].bottom<r['.morph-panel'].top-20);
        assert.equal(await page.locator('#inspector').isVisible(),false);
        const subject=await page.evaluate(step=>{
          const r=atlasApp.renderer,s=atlasApp.store.state,meshes=s.lift?[r.deep.find(m=>m.userData.structure.id===10)]:[0,6].includes(step)?[...r.cortices,...r.deep]:[r.cortices[0]],stage=document.querySelector('#stage').getBoundingClientRect();
          let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(const mesh of meshes){const point=r.camera.position.clone();for(let vertex=0;vertex<mesh.geometry.getAttribute('position').count;vertex+=3){mesh.getVertexPosition(vertex,point);point.add(mesh.position).project(r.camera);const x=stage.x+(point.x+1)*stage.width/2,y=stage.y+(1-point.y)*stage.height/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
          return {left,right,top,bottom};
        },i);
        assert.equal(overlap(subject,r['#journey']),false,JSON.stringify({i,subject,card:r['#journey']}));
        await shot(width,'journey-'+i);await page.locator('#journey-next').click();
      }
    });
    await check(`${width}×${height}: lifted meshes and group labels do not overlap`,async()=>{
      await reset();for(const value of [1,25,55,80,100]){await page.locator('#lift').fill(String(value));await page.locator('#lift').dispatchEvent('input');}await settle();
      const layout=await page.evaluate(()=>{
        const r=atlasApp.renderer,c=r.camera,stage=document.querySelector('#stage').getBoundingClientRect();
        const boxes=r.deep.map(m=>{m.geometry.computeBoundingBox();const b=m.geometry.boundingBox,points=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(c.position.clone().set(x,y,z).add(m.position).project(c));return {id:m.userData.structure.id,left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};});
        return {boxes,labels:[...document.querySelectorAll('.lift-label')].map(e=>e.getBoundingClientRect().toJSON()),stage:stage.toJSON()};
      });
      for(let i=0;i<layout.boxes.length;i++)for(let j=i+1;j<layout.boxes.length;j++){const a=layout.boxes[i],b=layout.boxes[j];assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`${a.id} intersects ${b.id}`);}
      assert.equal(layout.labels.length,7);for(let i=0;i<layout.labels.length;i++)for(let j=i+1;j<layout.labels.length;j++)assert.equal(overlap(layout.labels[i],layout.labels[j]),false);
      for(const label of layout.labels)assert.ok(label.left>=layout.stage.left&&label.right<=layout.stage.right&&label.top>=layout.stage.top&&label.bottom<=layout.stage.bottom);
      await shot(width,'lift');await page.locator('#return-position').click();await settle();assert.ok(await page.evaluate(()=>atlasApp.renderer.deep.every(m=>m.position.length()<.001)));
    });
  }
  await check('Short viewport heights retain access to the final structure and every footer action',async()=>{
    for(const height of [600,480]){await page.setViewportSize({width:1280,height});await reset();await setScheme('destrieux');const r=await lastReachable('#legend-list');assert.ok(r.reachable&&r.height>40,JSON.stringify(r));const boxes=await rects(['.visibility-tools','#reset','#undo','#restore']);for(const b of Object.values(boxes))assert.ok(b.top>0&&b.bottom<=height);await shot(`1280x${height}`,'reachability');}
  });
  await check('Reduced motion completes layouts, cameras, visibility, and shader cross-fades immediately',async()=>{
    await page.setViewportSize({width:1280,height:720});await page.emulateMedia({reducedMotion:'reduce'});await reset();
    await page.evaluate(()=>{atlasApp.store.update({morph:2,separation:66,scheme:'yeo7',hiddenGroups:['rh'],auto:true});atlasApp.renderer.preset('dorsal');});await page.waitForTimeout(100);
    const result=await page.evaluate(()=>({morph:atlasApp.renderer.morph,separation:atlasApp.renderer.separation,camera:!!atlasApp.renderer.cameraTween,fade:atlasApp.renderer.uniforms.uSchemeMix.value,right:atlasApp.renderer.cortices[1].visible,auto:atlasApp.renderer.controls.autoRotate,animation:getComputedStyle(document.querySelector('.tab-indicator')).transitionDuration}));
    assert.equal(result.morph,2);assert.equal(result.separation,66);assert.equal(result.camera,false);assert.equal(result.fade,1);assert.equal(result.right,false);assert.equal(result.auto,false);assert.ok(parseFloat(result.animation)<=.001);await shot(1280,'reduced-motion');
    await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('Camera and scheme controls expose shortcuts, tooltips, and active states',async()=>{
    await reset();await page.keyboard.press('3');await settle();assert.ok(await page.locator('[data-preset=dorsal]').evaluate(el=>el.classList.contains('active')));
    await page.locator('[data-preset=lateral]').hover();assert.match(await page.locator('#tool-tooltip').textContent(),/\(1\)/);
    assert.ok(await page.locator('.camera-rail button span').evaluateAll(els=>els.every(e=>parseFloat(getComputedStyle(e).fontSize)>=11)));
  });
  await check('Secondary text meets WCAG AA contrast in navigation, inspector, and controls',async()=>{
    await reset();await page.evaluate(()=>atlasApp.select({type:'structure',id:10}));await settle();
    const failures=await page.evaluate(()=>{
      const selectors=['.eyebrow','.brand-caption','.nav-description','.row-name small','.panel-footer','.visibility-line','.stage-badges span','.inspector-body dt','.inspector-body dd','.viewer-footer>span','.layout-sliders label span','.camera-rail button span'];
      const rgb=value=>{const numbers=value.match(/[\d.]+/g)?.map(Number)||[];return {c:numbers.slice(0,3),a:numbers[3]??1};};
      const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const bad=[];for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
        if(!el.getClientRects().length)continue;const style=getComputedStyle(el);let parent=el,background=[255,255,255];
        while(parent){const value=rgb(getComputedStyle(parent).backgroundColor);if(value.a>=.95){background=value.c;break;}parent=parent.parentElement;}
        const foreground=rgb(style.color).c,a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        if(ratio<4.5)bad.push({selector,text:el.textContent,ratio});
      }return bad;
    });assert.deepEqual(failures,[]);
  });
  await check('Selection preserves palette RGB and hidden labels retain a faded categorical mask',async()=>{
    await reset();const result=await page.evaluate(async()=>{
      const a=atlasApp,p=a.atlas.parcels.find(p=>p.scheme==='dk'&&p.hemisphere==='lh'&&p.nativeName==='precentral'),data=a.renderer.palette.image.data;
      const before=Array.from(data.slice(p.id*4,p.id*4+3));a.select({type:'parcel',id:p.id});a.store.toggle('hiddenParcels',p.id);
      await new Promise(resolve=>setTimeout(resolve,400));return {before,after:Array.from(data.slice(p.id*4,p.id*4+3)),alpha:data[p.id*4+3],mask:a.renderer.uniforms.uHasHidden.value};
    });assert.deepEqual(result.before,result.after);assert.equal(result.alpha,0);assert.equal(result.mask,true);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await fs.writeFile('reports/polish-tests.json',JSON.stringify({passed:checks.length,checks,errors,networkRequests:requests,viewports:[[1920,1080],[1440,900],[1280,720]],screenshots,browser:await browser.version()},null,2));
}catch(error){await page.screenshot({path:'reports/polish-failure.png'});await fs.writeFile('reports/polish-tests.json',JSON.stringify({passed:checks.length,checks,errors,failure:String(error)},null,2));console.error(error);console.error(errors);process.exitCode=1;}
finally{await browser.close();}
