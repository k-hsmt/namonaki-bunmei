/** Frozen independent trial coefficients and evidence contract; no search or writer dependency. */
export const terrainCutRuntimeRules=Object.freeze({geometry:'terrain-cut-review-v2',width:26,depth:14,grid:2,maxCut:2,apron:1,halo:2,minFarmingYears:50,interval:100,cooldown:500,maxProjects:4,requiresNewField:true,order:'cut-volume/walk/y/x/field-id-v1'} as const);
export interface TerrainCutDecision {
 readonly id:string;readonly year:number;readonly outcome:'built'|'hold';readonly reason:null|'no-continuous-field'|'cooldown'|'limit'|'no-safe-cut';readonly fieldId:string|null;readonly changeId:string|null;
 readonly score:readonly [number,number,number,number]|null;
 readonly metrics:{readonly enumerated:number;readonly physicalEligible:number;readonly accessChecks:number;readonly holds:Readonly<Record<string,number>>};
}
