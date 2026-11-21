/** Issue #29 S1: the confirmed civilization-wide metric history and its single read contract (D0 §3, §4, §10 S1). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCivilization,advance,step,choose,chooseAutomatically,clone,lastObservedYear} from '../dist/story/engine.js';
import {commitObservation,metricsAt,observationAt} from '../dist/story/observations.js';
import {observeCivilizationMetrics,civilizationMetricKeys} from '../dist/story/civilization-metrics.js';
import {validateGeneratedState} from '../dist/story/generated-state-review.js';
import {createNewWorld,createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {advanceWorldSessionAsync,chooseWorldSessionAsync,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {parseWorldSaveAsync,serializeWorldSave} from '../dist/story/world-save.js';
import {validateClimateWorldSave,OutdatedWorldSaveError} from '../dist/climate/climate-world-v1.js';
import {assertConfirmedMetricHistory} from './helpers/civilization-metrics.mjs';

const values=s=>[s.food,s.cohesion,s.knowledge,s.culture];
/** Steps a plain civilization until a choice is pending (deterministic for a seed). */
function untilPending(seed,limit=3000){
 const s=createCivilization(seed);
 for(let i=0;i<limit&&!s.pending;i++)step(s);
 assert.ok(s.pending,'seed '+seed+' reaches a choice');
 return s;
}

test('S1: a new civilization records year 0 and one row per confirmed year, synchronized with the population blocks',()=>{
 const s=createCivilization(42);
 assert.deepEqual(s.observation.metrics,{ruleId:'civilization-metrics-v1',firstYear:0,values:[values(s)]});
 assert.deepEqual(observeCivilizationMetrics(s,0),{year:0,population:s.population,food:s.food,cohesion:s.cohesion,knowledge:s.knowledge,culture:s.culture});
 for(let i=0;i<400;i++){
  if(s.pending)chooseAutomatically(s);else step(s);
  const year=lastObservedYear(s);
  assert.equal(s.observation.metrics.values.length,year+1,'year '+year);
  assert.equal(s.observation.lastYear,year);
  if(!s.pending)assert.deepEqual(metricsAt(s.observation,year),values(s));
 }
 for(const y of [0,1,57,lastObservedYear(s)]){
  const o=observeCivilizationMetrics(s,y);
  assert.equal(o.population,observationAt(s.observation,y).population,'population is the existing confirmed ledger');
  assert.deepEqual(Object.keys(o),['year',...civilizationMetricKeys]);
  for(const k of civilizationMetricKeys.slice(1))assert.ok(o[k]>=0&&o[k]<=100&&Number.isFinite(o[k]));
 }
});

test('S1: a pending year has no row; the choice confirms it once, the same for manual, automatic and restored choices',()=>{
 const s=untilPending(7),year=s.year,confirmed=lastObservedYear(s);
 assert.equal(confirmed,year-1);
 assert.equal(s.observation.metrics.values.length,year,'no slot for the pending year');
 assert.equal(observeCivilizationMetrics(s,year),null,'the pending year is not observable');
 assert.equal(observeCivilizationMetrics(s,year+1),null);
 const before=observeCivilizationMetrics(s,confirmed);
 assert.ok(before);
 // The pending state already holds draft values; the observation must still be the last confirmed row.
 assert.deepEqual([before.food,before.cohesion,before.knowledge,before.culture],s.observation.metrics.values.at(-1));
 const index=s.pending.options.length-1;
 const manual=choose(clone(s),index,'manual'),auto=choose(clone(s),index,'auto');
 const restored=choose(JSON.parse(JSON.stringify(s)),index,'manual');
 for(const after of [manual,auto,restored]){
  assert.equal(after.pending,null);assert.equal(lastObservedYear(after),year);
  assert.equal(after.observation.metrics.values.length,year+1,'confirmed exactly once');
  assert.deepEqual(after.observation.metrics.values.at(-1),values(after));
  assert.deepEqual(after.observation.metrics.values.slice(0,year),s.observation.metrics.values,'earlier years unchanged');
 }
 assert.deepEqual(auto.observation.metrics,manual.observation.metrics);
 assert.deepEqual(restored,manual);
 assert.throws(()=>choose(manual,0),/No choice pending/);
 assert.equal(manual.observation.metrics.values.length,year+1);
});

