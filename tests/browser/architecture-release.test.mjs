/** Issue #35 D2-d/D3 release: the normal UI draws v9 worlds with their recorded birth styles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createNewArchitectureWorld,createNewTerrainWorld} from '../../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../../dist/architecture/production-v1.js';
import {advanceTerrainProductionWorld} from '../../dist/terrain/terrain-production-progression-v1.js';
import {architectureProductionSession,terrainProductionSession,prepareWorldSessionSave} from '../../dist/story/world-session.js';
import {encodeWorldSave} from '../../dist/story/world-storage.js';

const port=process.env.ARCH_RELEASE_TEST_PORT??'5233',origin='http://127.0.0.1:'+port;
let server,browser,v9json,v8json;
test.before(async()=>{
 const v9=architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(24)).architecture,1100,'automatic'));
 const v8=terrainProductionSession(await advanceTerrainProductionWorld((await createNewTerrainWorld(24)).review,1100,'automatic'));
 v9json=(await encodeWorldSave(await prepareWorldSessionSave(v9))).json;v8json=(await encodeWorldSave(await prepareWorldSessionSave(v8))).json;
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
});
test.after(async()=>{try{await browser?.close();}finally{server?.kill();}});

const open=async(t,key,value,motion=false)=>{
 const page=await browser.newPage({reducedMotion:motion?'no-preference':'reduce'});t.after(()=>page.close());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.addInitScript(([k,v])=>{if(!sessionStorage.getItem('seeded')){localStorage.clear();localStorage.setItem(k,v);sessionStorage.setItem('seeded','1');}},[key,value]);
 await page.goto(origin);await page.waitForFunction(()=>!document.getElementById('save').disabled,{timeout:120000});
 return page;
};
const pixels=page=>page.locator('#scene').evaluate(e=>e.toDataURL());

test('release UI: v9の世界は記録された様式で描き、再読込でも同じ。v8の保存は今までどおり',async t=>{
 const v9=await open(t,'namonaki-story-v9',v9json),v8=await open(t,'namonaki-story-v8',v8json);
 assert.equal(await v9.locator('#year').textContent(),await v8.locator('#year').textContent());
 const a=await pixels(v9),b=await pixels(v8);
 assert.notEqual(a,b,'v9 draws the recorded birth styles');
 await v9.reload();await v9.waitForFunction(()=>!document.getElementById('save').disabled,{timeout:120000});
 assert.equal(await pixels(v9),a,'same pixels after reload');
 // switching sites and back keeps the same view
 await v9.selectOption('#site-select','2');await v9.selectOption('#site-select','0');assert.equal(await pixels(v9),a);
});

test('release UI: 動きのある表示の建物の層も、記録された様式で描く',async t=>{
 const page=await open(t,'namonaki-story-v9',v9json);
 const result=await page.evaluate(async()=>{
  const {decodeWorldSave}=await import('/story/world-storage.js');
  const {restoreWorldSession,observeGeneratedWorldSession,worldStructurePainter}=await import('/story/world-session.js');
  const {prepareSceneMotion}=await import('/scene/motion-frame.js');
  const session=restoreWorldSession(await decodeWorldSave(localStorage.getItem('namonaki-story-v9')));
  const o=observeGeneratedWorldSession(session,session.state.year,0),painter=worldStructurePainter(session);
  const layer=p=>prepareSceneMotion(o,p).structures.toDataURL();
  return {hasPainter:!!painter,withPainter:layer(painter),again:layer(painter),without:layer(undefined)};
 });
 assert.ok(result.hasPainter);
 assert.notEqual(result.withPainter,result.without,'the moving structures layer uses the recorded styles');
 assert.equal(result.withPainter,result.again,'deterministic');
});

test('release UI (D4-c): 年代記に「建て直される」を、元の記録の上に表示する',async t=>{
 // seed 24 has no rebuild by 1100; seed 7 has 34 by 3000
 const rebuilt=architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(7)).architecture,3000,'automatic'));
 const page=await open(t,'namonaki-story-v9',(await encodeWorldSave(await prepareWorldSessionSave(rebuilt))).json);
 await page.locator('#toggle-all').click();
 const items=await page.locator('#timeline li').evaluateAll(ls=>ls.map(l=>({note:l.classList.contains('architecture-note'),text:l.textContent})));
 const notes=items.filter(i=>i.note);
 assert.ok(notes.length>0,'rebuild lines shown');
 for(const [i,item] of items.entries())if(item.note){
  assert.match(item.text,/建築.*が建て直される（/);
  const next=items.slice(i+1).find(x=>!x.note);assert.match(next.text,/が(再利用|修繕)される/,'the v8 record follows (older below)');
 }
});

test('release UI (D5): 観測地点に街並みの型を表示し、v8の保存には出さない',async t=>{
 const v9=await open(t,'namonaki-story-v9',v9json),v8=await open(t,'namonaki-story-v8',v8json);
 assert.match(await v9.locator('#site-streetscape').textContent(),/^街並み：.+(集落|村|町|都市)$/);
 assert.equal(await v9.locator('#site-streetscape').isHidden(),false);
 assert.equal(await v8.locator('#site-streetscape').isHidden(),true);
});
