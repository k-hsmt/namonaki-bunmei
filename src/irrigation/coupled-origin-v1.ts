/** Trial dialect only; production uses a different prefix contract. */
import type {GeneratedWorldSave} from '../story/world-save.js';
import type {IrrigationCoupledReview} from './coupled-types-v1.js';
import {captureEconomicOriginInternal,hydrateEconomicOriginInternal} from './economic-origin-internal.js';
export {economicSourceCursorsInternal as coupledSourceCursors} from './economic-source-cursors-internal.js';
export interface CoupledOrigin {readonly format:'coupled-origin-prefix-v1';readonly template:unknown}
const dialect={prefix:'coupled-origin-prefix-v1',reference:'coupled-origin-ref-v1',environment:'coupled-origin-environment-v1'} as const;
export function captureCoupledOrigin(save:GeneratedWorldSave):CoupledOrigin{return captureEconomicOriginInternal(save,dialect);}
export function hydrateCoupledOrigin(trial:IrrigationCoupledReview){return hydrateEconomicOriginInternal(trial,dialect);}
