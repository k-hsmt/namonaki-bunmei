/**
 * Issue #40 D1b: what makes the population of different worlds converge (Human decision 1 on the D1b baseline).
 *
 *   npm run build && node scripts/audit-issue40-d1b-population.mjs   →  artifacts/history40-d1b-population/report.json
 *   Env: HISTORY40_D1B_POP_QUICK=1 (2 worlds to year 1000).
 *
 * Hypothesis (read from story/engine step(), not yet verified): population settles where the pressure over the carrying
 * capacity balances the food drift; the capacity (14000 + knowledge×560 + exchange×220 + waterworks×5500 + trade×2500)
 * and the food drift's knowledge term both follow knowledge and exchange, which saturate at 100 in every world, so every
 * world ends near the same population.
 *
 * A review-only copy of story/engine (generated from dist/story/engine.js, never in src/) replaces three expressions with
 * hooks; each setting changes one of them:
 *  - production: the production expressions through the hooks (must reproduce production exactly: faithfulness);
 *  - capacity-frozen: the capacity uses the knowledge and exchange of the first year (no saturation → capacity path);
 *  - food-knowledge-frozen: the food drift uses the knowledge of the first year (no saturation → food path);
 *  - pressure-half: the pressure lowers the food drift half as much (how tightly population is held).
 * Engine only: in the 70 D1b worlds the full world and the engine agree civilization-wide; land-side effects of a
 * setting are not measured (the economy's shortage share is N/A here). The settings are for isolating the cause only.
 * Every 100 years: population, the capacity the year used, and their ratio. Exits 1 when a check fails.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execSync} from 'node:child_process';
import os from 'node:os';
import {BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import * as production from '../dist/story/engine.js';
import {MEASURE_ID,allocateSeeds,distribution} from './lib/history40-measures.mjs';
import {measureCivilization,TRAJECTORY_EVERY} from './lib/history40-civilization.mjs';
import {loadEngineVariant,DRAW_PATCH} from './lib/history40-engine-variant.mjs';

const out='artifacts/history40-d1b-population',quick=process.env.HISTORY40_D1B_POP_QUICK==='1';
const HORIZON=quick?1000:5000,CHECK_EVERY=100,PER_BIOME=quick?1:10,BIOMES=quick?['temperate_forest','tundra']:BIOME_KINDS;
const REPORT_YEARS=[100,300,500,1000,2000,3000,4000,5000].filter(y=>y<=HORIZON);
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);if(failures.length<=50)console.error('FAIL',m);}return ok;};
const sha=s=>createHash('sha256').update(s).digest('hex'),ms=t=>Math.round(performance.now()-t);
const started=performance.now(),startedAt=new Date().toISOString();
const allocation=allocateSeeds({tuning:10,acceptance:20});
const cases=BIOMES.flatMap(b=>allocation.biomes[b].tuning.slice(0,PER_BIOME).map((seed,rank)=>({id:`${b}-${rank+1}`,biome:b,seed})));

const PATCHES=[DRAW_PATCH,
 {find:'const carrying = 14000 + s.knowledge * 560 + s.exchange * 220 + waterways * 5500 + trade * 2500;',replace:'const carrying = __history40.carrying(s, waterways, trade);'},
 {find:'(s.knowledge - 35) * .025',replace:'(__history40.foodKnowledge(s) - 35) * .025'},
 {find:'pressure * 2.6',replace:'pressure * __history40.pressureFood(s)'}];
const capacity=(k,x,w,t)=>14000+k*560+x*220+w*5500+t*2500;// the production expression, same order of operations
/** Hooks of one setting for one civilization. `used` receives the capacity each year used. */
function hooks(setting,used){
 const first=new WeakMap(),start=s=>{if(!first.has(s))first.set(s,{knowledge:s.knowledge,exchange:s.exchange});return first.get(s);};
 const h={drawRate:s=>s.year<30?.12:.19,carrying:(s,w,t)=>capacity(s.knowledge,s.exchange,w,t),foodKnowledge:s=>s.knowledge,pressureFood:()=>2.6};
 if(setting==='capacity-frozen')h.carrying=(s,w,t)=>{const f=start(s);return capacity(f.knowledge,f.exchange,w,t);};
 if(setting==='food-knowledge-frozen')h.foodKnowledge=s=>start(s).knowledge;
 if(setting==='pressure-half')h.pressureFood=()=>1.3;
 const carrying=h.carrying;h.carrying=(s,w,t)=>{const c=carrying(s,w,t);used.value=c;return c;};
 return h;
}
const SETTINGS={production:'現行の式（フックを通して同じ計算）',
 'capacity-frozen':'収容力のknowledge・exchangeを1年目の値に固定',
 'food-knowledge-frozen':'食料の変化のknowledge項を1年目の値に固定',
 'pressure-half':'人口圧が食料を下げる係数を半分（2.6→1.3）'};

