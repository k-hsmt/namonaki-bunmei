/** D5 natural worlds, lossless production saves and historical scenery.
 * Run after build, separately from the performance benchmark (includes IO).
 */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createNewWorld} from '../dist/story/new-world.js';
import {advanceGeneratedFacilityReview} from '../dist/story/generated-facility-review.js';
import {generatedPublicSpaceExtension} from '../dist/story/generated-public-space-review.js';
import {createGeneratedWorldSave,restoreGeneratedWorld} from '../dist/story/world-save.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';
const out='artifacts/terrain31-d5',seeds=[1,3,6,29,85,131,7,198,10,12,21,24];
const sites=['river-bank','hill-side','coast-inlet'],checkpoints=[0,1,99,100,101,1000,2000,10000];
const sourceSHA=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fixture=JSON.parse(await readFile('tests/fixtures/generated-progression-reference-v1.json','utf8'));
await mkdir(out,{recursive:true});
const report={sourceSHA,dirty,rendererId:'generated-scene-v1',mode:'generated',policy:'terrain-placement-v1',
 selection:'Same twelve worlds as Q5, without exclusions; all advanced naturally to 10000 with automatic choices',
 seeds,checkpoints,cases:[],failures:[],humanSceneryAcceptance:'pending',
 limitations:['Includes save/load, observation and IO; timings are not the annual performance benchmark',
 'Single-family catalog is maintained separately in terrain31-world; human review remains required']};
