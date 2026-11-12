/** Issue #47 B2a: the world's initial climate in new worlds and save v10. v9 saves are not opened. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {CLIMATE_WORLD_SAVE_KEY,PreClimateWorldError,OutdatedWorldSaveError,validateClimateWorldSave,prepareClimateWorldSave,knownClimateWorldPacket} from '../dist/climate/climate-world-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld,prepareArchitectureSave} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,advanceWorldSessionAsync,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {ARCHITECTURE_WORLD_SAVE_KEY,parseWorldSaveAsync,serializeWorldSave,validateWorldSave} from '../dist/story/world-save.js';
import {encodeWorldSave,decodeWorldSave,findWorldSave,storeWorldSave,higherPriorityWorldSaveKeys} from '../dist/story/world-storage.js';
import * as Prototype from '../scripts/lib/climate-prototype.mjs';

const world=await createNewArchitectureWorld(42);

test('B2a: the game climate is the reviewed B1c climate for every seed checked',()=>{
 for(let seed=1;seed<=1000;seed++)assert.deepEqual(generateClimateBaseline(seed),Prototype.generateClimateBaseline(seed),'seed '+seed);
 for(const seed of [4294967295,2147483648,88])assert.deepEqual(generateClimateBaseline(seed),Prototype.generateClimateBaseline(seed));
 assert.deepEqual([...BIOME_KINDS],[...Prototype.BIOMES]);
 for(const bad of [0,-1,1.5,4294967296])assert.throws(()=>generateClimateBaseline(bad),/Invalid world seed/);
});

test('B2a: a new world carries the climate of its seed, unchanged as it advances',async()=>{
 assert.deepEqual(world.climate,generateClimateBaseline(42));
 assert.equal(world.climate.ruleId,'initial-climate-v1');
 const later=await advanceWorldSessionAsync(world,60);
 assert.ok(later.state.year>0);assert.deepEqual(later.climate,world.climate);
});

test('B2a: the climate does not touch the civilisation — the v9 world inside v10 equals the world advanced without sessions',async()=>{
 const direct=await advanceArchitectureWorld((await createNewArchitectureWorld(42)).architecture,300,'automatic');
 // Computing climates in between must not change anything (no shared random state).
 for(let s=1;s<200;s++)generateClimateBaseline(s);
 const viaSession=architectureProductionSession(await advanceArchitectureWorld(world.architecture,300,'automatic'));
 const packet=await prepareWorldSessionSave(viaSession);
 assert.equal(packet.version,10);
 assert.deepEqual(packet.world,await prepareArchitectureSave(direct));
 assert.deepEqual(packet.climate,generateClimateBaseline(42));
});

test('B2a: v10 saves round-trip through storage, compression and JSON export',async()=>{
 const packet=await prepareWorldSessionSave(world);
 assert.equal(packet.version,10);assert.equal(validateWorldSave(packet),packet);assert.ok(knownClimateWorldPacket(packet));
 const encoded=await encodeWorldSave(packet);
 const back=restoreWorldSession(await decodeWorldSave(encoded.json));
 assert.ok(back.architecture);assert.deepEqual(back.climate,world.climate);
 assert.deepEqual(await prepareWorldSessionSave(back),packet);
 assert.deepEqual(await prepareWorldSessionSave(restoreWorldSession(await parseWorldSaveAsync(serializeWorldSave(packet)))),packet,'JSON export / file import');
 const data=new Map();
 assert.deepEqual(await storeWorldSave({setItem:(k,v)=>data.set(k,v)},packet),{status:'saved'});
 assert.deepEqual([...data.keys()],[CLIMATE_WORLD_SAVE_KEY]);
 assert.deepEqual(higherPriorityWorldSaveKeys(packet),[]);
 data.set(ARCHITECTURE_WORLD_SAVE_KEY,'{"version":9}');
 assert.equal((await findWorldSave(k=>data.get(k)??null)).version,10,'v10 is found before an old v9 slot');
});

test('B2a: a changed, missing or unknown climate record is rejected',async()=>{
 const packet=JSON.parse(serializeWorldSave(await prepareWorldSessionSave(world)));
 assert.ok(await validateClimateWorldSave(JSON.parse(JSON.stringify(packet))));
 const variants=[
  p=>{p.climate.temperatureIndex+=1;},
  p=>{p.climate.dominantBiome=p.climate.dominantBiome==='desert'?'tundra':'desert';},
  p=>{p.climate.ruleId='initial-climate-v2';},
  p=>{p.climate.transition={biome:'desert',distance:9};},
  p=>{delete p.climate;},
  p=>{p.climate=null;},
  p=>{p.extra=1;},
  p=>{p.schemaVersion=3;},
 ];
 for(const change of variants){const p=JSON.parse(JSON.stringify(packet));change(p);await assert.rejects(validateClimateWorldSave(p),/Invalid v10 world|Invalid/,change.toString());}
 // v10 from B2a (schemaVersion 1, no flora) is an earlier version: reported, not opened.
 const b2a=JSON.parse(JSON.stringify(packet));b2a.schemaVersion=1;delete b2a.flora;
 await assert.rejects(validateClimateWorldSave(b2a),OutdatedWorldSaveError);
 // A climate copied from another seed does not fit this world.
 const other=JSON.parse(JSON.stringify(packet));other.climate=JSON.parse(JSON.stringify(generateClimateBaseline(43)));
 await assert.rejects(validateClimateWorldSave(other),/does not match the world seed/);
});

test('B2a: v9 (pre-climate) saves are reported, not opened, and the saved value is left alone',async()=>{
 const v9=await prepareArchitectureSave(world.architecture),json=JSON.stringify(v9);
 await assert.rejects(parseWorldSaveAsync(json),PreClimateWorldError);
 assert.throws(()=>validateWorldSave(v9),PreClimateWorldError);
 const data=new Map([[ARCHITECTURE_WORLD_SAVE_KEY,json]]);
 await assert.rejects(findWorldSave(k=>data.get(k)??null),PreClimateWorldError);
 assert.equal(data.get(ARCHITECTURE_WORLD_SAVE_KEY),json,'reading does not remove or rewrite the old save');
 // A fresh v10 packet built from the same world is still accepted.
 assert.equal((await prepareClimateWorldSave(world.architecture)).version,10);
});
