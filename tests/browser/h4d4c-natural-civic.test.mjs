import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../../dist/story/engine.js';
import {snapshotAt} from '../../dist/scene/model.js';
import {composeScene} from '../../dist/scene/composition.js';

const PNG=x=>Buffer.from(x.split(',')[1],'base64');
test('H4-D4-C: 自然進行した公共建築の原寸・過去年・廃墟と保存後のCanvasが決定的',async()=>{
 const port='5289';
 const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:1024,height:768}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  await mkdir('artifacts/h4d4c-natural',{recursive:true});
  const observations=[];
  for(const seed of [7,42,82]){
   const state=createHousingCivilization(seed);
   while(state.year<2000){step(state);if(state.pending)chooseAutomatically(state);}
   const restored=parseHousingSave(serializeHousingSave(state));
   const buildings=state.observation.sites[0].view.buildings.filter(b=>b.civic);
   const recorded=buildings.map(b=>({
    id:b.id,style:b.civic.architectureStyle,firstYear:b.builtYear,
    footprint:b.civic.footprint,currentCondition:b.condition,
    constructionRecordId:b.civic.constructionRecordId,
   }));
   const years=new Set([1000,2000]);
   for(const b of buildings){
    years.add(b.builtYear);
    years.add(b.builtYear-1);
   }
   const frames=[];
   for(const year of [...years].sort((a,b)=>a-b)){
    const snapshot=snapshotAt(state,year,0);
    const again=snapshotAt(restored,year,0);
    assert.deepEqual(again,snapshot);
    const pict=await page.evaluate(async({snapshot,housing,seed})=>{
     const {drawScene}=await import('/scene/draw.js');
     const paint=(s)=>{
      const c=document.createElement('canvas');drawScene(c,s,seed,housing);
      if(c.width!==320||c.height!==180)throw Error('incorrect native size');
      return c.toDataURL('image/png');
     };
     const raw=paint(snapshot);
     if(paint(snapshot)!==raw)throw Error('non-deterministic');
     const extended=document.createElement('canvas');
     extended.width=1280;extended.height=720;
     const ctx=extended.getContext('2d');ctx.imageSmoothingEnabled=false;
     const native=document.createElement('canvas');
     drawScene(native,snapshot,seed,housing);
     ctx.drawImage(native,0,0,1280,720);
     const without=paint({...snapshot,objects:snapshot.objects.filter(b=>!b.civic)});
     return {raw,enlarged:extended.toDataURL('image/png'),without};
    },{snapshot,housing:state.housing,seed});
    const resumed=await page.evaluate(async({snapshot,housing,seed})=>{
     const {drawScene}=await import('/scene/draw.js');
     const c=document.createElement('canvas');drawScene(c,snapshot,seed,housing);
     return c.toDataURL('image/png');
    },{snapshot:again,housing:restored.housing,seed});
    assert.equal(pict.raw,resumed,'保存・再開後の同じ過去Canvasはピクセル一致');
    const present=snapshot.objects.filter(b=>b.civic);
    if(present.length)assert.notEqual(pict.raw,pict.without,'実在する大型公共建築が画面に出ていない');
    else assert.equal(pict.raw,pict.without,'史実にない大型施設の絵が現れた');
    const prefix='seed'+seed+'_year'+year;
    await writeFile('artifacts/h4d4c-natural/'+prefix+'_ACTUAL_320x180.png',PNG(pict.raw));
    await writeFile('artifacts/h4d4c-natural/'+prefix+'_ACTUAL_4x.png',PNG(pict.enlarged));
    if(present.length){
     // 右側は同年から新建築だけを外した仮想比較画像。史実ではない。
     await writeFile('artifacts/h4d4c-natural/'+prefix+'_comparison_WITHOUT_CIVIC_NOT_HISTORY.png',PNG(pict.without));
    }
    const composed=composeScene(snapshot,state.housing);
    frames.push({year,scale:composed.scale,actualCivicIds:present.map(b=>b.id),
     actualStyles:present.map(b=>b.civic.architectureStyle),
     residentialBlocks:composed.residentialBlocks.length,roofParts:composed.residentialBlocks.reduce((n,b)=>n+b.roofPartCount,0)});
   }
   observations.push({seed,recorded,frames});
   console.log('H4-D4-C-NATURAL '+JSON.stringify({seed,recorded,frames}));
  }
  assert.ok(observations.some(x=>x.recorded.length),'自然進行で新施設が成立せず画像評価できない');
  await writeFile('artifacts/h4d4c-natural/provenance.json',JSON.stringify({
   status:'actual deterministic natural progression',
   note:'ACTUAL pictures depict recorded historical buildings. WITHOUT_CIVIC pictures are hypothetical comparisons, not history.',
   observations,
  },null,2));
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
