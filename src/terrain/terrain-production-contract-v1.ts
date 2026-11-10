/** Fixed production policy; this version models no direct excavation charge or harvest bonus. */
import {terrainCutRuntimeRules} from './terrain-cut-rules-v1.js';
export const terrainProductionRuntimeRules=Object.freeze({...terrainCutRuntimeRules,geometry:'terrain-cut-v1'} as const);
export const terrainProductionEconomicRule=Object.freeze({id:'small-cut-no-direct-economic-effect-v1',additionalWorkBp:0,directYieldBp:0} as const);
export const terrainProductionMaxBytes=16*1024*1024;
export const terrainProductionStoredMaxBytes=4*1024*1024;
