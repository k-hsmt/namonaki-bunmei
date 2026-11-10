import type {GroundPlot} from './ground-access-review.js';
/** index followed by four before values and four after values: surface, grade, bearing, elevation. */
export type TerrainCellChange=readonly [number,number,number,number,number,number,number,number,number];
export interface TerrainCutChange {
 readonly format:'terrain-cut-event-v1';readonly schemaVersion:1;readonly ruleId:'terrain-cut-review-v1';
 readonly id:string;readonly site:'hill-side';readonly approvedYear:number;readonly effectiveYear:number;
 readonly parentRevision:string;readonly revisionId:string;
 readonly cause:{readonly recordId:string;readonly fieldId:string;readonly fieldSourceRecordId:string;readonly fieldBuiltYear:number};
 readonly plot:GroundPlot;readonly bounds:GroundPlot;readonly targetElevation:number;readonly cutVolume:number;
 readonly cells:readonly TerrainCellChange[];readonly disturbedPatches:readonly number[];
}
