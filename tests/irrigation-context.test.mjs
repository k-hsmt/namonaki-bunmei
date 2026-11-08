import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';import {createGeneratedWorldSave,restoreGeneratedWorld} from '../dist/story/world-save.js';
import {irrigationContextAt} from '../dist/irrigation/context-v1.js';import {proposeIrrigation,validateIrrigationGeometry} from '../dist/irrigation/geometry-v1.js';
const initial=createNewWorld(42).review,world=advanceGeneratedBridgeReview(initial,1000,'automatic'),cause=world.review.state.history.find(r=>r.kind==='irrigation');
test('confirmed as-of contexts and route proposals match at the original year, after later development and after plain JSON restoration',()=>{
 assert.ok(cause);const before=createGeneratedWorldSave(world),ctx=irrigationContextAt(world,cause.id),proposal=proposeIrrigation(ctx),prefix=advanceGeneratedBridgeReview(initial,cause.year,'automatic'),early=irrigationContextAt(prefix,cause.id);
 assert.deepEqual({...ctx.ground,confirmedYear:cause.year},early.ground);assert.deepEqual(ctx.fields,early.fields);assert.deepEqual(proposeIrrigation(early),proposal);assert.equal(proposal.status,'proposed');assert.deepEqual(validateIrrigationGeometry(proposal.geometry,early),proposal.geometry);
 const restored=restoreGeneratedWorld(JSON.parse(JSON.stringify(before)));assert.deepEqual(proposeIrrigation(irrigationContextAt(restored,cause.id)),proposal);assert.deepEqual(createGeneratedWorldSave(world),before);assert.ok(ctx.ground.occupancy.every(o=>!world.review.placements.some(p=>p.objectId===o.id&&p.builtYear>cause.year)));
});
test('unknown, non-irrigation, future and unconfirmed causes cannot create a natural proposal',()=>{
 assert.throws(()=>irrigationContextAt(world,'invented'));assert.throws(()=>irrigationContextAt(world,world.review.state.history[0].id));assert.throws(()=>irrigationContextAt(initial,cause.id));
 const pending=advanceGeneratedBridgeReview(initial,1000,'stop');assert.ok(pending.review.state.pending);assert.throws(()=>irrigationContextAt(pending,cause.id));
 const corrupt={...world,review:{...world.review,state:{...world.review.state,history:[...world.review.state.history,cause]}}};assert.throws(()=>irrigationContextAt(corrupt,cause.id));
 const record=ctx=>({...ctx,review:{...ctx.review,placements:ctx.review.placements.map(p=>p.kind==='field'?{...p,sourceRecordId:'invented'}:p)}});assert.throws(()=>irrigationContextAt(record(world),cause.id));
});
test('the runtime geometry import graph has no civilization, generators, storage, scene or random-number producer',async()=>{
 const seen=new Set();async function visit(file){if(seen.has(file))return;seen.add(file);const text=await readFile(file,'utf8');for(const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+\.js)['"]/g)){const child=resolve(dirname(file),match[1]);assert.doesNotMatch(child,/\/(story|scene|engine)\/|prototype|capture|initial-v1|progression|world-storage/);await visit(child);}}await visit(resolve('dist/irrigation/geometry-v1.js'));assert.ok(seen.size>=5);
});