for(const seed of seeds){
 try{
  let outer=createNewWorld(seed).review;
  const early=new Map(),holds=new Map(),periods={},timings=[];let previous=performance.now();
  const extension={additionalOccupancy:generatedPublicSpaceExtension.additionalOccupancy,afterFacilities(r,s){
   generatedPublicSpaceExtension.afterFacilities(r,s);
   const now=performance.now();timings.push({year:s.year,ms:now-previous});previous=now;
   for(const [key,count] of Object.entries(r.diagnostics.holds)){
    const old=holds.get(key)??0;if(count>old){const list=periods[key]??=[],last=list.at(-1);
     if(last&&last.toYear===s.year-1){last.toYear=s.year;last.decisions+=count-old;}
     else list.push({fromYear:s.year,toYear:s.year,decisions:count-old});periods[key]=list;
    }holds.set(key,count);
   }
  }};
  const saves=[];
  for(const year of checkpoints){
   if(year>outer.review.state.year){previous=performance.now();outer={...outer,review:advanceGeneratedFacilityReview(outer.review,year-outer.review.state.year,'automatic',extension)};}
   for(let index=0;index<3;index++)early.set(`${year}:${index}`,hash(observeGeneratedSceneReview(outer,year,index)));
   const pinned=fixture.cases.find(c=>c.seed===seed&&c.year===year);
   if(pinned)assert.equal(hash(outer.review.state),pinned.stateSha256,`seed ${seed} year ${year} differs from original complete state`);
   if([0,100,1000,10000].includes(year)){
    const start=performance.now(),save=createGeneratedWorldSave(outer),encoded=await encodeWorldSave(save),decoded=await decodeWorldSave(encoded.json),restored=restoreGeneratedWorld(decoded);
    assert.deepEqual(restored.review.state,outer.review.state);assert.deepEqual(restored.review.placements,outer.review.placements);
    saves.push({year,plainBytes:Buffer.byteLength(encoded.plain),storedBytes:Buffer.byteLength(encoded.json),roundtripMs:performance.now()-start,stateSha256:hash(decoded.state)});
    await writeFile(`${out}/seed${seed}_year${year}_save.json`,encoded.json);
    // Continue from a validated, decoded production save at every boundary.
    outer=restored;holds.clear();
   }
  }
  const stateHash=hash(outer.review.state);
  for(const [key,expected] of early){const [year,index]=key.split(':').map(Number);assert.equal(hash(observeGeneratedSceneReview(outer,year,index)),expected,`past scene changed: ${seed}/${key}`);}
  assert.equal(hash(outer.review.state),stateHash,'observation mutated the present');
  const districts=sites.map((site,index)=>{
   const changes=outer.review.state.observation.sites[index].changes;
   const phases=Object.fromEntries(['settlement','village','town','city'].map((name,scale)=>[name,changes.find(c=>c.view.inhabited&&c.view.scale===scale)?.year??null]));
   phases.decline=changes.find((c,i)=>i>0&&c.view.scale<changes[i-1].view.scale)?.year??null;
   const years=[...new Set([0,100,1000,10000,...Object.values(phases).filter(y=>y!==null)])].sort((a,b)=>a-b);
   const unbuilt=outer.review.plans[site].slots.filter(slot=>!outer.review.placements.some(p=>p.objectId===slot.id)&&!outer.review.bridgeReview.bridges.some(b=>b.geometry.bridgeId===slot.id)).map(slot=>({id:slot.id,kind:slot.kind}));
   return {site,variants:outer.review.terrain.sites[site].variants,phases,years,unbuilt};
  });
  const row={seed,year:10000,stateSha256:stateHash,saves,districts,holdPeriods:periods,
   maximumHookInterval:timings.reduce((a,b)=>a.ms>b.ms?a:b,{year:0,ms:0}),pastObservationChecks:early.size};
  await writeFile(`${out}/seed${seed}_review.json`,JSON.stringify(outer));report.cases.push(row);
  console.log(JSON.stringify({seed,status:'longrun/save/past-checked',stateSha256:stateHash}));
 }catch(error){report.failures.push({seed,error:String(error),stack:error.stack});console.log(JSON.stringify({seed,error:String(error)}));}
 await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
}
assert.equal(report.failures.length,0,'longrun failures; see report.json');
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5311'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage(),blocked=[];
 await page.route('**/*',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.includes('prototype')||path.includes('/capture-terrain')){blocked.push(path);return route.abort();}
  if(path==='/d5-review')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>D5 natural scenery</title>'});return route.continue();
 });await page.goto('http://127.0.0.1:5311/d5-review');
 for(const row of report.cases){
  const json=await readFile(`${out}/seed${row.seed}_year10000_save.json`,'utf8');
  const images=await page.evaluate(async ({json,districts,expectedHash})=>{
   const {decodeWorldSave,storeWorldSave,findWorldSave}=await import('/story/world-storage.js');
   const {WORLD_SAVE_KEY,restoreGeneratedWorld}=await import('/story/world-save.js');
   const {observeGeneratedSceneReview}=await import('/scene/generated-scene-review.js');
   const {drawGeneratedSceneReview}=await import('/scene/draw-generated-review.js');
   const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
   const save=await decodeWorldSave(json);if(await digest(save.state)!==expectedHash)throw Error('Browser decode changed full state');
   if((await storeWorldSave(localStorage,save)).status!=='saved')throw Error('10000-year production save exceeded quota');
   const reopened=await findWorldSave(k=>localStorage.getItem(k));if(await digest(reopened.state)!==expectedHash)throw Error('localStorage reopen changed state');
   const outer=restoreGeneratedWorld(reopened),frames=[];
   for(let index=0;index<3;index++)for(const year of districts[index].years){
    const o=observeGeneratedSceneReview(outer,year,index),canvas=document.createElement('canvas');drawGeneratedSceneReview(canvas,o);const raw=canvas.toDataURL();
    const copy=document.createElement('canvas');drawGeneratedSceneReview(copy,o);if(copy.toDataURL()!==raw)throw Error('Repeated PNG changed');
    const enlarged=document.createElement('canvas');enlarged.width=1280;enlarged.height=720;const c=enlarged.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(canvas,0,0,1280,720);
    frames.push({index,year,raw,large:enlarged.toDataURL()});
   }
   if(await digest(outer.review.state)!==expectedHash)throw Error('Rendering mutated state');localStorage.removeItem(WORLD_SAVE_KEY);return frames;
  },{json,districts:row.districts,expectedHash:row.stateSha256});
  for(const im of images)for(const kind of ['raw','large'])await writeFile(`${out}/seed${row.seed}_${sites[im.index]}_year${im.year}_${kind}.png`,Buffer.from(im[kind].split(',')[1],'base64'));
  row.browserStorageRoundtrip=true;row.repeatPngChecks=images.length;
  console.log(JSON.stringify({seed:row.seed,status:'browser-storage/scenery-checked',frames:images.length}));
 }
 assert.deepEqual(blocked,[]);report.generatorImports=blocked;
}finally{await browser?.close();server.kill();}
const rows=report.cases.flatMap(row=>row.districts.map(d=>`<section><h2>seed ${row.seed} / ${d.site}</h2><p>${JSON.stringify(d.variants)} / natural progression</p><p>${Object.entries(d.phases).map(([name,year])=>`${name}: ${year??'unreached'}`).join(' · ')}</p><div class="row">`+d.years.map(year=>{
 const name=`seed${row.seed}_${d.site}_year${year}`;
 return `<article><h3>year ${year}</h3><img width="320" height="180" src="${name}_raw.png"><details><summary>4×</summary><img src="${name}_large.png"></details></article>`;
}).join('')+'</div></section>'));
await writeFile(out+'/index.html',`<!doctype html><meta charset="utf-8"><title>Issue31 D5 scenery</title><style>body{font:15px sans-serif;background:#eee8da;color:#354333}.row{display:flex;gap:16px;overflow:auto}article{min-width:330px}img{image-rendering:pixelated}section{margin-bottom:32px}</style><h1>D5: twelve natural worlds to year 10000</h1><p>sourceSHA ${sourceSHA}; renderer generated-scene-v1; local changes: ${dirty.join(', ')||'none'}. Human acceptance pending. Unreached phases are retained.</p><p><a href="../terrain31-world/index.html">Separate prototype family catalog (see its own provenance)</a></p>`+rows.join(''));
await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({worlds:report.cases.length,failures:report.failures.length,humanSceneryAcceptance:'pending',index:out+'/index.html'}));
