import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,devices} from 'playwright';
let server,browser,origin;
test.before(async()=>{
 server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.replace(/^\/namonaki-bunmei\//,'');if(name.startsWith('/')||name.includes('..'))throw Error();const file=name||'index.html';const bytes=await readFile(path.join('dist',file));res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp3':'audio/mpeg'}[path.extname(file)]??'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/namonaki-bunmei/`;
 browser=await chromium.launch();
});
test.after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
for(const [name,options] of [['desktop',{}],['mobile',devices['Pixel 7']]])test(`${name}: original recording, user gesture, gain, loop, stop and silent reload under Pages base path`,async t=>{
 const page=await browser.newPage(options);t.after(()=>page.close());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const create=AudioContext.prototype.createGain;AudioContext.prototype.createGain=function(){return window.testGain=create.call(this);};});
 await page.goto(origin);await page.waitForSelector('#headline:not(:empty)');
 const state=()=>page.evaluate(()=>{const a=document.getElementById('music');return {paused:a.paused,time:a.currentTime,loop:a.loop,volume:document.getElementById('music-volume').value};});
 assert.deepEqual(await state(),{paused:true,time:0,loop:true,volume:'30'});
 await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('feedback').textContent.length>0);
 const before=await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).filter(([k])=>!k.includes(':music:'))));const year=await page.locator('#year').textContent();
 const response=await page.request.get(origin+'assets/audio/namonaki_asa_v3.mp3');assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/audio\/mpeg/);assert.equal((await response.body()).length,1262070);
 await page.locator('#music-toggle').click();await page.waitForFunction(()=>document.getElementById('music').currentTime>.15);
 assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'),'true');
 await page.locator('#music-volume').fill('17');await page.waitForFunction(()=>Math.abs(window.testGain.gain.value-.17)<.002);
 await page.evaluate(()=>{const a=document.getElementById('music');a.currentTime=a.duration-.25;});await page.waitForFunction(()=>document.getElementById('music').currentTime<2);assert.equal((await state()).paused,false);
 await page.reload();await page.waitForSelector('#headline:not(:empty)');assert.deepEqual(await state(),{paused:true,time:0,loop:true,volume:'17'});
 await page.locator('#music-toggle').click();await page.waitForFunction(()=>document.getElementById('music').currentTime>.1);await page.locator('#music-toggle').click();assert.equal((await state()).paused,true);assert.equal((await state()).time,0);
 assert.equal(await page.locator('#year').textContent(),year);assert.equal(await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).filter(([k])=>!k.includes(':music:')))),before);
 assert.equal(await page.locator('.music-control').evaluate(e=>e.scrollWidth<=e.clientWidth),true);assert.deepEqual(errors,[]);
});
test('storage denial and audio network failure leave simulation controls available',async t=>{
 const page=await browser.newPage();t.after(()=>page.close());await page.addInitScript(()=>{for(const method of ['getItem','setItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(key.includes(':music:'))throw Error('denied');return original.call(this,key,...args);};}});
 await page.route('**/*.mp3',r=>r.abort());await page.goto(origin);await page.waitForSelector('#headline:not(:empty)');await page.locator('#music-toggle').click();await page.waitForFunction(()=>document.getElementById('music-status').textContent.length>0);assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#step').isEnabled(),true);
 await page.unroute('**/*.mp3');await page.locator('#music-toggle').click();await page.waitForFunction(()=>document.getElementById('music').currentTime>.1);
});
