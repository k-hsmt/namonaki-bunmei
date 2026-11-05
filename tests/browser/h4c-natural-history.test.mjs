/**
 * H4-C: 自然進行の観測画像。fixtureのscaleを人為設定しない。
 * 実際に到達していない「都市」の画像は作らない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../../dist/story/housing-persistence.js';
import {step,chooseAutomatically,lastObservedYear} from '../../dist/story/engine.js';
import {snapshotAt} from '../../dist/scene/model.js';
import {composeScene} from '../../dist/scene/composition.js';

const seeds=[7,42,82];
const horizon=2000;
const levels=['settlement','village','town','city'];
const json=x=>JSON.parse(JSON.stringify(x));
const capture=async(page,snapshot,housing,seed)=>{
 return page.evaluate(async({snapshot,housing,seed})=>{
  const {drawScene}=await import('/scene/draw.js');
  const canvas=document.createElement('canvas');
  const paint=()=>{
   drawScene(canvas,snapshot,seed,housing);
   if(canvas.width!==320||canvas.height!==180)throw Error('Canvasの解像度が不正');
   return canvas.toDataURL('image/png');
  };
  const original=paint();
  if(paint()!==original)throw Error('同一履歴の描画が非決定的');
  const enlarged=document.createElement('canvas');
  enlarged.width=1280;enlarged.height=720;
  const ctx=enlarged.getContext('2d');ctx.imageSmoothingEnabled=false;
  ctx.drawImage(canvas,0,0,1280,720);
  return {original,enlarged:enlarged.toDataURL('image/png')};
 },{snapshot,housing,seed});
};
test('H4-C 自然進行で観測できた規模のみを描画・保存し、過去と再開後の画素を照合',async()=>{
 const port='5284';
 const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  await mkdir('artifacts/h4c-natural',{recursive:true});
  const reports=[];
  for(const seed of seeds){
   const state=createHousingCivilization(seed);
   const firstByScale=new Map(),yearsByScale=[0,0,0,0];
   let firstContraction=null;
   const atYear=new Map();
   for(let year=0;year<=horizon;year++){
    if(year>0){
     step(state);
     if(state.pending)chooseAutomatically(state);
    }
    assert.equal(state.year,year);
    assert.equal(lastObservedYear(state),year,'保留年を未確定のまま数えない');
    const observed=snapshotAt(state,year,0);
    const scale=observed.visual.scale;
    yearsByScale[scale]++;
    if(!firstByScale.has(scale))firstByScale.set(scale,year);
    if(firstContraction===null&&observed.visual.trend==='contracting')
     firstContraction=year;
    if(year%250===0)atYear.set(year,{
     scale,trend:observed.visual.trend,population:observed.local.population,
    });
   }
   // 進行終了後の任意年を確定履歴だけから再生する。
   const chosen=new Map();
   for(const [scale,year] of firstByScale)chosen.set('first-'+levels[scale],year);
   if(firstContraction!==null)chosen.set('first-contracting',firstContraction);
   chosen.set('latest',horizon);
   const originalHistory=JSON.stringify(state);
   const restored=parseHousingSave(serializeHousingSave(state));
   assert.deepEqual(restored,state);
   const samples=[];
   for(const [name,year] of chosen){
    const snapshot=snapshotAt(state,year,0);
    const same=snapshotAt(restored,year,0);
    assert.deepEqual(same,snapshot);
    const scene=composeScene(snapshot,state.housing);
    const saved=await capture(page,snapshot,state.housing,seed);
    const resumed=await capture(page,same,restored.housing,seed);
    assert.equal(saved.original,resumed.original,'保存・再開後の過去Canvasが異なる');
    const prefix='seed'+seed+'_'+name+'_year'+year;
    await writeFile('artifacts/h4c-natural/'+prefix+'_320x180.png',Buffer.from(saved.original.split(',')[1],'base64'));
    await writeFile('artifacts/h4c-natural/'+prefix+'_4x.png',Buffer.from(saved.enlarged.split(',')[1],'base64'));
    samples.push({
     id:prefix,year,observedScale:levels[scene.scale],
     trend:scene.trend,population:scene.population,
     residentialBlocks:scene.residentialBlocks.length,
     housingUnits:scene.residentialBlocks.reduce((n,b)=>n+b.housingCount,0),
     roofParts:scene.residentialBlocks.reduce((n,b)=>n+b.roofPartCount,0),
     facilityIds:scene.structures.map(o=>o.id),
     housingBlockIds:scene.residentialBlocks.map(b=>b.blockId),
    });
   }
   assert.equal(JSON.stringify(state),originalHistory,'描画で正本を変更しない');
   const result={
    seed,horizon,site:'river-bank',source:'actual deterministic natural progression',
    yearsByScale:Object.fromEntries(levels.map((label,i)=>[label,yearsByScale[i]])),
    firstByScale:Object.fromEntries([...firstByScale].map(([scale,year])=>[levels[scale],year])),
    firstContraction,
    sampledYears:Object.fromEntries(atYear),
    housingEvents:state.housing.events.length,
    recordedCityReached:firstByScale.has(3),
    samples,
   };
   reports.push(result);
   console.log(JSON.stringify({type:'h4c-natural',...result}));
  }
  assert.deepEqual(errors,[]);
  await writeFile('artifacts/h4c-natural/report.json',JSON.stringify({
   baselineMain:'7a6b50ff08c383ba516c3ddbc55dd4e271b31ee3',
   note:'Only actually observed scale is recorded. No stage is fabricated and visual quality needs Human review.',
   reports,
  },null,2));
 }finally{await browser?.close();server.kill();}
});
