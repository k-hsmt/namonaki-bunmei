/**
 * Issue #39 D5: acceptance audit of investigating the landscape (D0 §9, §10 D5).
 *
 *   npm run build && node scripts/audit-issue39-d5.mjs   →  artifacts/history39-d5/{report.json,gallery.html,*.png}
 *   Env: CHROMIUM_PATH, D5_PORT, HISTORY_D5_QUICK=1 (3 worlds, up to year 1500: CI).
 *
 * Node — each world advanced in one go to the last audited year, and in steps through every audited year (reading the
 * history of all 3 sites at each step, as a viewer would), each step saved and restored. At every audited year and site:
 *  - the land record and every target's history agree across the one-go, stepped and restored worlds (a later history
 *    never changes an earlier year);
 *  - every answer agrees with the existing readers of that year (settlement ledger, housing reader, channel view);
 *    nothing after the year is listed; every chronicle link names an entry of the same year (and the same building);
 *  - reading changes nothing: the save before and after is the same, and the stepped save equals the one-go save.
 * Browser (Chromium) — at every audited year and site: the pick mask's layers recompose the live still frame exactly;
 * the mask is the same for the one-go and the stepped-restored world; every target of the mask is recorded for that
 * year and site; every visible target is picked by a pixel of its own; mask build times. Images for the Human review.
 * Exits 1 when a check fails.
 */
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {encodeWorldSave,decodeWorldSave} from '../dist/story/world-storage.js';
import {historicalSourceOf,historicalTargetsAt,historicalSubjectAt,historicalSiteIds} from '../dist/story/historical-records.js';
import {siteAt} from '../dist/story/settlement-history.js';
import {housingAt} from '../dist/story/housing-history.js';
import {productionChannelAt} from '../dist/irrigation/production-history-v1.js';

const out='artifacts/history39-d5',quick=process.env.HISTORY_D5_QUICK==='1';
const YEARS=quick?[600,1000,1500]:[1000,2500,5000,7500,10000];
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);if(failures.length<=40)console.error('FAIL',m);}return ok;};
const firstSeed=(b,after=0)=>{for(let s=after+1;s<20000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}throw Error('no seed');};
const cases=quick?['temperate_forest','tropical_rainforest','tundra'].map(b=>({id:b,seed:firstSeed(b)}))
 :[...BIOME_KINDS.map(b=>({id:b,seed:firstSeed(b)})),{id:'temperate_forest-2',seed:firstSeed('temperate_forest',6)},{id:'boreal_forest-2',seed:firstSeed('boreal_forest',18)}];
const facilityText={intact:'建っている',damaged:'損傷している',ruined:'廃墟になっている'},bridgeText={intact:'渡ることができる',damaged:'損傷して渡れない',ruined:'廃墟となり渡れない'};
const waterText={active:'水が流れている',idle:'休止している',damaged:'傷み、水が止まっている',abandoned:'放棄されている',retired:'埋め戻されている'};
const keyOf=r=>r.kind+':'+(r.id??r.blockId??r.systemId);

