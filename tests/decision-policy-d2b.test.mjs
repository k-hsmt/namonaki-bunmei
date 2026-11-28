import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionTemplatesV1} from '../dist/story/decision-templates-v1.js';
import {DECISION_CATALOG,DECISION_TIMING,ACTION_TENDENCY,checkDecisionCatalog,weightedIndex} from '../dist/story/decision-policy-d2b-review.js';
import {createReviewWorld,advanceReviewWorld,chooseReviewWorld,prepareReviewSave,restoreReviewSave} from '../dist/story/review-save-d2b.js';
import {prepareArchitectureSave} from '../dist/architecture/production-v1.js';
import {decodeWorldSave} from '../dist/story/world-storage.js';
import {metricsAt} from '../dist/story/observations.js';

// Issue #40 D2b: issue-based branches, the people's own choice and the review save (review-only).
const POLICY='hardship-linked+decisions-d2b';
const strip=s=>JSON.stringify({...s,history:s.history.map(r=>r.tag==='選択'?{...r,causes:[]}:r),decisions:s.decisions.map(d=>({...d,chooser:null}))});

test('decision catalog: one entry per template with stable ids; suspended templates give their reason', () => {
 checkDecisionCatalog();
 assert.equal(DECISION_CATALOG.length,decisionTemplatesV1.length);
 const ids=DECISION_CATALOG.flatMap(e=>[e.templateId,...e.actionIds]);assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual(DECISION_CATALOG.filter(e=>e.issue==='suspended').map(e=>e.templateId),['waterway-damage','festival-form','old-tree','fish-decline']);
 for(const e of DECISION_CATALOG)if(e.issue==='suspended')assert.ok(e.reason);
 for(const a of Object.keys(ACTION_TENDENCY))assert.ok(DECISION_CATALOG.some(e=>e.actionIds.includes(a)),a);
 assert.deepEqual([0,.2,.5,.99].map(d=>weightedIndex(d,[1,3])),[0,0,1,1]);
});

test('decisions: presented only when the issue arose the year before, with its records; intervals respected', async () => {
 let world=await createReviewWorld(6,POLICY);const seen=[];
 while(world.terrain.review.state.year<2500){
  world=await advanceReviewWorld(world,2500-world.terrain.review.state.year,'stop');const s=world.terrain.review.state;
  if(!s.pending)break;
  const p=s.pending,r=p.review,y=p.year-1,records=new Map(s.history.map(x=>[x.id,x]));
  assert.equal(r.ruleId,'civilization-decisions-d2b-review');assert.ok(DECISION_CATALOG.find(e=>e.templateId===r.templateId).issue!=='suspended');
  for(const id of r.sources)assert.equal(records.get(id)?.year,y,`${r.templateId} source ${id}`);
  const kinds=r.sources.map(id=>records.get(id));
  if(r.templateId==='visitors')assert.equal(kinds[0].kind,'arrival');
  if(r.templateId==='vacant-homes')assert.equal(kinds[0].kind,'housing-vacated');
  if(r.templateId==='bridge-lost')assert.deepEqual(kinds.map(k=>k.kind),['building-damaged','flood']);
  if(r.templateId==='scarce-stores')for(const k of kinds)assert.match(k.title,/の食糧不足が続く$/);
  if(r.templateId==='surplus'){const f=metricsAt(s.observation,y)[0],b=metricsAt(s.observation,y-1)[0];assert.ok(f>=70&&b<70);}
  assert.ok(r.weights.every(w=>w>=1&&w<=3)&&r.autonomousIndex>=0&&r.autonomousIndex<r.actionIds.length);
  seen.push({year:p.year,templateId:r.templateId});
  world=await chooseReviewWorld(world,'random');
 }
 assert.ok(seen.length>=5,`only ${seen.length} branches`);
 for(let i=1;i<seen.length;i++)assert.ok(seen[i].year-seen[i-1].year>=DECISION_TIMING.minimumGap);
 for(const a of seen)for(const b of seen)if(a!==b&&a.templateId===b.templateId&&a.year<b.year)assert.ok(b.year-a.year>=DECISION_TIMING.templateInterval);
 const s=world.terrain.review.state;
 assert.ok(s.decisions.every(d=>d.chooser==='people'&&d.templateId&&d.actionId));
 assert.ok(s.history.filter(r=>r.tag==='選択').every(r=>r.causes[0]==='人々の判断に委ねられた選択'));
});

test('decisions: the same action chosen by the observer or left to the people gives the same world (but the chooser)', async () => {
 const pending=await advanceReviewWorld(await createReviewWorld(6,POLICY),3000,'stop'),r=pending.terrain.review.state.pending.review;
 const people=await chooseReviewWorld(pending,'random'),observer=await chooseReviewWorld(pending,r.autonomousIndex);
 const a=people.terrain.review.state,b=observer.terrain.review.state;
 assert.equal(a.rngState,b.rngState);assert.equal(strip(a),strip(b));
 assert.equal(a.decisions.at(-1).chooser,'people');assert.equal(b.decisions.at(-1).chooser,'observer');
 // continuing gives the same history too
 const a2=(await advanceReviewWorld(people,300)).terrain.review.state,b2=(await advanceReviewWorld(observer,300)).terrain.review.state;
 assert.equal(strip(a2),strip(b2));
 // a different action is a different world
 const other=(r.autonomousIndex+1)%r.actionIds.length;
 assert.notEqual(strip((await chooseReviewWorld(pending,other)).terrain.review.state),strip(a));
});

test('review save: a pending branch saves and restores exactly; tampering and the production loader are rejected', async () => {
 const pending=await advanceReviewWorld(await createReviewWorld(4,POLICY),1500,'stop');
 assert.ok(pending.terrain.review.state.pending);
 const save=await prepareReviewSave(pending),json=JSON.stringify(save);
 assert.equal(save.pending,true);assert.ok(json.length<2000,`${json.length} bytes`);
 const restored=await restoreReviewSave(JSON.parse(json));
 assert.equal(JSON.stringify(restored.terrain.review.state),JSON.stringify(pending.terrain.review.state));
 const after=await chooseReviewWorld(restored,1),direct=await chooseReviewWorld(pending,1);
 assert.equal(JSON.stringify(after.terrain.review.state),JSON.stringify(direct.terrain.review.state));
 // the restored world continues and saves again
 const later=await advanceReviewWorld(after,100);assert.equal((await prepareReviewSave(later)).operations.length,save.operations.length+2);
 await assert.rejects(restoreReviewSave({...save,historySha256:'0'.repeat(64)}),/differs from the saved one/);
 // another seed replays another history (an operation list that reaches the same history is the same history)
 await assert.rejects(restoreReviewSave({...save,seed:save.seed+1}),/does not reach|differs/);
 await assert.rejects(restoreReviewSave({...save,extra:1}),/unknown fields/);
 await assert.rejects(restoreReviewSave({...save,policy:'momentum'}),/unknown policy/);
 await assert.rejects(decodeWorldSave(json));
 await assert.rejects(prepareArchitectureSave(pending),/cannot be saved/);
});
