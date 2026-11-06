import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../../dist/story/engine.js';
import {snapshotAt} from '../../dist/scene/model.js';

test('D7-B: 自然成立・荒廃・再利用の原寸画像と保存後のピクセル一致',async()=>{
 const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:'5293'},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5293');
  await mkdir('artifacts/h4d7b-natural',{recursive:true});
  const observations=[];
  for(const seed of [7,42,82]){
   const s=createHousingCivilization(seed);
   while(s.year<2000){step(s);if(s.pending)chooseAutomatically(s);}
   const restored=parseHousingSave(serializeHousingSave(s));
   const events=s.publicSpaces.events;
   const first=events.find(e=>e.kind==='established');assert.ok(first);
   const years=new Set([first.year-1,first.year,1000,2000]);
   for(const kind of ['overgrown','reused']){
    const event=events.find(e=>e.kind===kind);
    if(event){years.add(event.year-1);years.add(event.year);}
   }
   const frames=[];
   for(const year of [...years].sort((a,b)=>a-b)){
    const snapshot=snapshotAt(s,year,0),again=snapshotAt(restored,year,0);
    assert.deepEqual(again,snapshot);
    const frame=await page.evaluate(async({snapshot,again,housing,seed})=>{
     const {drawScene}=await import('/scene/draw.js');
     const paint=view=>{
      const c=document.createElement('canvas');drawScene(c,view,seed,housing);
      if(c.width!==320||c.height!==180)throw Error('unexpected resolution');
      return c;
     };
     const native=paint(snapshot),raw=native.toDataURL();
     if(paint(again).toDataURL()!==raw)throw Error('save/reload pixels changed');
     const without=paint({...snapshot,publicSpaces:undefined}).toDataURL();
     if(Boolean(snapshot.publicSpaces?.length)===(raw===without))
      throw Error('public-space visibility mismatch: '+JSON.stringify({seed,year:snapshot.year}));
     const large=document.createElement('canvas');large.width=1280;large.height=720;
     const c=large.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(native,0,0,1280,720);
     return {raw,large:large.toDataURL()};
    },{snapshot,again,housing:s.housing,seed});
    const prefix='artifacts/h4d7b-natural/seed'+seed+'_year'+year+'_ACTUAL';
    await writeFile(prefix+'_320x180.png',Buffer.from(frame.raw.split(',')[1],'base64'));
    await writeFile(prefix+'_4x.png',Buffer.from(frame.large.split(',')[1],'base64'));
    frames.push({year,spaces:snapshot.publicSpaces??[]});
   }
   observations.push({seed,events,frames});
  }
  await writeFile('artifacts/h4d7b-natural/provenance.json',JSON.stringify({
   status:'ACTUAL natural progression; no injected events',observations,
   note:'D7-B evidence only. Visual acceptance of the town centre is D7-C / Human review.',
  },null,2));
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
