/** Independent, recorded v7/D4 branches; this script never advances either history. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {decodeWorldSave} from '../dist/story/world-storage.js';
import {restoreEconomicProductionSave} from '../dist/irrigation/economic-production-history-v1.js';
import {economicProductionViewInternal} from '../dist/irrigation/economic-production-view-internal.js';
import {decodeTerrainTrial,prepareTerrainTrialSave} from '../dist/terrain/terrain-trial-storage-v1.js';
import {terrainTrialViewInternal} from '../dist/terrain/terrain-trial-owned-internal.js';
import {terrainCutUseAt,observeTerrainTrialScene} from '../dist/scene/terrain-trial-scene-v1.js';
import {economicRowsInternal} from '../dist/irrigation/economic-proof-internal.js';
import {economicTuplesInternal} from '../dist/irrigation/economic-tuples-internal.js';
import {reviewBaseHash,canonicalWire} from '../dist/irrigation/wire-v1.js';
import {observationAt} from '../dist/story/observations.js';
import {timeline,firstTimeline} from './coupled-comparison-timeline.mjs';
import {coupledReviewServer} from './coupled-review-server.mjs';
import {terrainReviewIndex,terrainReviewCase} from './terrain-trial-review-page.mjs';
const out='artifacts/environment34-terrain-trial',audit=JSON.parse(await readFile(out+'/audit.json','utf8'));
const sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(audit.sourceSHA,sourceSHA,'Comparison and audited histories must have the same source');
const arg=process.argv.indexOf('--seed');
const columns=['year','harvestRiver','harvestHill','harvestCoast','reserveRiver','reserveHill','reserveCoast','coverageRiver','coverageHill','coverageCoast','peopleRiver','peopleHill','peopleCoast','peopleUnlocated','importsRiver','importsHill','importsCoast','tradeRoute0','tradeRoute1','movesTotal','discardedRiver','discardedHill','discardedCoast','appliedWaterGainBp','appliedWaterCostBp','requestedWaterCostBp'];
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
function series(world,view){
 const ledger=world.economicCoupling,rows=economicRowsInternal({...ledger,world:view,choiceProtocol:'production-mixed-v1'});
 assert.equal(ledger.introducedYear,0,'Natural comparison requires a common year-zero origin');
 const initial=ledger.initialEconomy.districts,people=observationAt(world.review.state.observation,0).residents.map(r=>r.population);
 const values=[[0,0,0,0,...initial.map(d=>d.reserve),...initial.map(d=>d.coverage.at(-1)??1),...people,0,0,0,0,0,0,0,0,0,0,0,0],...rows.map(r=>[r.year,...r.harvest,...r.reserve,...r.coverage,...r.people,...r.imports,...r.traded,r.moves.reduce((n,m)=>n+m.amount,0),...r.discarded,r.gainBp,r.costBp,r.effect.requestedCostBp])];
 assert.equal(values.length,10001);assert.ok(values.every(r=>r.length===columns.length&&r.every(Number.isFinite)));
 return {rows,values,summary:{allHarvest:rows.reduce((n,r)=>n+r.harvest.reduce((a,b)=>a+b,0),0),finalPeople:rows.at(-1).people,cityYears:world.review.state.observation.sites.map(s=>s.changes.find(c=>c.view.scale===3)?.year??null)}};
}
function firstRows(a,b,cols){const i=a.findIndex((r,y)=>cols.some(k=>r[k]!==b[y][k]));return i<0?null:i;}
function uses(world,event){
 const s=world.review.state,years=new Set([event.effectiveYear]);
 const ids=new Set(world.review.placements.filter(p=>p.site==='hill-side'&&p.builtYear>=event.effectiveYear&&overlaps(p.plot,event.plot)).map(p=>p.objectId));
 for(const c of s.observation.sites[1].buildingChanges)if(c.year>=event.effectiveYear&&ids.has(c.building.id))years.add(c.year);
 for(const e of [...s.housing.events,...s.publicSpaces.events])if(e.year>=event.effectiveYear&&e.after.siteId==='hill-side'&&overlaps(e.after.footprint,event.plot))years.add(e.year);
 const result=[];let previous='';for(const year of [...years].sort((a,b)=>a-b)){
  const use=terrainCutUseAt(world,year).find(u=>u.id===event.id),key=canonicalWire(use);
  if(key!==previous){result.push({year,...use});previous=key;}
 }
 return result;
}
async function review(entry){
 const seed=entry.seed,dir=out+'/seed'+seed;await mkdir(dir,{recursive:true});
 const base=restoreEconomicProductionSave(await decodeWorldSave(await readFile(out+`/seed${seed}-v7-baseline.json`,'utf8'))),cut=await decodeTerrainTrial(await readFile(out+`/seed${seed}-terrain-trial.json`,'utf8'));
 console.error(JSON.stringify({seed,phase:'decoded-independent-histories'}));
 assert.equal(await reviewBaseHash(await prepareTerrainTrialSave(cut)),entry.packetHash);
 const bView=economicProductionViewInternal(base),cView=terrainTrialViewInternal(cut),b=series(base,bView),c=series(cut,cView),baseTimeline={world:bView,phases:base.economicCoupling.phases},cutTimeline={world:cView,phases:cut.economicCoupling.phases};
 const first={terrain:cut.terrainHistory.events[0]?.effectiveYear??null,harvest:firstRows(b.values,c.values,[1,2,3]),population:firstRows(b.values,c.values,[10,11,12]),migration:(()=>{const i=b.rows.findIndex((r,n)=>canonicalWire(r.moves)!==canonicalWire(c.rows[n].moves));return i<0?null:i+1;})()};
 for(const key of ['land','water','choice','chronicle','rng','disaster'])first[key]=firstTimeline(timeline(baseTimeline,key),cutTimeline,key);
 const projects=cut.terrainHistory.events.map(e=>({...entry.cuts.find(c=>c.id===e.id),approvedYear:e.approvedYear,effectiveYear:e.effectiveYear,finalUse:terrainCutUseAt(cut,10000).find(u=>u.id===e.id),uses:uses(cut,e)}));
 console.error(JSON.stringify({seed,phase:'recorded-project-uses',projects:projects.length}));
 const years=new Set([0,100,300,1000,2000,10000]);
 for(const p of projects)for(const year of [p.approvedYear-1,p.approvedYear,p.effectiveYear,p.effectiveYear+15,p.effectiveYear+300,...p.uses.map(u=>u.year)])if(year>=0&&year<=10000)years.add(year);
 for(const year of [...Object.values(first),...b.summary.cityYears,...c.summary.cityYears].filter(y=>y!==null))for(const y of [year-1,year,year+1])if(y>=0&&y<=10000)years.add(y);
 const snapshotYears=[...years].sort((a,b)=>a-b),policies=[{policy:'baseline',series:b.values,summary:b.summary},{policy:'terrain',series:c.values,summary:c.summary}],data={sourceSHA,seed,years:10000,columns,first,projects,holds:entry.holds,policies,snapshotYears,globalPopulationExact:b.values.every((r,i)=>r.slice(10,14).reduce((a,b)=>a+b,0)===c.values[i].slice(10,14).reduce((a,b)=>a+b,0)),sceneChecks:[]};
 // Freeze semantic references before any production profile is introduced.
 const {terrainChangeBoundary:_,...review}=cView.review,tuples=economicTuplesInternal(cut.economicCoupling);
 const fixed={seed,packetHash:entry.packetHash,worldHash:await reviewBaseHash({...cView,review:{...review,diagnostics:{holds:{},fullSearches:0}}}),receiptsHash:await reviewBaseHash(tuples.receipts),phasesHash:await reviewBaseHash(tuples.phases),changesHash:await reviewBaseHash(cut.terrainHistory.events.map(({ruleId,revisionId,parentRevision,...e})=>e))};
 await copyFile(out+`/seed${seed}-v7-baseline.json`,dir+'/baseline.json');await copyFile(out+`/seed${seed}-terrain-trial.json`,dir+'/terrain.json');
 const server=await coupledReviewServer();let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  for(const policy of ['baseline','terrain']){
   console.error(JSON.stringify({seed,phase:'recorded-images',policy,years:snapshotYears.length}));
   const page=await browser.newPage();await page.goto(server.url+'/capture');
   await page.evaluate(async({url,policy})=>{
    const wire=await(await fetch(url)).text();
    if(policy==='baseline'){const{decodeWorldSave}=await import('/dist/story/world-storage.js'),{restoreWorldSession}=await import('/dist/story/world-session.js');window.session=restoreWorldSession(await decodeWorldSave(wire));}
    else{const{decodeTerrainTrial}=await import('/dist/terrain/terrain-trial-storage-v1.js');window.trial=await decodeTerrainTrial(wire);}
   },{url:server.url+'/'+dir+'/'+policy+'.json',policy});
   for(const year of snapshotYears)for(let site=0;site<3;site++){
    const png=await page.evaluate(async({year,site,policy})=>{
     const canvas=document.getElementById('scene');
     if(policy==='baseline'){const{drawWorldSession}=await import('/dist/story/world-session.js');drawWorldSession(canvas,window.session,year,site);}
     else{const{observeTerrainTrialScene}=await import('/dist/scene/terrain-trial-scene-v1.js'),{drawGeneratedSceneReview}=await import('/dist/scene/draw-generated-review.js');drawGeneratedSceneReview(canvas,observeTerrainTrialScene(window.trial,year,site));}
     return canvas.toDataURL('image/png').split(',')[1];
    },{year,site,policy});
    await writeFile(dir+`/${policy}-y${year}-s${site}.png`,Buffer.from(png,'base64'));
   }
   await page.close();
  }
 }finally{await browser?.close();await server.close();}
 for(const year of snapshotYears)for(let site=0;site<3;site++){
  const same=(await readFile(dir+`/baseline-y${year}-s${site}.png`)).equals(await readFile(dir+`/terrain-y${year}-s${site}.png`));data.sceneChecks.push({year,site,same});
  if(first.terrain===null||year<first.terrain)assert.ok(same,'Pre-cut scenery changed');
 }
 // Actual recorded ecology, rather than a presentation-only recovery effect.
 data.disturbance=projects.map(p=>({id:p.id,at:[p.effectiveYear,p.effectiveYear+15,p.effectiveYear+300].filter(y=>y<=10000).map(year=>{const o=observeTerrainTrialScene(cut,year,1),event=cut.terrainHistory.events.find(e=>e.id===p.id);return {year,patches:o.ground.vegetation.filter(v=>event.disturbedPatches.includes(v.index)).map(v=>({index:v.index,age:v.age,stage:v.stage,disturbedYear:v.disturbedYear}))};})}));
 await writeFile(dir+'/data.json',JSON.stringify(data)+'\n');await writeFile(dir+'/index.html',terrainReviewCase(data));
 return {seed,first,projects:projects.length,uses:projects.map(p=>({id:p.id,transitions:p.uses,final:p.finalUse})),cityYears:policies.map(p=>p.summary.cityYears),globalPopulationExact:data.globalPopulationExact,scenePairs:data.sceneChecks.length,snapshotYears,fixed};
}
if(arg>=0){const entry=audit.cases.find(c=>c.seed===Number(process.argv[arg+1]));assert.ok(entry);console.log(JSON.stringify(await review(entry)));}
else{
 const reference=JSON.parse(await readFile('tests/fixtures/terrain-trial-preproduction-reference.json','utf8'));
 const cases=[];for(const entry of audit.cases){const row=JSON.parse(execFileSync(process.execPath,[fileURLToPath(import.meta.url),'--seed',String(entry.seed)],{encoding:'utf8',maxBuffer:4*1024*1024,stdio:['ignore','pipe','inherit']}));assert.deepEqual(row.fixed,reference.cases.find(c=>c.seed===row.seed),'Frozen preproduction semantics changed');cases.push(row);console.log(JSON.stringify({seed:row.seed,first:row.first,projects:row.projects,scenePairs:row.scenePairs}));}
 const manifest={sourceSHA,scope:'Independent recorded C3 v7 and D4 cut branches; no borrowed future inputs, no added excavation charge or direct harvest bonus.',years:10000,seeds:cases.map(c=>c.seed),cases};
 await writeFile(out+'/comparison.json',JSON.stringify(manifest,null,2)+'\n');await writeFile(out+'/index.html',terrainReviewIndex(manifest));
 await writeFile(out+'/production-reference.json',JSON.stringify({sourceSHA,normalization:'Generated bridge view; remove terrainChangeBoundary; zero diagnostics. Changes omit only ruleId and chained revision hashes, retaining all geometry, cells, cause and timing.',cases:cases.map(c=>c.fixed)},null,2)+'\n');
}