/** Everything the history API answers for a site and year (land record plus each listed target's own answer). */
function answers(session,year,i){
 const src=historicalSourceOf(session),site=historicalSiteIds[i],list=historicalTargetsAt(src,site,year);
 return {list,json:JSON.stringify([list,list.map(s=>historicalSubjectAt(src,s.ref,year))])};
}
/** Checks one world's answers for a year and site against the existing readers. Returns coverage counts. */
function audit(session,year,i,label){
 const state=session.state,{list}=answers(session,year,i),site=siteAt(state.observation.sites,i,year),homes=housingAt(state.housing,year,historicalSiteIds[i]).blocks;
 const records=new Map(state.history.map(r=>[r.id,r])),n={targets:list.length,changes:0,linked:0,ruins:0,damagedBridges:0,backfilled:0,rebuilt:0,unsupported:0};
 for(const s of list){
  if(s.presence==='unsupported'){n.unsupported++;continue;}
  check(s.presence==='recorded'&&s.firstYear<=year,`${label}: ${s.title} listed but not recorded by ${year}`);
  for(const c of s.history){
   n.changes++;check(c.year<=year,`${label}: ${s.title} lists ${c.year} after ${year}`);
   if(c.linkedChronicleId){n.linked++;const r=records.get(c.linkedChronicleId);
    check(r&&r.year===c.year&&(s.ref.kind==='waterway'||r.buildingId===(s.ref.id??s.ref.blockId)),`${label}: ${s.title} ${c.year} links ${c.linkedChronicleId} of another year or building`);}
  }
  for(const g of s.generations)check(g.year<=year,`${label}: ${s.title} generation of ${g.year} after ${year}`);
  if(s.generations.length>1)n.rebuilt++;
  if(s.ref.kind==='facility'||s.ref.kind==='bridge'){
   const b=site.buildings.find(b=>b.id===s.ref.id);
   if(check(b,`${label}: ${s.ref.id} missing from the ledger`))check(s.currentCondition===(s.ref.kind==='bridge'?bridgeText:facilityText)[b.condition],`${label}: ${s.ref.id} condition`);
   if(b?.condition==='ruined')n.ruins++;if(s.ref.kind==='bridge'&&b?.condition!=='intact')n.damagedBridges++;
  }
  if(s.ref.kind==='housing-block'){const b=homes.find(b=>b.blockId===s.ref.blockId);check(b,`${label}: ${s.ref.blockId} missing from housing`);if(b?.condition==='ruined')n.ruins++;}
  if(s.ref.kind==='waterway'){
   // the channel view shows only the latest system; an earlier one is read from its own last event of the year
   const v=productionChannelAt(session.review,year).channel,own=session.review.irrigation.events.filter(e=>e.systemId===s.ref.systemId&&e.year<=year).at(-1)?.after;
   const status=v?.id===s.ref.systemId?v.status:own?.status;
   check(status&&s.currentCondition===waterText[status],`${label}: waterway ${s.ref.systemId} condition`);
   if(v?.id!==s.ref.systemId)check(status==='retired',`${label}: an earlier waterway ${s.ref.systemId} is not backfilled before the next one`);
   if(status==='retired')n.backfilled++;
  }
 }
 for(const b of site.buildings)if(b.kind!=='field')check(list.some(s=>s.ref.id===b.id),`${label}: ${b.id} stands but is not listed`);
 for(const b of homes)check(list.some(s=>s.ref.blockId===b.blockId),`${label}: ${b.blockId} recorded but not listed`);
 return n;
}

const worlds=[],coverage=[],nodeTimes=[];
for(const c of cases){
 const t0=Date.now(),created=(await createNewArchitectureWorld(c.seed)).architecture,chain=[];
 // stepped: advance to each audited year, reading all 3 sites at every step
 let prev=created,prevYear=0;
 for(const y of YEARS){prev=await advanceArchitectureWorld(prev,y-prevYear,'automatic');prevYear=y;chain.push(prev);const s=architectureProductionSession(prev);for(let i=0;i<3;i++)answers(s,y,i);}
 const batch=architectureProductionSession(await advanceArchitectureWorld(created,YEARS.at(-1),'automatic'));
 const before=JSON.stringify(await prepareWorldSessionSave(batch)),saves=[];
 let a=performance.now();historicalSourceOf(batch);historicalTargetsAt(historicalSourceOf(batch),'river-bank',YEARS.at(-1));nodeTimes.push({world:c.id,indexMs:performance.now()-a});
 for(const [k,y] of YEARS.entries()){
  const S=architectureProductionSession(chain[k]),json=(await encodeWorldSave(await prepareWorldSessionSave(S))).json,R=restoreWorldSession(await decodeWorldSave(json));saves.push(json);
  for(let i=0;i<3;i++){
   const label=`${c.id} ${y}/${i}`;a=performance.now();const B=answers(batch,y,i);const ms=performance.now()-a;
   check(B.json===answers(S,y,i).json&&B.json===answers(R,y,i).json,`${label}: the history differs between one-go, stepped and restored worlds`);
   coverage.push({world:c.id,year:y,site:i,...audit(batch,y,i,label)});nodeTimes.push({world:c.id,year:y,site:i,answersMs:ms});
  }
 }
 const after=JSON.stringify(await prepareWorldSessionSave(batch));
 check(before===after,`${c.id}: reading the history changed the save`);
 check(after===JSON.stringify(await prepareWorldSessionSave(architectureProductionSession(chain.at(-1)))),`${c.id}: one-go and stepped (reading while advancing) saves differ`);
 worlds.push({...c,batchJson:(await encodeWorldSave(await prepareWorldSessionSave(batch))).json,saves});
 console.log(c.id,'seed',c.seed,Math.round((Date.now()-t0)/1000)+'s');
}

