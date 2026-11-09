import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
/** Snapshot only counters, never whole ledgers. Prefix counts can be checked by year. */
export function economicSourceCursorsInternal(r:GeneratedFacilityReview,year=r.state.observation!.lastYear!):readonly number[]{
 const count=(a:readonly unknown[],key:string)=>{let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(Number((a[m] as Record<string,unknown>)[key])<=year)lo=m+1;else hi=m;}return lo;};
 return [count(r.state.history,'year'),count(r.placements,'builtYear'),count(r.bridgeReview!.bridges,'builtYear'),count(r.state.housing!.events,'year'),count(r.state.publicSpaces!.events,'year'),count(r.state.memory!.log,'year'),count(r.state.samples,'year'),count(r.state.decisions,'year'),...r.state.observation!.sites!.flatMap(s=>[count(s.changes,'year'),count(s.buildingChanges,'year'),count(s.practiceChanges,'year')]),Math.floor(year/100)+1,year%100];
}
