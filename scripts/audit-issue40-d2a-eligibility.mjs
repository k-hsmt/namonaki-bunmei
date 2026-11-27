/**
 * Issue #40 D2a preparation: does each current civilization event happen without the confirmed facts its own text states?
 * (D0 §5: eligibility is separate from weight; no candidate for something that does not exist. A04: no unfounded event.)
 *
 *   npm run build && node scripts/audit-issue40-d2a-eligibility.mjs   →  artifacts/history40-d2a-eligibility/report.json
 *   Env: HISTORY40_D2A_QUICK=1 (2 worlds to year 1000).
 *
 * The 70 D1b worlds (10 tuning seeds per biome), the current full world to year 5000, read-only. For each event kind whose
 * text states a fact the settlement ledger records, the event is "supported" when that fact is confirmed in some district
 * in the event's year (as of the end of that year: the ledger's own reader). The fact chosen for each kind is written in
 * FACTS; it is the nearest fact the current ledgers keep, and a reviewer should read it as such. Hazards are also counted
 * by whether any damage record names them (a hazard may damage nothing; that is not a failure).
 * This measures the current rules; it changes nothing. Exits 1 only when the run itself fails a consistency check.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession} from '../dist/story/world-session.js';
import {lastObservedYear} from '../dist/story/engine.js';
import {siteAt} from '../dist/story/settlement-history.js';
import {allocateSeeds} from './lib/history40-measures.mjs';

const out='artifacts/history40-d2a-eligibility',quick=process.env.HISTORY40_D2A_QUICK==='1';
const HORIZON=quick?1000:5000,PER_BIOME=quick?1:10,BIOMES=quick?['temperate_forest','tundra']:BIOME_KINDS;
const failures=[],check=(ok,m)=>{if(!ok){failures.push(m);console.error('FAIL',m);}return ok;};
const allocation=allocateSeeds({tuning:10,acceptance:20});
const cases=BIOMES.flatMap(b=>allocation.biomes[b].tuning.slice(0,PER_BIOME).map((seed,rank)=>({id:`${b}-${rank+1}`,biome:b,seed})));

const views=(sites,year)=>[0,1,2].map(i=>siteAt(sites,i,year));
const standing=(v,kind)=>v.buildings.some(b=>b.kind===kind&&b.condition!=='ruined');
/** Kind → the text's claim, and the confirmed fact checked for it. */
const FACTS={
 decline:{claim:'人の住まなくなった村が現れる',fact:'その年、いずれかの地区が無人',test:(vs)=>vs.some(v=>!v.inhabited)},
 abandon:{claim:'遠い村で灯りが消える',fact:'その年、いずれかの地区が無人',test:(vs)=>vs.some(v=>!v.inhabited)},
 rebirth:{claim:'忘れられた土地に人が戻る',fact:'その年までに、いずれかの地区が無人だったことがある',test:(vs,sites,year)=>sites.some(s=>s.changes.some(c=>c.year<=year&&!c.view.inhabited))},
 first_city:{claim:'村々の中心に大きな町が生まれる',fact:'その年、いずれかの地区が町（規模2）以上',test:(vs)=>vs.some(v=>v.inhabited&&v.scale>=2)},
 first_granary:{claim:'共同の穀物庫が築かれる',fact:'その年、いずれかの地区に廃墟でない穀物庫がある',test:(vs)=>vs.some(v=>standing(v,'granary'))},
 market:{claim:'定期的な市が立つ',fact:'その年、いずれかの地区に廃墟でない市がある',test:(vs)=>vs.some(v=>standing(v,'market'))},
 first_port:{claim:'川辺に常設の交易所ができる（舟着場）',fact:'その年、川辺に廃墟でない市がある（最も近い記録）',test:(vs)=>standing(vs[0],'market')},
 split:{claim:'一部の集落が別の共同体として暮らし始める',fact:'その年、いずれかの地区が創設時と別の寄り合い',test:(vs)=>vs.some(v=>v.communityId!=='founding-community')},
 first_fragment:{claim:'長く続いた共同の決まりが解かれる',fact:'その年、いずれかの地区が創設時と別の寄り合い',test:(vs)=>vs.some(v=>v.communityId!=='founding-community')},
 council:{claim:'集落を越えた話し合いが始まる',fact:'その年、いずれかの地区に寄り合いの慣習がある',test:(vs)=>vs.some(v=>v.practices.some(p=>p.kind==='council'&&p.active))},
 first_confederation:{claim:'集落の寄り合いが連合となる',fact:'その年、2地区以上に寄り合いの慣習がある',test:(vs)=>vs.filter(v=>v.practices.some(p=>p.kind==='council'&&p.active)).length>=2},
};
const HAZARDS=['flood','earthquake','fire','storm'];

const counts={},hazards=Object.fromEntries(HAZARDS.map(k=>[k,{events:0,withDamageRecord:0}])),examples={},perWorld=[];
for(const k of Object.keys(FACTS)){counts[k]={events:0,supported:0,unsupported:0,worldsWithEvent:0,worldsWithUnsupported:0};examples[k]=[];}
const started=performance.now();
for(const c of cases){
 const t=performance.now();
 try{
  const world=await advanceArchitectureWorld((await createNewArchitectureWorld(c.seed)).architecture,HORIZON,'automatic');
  const s=architectureProductionSession(world).state,sites=s.observation.sites;
  check(lastObservedYear(s)===HORIZON&&!s.pending,`${c.id}: not confirmed up to ${HORIZON}`);
  const damagedBy=new Set(s.history.filter(r=>/-damaged$/.test(r.kind??'')).flatMap(r=>r.relatedIds??[]));
  const row={id:c.id,seed:c.seed,events:{}};
  for(const r of s.history){
   const f=FACTS[r.kind];
   if(f){const ok=f.test(views(sites,r.year),sites,r.year),k=counts[r.kind];k.events++;ok?k.supported++:k.unsupported++;
    (row.events[r.kind]??={events:0,unsupported:0}).events++;if(!ok){row.events[r.kind].unsupported++;if(examples[r.kind].length<5)examples[r.kind].push({world:c.id,seed:c.seed,year:r.year,id:r.id});}}
   if(HAZARDS.includes(r.kind)){hazards[r.kind].events++;if(damagedBy.has(r.id))hazards[r.kind].withDamageRecord++;}
  }
  for(const [k,v] of Object.entries(row.events)){counts[k].worldsWithEvent++;if(v.unsupported)counts[k].worldsWithUnsupported++;}
  perWorld.push(row);
 }catch(e){check(false,`${c.id}: ${e.message}`);perWorld.push({id:c.id,seed:c.seed,status:'failed',error:String(e.message)});}
 console.log(c.id,'seed',c.seed,Math.round(performance.now()-t)+'ms');
}
const results={issue:40,stage:'D2a-eligibility',horizon:HORIZON,quick,cases:cases.map(c=>({id:c.id,biome:c.biome,seed:c.seed})),
 facts:Object.fromEntries(Object.entries(FACTS).map(([k,f])=>[k,{claim:f.claim,fact:f.fact}])),counts,hazards,examples,perWorld,failures};
const json=JSON.stringify(results);
await mkdir(out,{recursive:true});
await writeFile(`${out}/report.json`,JSON.stringify({status:failures.length?'FAILED':'PASSED',resultsSha256:createHash('sha256').update(json).digest('hex'),
 runtime:{totalMs:Math.round(performance.now()-started),node:process.version},results},null,1)+'\n');
console.log(JSON.stringify({type:'issue40-d2a-eligibility',status:failures.length?'FAILED':'PASSED',counts,hazards}));
if(failures.length)process.exitCode=1;
