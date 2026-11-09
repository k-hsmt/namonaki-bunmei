import {assertProductionBoundary} from './trial-boundary.js';
/** D4-B v5 generated envelope proposal. No localStorage or game activation. */
import type {CivilizationState} from './engine.js';
import {lastObservedYear} from './engine.js';
import type {GeneratedBridgeReview} from './generated-bridge-review.js';
import type {GeneratedFacilityReview,ReviewFacilityPlacement} from './generated-facility-review.js';
import {validateGeneratedState,wireObject,sameWire,assertJsonWire} from './generated-state-review.js';
import {validateGeneratedBridgeLedger,type SavedReviewBridge} from './generated-bridge-history-review.js';
import {validateGeneratedPublicSpaceLedger} from './generated-public-space-review.js';
import {captureGeneratedLandFoundations,type GeneratedLandFoundationsReview} from './generated-land-foundations-review.js';
import {validateTerrainRecord,type ValidatedTerrainRecord} from '../terrain/terrain-record.js';
import {validateRiverReaches,type ValidatedRiverReaches} from '../terrain/river-reaches-review.js';
import {validateBridgeGeometry} from '../terrain/bridge-geometry-review.js';
import {decodeRecordPhysics} from '../terrain/terrain-record-raster-v1.js';
import {groundReviewLimits,reviewPhysicalPlot,groundWalkWindows,groundDistances,reviewGroundAccess,southEntrance,type GroundPlot,type GroundPurpose} from '../terrain/ground-access-review.js';
import {fixedFacilityLotReservations,siteAt} from './settlement-history.js';
import {reviewFacilityAnchor,type ReviewFacilityPlan,type ReservationReviewMode} from '../terrain/facility-plan-review.js';
import type {RecordSite,RecordPoint} from '../terrain/terrain-record-types.js';
import type {GrowthPattern} from '../terrain/organic-placement-v2.js';
const sites:readonly RecordSite[]=['river-bank','hill-side','coast-inlet'];
export const generatedDraftMaxBytes=16*1024*1024;
export interface GeneratedSaveDraftReview {
 readonly format:'namonaki-generated-save-draft';readonly version:5;readonly schemaVersion:1;readonly status:'review-only';
 readonly initialTerrain:{readonly schemaVersion:1;readonly mode:'generated';readonly record:ValidatedTerrainRecord;readonly hydrology:ValidatedRiverReaches;readonly plans:Readonly<Record<RecordSite,ReviewFacilityPlan>>};
 readonly progressionPolicy:{readonly id:'generated-land-review-v1'|'generated-land-review-v2'|'generated-land-review-v3';readonly reservationMode:ReservationReviewMode;readonly limits:typeof groundReviewLimits};
 readonly rendererId:'generated-scene-review-v1';readonly landHistory:GeneratedLandFoundationsReview;readonly state:Readonly<CivilizationState>;
}
declare const checkedDraft:unique symbol;
export type ValidatedGeneratedSaveDraft=GeneratedSaveDraftReview&{readonly [checkedDraft]:true};
const nat=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
function plot(raw:unknown):GroundPlot {
 const p=wireObject(raw,['x','y','width','depth']);if(!Object.values(p).every(nat)||Number(p.x)+Number(p.width)>320||Number(p.y)<96||Number(p.y)+Number(p.depth)>180||Number(p.width)<2||Number(p.depth)<1)throw Error('Invalid generated plot');return p as unknown as GroundPlot;
}
function point(raw:unknown):RecordPoint {
 if(!Array.isArray(raw)||raw.length!==2||!raw.every(nat)||raw[0]>318||raw[1]<96||raw[1]>178)throw Error('Invalid generated portal');return raw as unknown as RecordPoint;
}
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function validatePlans(raw:unknown,terrain:ValidatedTerrainRecord):Readonly<Record<RecordSite,ReviewFacilityPlan>> {
 const plans=wireObject(raw,sites);
 for(const [index,site] of sites.entries()){
  const p=wireObject(plans[site],['status','site','placementPolicy','nucleus','primaryRoot','accessRoots','slots','metrics']);
  if(p.status!=='review-only'||p.site!==site||p.placementPolicy!==null||!Array.isArray(p.slots)||p.slots.length!==11||!Array.isArray(p.accessRoots)||p.accessRoots.length<1||p.accessRoots.length>64)throw Error('Invalid generated initial plan');
  const root=point(p.primaryRoot),nucleus=point(p.nucleus),r=decodeRecordPhysics(terrain.sites[site].physics),windows=groundWalkWindows(r,[]),seen=new Set<string>();
  for(const value of p.accessRoots){const [x,y]=point(value),key=x+','+y;if(seen.has(key)||!(x===0||x===318||y===96||y===178))throw Error('Invalid original access roots');seen.add(key);
   const distance=groundDistances(windows,[x,y]),cells=new Set<number>();for(let j=96*320;j<57600;j++)if(distance[j]!>=0)for(const k of [j,j+1,j+320,j+321])cells.add(k);if(cells.size<128)throw Error('Invented island access root');
  }
  if(!seen.has(root.join(',')))throw Error('Primary root is not original access');
  const definitions=fixedFacilityLotReservations(index),plots:GroundPlot[]=[];
  for(let i=0;i<11;i++){
   const slot=wireObject(p.slots[i],['slot','id','kind','plot','reason']),expected=definitions[i]!;
   if(slot.slot!==i||slot.id!==expected.id||slot.kind!==expected.kind||slot.reason!==null&&typeof slot.reason!=='string')throw Error('Unknown logical facility slot');
   if(slot.plot!==null){const f=plot(slot.plot);if(f.x%2||f.y%2||slot.kind==='bridge'||slot.reason!==null||f.width!==(slot.kind==='field'?26:18)||f.depth!==(slot.kind==='field'?14:7)||reviewPhysicalPlot(r,slot.kind as GroundPurpose,f).status!=='clear')throw Error('Invalid initial facility proposal');
    if(plots.some(q=>f.x<q.x+q.width&&f.x+f.width>q.x&&f.y<q.y+q.depth&&f.y+f.depth>q.y))throw Error('Overlapping initial proposals');plots.push(f);
   }else if(slot.reason===null)throw Error('Missing proposal HOLD reason');
  }
  const metrics=wireObject(p.metrics,['searches','accessEvaluations','scoreEvaluations']);if(!Object.values(metrics).every(nat))throw Error('Invalid initial search metadata');
  const slots=p.slots as unknown as ReviewFacilityPlan['slots'],house=slots[0]!.plot,field=slots[1]!.plot;
  if(!house||!field||!sameWire(nucleus,southEntrance(house)))throw Error('Missing year-zero house or field');
  const ctx={terrain,site,year:0,confirmedYear:0,historyStatus:'known' as const,primaryRoot:root,occupancy:[],reservations:[]};
  if(reviewGroundAccess(ctx,'house',site+'-0',house).status!=='clear'||reviewGroundAccess({...ctx,occupancy:[{id:site+'-0',plot:house,entrance:nucleus}]},'field',site+'-1',field).status!=='clear')throw Error('Initial joint access is invalid');
 }
 return plans as unknown as Readonly<Record<RecordSite,ReviewFacilityPlan>>;
}
function reviewFromParts(terrain:ValidatedTerrainRecord,hydrology:ValidatedRiverReaches,plans:GeneratedFacilityReview['plans'],mode:ReservationReviewMode,state:CivilizationState,land:unknown,growthPattern?:GrowthPattern):GeneratedFacilityReview {
 const h=wireObject(land,['schemaVersion','events']);if(h.schemaVersion!==1||!Array.isArray(h.events)||h.events.length>10000)throw Error('Invalid land history');
 const placements:ReviewFacilityPlacement[]=[],bridges:SavedReviewBridge[]=[];
 for(const value of h.events){
  const e=wireObject(value,['year','seq','objectId','site','purpose','sourceRecordId','placement']),p=wireObject(e.placement,['schemaVersion','plot','entrance','access'],['bridge']);
  if(!nat(e.year)||!nat(e.seq)||typeof e.objectId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(e.objectId)||typeof e.sourceRecordId!=='string'||!sites.includes(e.site as RecordSite)||!['house','field','hall','workshop','market','granary','housing','civic','public-space','bridge'].includes(e.purpose as string)||p.schemaVersion!==1||!Array.isArray(p.access)||p.access.length<1||p.access.length>57600)throw Error('Invalid land birth fields');
  const f=plot(p.plot),entrance=point(p.entrance);p.access.forEach(point);
  if(e.purpose==='bridge'){
   const geometry=validateBridgeGeometry(p.bridge,terrain,hydrology);if(e.site!=='river-bank'||geometry.bridgeId!==e.objectId||!sameWire(f,geometry.deck)||!sameWire(entrance,geometry.bankA))throw Error('Bridge birth geometry disagrees');bridges.push({geometry,builtYear:e.year as number,sourceRecordId:e.sourceRecordId});
  }else{
   if(f.x%2||f.y%2||Object.hasOwn(p,'bridge')||!sameWire(entrance,southEntrance(f)))throw Error('Invalid land entrance');
   if(e.purpose!=='housing'&&e.purpose!=='public-space')placements.push({objectId:e.objectId,site:e.site as RecordSite,kind:e.purpose as GroundPurpose,plot:f,entrance,builtYear:e.year as number,sourceRecordId:e.sourceRecordId});
  }
 }
 const review:GeneratedFacilityReview={format:'generated-facility-review',status:'review-only',placementPolicy:null,terrain,plans,reservationMode:mode,state,placements,bridgeReview:{schemaVersion:1,hydrology,bridges},diagnostics:{holds:{},fullSearches:0},...(growthPattern?{growthPattern}:{})};
 for(const [index,site] of sites.entries()){
  const buildings=siteAt(state.observation?.sites,index,lastObservedYear(state))!.buildings,placed=placements.filter(p=>p.site===site);
  if(buildings.length!==placed.length+(site==='river-bank'?bridges.length:0))throw Error('Facility birth ledger is incomplete');
  for(const p of placed){
   const b=buildings.find(b=>b.id===p.objectId),slot=plans[site].slots.find(s=>s.id===p.objectId),[x,y]=reviewFacilityAnchor(p.kind as Exclude<GroundPurpose,'public-space'>,p.plot);
   if(!b||b.kind!==(p.kind==='civic'?'hall':p.kind)||b.x!==x||b.y!==y||b.builtYear!==p.builtYear)throw Error('Facility placement disagrees with immutable history');
   if(p.kind==='civic'){if(!b.civic||p.builtYear<40||p.builtYear%40||p.objectId!=='civic-'+site+'-'+p.builtYear+'-'+b.civic.architectureStyle||!sameWire(b.civic.footprint,p.plot))throw Error('Civic placement disagrees');}
   else if(!slot||slot.kind!==p.kind||p.plot.width!==(p.kind==='field'?26:18)||p.plot.depth!==(p.kind==='field'?14:7))throw Error('Ordinary placement disagrees');
   if(p.objectId===site+'-0'&&(p.builtYear!==0||p.sourceRecordId!==state.history[0]?.id||!sameWire(p.plot,plans[site].slots[0]!.plot)))throw Error('Initial plan and birth disagree');
  }
 }
 validateGeneratedBridgeLedger(review);validateGeneratedPublicSpaceLedger(review,lastObservedYear(state));
 if(!sameWire(captureGeneratedLandFoundations(review),land))throw Error('Land birth, access path, order or immutable geometry changed');
 return review;
}
export function validateGeneratedSaveDraft(raw:unknown):ValidatedGeneratedSaveDraft {
 assertJsonWire(raw);
 const json=JSON.stringify(raw);if(typeof json!=='string'||new TextEncoder().encode(json).length>generatedDraftMaxBytes)throw Error('Generated draft exceeds 16MiB');
 const d=wireObject(structuredClone(raw),['format','version','schemaVersion','status','initialTerrain','progressionPolicy','rendererId','landHistory','state']);
 if(d.format!=='namonaki-generated-save-draft'||d.version!==5||d.schemaVersion!==1||d.status!=='review-only'||d.rendererId!=='generated-scene-review-v1')throw Error('Unknown generated draft contract');
 const t=wireObject(d.initialTerrain,['schemaVersion','mode','record','hydrology','plans']),policy=wireObject(d.progressionPolicy,['id','reservationMode','limits']);
 if(t.schemaVersion!==1||t.mode!=='generated'||!['generated-land-review-v1','generated-land-review-v2','generated-land-review-v3'].includes(policy.id as string)||!['wide','field-only','none'].includes(policy.reservationMode as string)||!sameWire(policy.limits,groundReviewLimits))throw Error('Unknown generated terrain or trial policy');
 const terrain=validateTerrainRecord(t.record),hydrology=validateRiverReaches(t.hydrology,terrain),plans=validatePlans(t.plans,terrain),state=validateGeneratedState(d.state,terrain.source.seed);
 reviewFromParts(terrain,hydrology,plans,policy.reservationMode as ReservationReviewMode,state,d.landHistory,policy.id==='generated-land-review-v3'?'organic-v3':policy.id==='generated-land-review-v2'?'organic-v2':undefined);
 return freeze({...d,initialTerrain:{schemaVersion:1,mode:'generated',record:terrain,hydrology,plans},state}) as unknown as ValidatedGeneratedSaveDraft;
}
export function createGeneratedSaveDraft(input:GeneratedBridgeReview):ValidatedGeneratedSaveDraft {assertProductionBoundary(input);
 if(input.format!=='generated-bridge-review'||input.status!=='review-only'||!input.review.bridgeReview)throw Error('Missing generated draft source');assertJsonWire(input.review);const r=structuredClone(input.review);
 if(r.growthPattern!==undefined&&!['organic-v2','organic-v3'].includes(r.growthPattern))throw Error('Unknown growth pattern');
 const terrain=validateTerrainRecord(r.terrain),state=validateGeneratedState(r.state,terrain.source.seed),plans=validatePlans(r.plans,terrain),hydrology=validateRiverReaches(r.bridgeReview!.hydrology,terrain);
 const source={...r,terrain,state,plans,bridgeReview:{...r.bridgeReview!,hydrology}};validateGeneratedBridgeLedger(source);validateGeneratedPublicSpaceLedger(source,lastObservedYear(state));
 return validateGeneratedSaveDraft({format:'namonaki-generated-save-draft',version:5,schemaVersion:1,status:'review-only',initialTerrain:{schemaVersion:1,mode:'generated',record:r.terrain,hydrology:r.bridgeReview!.hydrology,plans:r.plans},
  progressionPolicy:{id:r.growthPattern==='organic-v3'?'generated-land-review-v3':r.growthPattern?'generated-land-review-v2':'generated-land-review-v1',reservationMode:r.reservationMode,limits:groundReviewLimits},rendererId:'generated-scene-review-v1',landHistory:captureGeneratedLandFoundations(source),state});
}
export function restoreGeneratedSaveDraft(raw:unknown):GeneratedBridgeReview {
 const d=validateGeneratedSaveDraft(raw),t=d.initialTerrain;return {format:'generated-bridge-review',status:'review-only',review:reviewFromParts(t.record,t.hydrology,t.plans,d.progressionPolicy.reservationMode,structuredClone(d.state),d.landHistory,d.progressionPolicy.id==='generated-land-review-v3'?'organic-v3':d.progressionPolicy.id==='generated-land-review-v2'?'organic-v2':undefined)};
}
export function serializeGeneratedSaveDraft(raw:GeneratedSaveDraftReview):string{return JSON.stringify(validateGeneratedSaveDraft(raw));}
export function parseGeneratedSaveDraft(json:string):ValidatedGeneratedSaveDraft {
 if(typeof json!=='string'||new TextEncoder().encode(json).length>generatedDraftMaxBytes)throw Error('Generated draft exceeds 16MiB');return validateGeneratedSaveDraft(JSON.parse(json) as unknown);
}
