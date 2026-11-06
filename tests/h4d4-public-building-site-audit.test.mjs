/**
 * H4-D4: 大型公共建築の敷地「設計監査」。生産コードに候補を追加しない。
 * 既存hallを仮に置換した場合の地形・施設・住宅との衝突を記録する。
 * 明示的な改修史・建設許可がないので、たとえ土地が空いても決して建設可とはしない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {snapshotAt} from '../dist/scene/model.js';
import {housingAt} from '../dist/story/housing-history.js';
import {existingGround,findHousingGroundConflicts,isUnoccupiedGround} from '../dist/scene/housing-ground.js';

const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&
 a.y<b.y+b.depth&&b.y<a.y+a.depth;

test('H4-D4 実際の河畔集会所位置でA/B大型敷地を監査し、勝手な建設を認めない',async()=>{
 const seed=42,year=958,siteId='river-bank';
 const state=createHousingCivilization(seed);
 for(let y=1;y<=year;y++){
  step(state);
  if(state.pending)chooseAutomatically(state);
 }
 const serialized=serializeHousingSave(state);
 const before=JSON.stringify(state);
 const snapshot=snapshotAt(state,year,0);
 assert.ok(Number.isInteger(snapshot.visual?.scale),'自然進行の規模分類は履歴に由来する');
 const hall=snapshot.objects.find(o=>o.kind==='hall');
 assert.ok(hall,'確定済みhallが存在すること');
 const houses=housingAt(state.housing,year,siteId);
 assert.equal(houses.status,'known');
 const plots=houses.blocks.map(b=>b.footprint);
 const unrelated=snapshot.objects.filter(o=>o.id!==hall.id);
 // 「既存hallを仮に置換する」試算：元hallの固定18x7を、
 // 建設イベントもなく勝手に置き換えて良いという意味ではない。
 const variants=[
  {id:'A-great-hall-hypothesis',x:hall.x-22,y:hall.y-18,width:44,depth:22},
  {id:'B-courtyard-hypothesis',x:hall.x-28,y:hall.y-22,width:56,depth:30},
 ];
 const report=[];
 for(const {id,...footprint} of variants){
  const housingCollisionIds=houses.blocks.filter(b=>overlap(footprint,b.footprint)).map(b=>b.blockId);
  const terrainAndFacility=findHousingGroundConflicts(
   [{blockId:'H4-D4-DESIGN-ONLY-'+id,footprint}],unrelated,0);
  const unoccupied=isUnoccupiedGround(footprint,plots,unrelated,0);
  assert.equal(unoccupied,
   housingCollisionIds.length===0&&terrainAndFacility.length===0,
   '保守的な安全判定と衝突の根拠が一致');
  // 今回は保存スキーマ・土地利用・建築史が無いため建設許可は常にHOLD。
  report.push({
   id,footprint,
   originalHallId:hall.id,
   originalHallGround:existingGround(hall),
   observedScale:snapshot.visual?.scale,
   housingCollisionIds,
   terrainAndFacility,
   geometryResult:unoccupied?'GEOMETRY_SCREEN_CLEAR_ONLY':'GEOMETRY_CONFLICT',
   constructionResult:'HOLD_NO_CONFIRMED_CONSTRUCTION_OR_RENOVATION',
   footprintProvisional:true,
  });
 }
 // 仮説は既存hallの18x7より大きい。既存建物の面積を変更してはならない。
 const original=existingGround(hall);
 assert.ok(report.every(r=>r.footprint.width*r.footprint.depth>original.width*original.depth));
 assert.deepEqual(snapshot.objects.find(o=>o.id===hall.id),hall);
 const after=snapshotAt(parseHousingSave(serialized),year,0);
 assert.deepEqual(after,snapshot,'監査・保存往復で過去の景色を変更しない');
 assert.equal(JSON.stringify(state),before,'監査でゲームの状態を変更しない');
 const result={
  scope:'H4-D4 DESIGN AUDIT ONLY; not a permit or new building',
  source:{seed,year,site:siteId,hall:{id:hall.id,kind:hall.kind,builtYear:hall.builtYear,
   condition:hall.condition,x:hall.x,y:hall.y},housingBlockCount:houses.blocks.length,
   facilityCount:snapshot.objects.length},
  candidateDefinitions:'Hypothetical rectangles centered on real hall; not a selected site',
  note:'Excluding original hall tests hypothetical replacement only. It does NOT authorize deletion, expansion, or alteration of the hall.',
  variants:report,
 };
 await mkdir('artifacts/h4d4-site-audit',{recursive:true});
 await writeFile('artifacts/h4d4-site-audit/report.json',JSON.stringify(result,null,2));
 console.log('H4-D4-SITE-AUDIT '+JSON.stringify(result));
});
