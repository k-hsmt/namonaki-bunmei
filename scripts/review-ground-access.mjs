/** Q6 physical feasibility comparison only; deliberately not a construction/longrun audit. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {recordSites} from '../dist/terrain/terrain-record-types.js';
import {reviewPhysicalPlot,groundReviewLimits} from '../dist/terrain/ground-access-review.js';
import {proposeInitialAccess} from '../dist/terrain/initial-access-review.js';
import {findPlacementReview} from '../dist/terrain/placement-search-review.js';
import {southEntrance} from '../dist/terrain/ground-access-review.js';
const out='artifacts/terrain31-ground',seeds=[1,3,6,29,85,131,7,198,10,12,21,24];
const sizes=[['house',18,7],['field',26,14],['housing',18,8],['civic',44,22],['civic-large',56,30],['public-space',24,10]];
const old={...groundReviewLimits,normalRelief:2,flatRelief:1},cases=[],images=[];
await mkdir(out,{recursive:true});
for(const seed of seeds){
 const result=generateWorldPrototype(seed);
 if(result.status!=='ok'){cases.push({seed,status:result.status,reason:result.reason});continue;}
 const record=captureTerrainRecord(result.world,process.env.REVIEW_SOURCE_SHA??'local-unidentified');
 for(const site of recordSites){
  const raster=decodeRecordPhysics(record.sites[site].physics),counts=[],origins=[];
  const start=performance.now();
  for(const [kind,width,depth] of sizes){
   const reasons={},purpose=kind==='civic-large'?'civic':kind;let baseline=0,revised=0,total=0;
   for(let y=96;y+depth<=180;y+=2)for(let x=2;x+width<=320;x+=2){
    const plot={x,y,width,depth},a=reviewPhysicalPlot(raster,purpose,plot,old),b=reviewPhysicalPlot(raster,purpose,plot);
    total++;baseline+=+(a.status==='clear');
    if(b.status==='clear'){revised++;if(kind==='house')origins.push([x,y]);}
    else reasons[b.reason]=(reasons[b.reason]??0)+1;
    assert.ok(!(b.status==='clear'&&a.status!=='clear'),'stricter foundation must be a subset');
   }
   assert.equal(total,revised+Object.values(reasons).reduce((a,b)=>a+b,0));
   counts.push({kind,width,depth,total,baselinePhysicalCandidates:baseline,revisedPhysicalCandidates:revised,rejectedByRevision:baseline-revised,holdReasons:reasons});
  }
  const initialAccess=proposeInitialAccess(record,site);
  const hallSearch=initialAccess.status==='review-only'?findPlacementReview({terrain:record,site,year:0,confirmedYear:0,historyStatus:'known',primaryRoot:initialAccess.primaryRoot,
   occupancy:[{id:'house',plot:initialAccess.house,entrance:southEntrance(initialAccess.house)},{id:'field',plot:initialAccess.field,entrance:southEntrance(initialAccess.field)}],reservations:[]},
   {objectId:'trial-hall',purpose:'hall',width:18,depth:7,nucleus:initialAccess.nucleus,neighborEntrances:[initialAccess.nucleus]}):null;
  cases.push({seed,site,status:'review-only',variants:record.sites[site].variants,counts,initialAccess,hallSearch,elapsedMs:Math.round(performance.now()-start)});
  images.push({seed,site,record,origins,initialAccess});
 }
}
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5297'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage();
 await page.route('**/ground-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Q6 physical comparison</title>'}));
 await page.goto('http://127.0.0.1:5297/ground-review');const tiles=[];
 for(const item of images){
  const png=await page.evaluate(async ({record,site,origins,initialAccess})=>{
   const {validateTerrainRecord}=await import('/terrain/terrain-record.js');
   const {drawTerrainRecord}=await import('/terrain/draw-terrain-record-v1.js');
   const canvas=document.createElement('canvas');drawTerrainRecord(canvas,validateTerrainRecord(record),site);
   const raw=canvas.toDataURL(),ctx=canvas.getContext('2d');ctx.fillStyle='#ff42e2';
   for(const [x,y] of origins)ctx.fillRect(record.sites[site].render.mirrorX?319-x:x,y,1,1);
   const overlay=canvas.toDataURL();const big=document.createElement('canvas');big.width=1280;big.height=720;
   const z=big.getContext('2d');z.imageSmoothingEnabled=false;
   const img=new Image();img.src=raw;await img.decode();z.drawImage(img,0,0,1280,720);
   const large=big.toDataURL();z.clearRect(0,0,1280,720);z.drawImage(canvas,0,0,1280,720);
   const overlayLarge=big.toDataURL();drawTerrainRecord(canvas,validateTerrainRecord(record),site);
   if(initialAccess.status==='review-only'){
    const mirror=record.sites[site].render.mirrorX;
    for(const [p,color] of [[initialAccess.house,'#9c4949'],[initialAccess.field,'#d8c55b']]){
     ctx.fillStyle=color;ctx.globalAlpha=.8;ctx.fillRect(mirror?320-p.x-p.width:p.x,p.y,p.width,p.depth);ctx.globalAlpha=1;
    }
    for(const [p,color] of [[initialAccess.primaryRoot,'#ffffff'],[initialAccess.nucleus,'#000000']]){ctx.fillStyle=color;ctx.fillRect(mirror?318-p[0]:p[0],p[1],2,2);}
   }
   const plan=canvas.toDataURL();z.clearRect(0,0,1280,720);z.drawImage(canvas,0,0,1280,720);
   return {raw,large,overlay,overlayLarge,initialPlan:plan,initialPlanLarge:big.toDataURL()};
  },item);
  for(const [kind,data] of Object.entries(png))await writeFile(`${out}/seed${item.seed}_${item.site}_${kind}.png`,Buffer.from(data.split(',')[1],'base64'));
  tiles.push({label:`seed ${item.seed} ${item.site}`,image:png.overlay});
 }
 const sheet=await page.evaluate(async tiles=>{
  const c=document.createElement('canvas');c.width=1024;c.height=70+Math.ceil(tiles.length/3)*212;const z=c.getContext('2d');
  z.fillStyle='#f4f0e6';z.fillRect(0,0,c.width,c.height);z.fillStyle='#354333';z.font='16px sans-serif';
  z.fillText('Q6 review only: magenta = physically eligible house origins; access NOT checked',12,25);
  z.fillText('No actual buildings, initial plan, reserved sites, or production policy. All 12 seeds included.',12,49);
  for(let i=0;i<tiles.length;i++){const x=12+i%3*338,y=70+Math.floor(i/3)*212;z.fillText(tiles[i].label,x,y+16);const img=new Image();img.src=tiles[i].image;await img.decode();z.drawImage(img,x,y+22);}
  return c.toDataURL();
 },tiles);
 await writeFile(out+'/physical-candidates.png',Buffer.from(sheet.split(',')[1],'base64'));
}finally{await browser?.close();server.kill();}
const report={status:'Q6_PHYSICAL_REVIEW_ONLY',sourceSHA:process.env.REVIEW_SOURCE_SHA??'local-unidentified',seeds,baseline:old,revised:groundReviewLimits,
 limitations:['Not a construction permit: root access and occupancy not included in physical counts','Initial proposals check joint access but use trial field ordering, not final facility scoring','No Q5 reservation comparison yet','No generated-world progression or D5 longrun','No production policy activation'],cases};
await writeFile(out+'/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,requestedWorlds:seeds.length,generatedWorlds:images.length/3,failedWorlds:cases.filter(c=>c.status==='hold').length,scenes:images.length}));
