/**
 * H4-A: 4段階を同一地形・同一seed・固定カメラで並べる視覚比較資料。
 * 画像は手動設計した確定履歴fixtureであり、自然進行の実測結果ではない。
 * CIは出典・履歴と画像生成の決定性だけを検証し、美的な合格判定をしない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {housingAt} from '../../dist/story/housing-history.js';
import {composeScene} from '../../dist/scene/composition.js';
import {findHousingGroundConflicts} from '../../dist/scene/housing-ground.js';

const seed=42;
const stages=[
 {name:'settlement',year:40,scale:0},
 {name:'village',year:140,scale:1},
 {name:'town',year:310,scale:2},
 {name:'city',year:470,scale:3},
];
const plots=[
 [176,92,20,8],[13,113,20,8],[272,144,20,8],[111,163,20,8],
 [94,92,20,8],[245,113,20,8],[206,144,20,8],[11,163,20,8],
];
const builtYears=[10,55,115,178,240,300,355,410];
const counts=[2,3,4,5,8,6,10,7];
const events=plots.map(([x,y,width,depth],i)=>{
 const blockId='visual-block-'+String(i+1).padStart(2,'0');
 return {year:builtYears[i],seq:0,kind:'built',blockId,
  after:{blockId,siteId:'river-bank',footprint:{x,y,width,depth},
   builtYear:builtYears[i],housingCount:counts[i],condition:'sound',use:'occupied',
   styleId:['courtyard','terraced','low'][i%3],styleSeed:i+42}};
});
const housing={introducedYear:0,legacyUntracked:false,events};
const facilities=[
 {id:'river-bank-0',kind:'house',x:55,y:114,builtYear:0,condition:'intact'},
 {id:'river-bank-1',kind:'field',x:86,y:127,builtYear:50,condition:'intact'},
 {id:'river-bank-3',kind:'hall',x:197,y:121,builtYear:190,condition:'intact'},
 {id:'river-bank-5',kind:'workshop',x:110,y:117,builtYear:260,condition:'intact'},
 {id:'river-bank-6',kind:'market',x:256,y:109,builtYear:320,condition:'intact'},
 {id:'river-bank-7',kind:'bridge',x:149,y:143,builtYear:340,condition:'intact'},
];
const makeSnapshot=({year,scale})=>{
 const objects=facilities.filter(o=>o.builtYear<=year).map(o=>({...o}));
 const profile={scale,trend:'stable',roadLevel:scale,squareLevel:scale,
  riversideLevel:scale,activityLevel:scale,densityLevel:scale,heightLevel:scale};
 return {year,population:3500,phase:'fixed fixture',atmosphere:'',sceneEvent:null,
  eventYear:null,scars:[],local:{index:0,population:3500},objects,visual:profile};
};
test('H4-A 4段階の歴史正本と同一地形・同一視点の比較画像',async()=>{
 const port='5276';
 const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  await mkdir('artifacts/h4a-visual',{recursive:true});
  const originalHousing=JSON.stringify(housing),results=[],metadata=[];
  for(const stage of stages){
   const snapshot=makeSnapshot(stage),composed=composeScene(snapshot,housing);
   const actualHousing=housingAt(housing,stage.year,'river-bank');
   assert.equal(composed.housingStatus,'known');
   assert.equal(composed.residentialBlocks.length,actualHousing.blocks.length);
   assert.deepEqual(findHousingGroundConflicts(actualHousing.blocks,snapshot.objects,0),[]);
   assert.deepEqual(composed.structures.map(s=>s.id),snapshot.objects.map(o=>o.id));
   assert.ok(composed.residentialBlocks.every(b=>b.builtYear<=stage.year));
   const png=await page.evaluate(async({snapshot,housing,seed})=>{
    const {drawScene}=await import('/scene/draw.js');
    const canvas=document.createElement('canvas');
    const paint=()=>{drawScene(canvas,snapshot,seed,housing);return canvas.toDataURL('image/png');};
    const first=paint(),second=paint();
    if(first!==second||canvas.width!==320||canvas.height!==180)
     throw Error('H4-A: non-deterministic rendering or invalid native dimensions');
    return first;
   },{snapshot,housing,seed});
   const binary=Buffer.from(png.split(',')[1],'base64');
   await writeFile('artifacts/h4a-visual/'+stage.name+'_320x180.png',binary);
   results.push({name:stage.name,png});
   metadata.push({
    stage:stage.name,year:stage.year,scale:stage.scale,
    source:'manually authored confirmed-history fixture; NOT natural-play evidence',
    canvas:{width:320,height:180},camera:'fixed river-bank scene',seed,
    facilities:composed.structures.map(o=>({id:o.id,kind:o.kind,builtYear:o.builtYear})),
    residentialBlocks:composed.residentialBlocks.map(b=>({
     id:b.blockId,builtYear:b.builtYear,footprint:b.footprint,
     housingCount:b.housingCount,roofPartCount:b.roofPartCount,
    })),
    housingStatus:composed.housingStatus,riverUse:composed.riverUse,
   });
  }
  assert.equal(results.length,4);
  assert.equal(new Set(results.map(r=>r.png)).size,4);
  assert.equal(JSON.stringify(housing),originalHousing);
  // 外部比較ツールを使わず、オリジナルピクセルのまま4枚を2x2に配置。
  // ラベルを画像に描かないことで作品の見え方を検証可能にする。
  const sheet=await page.evaluate(async(images)=>{
   const base=document.createElement('canvas');base.width=640;base.height=360;
   const ctx=base.getContext('2d');ctx.imageSmoothingEnabled=false;
   const load=src=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;
   });
   for(let i=0;i<4;i++){
    const img=await load(images[i]);
    ctx.drawImage(img,(i%2)*320,Math.floor(i/2)*180,320,180);
   }
   const native=base.toDataURL('image/png');
   const enlarged=document.createElement('canvas');enlarged.width=2560;enlarged.height=1440;
   const large=enlarged.getContext('2d');large.imageSmoothingEnabled=false;
   large.drawImage(base,0,0,2560,1440);
   return {native,enlarged:enlarged.toDataURL('image/png')};
  },results.map(r=>r.png));
  await writeFile('artifacts/h4a-visual/four-stages_640x360.png',Buffer.from(sheet.native.split(',')[1],'base64'));
  await writeFile('artifacts/h4a-visual/four-stages_4x.png',Buffer.from(sheet.enlarged.split(',')[1],'base64'));
  await writeFile('artifacts/h4a-visual/provenance.json',JSON.stringify({
   mainBaseline:'0258d095aa7a8deabe0a7afcb42a1e9a0c494cab',
   presentationOrder:['settlement','village','town','city'],
   readingOrder:'upper-left, upper-right, lower-left, lower-right',
   note:'All stages share fixed terrain, seed and camera. Visual scale is assigned by fixture; not observed naturally.',
   stages:metadata,
  },null,2));
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
