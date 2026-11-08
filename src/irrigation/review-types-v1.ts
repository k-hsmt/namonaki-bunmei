/** Independent D3-A2 wire. Never accepted by the production save reader. */
import type {GeneratedWorldSave} from '../story/world-save.js';
import type {EnvironmentState} from '../environment/model-v1.js';
import type {IrrigationGeometry,IrrigationHold,IrrigationMetrics,IrrigationDiagnostic} from './types-v1.js';
export type ChannelStatus='active'|'idle'|'damaged'|'abandoned'|'retired';
export interface ChannelState {readonly id:string;readonly status:ChannelStatus;readonly lastMaintainedYear:number;readonly lastMaintainedEventId:string;readonly abandonedYear:number|null;readonly abandonedEventId:string|null}
export interface ChannelSystem {readonly id:string;readonly geometry:IrrigationGeometry}
export type ChannelCause={readonly kind:'chronicle';readonly recordId:string}|{readonly kind:'land-use';readonly recordIds:readonly string[];readonly objectId:string|null}|{readonly kind:'policy-clock';readonly parentEventId:string;readonly elapsed:number}|{readonly kind:'controlled-input';readonly inputId:string};
export type ChannelEventKind='built'|'maintained'|'paused'|'resumed'|'damaged'|'repaired'|'abandoned'|'backfilled';
export interface ChannelEvent {readonly seq:number;readonly id:string;readonly year:number;readonly systemId:string;readonly kind:ChannelEventKind;readonly cause:ChannelCause;readonly before:ChannelStatus|null;readonly after:ChannelState}
export interface IrrigationControl {readonly id:string;readonly year:number;readonly kind:'irrigation'|'damage'}
export interface ChannelAttempt {readonly year:number;readonly cause:ChannelCause;readonly recordId:string;readonly outcome:'built'|'maintained'|'repaired'|'hold';readonly systemId:string|null;readonly reason:IrrigationHold|'awaiting-backfill'|null;readonly metrics:IrrigationMetrics|null;readonly diagnostics:readonly IrrigationDiagnostic[]}
export interface IrrigationCheckpoint {readonly year:number;readonly channel:ChannelState|null;readonly environment:EnvironmentState}
export interface IrrigationReview {
 readonly format:'irrigation-review-v1';readonly schemaVersion:1;readonly ruleId:'irrigation-history-v1';readonly status:'review-only';readonly mode:'natural'|'controlled';readonly introducedYear:number;readonly confirmedThrough:number;
 readonly base:GeneratedWorldSave;readonly baseHash:string;readonly controls:readonly IrrigationControl[];
 readonly systems:readonly ChannelSystem[];readonly events:readonly ChannelEvent[];readonly attempts:readonly ChannelAttempt[];
 readonly checkpoints:readonly IrrigationCheckpoint[];readonly current:IrrigationCheckpoint;
}
export const irrigationHistoryLimits=Object.freeze({maintenanceYears:40,abandonmentYears:80,backfillYears:20,moistureMax:24,maxYears:10000,maxBytes:16*1024*1024,maxEntries:100000});
