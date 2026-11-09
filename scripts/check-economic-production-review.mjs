import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
import {coupledReviewServer} from './coupled-review-server.mjs';
const out='artifacts/environment34-irrigation-economic-production';
const manifest=JSON.parse(await readFile(out+'/comparison.json','utf8'));
const server=await coupledReviewServer();let browser;
try {
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'/'+out+'/index.html');
 assert.equal(await page.locator('.world-link').count(),manifest.seeds.length);
 for(const seed of manifest.seeds){
  await page.goto(server.url+'/'+out+'/seed'+seed+'/index.html');
  await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
  assert.equal(await page.locator('#values tr').count(),2);
  assert.equal(await page.locator('#first tr').count(),1);
  for(const site of ['0','1','2']){
   await page.locator('#site').selectOption(site);
   for(const year of ['0','100','300','1000','2000','10000']){
    await page.locator('#scene-year').selectOption(year);
    await page.waitForFunction(()=>[...document.querySelectorAll('.scene')].every(i=>i.complete&&i.naturalWidth===320));
   }
  }
  for(const metric of ['harvest','reserve','coverage','people','total','imports','trade','moves','discarded']){
   await page.locator('#metric').selectOption(metric);
   assert.doesNotMatch(await page.locator('#values').innerText(),/NaN|undefined/);
  }
  await page.locator('#year').evaluate(e=>{e.value='10000';e.dispatchEvent(new Event('input'));});
  await page.locator('#window').selectOption('200');assert.equal(await page.locator('#year-label').innerText(),'10000年');
  await page.locator('#zoom').selectOption('4');assert.equal(await page.locator('.scene').first().evaluate(e=>e.style.width),'1280px');
  const links=await page.locator('a[download]').evaluateAll(es=>es.map(e=>e.href));assert.equal(links.length,2);
  for(const url of links)assert.equal((await page.request.get(url)).status(),200);
 }
 await page.locator('#metric').selectOption('harvest');await page.locator('#zoom').selectOption('1');
 await page.screenshot({path:out+'/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:out+'/mobile.png',fullPage:true});
 await page.goto(pathToFileURL(path.resolve(out+'/seed'+manifest.seeds[0]+'/index.html')).href);
 await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
 await page.waitForFunction(()=>[...document.querySelectorAll('.scene')].every(i=>i.complete&&i.naturalWidth===320));
 assert.deepEqual(errors,[]);
 await writeFile(out+'/browser-check.json',JSON.stringify({seeds:manifest.seeds,passed:true,checks:['two independent branches','three sites','six fixed scene years','nine metrics','year window','4x zoom','ten complete download links','mobile width','offline file page','no page errors']},null,2));
 console.log('Production comparison controls, recorded scenery, downloads, mobile layout and offline pages passed.');
} finally {await browser?.close();await server.close();}
