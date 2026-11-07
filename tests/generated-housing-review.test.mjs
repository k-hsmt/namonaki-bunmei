import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {parseTerrainRecord} from '../dist/terrain/terrain-record.js';
import {createGeneratedHousingReview,advanceGeneratedHousingReview,chooseGeneratedHousingReview} from '../dist/story/generated-housing-review.js';
import {housingAt} from '../dist/story/housing-history.js';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {reviewPhysicalPlot} from '../dist/terrain/ground-access-review.js';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically,lastObservedYear} from '../dist/story/engine.js';
const terrain=parseTerrainRecord(readFileSync(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8'));
const sites=['river-bank','hill-side','coast-inlet'];
const start=()=>{const x=createGeneratedHousingReview(terrain,'field-only');assert.equal(x.status,'review-only');return x;};
test('cached replay and repeated land HOLD retain the pinned uncached complete state',()=>{
 const saved=parseTerrainRecord(gunzipSync(readFileSync(new URL('./fixtures/terrain-record-v1-seed1.json.gz',import.meta.url))).toString());
 const initial=createGeneratedHousingReview(saved,'field-only');assert.equal(initial.status,'review-only');
 const result=advanceGeneratedHousingReview(initial,2000,'automatic');
 assert.equal(createHash('sha256').update(JSON.stringify(result.review.state)).digest('hex'),'c48ee9dae9481a7a315636245b1d8954f2c4e3432f92891f71ca426254c11764');
 assert.equal(result.review.diagnostics.holds['river-bank:housing:no-safe-plot'],3);
 const split=advanceGeneratedHousingReview(advanceGeneratedHousingReview(initial,1900,'automatic'),100,'automatic');
 assert.deepEqual(split,result);
});
test('three-district housing and later ordinary facilities keep disjoint immutable plots and recorded sources',()=>{
 const initial=start(),before=JSON.stringify(initial),later=advanceGeneratedHousingReview(initial,2000,'automatic'),{state,placements}=later.review;
 assert.equal(JSON.stringify(initial),before);assert.equal(state.year,2000);
 for(const site of sites){
  const blocks=housingAt(state.housing,2000,site).blocks;assert.ok(blocks.length>0,site);
  const plots=[...placements.filter(p=>p.site===site).map(p=>p.plot),...blocks.map(b=>b.footprint)];
  for(let i=0;i<plots.length;i++)for(let j=i+1;j<plots.length;j++){
   const a=plots[i],b=plots[j];assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y));
  }
  for(const b of blocks)assert.equal(reviewPhysicalPlot(decodeRecordPhysics(terrain.sites[site].physics),'housing',b.footprint).status,'clear');
 }
 const born=new Map(),seqs=new Set();
 for(const e of state.housing.events){
  const key=e.year+':'+e.seq;assert.ok(!seqs.has(key));seqs.add(key);
  assert.ok(state.history.some(r=>r.id===e.causeRecordId&&r.year===e.year&&r.buildingId===e.blockId));
  if(e.kind==='built'){
   born.set(e.blockId,e.after);assert.ok(!housingAt(state.housing,e.year-1).blocks.some(b=>b.blockId===e.blockId));
  }else{const first=born.get(e.blockId);for(const k of ['footprint','styleId','styleSeed','builtYear','siteId'])assert.deepEqual(e.after[k],first[k]);}
 }
 assert.deepEqual(state.publicSpaces.events,[]);
});
test('housing trial core values/RNG match existing engine and copy/resume is deterministic',()=>{
 const initial=start(),one=advanceGeneratedHousingReview(initial,500,'automatic');
 const half=advanceGeneratedHousingReview(initial,250,'automatic'),resumed=advanceGeneratedHousingReview(structuredClone(half),250,'automatic');assert.deepEqual(one,resumed);
 const baseline=createHousingCivilization(terrain.source.seed);while(baseline.year<500){step(baseline);if(baseline.pending)chooseAutomatically(baseline);}
 for(const key of ['rngState','population','food','cohesion','knowledge','exchange','culture','drought','epidemic'])assert.equal(one.review.state[key],baseline[key],key);
 assert.deepEqual(one.review.state.decisions,baseline.decisions);
});
test('pending boundary and unknown housing cannot be treated as vacant land',()=>{
 const initial=start(),pending=advanceGeneratedHousingReview(initial,300,'stop');assert.ok(pending.review.state.pending);
 const s=pending.review.state;assert.equal(lastObservedYear(s),s.year-1);
 assert.deepEqual(advanceGeneratedHousingReview(pending,20,'stop'),pending);
 const selected=chooseGeneratedHousingReview(pending,0);assert.equal(lastObservedYear(selected.review.state),s.year);
 const bad=structuredClone(initial);bad.review.state.housing.legacyUntracked=true;const before=JSON.stringify(bad);
 assert.throws(()=>advanceGeneratedHousingReview(bad,1),/known year-zero/);assert.equal(JSON.stringify(bad),before);
});
