import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit,devices} from 'playwright';
let server,origin;const browsers={};
test.before(async()=>{
 server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.replace(/^\/namonaki-bunmei\//,'');if(name.startsWith('/')||name.includes('..'))throw Error();const file=name||'index.html';const bytes=await readFile(path.join('dist',file));res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp3':'audio/mpeg'}[path.extname(file)]??'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/namonaki-bunmei/`;
 browsers.chromium=await chromium.launch();browsers.webkit=await webkit.launch({executablePath:process.env.WEBKIT_EXECUTABLE_PATH});
});
test.after(async()=>{await Promise.all(Object.values(browsers).map(b=>b.close()));await new Promise(resolve=>server.close(resolve));});
async function open(t,engine,options={}){
 const page=await browsers[engine].newPage(options);t.after(()=>page.close());
 await page.addInitScript(()=>{
  window.audioTest={sources:[]};
  const createGain=AudioContext.prototype.createGain,createSource=AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createGain=function(){const gain=createGain.call(this),analyser=this.createAnalyser();gain.connect(analyser);Object.assign(window.audioTest,{context:this,gain,analyser});return gain;};
  AudioContext.prototype.createBufferSource=function(){const source=createSource.call(this),record={source,started:false,ended:false,stopped:false};window.audioTest.sources.push(record);const start=source.start.bind(source),stop=source.stop.bind(source);source.start=(...args)=>{record.started=true;return start(...args);};source.stop=(...args)=>{record.stopped=true;return stop(...args);};source.addEventListener('ended',()=>record.ended=true);return source;};
 });
 await page.goto(origin);await page.waitForSelector('#headline:not(:empty)');return page;
}
for(const [engine,name,options] of [['chromium','desktop',{}],['chromium','mobile',devices['Pixel 7']],['webkit','desktop',{}],['webkit','iPhone',devices['iPhone 13']]])test(`${engine} ${name}: gesture playback, audible signal, volume, loop, stop and silent reload`,async t=>{
 const page=await open(t,engine,options),errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal(await page.evaluate(()=>!!window.audioTest.context),false);
 assert.equal(await page.locator('#music-toggle').textContent(),'BGM ▷');assert.equal(await page.locator('.music-control').textContent(),'BGM ▷音量');assert.equal(await page.locator('.scene-controls #scene-motion').count(),1);assert.equal(await page.locator('.scene-controls #music-toggle').count(),1);
 await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('feedback').textContent.length>0);
 const before=await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).filter(([k])=>!k.includes(':music:'))));const year=await page.locator('#year').textContent();
 const response=await page.request.get(origin+'assets/audio/namonaki_asa_v3.mp3');assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/audio\/mpeg/);assert.equal((await response.body()).length,1262070);
 await page.locator('#music-toggle').click();
 await page.waitForFunction(()=>{const a=window.audioTest;if(!a.sources[0]?.started)return false;const values=new Uint8Array(a.analyser.fftSize);a.analyser.getByteTimeDomainData(values);return values.some(v=>Math.abs(v-128)>2);});
 assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'),'true');
 await page.locator('#music-volume').fill('17');await page.waitForFunction(()=>Math.abs(window.audioTest.gain.gain.value-.17)<.002);
 // Advance the ORIGINAL full buffer over two boundaries without a 2-minute wait.
 assert.equal(await page.evaluate(()=>window.audioTest.sources[0].source.loop),true);
 await page.evaluate(()=>{window.audioTest.sources[0].source.playbackRate.value=200;});await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>window.audioTest.sources[0].ended),false);
 await page.reload();await page.waitForSelector('#headline:not(:empty)');assert.equal(await page.evaluate(()=>!!window.audioTest.context),false);assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#music-volume').inputValue(),'17');
 await page.locator('#music-toggle').click();await page.waitForFunction(()=>window.audioTest.sources[0]?.started);await page.locator('#music-toggle').click();assert.equal(await page.evaluate(()=>window.audioTest.sources[0].stopped),true);
 assert.equal(await page.locator('#year').textContent(),year);assert.equal(await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).filter(([k])=>!k.includes(':music:')))),before);
 assert.equal(await page.locator('.scene-controls').evaluate(e=>e.scrollWidth<=e.clientWidth),true);assert.deepEqual(errors,[]);
});
for(const engine of ['chromium','webkit']){
 test(`${engine}: storage denial and download failure permit retry`,async t=>{
  const page=await open(t,engine);await page.evaluate(()=>{for(const method of ['getItem','setItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(key.includes(':music:'))throw Error('denied');return original.call(this,key,...args);};}});
  await page.route('**/*.mp3',r=>r.abort());await page.locator('#music-toggle').click();await page.waitForFunction(()=>document.getElementById('music-status').textContent.includes('再生できません'));assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#step').isEnabled(),true);
  await page.unroute('**/*.mp3');await page.locator('#music-toggle').click();await page.waitForFunction(()=>window.audioTest.sources[0]?.started);
 });
 test(`${engine}: stop during download cannot start stale playback`,async t=>{
  const page=await open(t,engine);let release;const gate=new Promise(resolve=>release=resolve);let fetched;const requested=new Promise(resolve=>fetched=resolve);
  await page.route('**/*.mp3',async route=>{fetched();await gate;await route.fulfill({body:await readFile('assets/audio/namonaki_asa_v3.mp3'),contentType:'audio/mpeg'});});
  await page.locator('#music-toggle').click();await requested;await page.locator('#music-toggle').click();release();await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.audioTest.sources.length),0);assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('#music-toggle').click();await page.waitForFunction(()=>window.audioTest.sources[0]?.started);
 });
}

for(const engine of ['chromium','webkit']){
 test(`${engine}: stale unversioned CSS/modules cannot affect a new release`,async t=>{
  const page=await browsers[engine].newPage(devices[engine==='webkit'?'iPhone 13':'Pixel 7']);t.after(()=>page.close());page.setDefaultTimeout(30000);
  const staleRequests=[],releaseRequests=[];page.on('request',req=>{if(/\.(js|css|mp3)$/.test(new URL(req.url()).pathname))releaseRequests.push(req.url());});
  // Model the incompatible old files still in a browser cache at stable URLs.
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.pathname==='/namonaki-bunmei/assets/style.css'||/^\/namonaki-bunmei\/[^/]+\.js$/.test(url.pathname)){staleRequests.push(url.pathname);await route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:url.pathname.endsWith('.css')?'input{width:110px}.scene-topline{display:flex}':'throw Error("stale cached module");'});}else await route.continue();});
  await page.goto(origin);await page.waitForSelector('#headline:not(:empty)');await page.waitForSelector('#music-toggle[aria-label]');await page.locator('#music-toggle').click();await page.waitForFunction(()=>document.getElementById('music-status').textContent==='');
  assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'),'true');assert.deepEqual(staleRequests,[]);assert.ok(releaseRequests.length>10);
  const versions=new Set(releaseRequests.map(url=>{const match=url.match(/\/releases\/([a-f0-9]{16})\//);assert.ok(match,url);return match[1];}));assert.equal(versions.size,1);
  const layout=await page.evaluate(()=>{const frame=document.querySelector('.scene-topline').getBoundingClientRect(),controls=document.querySelector('.scene-controls').getBoundingClientRect(),checkbox=document.getElementById('scene-motion').getBoundingClientRect(),range=document.getElementById('music-volume').getBoundingClientRect(),label=document.querySelector('.music-control label').getBoundingClientRect();const canvas=document.getElementById('scene'),pixels=canvas.getContext('2d').getImageData(0,0,320,180).data;return {checkbox:checkbox.width,range:range.width,sameRow:Math.abs(range.y+range.height/2-(label.y+label.height/2))<3,within:controls.left>=frame.left&&controls.right<=frame.right+1,colors:new Set(Array.from({length:320*180},(_,i)=>`${pixels[i*4]},${pixels[i*4+1]},${pixels[i*4+2]}`)).size};});
  assert.equal(layout.checkbox,17);assert.equal(layout.range,64);assert.equal(layout.sameRow,true);assert.equal(layout.within,true);assert.ok(layout.colors>20);
  await page.setViewportSize({width:320,height:700});assert.equal(await page.locator('.scene-controls').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
 });
 test(`${engine}: failed BGM module cannot prevent world startup or progression`,async t=>{
  const page=await browsers[engine].newPage();t.after(()=>page.close());page.setDefaultTimeout(30000);await page.route('**/music.js',r=>r.abort());await page.goto(origin);await page.waitForSelector('#headline:not(:empty)');await page.waitForFunction(()=>document.getElementById('music-status').textContent.includes('準備できません'));
  const before=await page.locator('#year').textContent();await page.locator('#step').click();await page.waitForFunction(year=>document.getElementById('year').textContent!==year,before);
 });
}
