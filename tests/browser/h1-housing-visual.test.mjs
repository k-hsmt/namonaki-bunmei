import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {housingAt} from '../../dist/story/housing-history.js';
import {composeScene} from '../../dist/scene/composition.js';
const positions=[
 [176,92,20,8],[13,113,20,8],[272,144,20,8],[111,163,20,8],
 [94,92,20,8],[245,113,20,8],[206,144,20,8],[11,163,20,8]
];
const years=[10,55,115,178,240,300,355,410];
const counts=[2,3,4,5,8,6,10,7];
const events=positions.map(([x,y,width,depth],i)=>{
 const blockId='river-housing-'+String(i+1).padStart(2,'0');
 return {year:years[i],seq:0,kind:'built',blockId,
  after:{blockId,siteId:'river-bank',footprint:{x,y,width,depth},
   builtYear:years[i],housingCount:counts[i],condition:'sound',use:'occupied',
   styleId:i%3===0?'courtyard':i%3===1?'terraced':'low',styleSeed:i+42}};
});
events.push({year:540,seq:0,kind:'underused',blockId:events[2].blockId,
 after:{...events[2].after,use:'underused'}});
events.push({year:600,seq:0,kind:'ruined',blockId:events[4].blockId,
 after:{...events[4].after,use:'vacant',condition:'ruined'}});
const history={introducedYear:0,legacyUntracked:false,events};
const buildings=[
 {id:'river-bank-0',kind:'house',x:55,y:114,builtYear:0,condition:'intact'},
 {id:'river-bank-1',kind:'field',x:86,y:127,builtYear:50,condition:'intact'},
 {id:'river-bank-3',kind:'hall',x:197,y:121,builtYear:190,condition:'intact'},
 {id:'river-bank-5',kind:'workshop',x:110,y:117,builtYear:260,condition:'intact'},
 {id:'river-bank-6',kind:'market',x:256,y:109,builtYear:320,condition:'intact'},
 {id:'river-bank-7',kind:'bridge',x:149,y:143,builtYear:340,condition:'intact'},
];
const phases=[['settlement',40,0],['village',140,1],['town',310,2],['city',470,3],['decline',650,1]];
test('固定の住宅履歴から320×180pxの描画画像を再生成できる',async()=>{
 const port='5194';
 const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  await mkdir('artifacts/h1-housing',{recursive:true});
  const metadata=[];
  const oldHistory=JSON.stringify(history);
  for(const [name,year,scale] of phases){
   const objects=buildings.filter(o=>o.builtYear<=year).map(o=>({...o,
    condition:year>=600&&o.kind==='workshop'?'ruined':o.condition}));
   const visual={scale,trend:name==='decline'?'contracting':'stable',
    roadLevel:scale,squareLevel:scale,riversideLevel:scale,activityLevel:scale,
    densityLevel:scale,heightLevel:scale};
   const snapshot={year,population:3500,phase:'fixture',atmosphere:'',sceneEvent:null,
    eventYear:null,scars:[],local:{index:0,population:3500},objects,visual};
   const composition=composeScene(snapshot,history);
   const result=await page.evaluate(async ({snapshot,history})=>{
    const {drawScene}=await import('/scene/draw.js');
    const canvas=document.querySelector('#scene');
    const paint=()=>{
     drawScene(canvas,snapshot,42,history);
     if(canvas.width!==320||canvas.height!==180)throw Error('Canvas解像度が不正');
     const original=canvas.toDataURL('image/png');
     const enlarged=document.createElement('canvas');
     enlarged.width=1280;enlarged.height=720;
     const c=enlarged.getContext('2d');c.imageSmoothingEnabled=false;
     c.drawImage(canvas,0,0,1280,720);
     return {original,enlarged:enlarged.toDataURL('image/png')};
    };
    const a=paint(),b=paint();
    if(a.original!==b.original||a.enlarged!==b.enlarged)throw Error('再描画が非決定的');
    return a;
   },{snapshot,history});
   await writeFile('artifacts/h1-housing/'+name+'_320x180.png',Buffer.from(result.original.split(',')[1],'base64'));
   await writeFile('artifacts/h1-housing/'+name+'_4x.png',Buffer.from(result.enlarged.split(',')[1],'base64'));
   metadata.push({name,year,scale,kind:'fixed historical fixture, NOT natural progression',
    recordedBuildings:objects.map(o=>o.id),housingStatus:composition.housingStatus,
    residentialBlocks:composition.residentialBlocks.map(b=>({
     id:b.blockId,builtYear:b.builtYear,condition:b.condition,use:b.use,
     ground:b.footprint,housingCount:b.housingCount,roofPartCount:b.roofPartCount,
     slotCapacity:b.slotCapacity,roofParts:b.roofParts
    }))});
  }
  assert.equal(JSON.stringify(history),oldHistory);
  assert.deepEqual(errors,[]);
  assert.notDeepEqual(metadata[0].residentialBlocks,metadata[3].residentialBlocks);
  assert.equal(housingAt(history,40).blocks.length,1);
  assert.equal(housingAt(history,470).blocks.length,8);
  assert.equal(housingAt(history,650).blocks.length,8);
  await writeFile('artifacts/h1-housing/scene-composition.json',JSON.stringify(metadata,null,2));
 }finally{await browser?.close();server.kill();}
});
