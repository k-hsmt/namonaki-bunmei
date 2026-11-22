/**
 * Issue #29 S1: the one read contract for the civilization-wide status (D0 §4).
 *
 * Every year returned here is a confirmed year: population comes from the existing observation blocks and
 * food / cohesion / knowledge / culture from the confirmed metric history. A pending year, a future year, an
 * invalid year or a year the ledger never recorded is not readable (null). Nothing is derived from the live
 * `state.food` etc., which may hold a pending year's draft values. A corrupt ledger throws instead of being repaired.
 */
import {lastObservedYear,type CivilizationState} from './engine.js';
import {metricsAt,observationAt,populationTotalsBetween} from './observations.js';

export const civilizationMetricKeys=['population','food','cohesion','knowledge','culture'] as const;
export type CivilizationMetricKey=typeof civilizationMetricKeys[number];

export interface CivilizationMetricObservation {
 readonly year:number;
 readonly population:number;
 readonly food:number;
 readonly cohesion:number;
 readonly knowledge:number;
 readonly culture:number;
}

export function observeCivilizationMetrics(state:Readonly<CivilizationState>,confirmedYear:number):CivilizationMetricObservation|null {
 const ledger=state.observation;
 if(!ledger||!Number.isSafeInteger(confirmedYear)||confirmedYear<0||confirmedYear>lastObservedYear(state as CivilizationState))return null;
 const metrics=metricsAt(ledger,confirmedYear);
 if(!metrics)return null;
 const people=observationAt(ledger,confirmedYear);
 if(!people)throw Error('Confirmed metrics without a confirmed population');
 const [food,cohesion,knowledge,culture]=metrics;
 return {year:confirmedYear,population:people.population,food,cohesion,knowledge,culture};
}

/**
 * One metric for every confirmed, recorded year from..to (S3 graph). The same values as observeCivilizationMetrics()
 * year by year, read in one pass; unconfirmed, future and unrecorded years are absent, never filled in.
 */
export function confirmedMetricRange(state:Readonly<CivilizationState>,key:CivilizationMetricKey,from:number,to:number):{year:number;value:number}[] {
 const ledger=state.observation,record=ledger?.metrics,last=lastObservedYear(state as CivilizationState);
 if(!ledger||!record||!Number.isFinite(from)||!Number.isFinite(to))return [];
 const start=Math.max(record.firstYear,Math.ceil(from)),end=Math.min(last,Math.floor(to));
 if(end<start)return [];
 if(record.values.length!==last-record.firstYear+1)throw Error('Metric history disagrees with the confirmed year');
 if(key==='population')return populationTotalsBetween(ledger,start,end).map(p=>({year:p.year,value:p.population}));
 const index=civilizationMetricKeys.indexOf(key)-1,out:{year:number;value:number}[]=[];
 for(let year=start;year<=end;year++)out.push({year,value:record.values[year-record.firstYear]![index]!});
 return out;
}
