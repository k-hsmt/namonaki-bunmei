export const terrainProductionBoundary='terrain-development-v1' as const;
export const terrainChangeTrialBoundary='terrain-change-review-v1' as const;
/** A value boundary survives structuredClone and ordinary shape adapters. */
export const coupledTrialBoundary='irrigation-coupled-review-v1' as const;
export function assertProductionBoundary(value:unknown):void {
 if(!value||typeof value!=='object')return;
 const v=value as {format?:unknown;review?:unknown};
 assertBaselineTerrainBoundary(value);
 if(Object.hasOwn(value,'terrainChangeBoundary')||Object.hasOwn(value,'terrainChanges')||v.format==='terrain-change-review-world-v1'||v.format==='terrain-change-review-save-v1'||v.review&&typeof v.review==='object'&&Object.hasOwn(v.review,'terrainChangeBoundary'))throw Error('Terrain trial cannot enter production');
 if(Object.hasOwn(value,'trialBoundary')||v.format===coupledTrialBoundary||v.format==='irrigation-coupled-review-world-v1'||v.review&&typeof v.review==='object'&&Object.hasOwn(v.review,'trialBoundary'))throw Error('Coupled trial cannot enter production');
 assertBaselineEconomicBoundary(value);
}

export const economicProductionBoundary='regional-economy-irrigated-v1' as const;
/** Historical B factories must not silently strip the newer production policy. */
export function assertBaselineEconomicBoundary(value:unknown):void {
 if(!value||typeof value!=='object')return;
 const v=value as {format?:unknown;review?:unknown};
 if(Object.hasOwn(value,'economicPolicyBoundary')||Object.hasOwn(value,'economicCoupling')||v.format==='irrigation-economic-production-world-v1'||v.review&&typeof v.review==='object'&&Object.hasOwn(v.review,'economicPolicyBoundary'))throw Error('Economic production requires its versioned entry point');
}

/** Historical B/C3 entry points cannot strip the newer physical terrain policy. */
export function assertBaselineTerrainBoundary(value:unknown):void {
 if(!value||typeof value!=='object')return;
 const v=value as {format?:unknown;review?:unknown};
 if(Object.hasOwn(value,'terrainPolicyBoundary')||Object.hasOwn(value,'terrainDevelopment')||v.format==='terrain-production-world-v1'||v.review&&typeof v.review==='object'&&Object.hasOwn(v.review,'terrainPolicyBoundary'))throw Error('Terrain production requires its versioned entry point');
}
