/** One immutable prefix: store initial mutable values and references to saved ledgers. */
import type {GeneratedWorldSave} from '../story/world-save.js';
import {wireObject} from '../story/generated-state-review.js';
import type {CoupledReviewWorld,IrrigationCoupledReview} from './coupled-types-v1.js';
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
export interface CoupledOrigin {readonly format:'coupled-origin-prefix-v1';readonly template:unknown}
type Path=readonly (string|number)[];
function binding(p:Path):{path:Path;prefix?:true;blocks?:true}|undefined {
 const key=p.join('/');
 const staticPaths:Record<string,Path>={'initialTerrain/record':['world','review','terrain'],'initialTerrain/hydrology':['world','review','bridgeReview','hydrology'],'initialTerrain/plans':['world','review','plans'],'vegetation/initial':['world','vegetation','initial'],'state/economy':['initialEconomy']};
 if(staticPaths[key])return {path:staticPaths[key]!};
 if(['vegetation/events','environment/targets','environment/uses','environment/checkpoints','irrigation/systems','irrigation/events','irrigation/attempts'].includes(key))return {path:['world',...p],prefix:true};
 if(/^state\/(history|decisions|samples|memory\/log|housing\/events|publicSpaces\/events|observation\/blocks)$/.test(key)||/^state\/observation\/sites\/[012]\/(changes|buildingChanges|practiceChanges)$/.test(key))return {path:['world','review',...p],prefix:true,...(key==='state/observation/blocks'?{blocks:true}:{})};
}
export function captureCoupledOrigin(save:GeneratedWorldSave):CoupledOrigin {
 const walk=(v:unknown,p:Path):unknown=>{
  if(p.join('/')==='environment/current')return {format:'coupled-origin-environment-v1'};
  const b=binding(p);if(b){if(b.prefix&&!Array.isArray(v))throw Error('Missing origin ledger');return {format:'coupled-origin-ref-v1',path:b.path,...(b.prefix?{count:(v as unknown[]).length}:{}),...(b.blocks?{lastChanges:((v as {changes:unknown[]}[]).at(-1)?.changes.length??0)}:{})};}
  if(Array.isArray(v))return v.map((x,i)=>walk(x,[...p,i]));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,[...p,k])]));return v;
 };
 return {format:'coupled-origin-prefix-v1',template:walk(save,[])};
}
export function hydrateCoupledOrigin(trial:IrrigationCoupledReview):{save:GeneratedWorldSave;environmentReplay:boolean}{
 const origin=wireObject(trial.origin,['format','template']);if(origin.format!=='coupled-origin-prefix-v1')throw Error('Unknown coupled origin');let environmentReplay=false;
 const walk=(v:unknown,p:Path):unknown=>{
  if(p.join('/')==='environment/current'){const marker=wireObject(v,['format']);if(marker.format!=='coupled-origin-environment-v1')throw Error('Invalid origin environment reference');environmentReplay=true;return trial.world.environment!.checkpoints[0];}
  const b=binding(p);if(b){const ref=wireObject(v,['format','path',...(b.prefix?['count']:[]),...(b.blocks?['lastChanges']:[])]);
   if(ref.format!=='coupled-origin-ref-v1'||JSON.stringify(ref.path)!==JSON.stringify(b.path))throw Error('Invalid coupled prefix reference');
   let value:unknown=trial;for(const part of b.path)value=(value as Record<string|number,unknown>)[part];
   if(b.prefix){if(!Array.isArray(value)||!Number.isSafeInteger(ref.count)||Number(ref.count)<0||Number(ref.count)>value.length)throw Error('Invalid coupled prefix cursor');value=value.slice(0,Number(ref.count));
    if(b.blocks){const blocks=value as {year:number;population:number[];changes:number[][]}[],last=blocks.at(-1);if(!last||!Number.isSafeInteger(ref.lastChanges)||Number(ref.lastChanges)<0||Number(ref.lastChanges)>last.changes.length)throw Error('Invalid origin population cursor');blocks[blocks.length-1]={...last,changes:last.changes.slice(0,Number(ref.lastChanges))};}
   }return value;
  }
  if(Array.isArray(v))return v.map((x,i)=>walk(x,[...p,i]));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,[...p,k])]));return v;
 };
 return {save:walk(origin.template,[]) as GeneratedWorldSave,environmentReplay};
}
/** Snapshot only counters, never whole ledgers. Prefix counts can be checked by year. */
export function coupledSourceCursors(r:GeneratedFacilityReview,year=r.state.observation!.lastYear!):readonly number[]{
 const count=(a:readonly unknown[],key:string)=>{let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(Number((a[m] as Record<string,unknown>)[key])<=year)lo=m+1;else hi=m;}return lo;};
 return [count(r.state.history,'year'),count(r.placements,'builtYear'),count(r.bridgeReview!.bridges,'builtYear'),count(r.state.housing!.events,'year'),count(r.state.publicSpaces!.events,'year'),count(r.state.memory!.log,'year'),count(r.state.samples,'year'),count(r.state.decisions,'year'),...r.state.observation!.sites!.flatMap(s=>[count(s.changes,'year'),count(s.buildingChanges,'year'),count(s.practiceChanges,'year')]),Math.floor(year/100)+1,year%100];
}
