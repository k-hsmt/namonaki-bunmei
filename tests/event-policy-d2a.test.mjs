import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld,prepareArchitectureSave} from '../dist/architecture/production-v1.js';
import {civilizationEventKindsInternal} from '../dist/story/engine.js';
import {EVENT_REQUIREMENTS,SUSPENDED_EVENTS,REQUIREMENT_SOURCES,LEDGER_REQUIREMENTS,DRAW_PROBABILITY,hardship,createEventPolicyD2a,ledgerEventFactsAt,meetsRequirement,confirmedEventFacts} from '../dist/story/event-policy-d2a-review.js';

// Issue #40 D2a: the review-only event policy (story/event-policy-d2a-review), as revised by the D2a Human review.
const HARDSHIP='hardship-linked';
const worldAt=async(seed,years,options)=>{const w=await advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,years,'automatic',{},undefined,createEventPolicyD2a(HARDSHIP,options));return w.terrain.review.state;};

test('event policy: every kind of the yearly draw has exactly one requirement; every requirement has a source', () => {
 assert.deepEqual([...civilizationEventKindsInternal()].sort(),Object.keys(EVENT_REQUIREMENTS).sort());
 for(const r of new Set(Object.values(EVENT_REQUIREMENTS)))if(r!=='none'&&r!=='suspended')assert.ok(REQUIREMENT_SOURCES[r],r);
 assert.deepEqual(Object.keys(SUSPENDED_EVENTS).sort(),Object.entries(EVENT_REQUIREMENTS).filter(([,r])=>r==='suspended').map(([k])=>k).sort());
 assert.deepEqual(Object.keys(SUSPENDED_EVENTS).sort(),['abandon','cold','decline','rebirth','storm','well']);
 assert.throws(()=>createEventPolicyD2a(HARDSHIP).eligible('unknown-kind',{}),/no requirement/);
 for(const s of ['eligibility-only','momentum','combined'])assert.throws(()=>createEventPolicyD2a(s),/unknown setting/);
 assert.throws(()=>createEventPolicyD2a(HARDSHIP,{observeDraw:'x'}),/invalid draw observer/);
});

test('event policy: the added and suspended requirements (D2a Human review Q2)', () => {
 const base={townOrLarger:true,marketStanding:true,riverMarketStanding:true,granaryStanding:true,councilSites:3,inhabitedSites:3,communalWork:false,
  archivePractice:false,splitCommunity:true,riverInhabited:true,coastInhabited:true,districtShortage:true,recentTrade:true,pastDisease:true,
  pastConflict:true,pastRecordEvent:false,drought:true,uninhabitedSite:true};
 // suspended kinds are never candidates, whatever the facts
 for(const k of Object.keys(SUSPENDED_EVENTS))assert.equal(createEventPolicyD2a(HARDSHIP).eligible(k,base),false,k);
 // tax needs confirmed communal work or an institution for it; the record-keeping practice alone is not required
 assert.equal(meetsRequirement(EVENT_REQUIREMENTS.tax,base),false);
 assert.equal(meetsRequirement(EVENT_REQUIREMENTS.tax,{...base,communalWork:true}),true);
 // first_library needs earlier record-keeping: an archive or writing event, or the record-keeping practice
 assert.equal(meetsRequirement(EVENT_REQUIREMENTS.first_library,base),false);
 assert.equal(meetsRequirement(EVENT_REQUIREMENTS.first_library,{...base,pastRecordEvent:true}),true);
 assert.equal(meetsRequirement(EVENT_REQUIREMENTS.first_library,{...base,archivePractice:true}),true);
 assert.equal(EVENT_REQUIREMENTS.first_archive,'none');// the birth of record-keeping itself
});

test('event policy: a review-only world cannot be saved, cannot drop its policy, starts only at year 0', async () => {
 const created=(await createNewArchitectureWorld(6)).architecture,policy=createEventPolicyD2a(HARDSHIP);
 const trial=await advanceArchitectureWorld(created,60,'automatic',{},undefined,policy);
 await assert.rejects(prepareArchitectureSave(trial),/review-only event policy cannot be saved/);
 await assert.rejects(advanceArchitectureWorld(trial,10,'automatic'),/continues only with its own policy/);
 const more=await advanceArchitectureWorld(trial,10,'automatic',{},undefined,createEventPolicyD2a(HARDSHIP));// same rule, new object
 assert.equal(more.terrain.review.state.year,70);await assert.rejects(prepareArchitectureSave(more),/cannot be saved/);
 const production=await advanceArchitectureWorld(created,10,'automatic');
 await assert.rejects(advanceArchitectureWorld(production,10,'automatic',{},undefined,policy),/starts from a new world/);
 await assert.rejects(advanceArchitectureWorld(created,10,'automatic',{},undefined,{...policy}),/use createEventPolicyD2a/);
 assert.ok(await prepareArchitectureSave(production));
});

test('event policy: one receipt per year; every event was eligible on the facts of its draw and on the ledger', async () => {
 const receipts=[],s=await worldAt(3,600,{observeDraw:r=>receipts.push(r)});
 assert.deepEqual(receipts.map(r=>r.year),Array.from({length:600},(_,i)=>i+1));
 const events=new Map(s.history.filter(r=>EVENT_REQUIREMENTS[r.kind]&&!r.buildingId).map(r=>[r.year,r.kind]));
 let checked=0;
 for(const r of receipts){
  assert.ok(Object.isFrozen(r));
  // the probability is the adopted formula of the inputs the policy saw
  assert.equal(r.probability,.07+.40*hardship({food:r.inputs.food,cohesion:r.inputs.cohesion,drought:r.inputs.drought,epidemic:r.inputs.epidemic}));
  assert.equal(r.selected,events.get(r.year)??null,`year ${r.year}`);
  if(!r.selected)continue;checked++;
  const req=EVENT_REQUIREMENTS[r.selected];assert.ok(meetsRequirement(req,r.facts),`${r.selected} in ${r.year}`);
  if(LEDGER_REQUIREMENTS.includes(req))assert.ok(meetsRequirement(req,{...r.facts,...ledgerEventFactsAt(s.observation.sites,r.year-1)}));
 }
 assert.ok(checked>50);
 for(const k of Object.keys(SUSPENDED_EVENTS))assert.ok(!s.history.some(r=>r.kind===k),k);
});

test('event policy: facts are read from the previous confirmed year; the probability stays within 0..1', async () => {
 const world=await advanceArchitectureWorld((await createNewArchitectureWorld(6)).architecture,40,'automatic'),s=structuredClone(world.terrain.review.state);
 assert.throws(()=>confirmedEventFacts(s),/previous confirmed year/);
 s.year++;assert.equal(confirmedEventFacts(s).ledgerYear,40);
 for(const food of [0,30,50,100])for(const cohesion of [0,45,100])for(const drought of [0,1,3])for(const epidemic of [0,2]){
  const v=DRAW_PROBABILITY[HARDSHIP]({...s,food,cohesion,drought,epidemic});assert.ok(v>=.07&&v<=.47+1e-12,String(v));// 0.07 + 0.40 × 1 is 0.47000000000000003 in floating point
 }
});
