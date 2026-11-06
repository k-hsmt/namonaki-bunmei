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
import {projectCivicApproaches} from '../../dist/scene/civic-approach.js';
const PNG=src=>Buffer.from(src.split(',')[1],'base64');

test('H4-D6: 実在する建設前後の風景を原寸/4倍で比較・保存画素一致',async()=>{
 const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:'5290'},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:900,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5290');
  await mkdir('artifacts/h4d6-footfall',{recursive:true});
  const observations=[];
  for(const seed of [7,42,82]){
   const state=createHousingCivilization(seed);
   while(state.year<2000){step(state);if(state.pending)chooseAutomatically(state);}
   const other=parseHousingSave(serializeHousingSave(state));
   const building=state.observation.sites[0].view.buildings.find(b=>b.civic);
   assert.ok(building,'自然の大型共同建築の履歴が存在する');
   const years=[building.builtYear-1,building.builtYear,1000,2000];
   for(const year of [...new Set(years)].sort((a,b)=>a-b)){
    const snap=snapshotAt(state,year,0),reloaded=snapshotAt(other,year,0);
    assert.deepEqual(snap,reloaded);
    const scene=composeScene(snap,state.housing);
    const marks=projectCivicApproaches(scene,snap.objects);
    const image=await page.evaluate(async({snap,housing,seed})=>{
     const {drawScene}=await import('/scene/draw.js');
     const make=()=>{
      const canvas=document.createElement('canvas');
      drawScene(canvas,snap,seed,housing);
      if(canvas.width!==320||canvas.height!==180)throw Error('invalid native resolution');
      return canvas;
     };
     const a=make(),b=make();
     if(a.toDataURL('image/png')!==b.toDataURL('image/png'))throw Error('nondeterministic pixels');
     const large=document.createElement('canvas');
     large.width=1280;large.height=720;
     const ctx=large.getContext('2d');ctx.imageSmoothingEnabled=false;
     ctx.drawImage(a,0,0,1280,720);
     return {native:a.toDataURL('image/png'),large:large.toDataURL('image/png')};
    },{snap,housing:state.housing,seed});
    const resumed=await page.evaluate(async({snap,housing,seed})=>{
     const {drawScene}=await import('/scene/draw.js');
     const c=document.createElement('canvas');
     drawScene(c,snap,seed,housing);
     return c.toDataURL('image/png');
    },{snap:reloaded,housing:other.housing,seed});
    assert.equal(image.native,resumed,'再開後にも同じ歴史が同一画素を描く');
    const prefix='seed'+seed+'_year'+year;
    await writeFile('artifacts/h4d6-footfall/'+prefix+'_ACTUAL_320x180.png',PNG(image.native));
    await writeFile('artifacts/h4d6-footfall/'+prefix+'_ACTUAL_4x.png',PNG(image.large));
    observations.push({seed,year,actualCivicIds:snap.objects.filter(b=>b.civic).map(b=>b.id),
     marks:marks.map(m=>({kind:m.kind,x:m.x,y:m.y,width:m.width,depth:m.depth,anchors:m.anchors}))});
    if(year===building.builtYear-1)assert.deepEqual(marks,[]);
   }
  }
  assert.ok(observations.some(x=>x.marks.length>0),
   '自然文明の画像に描く足跡が一件もない場合、UI改善と呼べない');
  await writeFile('artifacts/h4d6-footfall/provenance.json',JSON.stringify({
   type:'recorded natural scenes; no hypothetical buildings or roads',
   note:'Marks are purely graphical footprints between recorded civic and residential plots, not historical roads.',
   observations,
  },null,2));
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
