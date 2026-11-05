import test from 'node:test';
import assert from 'node:assert/strict';
import {visualProfile,snapshotAt} from '../dist/scene/model.js';
import {createCivilization,step,chooseAutomatically} from '../dist/story/engine.js';

const house={id:'site-0',kind:'house',x:55,y:114,builtYear:0,condition:'intact'};
test('all four scales have differentiated ground, silhouette and density',()=>{
 const values=[0,1,2,3].map(scale=>visualProfile(scale,'stable',true,[house]));
 for(const key of ['roadLevel','squareLevel','riversideLevel','densityLevel','heightLevel']){
  assert.deepEqual(values.map(v=>v[key]),[0,1,2,3],key);
 }
});
test('presentation profiles never mutate input or fabricate a facility',()=>{
 const buildings=[{...house},{...house,id:'bridge-1',kind:'bridge',condition:'ruined'}];
 const original=JSON.stringify(buildings);
 const first=visualProfile(3,'contracting',true,buildings);
 assert.deepEqual(visualProfile(3,'contracting',true,buildings),first);
 assert.equal(JSON.stringify(buildings),original);
 assert.equal('buildings' in first,false);
 assert.equal(first.trend,'contracting');
});
test('abandoned landscape retains recorded site objects and suppresses activity',()=>{
 const profile=visualProfile(3,'stable',false,[{...house,condition:'ruined'}]);
 assert.equal(profile.activityLevel,0);
 assert.equal(profile.heightLevel,0);
 assert.equal(profile.roadLevel,0);
});
test('retrospective profiles are repeatable and never change a completed civilization',()=>{
 const s=createCivilization(42);
 while(s.year<650){step(s);if(s.pending)chooseAutomatically(s);}
 const before=JSON.stringify(s);
 const a=snapshotAt(s,500,0);
 assert.deepEqual(snapshotAt(s,500,0),a);
 assert.equal(JSON.stringify(s),before);
 const restored=JSON.parse(JSON.stringify(s));
 assert.deepEqual(snapshotAt(restored,500,0),a);
 const objects=a.objects.map(o=>[o.id,o.x,o.y,o.builtYear,o.condition]);
 assert.deepEqual(snapshotAt(restored,500,0).objects.map(o=>[o.id,o.x,o.y,o.builtYear,o.condition]),objects);
});
