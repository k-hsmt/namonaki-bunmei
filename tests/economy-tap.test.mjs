import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld,prepareArchitectureSave} from '../dist/architecture/production-v1.js';

// Issue #40 D1b: the read-only economy tap of the production world (advanceArchitectureWorld's observer).
test('economy tap: the same world with or without an observer; one frozen capture per confirmed year with the economy', async () => {
 const created=(await createNewArchitectureWorld(6)).architecture,captures=[];
 const plain=await advanceArchitectureWorld(created,60,'automatic');
 const tapped=await advanceArchitectureWorld(created,60,'automatic',{},c=>captures.push(c));
 assert.equal(JSON.stringify(await prepareArchitectureSave(tapped)),JSON.stringify(await prepareArchitectureSave(plain)));
 assert.deepEqual(captures.map(c=>c.year),Array.from({length:60},(_,i)=>i+1));
 const state=tapped.terrain.review.state;
 for(const c of captures){
  assert.ok(Object.isFrozen(c.economy)&&Object.isFrozen(c.economy.districts[0]));
  assert.equal(c.economy.harvest.length,3);assert.equal(c.economy.districts.length,3);
  for(const d of c.economy.districts)assert.ok(d.coverage>=0&&d.coverage<=1&&Number.isSafeInteger(d.shortageYears));
 }
 // the last capture is the year's confirmed economy as the world keeps it
 assert.deepEqual(captures.at(-1).economy.districts.map(d=>d.shortageYears),state.economy.districts.map(d=>d.shortageYears));
 assert.deepEqual(captures.at(-1).economy.districts.map(d=>d.coverage),state.economy.districts.map(d=>d.coverage.at(-1)));
 await assert.rejects(advanceArchitectureWorld(created,1,'automatic',{},'not a function'),/invalid observer/);
 // an observer that throws does not leave a half-advanced world: the input world is unchanged and usable
 await assert.rejects(advanceArchitectureWorld(created,5,'automatic',{},()=>{throw Error('reader failed');}),/reader failed/);
 assert.equal(JSON.stringify(await prepareArchitectureSave(await advanceArchitectureWorld(created,60,'automatic'))),JSON.stringify(await prepareArchitectureSave(plain)));
});
