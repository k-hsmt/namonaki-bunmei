import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parseTerrainRecord} from '../dist/terrain/terrain-record.js';
import {createGeneratedCivicReview,advanceGeneratedCivicReview,proposeGeneratedCivic} from '../dist/story/generated-civic-review.js';
import {validateCivicBuilding,validateCivicLedger} from '../dist/story/civic-architecture.js';
import {createRegionalEconomy} from '../dist/story/regional-economy.js';
import {reviewFacilityAnchor} from '../dist/terrain/facility-plan-review.js';
import {southEntrance} from '../dist/terrain/ground-access-review.js';
import {siteAt} from '../dist/story/settlement-history.js';
const terrain=parseTerrainRecord(readFileSync(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8'));
const start=()=>{const s=createGeneratedCivicReview(terrain,'field-only');assert.equal(s.status,'review-only');return s;};
function fixture(){
 const x=start(),r=x.review,s=r.state;s.year=40;s.economy=createRegionalEconomy();
 for(const d of s.economy.districts){d.coverage=[1];d.shortageYears=0;}for(const route of s.economy.routes)route.tradeYears=[true,true,true,true,true,true];
 for(let i=0;i<3;i++){
  const site=['river-bank','hill-side','coast-inlet'][i],ledger=s.observation.sites[i],p=r.plans[site].slots[3].plot;
  assert.ok(p);s.observation.people[i]=7000;
  const [a,b]=reviewFacilityAnchor('hall',p),hall={id:site+'-3',kind:'hall',x:a,y:b,builtYear:0,condition:'intact',recordId:'initial-hall-'+i};
  ledger.view.buildings.push(hall);ledger.buildingChanges.push({year:0,building:structuredClone(hall)});
  r.placements.push({objectId:hall.id,site,kind:'hall',plot:p,entrance:southEntrance(p),builtYear:0,sourceRecordId:hall.recordId});
  const council={kind:'council',originId:'shared-'+i,recordId:'council-'+i,active:true};
  ledger.view.practices=[council];ledger.practiceChanges=[{year:0,practices:[council]}];
 }return x;
}
test('explicit civic validation accepts each generated district while legacy defaults remain river-only',()=>{
 for(let i=0;i<3;i++){
  const x=fixture(),r=x.review,result=proposeGeneratedCivic(r,i);assert.equal(result.status,'proposed');
  const site=['river-bank','hill-side','coast-inlet'][i];assert.ok(validateCivicBuilding(result.candidate,site));assert.equal(validateCivicBuilding(result.candidate),i===0);
  const ledger=r.state.observation.sites[i];ledger.view.buildings.push(result.candidate);ledger.buildingChanges.push({year:40,building:structuredClone(result.candidate)});r.state.history.push(result.event);
  validateCivicLedger(r.state.observation.sites,r.state.history,40,'generated-review-only');
  if(i>0)assert.throws(()=>validateCivicLedger(r.state.observation.sites,r.state.history,40));
  ledger.view.buildings.at(-1).civic.footprint.x++;
  assert.throws(()=>validateCivicLedger(r.state.observation.sites,r.state.history,40,'generated-review-only'));
 }
});
test('24-year council continuity, hall and capacity are retained independently in all three districts',()=>{
 for(let i=0;i<3;i++){
  const x=fixture(),s=x.review.state,p=s.observation.sites[i].view.practices[0];
  s.observation.sites[i].practiceChanges.push({year:20,practices:[]},{year:30,practices:[p]});
  assert.equal(proposeGeneratedCivic(x.review,i).reason,'no-council');
  s.observation.sites[i].practiceChanges.splice(1);s.observation.people[i]=4499;
  assert.equal(proposeGeneratedCivic(x.review,i).reason,'no-capacity');
  s.year=39;assert.equal(proposeGeneratedCivic(x.review,i).reason,'not-ready');
 }
});
test('natural civic construction keeps old sites, occupancy, sources and split continuation deterministic',()=>{
 const initial=start(),before=JSON.stringify(initial),one=advanceGeneratedCivicReview(initial,1000,'automatic');
 assert.equal(JSON.stringify(initial),before);const civic=one.review.placements.filter(p=>p.kind==='civic');assert.ok(civic.length>0);
 for(const p of civic)assert.ok(one.review.state.history.some(r=>r.id===p.sourceRecordId&&r.year===p.builtYear&&r.buildingId===p.objectId));
 const split=advanceGeneratedCivicReview(advanceGeneratedCivicReview(initial,750,'automatic'),250,'automatic');assert.deepEqual(split,one);
 for(let i=0;i<3;i++)assert.deepEqual(siteAt(one.review.state.observation.sites,i,0),siteAt(initial.review.state.observation.sites,i,0));
});
