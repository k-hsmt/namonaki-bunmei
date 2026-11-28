/**
 * Issue #40 D2a: trial of event eligibility and the adopted yearly draw probability (Human decisions Q1–Q3 on D2a and
 * the D2a Human review: hardship-linked adopted, requirements revised, facts of every draw captured and re-checked).
 *
 *   npm run build && node scripts/audit-issue40-d2a.mjs   →  artifacts/history40-d2a/report.json
 *   Env: HISTORY40_D2A_QUICK=1 (2 worlds to year 1000).
 *
 * The 70 D1b worlds (10 tuning seeds per biome), the full world to year 5000, from the same new world for every setting:
 *  - production: no policy (the current rule);
 *  - eligibility-only: the review-only policy with production's probability (isolates the eligibility);
 *  - hardship-linked, momentum, combined: the policy with a state-linked probability (isolates the draw probability
 *    against eligibility-only).
 * Fixed evaluation measures (D1b Human decision 2) plus the Q3 checks: recorded hardship and its runs (self-reinforcement),
 * runs of consecutive event years and the densest 10 years (excessive chains), the longest gap and quiet 100-year windows
 * (loss of quiet eras). Every event whose requirement reads the settlement ledger is re-checked afterwards against the
 * ledger at the end of the previous year: a policy setting must have none unsupported (a failed check).
 * The policy worlds are review-only and cannot be saved (their save size is not measured). Exits 1 when a check fails.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execSync} from 'node:child_process';
import os from 'node:os';
import {BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession} from '../dist/story/world-session.js';
import {lastObservedYear} from '../dist/story/engine.js';
import {confirmedMetricRange} from '../dist/story/civilization-metrics.js';
import {EVENT_POLICY_SETTINGS,EVENT_REQUIREMENTS,SUSPENDED_EVENTS,REQUIREMENT_SOURCES,LEDGER_REQUIREMENTS,DRAW_PROBABILITY,createEventPolicyD2a,ledgerEventFactsAt,meetsRequirement} from '../dist/story/event-policy-d2a-review.js';
import {MEASURE_ID,ANALYSIS,allocateSeeds,economyMeasures,eventTiming,hardshipRuns,isCivilizationEvent,distribution} from './lib/history40-measures.mjs';
import {measureCivilization,acrossWorlds,D1A_SCALARS} from './lib/history40-civilization.mjs';

const out='artifacts/history40-d2a',quick=process.env.HISTORY40_D2A_QUICK==='1';
const HORIZON=quick?1000:5000,SEGMENT=1000,PER_BIOME=quick?1:10,BIOMES=quick?['temperate_forest','tundra']:BIOME_KINDS;
const SETTINGS=['production',...EVENT_POLICY_SETTINGS];// the unadopted settings are not re-run (D2a Human review)
const CV_YEARS=[100,300,500,1000,2000,3000,4000,5000].filter(y=>y<=HORIZON);
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);if(failures.length<=50)console.error('FAIL',m);}return ok;};
const sha=s=>createHash('sha256').update(s).digest('hex'),ms=t=>Math.round(performance.now()-t);
const started=performance.now(),startedAt=new Date().toISOString();
const allocation=allocateSeeds({tuning:10,acceptance:20});
const cases=BIOMES.flatMap(b=>allocation.biomes[b].tuning.slice(0,PER_BIOME).map((seed,rank)=>({id:`${b}-${rank+1}`,biome:b,seed})));

/** Events whose requirement reads the settlement ledger, re-checked at the end of the previous year. */
function ledgerAudit(s){
 const byKind={};let checked=0,unsupported=0;
 for(const r of s.history){
  if(!isCivilizationEvent(r))continue;const req=EVENT_REQUIREMENTS[r.kind];if(!LEDGER_REQUIREMENTS.includes(req))continue;
  checked++;const ok=meetsRequirement(req,ledgerEventFactsAt(s.observation.sites,r.year-1));
  const k=byKind[r.kind]??={events:0,unsupported:0};k.events++;if(!ok){k.unsupported++;unsupported++;}
 }
 return {checked,unsupported,byKind};
}

