import type {IrrigationGeometry} from './types-v1.js';
import type {ChannelEvent,ChannelAttempt,ChannelState} from './review-types-v1.js';
export type ProductionGeometry=Omit<IrrigationGeometry,'ruleId'|'status'>&{readonly ruleId:'irrigation-geometry-v1'};
export interface ProductionIrrigation {
 readonly schemaVersion:1;readonly ruleId:'irrigation-production-v1';readonly introducedYear:number;readonly confirmedThrough:number;
 readonly preIntroductionRendererId:'generated-scene-v3'|'generated-scene-v4'|'generated-scene-v5';
 readonly systems:readonly {readonly id:string;readonly geometry:ProductionGeometry}[];
 readonly events:readonly ChannelEvent[];readonly attempts:readonly ChannelAttempt[];
}
export interface ChannelView {readonly introduced:boolean;readonly channel:ChannelState|null;readonly geometry:ProductionGeometry|null;readonly key:string}
export function kernelGeometry(g:ProductionGeometry):IrrigationGeometry {const {ruleId:_,...parts}=g;return {...parts,ruleId:'irrigation-geometry-review-v1',status:'review-only'};}
export function productionGeometry(g:IrrigationGeometry):ProductionGeometry {const {ruleId:_,status:__,...parts}=g;return {...parts,ruleId:'irrigation-geometry-v1'};}
