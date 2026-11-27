/**
 * Issue #40 D1: every measure of one confirmed civilization (D0 §11.2), shared by the D1a trial and the D1b probes.
 * Reads through the existing readers only (#29 confirmed metric ledger, observation ledger, settlement ledger, memory log,
 * chronicle); never writes to the state.
 */
import {lastObservedYear} from '../../dist/story/engine.js';
import {observationAt} from '../../dist/story/observations.js';
import {confirmedMetricRange} from '../../dist/story/civilization-metrics.js';
import {ANALYSIS,distribution,firstYearAtLeast,declines,boundedSeries,siteResidency,centerMoves,chronicleMeasures,memoryMeasures,decisionMeasures} from './history40-measures.mjs';

export const TRAJECTORY_EVERY=10,POPULATION_FLOOR=60;

/**
 * `exchange` is [{year,value}] as observed (exchange is not in the #29 ledger); `exchangeSampling` describes how, and
 * `exchangeTrajectoryEvery` which of those years go into the trajectory. `check(ok,message)` reports a failed check.
 */
export function measureCivilization(state,horizon,exchange,{exchangeSampling,exchangeTrajectoryEvery,check}){
 check(lastObservedYear(state)===horizon&&!state.pending,`seed ${state.seed}: not confirmed up to ${horizon}`);
 const series=Object.fromEntries(['population','food','cohesion','knowledge','culture'].map(k=>[k,confirmedMetricRange(state,k,0,horizon)]));
 for(const [k,s] of Object.entries(series))check(s.length===horizon+1,`seed ${state.seed}: ${k} has ${s.length} confirmed years`);
 const ledger=state.observation,people=[];
 for(let y=0;y<=horizon;y++){const o=observationAt(ledger,y);people.push({year:y,people:o.residents.slice(0,3).map(r=>r.population)});
  if(y%97===0)check(o.population===series.population[y].value,`seed ${state.seed}: population ${y} disagrees between readers`);}
 const pop=series.population.map(p=>p.value),sites=ledger.sites.map(site=>siteResidency(site.changes,horizon));
 const traj=Object.fromEntries(Object.entries(series).map(([k,s])=>[k,s.filter(p=>p.year%TRAJECTORY_EVERY===0).map(p=>+p.value.toFixed(2))]));
 return {
  population:{...distribution(pop),start:pop[0],end:pop.at(-1),floorYears:pop.filter(v=>v<=POPULATION_FLOOR).length,declines:declines(series.population)},
  metrics:{...Object.fromEntries(['food','cohesion','knowledge','culture'].map(k=>[k,{...boundedSeries(series[k].map(p=>p.value)),firstNearHighYear:firstYearAtLeast(series[k],ANALYSIS.capHigh)}])),
   exchange:{...boundedSeries(exchange.map(p=>p.value)),firstNearHighYear:firstYearAtLeast(exchange,ANALYSIS.capHigh),sampling:exchangeSampling,observedYears:exchange.length,missingYears:horizon+1-exchange.length}},
  populationMinYear:series.population.reduce((b,p)=>p.value<b.value?p:b).year,
  sites,center:centerMoves(people),
  chronicle:chronicleMeasures(state.history,horizon),
  memory:memoryMeasures(state.memory.log,state.memory.legacies,horizon),
  decisions:decisionMeasures(state.decisions,horizon),
  trajectory:{every:TRAJECTORY_EVERY,...traj,exchange:exchange.filter(p=>p.year%exchangeTrajectoryEvery===0).map(p=>[p.year,+p.value.toFixed(2)])},
  identity:{name:state.name,homeland:state.homeland,trait:state.trait},
 };
}

/** Do two measured civilizations agree civilization-wide (every TRAJECTORY_EVERY years; exchange at the shared sampled years)? */
export function civilizationWideAgreement(a,b){
 const ex=new Map(b.trajectory.exchange);
 return {metrics:['population','food','cohesion','knowledge','culture'].every(k=>JSON.stringify(a.trajectory[k])===JSON.stringify(b.trajectory[k])),
  exchangeAtSharedYears:a.trajectory.exchange.every(([y,v])=>!ex.has(y)||ex.get(y)===v),decisionYears:JSON.stringify(a.decisions.years)===JSON.stringify(b.decisions.years)};
}

/** The scalar per world summarized across worlds in the D1 reports (no composite score: one distribution per measure). */
export const D1A_SCALARS={
 'population.end':m=>m.population.end,'population.max':m=>m.population.max,'population.min':m=>m.population.min,
 'population.deepestDecline':m=>m.population.declines.deepest.fraction,'population.declines':m=>m.population.declines.count,
 'population.declinesCensored':m=>m.population.declines.censored,'population.floorYears':m=>m.population.floorYears,
 ...Object.fromEntries(['food','cohesion','knowledge','culture','exchange'].flatMap(k=>[[`${k}.mean`,m=>m.metrics[k].mean],[`${k}.sd`,m=>m.metrics[k].sd],
  [`${k}.nearHighShare`,m=>m.metrics[k].nearHighShare],[`${k}.firstNearHighYear`,m=>m.metrics[k].firstNearHighYear],[`${k}.nearLowShare`,m=>m.metrics[k].nearLowShare],[`${k}.lastQuarterMean`,m=>m.metrics[k].quarterMeans[3]]])),
 'sites.maxScale':m=>Math.max(...m.sites.map(s=>s.maxScale)),'sites.uninhabitedYears':m=>m.sites.reduce((a,s)=>a+s.uninhabitedYears,0),
 'sites.resettled':m=>m.sites.reduce((a,s)=>a+s.resettled,0),'sites.scaleDowns':m=>m.sites.reduce((a,s)=>a+s.scaleDowns,0),
 'center.changes':m=>m.center.changes,
 'chronicle.total':m=>m.chronicle.total,'chronicle.civilizationPerWindowMedian':m=>m.chronicle.perWindow.civilization.median,
 'chronicle.emptyWindows':m=>m.chronicle.emptyWindows,'chronicle.distinctCivilizationKinds':m=>m.chronicle.distinctCivilizationKinds,
 'chronicle.unclassified':m=>m.chronicle.unclassified,
 ...Object.fromEntries(['shortage','trade','damage','society'].map(g=>[`groups.${g}`,m=>m.chronicle.groups[g]])),
 'memory.formed':m=>m.memory.formed,'memory.lost':m=>m.memory.lost,'memory.activeAtHorizon':m=>m.memory.activeAtHorizon.length,
 'decisions.count':m=>m.decisions.count,
};

/** One distribution per scalar over the worlds whose `model` succeeded, overall and per biome. */
export function acrossWorlds(worlds,model,scalars,biomes){
 const ok=worlds.filter(w=>w[model]?.status==='ok'),pick=(rows,f)=>distribution(rows.map(w=>f(w[model])));
 return Object.fromEntries(Object.entries(scalars).map(([k,f])=>[k,{all:pick(ok,f),byBiome:Object.fromEntries(biomes.map(b=>[b,pick(ok.filter(w=>w.biome===b),f)]))}]));
}
