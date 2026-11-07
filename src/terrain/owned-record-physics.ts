/** Internal read-only raster shared by land queries. Public decoding stays fresh. */
import {decodeRecordPhysics,type RecordRaster} from './terrain-record-raster-v1.js';
import type {RecordPhysics} from './terrain-record-types.js';
const rasters=new WeakMap<object,RecordRaster>();
export function frozenRecordPhysics(p:RecordPhysics):boolean {
 return Object.isFrozen(p)&&Object.isFrozen(p.rows)&&p.rows.every(row=>Object.isFrozen(row)&&row.every(Object.isFrozen));
}
/** Callers must never mutate these privately owned arrays. Mutable wires bypass caching. */
export function readOwnedRecordPhysics(p:RecordPhysics):RecordRaster {
 if(!frozenRecordPhysics(p))return decodeRecordPhysics(p);
 let raster=rasters.get(p);if(!raster){raster=decodeRecordPhysics(p);rasters.set(p,raster);}return raster;
}
