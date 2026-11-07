import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {decodeWorldSave} from '../../dist/story/world-storage.js';
import {createCivilization,step,chooseAutomatically} from '../../dist/story/engine.js';
const port=process.env.H2B_TEST_PORT??'5198',origin='http://127.0.0.1:'+port;
const KEY='namonaki-story-v5',OLD='namonaki-story-v3';
let server,browser;
test.before(async()=>{
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
});
test.after(async()=>{try{await browser?.close();}finally{server?.kill();}});
const pageFor=async t=>{
 const page=await browser.newPage();t.after(()=>page.close());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin);return page;
};
test('新規ゲームは生成v5とknownの住宅記録を保存し、再読込でも同一',async t=>{
 const page=await pageFor(t);
 await page.locator('#save').click();
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('ブラウザに保存しました'));
 const saved=await decodeWorldSave(await page.evaluate(k=>localStorage.getItem(k),KEY));
 assert.equal(saved.version,5);assert.equal(saved.initialTerrain.mode,'generated');
 assert.deepEqual(saved.state.housing,{schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[]});
 const pixels=await page.locator('#scene').evaluate(e=>e.toDataURL());
 await page.reload();
 await page.locator('#load').click();
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('保存された歴史を開きました')||document.getElementById('feedback').textContent.includes('読み込めませんでした'));
 assert.match(await page.locator('#feedback').textContent(),/保存された歴史を開きました/);
 assert.equal(await page.locator('#scene').evaluate(e=>e.toDataURL()),pixels);
 const unchanged=await decodeWorldSave(await page.evaluate(k=>localStorage.getItem(k),KEY));
 assert.deepEqual(unchanged,saved);
});
test('旧v3読み込みは元キー不変、明示保存して初めてlegacy-fixed v5になる',async t=>{
 const page=await pageFor(t),old=createCivilization(42);
 for(let i=0;i<15;i++){step(old);if(old.pending)chooseAutomatically(old);}
 const raw=JSON.stringify(old);
 await page.evaluate(([key,value])=>localStorage.setItem(key,value),[OLD,raw]);
 await page.locator('#load').click();
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('保存された歴史を開きました')||document.getElementById('feedback').textContent.includes('読み込めませんでした'));
 assert.match(await page.locator('#feedback').textContent(),/保存された歴史を開きました/);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),OLD),raw);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),null);
 await page.locator('#save').click();
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('ブラウザに保存しました'));
 const envelope=await decodeWorldSave(await page.evaluate(k=>localStorage.getItem(k),KEY));assert.equal(envelope.initialTerrain.mode,'legacy-fixed');const migrated=envelope.state;
 assert.equal(migrated.version,4);
 assert.equal(migrated.housing.legacyUntracked,true);
 assert.equal(migrated.housing.introducedYear,old.observation.lastYear+1);
 assert.equal(migrated.rngState,old.rngState);
 assert.deepEqual(migrated.observation,old.observation);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),OLD),raw);
});
test('破損現行キーは旧キーを選ばず、表示中の文明と保存値を維持',async t=>{
 const page=await pageFor(t);
 await page.locator('#save').click();
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('ブラウザに保存しました'));
 const baseline=await page.locator('#scene').evaluate(e=>e.toDataURL());
 const old=JSON.stringify(createCivilization(82));
 await page.evaluate(([key,val,oldKey,oldVal])=>{
  localStorage.setItem(key,val);localStorage.setItem(oldKey,oldVal);
 },[KEY,'{ broken',OLD,old]);
 await page.locator('#load').click();
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('保存された歴史を開きました')||document.getElementById('feedback').textContent.includes('読み込めませんでした'));
 assert.match(await page.locator('#feedback').textContent(),/読み込めませんでした/);
 assert.equal(await page.locator('#scene').evaluate(e=>e.toDataURL()),baseline);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),'{ broken');
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),OLD),old);
});
