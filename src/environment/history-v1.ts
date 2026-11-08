/** Frozen wire and past-only environment projection. No trend producer imports. */
import {wireObject,sameWire} from '../story/generated-state-review.js';
import {lastObservedYear} from '../story/engine.js';
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import {validateVegetationHistory,vegetationSites,vegetationPatchPlot,vegetationOverlap,vegetationStage,freezeVegetation,type VegetationHistory,type VegetationPatchView} from '../vegetation/history-v1.js';
import {landUseEvents,environmentRunner,initialEnvironment,waterBuffers,moistureAt,type EnvironmentHistory,type CoupledVegetation,type EnvironmentState,type EnvironmentView} from './model-v1.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
export type {EnvironmentHistory,CoupledVegetation,EnvironmentView} from './model-v1.js';
const bases=new WeakMap<object,VegetationHistory>();
export function baseVegetation(v:CoupledVegetation):VegetationHistory {let base=bases.get(v);if(!base){base={...v,schemaVersion:1,ruleId:'patch-succession-v1'};if(Object.isFrozen(v))bases.set(v,base);}return base;}
export function coupledFromBase(v:VegetationHistory):CoupledVegetation {const result=freezeVegetation({...v,schemaVersion:2 as const,ruleId:'patch-environment-v2' as const});bases.set(result,v);return result;}
export function validateCoupledVegetation(raw:unknown,r:GeneratedFacilityReview):CoupledVegetation {
 const v=wireObject(raw,['schemaVersion','ruleId','introducedYear','confirmedThrough','seed','initial','events']);if(v.schemaVersion!==2||v.ruleId!=='patch-environment-v2')throw Error('Unknown coupled vegetation');
 const validated=validateVegetationHistory(baseVegetation(v as unknown as CoupledVegetation),r);
 if(Object.isFrozen(raw)&&bases.get(raw as object)===validated)return raw as CoupledVegetation;
 const result=freezeVegetation({...validated,schemaVersion:2 as const,ruleId:'patch-environment-v2' as const});bases.set(result,validated);return result;
}
const trusted=new WeakMap<object,{terrain:object;initial:object;events:object}>();
export function trustEnvironment(e:EnvironmentHistory,v:CoupledVegetation,r:GeneratedFacilityReview):EnvironmentHistory {const result=freezeVegetation(e);trusted.set(result,{terrain:r.terrain,initial:v.initial,events:v.events});return result;}
/** Check derived snapshots from recorded controls and spatial source ledgers, never re-roll. */
export function validateEnvironment(raw:unknown,v:CoupledVegetation,r:GeneratedFacilityReview):EnvironmentHistory {
 const e=wireObject(raw,['schemaVersion','ruleId','introducedYear','confirmedThrough','seed','targets','uses','checkpoints','current']),end=lastObservedYear(r.state);
 if(e.schemaVersion!==1||e.ruleId!=='environment-coupled-v1'||e.introducedYear!==0||e.confirmedThrough!==end||e.seed!==r.state.seed||v.confirmedThrough!==end)throw Error('Unknown or unconfirmed environment');
 const uses=landUseEvents(r);if(!sameWire(e.uses,uses))throw Error('Environment land-use sources disagree');
 const proof=trusted.get(raw as object);if(proof?.terrain===r.terrain&&proof.initial===v.initial&&proof.events===v.events)return raw as EnvironmentHistory;
 if(!Array.isArray(e.targets)||e.targets.length!==Math.floor(end/100)+1||!Array.isArray(e.checkpoints)||e.checkpoints.length!==Math.floor(end/100)+1)throw Error('Invalid environment intervals');
 for(const [i,target] of e.targets.entries()){const t=wireObject(target,['year','humidity','temperature']);if(t.year!==i*100||!Number.isSafeInteger(t.humidity)||Math.abs(Number(t.humidity))>60||!Number.isSafeInteger(t.temperature)||Math.abs(Number(t.temperature))>40)throw Error('Invalid climate target');}
 const typed=e as unknown as EnvironmentHistory,runner=environmentRunner(v,r,uses,initialEnvironment(v));if(!sameWire(e.checkpoints[0],runner.snapshot()))throw Error('Invalid initial environment checkpoint');
 for(let y=1;y<=end;y++){runner.step(typed.targets[Math.floor(y/100)]!);if(y%100===0&&!sameWire(e.checkpoints[y/100],runner.snapshot()))throw Error('Environment checkpoint differs from history');}
 if(!sameWire(e.current,runner.snapshot()))throw Error('Environment current differs from history');
 return trustEnvironment(structuredClone(typed),v,r);
}
export function environmentStateAt(e:EnvironmentHistory,v:CoupledVegetation,r:GeneratedFacilityReview,year:number):EnvironmentState {
 if(!Number.isSafeInteger(year)||year<0||year>e.confirmedThrough)throw Error('Unconfirmed environment observation');
 if(year===e.confirmedThrough)return e.current;
 const checkpoint=e.checkpoints[Math.floor(year/100)]!;if(checkpoint.year===year)return checkpoint;
 const runner=environmentRunner(v,r,e.uses,checkpoint);for(let y=checkpoint.year+1;y<=year;y++)runner.step(e.targets[Math.floor(y/100)]!);return freezeVegetation(runner.snapshot());
}
export function environmentProjection(e:EnvironmentHistory,v:CoupledVegetation,r:GeneratedFacilityReview,year:number,site:RecordSite):{vegetation:readonly VegetationPatchView[];environment:EnvironmentView}{
 if(!vegetationSites.includes(site))throw Error('Invalid environment site');const state=environmentStateAt(e,v,r,year),buffer=waterBuffers(r,site),moisture:(number|null)[]=Array(440).fill(null),soil:(number|null)[]=Array(440).fill(null),vegetation:VegetationPatchView[]=[];
 for(const [index,p] of state.patches[site].entries()){if(!p)continue;const initial=v.initial[site][index]!,plot=vegetationPatchPlot(index);let disturbedYear:number|null=null,fires=0;
  for(const event of v.events){if(event.year>year)break;if(event.site===site&&vegetationOverlap(event.plot,plot)){disturbedYear=event.year;if(event.kind==='fire'&&year-event.year<120)fires++;}}
  const maximum=fires>=2?2:initial[2];vegetation.push({index,plot,age:p[0]/4,stage:vegetationStage(p[0]/4,maximum),disturbedYear});moisture[index]=moistureAt(state.humidity,buffer[index]!,p[2]);soil[index]=p[2];
 }
 return freezeVegetation({vegetation,environment:{humidity:state.humidity,temperature:state.temperature,moisture,soil}});
}