function run(engine,seed,used){
 const s=engine.createCivilization(seed),exchange=[{year:0,value:s.exchange}],checkpoints=[];
 while(s.year<HORIZON){engine.step(s);if(s.pending)engine.chooseAutomatically(s);exchange.push({year:s.year,value:s.exchange});
  if(s.year%CHECK_EVERY===0)checkpoints.push({year:s.year,population:s.population,capacity:Math.round(used.value),ratio:Math.round(s.population/used.value*1000)/1000,
   knowledge:+s.knowledge.toFixed(2),exchange:+s.exchange.toFixed(2),food:+s.food.toFixed(2)});}
 return {s,exchange,checkpoints};
}

const copy=await loadEngineVariant(`${out}/tmp`,PATCHES,'engine-population');
const worlds=[];
for(const c of cases){
 const row={...c,settings:{}};let base=null;
 const t=performance.now();
 try{const p=production.createCivilization(c.seed);while(p.year<HORIZON){production.step(p);if(p.pending)production.chooseAutomatically(p);}base=JSON.stringify(p);}
 catch(e){check(false,`${c.id} production: ${e.message}`);}
 for(const setting of Object.keys(SETTINGS)){
  try{const used={value:NaN};copy.setHistory40Hooks(hooks(setting,used));const r=run(copy,c.seed,used);
   if(setting==='production')check(JSON.stringify(r.s)===base,`${c.id}: the review-only copy with the production expressions differs from production`);
   const {trajectory,...m}=measureCivilization(r.s,HORIZON,r.exchange,{exchangeSampling:'every year',exchangeTrajectoryEvery:TRAJECTORY_EVERY,check});
   row.settings[setting]={status:'ok',...m,checkpoints:r.checkpoints};}
  catch(e){check(false,`${c.id} ${setting}: ${e.message}`);row.settings[setting]={status:'failed',error:String(e.message)};}
 }
 row.ms=ms(t);worlds.push(row);console.log(c.id,'seed',c.seed,row.ms+'ms');
}

// ---- across worlds, per setting ----
const cv=a=>{const m=a.reduce((x,v)=>x+v,0)/a.length;return m?Math.round(Math.sqrt(a.reduce((x,v)=>x+(v-m)**2,0)/a.length)/m*1000)/1000:null;};
const summary=Object.fromEntries(Object.keys(SETTINGS).map(setting=>{
 const ok=worlds.map(w=>w.settings[setting]).filter(s=>s.status==='ok'),at=y=>ok.map(s=>s.checkpoints.find(c=>c.year===y));
 return [setting,{description:SETTINGS[setting],worlds:ok.length,
  byYear:Object.fromEntries(REPORT_YEARS.map(y=>{const rows=at(y);return [y,{population:distribution(rows.map(r=>r.population)),populationCv:cv(rows.map(r=>r.population)),
   capacity:distribution(rows.map(r=>r.capacity)),capacityCv:cv(rows.map(r=>r.capacity)),ratio:distribution(rows.map(r=>r.ratio)),
   knowledge:distribution(rows.map(r=>r.knowledge)),exchange:distribution(rows.map(r=>r.exchange)),food:distribution(rows.map(r=>r.food))}];})),
  // the fixed evaluation measures (D1b Human decision 2); the economy's shortage share needs the full world: N/A here
  fixed:{nearHighShare:Object.fromEntries(['food','cohesion','knowledge','culture','exchange'].map(k=>[k,distribution(ok.map(s=>s.metrics[k].nearHighShare))])),
   eventWindowDispersion:distribution(ok.map(s=>s.chronicle.civilizationWindowDispersion)),
   uninhabitedYears:distribution(ok.map(s=>s.sites.reduce((a,x)=>a+x.uninhabitedYears,0))),resettled:distribution(ok.map(s=>s.sites.reduce((a,x)=>a+x.resettled,0))),
   shortageShare:'N/A (engine only)',populationFloorWorlds:ok.filter(s=>s.population.floorYears>0).length}}];
}));
const results={issue:40,stage:'D1b-population',measureId:MEASURE_ID,quick,horizon:HORIZON,checkEvery:CHECK_EVERY,
 patches:PATCHES.map(p=>p.find),settings:SETTINGS,cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),summary,
 worlds:worlds.map(({ms,...w})=>w),failures};
let commit=null,dirty=null;try{commit=execSync('git rev-parse HEAD',{encoding:'utf8'}).trim();dirty=execSync('git status --porcelain',{encoding:'utf8'}).trim().length>0;}catch{}
const resultsJson=JSON.stringify(results);
const runtime={startedAt,finishedAt:new Date().toISOString(),totalMs:ms(started),commit,dirtyWorktree:dirty,node:process.version,
 platform:`${os.platform()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model??null,perWorldMs:worlds.map(w=>[w.id,w.ms])};
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:sha(resultsJson),runtime,results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d1b-population',status:failures.length?'FAILED':'PASSED',failures:failures.length,worlds:worlds.length,resultsSha256:sha(resultsJson),totalMs:runtime.totalMs,out}));
if(failures.length)process.exitCode=1;