/**
 * Re-checks the facts every draw used against sources independent of the policy: the settlement ledger at y-1, the economy
 * captured by the tap for y-1, and the chronicle before y. The drought counter is not recorded anywhere else: capture only.
 * Returns the counts; a fact that disagrees with its source, or an event whose requirement fails on it, is a failed check.
 */
function receiptAudit(c,s,receipts,captures){
 const earlier=(kinds,year)=>s.history.some(r=>r.year<year&&kinds.includes(r.kind)&&!r.buildingId);
 const n={receipts:receipts.length,events:0,bySource:{}},count=src=>n.bySource[src]=(n.bySource[src]??0)+1;
 for(const r of receipts){
  const y=r.year,f=r.facts,ledger=ledgerEventFactsAt(s.observation.sites,y-1),econ=captures[y-2]?.economy;
  const independent={...ledger,districtShortage:!!econ?.districts.some(d=>d.shortageYears>0),
   recentTrade:captures.slice(Math.max(0,y-21),y-1).some(cap=>cap.traded.some(v=>v>0)),
   pastDisease:earlier(['disease'],y),pastConflict:earlier(['dispute'],y)||ledger.splitCommunity,pastRecordEvent:earlier(['first_archive','writing'],y)};
  for(const [k,v] of Object.entries(independent))check(f[k]===v,`${c.id}: year ${y} fact ${k} was ${f[k]} at the draw, ${v} in its source`);
  check(r.probability===DRAW_PROBABILITY['hardship-linked']({...r.inputs}),`${c.id}: year ${y} probability`);
  if(!r.selected)continue;n.events++;
  const req=EVENT_REQUIREMENTS[r.selected];check(meetsRequirement(req,{...f,...independent}),`${c.id}: ${r.selected} in ${y} without ${req}`);
  count(req==='none'?'none':REQUIREMENT_SOURCES[req]);
 }
 return n;
}

async function run(created,c,setting){
 const receipts=[],policy=setting==='production'?undefined:createEventPolicyD2a(setting,{observeDraw:r=>receipts.push(r)}),captures=[];
 const exchange=[{year:0,value:architectureProductionSession(created).state.exchange}];let world=created;
 const t=performance.now();
 for(let to=SEGMENT;to<=HORIZON;to+=SEGMENT){
  world=await advanceArchitectureWorld(world,SEGMENT,'automatic',{},cap=>captures.push(cap),policy);const s=architectureProductionSession(world).state;
  if(check(!s.pending&&lastObservedYear(s)===to,`${c.id} ${setting}: year ${to} not confirmed`))exchange.push({year:to,value:s.exchange});
 }
 const advanceMs=ms(t),s=architectureProductionSession(world).state;
 check(captures.length===HORIZON,`${c.id} ${setting}: economy not captured every year`);
 const {trajectory,...m}=measureCivilization(s,HORIZON,exchange,{exchangeSampling:`every ${SEGMENT} years`,exchangeTrajectoryEvery:SEGMENT,check});
 const audit=ledgerAudit(s),suspended=s.history.filter(r=>SUSPENDED_EVENTS[r.kind]&&!r.buildingId).length;
 if(setting!=='production'){check(audit.unsupported===0,`${c.id} ${setting}: ${audit.unsupported} events without their ledger fact`);
  check(suspended===0,`${c.id} ${setting}: ${suspended} suspended events happened`);check(receipts.length===HORIZON,`${c.id}: ${receipts.length} draw receipts`);}
 const draws=setting==='production'?null:receiptAudit(c,s,receipts,captures);
 const food=confirmedMetricRange(s,'food',0,HORIZON).map(p=>p.value),cohesion=confirmedMetricRange(s,'cohesion',0,HORIZON).map(p=>p.value);
 return {status:'ok',...m,populationAt:Object.fromEntries(CV_YEARS.map(y=>[y,trajectory.population[y/10]])),
  economy:economyMeasures(captures),ledgerAudit:audit,timing:eventTiming(s.history.filter(isCivilizationEvent).map(r=>r.year),HORIZON),
  hardship:hardshipRuns(food,cohesion),suspendedEvents:suspended,...(draws?{draws}:{}),advanceMs};
}

