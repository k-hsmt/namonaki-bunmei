import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createCivilization,step,chooseAutomatically} from '../../dist/story/engine.js';
const port=process.env.H2B_TEST_PORT??'5198',origin='http://127.0.0.1:'+port;
const KEY='namonaki-story-v4',OLD='namonaki-story-v3';
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
test('新規ゲームはv4とknownの住宅記録を保存し、再読込でも同一',async t=>{
 const page=await pageFor(t);
 await page.locator('#save').click();
 const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
 assert.equal(saved.version,4);
 assert.deepEqual(saved.housing,{schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[]});
 const pixels=await page.locator('#scene').evaluate(e=>e.toDataURL());
 await page.reload();
 await page.locator('#load').click();
 assert.match(await page.locator('#feedback').textContent(),/保存された歴史を開きました/);
 assert.equal(await page.locator('#scene').evaluate(e=>e.toDataURL()),pixels);
 const unchanged=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
 assert.deepEqual(unchanged,saved);
});
test('旧v3読み込みは元キー不変、明示保存して初めてv4になる',async t=>{
 const page=await pageFor(t),old=createCivilization(42);
 for(let i=0;i<15;i++){step(old);if(old.pending)chooseAutomatically(old);}
 const raw=JSON.stringify(old);
 await page.evaluate(([key,value])=>localStorage.setItem(key,value),[OLD,raw]);
 await page.locator('#load').click();
 assert.match(await page.locator('#feedback').textContent(),/保存された歴史を開きました/);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),OLD),raw);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),null);
 await page.locator('#save').click();
 const migrated=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
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
 const baseline=await page.locator('#scene').evaluate(e=>e.toDataURL());
 const old=JSON.stringify(createCivilization(82));
 await page.evaluate(([key,val,oldKey,oldVal])=>{
  localStorage.setItem(key,val);localStorage.setItem(oldKey,oldVal);
 },[KEY,'{ broken',OLD,old]);
 await page.locator('#load').click();
 assert.match(await page.locator('#feedback').textContent(),/読み込めませんでした/);
 assert.equal(await page.locator('#scene').evaluate(e=>e.toDataURL()),baseline);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),'{ broken');
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),OLD),old);
});
