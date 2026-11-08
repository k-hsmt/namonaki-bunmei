import test from 'node:test';import assert from 'node:assert/strict';
import {createNewWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {createGeneratedWorldSave,restoreGeneratedWorld,validateWorldSave} from '../dist/story/world-save.js';
import {generatedSession,slowWorldClimate,improveWorldEnvironment} from '../dist/story/world-session.js';
import {createEnvironment,calmClimateTarget} from '../dist/environment/progression-v1.js';
import {environmentStateAt} from '../dist/environment/history-v1.js';
import {climateFoliage} from '../dist/environment/landscape-v3.js';
const initial=createNewWorld(42).review;
test('500-year climate eras have one excursion, four near-neutral controls, varied climates and no annual jumps',()=>{
 const kinds=new Set();for(let seed=0;seed<40;seed++)for(let era=0;era<10;era++){
  const targets=Array.from({length:5},(_,i)=>calmClimateTarget(seed,era*500+i*100));
  for(const [i,t]of targets.entries()){if(i!==2)assert.ok(Math.abs(t.humidity)<=4&&Math.abs(t.temperature)<=4);else {assert.ok(Math.abs(t.humidity)>=48||Math.abs(t.temperature)>=32);kinds.add(Math.abs(t.humidity)>=48?t.humidity<0?'dry':'wet':t.temperature<0?'cold':'warm');}}
 }assert.equal(kinds.size,4);assert.throws(()=>calmClimateTarget(42,101));
 const w=advanceGeneratedBridgeReview(initial,1500,'automatic');let calm=0,changes=0,previous={humidity:0,temperature:0};
 for(let y=0;y<=1500;y++){const s=environmentStateAt(w.environment,w.vegetation,w.review,y);assert.ok(Math.abs(s.humidity-previous.humidity)<=1&&Math.abs(s.temperature-previous.temperature)<=1);if(y%2)assert.deepEqual([s.humidity,s.temperature],[previous.humidity,previous.temperature]);if(Math.abs(s.humidity)<20&&Math.abs(s.temperature)<25)calm++;else changes++;previous=s;}
 assert.ok(calm/1501>.70);assert.ok(changes>0);assert.equal(w.environment.ruleId,'environment-coupled-v2');
});
test('existing worlds keep all past ecology and opt in only at the next 100-year boundary; legacy continuation is retained',()=>{
 const legacy={...initial,environment:createEnvironment(initial.vegetation,initial.review),environmentAppearance:'landscape-v2'};
 const old=advanceGeneratedBridgeReview(legacy,237,'automatic'),before=createGeneratedWorldSave(old),session=generatedSession(old),next=slowWorldClimate(session),e=next.review.environment;
 assert.equal(e.climateStart,300);assert.equal(next.state,session.state);assert.equal(next.review.environmentAppearance,'landscape-v2');assert.equal(slowWorldClimate(next),next);
 for(const year of [0,1,99,100,200,237])assert.deepEqual(environmentStateAt(e,old.vegetation,old.review,year),environmentStateAt(old.environment,old.vegetation,old.review,year));
 assert.deepEqual(e.current,old.environment.current);assert.deepEqual(e.targets,old.environment.targets);assert.deepEqual(createGeneratedWorldSave(old),before);
 const a=advanceGeneratedBridgeReview(old,60,'automatic'),b=advanceGeneratedBridgeReview(next.review,60,'automatic');assert.deepEqual(a.environment.current,b.environment.current);
 const whole=advanceGeneratedBridgeReview(next.review,200,'automatic'),restored=restoreGeneratedWorld(JSON.parse(JSON.stringify(createGeneratedWorldSave(b)))),split=advanceGeneratedBridgeReview(restored,140,'automatic');assert.deepEqual(createGeneratedWorldSave(split),createGeneratedWorldSave(whole));
 assert.deepEqual(whole.review.state,advanceGeneratedBridgeReview(old,200,'automatic').review.state);assert.deepEqual(createGeneratedWorldSave(restoreGeneratedWorld(JSON.parse(JSON.stringify(before)))),before);
 assert.equal(createGeneratedWorldSave(improveWorldEnvironment(session).review).rendererId,'generated-scene-v5');
 for(const rendererId of ['generated-scene-v3','generated-scene-v4']){const wire={...before,rendererId};assert.equal(createGeneratedWorldSave(restoreGeneratedWorld(wire)).rendererId,rendererId);}
});
test('invalid climate policy boundaries cannot bypass snapshot validation',()=>{
 const save=createGeneratedWorldSave(advanceGeneratedBridgeReview(initial,120,'automatic'));
 for(const mutate of [e=>delete e.climateStart,e=>e.climateStart=-100,e=>e.climateStart=1,e=>e.climateStart=300,e=>e.ruleId='environment-coupled-v1']){const c=structuredClone(save);mutate(c.environment);assert.throws(()=>validateWorldSave(c));}
});
test('climate phenology distinguishes dormant cold branches, stressed dry leaves and lush wet foliage',()=>{
 assert.equal(climateFoliage(40,-32),'bare');assert.equal(climateFoliage(0,-16),'sparse');assert.equal(climateFoliage(-40,0),'sparse');assert.equal(climateFoliage(40,0),'lush');assert.equal(climateFoliage(0,0),'full');
});
