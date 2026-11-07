import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parseTerrainRecord} from '../dist/terrain/terrain-record.js';
import {findPlacementReview} from '../dist/terrain/placement-search-review.js';
import {reviewFacilityAnchor} from '../dist/terrain/facility-plan-review.js';
import {southEntrance,reviewGroundAccess} from '../dist/terrain/ground-access-review.js';
import {createRegionalEconomy} from '../dist/story/regional-economy.js';
import {publicSpacesAt,validatePublicSpace} from '../dist/story/public-space-history.js';
import {createGeneratedPublicSpaceReview,advanceGeneratedPublicSpaceReview,proposeGeneratedPublicSpace,validateGeneratedPublicSpaceLedger} from '../dist/story/generated-public-space-review.js';
const sites=['river-bank','hill-side','coast-inlet'];
const terrain=parseTerrainRecord(readFileSync(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8'));
const source=(id,year,kind,extra={})=>({id,year,kind,tag:'fixture',title:'controlled fixture only',body:'not natural progression',causes:[],...extra});
function fixture(coastWidePatch=true){
 const x=createGeneratedPublicSpaceReview(terrain,'none');assert.equal(x.status,'review-only');
 const r=x.review,s=r.state;s.year=40;s.economy=createRegionalEconomy();
 for(const d of s.economy.districts){d.coverage=Array(5).fill(1);d.shortageYears=0;}
 for(let i=0;i<3;i++){
  // C03's right shore is too narrow below its default hall. The positive
  // fixture uses another real, connected land patch; the default HOLD is tested too.
  const site=sites[i],ledger=s.observation.sites[i],plot=i===2&&coastWidePatch?{x:2,y:96,width:18,depth:7}:r.plans[site].slots[3].plot,[a,b]=reviewFacilityAnchor('hall',plot);
  const occupied=r.placements.filter(p=>p.site===site).map(p=>({id:p.objectId,plot:p.plot,entrance:p.entrance}));
  assert.equal(reviewGroundAccess({terrain,site,year:0,confirmedYear:0,historyStatus:'known',primaryRoot:r.plans[site].primaryRoot,occupancy:occupied,reservations:[]},'hall',site+'-3',plot).status,'clear');
  const hall={id:site+'-3',kind:'hall',x:a,y:b,builtYear:0,condition:'intact',recordId:'hall-fixture-'+i};
  ledger.view.buildings.push(hall);ledger.buildingChanges.push({year:0,building:structuredClone(hall)});
  r.placements.push({objectId:hall.id,site,kind:'hall',plot,entrance:southEntrance(plot),builtYear:0,sourceRecordId:hall.recordId});
  s.history.push(source(hall.recordId,0,'building-built',{buildingId:hall.id}),source('council-fixture-'+i,0,'practice'));
  const council={kind:'council',active:true,originId:'council-fixture-'+i,recordId:'council-fixture-'+i};
  ledger.view.practices=[council];ledger.practiceChanges=[{year:0,practices:[council]}];s.observation.people[i]=7000;
 }
 for(let i=0;i<3;i++){
  const site=sites[i],occupied=r.placements.filter(p=>p.site===site).map(p=>({id:p.objectId,plot:p.plot,entrance:p.entrance}));
  // This controlled fixture leaves the hall neighborhood clear to exercise the
  // positive gate independently of the natural housing competition audit.
  const hall=occupied.find(o=>o.id===site+'-3').plot,left=Math.max(0,hall.x-28),right=Math.min(320,hall.x+hall.width+28);
  const reserved={id:'fixture-only-hall-neighborhood',plot:{x:left,y:hall.y,width:right-left,depth:Math.min(180-hall.y,hall.depth+20)}};
  const ctx={terrain,site,year:20,confirmedYear:20,historyStatus:'known',primaryRoot:r.plans[site].primaryRoot,occupancy:occupied,reservations:[reserved]};
  const manual={x:48,y:96,width:18,depth:8};
  const p=i===2&&coastWidePatch?(reviewGroundAccess(ctx,'housing','fixture-home',manual).status==='clear'?{status:'review-only',plot:manual}:{status:'hold'}):
   findPlacementReview(ctx,{objectId:site+'-fixture-home',purpose:'housing',width:18,depth:8,nucleus:r.plans[site].nucleus,neighborEntrances:[southEntrance(hall)]});assert.equal(p.status,'review-only');
  const id=['river','hill','coast'][i]+'-residential-00001',recordId='housing-fixture-'+i;
  const block={blockId:id,siteId:site,footprint:p.plot,builtYear:20,housingCount:2,condition:'sound',use:'occupied',styleId:'low',styleSeed:1};
  s.housing={...s.housing,events:[...s.housing.events,{year:20,seq:i,kind:'built',blockId:id,after:block,causeRecordId:recordId}]};s.history.push(source(recordId,20,'housing-built',{buildingId:id}));
 }
 return x;
}
test('all generated districts can establish grounded assembly spaces; legacy defaults still reject foreign sites',()=>{
 for(let i=0;i<3;i++){
  const x=fixture(),s=x.review.state,p=proposeGeneratedPublicSpace(x.review,i);assert.equal(p.status,'established',sites[i]+' '+p.reason);
  assert.ok(validatePublicSpace(p.space,'generated-review-only'));assert.equal(validatePublicSpace(p.space),i===0);
  const event={year:40,seq:0,kind:'established',spaceId:p.space.id,after:p.space,causeRecordId:p.space.foundationRecordId};
  s.history.push(source(event.causeRecordId,40,'public-space-established',{publicSpaceId:event.spaceId}));s.publicSpaces={...s.publicSpaces,events:[event]};
  validateGeneratedPublicSpaceLedger(x.review,40);
  if(i>0)assert.throws(()=>publicSpacesAt(s.publicSpaces,40));
  s.publicSpaces.events[0].after.footprint.x++;
  assert.throws(()=>validateGeneratedPublicSpaceLedger(x.review,40));
 }
});
test('the default hall on C03 narrow shore legitimately holds assembly construction',()=>{
 const x=fixture(false);assert.equal(proposeGeneratedPublicSpace(x.review,2).reason,'no-safe-plot');
});
test('eight years of lost council overgrow a plot and sixteen restored years reuse the same land',()=>{
 const x=fixture(),r=x.review,s=r.state,result=proposeGeneratedPublicSpace(r,0);assert.equal(result.status,'established');
 const commit=(p,year)=>{
  const id=p.status==='established'?p.space.foundationRecordId:year+'-'+s.history.length;
  s.history.push(source(id,year,'public-space-'+p.status,{publicSpaceId:p.space.id}));
  s.publicSpaces={...s.publicSpaces,events:[...s.publicSpaces.events,{year,seq:0,kind:p.status,spaceId:p.space.id,after:p.space,causeRecordId:id}]};
 };
 commit(result,40);const council=s.observation.sites[0].view.practices[0];
 s.observation.sites[0].practiceChanges.push({year:41,practices:[]});s.observation.sites[0].view.practices=[];
 s.year=47;assert.equal(proposeGeneratedPublicSpace(r,0).reason,'not-ready');
 s.year=48;const over=proposeGeneratedPublicSpace(r,0);assert.equal(over.status,'overgrown');assert.equal(over.reason,'practice-lost');commit(over,48);
 s.observation.sites[0].practiceChanges.push({year:49,practices:[council]});s.observation.sites[0].view.practices=[council];
 s.year=64;assert.equal(proposeGeneratedPublicSpace(r,0).reason,'no-council');
 s.year=65;const reused=proposeGeneratedPublicSpace(r,0);assert.equal(reused.status,'reused');assert.deepEqual(reused.space.footprint,result.space.footprint);commit(reused,65);
 validateGeneratedPublicSpaceLedger(r,65);
});
test('public space prefix replay preserves overgrowth/reuse footprints across districts',()=>{
 const events=[];
 for(let i=0;i<3;i++){
  const site=sites[i],p={id:'public-'+site+'-assembly-40',siteId:site,kind:'assembly-ground',footprint:{x:30,y:120,width:24,depth:10},establishedYear:40,anchorBuildingId:site+'-3',foundationRecordId:'foundation-'+i,condition:'used'};
  events.push({year:40,seq:i,kind:'established',spaceId:p.id,after:p,causeRecordId:p.foundationRecordId});
 }
 const h={schemaVersion:1,introducedYear:0,legacyUntracked:false,events};assert.equal(publicSpacesAt(h,40,'generated-review-only').spaces.length,3);
 const after={...events[1].after,condition:'overgrown'};h.events.push({year:60,seq:0,kind:'overgrown',spaceId:after.id,after,causeRecordId:'overgrowth'});
 assert.equal(publicSpacesAt(h,59,'generated-review-only').spaces[1].condition,'used');
 assert.equal(publicSpacesAt(h,60,'generated-review-only').spaces.find(p=>p.siteId==='hill-side').condition,'overgrown');
 h.events.push({year:80,seq:0,kind:'reused',spaceId:after.id,after:{...after,condition:'used'},causeRecordId:'reuse'});
 assert.equal(publicSpacesAt(h,80,'generated-review-only').spaces.find(p=>p.siteId==='hill-side').condition,'used');
 h.events.at(-1).after.footprint={...after.footprint,x:32};assert.throws(()=>publicSpacesAt(h,80,'generated-review-only'));
});
test('natural public-space stage retains deterministic split progression and old observation',()=>{
 const initial=createGeneratedPublicSpaceReview(terrain,'field-only'),before=JSON.stringify(initial);
 const whole=advanceGeneratedPublicSpaceReview(initial,500,'automatic');
 const split=advanceGeneratedPublicSpaceReview(advanceGeneratedPublicSpaceReview(initial,250,'automatic'),250,'automatic');
 assert.deepEqual(split,whole);assert.equal(JSON.stringify(initial),before);
 assert.deepEqual(publicSpacesAt(whole.review.state.publicSpaces,0,'generated-review-only').spaces,[]);
});
