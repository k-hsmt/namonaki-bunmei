/** Record the real, unchanged normal application, not a second scene implementation. */
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {decodeWorldSave} from '../dist/story/world-storage.js';
const out='artifacts/environment34-terrain-production',wire=await readFile(out+'/seed42-v8.json','utf8'),packet=await decodeWorldSave(wire),audit=JSON.parse(await readFile(out+'/audit.json','utf8')),port=process.env.TERRAIN_UI_PORT??'5373',origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'no-preference',recordVideo:{dir:out+'/video',size:{width:1280,height:900}}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(wire=>{localStorage.setItem('namonaki-story-v8',wire);},wire);await page.goto(origin);await page.waitForFunction(()=>!document.getElementById('save').disabled);await page.locator('#site-select').selectOption('1');await page.locator('#scene-motion').check();
 const frames=[];
 for(const year of [100,101,116,1000]){
  await page.locator('#rewind-year').evaluate((e,year)=>{e.value=String(year);e.dispatchEvent(new Event('input',{bubbles:true}));},year);await page.locator('.scene-frame').scrollIntoViewIfNeeded();await page.waitForTimeout(1600);
  const text=await page.locator('#site-terrain').innerText();assert.match(text,/丘陵の整地/);frames.push({year,status:text});await page.screenshot({path:out+`/normal-ui-year${year}.png`});
 }
 const before=await page.locator('#scene-year').innerText();await page.waitForTimeout(500);assert.equal(await page.locator('#scene-year').innerText(),before);assert.equal(await page.evaluate(()=>localStorage.getItem('namonaki-story-v8')),wire);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/normal-ui-mobile.png',fullPage:true});
 // Re-export through the actual asynchronous UI; the full native packet must be identical.
 const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download;assert.equal((await decodeWorldSave(await readFile(await file.path(),'utf8'))).payloadHash,packet.payloadHash);
 const video=page.video();await page.close();if(video)await copyFile(await video.path(),out+'/terrain-review.webm');assert.deepEqual(errors,[]);
 await writeFile(out+'/normal-ui-check.json',JSON.stringify({sourceSHA:audit.sourceSHA,seed:42,version:8,frames,motionKeepsObservedYear:true,exportExact:true,storedBytesUnchanged:true,mobileWidth:true,passed:true},null,2)+'\n');console.log(JSON.stringify({passed:true,frames:frames.length,exportExact:true}));
}finally{await browser?.close();server.kill();}
