/**
 * Issue #47 B2a: world save v10 = the complete, unchanged v9 architecture packet plus the world's initial climate.
 *
 * The climate is a pure function of the world seed (initial-climate-v1). The saved record is the world's
 * canonical climate, and on load it must equal the climate regenerated from the saved seed: a changed value,
 * unknown rule or missing record is rejected. v9 (and other pre-climate) saves are not read as the current
 * world (Human decision, docs/issue47-b2-plan.md §1); no migration is offered.
 *
 * B2b (schemaVersion 2): adds the world's local flora (local-flora-v1), likewise a pure function of the seed,
 * the climate and the initial terrain record, saved and regenerated on load. v10 schemaVersion 1 saves (B2a)
 * are reported as an earlier version and not opened.
 */
import {prepareArchitectureSave,validateArchitectureSave,restoreArchitectureSave,type ArchitectureProductionSave,type ArchitectureProductionWorld} from '../architecture/production-v1.js';
import {sameWire} from '../story/generated-state-review.js';
import {generateClimateBaseline,type WorldClimateBaseline} from './initial-climate-v1.js';
import {createLocalFlora,type LocalFlora} from '../flora/local-flora-v1.js';

export const CLIMATE_WORLD_SAVE_KEY='namonaki-story-v10';
export interface ClimateWorldSave {
 readonly format:'namonaki-world-save';readonly version:10;readonly schemaVersion:2;
 readonly world:ArchitectureProductionSave;readonly climate:WorldClimateBaseline;readonly flora:LocalFlora;
}
/** A save from before the climate record. Thrown so the UI can say why it cannot be opened. */
export class PreClimateWorldError extends Error {
 constructor(version:unknown){super(`World save v${String(version)} predates the climate record (v10); start a new world`);this.name='PreClimateWorldError';}
}
/** A save written by an earlier version of the current format (e.g. v10 before the flora record). */
export class OutdatedWorldSaveError extends Error {
 constructor(detail:string){super(`World save from an earlier version (${detail}); start a new world`);this.name='OutdatedWorldSaveError';}
}
const fail=(message:string):never=>{throw Error('Invalid v10 world: '+message);};
const freeze=<T>(o:T):T=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
const packets=new WeakMap<object,ArchitectureProductionWorld>();

export function worldSeed(world:ArchitectureProductionWorld):number {return world.terrain.review.state.seed;}
/** The canonical climate of a world: regenerated from its seed, never stored separately in memory. */
export function worldClimate(world:ArchitectureProductionWorld):WorldClimateBaseline {return generateClimateBaseline(worldSeed(world));}
/** The initial terrain record (year 0, before any earthwork), the input of the local flora. */
const initialTerrain=(world:ArchitectureProductionWorld)=>world.terrain.review.terrain;
const floras=new WeakMap<object,LocalFlora>();
/** The canonical local flora of a world, cached per initial terrain record (it never changes for a world). */
export function worldFlora(world:ArchitectureProductionWorld):LocalFlora {
 const terrain=initialTerrain(world);let flora=floras.get(terrain);
 if(!flora){flora=createLocalFlora(worldSeed(world),worldClimate(world),terrain);if(Object.isFrozen(terrain))floras.set(terrain,flora);}
 return flora;
}

export async function prepareClimateWorldSave(world:ArchitectureProductionWorld):Promise<ClimateWorldSave>{
 const packet=freeze({format:'namonaki-world-save',version:10,schemaVersion:2,world:await prepareArchitectureSave(world),climate:worldClimate(world),flora:worldFlora(world)} as ClimateWorldSave);
 packets.set(packet,world);return packet;
}
/** Native reader: the nested v9 packet through its own reader, then the climate and flora against their sources. */
export async function validateClimateWorldSave(raw:unknown):Promise<ClimateWorldSave>{
 if(raw&&typeof raw==='object'&&packets.has(raw))return raw as ClimateWorldSave;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('save must be an object');
 const d=raw as Record<string,unknown>;
 if(d.format==='namonaki-world-save'&&d.version===10&&d.schemaVersion===1)throw new OutdatedWorldSaveError('v10 without the flora record');
 if(Object.keys(d).sort().join(',')!=='climate,flora,format,schemaVersion,version,world'||d.format!=='namonaki-world-save'||d.version!==10||d.schemaVersion!==2)fail('unknown contract');
 const v9=await validateArchitectureSave(d.world),world=restoreArchitectureSave(v9),expected=worldClimate(world);
 const wire=(v:unknown)=>JSON.parse(JSON.stringify(v??null));
 if(!sameWire(wire(d.climate),wire(expected)))fail('climate does not match the world seed');
 const flora=worldFlora(world);
 if(!sameWire(wire(d.flora),wire(flora)))fail('flora does not match the world seed, climate and initial terrain');
 const packet=freeze({format:'namonaki-world-save',version:10,schemaVersion:2,world:v9,climate:expected,flora} as ClimateWorldSave);
 packets.set(packet,world);return packet;
}
export function restoreClimateWorldSave(packet:ClimateWorldSave):ArchitectureProductionWorld {return packets.get(packet)??fail('use a validated v10 packet');}
/** True only for packets this module prepared or validated (the common save envelope must not trust others). */
export function knownClimateWorldPacket(raw:unknown):raw is ClimateWorldSave {return !!raw&&typeof raw==='object'&&packets.has(raw);}
