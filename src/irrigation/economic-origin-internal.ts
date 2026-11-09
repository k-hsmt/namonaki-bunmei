/** Prefix storage without a second world; each dialect has its own strict wire names. */
import type {GeneratedWorldSave} from '../story/world-save.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import type {RegionalEconomy} from '../story/regional-economy.js';
import {wireObject} from '../story/generated-state-review.js';
export interface OriginDialect {readonly prefix:string;readonly reference:string;readonly environment:string}
export interface OriginContainer {readonly origin:{readonly format:string;readonly template:unknown};readonly world:Omit<GeneratedBridgeReview,'format'|'status'> & {readonly format:string;readonly status:string};readonly initialEconomy:RegionalEconomy}
type Path=readonly (string|number)[];
function binding(p:Path):{path:Path;prefix?:true;blocks?:true}|undefined {
 const key=p.join('/');
 const staticPaths:Record<string,Path>={'initialTerrain/record':['world','review','terrain'],'initialTerrain/hydrology':['world','review','bridgeReview','hydrology'],'initialTerrain/plans':['world','review','plans'],'vegetation/initial':['world','vegetation','initial'],'state/economy':['initialEconomy']};
 if(staticPaths[key])return {path:staticPaths[key]!};
 if(['vegetation/events','environment/targets','environment/uses','environment/checkpoints','irrigation/systems','irrigation/events','irrigation/attempts'].includes(key))return {path:['world',...p],prefix:true};
 if(/^state\/(history|decisions|samples|memory\/log|housing\/events|publicSpaces\/events|observation\/blocks)$/.test(key)||/^state\/observation\/sites\/[012]\/(changes|buildingChanges|practiceChanges)$/.test(key))return {path:['world','review',...p],prefix:true,...(key==='state/observation/blocks'?{blocks:true}:{})};
}
export function captureEconomicOriginInternal<D extends OriginDialect>(save:GeneratedWorldSave,dialect:D):{readonly format:D['prefix'];readonly template:unknown} {
 const walk=(v:unknown,p:Path):unknown=>{
  if(p.join('/')==='environment/current')return {format:dialect.environment};
  const b=binding(p);if(b){if(b.prefix&&!Array.isArray(v))throw Error('Missing origin ledger');return {format:dialect.reference,path:b.path,...(b.prefix?{count:(v as unknown[]).length}:{}),...(b.blocks?{lastChanges:((v as {changes:unknown[]}[]).at(-1)?.changes.length??0)}:{})};}
  if(Array.isArray(v))return v.map((x,i)=>walk(x,[...p,i]));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,[...p,k])]));return v;
 };
 return {format:dialect.prefix,template:walk(save,[])};
}
export function hydrateEconomicOriginInternal(trial:OriginContainer,dialect:OriginDialect):{save:GeneratedWorldSave;environmentReplay:boolean}{
 const origin=wireObject(trial.origin,['format','template']);if(origin.format!==dialect.prefix)throw Error('Unknown coupled origin');let environmentReplay=false;
 const walk=(v:unknown,p:Path):unknown=>{
  if(p.join('/')==='environment/current'){const marker=wireObject(v,['format']);if(marker.format!==dialect.environment)throw Error('Invalid origin environment reference');environmentReplay=true;return trial.world.environment!.checkpoints[0];}
  const b=binding(p);if(b){const ref=wireObject(v,['format','path',...(b.prefix?['count']:[]),...(b.blocks?['lastChanges']:[])]);
   if(ref.format!==dialect.reference||JSON.stringify(ref.path)!==JSON.stringify(b.path))throw Error('Invalid coupled prefix reference');
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
