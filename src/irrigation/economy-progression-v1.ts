/** Explicit C1 producer. Observation does not feed any result back into B. */
import {advanceGeneratedBridgeReview,chooseGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview,type GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {createGeneratedWorldSave,restoreGeneratedWorld} from '../story/world-save.js';
import {createRegionalEconomy} from '../story/regional-economy.js';
import {lastObservedYear} from '../story/engine.js';
import type {EconomyCapture} from '../story/economy-observer.js';
import {regions} from '../story/population.js';
import {sameWire} from '../story/generated-state-review.js';
import {freezeReview,reviewBaseHash} from './wire-v1.js';
import {replayEconomy,ownEconomyReview,economyInputHash,knownEconomyReview} from './economy-history-v1.js';
import {irrigationEconomyRule,type IrrigationEconomyReview,type EconomyTapeRow} from './economy-types-v1.js';
export interface EconomyAdvanceTiming {restoreMs:number;annualMs:number;snapshotMs:number;comparisonMs:number;bindingMs:number;ownershipMs:number;totalMs:number}
function compact(c:EconomyCapture):EconomyTapeRow {return [c.before.people,c.drought,regions.reduce((m,r,i)=>m|(c.conditions.blockedRegions.includes(r.id)?1<<i:0),0),c.conditions.granaries?c.conditions.granaries.reduce((m,v,i)=>m|(v?1<<i:0),0):-1,c.conditions.disruptionId??null,c.records.map(r=>r.id)];}
async function commit(world:GeneratedBridgeReview,initial:NonNullable<IrrigationEconomyReview['initialEconomy']>,intro:number,previous?:IrrigationEconomyReview,captures:readonly EconomyCapture[]=[],timing?:EconomyAdvanceTiming):Promise<IrrigationEconomyReview>{
 let mark=timing?performance.now():0;const base=createGeneratedWorldSave(world);if(timing){timing.snapshotMs=performance.now()-mark;mark=performance.now();}if(base.version!==6||!world.irrigation)throw Error('C1 requires production irrigation');const tape=freezeReview([...(previous?.tape??[]),...captures.map(compact)]),confirmedThrough=lastObservedYear(world.review.state);if(confirmedThrough!==intro+tape.length)throw Error('Economic capture has gaps or duplicates');
 const source={base,introducedYear:intro,initialEconomy:freezeReview(structuredClone(initial)),tape},task=replayEconomy(source,previous,(row)=>{const capture=captures[row.year-(previous?.confirmedThrough??intro)-1];if(!capture||!sameWire(row.views[0]!.economy,capture.after.economy)||!sameWire(row.views[0]!.people,capture.after.people)||!sameWire(row.views[0]!.harvest,capture.totals.harvest))throw Error('Captured B economy does not reproduce');});let replay:ReturnType<typeof task.next>;
 do{replay=task.next();}while(!replay.done);
 if(timing){timing.comparisonMs=performance.now()-mark;mark=performance.now();}
 const baseHash=await reviewBaseHash(base),input={baseHash,introducedYear:intro,initialEconomy:source.initialEconomy,tape},inputHash=await economyInputHash(input);
 if(timing){timing.bindingMs=performance.now()-mark;mark=performance.now();}
 const result=ownEconomyReview({format:'irrigation-economy-review-v1',schemaVersion:1,status:'review-only',rule:irrigationEconomyRule,introducedYear:intro,confirmedThrough,base,baseHash,inputHash,initialEconomy:source.initialEconomy,tape,checkpoints:replay.value.checkpoints,current:replay.value.current},replay.value.ctx);if(timing)timing.ownershipMs=performance.now()-mark;return result;
}
export async function createEconomyReview(world:GeneratedBridgeReview):Promise<IrrigationEconomyReview>{return commit(world,world.review.state.economy??createRegionalEconomy(),lastObservedYear(world.review.state));}
async function advanceTrial(trial:IrrigationEconomyReview,years:number,choices:'automatic'|'stop'='automatic',timing?:EconomyAdvanceTiming):Promise<IrrigationEconomyReview>{
 knownEconomyReview(trial);if(!Number.isSafeInteger(years)||years<0||trial.base.state.year+years>10000)throw Error('Invalid C1 advance');const begin=timing?performance.now():0,captures:EconomyCapture[]=[],base=restoreGeneratedWorld(trial.base);let mark=performance.now();if(timing)timing.restoreMs=mark-begin;
 const world=advanceGeneratedBridgeReview(base,years,choices,{observeEconomy:c=>captures.push(c)});if(timing)timing.annualMs=performance.now()-mark;const result=await commit(world,trial.initialEconomy,trial.introducedYear,trial,captures,timing);if(timing)timing.totalMs=performance.now()-begin;return result;
}
export async function advanceEconomyReview(trial:IrrigationEconomyReview,years:number,choices:'automatic'|'stop'='automatic'):Promise<IrrigationEconomyReview>{return advanceTrial(trial,years,choices);}
export async function measureEconomyAdvance(trial:IrrigationEconomyReview,years:number){const timing:EconomyAdvanceTiming={restoreMs:0,annualMs:0,snapshotMs:0,comparisonMs:0,bindingMs:0,ownershipMs:0,totalMs:0};const review=await advanceTrial(trial,years,'automatic',timing);return {review,timing};}
export async function chooseEconomyReview(trial:IrrigationEconomyReview,index:number|'random'):Promise<IrrigationEconomyReview>{knownEconomyReview(trial);const captures:EconomyCapture[]=[],world=restoreGeneratedWorld(trial.base),next=index==='random'?chooseAutomaticallyGeneratedBridgeReview(world,c=>captures.push(c)):chooseGeneratedBridgeReview(world,index,c=>captures.push(c));return commit(next,trial.initialEconomy,trial.introducedYear,trial,captures);}
