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
export function frozenEconomyCapture(value:EconomyCapture):EconomyCapture {
 const copy=structuredClone(value);function freeze(v:unknown){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}}freeze(copy);return copy;
}
