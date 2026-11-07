import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
import {createNewWorld} from '../../dist/story/new-world.js';import {generatedSession,saveWorldSession} from '../../dist/story/world-session.js';import {advanceGeneratedBridgeReview} from '../../dist/story/generated-bridge-review.js';import {encodeWorldSave,decodeWorldSave} from '../../dist/story/world-storage.js';import {serializeWorldSave} from '../../dist/story/world-save.js';import {createHousingCivilization} from '../../dist/story/housing-persistence.js';
const original=createNewWorld(6),session=generatedSession(advanceGeneratedBridgeReview(original.review,2000,'automatic')),save=saveWorldSession(session),encoded=(await encodeWorldSave(save)).json,plain=serializeWorldSave(save),old=JSON.stringify(createHousingCivilization(42)),origin='http://127.0.0.1:5307';let server,browser;
test.before(async()=>{server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5307'},stdio:['ignore','pipe','inherit']});await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});});
test.after(async()=>{await browser?.close();server?.kill();});
async function pageFor(t,{corrupt=false,quota=false,block=false}={}){
 const page=await browser.newPage();t.after(()=>page.close());const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.addInitScript(({encoded,old,corrupt,quota})=>{const write=Storage.prototype.setItem;write.call(localStorage,'namonaki-story-v5',corrupt?'broken-v5':encoded);write.call(localStorage,'namonaki-story-v4',old);
  if(quota)Storage.prototype.setItem=function(key,value){if(key==='namonaki-story-v5')throw new DOMException('controlled quota','QuotaExceededError');return write.call(this,key,value);};
 },{encoded,old,corrupt,quota});
 if(block)await page.route('**/*',r=>{const p=new URL(r.request().url()).pathname;return p.includes('prototype')||p.includes('/capture-terrain')||p.endsWith('/new-world.js')?r.abort():r.continue();});
 await page.goto(origin);await page.waitForFunction(()=>!document.getElementById('load').disabled);return page;
}
const png=p=>p.locator('#scene').evaluate(c=>c.toDataURL());
const feedback=async(p,text)=>p.waitForFunction(text=>document.getElementById('feedback').textContent.includes(text),text);
const rewind=(p,year)=>p.locator('#rewind-year').evaluate((e,y)=>{e.value=String(y);e.dispatchEvent(new Event('input',{bubbles:true}));},year);
test('production UI cold-loads saved terrain without generators, preserves past scenes and exports complete JSON',async t=>{
 const p=await pageFor(t,{block:true});await feedback(p,'保存された歴史を開きました');const current=await png(p);
 await rewind(p,755);const past=await png(p);assert.notEqual(past,current);await p.locator('#site-select').selectOption('1');const hill=await png(p);assert.notEqual(hill,past);
 await p.locator('#save').click();await feedback(p,'ブラウザに保存しました');const stored=await decodeWorldSave(await p.evaluate(()=>localStorage.getItem('namonaki-story-v5')));assert.deepEqual(stored.state,session.state);
 const download=p.waitForEvent('download');await p.locator('#export').click();const file=await download,restored=await decodeWorldSave(await readFile(await file.path(),'utf8'));assert.deepEqual(restored.state,session.state);
 await p.reload();await feedback(p,'保存された歴史を開きました');await p.locator('#site-select').selectOption('1');await rewind(p,755);assert.equal(await png(p),hill);
 assert.equal(await p.evaluate(()=>localStorage.getItem('namonaki-story-v4')),old);
});
test('failed generation and invalid import keep the displayed world and both save values',async t=>{
 const p=await pageFor(t,{block:true});await feedback(p,'保存された歴史を開きました');const before=await png(p),stored=await p.evaluate(()=>localStorage.getItem('namonaki-story-v5'));
 await p.locator('#seed').fill('7');await p.locator('#restart').click();await feedback(p,'新しい文明を作れませんでした');assert.equal(await png(p),before);
 await p.locator('#import-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('broken')});await feedback(p,'記録ファイルを開けませんでした');assert.equal(await png(p),before);
 assert.equal(await p.evaluate(()=>localStorage.getItem('namonaki-story-v5')),stored);assert.equal(await p.evaluate(()=>localStorage.getItem('namonaki-story-v4')),old);
});
test('native quota failure retains values and the complete current world remains exportable',async t=>{
 const p=await pageFor(t,{quota:true});await feedback(p,'保存された歴史を開きました');const before=await png(p);
 await p.locator('#save').click();await feedback(p,'JSONを書き出して保存できます');assert.equal(await png(p),before);assert.equal(await p.evaluate(()=>localStorage.getItem('namonaki-story-v5')),encoded);assert.equal(await p.evaluate(()=>localStorage.getItem('namonaki-story-v4')),old);
 const wait=p.waitForEvent('download');await p.locator('#export').click();const file=await wait;assert.deepEqual((await decodeWorldSave(await readFile(await file.path(),'utf8'))).state,session.state);
});
test('a corrupt cold-start v5 stops fallback and a valid file recovers without a generator or storage write',async t=>{
 const p=await pageFor(t,{corrupt:true,block:true});await feedback(p,'記録を準備できませんでした');assert.equal(await p.locator('#step').isDisabled(),true);
 await p.locator('#import-file').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(plain)});await feedback(p,'文明の記録を開きました');assert.equal(await p.locator('#step').isEnabled(),true);
 assert.match(await p.locator('#year').textContent(),/2,000/);assert.equal(await p.evaluate(()=>localStorage.getItem('namonaki-story-v5')),'broken-v5');assert.equal(await p.evaluate(()=>localStorage.getItem('namonaki-story-v4')),old);
});
test('saved organic v2 can opt into cross-river growth without moving the present or changing its saved history',async t=>{
 const oldSession=createNewWorld(42,'terrain-placement-v2'),oldSave=saveWorldSession(oldSession),oldWire=serializeWorldSave(oldSave),context=await browser.newContext(),p=await context.newPage();t.after(()=>context.close());
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(wire=>localStorage.setItem('namonaki-story-v5',wire),oldWire);await p.goto(origin);await feedback(p,'保存された歴史を開きました');const before=await png(p);
 await p.locator('#improve-growth').click();await feedback(p,'今後の建設');assert.equal(await png(p),before);assert.equal(await p.locator('#improve-growth').isVisible(),false);
 assert.equal(await p.evaluate(()=>localStorage.getItem('namonaki-story-v5')),oldWire,'opt-in does not silently overwrite the previous save');
 await p.locator('#save').click();await feedback(p,'ブラウザに保存しました');const result=await decodeWorldSave(await p.evaluate(()=>localStorage.getItem('namonaki-story-v5')));assert.equal(result.progressionPolicy.id,'terrain-placement-v3');assert.deepEqual(result.state,oldSave.state);assert.deepEqual(result.landHistory,oldSave.landHistory);
 // A fresh tab reads the explicit v3 save without the old-save boot fixture.
 const fresh=await p.context().newPage();t.after(()=>fresh.close());await fresh.goto(origin);await feedback(fresh,'保存された歴史を開きました');assert.equal(await fresh.locator('#improve-growth').isVisible(),false);assert.equal(await png(fresh),before);assert.deepEqual(errors,[]);
});
