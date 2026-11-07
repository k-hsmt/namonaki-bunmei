import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTerrainRecord} from '../dist/terrain/terrain-record.js';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {reviewPhysicalPlot} from '../dist/terrain/ground-access-review.js';
import {createGeneratedFacilityReview,advanceGeneratedFacilityReview,chooseGeneratedFacilityReview} from '../dist/story/generated-facility-review.js';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically,lastObservedYear} from '../dist/story/engine.js';
import {siteAt} from '../dist/story/settlement-history.js';
const terrain=parseTerrainRecord(readFileSync(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8'));
const start=mode=>{const x=createGeneratedFacilityReview(terrain,mode);assert.equal(x.status,'review-only');return x;};
test('generated ordinary facilities use legal saved plots and source records through 2,000 years',()=>{
 const initial=start('field-only'),before=JSON.stringify(initial),past=['river-bank','hill-side','coast-inlet'].map((_,i)=>siteAt(initial.state.observation.sites,i,0));
 const result=advanceGeneratedFacilityReview(initial,2000,'automatic');assert.equal(result.state.year,2000);assert.equal(lastObservedYear(result.state),2000);
 assert.equal(JSON.stringify(initial),before);assert.ok(result.placements.length>initial.placements.length);
 const ids=new Set();
 for(const p of result.placements){
  assert.ok(!ids.has(p.objectId));ids.add(p.objectId);
  assert.equal(reviewPhysicalPlot(decodeRecordPhysics(terrain.sites[p.site].physics),p.kind,p.plot).status,'clear');
  assert.ok(result.state.history.some(r=>r.id===p.sourceRecordId&&r.year===p.builtYear));
  for(const q of result.placements)if(q!==p&&q.site===p.site)assert.ok(!(p.plot.x<q.plot.x+q.plot.width&&p.plot.x+p.plot.width>q.plot.x&&p.plot.y<q.plot.y+q.plot.depth&&p.plot.y+p.plot.depth>q.plot.y));
 }
 for(let i=0;i<3;i++)assert.deepEqual(siteAt(result.state.observation.sites,i,0),past[i]);
 assert.deepEqual(result.state.housing.events,[]);assert.deepEqual(result.state.publicSpaces.events,[]);
});
test('land proposals do not change direct civilization values, RNG or hazard series',()=>{
 const generated=advanceGeneratedFacilityReview(start('none'),500,'automatic'),baseline=createHousingCivilization(terrain.source.seed);
 while(baseline.year<500){step(baseline);if(baseline.pending)chooseAutomatically(baseline);}
 for(const key of ['rngState','population','food','cohesion','knowledge','exchange','culture','drought','epidemic'])assert.equal(generated.state[key],baseline[key],key);
 assert.deepEqual(generated.state.decisions,baseline.decisions);
 const hazards=s=>s.history.filter(r=>['flood','fire','storm','earthquake'].includes(r.kind)).map(r=>[r.year,r.kind,r.title]);
 assert.deepEqual(hazards(generated.state),hazards(baseline));
});
test('splitting a trial at a save-like copy keeps progression, placements and diagnostics exact',()=>{
 const initial=start('wide'),one=advanceGeneratedFacilityReview(initial,500,'automatic');
 const midpoint=advanceGeneratedFacilityReview(initial,250,'automatic');
 const resumed=advanceGeneratedFacilityReview(structuredClone(midpoint),250,'automatic');assert.deepEqual(resumed,one);
 assert.deepEqual(advanceGeneratedFacilityReview(initial,0,'automatic'),initial);
});
test('pending trials stop at the confirmed boundary and manual choices commit the same year once',()=>{
 const pending=advanceGeneratedFacilityReview(start('field-only'),300,'stop');assert.ok(pending.state.pending);
 const year=pending.state.year,confirmed=lastObservedYear(pending.state);
 assert.equal(confirmed,year-1);assert.deepEqual(advanceGeneratedFacilityReview(pending,20,'stop'),pending);
 assert.deepEqual(advanceGeneratedFacilityReview(pending,0,'automatic'),pending);
 const chosen=chooseGeneratedFacilityReview(pending,0);assert.equal(chosen.state.year,year);assert.equal(lastObservedYear(chosen.state),year);assert.equal(chosen.state.pending,null);
 assert.equal(pending.state.pending.year,year);
 assert.throws(()=>chooseGeneratedFacilityReview(pending,999));
});
test('a land HOLD keeps the logical head slot and retries without consuming lastWork',()=>{
 const state=createHousingCivilization(42),attempts=[];
 const land={mode:'generated-review-only',placeFacility(s,i,candidate){
  if(i===0)attempts.push({year:s.year,id:candidate.id,lastWork:s.observation.sites[i].lastWork});
  assert.ok(Object.isFrozen(candidate));return {status:'hold'};
 },afterFacilities(){}};
 for(let i=0;i<20;i++){step(state,land);if(state.pending)chooseAutomatically(state,land);}
 assert.ok(attempts.length>=2);assert.ok(attempts.every(a=>a.id==='river-bank-1'));
 assert.ok(attempts.some((a,i)=>i>0&&a.year===attempts[i-1].year+1&&a.lastWork===attempts[i-1].lastWork));
 assert.ok(!state.history.some(r=>r.kind==='building-built'));
});
