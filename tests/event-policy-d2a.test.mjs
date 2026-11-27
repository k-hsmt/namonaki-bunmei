import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld,prepareArchitectureSave} from '../dist/architecture/production-v1.js';
import {civilizationEventKindsInternal} from '../dist/story/engine.js';
import {EVENT_REQUIREMENTS,EVENT_POLICY_SETTINGS,LEDGER_REQUIREMENTS,DRAW_PROBABILITY,createEventPolicyD2a,ledgerEventFactsAt,meetsRequirement,confirmedEventFacts} from '../dist/story/event-policy-d2a-review.js';

// Issue #40 D2a: the review-only event policy (story/event-policy-d2a-review).
test('event policy: every kind of the yearly draw has exactly one requirement', () => {
 const kinds=civilizationEventKindsInternal();
 assert.deepEqual([...kinds].sort(),Object.keys(EVENT_REQUIREMENTS).sort());
 assert.throws(()=>createEventPolicyD2a('eligibility-only').eligible('unknown-kind',{}),/no requirement/);
 assert.throws(()=>createEventPolicyD2a('no-such-setting'),/unknown setting/);
});

test('event policy: a review-only world cannot be saved, cannot drop or change its policy, starts only at year 0', async () => {
 const created=(await createNewArchitectureWorld(6)).architecture,policy=createEventPolicyD2a('eligibility-only');
 const trial=await advanceArchitectureWorld(created,60,'automatic',{},undefined,policy);
 await assert.rejects(prepareArchitectureSave(trial),/review-only event policy cannot be saved/);
 await assert.rejects(advanceArchitectureWorld(trial,10,'automatic'),/continues only with its own policy/);
 await assert.rejects(advanceArchitectureWorld(trial,10,'automatic',{},undefined,createEventPolicyD2a('momentum')),/continues only with its own policy/);
 const more=await advanceArchitectureWorld(trial,10,'automatic',{},undefined,policy);
 assert.equal(more.terrain.review.state.year,70);await assert.rejects(prepareArchitectureSave(more),/cannot be saved/);
 // a production history cannot switch to the review rule midway
 const production=await advanceArchitectureWorld(created,10,'automatic');
 await assert.rejects(advanceArchitectureWorld(production,10,'automatic',{},undefined,policy),/starts from a new world/);
 await assert.rejects(advanceArchitectureWorld(created,10,'automatic',{},undefined,{...policy}),/use createEventPolicyD2a/);
 // the production world is untouched and saves as before
 assert.ok(await prepareArchitectureSave(production));
});

test('event policy: no event happens without its ledger fact (confirmed at the end of the previous year)', async () => {
 const created=(await createNewArchitectureWorld(3)).architecture;
 for(const setting of EVENT_POLICY_SETTINGS){
  const world=await advanceArchitectureWorld(created,500,'automatic',{},undefined,createEventPolicyD2a(setting)),s=world.terrain.review.state;
  let checked=0;
  for(const r of s.history){
   const req=EVENT_REQUIREMENTS[r.kind];if(!req||!LEDGER_REQUIREMENTS.includes(req)||r.buildingId)continue;
   checked++;assert.ok(meetsRequirement(req,ledgerEventFactsAt(s.observation.sites,r.year-1)),`${setting}: ${r.kind} in ${r.year} without ${req}`);
  }
  assert.ok(checked>0,`${setting}: no ledger-required event to check`);
  for(const k of ['decline','abandon','rebirth'])assert.ok(!s.history.some(r=>r.kind===k),`${setting}: ${k} without an uninhabited district`);
 }
});

test('event policy: facts are read from the previous confirmed year; probabilities stay within 0..1', async () => {
 const world=await advanceArchitectureWorld((await createNewArchitectureWorld(6)).architecture,40,'automatic'),s=structuredClone(world.terrain.review.state);
 assert.throws(()=>confirmedEventFacts(s),/previous confirmed year/);// year not advanced: the ledger is at the same year
 s.year++;const f=confirmedEventFacts(s);assert.equal(f.ledgerYear,40);
 for(const food of [0,30,50,100])for(const cohesion of [0,45,100])for(const drought of [0,1,3])for(const epidemic of [0,2]){
  const t={...s,food,cohesion,drought,epidemic,lastKind:{flood:s.year-1}};
  for(const p of Object.values(DRAW_PROBABILITY)){const v=p(t);assert.ok(v>=0&&v<=1,String(v));}
 }
});
