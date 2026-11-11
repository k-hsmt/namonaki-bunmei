/**
 * Issue #35 D4 (Human decision A): rebuilding at v8's recovery of a ruin (architecture-rebuild-v1).
 * v8 has no demolition: a ruined facility is reused, a ruined housing block repaired, 12+ years after it
 * fell into ruin, under the same id. v9 records that moment as a rebuild: a new generation of the
 * building on the same plot, whose style is chosen among (D0 A14-A16)
 *  - old:     reproduce the previous generation (only if its technology is still held)
 *  - current: build anew in the district's tradition and technology of that year
 *  - mixed:   keep the previous structure, wall and foundation, the rest from the current tradition
 * Weights follow how far the tradition moved since the previous generation was built. Provisional;
 * calibrated after the D4 audit. Deterministic: its own hash stream, never the civilization RNG.
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';

export const REBUILD_ID='architecture-rebuild-v1';
export type RebuildMode='old'|'current'|'mixed';
/** Provisional weights, given the number of tradition axes that changed since the previous generation. */
export function rebuildWeights(changedAxes:number):Readonly<Record<RebuildMode,number>> {
 return {old:Math.max(1,4-changedAxes),current:1+changedAxes,mixed:changedAxes>0?2:0};
}
export function chooseRebuildMode(seed:number,key:string,year:number,changedAxes:number):RebuildMode {
 if(!Number.isSafeInteger(changedAxes)||changedAxes<0)throw Error('architecture rebuild: invalid change count');
 const w=rebuildWeights(changedAxes),order:RebuildMode[]=['old','current','mixed'];
 let r=terrainHash([REBUILD_ID,seed,key,year])%(w.old+w.current+w.mixed);
 for(const m of order){if(r<w[m])return m;r-=w[m];}
 return 'current';
}
