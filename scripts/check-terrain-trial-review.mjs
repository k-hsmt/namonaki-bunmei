import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
import {coupledReviewServer} from './coupled-review-server.mjs';
import {terrainReviewCase} from './terrain-trial-review-page.mjs';
const out='artifacts/environment34-terrain-trial',manifest=JSON.parse(await readFile(out+'/comparison.json','utf8')),httpOnly=process.argv.includes('--http-only');
const server=await coupledReviewServer();let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'/'+out+'/index.html');assert.equal(await page.locator('.world-link').count(),manifest.seeds.length);
 for(const seed of manifest.seeds){
  const d=JSON.parse(await readFile(out+`/seed${seed}/data.json`,'utf8'));
  await page.goto(server.url+`/${out}/seed${seed}/index.html`);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  assert.equal(await page.locator('#site').inputValue(),'1');assert.equal(await page.locator('#scene-year').inputValue(),String(d.first.terrain??0));
  assert.equal(await page.locator('#values tr').count(),2);
  for(let i=0;i<d.projects.length;i++){
   await page.locator('#project').selectOption(String(i));
   for(const [point,year]of [['before',d.projects[i].approvedYear],['after',d.projects[i].effectiveYear],['recovery',Math.min(10000,d.projects[i].effectiveYear+15)],['later',Math.min(10000,d.projects[i].effectiveYear+300)]]){
    await page.locator(`[data-point="${point}"]`).click();assert.equal(await page.locator('#scene-year').inputValue(),String(year));
    await page.waitForFunction(()=>[...document.querySelectorAll('.scene')].every(i=>i.complete&&i.naturalWidth===320));
    if(point==='before')assert.match(await page.locator('#use-label').innerText(),/まだ作用していません/);
    for(const layer of ['physical','changed','occupation','passage','vegetation','water']){
     await page.locator('#layer').selectOption(layer);
     await page.waitForFunction(()=>[...document.querySelectorAll('.analysis-scene')].every(i=>i.complete&&i.naturalWidth===320));
     assert.ok((await page.locator('#analysis-label').innerText()).startsWith(year+'年'));
    }
   }
  }
  for(const site of ['0','1','2']){await page.locator('#site').selectOption(site);for(const year of ['0','100','300','1000','2000','10000']){await page.locator('#scene-year').selectOption(year);await page.waitForFunction(()=>[...document.querySelectorAll('.scene')].every(i=>i.complete&&i.naturalWidth===320));}}
  for(const metric of ['harvest','reserve','coverage','people','total','imports','trade','moves','discarded']){await page.locator('#metric').selectOption(metric);assert.doesNotMatch(await page.locator('#values').innerText(),/NaN|undefined/);}
  await page.locator('#year').evaluate(e=>{e.value='10000';e.dispatchEvent(new Event('input'));});await page.locator('#window').selectOption('200');assert.equal(await page.locator('#year-label').innerText(),'10000年');
  await page.locator('#zoom').selectOption('4');assert.equal(await page.locator('.scene').first().evaluate(e=>e.style.width),'1280px');
  const links=await page.locator('a[download]').evaluateAll(es=>es.map(e=>e.href));assert.equal(links.length,2);for(const url of links)assert.equal((await page.request.get(url)).status(),200);
  assert.match(await page.locator('main').innerText(),/切り土試走の保存は通常画面では読み込めません/);
 }
 await page.locator('#site').selectOption('1');await page.locator('#project').selectOption('0');await page.locator('[data-point="after"]').click();await page.locator('#zoom').selectOption('1');
 await page.screenshot({path:out+'/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:out+'/mobile.png',fullPage:true});
 // Controlled presentation-only edge case; never presented as a natural zero-cut world.
 const empty=JSON.parse(await readFile(out+`/seed${manifest.seeds.at(-1)}/data.json`,'utf8'));empty.projects=[];empty.first.terrain=null;
 await page.goto(server.url+'/capture');
 await page.setContent(terrainReviewCase(empty).replace('<meta charset=',`<base href="${server.url}/${out}/seed${manifest.seeds.at(-1)}/"><meta charset=`));await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
 assert.equal(await page.locator('#project').innerText(),'成立なし');await page.locator('[data-point="after"]').click();assert.equal(await page.locator('#analysis-cards').isVisible(),false);
 if(!httpOnly){await page.goto(pathToFileURL(path.resolve(out+`/seed${manifest.seeds[0]}/index.html`)).href);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');await page.waitForFunction(()=>[...document.querySelectorAll('.scene')].every(i=>i.complete&&i.naturalWidth===320));}
 assert.deepEqual(errors,[]);await writeFile(out+'/browser-check.json',JSON.stringify({sourceSHA:manifest.sourceSHA,seeds:manifest.seeds,passed:true,offlineChecked:!httpOnly,checks:['two recorded branches','hill-side first cut as default','every project before/effective/+15/+300','six same-year physical/occupation/walk/ecology/water layers','three sites and fixed years','nine metrics','window and zoom','complete native downloads','mobile width','controlled zero-project presentation','no page errors']},null,2)+'\n');
 console.log(JSON.stringify({passed:true,seeds:manifest.seeds,offlineChecked:!httpOnly}));
}finally{await browser?.close();await server.close();}
