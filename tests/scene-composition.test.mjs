import test from 'node:test';
import assert from 'node:assert/strict';
import {composeScene} from '../dist/scene/composition.js';
import {snapshotAt} from '../dist/scene/model.js';
import {createCivilization,step,chooseAutomatically} from '../dist/story/engine.js';
const base={
 year:50,population:1200,phase:'fixture',atmosphere:'',sceneEvent:null,eventYear:null,scars:[],
 local:{index:0,population:1200},
 visual:{scale:3,trend:'contracting',roadLevel:3,squareLevel:3,riversideLevel:3,activityLevel:1,densityLevel:3,heightLevel:3}
};
const house={id:'old-home',kind:'house',x:55,y:114,builtYear:3,condition:'intact'};
test('composition respects authoritative buildings even at city scale',()=>{
 const snapshot={...base,objects:[house]};
 const result=composeScene(snapshot);
 assert.deepEqual(result.structures.map(o=>o.id),['old-home']);
 assert.equal(result.riverUse,'natural');
 assert.equal(result.blocks.length,1);
 assert.deepEqual([result.structures[0].x,result.structures[0].builtYear],[55,3]);
});
test('damaged, ruined and recycled footprints remain at their old coordinates',()=>{
 const past=composeScene({...base,objects:[house]});
 const ruined=composeScene({...base,year:80,visual:{...base.visual,scale:1},objects:[{...house,condition:'ruined'}]});
 const repaired=composeScene({...base,year:95,visual:{...base.visual,scale:1},objects:[{...house,condition:'intact'}]});
 assert.deepEqual([past.structures[0].x,ruined.structures[0].x,repaired.structures[0].x],[55,55,55]);
 assert.equal(ruined.blocks[0].treatment,'overgrown');
 assert.equal(repaired.blocks[0].treatment,'path');
 assert.equal(ruined.structures[0].builtYear,3);
});
test('only an actual usable market or workshop enables working river bank',()=>{
 const market={...house,id:'trade',kind:'market',x:256,y:109};
 assert.equal(composeScene({...base,objects:[house,market]}).riverUse,'working');
 assert.equal(composeScene({...base,objects:[house,{...market,condition:'ruined'}]}).riverUse,'natural');
});
test('confirmed past composition is pure and identical after a millennium and JSON restoration',()=>{
 const s=createCivilization(42);
 const until=(n)=>{while(s.year<n){step(s);if(s.pending)chooseAutomatically(s);}};
 until(500);const before=JSON.stringify(s);
 const original=composeScene(snapshotAt(s,400,0));
 assert.equal(JSON.stringify(s),before);
 until(1300);
 assert.deepEqual(composeScene(snapshotAt(s,400,0)),original);
 assert.deepEqual(composeScene(snapshotAt(JSON.parse(JSON.stringify(s)),400,0)),original);
});
