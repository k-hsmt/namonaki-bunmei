import type {GeneratedWorldSave} from '../story/world-save.js';
import type {RegionalEconomy} from '../story/regional-economy.js';
export const economyPolicies=['baseline','yield-only','cost-only','combined'] as const;
export type EconomyPolicy=typeof economyPolicies[number];
export const irrigationEconomyRule=Object.freeze({id:'irrigation-economy-single-year-v1' as const,lagYears:1,gainMaxBp:100,costMaxBp:300,builtBp:200,maintainedBp:50,repairedBp:100,backfilledBp:50,routineBp:5,dryScale:40,lengthScale:64});
/** Year is introducedYear + index + 1; flags use the three region indices. */
export type EconomyTapeRow=readonly [people:readonly number[],drought:number,blockedMask:number,granaryMask:number,disruptionId:string|null,recordIds:readonly string[]];
export interface EconomyTotals {readonly harvestDelta:readonly (readonly number[])[];readonly gainBp:number;readonly requestedCostBp:number;readonly costBp:number;readonly cappedCostYears:number;readonly zeroPopulationWorkYears:number;readonly activeYears:number;readonly idleYears:number}
export interface EconomyCheckpoint {readonly year:number;readonly baseline:RegionalEconomy;readonly totals:EconomyTotals}
export interface IrrigationEconomyReview {
 readonly format:'irrigation-economy-review-v1';readonly schemaVersion:1;readonly status:'review-only';readonly rule:typeof irrigationEconomyRule;
 readonly introducedYear:number;readonly confirmedThrough:number;readonly base:GeneratedWorldSave;readonly baseHash:string;readonly inputHash:string;
 readonly initialEconomy:RegionalEconomy;readonly tape:readonly EconomyTapeRow[];readonly checkpoints:readonly EconomyCheckpoint[];readonly current:EconomyCheckpoint;
}
export interface EconomyEffect {readonly sourceYear:number;readonly systemId:string|null;readonly status:string;readonly wetCells:number;readonly fieldCells:number;readonly moisture:number|null;readonly fieldCount:number;readonly gainBp:number;readonly requestedCostBp:number;readonly costBp:number;readonly workEventIds:readonly string[]}
