/** One private working civilization per batch; no annual history cloning. */
import {step,chooseAutomatically,lastObservedYear,type CivilizationState,type ReviewLandProgression} from './engine.js';

export interface LandPhaseReceipt {
 readonly phase:'step'|'automatic-choice';readonly year:number;
 readonly confirmedBefore:number;readonly confirmedAfter:number;
 readonly rngBefore:number;readonly rngAfter:number;readonly pending:boolean;
}
/** Receives detached primitives only, after the entire engine phase has returned. */
export type LandPhaseObserver=(receipt:Readonly<LandPhaseReceipt>)=>void;

export function runGeneratedLandBatch(state:CivilizationState,policy:ReviewLandProgression,years:number,choices:'stop'|'automatic',stopAtNewRecord?:boolean,onPhase?:LandPhaseObserver):void {
 const target=state.year+years,historyLength=state.history.length;
 const run=(phase:LandPhaseReceipt['phase'])=>{
  const confirmedBefore=onPhase?lastObservedYear(state):0,rngBefore=state.rngState;
  if(phase==='step')step(state,policy);else chooseAutomatically(state,policy);
  if(onPhase)onPhase(Object.freeze({phase,year:state.year,confirmedBefore,confirmedAfter:lastObservedYear(state),rngBefore,rngAfter:state.rngState,pending:!!state.pending}));
 };
 while(state.year<target){
  if(state.pending){if(choices==='stop')break;run('automatic-choice');}else run('step');
  if(stopAtNewRecord&&state.history.length>historyLength)break;
 }
 // B resolves the last attempted year's choice, but advance(0) does nothing.
 if(years>0&&state.pending&&choices==='automatic')run('automatic-choice');
}
