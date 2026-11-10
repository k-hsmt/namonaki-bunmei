import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import type {terrainProductionBoundary} from '../story/trial-boundary.js';
import type {EconomicProductionLedger} from '../irrigation/economic-production-types-v1.js';
import type {TerrainHistory} from './terrain-revision-v1.js';
import type {TerrainChangeLedger} from './terrain-trial-types-v1.js';
import type {captureTerrainProductionOriginInternal} from './terrain-origin-internal.js';
import type {terrainProductionRuntimeRules,terrainProductionEconomicRule} from './terrain-production-contract-v1.js';
export interface TerrainProductionLedger extends Omit<TerrainChangeLedger,'ruleId'|'runtimeRules'|'originPrefix'|'policy'> {
 readonly ruleId:typeof terrainProductionBoundary;readonly policy:'cut';
 readonly runtimeRules:typeof terrainProductionRuntimeRules;readonly economicRule:typeof terrainProductionEconomicRule;
 readonly originPrefix:ReturnType<typeof captureTerrainProductionOriginInternal>;
}
export type TerrainProductionWorld=Omit<GeneratedBridgeReview,'format'|'status'|'review'>&{
 readonly format:'terrain-production-world-v1';readonly status:'production';
 readonly review:GeneratedBridgeReview['review']&{readonly terrainPolicyBoundary:typeof terrainProductionBoundary};
 readonly economicCoupling:EconomicProductionLedger;readonly terrainHistory:TerrainHistory;readonly terrainDevelopment:TerrainProductionLedger;
};
