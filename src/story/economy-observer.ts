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
const ownedBefore=new WeakSet<object>();
function freeze<T>(v:T):T {if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
/** Copy exactly the regional contract; never freeze references owned by the live engine. */
function copyEconomy(e:EconomyCapture['before']['economy']):RegionalEconomy {return {districts:e.districts.map(d=>({reserve:d.reserve,coverage:[...d.coverage],importShare:d.importShare,shortageRecord:d.shortageRecord,shortageYears:d.shortageYears})),routes:e.routes.map(r=>({tradeYears:[...r.tradeYears],blocked:r.blocked,closureRecord:r.closureRecord,agreementRecord:r.agreementRecord,originRecord:r.originRecord,missedMaintenance:r.missedMaintenance,capacityBonus:r.capacityBonus})),migrationYears:{...e.migrationYears}};}
export function beginEconomyCapture(economy:RegionalEconomy,people:readonly number[]):EconomyCapture['before'] {const before=freeze({economy:copyEconomy(economy),people:[...people]});ownedBefore.add(before);return before;}
export function frozenEconomyCapture(value:EconomyCapture):EconomyCapture {
 const before=ownedBefore.has(value.before)?value.before:freeze({economy:copyEconomy(value.before.economy),people:[...value.before.people]});
 const rest=freeze({conditions:{...value.conditions,harvestFactors:[...value.conditions.harvestFactors],blockedRegions:[...value.conditions.blockedRegions],...(value.conditions.granaries?{granaries:[...value.conditions.granaries]}:{})},after:{economy:copyEconomy(value.after.economy),people:[...value.after.people]},records:value.records.map(r=>({id:r.id,event:{...r.event,causes:[...r.event.causes],...(r.event.relatedIds?{relatedIds:[...r.event.relatedIds]}:{})}})),totals:{harvest:[...value.totals.harvest],imports:[...value.totals.imports],traded:[...value.totals.traded],discarded:[...value.totals.discarded],moves:value.totals.moves.map(m=>({...m}))}});
 return Object.freeze({year:value.year,drought:value.drought,before,...rest});
}

/** Private annual receipts need only these detached values, not two full economies.
 * Public observers retain the complete immutable EconomyCapture above. */
export interface CoupledReceiptCaptureInternal {
 readonly year:number;readonly drought:number;
 readonly before:{readonly people:readonly number[]};
 readonly conditions:Pick<EconomyCapture['conditions'],'blockedRegions'|'granaries'|'disruptionId'>;
 readonly records:readonly {readonly id:string}[];
 readonly totals:Pick<EconomyCapture['totals'],'harvest'|'discarded'>;
}
export type CoupledReceiptObserverInternal=(capture:CoupledReceiptCaptureInternal)=>void;
export function frozenCoupledReceiptCaptureInternal(value:CoupledReceiptCaptureInternal):CoupledReceiptCaptureInternal {
 return Object.freeze({year:value.year,drought:value.drought,before:Object.freeze({people:Object.freeze([...value.before.people])}),
  conditions:Object.freeze({disruptionId:value.conditions.disruptionId,blockedRegions:Object.freeze([...value.conditions.blockedRegions]),...(value.conditions.granaries?{granaries:Object.freeze([...value.conditions.granaries])}:{})}),
  records:Object.freeze(value.records.map(r=>Object.freeze({id:r.id}))),
  totals:Object.freeze({harvest:Object.freeze([...value.totals.harvest]),discarded:Object.freeze([...value.totals.discarded])})});
}
