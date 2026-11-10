import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import type {terrainChangeTrialBoundary} from '../story/trial-boundary.js';
import type {EconomicProductionLedger} from '../irrigation/economic-production-types-v1.js';
import type {TerrainHistory} from './terrain-revision-v1.js';
import type {terrainCutRuntimeRules,TerrainCutDecision} from './terrain-cut-rules-v1.js';
import type {captureTerrainOriginInternal} from './terrain-trial-origin-internal.js';
export interface TerrainChangeLedger {
 readonly schemaVersion:1;readonly ruleId:typeof terrainChangeTrialBoundary;readonly policy:'none'|'cut';
 readonly runtimeRules:typeof terrainCutRuntimeRules;readonly introducedYear:number;readonly confirmedThrough:number;readonly originHash:string;
 readonly originPrefix:ReturnType<typeof captureTerrainOriginInternal>;readonly decisions:readonly TerrainCutDecision[];
}
export type TerrainTrialWorld=Omit<GeneratedBridgeReview,'format'|'status'|'review'>&{
 readonly format:'terrain-change-review-world-v1';readonly status:'review-only';
 readonly review:GeneratedBridgeReview['review']&{readonly terrainChangeBoundary:typeof terrainChangeTrialBoundary};
 readonly economicCoupling:EconomicProductionLedger;readonly terrainHistory:TerrainHistory;readonly terrainChanges:TerrainChangeLedger;
};