const worlds=[];
for(const c of cases){
 const row={...c,settings:{}};const t=performance.now();
 try{
  const created=(await createNewArchitectureWorld(c.seed)).architecture;
  for(const setting of SETTINGS){
   try{row.settings[setting]=await run(created,c,setting);}
   catch(e){check(false,`${c.id} ${setting}: ${e.message}`);row.settings[setting]={status:'failed',error:String(e.message)};}
  }
 }catch(e){check(false,`${c.id}: ${e.message}`);}
 worlds.push(row);console.log(c.id,'seed',c.seed,ms(t)+'ms',SETTINGS.map(s=>`${s}:${row.settings[s]?.timing?.yearsWithEvent??'-'}`).join(' '));
}

// ---- across worlds, per setting ----
const mean=a=>a.reduce((x,v)=>x+v,0)/a.length;
const cv=a=>{const m=mean(a);return m?Math.round(Math.sqrt(a.reduce((x,v)=>x+(v-m)**2,0)/a.length)/m*1000)/1000:null;};
const SCALARS={...D1A_SCALARS,
 'events.windowDispersion':m=>m.chronicle.civilizationWindowDispersion,
 ...Object.fromEntries(['yearsWithEvent','longestRun','yearsInRunsOfFive','maxInTenYears','longestGap','gapsOf20','gapsOf30','quietWindows'].map(k=>[`timing.${k}`,m=>m.timing[k]])),
 'hardship.share':m=>m.hardship.share,'hardship.longestRun':m=>m.hardship.longestRun,'hardship.runsOf50':m=>m.hardship.runsOf50,
 'economy.shortageShare':m=>mean(m.economy.districts.map(d=>d.shortageYears))/m.economy.years,
 'ledger.unsupported':m=>m.ledgerAudit.unsupported,'suspended.events':m=>m.suspendedEvents,
};
const rowsFor=setting=>worlds.map(w=>({biome:w.biome,v:w.settings[setting]??{status:'failed'}}));
const summary=Object.fromEntries(SETTINGS.map(setting=>{
 const ok=worlds.map(w=>w.settings[setting]).filter(s=>s?.status==='ok');
 const kinds={};for(const s of ok)for(const [k,n] of Object.entries(s.chronicle.byClass))kinds[k]=(kinds[k]??0)+n;
 return [setting,{worlds:ok.length,populationCv:Object.fromEntries(CV_YEARS.map(y=>[y,cv(ok.map(s=>s.populationAt[y]))])),
  across:acrossWorlds(rowsFor(setting),'v',SCALARS,BIOMES),recordsByClass:kinds}];
}));
const results={issue:40,stage:'D2a',measureId:MEASURE_ID,analysis:ANALYSIS,quick,horizon:HORIZON,segment:SEGMENT,
 settings:Object.fromEntries(SETTINGS.map(s=>[s,s==='production'?'現行（方針なし）':String(DRAW_PROBABILITY[s])])),
 requirements:EVENT_REQUIREMENTS,suspended:SUSPENDED_EVENTS,requirementSources:REQUIREMENT_SOURCES,ledgerRequirements:LEDGER_REQUIREMENTS,cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),
 summary,worlds:worlds.map(w=>({...w,settings:Object.fromEntries(Object.entries(w.settings).map(([k,v])=>{const {advanceMs,...rest}=v;return [k,rest];}))})),failures};
let commit=null,dirty=null;try{commit=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const resultsJson=JSON.stringify(results);
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,
 platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null,
 advanceMs:Object.fromEntries(SETTINGS.map(s=>[s,distribution(worlds.map(w=>w.settings[s]?.advanceMs))]))};
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d2a',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,resultsSha256:sha(resultsJson),totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
