import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import type {RegionalEconomy} from '../story/regional-economy.js';
import type {AnnualReceipt,PreparedCoupledEffect} from './annual-baseline-internal.js';
import type {EconomyEffect,EconomyPolicy,EconomyTapeRow,irrigationEconomyRule} from './economy-types-v1.js';
import type {coupledTrialBoundary} from '../story/trial-boundary.js';
import type {CoupledOrigin} from './coupled-origin-v1.js';
export type CoupledChoiceProtocol='automatic-per-branch-v1'|'common-explicit-v1';
export const coupledRuntimeRules=Object.freeze({kernel:'coupled-annual-kernel-v1',rng:'mulberry32-land-phase-v1',decision:'decision-template-v1'});
export type CoupledReviewWorld=Omit<GeneratedBridgeReview,'format'|'review'>&{readonly format:'irrigation-coupled-review-world-v1';readonly review:GeneratedBridgeReview['review']&{readonly trialBoundary:typeof coupledTrialBoundary}};
export interface CoupledEconomyReceipt {
 readonly year:number;readonly effect:EconomyEffect;readonly gainBp:number;readonly costBp:number;
 readonly input:EconomyTapeRow;readonly harvest:readonly number[];readonly discarded:readonly number[];
}
export interface CoupledEconomyCheckpoint {readonly year:number;readonly economy:RegionalEconomy;readonly people:readonly number[];readonly phaseCount:number;readonly sourceCursors:readonly number[]}
/** Owned runtime view; storage uses compact versioned tuples. */
export interface IrrigationCoupledReview {
 readonly format:'irrigation-coupled-review-v1';readonly schemaVersion:1;readonly status:'review-only';
 readonly ruleId:'irrigation-economy-coupled-v1';readonly formula:typeof irrigationEconomyRule;
 readonly runtimeRules:typeof coupledRuntimeRules;
 readonly policy:EconomyPolicy;readonly choiceProtocol:CoupledChoiceProtocol;
 readonly originHash:string;readonly introducedYear:number;readonly confirmedThrough:number;
 readonly originPending:boolean;readonly originRngState:number;readonly initialEconomy:RegionalEconomy;
 readonly origin:CoupledOrigin;readonly checkpoints:readonly CoupledEconomyCheckpoint[];
 readonly world:CoupledReviewWorld;readonly receipts:readonly CoupledEconomyReceipt[];
 readonly phases:readonly AnnualReceipt[];readonly prepared:PreparedCoupledEffect|null;
}
