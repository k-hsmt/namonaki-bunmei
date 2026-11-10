import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createNewEconomicWorld,createNewTerrainWorld} from '../../dist/story/new-world.js';
import {advanceEconomicProductionWorld} from '../../dist/irrigation/economic-production-progression-v1.js';
import {createTerrainTrial} from '../../dist/terrain/terrain-trial-progression-v1.js';
import {prepareTerrainTrialSave} from '../../dist/terrain/terrain-trial-storage-v1.js';
import {advanceTerrainProductionWorld} from '../../dist/terrain/terrain-production-progression-v1.js';
import {economicProductionSession,terrainProductionSession,prepareWorldSessionSave,advanceWorldSessionAsync,chooseWorldSessionAsync} from '../../dist/story/world-session.js';
import {encodeWorldSave,decodeWorldSave} from '../../dist/story/world-storage.js';

const v7=await createNewEconomicWorld(42),initial=await createNewTerrainWorld(42),old=economicProductionSession(advanceEconomicProductionWorld(v7.review,575,'automatic')),world=terrainProductionSession(await advanceTerrainProductionWorld(initial.review,700,'automatic')),pending=terrainProductionSession(await advanceTerrainProductionWorld(initial.review,1000,'stop')),limit=economicProductionSession(advanceEconomicProductionWorld(v7.review,10000,'automatic'));
const wire=async s=>(await encodeWorldSave(await prepareWorldSessionSave(s))).json,oldWire=await wire(old),normalWire=await wire(world),pendingWire=await wire(pending),limitWire=await wire(limit),trialWire=JSON.stringify(await prepareTerrainTrialSave(await createTerrainTrial(v7.review)));
const KEY='namonaki-story-v8',OLD='namonaki-story-v7',port='5372',origin='http://127.0.0.1:'+port;
let server,browser;
test.before(async()=>{server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});});
test.after(async()=>{await browser?.close();server?.kill();});
const feedback=(p,text)=>p.waitForFunction(text=>document.getElementById('feedback').textContent.includes(text),text),pixels=p=>p.locator('#scene').evaluate(c=>c.toDataURL());
const ready=p=>p.waitForFunction(()=>!document.getElementById('save').disabled);
async function pageFor(t,{raw=null,quota=false,motion=false,beforeNavigate=null}={}){
 const p=await browser.newPage({reducedMotion:motion?'no-preference':'reduce',viewport:{width:390,height:844}});t.after(()=>p.close());const errors=[];p.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await p.addInitScript(({raw,quota,oldWire})=>{const write=Storage.prototype.setItem;write.call(localStorage,'namonaki-story-v7',oldWire);if(raw!==null)write.call(localStorage,'namonaki-story-v8',raw);if(quota)Storage.prototype.setItem=function(k,v){if(k.startsWith('namonaki-story-v'))throw new DOMException('controlled quota','QuotaExceededError');return write.call(this,k,v);};},{raw,quota,oldWire});
 if(beforeNavigate)await beforeNavigate(p);await p.goto(origin);await feedback(p,raw==='broken-v8'?'記録を準備できませんでした':'保存された歴史を開きました');return p;
}
async function exported(p){const waiting=p.waitForEvent('download');await p.locator('#export').click();const file=await waiting;await ready(p);return decodeWorldSave(await readFile(await file.path(),'utf8'));}
async function rewind(p,year){await p.locator('#rewind-year').evaluate((e,y)=>{e.value=String(y);e.dispatchEvent(new Event('input',{bubbles:true}));},year);}
async function imported(p,raw){await p.locator('#import-file').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(raw)});await feedback(p,'記録ファイルを開きました');}

test('old v7 opts in from its confirmed year, keeps old pixels and keys, and reloads the saved v8',async t=>{
 const p=await pageFor(t);assert.equal((await exported(p)).version,7);
 await p.locator('#site-select').selectOption('1');await rewind(p,100);const before=await pixels(p);
 await p.locator('#enable-terrain').click();await feedback(p,'これからの丘陵に整地');assert.equal(await pixels(p),before);assert.match(await p.locator('#site-terrain').textContent(),/始める前/);assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),null);
 await p.locator('#save').click();await feedback(p,'ブラウザに保存しました');const saved=await p.evaluate(k=>localStorage.getItem(k),KEY);assert.equal((await decodeWorldSave(saved)).version,8);assert.equal(await p.evaluate(k=>localStorage.getItem(k),OLD),oldWire);
 // Reload the actual saved key, rather than reseeding it with the setup fixture.
 await p.context().clearCookies();await p.reload();await feedback(p,'保存された歴史を開きました');await p.locator('#site-select').selectOption('1');await rewind(p,100);assert.equal(await pixels(p),before);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});