test('S1: whole and split advancing give the same confirmed history',()=>{
 const whole=advance(createCivilization(11),600);
 const split=createCivilization(11);advance(split,250);advance(JSON.parse(JSON.stringify(split)),0);advance(split,350);
 assert.deepEqual(split.observation.metrics,whole.observation.metrics);
 assert.deepEqual(split,whole);
});

test('S1: the read contract refuses future, unconfirmed and invalid years and never back-fills',()=>{
 const s=advance(createCivilization(3),40),last=lastObservedYear(s);
 for(const bad of [-1,last+1,1.5,NaN,Infinity,'3',null,undefined])assert.equal(observeCivilizationMetrics(s,bad),null,String(bad));
 // A ledger without a metric history (written before Issue #29) is unrecorded, not estimated from the live state.
 const unrecorded=clone(s);delete unrecorded.observation.metrics;
 assert.equal(observeCivilizationMetrics(unrecorded,last),null);
 // A damaged history is an error, not a silently repaired value.
 const damaged=clone(s);damaged.observation.metrics.values.pop();
 assert.throws(()=>observeCivilizationMetrics(damaged,0),/Metric history disagrees/);
});

test('S1: commitObservation checks the year and the four values before writing anything',()=>{
 const s=createCivilization(5),ledger=s.observation;
 const snapshot=()=>JSON.stringify(ledger);
 const good=[50,50,50,50];
 for(const [year,metrics] of [[0,good],[2,good],[-1,good],[1,[50,50,50]],[1,[50,50,50,50,50]],[1,[NaN,1,1,1]],[1,[1,Infinity,1,1]],[1,[1,1,-0.1,1]],[1,[1,1,1,100.5]],[1,['1',1,1,1]],[1,undefined]]){
  const before=snapshot();
  assert.throws(()=>commitObservation(ledger,year,metrics),String(year)+' '+JSON.stringify(metrics));
  assert.equal(snapshot(),before,'a rejected year leaves the ledger unchanged');
 }
 // A history that is already out of step with the population is refused too.
 const broken=clone(s);broken.observation.metrics.values.push([1,1,1,1]);
 assert.throws(()=>commitObservation(broken.observation,1,good),/Metric history is out of sequence/);
 commitObservation(ledger,1,good);
 assert.deepEqual(ledger.metrics.values.at(-1),good);assert.equal(ledger.lastYear,1);
});

