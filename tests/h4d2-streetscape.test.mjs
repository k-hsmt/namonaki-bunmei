import test from 'node:test';
import assert from 'node:assert/strict';
import {composeScene} from '../dist/scene/composition.js';
import {projectStreetscape} from '../dist/scene/streetscape.js';
import {isUnoccupiedGround} from '../dist/scene/housing-ground.js';

const block=(id,x,y=112,use='occupied')=>({
 blockId:id,siteId:'river-bank',
 footprint:{x,y,width:18,depth:8},builtYear:20,
 housingCount:3,condition:'sound',use,styleId:'low',styleSeed:42,
});
const history=blocks=>({introducedYear:0,legacyUntracked:false,events:
 blocks.map((b,i)=>({year:b.builtYear,seq:i,kind:'built',blockId:b.blockId,after:b}))});
const snapshot=(objects=[],siteIndex=0,scale=1)=>({
 year:100,phase:'fixture',population:3000,atmosphere:'',
 sceneEvent:null,eventYear:null,scars:[],objects,
 local:{index:siteIndex,population:3000},
 visual:{scale,trend:'stable',roadLevel:scale,squareLevel:scale,
  riversideLevel:scale,activityLevel:scale,densityLevel:scale,heightLevel:scale},
});
test('住宅の実在する近接街区間にだけ歩行の痕跡を描き、規模分類では変えない',()=>{
 const b1=block('a',15),b2=block('b',39),b3=block('c',90);
 const h=history([b1,b2,b3]);
 const town=composeScene(snapshot([],0,2),h);
 const city=composeScene(snapshot([],0,3),h);
 const marks=projectStreetscape(town,[]);
 assert.deepEqual(marks,[{kind:'lane',x:33,y:120,width:6,depth:2,anchors:['a','b']}]);
 assert.deepEqual(projectStreetscape(city,[]),marks);
 assert.deepEqual(h.events.map(e=>e.after.footprint),[b1,b2,b3].map(b=>b.footprint));
});
test('空き家・廃墟・河川・施設を介した通路を描かない',()=>{
 const occupied=block('a',15);
 const vacant=block('b',39,112,'vacant');
 assert.deepEqual(projectStreetscape(composeScene(snapshot(),history([occupied,vacant])),[]),[]);
 assert.equal(isUnoccupiedGround({x:138,y:119,width:6,depth:2},[],[],0),false);
 const facility={id:'work',kind:'workshop',x:36,y:124,builtYear:5,condition:'intact'};
 // 既存施設の地表が歩行表現に接する箇所を含むので、地表塗りを止める。
 const h=history([block('a',15),block('b',39)]);
 const marks=projectStreetscape(composeScene(snapshot([facility]),h),[facility]);
 assert.equal(marks.some(m=>m.kind==='lane'),false);
});
test('公共施設の前庭はその施設が存在している時だけ／他地点はHOLD',()=>{
 const hall={id:'hall-existing',kind:'hall',x:90,y:120,builtYear:10,condition:'intact'};
 const alone=composeScene(snapshot([hall]),history([]));
 const marks=projectStreetscape(alone,[hall]);
 assert.deepEqual(marks,[{kind:'forecourt',x:81,y:124,width:18,depth:2,anchors:['hall-existing']}]);
 assert.deepEqual(projectStreetscape(composeScene(snapshot(),history([])),[]),[]);
 assert.deepEqual(projectStreetscape(composeScene(snapshot([{...hall,condition:'ruined'}]),history([])),[{...marks[0]}].filter(()=>false));
 assert.deepEqual(projectStreetscape(composeScene(snapshot([hall],1),history([])),[hall]),[]);
 assert.deepEqual(projectStreetscape(composeScene(snapshot([hall],2),history([])),[hall]),[]);
});
