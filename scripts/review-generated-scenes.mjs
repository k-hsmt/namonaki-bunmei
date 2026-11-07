/** D4-A/Q5: fixed twelve-world trial, three policies, same-year actual scenery. */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';import {once} from 'node:events';import {chromium} from 'playwright';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {captureRiverReaches} from '../dist/terrain/river-reaches-review.js';import {createGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {advanceGeneratedFacilityReview} from '../dist/story/generated-facility-review.js';import {generatedPublicSpaceExtension,validateGeneratedPublicSpaceLedger} from '../dist/story/generated-public-space-review.js';
import {validateGeneratedBridgeLedger} from '../dist/story/generated-bridge-history-review.js';
import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';import {createHousingCivilization} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
const out='artifacts/terrain31-scenes',seeds=[1,3,6,29,85,131,7,198,10,12,21,24],modes=['wide','field-only','none'],sites=['river-bank','hill-side','coast-inlet'];
const cases=[],failures=[],frames=[];await mkdir(out,{recursive:true});
const core=s=>Object.fromEntries(['rngState','population','food','cohesion','knowledge','exchange','culture','drought','epidemic'].map(k=>[k,s[k]]));
const hazards=s=>s.history.filter(e=>['flood','fire','storm','earthquake'].includes(e.kind)).map(e=>[e.year,e.kind]);
function periods(events){
 const groups=new Map();for(const e of events){const key=[e.site,e.kind,e.reason].join(':');const list=groups.get(key)??[],last=list.at(-1);
  if(last&&e.year===last.toYear+1){last.toYear=e.year;last.decisions+=e.decisions;}else list.push({fromYear:e.year,toYear:e.year,decisions:e.decisions});groups.set(key,list);}
 return Object.fromEntries(groups);
}
for(const seed of seeds){
 try{
  const world=generateWorldPrototype(seed);if(world.status!=='ok'){failures.push({seed,stage:'generation',result:world});continue;}
  const terrain=captureTerrainRecord(world.world,process.env.REVIEW_SOURCE_SHA??'local-unidentified'),initial=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'none');
  if(initial.status!=='review-only'){failures.push({seed,stage:'initial-plan',result:initial});continue;}
  const baseline=createHousingCivilization(seed);while(baseline.year<2000){step(baseline);if(baseline.pending)chooseAutomatically(baseline);}
  await writeFile(`${out}/seed${seed}_terrain.json`,JSON.stringify(terrain));
  for(const mode of modes){
   const began=performance.now(),events=[],counts=new Map();
   const extension={additionalOccupancy:generatedPublicSpaceExtension.additionalOccupancy,afterFacilities(r,s){
    generatedPublicSpaceExtension.afterFacilities(r,s);
    for(const [key,count] of Object.entries(r.diagnostics.holds)){const previous=counts.get(key)??0;if(count>previous){const [site,kind,reason]=key.split(':');events.push({year:s.year,site,kind,reason,decisions:count-previous});}counts.set(key,count);}
   }};
   const input={...initial.review,reservationMode:mode},review=advanceGeneratedFacilityReview(input,2000,'automatic',extension),outer={format:'generated-bridge-review',status:'review-only',review};
   validateGeneratedBridgeLedger(review);validateGeneratedPublicSpaceLedger(review,2000);
   assert.deepEqual(core(review.state),core(baseline));assert.deepEqual(review.state.decisions,baseline.decisions);assert.deepEqual(hazards(review.state),hazards(baseline));
   const districts=sites.map((site,index)=>{
    const o=observeGeneratedSceneReview(outer,2000,index),ledger=review.state.observation.sites[index],base=baseline.observation.sites[index];
    const houses=o.composition.residentialBlocks,unbuilt=review.plans[site].slots.filter(slot=>slot.kind!=='bridge'&&!o.snapshot.objects.some(b=>b.id===slot.id)).map(slot=>({id:slot.id,kind:slot.kind}));
    return {site,variants:terrain.sites[site].variants,housingBlocks:houses.length,housingUnits:houses.reduce((n,b)=>n+b.housingCount,0),housingArea:houses.reduce((n,b)=>n+b.footprint.width*b.footprint.depth,0),
     facilities:o.snapshot.objects.length,unbuiltOrdinary:unbuilt,civic:o.snapshot.objects.filter(b=>b.civic).length,publicSpaces:o.snapshot.publicSpaces?.length??0,
     bridge:o.ground.bridges.length,cityFirstYear:ledger.changes.find(c=>c.view.scale===3)?.year??null,baselineCityFirstYear:base.changes.find(c=>c.view.scale===3)?.year??null,
     declineFirstYear:ledger.changes.find((c,n)=>n>0&&c.view.scale<ledger.changes[n-1].view.scale)?.year??null};
   });
   const name=`seed${seed}_${mode}`;await writeFile(`${out}/${name}_review.json`,JSON.stringify(outer));frames.push({name,outer});
   cases.push({seed,mode,year:2000,districts,holds:review.diagnostics.holds,holdPeriods:periods(events),directModelEqual:true,elapsedMs:Math.round(performance.now()-began)});
   console.log(JSON.stringify({seed,mode,status:'checked',year:2000}));
  }
 }catch(error){failures.push({seed,error:String(error),stack:error.stack});}
}
const report={status:'D4A_Q5_REVIEW_ONLY',sourceSHA:process.env.REVIEW_SOURCE_SHA??'local-unidentified',seeds,modes,cases,failures,
 limitations:['Trial constants and reservation policy remain unapproved','2,000-year Q5 comparison; not the D5 longrun acceptance','Fixed coordinate atmospheric/activity effects await terrain-aware replacements','Human scenery acceptance and production policy approval remain required']};
