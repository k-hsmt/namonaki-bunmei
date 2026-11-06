import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCivicApproaches} from '../dist/scene/civic-approach.js';
import {projectStreetscape} from '../dist/scene/streetscape.js';
import {composeScene} from '../dist/scene/composition.js';
import {isUnoccupiedGround} from '../dist/scene/housing-ground.js';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {snapshotAt} from '../dist/scene/model.js';

const civic={
 id:'civic-river-bank-40-courtyard-hall',kind:'hall',condition:'intact',
 x:252,y:161,builtYear:40,recordId:'40-assembly',
 civic:{architectureStyle:'courtyard-hall',
  footprint:{x:224,y:136,width:56,depth:30},
  constructionRecordId:'40-assembly'},
};
const residential={
 blockId:'occupied-home',builtYear:25,condition:'sound',use:'occupied',
 footprint:{x:285,y:141,width:18,depth:8},housingCount:3,
 roofPartCount:1,slotCapacity:1,roofParts:[],
};
const fixture=(overrides={})=>({
 siteIndex:0,year:100,housingStatus:'known',
 scale:2,residentialBlocks:[residential],...overrides,
});
const safe=(marks,buildings=[civic],blocks=[residential])=>marks.every(m=>
 isUnoccupiedGround(m,blocks.map(b=>b.footprint),buildings,0));

test('H4-D6: 正本の大型公共施設と現存住宅の間だけに合法な歩行痕が出る',()=>{
 const scene=fixture();
 const marks=projectCivicApproaches(scene,[civic]);
 assert.ok(marks.length>=1&&marks.length<=2);
 assert.ok(marks.every(m=>m.kind==='civic-approach'));
 assert.deepEqual([...new Set(marks.flatMap(m=>m.anchors))],
  [civic.id,residential.blockId]);
 assert.ok(safe(marks));
 assert.deepEqual(projectCivicApproaches(scene,[civic]),marks,'描画上の選択が決定的');
 assert.deepEqual(projectCivicApproaches(fixture({scale:3}),[civic]),marks,
  '人口・町/都市の分類だけで既存の歩行痕を変えない');
 assert.ok(projectStreetscape(scene,[civic]).some(m=>m.kind==='civic-approach'),
  '既存の街並み投影へ統合されている');
});
test('H4-D6: 廃墟・空き家・未知の住宅履歴・他地点には描かない',()=>{
 assert.deepEqual(projectCivicApproaches(fixture(),[]),[]);
 assert.deepEqual(projectCivicApproaches(fixture(),[{...civic,condition:'ruined'}]),[]);
 assert.deepEqual(projectCivicApproaches(fixture({housingStatus:'partial'}),[civic]),[]);
 assert.deepEqual(projectCivicApproaches(fixture({housingStatus:'unknown'}),[civic]),[]);
 assert.deepEqual(projectCivicApproaches(fixture({siteIndex:1}),[civic]),[]);
 assert.deepEqual(projectCivicApproaches(fixture({siteIndex:2}),[civic]),[]);
 assert.deepEqual(projectCivicApproaches(fixture({residentialBlocks:[{...residential,use:'vacant'}]}),[civic]),[]);
 assert.deepEqual(projectCivicApproaches(fixture({residentialBlocks:[{...residential,condition:'ruined'}]}),[civic]),[]);
 // 地形を跨ぐ距離の違う住宅を、架空の橋や長大な道で結ばない。
 assert.deepEqual(projectCivicApproaches(fixture({
  residentialBlocks:[{...residential,footprint:{x:5,y:120,width:18,depth:8}}],
 }),[civic]),[]);
});
test('H4-D6: 実際の自然文明でも追加施設と住宅だけをアンカーにする',()=>{
 const report=[];
 for(const seed of [7,42,82]){
  const state=createHousingCivilization(seed);
  while(state.year<2000){step(state);if(state.pending)chooseAutomatically(state);}
  const civic=state.observation.sites[0].view.buildings.find(b=>b.civic);
  assert.ok(civic);
  const year=civic.builtYear;
  const first=snapshotAt(state,year,0);
  const before=snapshotAt(state,year-1,0);
  const firstScene=composeScene(first,state.housing);
  const beforeScene=composeScene(before,state.housing);
  const marks=projectCivicApproaches(firstScene,first.objects);
  assert.deepEqual(projectCivicApproaches(beforeScene,before.objects),[],
   '新しい施設が存在しない建設前年に、施設を起点とする歩行痕を生成しない');
  assert.ok(marks.every(m=>{
   const [origin,target]=m.anchors;
   return first.objects.some(o=>o.id===origin&&o.civic)&&
     firstScene.residentialBlocks.some(b=>b.blockId===target&&b.use!=='vacant'&&b.condition!=='ruined');
  }));
  assert.ok(safe(marks,first.objects,firstScene.residentialBlocks));
  const saved=parseHousingSave(serializeHousingSave(state));
  const fromSave=snapshotAt(saved,year,0);
  assert.deepEqual(projectCivicApproaches(composeScene(fromSave,saved.housing),fromSave.objects),marks);
  const now=snapshotAt(state,2000,0);
  const nowScene=composeScene(now,state.housing);
  const future=projectCivicApproaches(nowScene,now.objects);
  assert.ok(safe(future,now.objects,nowScene.residentialBlocks));
  report.push({seed,year,style:civic.civic.architectureStyle,yearMarks:marks.length,
   yearSegments:marks.map(m=>({x:m.x,y:m.y,w:m.width,h:m.depth,anchors:m.anchors})),
   year2000Marks:future.length});
 }
 console.log('H4-D6-NATURAL-APPROACHES '+JSON.stringify(report));
 assert.ok(report.some(r=>r.yearMarks>0),
  '自然文明の原寸風景に歩行痕が成立しないなら景観改良の前提を再検討する');
});