const PORT=Number(process.env.D5_PORT??5399);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let browser;const browserRows=[],maskTimes=[],images=[],visibility=[];
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('server exited');})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await browser.newPage();page.setDefaultTimeout(1800000);
 await page.route('**/__d5__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>D5</title>'}));
 await page.goto(`http://127.0.0.1:${PORT}/__d5__`);
 for(const w of worlds){
  const r=await page.evaluate(async({batchJson,saves,years})=>{
   const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),M=await import('/scene/historical-pick-mask.js'),H=await import('/story/historical-records.js');
   const batch=S.restoreWorldSession(await decodeWorldSave(batchJson)),src=H.historicalSourceOf(batch),rows=[],times=[],shots=[],vis=[];
   const hash=a=>{let h=2166136261;for(let i=0;i<a.length;i++){h^=a[i]&0xffff;h=Math.imul(h,16777619);}return h>>>0;};
   const rgba=c=>c.getContext('2d').getImageData(0,0,320,180).data;
   for(const [k,y] of years.entries()){
    const step=S.restoreWorldSession(await decodeWorldSave(saves[k]));
    for(let i=0;i<3;i++){
     let a=performance.now();const m=M.buildPickMask(batch,y,i);const ms=performance.now()-a;times.push({year:y,site:i,maskMs:ms,targets:m.targets.length});
     const still=document.createElement('canvas');S.drawWorldSession(still,batch,y,i);const sa=rgba(still),ca=rgba(m.composed);let diff=0;for(let j=0;j<sa.length;j++)if(sa[j]!==ca[j])diff++;
     rows.push({year:y,site:i,check:'mask layers recompose the live still',ok:diff===0,detail:diff});
     const ms2=M.buildPickMask(step,y,i);
     rows.push({year:y,site:i,check:'same mask in the stepped-restored world',ok:hash(m.owners)===hash(ms2.owners)&&JSON.stringify(m.targets)===JSON.stringify(ms2.targets)});
     const list=H.historicalTargetsAt(src,H.historicalSiteIds[i],y),listed=new Set(list.map(s=>JSON.stringify(s.ref)));
     rows.push({year:y,site:i,check:'every mask target is recorded there',ok:m.targets.every(t=>listed.has(JSON.stringify(t)))});
     rows.push({year:y,site:i,check:'no conflict pixels',ok:m.conflicts.size===0,detail:m.conflicts.size});
     let picked=0,visible=0;
     m.targets.forEach((t,idx)=>{if(!m.visiblePixels[idx])return;visible++;const px=M.targetPixels(m,idx);const cx=px.reduce((n,p)=>n+p%320,0)/px.length,cy=px.reduce((n,p)=>n+Math.floor(p/320),0)/px.length;
      let best=px[0],d=Infinity;for(const p of px){const e=(p%320-cx)**2+(Math.floor(p/320)-cy)**2;if(e<d){d=e;best=p;}}
      if(M.pickAt(m,best%320,Math.floor(best/320))[0]===idx)picked++;});
     rows.push({year:y,site:i,check:'every visible target is picked by its own pixel',ok:picked===visible,detail:`${picked}/${visible}`});
     const drawnHidden=m.targets.filter((t,idx)=>!m.visiblePixels[idx]).length,notDrawn=list.filter(s=>s.presence==='recorded'&&!m.targets.some(t=>JSON.stringify(t)===JSON.stringify(s.ref))).length;
     vis.push({year:y,site:i,listed:list.length,visible,coveredDrawn:drawnHidden,notDrawn});
     if(i===0||m.targets.length>=shots.filter(s=>s.year===y)[0]?.targets){
      // the still with every visible target in its own colour on the annotation layer (review image)
      const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.drawImage(still,0,0);x.globalAlpha=.55;
      m.targets.forEach((t,idx)=>{x.fillStyle=`hsl(${(idx*67)%360} 85% 55%)`;for(const p of M.targetPixels(m,idx))x.fillRect(p%320,Math.floor(p/320),1,1);});
      const entry={year:y,site:i,targets:m.targets.length,still:still.toDataURL(),mask:c.toDataURL()};const at=shots.findIndex(s=>s.year===y);if(at<0)shots.push(entry);else shots[at]=entry;
     }
    }
   }
   return {rows,times,shots,vis};
  },{batchJson:w.batchJson,saves:w.saves,years:YEARS});
  for(const row of r.rows)check(row.ok,`${w.id} year ${row.year} site ${row.site}: ${row.check}${row.detail!==undefined?' ('+row.detail+')':''}`);
  browserRows.push({world:w.id,checks:r.rows.length,ok:r.rows.filter(x=>x.ok).length});
  maskTimes.push(...r.times.map(t=>({world:w.id,...t})));visibility.push(...r.vis.map(v=>({world:w.id,...v})));
  for(const s of r.shots)images.push({name:`${w.id}_y${s.year}_site${s.site}`,world:w.id,...s});
  console.log(w.id,'browser',r.rows.filter(x=>x.ok).length+'/'+r.rows.length);
 }
}finally{await browser?.close();server.kill();}

