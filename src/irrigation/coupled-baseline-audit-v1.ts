/** C2 foundation audit only: neutral B output, not a coupled trial or trial save. */
import {advanceGeneratedBridgeReview} from '../story/generated-bridge-batch-internal.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import type {GeneratedAdvanceOptions} from '../story/generated-facility-review.js';
import type {LandPhaseReceipt} from '../story/generated-land-batch-internal.js';
import {validateProductionWorld} from './production-history-v1.js';

export interface BaselinePhaseReceipt extends LandPhaseReceipt {readonly draws:number}
/** Valid only for the bounded phases of the current Mulberry32 kernel.
 * Engine step has no RNG loops except the eight possible legacy kinds; event
 * selection and decision generation are bounded too. The conservative step
 * limit is 64 draws; an automatic choice always consumes exactly one.
 * This is not a counter for arbitrary streams or multiple full RNG cycles.
 */
export {boundedRngDraws} from '../story/rng-phase-diagnostics.js';
import {boundedRngDraws} from '../story/rng-phase-diagnostics.js';

/** Shares B's clone-once land driver and existing batch ecology finalizer.
 * Ecology is still replayed at batch end here: this audit does not yet supply
 * annual environment prefixes or economic feedback. It must not be used as
 * the future coupled policy runner.
 */
export function auditBaselineAdvance(input:GeneratedBridgeReview,years:number,choices:'stop'|'automatic'='automatic',options:GeneratedAdvanceOptions={}) {
 validateProductionWorld(input);
 const phases:BaselinePhaseReceipt[]=[];let totalDraws=0;
 const world=advanceGeneratedBridgeReview(input,years,choices,options,phase=>{
  const draws=boundedRngDraws(phase.rngBefore,phase.rngAfter,phase.phase==='step'?64:1);
  if((phase.phase==='automatic-choice'&&draws!==1)||(phase.phase==='step'&&draws<6))throw Error('Unexpected RNG phase consumption');
  totalDraws+=draws;if(totalDraws>1000000)throw Error('RNG batch exceeds diagnostic bound');
  if(phase.confirmedAfter!==phase.confirmedBefore+(phase.pending?0:1))throw Error('Unexpected annual commit boundary');
  phases.push(Object.freeze({...phase,draws}));
 });
 return Object.freeze({world,diagnostics:Object.freeze({format:'irrigation-coupled-baseline-audit-v1' as const,kernel:'mulberry32-land-phase-v1' as const,
  // A pending origin already consumed a step before this call. Do not guess it.
  originPending:!!input.review.state.pending,originPendingStepDraws:null,totalDraws,phases:Object.freeze(phases)})});
}
