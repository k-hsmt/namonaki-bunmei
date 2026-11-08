/** Environment writer. Only explicit new worlds generate new trend controls. */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import {lastObservedYear} from '../story/engine.js';
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import {syncVegetationHistory,freezeVegetation,type VegetationHistory} from '../vegetation/history-v1.js';
import {environmentRunner,initialEnvironment,landUseEvents,type ClimateTarget,type EnvironmentHistory,type CoupledVegetation} from './model-v1.js';
import {baseVegetation,trustEnvironment,coupledFromBase} from './history-v1.js';
export function climateTarget(seed:number,year:number):ClimateTarget {if(!Number.isSafeInteger(year)||year<0||year%100)throw Error('Invalid climate interval');return {year,humidity:terrainHash(['environment-trend-v1',seed,year,'humidity'])%121-60,temperature:terrainHash(['environment-trend-v1',seed,year,'temperature'])%81-40};}
export function coupleVegetation(v:VegetationHistory):CoupledVegetation{return coupledFromBase(v);}
export function createEnvironment(v:CoupledVegetation,r:GeneratedFacilityReview):EnvironmentHistory {
 if(r.state.year!==0||r.state.pending||lastObservedYear(r.state)!==0||v.confirmedThrough!==0)throw Error('Environment starts only in a new world');
 const uses=landUseEvents(r),current=environmentRunner(v,r,uses,initialEnvironment(v)).snapshot();return trustEnvironment({schemaVersion:1,ruleId:'environment-coupled-v1',introducedYear:0,confirmedThrough:0,seed:r.state.seed,targets:[climateTarget(r.state.seed,0)],uses,checkpoints:[current],current},v,r);
}
export function advanceEnvironment(e:EnvironmentHistory,v:CoupledVegetation,r:GeneratedFacilityReview):{environment:EnvironmentHistory;vegetation:CoupledVegetation}{
 const vegetation=coupleVegetation(syncVegetationHistory(baseVegetation(v),r)),end=lastObservedYear(r.state);if(end<e.confirmedThrough)throw Error('Cannot rewind environment writer');
 const uses=landUseEvents(r),targets=[...e.targets],checkpoints=[...e.checkpoints],runner=environmentRunner(vegetation,r,uses,e.current);
 for(let y=e.confirmedThrough+1;y<=end;y++){if(y%100===0)targets.push(climateTarget(e.seed,y));runner.step(targets[Math.floor(y/100)]!);if(y%100===0)checkpoints.push(runner.snapshot());}
 return {vegetation,environment:trustEnvironment({...e,confirmedThrough:end,targets,uses,checkpoints,current:runner.snapshot()},vegetation,r)};
}
