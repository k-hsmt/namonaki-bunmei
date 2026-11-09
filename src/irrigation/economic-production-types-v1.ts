/** Production ownership and wire policy are distinct from the C2 review contract. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import type {IrrigationCoupledReview} from './coupled-types-v1.js';
import type {economicProductionBoundary} from '../story/trial-boundary.js';
export const economicOriginDialect={prefix:'economy-origin-prefix-v1',reference:'economy-origin-ref-v1',environment:'economy-origin-environment-v1'} as const;
export type EconomicProductionLedger=Omit<IrrigationCoupledReview,'format'|'status'|'ruleId'|'world'|'policy'|'choiceProtocol'|'origin'|'originPending'>&{
 readonly ruleId:typeof economicProductionBoundary;readonly policy:'combined';readonly originPending:false;
 readonly originPrefix:{readonly format:typeof economicOriginDialect.prefix;readonly template:unknown};
};
export type EconomicProductionWorld=Omit<GeneratedBridgeReview,'format'|'status'|'review'>&{
 readonly format:'irrigation-economic-production-world-v1';readonly status:'production';
 readonly review:GeneratedBridgeReview['review']&{readonly economicPolicyBoundary:typeof economicProductionBoundary};
 readonly economicCoupling:EconomicProductionLedger;
};
