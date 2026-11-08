import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createCivilization,step,chooseAutomatically} from '../../dist/story/engine.js';
import {snapshotAt} from '../../dist/scene/model.js';

test('natural 1000-year history produces reproducible observed canvases',async()=>{
 const state=createCivilization(42);
 for(let i=0;i<1000;i++){step(state);if(state.pending)chooseAutomatically(state);}
 assert.equal(state.year,1000);
 const years=[0,250,500,750,1000];
 const samples=years.map(year=>({year,snapshot:snapshotAt(state,year,0)}));
 const knownScales=new Set(samples.map(s=>s.snapshot.visual?.scale));
 const port='5191';
 const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  await mkdir('artifacts/history-b',{recursive:true});
  for(const {year,snapshot} of samples){
   const draw=()=>page.evaluate(async ({snapshot,seed})=>{
    const {drawScene}=await import('/scene/draw.js');
    const canvas=document.querySelector('#scene');
    drawScene(canvas,snapshot,seed);
    if(canvas.width!==320||canvas.height!==180)throw Error('wrong canvas dimensions');
    return canvas.toDataURL();
   },{snapshot,seed:state.seed});
   const a=await draw(),b=await draw();
   assert.equal(a,b);
   await writeFile('artifacts/history-b/seed42-year-'+String(year).padStart(4,'0')+'.png',Buffer.from(a.split(',')[1],'base64'));
  }
  await writeFile('artifacts/history-b/observations.json',JSON.stringify({
   provenance:'natural simulation; NOT fabricated scale fixtures',seed:42,
   years:samples.map(({year,snapshot})=>({year,scale:snapshot.visual?.scale,trend:snapshot.visual?.trend,structures:snapshot.objects.length})),
   observedScales:[...knownScales]
  },null,2));
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