const med=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?Math.round(s[Math.floor(s.length/2)]*10)/10:0;},max=a=>a.length?Math.round(Math.max(...a)*10)/10:0;
const p95=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?Math.round(s[Math.min(s.length-1,Math.floor(s.length*.95))]*10)/10:0;};
const perf={maskMedianMs:med(maskTimes.map(t=>t.maskMs)),maskP95Ms:p95(maskTimes.map(t=>t.maskMs)),maskMaxMs:max(maskTimes.map(t=>t.maskMs)),targetsMax:Math.max(...maskTimes.map(t=>t.targets)),
 indexBuildMedianMs:med(nodeTimes.filter(t=>t.indexMs!==undefined).map(t=>t.indexMs)),answersMedianMs:med(nodeTimes.filter(t=>t.answersMs!==undefined).map(t=>t.answersMs)),answersMaxMs:max(nodeTimes.filter(t=>t.answersMs!==undefined).map(t=>t.answersMs))};
const assets=[];
for(const im of images)for(const kind of ['still','mask']){const raw=Buffer.from(im[kind].slice(im[kind].indexOf(',')+1),'base64'),name=`${im.name}_${kind}`;await writeFile(`${out}/${name}.png`,raw);assets.push({name,world:im.world,year:im.year,site:im.site,kind,sha256:createHash('sha256').update(raw).digest('hex')});}
const sum=(a,k)=>a.reduce((s,x)=>s+x[k],0);
const report={issue:39,stage:'D5',status:failures.length?'FAILED':'PASSED',quick,years:YEARS,failures,worlds:worlds.map(w=>({id:w.id,seed:w.seed})),
 coverage:{scenes:coverage.length,targets:sum(coverage,'targets'),changes:sum(coverage,'changes'),linkedChanges:sum(coverage,'linked'),ruins:sum(coverage,'ruins'),damagedBridges:sum(coverage,'damagedBridges'),
  backfilledWaterways:sum(coverage,'backfilled'),rebuiltTargets:sum(coverage,'rebuilt'),unsupported:sum(coverage,'unsupported'),
  visible:sum(visibility,'visible'),coveredDrawn:sum(visibility,'coveredDrawn'),notDrawn:sum(visibility,'notDrawn')},
 perScene:coverage,visibility,browser:browserRows,performance:perf,maskTimes,nodeTimes,assets};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const SITE=['川辺','丘陵','入り江'];
await writeFile(`${out}/gallery.html`,`<!doctype html><meta charset="utf-8"><title>Issue 39 D5</title><style>body{font:14px system-ui;margin:20px;background:#eceee8}img{image-rendering:pixelated}td{vertical-align:top;font-size:12px}</style><h1>Issue #39 D5 ${report.status}</h1><p>${failures.length} failures. 左：本編の静止画、右：選べる画素（対象ごとの色、見えない対象は色なし）</p>
<table>${worlds.map(w=>`<tr><th>${w.id}<br>seed ${w.seed}</th>${images.filter(a=>a.world===w.id).map(a=>{const v=visibility.find(x=>x.world===w.id&&x.year===a.year&&x.site===a.site);return `<td><img src="${a.name}_still.png" width="320" height="180"> <img src="${a.name}_mask.png" width="320" height="180"><br>${a.year}年 ${SITE[a.site]}：記録${v.listed}件・見える${v.visible}・覆われ${v.coveredDrawn}・描かれない${v.notDrawn}</td>`;}).join('')}</tr>`).join('')}</table>`);
console.log(JSON.stringify({type:'issue39-d5',status:report.status,failures:failures.length,coverage:report.coverage,performance:perf,out}));
if(failures.length)process.exitCode=1;
