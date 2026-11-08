/** Issue #34 D3-A1. Review-only geometry, never a production waterway permit. */
import type {RecordPoint} from '../terrain/terrain-record-types.js';
import type {GroundPlot,GroundReviewContext} from '../terrain/ground-access-review.js';
import type {ValidatedRiverReaches} from '../terrain/river-reaches-review.js';
export const irrigationLimits=Object.freeze({width:2,maxLength:64,maxCandidates:128,maxSearchStates:250000,junctionMargin:8});
export interface IrrigationField {readonly id:string;readonly plot:GroundPlot;readonly builtYear:number;readonly sourceRecordId:string}
/** The adapter supplies confirmed, same-year fields and occupation. Controlled fixtures are explicit. */
export interface IrrigationContext {
 readonly ground:GroundReviewContext;readonly hydrology:ValidatedRiverReaches;
 readonly roots:readonly RecordPoint[];readonly fields:readonly IrrigationField[];
 readonly cause:{readonly recordId:string;readonly year:number};
}
export interface IrrigationIntake {
 readonly water:RecordPoint;readonly bank:RecordPoint;readonly head:number;
 readonly parentShapeId:string;readonly streamId:string;readonly fromY:number;readonly toY:number;
}
export interface IrrigationGeometry {
 readonly schemaVersion:1;readonly ruleId:'irrigation-geometry-review-v1';readonly status:'review-only';
 readonly waterContract:'bank-level-flat-v1';readonly site:'river-bank';
 readonly source:{readonly seed:number;readonly revision:string};readonly year:number;
 readonly causeRecordId:string;readonly field:IrrigationField;readonly intake:IrrigationIntake;
 readonly path:readonly RecordPoint[];readonly cells:readonly RecordPoint[];
}
export type IrrigationHold='unsupported-site'|'unknown-history'|'unconfirmed-year'|'no-active-field'|'no-owned-intake'|'no-flat-route'|'occupied'|'access-loss'|'too-long'|'search-limit';
export interface IrrigationMetrics {searchStates:number;intakes:number;fields:number;candidates:number;accessChecks:number;walkVisits:number;accessRejected:number}
export interface IrrigationDiagnostic {readonly year:number;readonly causeRecordId:string;readonly fieldId:string|null;readonly reason:IrrigationHold;readonly candidates:number}
export type IrrigationProposal={readonly status:'proposed';readonly geometry:IrrigationGeometry;readonly metrics:IrrigationMetrics;readonly diagnostics:readonly IrrigationDiagnostic[]}
 |{readonly status:'hold';readonly reason:IrrigationHold;readonly metrics:IrrigationMetrics;readonly diagnostics:readonly IrrigationDiagnostic[]};
