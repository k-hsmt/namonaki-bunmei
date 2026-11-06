/** D2-A review-only wire contract, deliberately distinct from live save v5. */
export const recordSites=['hill-side','river-bank','coast-inlet'] as const;
export type RecordSite=typeof recordSites[number];
export type RecordPoint=readonly [number,number];
export interface RecordShape {
 readonly id:string;readonly kind:'land'|'slope'|'cliff'|'freshwater'|'sea'|'island'|'sandbar';
 readonly polygon:readonly RecordPoint[];readonly elevation:number;
 readonly applyTo:'all'|'land'|'freshwater';
 readonly profile:null|{readonly axis:'x'|'y';readonly knots:readonly RecordPoint[]};
}
/** [run length, surface, grade, bearing, relative elevation], fixed numeric codes. */
export type CellRun=readonly [number,number,number,number,number];
export interface RecordPhysics {readonly encoding:'row-rle-v1';readonly width:320;readonly height:180;readonly rows:readonly (readonly CellRun[])[]}
export interface RecordCell {readonly surface:number;readonly grade:number;readonly bearing:number;readonly elevation:number}
export type RecordDecal=readonly [number,number,number,number,string];
export interface RecordView {
 readonly mirrorX:boolean;readonly far:readonly (readonly RecordPoint[])[];
 readonly middle:readonly (readonly RecordPoint[])[];readonly decals:readonly RecordDecal[];
}
export interface RecordSiteTerrain {
 readonly siteId:RecordSite;
 readonly variants:{readonly river:string|null;readonly hills:string|null;readonly coast:string|null;readonly mountains:string};
 readonly shapes:readonly RecordShape[];readonly physics:RecordPhysics;readonly render:RecordView;
 readonly initialPlan:null;
}
export interface TerrainRecord {
 readonly format:'initial-terrain-record';readonly schemaVersion:1;readonly status:'review-only';
 readonly generatorId:'world-prototype-v1';readonly rasterRule:'terrain-result-raster-v1';
 readonly rendererId:'terrain-result-render-v1';readonly establishedYear:0;readonly placementPolicy:null;
 readonly source:{readonly revision:string;readonly seed:number};
 readonly geography:{readonly seaSide:'east'|'west';readonly relief:'low'|'medium'|'high';
  readonly landmarks:readonly {readonly id:string;readonly position:number;readonly height:number}[];
  readonly streams:readonly {readonly id:string;readonly from:string;readonly to:string}[];
  readonly ports:readonly {readonly site:RecordSite;readonly flow:'in'|'out';readonly streamId:string;readonly visible:boolean;readonly point:RecordPoint|null;readonly relativeElevation:number}[];
 };
 readonly sites:Readonly<Record<RecordSite,RecordSiteTerrain>>;
}
