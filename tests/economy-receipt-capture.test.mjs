import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalEconomy} from '../dist/story/regional-economy.js';
import {frozenEconomyCapture,frozenCoupledReceiptCaptureInternal} from '../dist/story/economy-observer.js';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {freezeReview,freezeReviewWriterDataInternal} from '../dist/irrigation/wire-v1.js';

test('private receipt values equal the full observer projection and stay detached and recursively immutable',()=>{
 const input={year:37,drought:12,before:{economy:createRegionalEconomy(),people:[10,20,30]},after:{economy:createRegionalEconomy(),people:[11,21,31]},conditions:{harvestFactors:[1,2,3],blockedRegions:['river'],granaries:[true,false,true],disruptionId:'flood-36'},records:[{id:'37-1',event:{title:'trade',body:'record',causes:['route'],relatedIds:['earlier']}}],totals:{harvest:[12,23,34],discarded:[1,2,3],imports:[2,3,4],traded:[5,6],moves:[{from:'river',to:'hill',amount:1}]}};
 const full=frozenEconomyCapture(input),receipt=frozenCoupledReceiptCaptureInternal(input);
 const expected={year:full.year,drought:full.drought,before:{people:full.before.people},conditions:{disruptionId:full.conditions.disruptionId,blockedRegions:full.conditions.blockedRegions,granaries:full.conditions.granaries},records:full.records.map(r=>({id:r.id})),totals:{harvest:full.totals.harvest,discarded:full.totals.discarded}};
 assert.deepEqual(receipt,expected);assert.ok(full.before.economy);assert.ok(full.after.economy);assert.ok(full.records[0].event);
 const frozen=JSON.stringify(receipt);input.before.people[0]=999;input.conditions.harvestFactors[0]=999;input.conditions.granaries[0]=false;input.records[0].id='changed';input.totals.harvest[0]=999;input.totals.discarded.push(999);
 assert.equal(JSON.stringify(receipt),frozen);
 const check=value=>{if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));Object.values(value).forEach(check);}};check(receipt);
 assert.throws(()=>receipt.before.people[0]=999,TypeError);assert.throws(()=>receipt.totals.harvest.push(999),TypeError);
});
test('the private receipt callback cannot be installed through public generated-world options',()=>{
 const world=createNewIrrigatedWorld(42).review;
 assert.throws(()=>advanceGeneratedBridgeReview(world,1,'automatic',{captureCoupledReceiptInternal(){throw Error('must not be called');}}),/Unknown generated advance option/);
});
test('writer literals stay deeply frozen while native freezing still checks hidden, accessor and shallow-frozen children',()=>{
 const writer={input:[[1,2,3],4,null],effect:{workEventIds:['built']}};
 assert.equal(freezeReviewWriterDataInternal(writer),writer);
 assert.throws(()=>writer.input[0].push(4),TypeError);assert.throws(()=>writer.effect.workEventIds[0]='changed',TypeError);
 const hidden={items:[]},accessed={items:[]},symbolic={items:[]},symbol=Symbol('native');
 const foreign={};Object.defineProperty(foreign,'hidden',{value:hidden});Object.defineProperty(foreign,'accessed',{get:()=>accessed});foreign[symbol]=symbolic;Object.freeze(foreign);
 freezeReview(foreign);
 for(const child of [hidden,accessed,symbolic]){assert.ok(Object.isFrozen(child));assert.ok(Object.isFrozen(child.items));}
});