await writeFile(out+'/report.json',JSON.stringify(report,null,2));
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5299'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage();
 await page.route('**/generated-scene-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Generated scene comparison</title>'}));await page.goto('http://127.0.0.1:5299/generated-scene-review');
 for(const {name,outer} of frames)for(let index=0;index<3;index++){
  const images=await page.evaluate(async ({outer,index})=>{
   const {observeGeneratedSceneReview}=await import('/scene/generated-scene-review.js');const {drawGeneratedSceneReview}=await import('/scene/draw-generated-review.js');
   const o=observeGeneratedSceneReview(outer,2000,index),c=document.createElement('canvas');drawGeneratedSceneReview(c,o);const raw=c.toDataURL();
   const repeated=document.createElement('canvas');drawGeneratedSceneReview(repeated,o);if(repeated.toDataURL()!==raw)throw Error('Generated rendering changed during repeat');
   const large=document.createElement('canvas');large.width=1280;large.height=720;const z=large.getContext('2d');z.imageSmoothingEnabled=false;z.drawImage(c,0,0,1280,720);return {raw,large:large.toDataURL()};
  },{outer,index});
  for(const [kind,data] of Object.entries(images))await writeFile(`${out}/${name}_${sites[index]}_${kind}.png`,Buffer.from(data.split(',')[1],'base64'));
 }
}finally{await browser?.close();server.kill();}
const rows=seeds.flatMap(seed=>sites.map(site=>`<section><h2>seed ${seed}, ${site}, year 2000</h2><div class="row">`+modes.map(mode=>{
 const d=cases.find(c=>c.seed===seed&&c.mode===mode)?.districts.find(d=>d.site===site);if(!d)return `<article>${mode}: generation/plan failed; see report</article>`;
 const name=`seed${seed}_${mode}_${site}`;return `<article><h3>${mode}</h3><p>housing ${d.housingBlocks}, area ${d.housingArea}px; unbuilt ${d.unbuiltOrdinary.length}; city ${d.cityFirstYear??'not reached'}</p><img width="320" height="180" src="${name}_raw.png"><details><summary>4×</summary><img src="${name}_large.png"></details></article>`;
 }).join('')+'</div></section>'));
await writeFile(out+'/index.html','<!doctype html><meta charset="utf-8"><title>Q5 generated scenery comparison</title><style>body{font:15px sans-serif;background:#eee8da;color:#354333}.row{display:flex;gap:16px}article{width:330px}img{image-rendering:pixelated}details[open] img{position:relative;z-index:1}section{margin-bottom:32px}</style><h1>Q5: same twelve worlds × three reservation policies</h1><p>Confirmed year 2000. Trial renderer; atmosphere/activity effects still under development. No policy selected. Failures and unreached city outcomes remain in the report.</p>'+rows.join(''));
const table=['| seed | site | mode | houses | area px | unbuilt ordinary | civic | public | bridge | city year | baseline city |','| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |'];
for(const c of cases)for(const d of c.districts)table.push(`| ${c.seed} | ${d.site} | ${c.mode} | ${d.housingBlocks} | ${d.housingArea} | ${d.unbuiltOrdinary.length} | ${d.civic} | ${d.publicSpaces} | ${d.bridge} | ${d.cityFirstYear??'unreached'} | ${d.baselineCityFirstYear??'unreached'} |`);
await writeFile(out+'/comparison.md',table.join('\n')+'\n');assert.equal(failures.length,0);assert.equal(cases.length,seeds.length*modes.length);
console.log(JSON.stringify({status:report.status,worlds:seeds.length,trials:cases.length,scenes:frames.length*3,failures:failures.length}));
