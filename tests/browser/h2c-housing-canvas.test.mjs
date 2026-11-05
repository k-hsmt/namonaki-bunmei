import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createCivilization,step,chooseAutomatically} from '../../dist/story/engine.js';
import {createHousingCivilization} from '../../dist/story/housing-persistence.js';
import {housingAt} from '../../dist/story/housing-history.js';
import {composeScene} from '../../dist/scene/composition.js';
import {snapshotAt} from '../../dist/scene/model.js';

const port=process.env.H2C_TEST_PORT??'5202';
const origin='http://127.0.0.1:'+port,KEY='namonaki-story-v4';
let server,browser;
test.before(async()=>{
 server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
});
test.after(async()=>{try{await browser?.close();}finally{server?.kill();}});
const open=async t=>{
 const page=await browser.newPage();
 t.after(()=>page.close());
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin);
 return page;
};
const image=page=>page.locator('#scene').evaluate(e=>e.toDataURL('image/png'));
const rewind=async(page,year)=>page.locator('#rewind-year').evaluate((el,y)=>{
 el.value=String(y);
 el.dispatchEvent(new Event('input',{bubbles:true}));
},year);
const block=(blockId,year)=>({
 blockId,siteId:'river-bank',
 footprint:{x:15,y:145,width:20,depth:8},
 builtYear:year,housingCount:5,condition:'sound',use:'occupied',
 styleId:'terraced',styleSeed:42,
});
const event=(year,seq,kind,after)=>({year,seq,kind,blockId:after.blockId,after});

test('確定住宅の描画は年・地点・巻戻し・再読込で決定的に再現',async t=>{
 const page=await open(t),s=createHousingCivilization(42);
 // 人口や既存施設は変更せず、H1の確定履歴だけを固定fixtureとして保存する。
 for(let i=0;i<12;i++){step(s);if(s.pending)chooseAutomatically(s);}
 const old=snapshotAt(s,s.observation.lastYear,0);
 const existing=structuredClone(old.objects);
 const built=block('river-residence-01',5);
 s.housing.events.push(event(5,0,'built',built));
 assert.equal(housingAt(s.housing,4).blocks.length,0);
 assert.equal(housingAt(s.housing,5).blocks.length,1);
 assert.equal(composeScene(snapshotAt(s,6,0),s.housing).residentialBlocks[0].housingCount,5);
 assert.deepEqual(snapshotAt(s,s.observation.lastYear,0).objects,existing);
 const saved=JSON.stringify(s);
 await page.evaluate(([key,val])=>localStorage.setItem(key,val),[KEY,saved]);
 await page.locator('#load').click();
 assert.match(await page.locator('#feedback').textContent(),/保存された歴史を開きました/);
 const current=await image(page);
 await rewind(page,4);
 const before=await image(page);
 await rewind(page,5);
 const firstYear=await image(page);
 assert.notEqual(firstYear,before,'建設年より前には街区屋根を描かない');
 await rewind(page,s.observation.lastYear);
 assert.equal(await image(page),current);
 await page.locator('#site-select').selectOption('1');
 const hills=await image(page);
 assert.notEqual(hills,current);
 await page.locator('#site-select').selectOption('0');
 assert.equal(await image(page),current);
 await page.locator('#save').click();
 const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
 assert.deepEqual(stored.housing,s.housing);
 assert.deepEqual(stored.observation,s.observation);
 await page.reload();
 await page.locator('#load').click();
 assert.equal(await image(page),current);
 await rewind(page,4);
 assert.equal(await image(page),before);
 await rewind(page,5);
 assert.equal(await image(page),firstYear);
});
test('旧v3の住宅未記録期間は従来のCanvasと同じ。partialをゼロと決めつけない',async t=>{
 const page=await open(t),old=createCivilization(42);
 for(let i=0;i<12;i++){step(old);if(old.pending)chooseAutomatically(old);}
 await page.evaluate(([key,val])=>localStorage.setItem(key,val),
  ['namonaki-story-v3',JSON.stringify(old)]);
 await page.locator('#load').click();
 assert.match(await page.locator('#feedback').textContent(),/保存された歴史を開きました/);
 const y=old.observation.lastYear;
 const shown=await image(page);
 const expected=await page.evaluate(async ({state,y})=>{
  const {drawScene}=await import('/scene/draw.js');
  const {snapshotAt}=await import('/scene/model.js');
  const canvas=document.createElement('canvas');
  drawScene(canvas,snapshotAt(state,y,0),state.seed);
  return canvas.toDataURL('image/png');
 },{state:old,y});
 assert.equal(shown,expected,'旧セーブの未記録住宅を表示に加えない');
 await page.locator('#save').click();
 const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
 assert.equal(after.housing.legacyUntracked,true);
 assert.equal(after.housing.introducedYear,y+1);
 assert.deepEqual(after.housing.events,[]);
 assert.equal(housingAt(after.housing,y).status,'unknown');
 assert.equal(housingAt(after.housing,y+1).status,'partial');
 await page.reload();
 await page.locator('#load').click();
 assert.equal(await image(page),shown);
});
