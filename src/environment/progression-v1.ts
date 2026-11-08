/** Environment writer. Only explicit new worlds generate new trend controls. */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import {lastObservedYear} from '../story/engine.js';
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import {syncVegetationHistory,freezeVegetation,type VegetationHistory} from '../vegetation/history-v1.js';
import {environmentRunner,initialEnvironment,landUseEvents,type ClimateTarget,type EnvironmentHistory,type CoupledVegetation} from './model-v1.js';
import {baseVegetation,trustEnvironment,coupledFromBase} from './history-v1.js';
export function climateTarget(seed:number,year:number):ClimateTarget {if(!Number.isSafeInteger(year)||year<0||year%100)throw Error('Invalid climate interval');return {year,humidity:terrainHash(['environment-trend-v1',seed,year,'humidity'])%121-60,temperature:terrainHash(['environment-trend-v1',seed,year,'temperature'])%81-40};}
/** One 100-year excursion per 500-year era; the other controls stay near neutral.
 * Recorded controls, not rerolled observation. Indices are normalized, not °C/mm. */
export function calmClimateTarget(seed:number,year:number,start=0):ClimateTarget {
 if(!Number.isSafeInteger(year)||!Number.isSafeInteger(start)||start<0||year<start||year%100||start%100)throw Error('Invalid calm climate interval');
 const era=Math.floor((year-start)/500),phase=(year-start)%500,hash=(key:string)=>terrainHash(['environment-calm-v2',seed,era,key]);
 let humidity=hash('humidity')%9-4,temperature=hash('temperature')%9-4;
 if(phase===200){switch(hash('kind')%4){case 0:humidity=-(48+hash('strength')%9);break;case 1:humidity=48+hash('strength')%9;break;case 2:temperature=-(32+hash('strength')%9);break;case 3:temperature=32+hash('strength')%9;break;}}
 return {year,humidity,temperature};
}
/** Future-only transition. Past controls and every confirmed snapshot remain intact. */
export function relaxEnvironment(e:EnvironmentHistory,v:CoupledVegetation,r:GeneratedFacilityReview):EnvironmentHistory {
 if(e.ruleId==='environment-coupled-v2')return e;
 return trustEnvironment({...e,ruleId:'environment-coupled-v2',climateStart:(Math.floor(e.confirmedThrough/100)+1)*100},v,r);
}
export function coupleVegetation(v:VegetationHistory):CoupledVegetation{return coupledFromBase(v);}
export function createEnvironment(v:CoupledVegetation,r:GeneratedFacilityReview,calm=false):EnvironmentHistory {
 if(r.state.year!==0||r.state.pending||lastObservedYear(r.state)!==0||v.confirmedThrough!==0)throw Error('Environment starts only in a new world');
 const uses=landUseEvents(r),current=environmentRunner(v,r,uses,initialEnvironment(v)).snapshot();return trustEnvironment({schemaVersion:1,ruleId:calm?'environment-coupled-v2':'environment-coupled-v1',...(calm?{climateStart:0}:{}),introducedYear:0,confirmedThrough:0,seed:r.state.seed,targets:[calm?calmClimateTarget(r.state.seed,0):climateTarget(r.state.seed,0)],uses,checkpoints:[current],current},v,r);
}
export function advanceEnvironment(e:EnvironmentHistory,v:CoupledVegetation,r:GeneratedFacilityReview):{environment:EnvironmentHistory;vegetation:CoupledVegetation}{
 const vegetation=coupleVegetation(syncVegetationHistory(baseVegetation(v),r)),end=lastObservedYear(r.state);if(end<e.confirmedThrough)throw Error('Cannot rewind environment writer');
 const uses=landUseEvents(r),targets=[...e.targets],checkpoints=[...e.checkpoints],runner=environmentRunner(vegetation,r,uses,e.current);
 for(let y=e.confirmedThrough+1;y<=end;y++){if(y%100===0)targets.push(e.ruleId==='environment-coupled-v2'&&y>=e.climateStart!?calmClimateTarget(e.seed,y,e.climateStart):climateTarget(e.seed,y));runner.step(targets[Math.floor(y/100)]!,e.ruleId==='environment-coupled-v2'&&y>=e.climateStart!);if(y%100===0)checkpoints.push(runner.snapshot());}
 return {vegetation,environment:trustEnvironment({...e,confirmedThrough:end,targets,uses,checkpoints,current:runner.snapshot()},vegetation,r)};
}
