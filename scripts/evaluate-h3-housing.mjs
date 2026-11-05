/**
 * H3-C 長期再現性・敷地安全性・保存サイズの観測スクリプト。
 * npm run build 後に実行。結果をJSON行で記録し、破綻した不変条件のみ失敗とする。
 * 各閾値は承認済みバランスではないため、頻度・容量・処理時間は観測値として残す。
 */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {chooseAutomatically,step,lastObservedYear} from '../dist/story/engine.js';
import {housingAt} from '../dist/story/housing-history.js';
import {findHousingGroundConflicts} from '../dist/scene/housing-ground.js';
import {snapshotAt} from '../dist/scene/model.js';
import {composeScene} from '../dist/scene/composition.js';

const siteIds=['river-bank','hill-side','coast-inlet'];
const rounds=[{seed:7,years:2000},{seed:42,years:2000},{seed:82,years:2000},{seed:42,years:10000}];

function observe(state,year){
 const rows=[];
 for(let i=0;i<3;i++){
  const snapshot=snapshotAt(state,year,i);
  const view=housingAt(state.housing,year,siteIds[i]);
  const conflicts=findHousingGroundConflicts(view.blocks,snapshot.objects,i);
  assert.deepEqual(conflicts,[],`site ${i} year ${year} overlaps existing footprint`);
  const composition=composeScene(snapshot,state.housing);
  assert.equal(composition.residentialBlocks.length,view.blocks.length);
  rows.push({site:siteIds[i],count:view.blocks.length,housingCount:view.blocks.reduce((sum,b)=>sum+b.housingCount,0),
   occupied:view.blocks.filter(b=>b.use==='occupied').length,
   underused:view.blocks.filter(b=>b.use==='underused').length,
   vacant:view.blocks.filter(b=>b.use==='vacant').length,
   damaged:view.blocks.filter(b=>b.condition==='damaged').length,
   ruined:view.blocks.filter(b=>b.condition==='ruined').length,
   status:view.status});
 }
 return rows;
}
function makeStats(state,seed,year,elapsed){
 const events=state.housing.events, counts={};
 for(const ev of events)counts[ev.kind]=(counts[ev.kind]??0)+1;
 const packed=serializeHousingSave(state);
 const decoded=parseHousingSave(packed);
 assert.deepEqual(decoded,state);
 const checkpoint=[0,Math.floor(year/2),year].map(y=>({year:y,sites:observe(state,y)}));
 for(const e of events){
  assert.ok(e.year<=lastObservedYear(state),'unconfirmed event');
  assert.ok(e.causeRecordId,'missing causal record');
  assert.ok(state.history.some(r=>r.id===e.causeRecordId&&r.buildingId===e.blockId),
   'event source not in chronicle');
 }
 return {type:'h3-longrun',seed,year,count:events.length,eventCounts:counts,
  housingBlocks:housingAt(state.housing,year,'river-bank').blocks.length,
  checkpoint,bytes:Buffer.byteLength(packed),elapsedMs:Math.round(elapsed)};
}
for(const {seed,years} of rounds){
 const state=createHousingCivilization(seed);
 const start=performance.now();
 let prior=null;
 for(let year=1;year<=years;year++){
  step(state);
  if(state.pending)chooseAutomatically(state);
  assert.equal(state.year,year);
  assert.equal(lastObservedYear(state),year);
  if(year===500)prior=observe(state,500);
  if(year%250===0){
   observe(state,year);
   if(prior)assert.deepEqual(observe(state,500),prior,'past scene changed');
  }
 }
 const stats=makeStats(state,seed,years,performance.now()-start);
 console.log(JSON.stringify(stats));
 // 同じ保存内容からの再開は既存状態と一致する。最後の100年だけ
 // 並走し、新規建設も状態変化も同じイベントを発行することを確認する。
 const saved=parseHousingSave(serializeHousingSave(state));
 for(let i=0;i<100;i++){
  step(state);if(state.pending)chooseAutomatically(state);
  step(saved);if(saved.pending)chooseAutomatically(saved);
 }
 assert.deepEqual(saved,state,`seed ${seed} failed save/resume at ${years}`);
 assert.deepEqual(observe(state,500),prior);
}
