/** H3-C: Chromiumで10,000年分のv4セーブを実際に保存・読込する容量監査。 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';

const seed=42,years=10000,port='5299';
const storageKey='namonaki-story-v4';
const state=createHousingCivilization(seed);
const start=performance.now();
while(state.year<years){
 step(state);
 if(state.pending)chooseAutomatically(state);
}
const json=JSON.stringify(state);
const generatedMs=Math.round(performance.now()-start);
const origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['scripts/serve.mjs'],{
 env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit'],
});
let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 const storage=await page.evaluate(({key,value})=>{
  try{
   localStorage.setItem(key,value);
   return {stored:true,readBackEqual:localStorage.getItem(key)===value};
  }catch(e){
   return {stored:false,errorName:e?.name,errorMessage:String(e?.message)};
  }
 },{key:storageKey,value:json});
 let feedback=null;
 if(storage.stored){
  await page.locator('#load').click();
  feedback=await page.locator('#feedback').textContent();
  assert.match(feedback,/保存された歴史を開きました/);
  const after=await page.evaluate(key=>localStorage.getItem(key),storageKey);
  assert.equal(after,json,'the original save value must remain unchanged after loading');
  await page.locator('#save').click();
  assert.match(await page.locator('#feedback').textContent(),/ブラウザに保存しました/);
  await page.reload();
  await page.locator('#load').click();
  assert.match(await page.locator('#feedback').textContent(),/保存された歴史を開きました/);
 }
 console.log(JSON.stringify({
  type:'h3-browser-storage',seed,years,generatedMs,
  jsonBytes:Buffer.byteLength(json),utf16CodeUnits:json.length,
  storage,feedback,pageErrors:errors,
 }));
 assert.ok(storage.stored,'Chromium localStorage capacity exhausted at 10,000 years');
 assert.ok(storage.readBackEqual);
 assert.deepEqual(errors,[]);
 await page.close();
}finally{
 await browser?.close();
 server.kill();
}
