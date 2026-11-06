/** D7-C: 自然史の景観証拠。画素差分は景観のHuman PASSではない。 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {snapshotAt} from '../dist/scene/model.js';
import {housingAt} from '../dist/story/housing-history.js';

const output='artifacts/h4d7c-review';
const seeds=[7,42,82],horizon=2000;
// 同一の固定カメラから同一矩形を切り出す。敷地・建築の座標は変更しない。
const crop={x:164,y:82,width:128,height:90};
const port='5294';
const server=spawn(process.execPath,['scripts/serve.mjs'],{
 env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+port);await mkdir(output,{recursive:true});
 const observations=[],sheetFrames=[];
 for(const seed of seeds){
  const state=createHousingCivilization(seed);
  while(state.year<horizon){step(state);if(state.pending)chooseAutomatically(state);}
  const wire=serializeHousingSave(state),restored=parseHousingSave(wire);
  const events=state.publicSpaces.events;
  const first=events.find(e=>e.kind==='established');assert.ok(first);
  const years=new Map();
  const add=(year,role)=>years.set(year,[...(years.get(year)??[]),role]);
  add(first.year-1,'before-establishment');add(first.year,'established');
  add(1000,'year1000');add(2000,'year2000');
  for(const kind of ['overgrown','reused']){
   const event=events.find(e=>e.kind===kind);
   if(event)add(event.year,kind);
  }
  const frames=[];
  for(const [year,roles] of [...years].sort(([a],[b])=>a-b)){
   const snapshot=snapshotAt(state,year,0),again=snapshotAt(restored,year,0);
   assert.deepEqual(again,snapshot);
   const measured=await page.evaluate(async({snapshot,again,housing,seed,crop})=>{
    const {drawScene}=await import('/scene/draw.js');
    const paint=view=>{
     const canvas=document.createElement('canvas');drawScene(canvas,view,seed,housing);
     if(canvas.width!==320||canvas.height!==180)throw Error('unexpected native size');
     return canvas;
    };
    const native=paint(snapshot),png=native.toDataURL('image/png');
    if(paint(again).toDataURL('image/png')!==png)throw Error('reloaded past pixels changed');
    const raw=native.getContext('2d').getImageData(0,0,320,180).data;
    // 表示だけを除いた同年の反実仮想。史実画像として保存しない。
    const hidden=paint({...snapshot,publicSpaces:undefined});
    const without=hidden.getContext('2d').getImageData(0,0,320,180).data;
    const spaces=(snapshot.publicSpaces??[]).map(space=>({
     id:space.id,condition:space.condition,footprint:space.footprint,changedInsidePlot:0,
     plotArea:space.footprint.width*space.footprint.depth,
    }));
    let changedPixels=0;
    for(let y=0;y<180;y++)for(let x=0;x<320;x++){
     const offset=(y*320+x)*4;
     if(![0,1,2,3].some(c=>raw[offset+c]!==without[offset+c]))continue;
     changedPixels++;
     for(const space of spaces){
      const f=space.footprint;
      if(x>=f.x&&x<f.x+f.width&&y>=f.y&&y<f.y+f.depth)space.changedInsidePlot++;
     }
    }
    if(!spaces.length&&changedPixels!==0)throw Error('unrecorded public space changes pixels');
    // 差分比に景観の合否閾値を設定しない。完全不可視だけは回帰として停止する。
    for(const space of spaces)if(space.changedInsidePlot===0)
     throw Error('fully hidden public space: '+JSON.stringify({seed,year:snapshot.year,space}));
    const enlarged=document.createElement('canvas');enlarged.width=1280;enlarged.height=720;
    const c=enlarged.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(native,0,0,1280,720);
    const detail=document.createElement('canvas');detail.width=crop.width*6;detail.height=crop.height*6;
    const d=detail.getContext('2d');d.imageSmoothingEnabled=false;
    d.drawImage(native,crop.x,crop.y,crop.width,crop.height,0,0,detail.width,detail.height);
    return {native:png,enlarged:enlarged.toDataURL('image/png'),detail:detail.toDataURL('image/png'),
     changedPixels,spaces};
   },{snapshot,again,housing:state.housing,seed,crop});
   const prefix='seed'+seed+'_year'+year+'_ACTUAL';
   const files={native:prefix+'_320x180.png',enlarged:prefix+'_4x.png',detail:prefix+'_detail_6x.png'};
   for(const key of ['native','enlarged','detail'])
    await writeFile(output+'/'+files[key],Buffer.from(measured[key].split(',')[1],'base64'));
   for(const role of roles.filter(r=>['before-establishment','established','year1000'].includes(r)))
    sheetFrames.push({seed,year,role,png:measured.native,referencePlot:first.after.footprint,
     condition:snapshot.publicSpaces?.[0]?.condition??'not established'});
   const blocks=housingAt(state.housing,year,'river-bank').blocks;
   frames.push({year,roles,files,scale:snapshot.visual?.scale,
    sitePopulation:snapshot.local.population,spaces:snapshot.publicSpaces??[],
    facilities:snapshot.objects.filter(o=>['hall','market'].includes(o.kind)).map(o=>({
     id:o.id,kind:o.kind,x:o.x,y:o.y,condition:o.condition,civic:Boolean(o.civic),
    })),
    residentialBlocks:blocks.length,
    occupiedBlocks:blocks.filter(b=>b.condition!=='ruined'&&b.use!=='vacant').length,
    measurement:{changedPixels:measured.changedPixels,spaces:measured.spaces},
   });
  }
  assert.equal(serializeHousingSave(state),wire,'観測・描画から履歴やRNGを変更しない');
  observations.push({seed,horizon,events,frames});
 }
 const comparison=await page.evaluate(async frames=>{
  const order=['before-establishment','established','year1000'];
  const canvas=document.createElement('canvas');canvas.width=1984;canvas.height=1408;
  const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
  c.fillStyle='#f4f0e6';c.fillRect(0,0,canvas.width,canvas.height);
  c.fillStyle='#303d32';c.font='30px sans-serif';
  c.fillText('D7-C | Assembly ground in its town',24,40);
  c.font='19px sans-serif';
  c.fillText('Actual natural history | 320 x 180 enlarged 2x | No buildings or events inserted',24,73);
  c.fillText('Before establishment',24,112);c.fillText('Established',680,112);c.fillText('1,000 years',1336,112);
  for(const frame of frames){
   const col=order.indexOf(frame.role),row=[7,42,82].indexOf(frame.seed);
   const x=16+col*656,y=136+row*410;
   c.fillStyle='#303d32';c.font='19px sans-serif';
   c.fillText('seed '+frame.seed+' | year '+frame.year+' | '+frame.condition,x+4,y+22);
   const image=new Image();image.src=frame.png;await image.decode();
   c.drawImage(image,x,y+34,640,360);
   const f=frame.referencePlot;
   c.strokeStyle='#b54d39';c.lineWidth=1;
   c.strokeRect(x+f.x*2-2,y+34+f.y*2-2,f.width*2+4,f.depth*2+4);
  }
  c.fillStyle='#62685d';c.font='18px sans-serif';
  c.fillText('Outline: the same plot location. In the left column it is only a reference; the space does not yet exist.',24,1370);
  c.fillText('Pixel differences are diagnostic evidence. Town-centre quality requires a separate visual judgement.',24,1396);
  return canvas.toDataURL('image/png');
 },sheetFrames);
 await writeFile(output+'/h4d7c_town_comparison.png',Buffer.from(comparison.split(',')[1],'base64'));
 const report={
  contract:'H4-D7-C',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
  source:'actual deterministic natural progression; no injected events',crop,
  measurementNote:'Pixel differences compare the same year with public-space display suppressed. This is a hypothetical display-only comparison, not another history. Differences are not a visible-area percentage or Human visual acceptance.',
  acceptance:{humanReview:'pending',milestoneB:'not-complete',
   assistantAssessment:'The hall frontage and land-use transitions are readable; a town centre linking homes and market remains unproven.'},
  observations,
 };
 await writeFile(output+'/review.json',JSON.stringify(report,null,2));
 const rows=['# D7-C natural-history review','',
  'All ACTUAL PNGs are recorded natural history. No buildings or land-use events were inserted.',
  'Pixel counts are differences from a display-only suppression, not visible-area percentages or a visual PASS.','',
  '| Seed | Year | Roles | State | Plot delta / area |',
  '| --- | ---: | --- | --- | ---: |'];
 for(const obs of observations)for(const frame of obs.frames){
  const m=frame.measurement.spaces[0];
  rows.push(`| ${obs.seed} | ${frame.year} | ${frame.roles.join(', ')} | ${m?.condition??'not established'} | ${m?m.changedInsidePlot+' / '+m.plotArea:'—'} |`);
 }
 rows.push('','Human visual acceptance: pending. Milestone B: not complete.');
 await writeFile(output+'/README.md',rows.join('\n')+'\n');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({type:'h4d7c-review',output,sourceHead:report.sourceHead,
  observations:observations.map(o=>({seed:o.seed,frames:o.frames.map(f=>({year:f.year,roles:f.roles,measurement:f.measurement}))}))}));
}finally{await browser?.close();server.kill();}
