import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {siteAt,fixedFacilityLotReservations} from '../dist/story/settlement-history.js';
import {housingAt} from '../dist/story/housing-history.js';
import {isUnoccupiedGround,existingGround} from '../dist/scene/housing-ground.js';
import {snapshotAt} from '../dist/scene/model.js';
import {composeScene} from '../dist/scene/composition.js';

function advance(s,to){
 while(s.year<to){step(s);if(s.pending)chooseAutomatically(s);}
}
test('H4-D5: 実歴史を使う公共建築の複数候補地・河川/住宅の非衝突・保存再開を監査',async()=>{
 const report=[];
 for(const seed of [7,42,82]){
  const state=createHousingCivilization(seed);
  advance(state,1000);
  const restored=parseHousingSave(serializeHousingSave(state));
  advance(state,2000);
  advance(restored,2000);
  assert.deepEqual(restored,state,'1,000年目の保存・再開から同じ文明を再生できる');
  const buildings=siteAt(state.observation.sites,0,2000).buildings.filter(b=>b.civic);
  const created=state.history.filter(e=>e.kind==='building-built'&&e.buildingId?.startsWith('civic-'));
  assert.equal(buildings.length,created.length);
  const spots=[];
  for(const b of buildings){
   const first=siteAt(state.observation.sites,0,b.builtYear);
   const previous=siteAt(state.observation.sites,0,b.builtYear-1);
   assert.ok(!previous.buildings.some(x=>x.id===b.id),'建設前に施設は出現しない');
   assert.equal(first.buildings.filter(x=>x.id===b.id).length,1);
   const f=b.civic.footprint;
   // 未来の固定施設はまだ実在しない。土地の予約は建設履歴ではなく
   // 後年の市場や工房を不意に建設不能にしないための保守的な制約。
   const intersects=(a,c)=>a.x<c.x+c.width&&c.x<a.x+a.width&&
    a.y<c.y+c.depth&&c.y<a.y+a.depth;
   for(const lot of fixedFacilityLotReservations(0)){
    const reserved=existingGround({...lot,builtYear:0,condition:'intact'});
    assert.equal(intersects(f,reserved),false,
     '大型施設が固定区画の将来の仕事場・市場等を占有してはならない: '+lot.id);
   }
   assert.equal(isUnoccupiedGround(
    f,
    housingAt(state.housing,b.builtYear,'river-bank').blocks.map(x=>x.footprint),
    first.buildings.filter(x=>x.id!==b.id),
    0,
   ),true,'建設年の河川/住宅/既存施設に重なる候補は建てられない');
   const scene=composeScene(snapshotAt(state,b.builtYear,0),state.housing);
   assert.deepEqual(scene.structures.find(x=>x.id===b.id).civicFootprint,f);
   spots.push({id:b.id,year:b.builtYear,style:b.civic.architectureStyle,
    footprint:f,constructionRecordId:b.civic.constructionRecordId});
  }
  report.push({seed,civic:spots,housingAt2000:housingAt(state.housing,2000,'river-bank').blocks.length,
   cityScaleAt2000:snapshotAt(state,2000,0).visual?.scale});
 }
 const positions=report.flatMap(x=>x.civic.map(b=>b.footprint.x+','+b.footprint.y));
 assert.ok(positions.length>=2,'自然建設が成立するケースを複数含める');
 assert.ok(new Set(positions).size>=2,
  '複数の異なる文明が同じ一地点に集中するなら、配置選定を見直す');
 await mkdir('artifacts/h4d5-siting',{recursive:true});
 await writeFile('artifacts/h4d5-siting/natural-placement.json',JSON.stringify({
  description:'H4-D5: Confirmed civic construction, not hypothetical preview placements',
  source:'seed7/42/82 at 2000 years, including save/reload after 1000 years',
  report,
 },null,2));
 console.log('H4-D5-NATURAL-PLACEMENTS '+JSON.stringify(report));
});
