import test from 'node:test';
import assert from 'node:assert/strict';
import {housingAt} from '../dist/story/housing-history.js';
import {composeScene} from '../dist/scene/composition.js';
const block=(id,year,x,y,count=2)=>({
 blockId:id,siteId:'river-bank',footprint:{x,y,width:27,depth:12},
 builtYear:year,housingCount:count,condition:'sound',use:'occupied',
 styleId:'terraced',styleSeed:42,
});
const event=(year,kind,b,seq=0)=>({year,seq,kind,blockId:b.blockId,after:b});
const a=block('res-1',20,15,102,2),b=block('res-2',110,73,114,7);
const history={introducedYear:0,legacyUntracked:false,events:[
 event(20,'built',a),
 event(110,'built',b),
 event(150,'expanded',{...a,housingCount:4}),
 event(180,'underused',{...a,housingCount:4,use:'underused'}),
 event(200,'ruined',{...a,housingCount:4,condition:'ruined',use:'vacant'}),
 event(215,'repaired',{...a,housingCount:4,condition:'sound',use:'vacant'}),
 event(220,'reused',{...a,housingCount:4,condition:'sound',use:'occupied'}),
]};
const snapshot=(year)=>({year,population:6000,phase:'fixture',atmosphere:'',
 sceneEvent:null,eventYear:null,scars:[],local:{index:0,population:6000},
 objects:[{id:'existing-house',kind:'house',x:55,y:114,builtYear:0,condition:'intact'}],
 visual:{scale:3,trend:'stable',roadLevel:3,squareLevel:3,riversideLevel:3,
 activityLevel:3,densityLevel:3,heightLevel:3}});
test('住宅街区は過去時点のID・敷地・建設年が変わらない',()=>{
 const original=JSON.stringify(history);
 const y150=housingAt(history,150);
 assert.equal(y150.blocks[0].housingCount,4);
 assert.equal(y150.blocks[0].builtYear,20);
 assert.equal(housingAt(history,100).blocks.length,1);
 assert.equal(housingAt(history,205).blocks[0].condition,'ruined');
 assert.equal(housingAt(history,205).blocks[0].use,'vacant');
 assert.equal(housingAt(history,220).blocks[0].condition,'sound');
 assert.equal(housingAt(history,220).blocks[0].builtYear,20);
 assert.deepEqual(housingAt(JSON.parse(JSON.stringify(history)),150),y150);
 assert.equal(JSON.stringify(history),original);
});
test('未記録の旧セーブと記録済みゼロは異なる',()=>{
 assert.equal(housingAt(undefined,10).status,'unknown');
 assert.equal(housingAt({introducedYear:300,legacyUntracked:true,events:[]},200).status,'unknown');
 assert.equal(housingAt({introducedYear:300,legacyUntracked:true,events:[]},301).status,'partial');
 assert.deepEqual(housingAt({introducedYear:0,legacyUntracked:false,events:[]},200),{status:'known',blocks:[]});
});
test('廃墟化は利用状態も原子的にvacantへ変更する',()=>{
 const invalid={introducedYear:0,legacyUntracked:false,events:[
  event(20,'built',a),event(30,'ruined',{...a,condition:'ruined',use:'occupied'})
 ]};
 assert.throws(()=>housingAt(invalid,30),/廃墟/);
 const badReuse={introducedYear:0,legacyUntracked:false,events:[
  event(20,'built',a),event(30,'vacated',{...a,use:'vacant'}),
  event(31,'damaged',{...a,use:'vacant',condition:'damaged'}),
  event(32,'reused',{...a,use:'occupied',condition:'damaged'}),
 ]};
 assert.throws(()=>housingAt(badReuse,32),/再利用/);
});
test('住宅敷地が物理的に重複した建設イベントは拒否する',()=>{
 const overlap=block('overlap',35,20,104);
 assert.throws(()=>housingAt({introducedYear:0,legacyUntracked:false,events:[
  event(20,'built',a),event(35,'built',overlap)]},35),/重複/);
});
test('同じ確定履歴なら住宅表示の深度・部品が一致し施設は増えない',()=>{
 const before=JSON.stringify(history),snap=JSON.stringify(snapshot(150));
 const first=composeScene(snapshot(150),history);
 assert.deepEqual(composeScene(snapshot(150),history),first);
 assert.equal(JSON.stringify(history),before);
 assert.equal(JSON.stringify(snapshot(150)),snap);
 assert.equal(first.structures.length,1);
 assert.equal(first.housingStatus,'known');
 assert.equal(first.residentialBlocks.length,2);
 assert.ok(first.residentialBlocks.some(x=>x.roofPartCount<x.housingCount));
 for(const b of first.residentialBlocks){
  assert.equal(b.roofParts.reduce((n,p)=>n+p.representedUnits,0),b.housingCount);
  assert.ok(b.roofPartCount<=b.slotCapacity);
  assert.ok(b.roofPartCount<=b.housingCount);
 }
 const later=composeScene(snapshot(220),history);
 assert.deepEqual(composeScene(snapshot(150),history),first);
 assert.equal(later.residentialBlocks[0].builtYear,20);
});