test('normal year-filtered ground status and motion preserve the stored world',async t=>{
 const p=await pageFor(t,{raw:normalWire});await p.locator('#site-select').selectOption('1');
 for(const [year,pattern]of [[99,/整地 0件/],[100,/翌年から使える平場 1件/],[101,/整地 1件/],[700,/整地 2件/]]){await rewind(p,year);assert.match(await p.locator('#site-terrain').textContent(),pattern);}
 await p.locator('#site-select').selectOption('0');assert.equal(await p.locator('#site-terrain').isVisible(),false);await p.locator('#site-select').selectOption('1');await rewind(p,101);
 await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForFunction(()=>{const c=document.getElementById('scene-motion');return !c.disabled&&c.checked;});const before=await pixels(p),year=await p.locator('#scene-year').textContent();await p.waitForTimeout(600);assert.notEqual(await pixels(p),before);assert.equal(await p.locator('#scene-year').textContent(),year);assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),normalWire);
 await mkdir('artifacts/environment34-terrain-ui-tests',{recursive:true});await p.screenshot({path:'artifacts/environment34-terrain-ui-tests/mobile-v8.png',fullPage:true});
});
test('manual and automatic choice share one async commit; busy operations cannot start a second writer',async t=>{
 const p=await pageFor(t,{raw:pendingWire,beforeNavigate:async p=>{
  await p.route('**/terrain-production-progression-v1.js',async route=>{const response=await route.fetch(),source=await response.text(),changed=source.replace(/export async function chooseTerrainProductionWorld\([^\n]+\) \{/,'$& window.choiceCalls=(window.choiceCalls??0)+1; await new Promise(r=>setTimeout(r,200));');assert.notEqual(changed,source,'async guard must be installed');await route.fulfill({response,body:changed});});
 }});
 const chosen=await chooseWorldSessionAsync(pending,0);await p.locator('#options .option').first().click();
 await p.evaluate(()=>{document.querySelector('#options .option')?.dispatchEvent(new MouseEvent('click'));document.getElementById('step').dispatchEvent(new MouseEvent('click'));document.getElementById('random').dispatchEvent(new MouseEvent('click'));});await ready(p);
 assert.equal(await p.evaluate(()=>window.choiceCalls),1);assert.equal((await exported(p)).payloadHash,(await prepareWorldSessionSave(chosen)).payloadHash);
 await p.locator('#step').click();await ready(p);assert.equal((await exported(p)).payloadHash,(await prepareWorldSessionSave(await advanceWorldSessionAsync(chosen))).payloadHash);
 // Automatic choice uses the same guarded path, then pauses before another year.
 await imported(p,pendingWire);await p.locator('#auto-choice').check();await p.locator('#auto-delay').selectOption('2');await p.locator('#speed').selectOption('slow');await p.locator('#play').click();await p.waitForFunction(()=>window.choiceCalls===2);await ready(p);await p.locator('#play').click();
 assert.equal((await exported(p)).payloadHash,(await prepareWorldSessionSave(await chooseWorldSessionAsync(pending,'random'))).payloadHash);
});
test('invalid normal/trial import preserves displayed and saved worlds; valid older import switches priority only after save',async t=>{
 const p=await pageFor(t,{raw:normalWire}),before=await pixels(p);
 for(const raw of ['{broken',trialWire]){await p.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(raw)});await feedback(p,'この記録ファイルを開けませんでした');assert.equal(await pixels(p),before);assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),normalWire);}
 await imported(p,oldWire);assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),normalWire);await p.locator('#save').click();await feedback(p,'ブラウザに保存しました');assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),null);assert.equal((await decodeWorldSave(await p.evaluate(k=>localStorage.getItem(k),OLD))).version,7);
});
test('quota failure keeps both stored keys and permits complete older JSON export',async t=>{
 const p=await pageFor(t,{raw:normalWire,quota:true});await imported(p,oldWire);await p.locator('#save').click();await feedback(p,'JSONを書き出して保存できます');assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),normalWire);assert.equal(await p.evaluate(k=>localStorage.getItem(k),OLD),oldWire);assert.equal((await exported(p)).payloadHash,(await decodeWorldSave(oldWire)).payloadHash);
});
test('corrupt v8 stops old fallback; native import recovers with producers unavailable and no key writes',async t=>{
 const p=await pageFor(t,{raw:'broken-v8',beforeNavigate:async p=>{await p.route('**/*',r=>/world-prototype|new-world\.js|capture-terrain/.test(r.request().url())?r.abort():r.continue());}});assert.equal(await p.locator('#step').isDisabled(),true);
 await p.locator('#import-file').setInputFiles({name:'normal.json',mimeType:'application/json',buffer:Buffer.from(normalWire)});await feedback(p,'文明の記録を開きました');assert.equal((await exported(p)).payloadHash,(await decodeWorldSave(normalWire)).payloadHash);assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),'broken-v8');assert.equal(await p.evaluate(k=>localStorage.getItem(k),OLD),oldWire);
});
test('v7 at the observation limit cannot adopt terrain',async t=>{
 const p=await pageFor(t);await imported(p,limitWire);assert.equal(await p.locator('#enable-terrain').isDisabled(),true);assert.match(await p.locator('#terrain-note').textContent(),/観測上限/);assert.equal((await exported(p)).version,7);
});
