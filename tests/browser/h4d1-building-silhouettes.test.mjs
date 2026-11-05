import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const kinds=['house','granary','workshop','hall'];
const fixture=(kind,condition='intact')=>({
 id:'recorded-'+kind,kind,x:42,y:52,builtYear:100,condition,
});
test('H4-D1: 既存建物種別の輪郭・廃墟・住宅様式を同一尺度で比較',async()=>{
 const port='5286';
 const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  await mkdir('artifacts/h4d1-buildings',{recursive:true});
  const previews=[];
  for(const condition of ['intact','ruined']){
   const frames=[];
   for(const kind of kinds){
    const building=fixture(kind,condition);
    const image=await page.evaluate(async b=>{
     const {drawBuildingSprite}=await import('/scene/draw.js');
     const canvas=document.createElement('canvas');
     canvas.width=84;canvas.height=72;
     const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
     drawBuildingSprite(c,b,b.kind==='hall'||b.kind==='granary');
     return canvas.toDataURL('image/png');
    },building);
    frames.push(image);
    await writeFile('artifacts/h4d1-buildings/'+condition+'-'+kind+'.png',
     Buffer.from(image.split(',')[1],'base64'));
   }
   // 色差だけではなく各シルエットの不透明画素の形を比較する。
   const masks=await page.evaluate(async frames=>{
    const get=src=>new Promise((resolve,reject)=>{
     const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;
    });
    const out=[];
    for(const src of frames){
     const i=await get(src),canvas=document.createElement('canvas');
     canvas.width=i.width;canvas.height=i.height;
     const c=canvas.getContext('2d');c.drawImage(i,0,0);
     const data=c.getImageData(0,0,canvas.width,canvas.height).data;
     let mask='';
     for(let p=3;p<data.length;p+=4)mask+=data[p]?'1':'0';
     out.push(mask);
    }
    return out;
   },frames);
   assert.equal(new Set(masks).size,kinds.length,
    '建築種別ごとに輪郭そのものが識別可能である必要がある');
   previews.push({condition,frames});
  }
  const gallery=await page.evaluate(async previews=>{
   const canvas=document.createElement('canvas');
   canvas.width=4*84;canvas.height=2*72;
   const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
   const get=src=>new Promise((resolve,reject)=>{
    const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;
   });
   for(let row=0;row<2;row++)for(let col=0;col<4;col++){
    const image=await get(previews[row].frames[col]);
    c.drawImage(image,col*84,row*72);
   }
   return canvas.toDataURL('image/png');
  },previews);
  await writeFile('artifacts/h4d1-buildings/silhouette-gallery.png',
   Buffer.from(gallery.split(',')[1],'base64'));
  const same=await page.evaluate(async b=>{
   const {drawBuildingSprite}=await import('/scene/draw.js');
   const draw=()=>{
    const canvas=document.createElement('canvas');canvas.width=84;canvas.height=72;
    drawBuildingSprite(canvas.getContext('2d'),b,true);
    return canvas.toDataURL('image/png');
   };
   return [draw(),draw()];
  },fixture('granary'));
  assert.equal(same[0],same[1]);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
test('H4-D1: 敷地・建設年・施設種別の描画前後の同一性',async()=>{
 const {composeScene}=await import('../../dist/scene/composition.js');
 const f=[{...fixture('house'),x:50,y:114},
  {...fixture('granary'),x:251,y:131},
  {...fixture('workshop'),x:110,y:117},
  {...fixture('hall'),x:200,y:120}];
 const snap={year:150,population:3000,phase:'fixture',atmosphere:'',sceneEvent:null,
  objects:f,eventYear:null,scars:[],local:{index:0,population:3000},
  visual:{scale:1,trend:'stable',roadLevel:1,squareLevel:1,riversideLevel:1,
   activityLevel:1,densityLevel:1,heightLevel:1}};
 const a=composeScene(snap),b=composeScene({...snap,visual:{...snap.visual,scale:3}});
 assert.deepEqual(a.structures,b.structures);
 assert.deepEqual(f.map(x=>x.builtYear),[100,100,100,100]);
});
