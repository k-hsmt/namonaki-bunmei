/** A value boundary survives structuredClone and ordinary shape adapters. */
export const coupledTrialBoundary='irrigation-coupled-review-v1' as const;
export function assertProductionBoundary(value:unknown):void {
 if(!value||typeof value!=='object')return;
 const v=value as {format?:unknown;review?:unknown};
 if(Object.hasOwn(value,'trialBoundary')||v.format===coupledTrialBoundary||v.format==='irrigation-coupled-review-world-v1'||v.review&&typeof v.review==='object'&&Object.hasOwn(v.review,'trialBoundary'))throw Error('Coupled trial cannot enter production');
}
