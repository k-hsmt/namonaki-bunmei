import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

test('fixed-observation visual comparison: four sizes and historical contraction',async()=>{
 const port='5189';
 const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  const result=await page.evaluate(async()=>{
   const {drawScene}=await import('/scene/draw.js');
   const {visualProfile}=await import('/scene/model.js');
   const canvas=document.querySelector('#scene');
   const original=[
    {id:'r-house',kind:'house',x:55,y:114,builtYear:0,condition:'intact'},
    {id:'field',kind:'field',x:86,y:127,builtYear:25,condition:'intact'},
    {id:'s-house',kind:'house',x:229,y:112,builtYear:120,condition:'intact'},
    {id:'hall',kind:'hall',x:197,y:121,builtYear:310,condition:'intact'},
    {id:'granary',kind:'granary',x:270,y:130,builtYear:460,condition:'intact'},
    {id:'workshop',kind:'workshop',x:110,y:117,builtYear:600,condition:'intact'},
    {id:'market',kind:'market',x:256,y:109,builtYear:800,condition:'intact'},
    {id:'bridge',kind:'bridge',x:149,y:143,builtYear:900,condition:'intact'},
    {id:'workshop-2',kind:'workshop',x:210,y:141,builtYear:1100,condition:'intact'}
   ];
   const versions=[];
   for(let scale=0;scale<5;scale++){
    // Fixtures deliberately hold historical building identities constant.
    const reduced=scale===4;
    const active=scale===0?original.slice(0,2):scale===1?original.slice(0,4):scale===2?original.slice(0,7):original;
    const buildings=active.map(b=>({...b,condition:reduced&&['market','workshop-2','bridge'].includes(b.id)?'ruined':b.condition}));
    const profile=visualProfile(reduced?1:scale,reduced?'contracting':'stable',true,buildings);
    drawScene(canvas,{year:scale*400,population:1500,phase:'fixture',atmosphere:'test',sceneEvent:null,objects:buildings,eventYear:null,scars:[],local:{index:0,population:1500},visual:profile},42);
    versions.push({name:['settlement','village','town','city','contraction'][scale],pixels:canvas.toDataURL()});
   }
   return versions;
  });
  assert.equal(result.length,5);
  assert.equal(new Set(result.map(x=>x.pixels)).size,5);
  await mkdir('artifacts/visual-a',{recursive:true});
  for(const {name,pixels} of result){
   const image=Buffer.from(pixels.split(',')[1],'base64');
   const {writeFile}=await import('node:fs/promises');
   await writeFile('artifacts/visual-a/'+name+'.png',image);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
