/** Optional review-only tap. No callback or snapshot is persisted in a world. */
import type {RegionalEconomy,EconomyRecord,AnnualEconomyTotals} from './regional-economy.js';
type Immutable<T>=T extends readonly unknown[]?readonly Immutable<T[number]>[]:T extends object?{readonly [K in keyof T]:Immutable<T[K]>}:T;
export interface EconomyCapture {
 readonly year:number;readonly drought:number;
 readonly before:{readonly economy:Immutable<RegionalEconomy>;readonly people:readonly number[]};
 readonly conditions:{readonly harvestFactors:readonly number[];readonly blockedRegions:readonly string[];readonly disruptionId?:string;readonly granaries?:readonly boolean[]};
 readonly after:{readonly economy:Immutable<RegionalEconomy>;readonly people:readonly number[]};
 readonly records:readonly {readonly id:string;readonly event:Immutable<EconomyRecord>}[];
 readonly totals:Immutable<AnnualEconomyTotals>;
}
export type EconomyObserver=(capture:EconomyCapture)=>unknown;
const owned=new WeakSet<object>();
function freeze<T>(v:T):T {if(v&&typeof v==='object'&&!owned.has(v)){Object.values(v).forEach(freeze);Object.freeze(v);owned.add(v);}return v;}
/** Copy exactly the regional contract; never freeze references owned by the live engine. */
function copyEconomy(e:EconomyCapture['before']['economy']):RegionalEconomy {return {districts:e.districts.map(d=>({reserve:d.reserve,coverage:[...d.coverage],importShare:d.importShare,shortageRecord:d.shortageRecord,shortageYears:d.shortageYears})),routes:e.routes.map(r=>({tradeYears:[...r.tradeYears],blocked:r.blocked,closureRecord:r.closureRecord,agreementRecord:r.agreementRecord,originRecord:r.originRecord,missedMaintenance:r.missedMaintenance,capacityBonus:r.capacityBonus})),migrationYears:{...e.migrationYears}};}
export function beginEconomyCapture(economy:RegionalEconomy,people:readonly number[]):EconomyCapture['before'] {return freeze({economy:copyEconomy(economy),people:[...people]});}
export function frozenEconomyCapture(value:EconomyCapture):EconomyCapture {
 const before=owned.has(value.before)?value.before:freeze({economy:copyEconomy(value.before.economy),people:[...value.before.people]});
 return freeze({year:value.year,drought:value.drought,before,conditions:{...value.conditions,harvestFactors:[...value.conditions.harvestFactors],blockedRegions:[...value.conditions.blockedRegions],...(value.conditions.granaries?{granaries:[...value.conditions.granaries]}:{})},after:{economy:copyEconomy(value.after.economy),people:[...value.after.people]},records:value.records.map(r=>({id:r.id,event:{...r.event,causes:[...r.event.causes],...(r.event.relatedIds?{relatedIds:[...r.event.relatedIds]}:{})}})),totals:{harvest:[...value.totals.harvest],imports:[...value.totals.imports],traded:[...value.totals.traded],discarded:[...value.totals.discarded],moves:value.totals.moves.map(m=>({...m}))}});
}
