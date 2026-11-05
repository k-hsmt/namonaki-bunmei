import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {composeScene} from '../../dist/scene/composition.js';
import {findHousingGroundConflicts} from '../../dist/scene/housing-ground.js';
import {housingAt} from '../../dist/story/housing-history.js';
const b={blockId:'roof-near-market',siteId:'river-bank',
 footprint:{x:100,y:135,width:18,depth:8},builtYear:100,housingCount:4,
 condition:'sound',use:'occupied',styleId:'terraced',styleSeed:42};
const housing={introducedYear:0,legacyUntracked:false,
 events:[{year:100,seq:0,kind:'built',blockId:b.blockId,after:b}]};
const market={id:'fixed-market',kind:'market',x:110,y:129,builtYear:90,condition:'intact'};
const snapshot=(year=150,scale=3)=>({
 year,population:3500,phase:'fixture',atmosphere:'',sceneEvent:null,eventYear:null,
 scars:[],local:{index:0,population:3500},objects:[market],
 visual:{scale,trend:'stable',roadLevel:scale,squareLevel:scale,
  riversideLevel:scale,activityLevel:scale,densityLevel:scale,heightLevel:scale},
});
const pixels=async(page,s,h)=>{
 return page.evaluate(async({snapshot,housing})=>{
  const {drawScene}=await import('/scene/draw.js');
  const canvas=document.createElement('canvas');
  drawScene(canvas,snapshot,42,housing);
  const ctx=canvas.getContext('2d');
  const sample=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
  return {png:canvas.toDataURL('image/png'),
   marketLeg:sample(100,132),housingRegion:sample(106,140),width:canvas.width,height:canvas.height};
 },{snapshot:s,housing:h});
};
test('H4-B: 住宅屋根が市場の脚の輪郭を隠さず街区だけを新たに描く',async()=>{
 const port='5278';
 const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  const scene=snapshot();
  assert.deepEqual(findHousingGroundConflicts([b],scene.objects,0),[]);
  const noHousing=await pixels(page,scene,undefined);
  const withHousing=await pixels(page,scene,housing);
  assert.equal(noHousing.width,320);assert.equal(withHousing.height,180);
  assert.deepEqual(withHousing.marketLeg,noHousing.marketLeg,
   '市場の確定済み描画は前景の住宅屋根で隠さない');
  assert.notEqual(withHousing.png,noHousing.png,'住宅履歴の追加は画素にも表れる');
  const repeat=await pixels(page,scene,housing);
  assert.deepEqual(repeat,withHousing,'履歴とseedが同じ場合は画素が一致する');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
test('H4-B: 住宅の位置・屋根部品数は規模分類だけでは変わらず、建設以前には存在しない',()=>{
 const before=composeScene(snapshot(99,3),housing);
 assert.equal(before.residentialBlocks.length,0);
 const town=composeScene(snapshot(150,2),housing);
 const city=composeScene(snapshot(150,3),housing);
 assert.deepEqual(town.residentialBlocks,city.residentialBlocks);
 assert.deepEqual(town.structures,city.structures);
 assert.equal(city.residentialBlocks[0].housingCount,4);
 assert.equal(city.residentialBlocks[0].roofParts.reduce((n,p)=>n+p.representedUnits,0),4);
 assert.equal(housingAt(housing,150,'river-bank').blocks[0].builtYear,100);
});
