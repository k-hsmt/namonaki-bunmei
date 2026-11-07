import type {GroundPlot} from './ground-access-review.js';
declare const verifiedCrossing:unique symbol;
/** Minted by bridge geometry verification, never from an arbitrary water plot. */
export interface WalkableBridgeCrossing {
 readonly [verifiedCrossing]:true;
 readonly bridgeId:string;readonly site:'river-bank';readonly deck:GroundPlot;
 readonly occupiedIds:readonly [string,string,string];
}
