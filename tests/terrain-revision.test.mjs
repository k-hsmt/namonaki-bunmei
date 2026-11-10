import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createTerrainHistory,resolveTerrainAtYear,terrainHistoryThrough,readTerrainPhysicalSource,assertResolvedTerrain} from '../dist/terrain/terrain-revision-v1.js';
import {terrainRevisionCanonical,terrainRevisionHash} from '../dist/terrain/terrain-revision-wire-v1.js';
import {validateTerrainRecord} from '../dist/terrain/terrain-record.js';
import {reviewGroundAccess,createGroundAccessReviewer} from '../dist/terrain/ground-access-review.js';
import {findPlacementReview} from '../dist/terrain/placement-search-review.js';
import {proposeIrrigation} from '../dist/irrigation/geometry-v1.js';
import {fixture} from './helpers/irrigation-fixture.mjs';
const raw=JSON.parse(await readFile(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8'));
test('terrain history detaches before hashing, preserves initial identity and bounds observation',async()=>{
 const source=structuredClone(raw),pending=createTerrainHistory(source,100);source.source.seed=1;source.sites['hill-side'].physics.rows=[];
 const h=await pending,v=resolveTerrainAtYear(h,99);assert.equal(v.source.seed,42);assert.equal(v.baseHash,await terrainRevisionHash(raw));assert.equal(v.revisionId,v.baseHash);assert.equal(v.sites,h.initial.sites);assert.ok(Object.isFrozen(v));assert.ok(Object.isFrozen(v.sites['hill-side'].physics.rows[100]));
 assert.equal(resolveTerrainAtYear(h,99),v);assert.throws(()=>resolveTerrainAtYear(h,101),/Unconfirmed/);assert.throws(()=>resolveTerrainAtYear(h,-1));assert.throws(()=>resolveTerrainAtYear(h,0.5));
 const extended=terrainHistoryThrough(h,1000);assert.equal(resolveTerrainAtYear(extended,1000).revisionId,v.revisionId);assert.equal(terrainHistoryThrough(h,100),h);assert.throws(()=>terrainHistoryThrough(h,99));assert.throws(()=>resolveTerrainAtYear(h,1000));
 assert.throws(()=>assertResolvedTerrain(v,100));assert.throws(()=>readTerrainPhysicalSource(structuredClone(v)),/boundary/);assert.throws(()=>resolveTerrainAtYear(structuredClone(h),99),/Unowned/);assert.throws(()=>validateTerrainRecord(v));
});
test('same-year revision adapters preserve actual placement, physical access and irrigation results',async()=>{
 const ctx=fixture(),h=await createTerrainHistory(ctx.ground.terrain,10),view=resolveTerrainAtYear(h,10),ground={...ctx.ground,terrain:view};
 const plot={x:60,y:120,width:18,depth:7};assert.deepEqual(reviewGroundAccess(ground,'house','new',plot),reviewGroundAccess(ctx.ground,'house','new',plot));assert.deepEqual(createGroundAccessReviewer(ground)('house','new',plot),reviewGroundAccess(ctx.ground,'house','new',plot));
 const req={objectId:'new-house',purpose:'house',width:18,depth:7,nucleus:ground.primaryRoot,neighborEntrances:[ground.occupancy[0].entrance],growthPattern:'organic-v3'};
 assert.deepEqual(findPlacementReview(ground,req),findPlacementReview(ctx.ground,req));
 assert.deepEqual(proposeIrrigation({...ctx,ground}),proposeIrrigation(ctx));
 assert.throws(()=>reviewGroundAccess({...ground,year:9},'house','new',plot),/year mismatch/);assert.throws(()=>findPlacementReview({...ground,year:9},req),/year mismatch/);
 assert.throws(()=>proposeIrrigation({...ctx,ground:{...ground,terrain:structuredClone(view)}}),/boundary/);
});
test('canonical terrain hashes bind nested values and reject accessors or non-JSON data',async()=>{
 assert.equal(terrainRevisionCanonical({b:[1,null],a:'x'}),'{'+'"a":"x","b":[1,null]}');assert.equal(await terrainRevisionHash({a:1,b:2}),await terrainRevisionHash({b:2,a:1}));
 for(const value of [NaN,undefined,{x:undefined},new Date(),new Uint8Array(1),[1,,3],Object.assign([1],{extra:2}),Object.defineProperty({},'x',{enumerable:true,get(){throw Error('getter must not execute');}})])assert.throws(()=>terrainRevisionCanonical(value));
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>terrainRevisionCanonical(cyclic));
});
