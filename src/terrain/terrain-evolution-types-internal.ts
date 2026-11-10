import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import type {EconomicProductionLedger} from '../irrigation/economic-production-types-v1.js';
import type {TerrainHistory} from './terrain-revision-v1.js';
import type {TerrainChangeLedger} from './terrain-trial-types-v1.js';
import type {TerrainProductionLedger} from './terrain-production-types-v1.js';
export type TerrainEvolutionLedger=TerrainChangeLedger|TerrainProductionLedger;
export type TerrainEvolutionWorld=Omit<GeneratedBridgeReview,'format'|'status'>&{
 readonly format:string;readonly status:string;readonly economicCoupling:EconomicProductionLedger;readonly terrainHistory:TerrainHistory;
 readonly terrainChanges?:TerrainChangeLedger;readonly terrainDevelopment?:TerrainProductionLedger;
};