test('S1: the generated state reader requires the complete history and rejects every malformed or inconsistent form',()=>{
 const review=advanceGeneratedBridgeReview(createNewWorld(42).review,120,'automatic').review,state=review.state,seed=state.seed;
 assertConfirmedMetricHistory(state);
 const valid=validateGeneratedState(JSON.parse(JSON.stringify(state)),seed);
 assert.deepEqual(valid.observation.metrics,state.observation.metrics);
 const last=state.observation.metrics.values.length-1;
 const variants={
  missing:s=>{delete s.observation.metrics;},
  nullHistory:s=>{s.observation.metrics=null;},
  rule:s=>{s.observation.metrics.ruleId='civilization-metrics-v2';},
  firstYear:s=>{s.observation.metrics.firstYear=1;},
  extraField:s=>{s.observation.metrics.note='x';},
  missingYear:s=>{s.observation.metrics.values.splice(10,1);},
  futureYear:s=>{s.observation.metrics.values.push([...s.observation.metrics.values.at(-1)]);},
  emptyHistory:s=>{s.observation.metrics.values=[];},
  shortRow:s=>{s.observation.metrics.values[3].pop();},
  longRow:s=>{s.observation.metrics.values[3].push(1);},
  nullValue:s=>{s.observation.metrics.values[3][0]=null;},
  stringValue:s=>{s.observation.metrics.values[3][1]='50';},
  belowRange:s=>{s.observation.metrics.values[3][2]=-1;},
  aboveRange:s=>{s.observation.metrics.values[3][3]=100.01;},
  objectRow:s=>{s.observation.metrics.values[3]={0:1,1:1,2:1,3:1,length:4};},
  lastRowDisagrees:s=>{s.observation.metrics.values[last][0]=s.food===0?1:0;},
  stateDisagrees:s=>{s.culture=s.culture===100?99:s.culture+1;},
 };
 for(const [name,change] of Object.entries(variants)){
  const raw=JSON.parse(JSON.stringify(state));change(raw);
  assert.throws(()=>validateGeneratedState(raw,seed),Error,name);
 }
 // This layer checks shape and the last confirmed year; an earlier row edited to another in-range value passes here
 // unchanged (never repaired) and is rejected by the production save's replay commitment (see the v10 test below).
 const edited=JSON.parse(JSON.stringify(state));edited.observation.metrics.values[5][0]=edited.observation.metrics.values[5][0]===0?1:0;
 assert.deepEqual(validateGeneratedState(edited,seed).observation.metrics.values[5],edited.observation.metrics.values[5]);
});

test('S1: the v10 save carries the history through save, restore and further years, including a pending choice',async()=>{
 let world=await createNewArchitectureWorld(42);
 for(let i=0;i<400&&!world.state.pending;i++)world=await advanceWorldSessionAsync(world,36);
 assert.ok(world.state.pending,'saved while a choice is pending');
 assertConfirmedMetricHistory(world.state);
 assert.equal(world.state.observation.metrics.values.length,world.state.year,'the pending year has no row in the save');
 const packet=await prepareWorldSessionSave(world);
 assert.equal(packet.version,10);assert.equal(packet.schemaVersion,3);
 const restored=restoreWorldSession(await parseWorldSaveAsync(serializeWorldSave(packet)));
 assert.deepEqual(restored.state.observation.metrics,world.state.observation.metrics);
 const year=lastObservedYear(world.state);
 assert.deepEqual(observeCivilizationMetrics(restored.state,year),observeCivilizationMetrics(world.state,year));
 const next=async w=>w.state.pending?chooseWorldSessionAsync(w,0):advanceWorldSessionAsync(w,36);
 const a=await next(world),b=await next(restored);
 assert.deepEqual(b.state,a.state,'resuming from the save continues the same history');
 assertConfirmedMetricHistory(a.state);
 // A save from before the metric history (v10 schemaVersion 2) is reported as an earlier version, not back-filled.
 const old=JSON.parse(serializeWorldSave(packet));old.schemaVersion=2;
 await assert.rejects(validateClimateWorldSave(old),OutdatedWorldSaveError);
 const stripped=JSON.parse(serializeWorldSave(packet));
 const visit=o=>{if(!o||typeof o!=='object')return 0;let n=0;if(o.observation?.metrics){delete o.observation.metrics;n++;}for(const v of Object.values(o))n+=visit(v);return n;};
 assert.ok(visit(stripped)>0);
 await assert.rejects(validateClimateWorldSave(stripped),'a current save without the history is refused');
 // An earlier confirmed year changed to another in-range value is caught by the replay commitment of the save.
 const tampered=JSON.parse(serializeWorldSave(packet));let edits=0;
 const tamper=o=>{if(!o||typeof o!=='object')return;const m=o.observation?.metrics;if(m&&m.values.length>6){m.values[5][0]=m.values[5][0]===0?1:0;edits++;}for(const v of Object.values(o))tamper(v);};
 tamper(tampered);assert.ok(edits>0);
 await assert.rejects(validateClimateWorldSave(tampered));
});
