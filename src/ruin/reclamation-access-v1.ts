/**
 * Issue #37 D1b PROTOTYPE: where plants may take root again on an abandoned building's ground, and what grows there
 * (ruleId reclamation-access-v1, parameters not final).
 *
 * Appearance only and not connected to anything: the live game never imports this module (D0 §11: D1b must not change
 * the vegetation record or the yearly engine). It is the "independent local access projection" that D0 §5 recommends
 * over widening the existing 8×8 patch `release`:
 *  - Zones open from confirmed state changes of one owner (D0 §3): housing opens its perimeter while `vacant` and its
 *    exposed interior while `ruined`; a facility opens both when it becomes a ruin (`building-abandoned`). A repair or
 *    reuse closes the zones from that year; a new abandonment opens a new period with a new `openedYear`.
 *  - Construction occupancy is never changed: the masks are a separate, finer view (D0 §4). Protected structure plans
 *    (the remaining walls and foundations) and a clearance around them never take roots; unknown places stay protected.
 *  - Growth on an opened zone counts from its own `openedYear` and passes 0 → grass → shrubs → young → mature (the
 *    flora-growth-v1 stage ages), capped by the community ceiling of the patch the root stands in. The patch's own age is
 *    neither read nor changed, so trees outside the building in the same patch keep their age (D0 §5).
 *  - Plants are the patch community's forms (local-flora-v1); placement uses hashes of the world seed, site, owner and
 *    opening, never the civilisation RNG, and never depends on how often it is called.
 * Masks and plants are in record coordinates; a mirrored scene maps them when drawing (rasterizeFlora: 318 − x).
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import {describeFloraPatch,type FloraPatch,type PlantArchetype} from '../flora/local-flora-v1.js';
import {stageOfAge,type FloraPatchView,type FloraStage} from '../flora/flora-growth-v1.js';
import {FOREST_BIOMES,SCENE_DENSITY,LOW_SPACING,LOW_TREE_CLEARANCE,type ScenePlant,type ScenePlot,type FloraScenePhysics} from '../flora/flora-scene-v1.js';
import {PLANT_VARIANTS} from '../flora/plant-sprites-v1.js';

export const RECLAMATION_RULE_ID='reclamation-access-v1' as const;
export type ReclamationZone='perimeter'|'exposed-interior';
export const ZONE_CODE=Object.freeze({perimeter:1,'exposed-interior':2} as const);

/** D1b parameters (to be calibrated by Human review). */
export const RECLAMATION_PARAMETERS=Object.freeze({
 /** Width of the apron outside the footprint that people kept clear (the live scene's ROOT_MARGIN). */
 apron:4,
 /** Width of the band just inside a housing block's edge that opens with the perimeter. Facilities have none: their footprint is the building. */
 housingRim:2,
 /** Pixels kept free around a protected structure plan (walls, foundations), so no root touches a structure. */
 clearance:1,
 /** Candidate roots: one per cell of this size (record pixels). */
 cell:4,
 /** Each candidate root starts growing 0..delay−1 years after its zone opened, so a zone does not grow in one step. */
 delay:20,
 /** Undergrowth on an opened zone: at most this many plants per 64 px² of open zone. */
 lowPer64:.5,
});

/** A confirmed housing state (housing-history `after`), from the event that made it. */
export interface HousingStateChange {readonly year:number;readonly use:'occupied'|'underused'|'vacant';readonly condition:'sound'|'damaged'|'ruined';readonly sourceKey:string}
/** A confirmed facility condition (building-built / -damaged / -abandoned / -repaired / -reused). */
export interface FacilityStateChange {readonly year:number;readonly condition:'intact'|'damaged'|'ruined';readonly sourceKey:string}
export type ReclamationOwner=
 {readonly kind:'housing';readonly id:string;readonly footprint:ScenePlot;readonly protectedPlans:readonly ScenePlot[];readonly changes:readonly HousingStateChange[]}|
 {readonly kind:'facility';readonly id:string;readonly footprint:ScenePlot;readonly protectedPlans:readonly ScenePlot[];readonly changes:readonly FacilityStateChange[]};
export interface ZonePeriod {readonly zone:ReclamationZone;readonly openedYear:number;readonly closedYear:number|null;readonly sourceKey:string}

const opens=(o:ReclamationOwner,c:HousingStateChange|FacilityStateChange):Record<ReclamationZone,boolean>=>{
 if(o.kind==='housing'){const h=c as HousingStateChange;return {perimeter:h.use==='vacant','exposed-interior':h.condition==='ruined'};}
 const f=c as FacilityStateChange;return {perimeter:f.condition==='ruined','exposed-interior':f.condition==='ruined'};
};
/**
 * Open periods of each zone from the owner's confirmed changes (oldest first, first one the construction). A zone that
 * stays open across several changes keeps its first `openedYear` (for example vacant → ruined keeps the perimeter).
 */
export function reclamationPeriods(o:ReclamationOwner):readonly ZonePeriod[] {
 const c=o.changes;
 if(!c.length)throw Error('Reclamation owner without construction');
 for(let i=0;i<c.length;i++){
  const x=c[i]!;if(!Number.isSafeInteger(x.year)||x.year<0||i>0&&x.year<c[i-1]!.year||typeof x.sourceKey!=='string'||!x.sourceKey)throw Error('Invalid reclamation change');
  if(o.kind==='housing'){const h=x as HousingStateChange;if(!['occupied','underused','vacant'].includes(h.use)||!['sound','damaged','ruined'].includes(h.condition)||h.condition==='ruined'&&h.use!=='vacant')throw Error('Invalid housing state');}
  else if(!['intact','damaged','ruined'].includes((x as FacilityStateChange).condition))throw Error('Invalid facility state');
 }
 if(Object.values(opens(o,c[0]!)).some(Boolean))throw Error('A building cannot start abandoned');
 const out:ZonePeriod[]=[],open:Partial<Record<ReclamationZone,{year:number;key:string}>>={};
 for(const x of c){
  const now=opens(o,x);
  for(const zone of ['perimeter','exposed-interior'] as const){
   const was=open[zone];
   if(now[zone]&&!was)open[zone]={year:x.year,key:x.sourceKey};
   if(!now[zone]&&was){out.push({zone,openedYear:was.year,closedYear:x.year,sourceKey:was.key});delete open[zone];}
  }
 }
 for(const zone of ['perimeter','exposed-interior'] as const){const was=open[zone];if(was)out.push({zone,openedYear:was.year,closedYear:null,sourceKey:was.key});}
 return Object.freeze(out.sort((a,b)=>a.openedYear-b.openedYear||(a.zone<b.zone?-1:1)).map(p=>Object.freeze(p)));
}
/** The periods open in a year (opened in or before it, not yet closed). */
export function openZonesAt(periods:readonly ZonePeriod[],year:number):readonly ZonePeriod[] {
 if(!Number.isSafeInteger(year)||year<0)throw Error('Invalid reclamation year');
 return periods.filter(p=>p.openedYear<=year&&(p.closedYear===null||year<p.closedYear));
}

const inPlot=(p:ScenePlot,x:number,y:number,m=0)=>x>=p.x-m&&x<p.x+p.width+m&&y>=p.y-m&&y<p.y+p.depth+m;
const landAt=(r:FloraScenePhysics,x:number,y:number)=>x>=1&&x<319&&y>=98&&y<179&&r.surface[y*320+x]===1&&r.grade[y*320+x]!<2&&r.bearing[y*320+x]===0;

/**
 * Where roots may stand once each zone is open (record coordinates, 320×180): ZONE_CODE or 0.
 * `standing` are the other structures standing that year (their footprints; houses, facilities, plazas, bridges): their
 * ground and the live root margin around them stay closed. Only stable, gentle land counts.
 */
export function reclamationMask(o:ReclamationOwner,physics:FloraScenePhysics,standing:readonly ScenePlot[]):Uint8Array {
 const P=RECLAMATION_PARAMETERS,f=o.footprint,rim=o.kind==='housing'?P.housingRim:0,mask=new Uint8Array(57600);
 for(let y=Math.max(0,f.y-P.apron);y<Math.min(180,f.y+f.depth+P.apron);y++)for(let x=Math.max(0,f.x-P.apron);x<Math.min(320,f.x+f.width+P.apron);x++){
  if(!landAt(physics,x,y))continue;
  if(o.protectedPlans.some(p=>inPlot(p,x,y,P.clearance)))continue;
  if(standing.some(p=>inPlot(p,x,y,P.apron)))continue;
  const inside=inPlot(f,x,y),edge=inside&&!inPlot(f,x,y,-rim);
  // the facility's own wall line (its footprint edge) is a protected plan of the facility; inside it is the interior
  mask[y*320+x]=!inside||edge?ZONE_CODE.perimeter:ZONE_CODE['exposed-interior'];
 }
 return mask;
}

export interface ReclamationRoot {readonly x:number;readonly y:number;readonly zone:ReclamationZone;readonly openedYear:number;readonly stage:FloraStage;readonly sourceKey:string}
/**
 * Plants on the open zones of one owner in a confirmed year. `existing` are the plants the scene already shows (the live
 * planting): local plants keep the live spacing from them. `standing` as in reclamationMask; trees also keep the live
 * structure margins from those. Returns the plants (ScenePlant, drawable with rasterizeFlora) and their roots.
 */
export function planReclamation(input:{seed:number;site:RecordSite;owner:ReclamationOwner;year:number;mask:Uint8Array;patches:readonly (FloraPatch|null)[];views:readonly (FloraPatchView|null)[];existing:readonly ScenePlant[];standing:readonly ScenePlot[]}):{readonly plants:readonly ScenePlant[];readonly roots:readonly ReclamationRoot[]} {
 const {seed,site,owner,year,mask,patches,views,existing,standing}=input,P=RECLAMATION_PARAMETERS;
 if(mask.length!==57600||patches.length!==440||views.length!==440)throw Error('Invalid reclamation input');
 const open=openZonesAt(reclamationPeriods(owner),year);
 const plants:ScenePlant[]=[],roots:ReclamationRoot[]=[];
 if(!open.length)return {plants,roots};
 interface C {x:number;y:number;h:number;zone:ReclamationZone;period:ZonePeriod;stage:FloraStage;d:ReturnType<typeof describeFloraPatch>}
 const cands:C[]=[];let area=0;
 const zoneOf=(i:number)=>mask[i]===1?'perimeter':mask[i]===2?'exposed-interior':null;
 for(const period of open){
  const code=ZONE_CODE[period.zone],H=(...k:(string|number)[])=>terrainHash([RECLAMATION_RULE_ID,seed,site,owner.id,period.zone,period.openedYear,...k]);
  for(let i=0;i<57600;i++)if(mask[i]===code)area++;
  for(let cy=96;cy<180;cy+=P.cell)for(let cx=0;cx<320;cx+=P.cell){
   const h=H(cx,cy),x=cx+h%(P.cell-1),y=cy+(h>>>8)%(P.cell-1);
   if(![[x,y],[x+1,y],[x,y+1],[x+1,y+1]].every(([a,b])=>a!<320&&b!<180&&zoneOf(b!*320+a!)===period.zone))continue;
   const pi=Math.floor((y-96)/8)*40+Math.floor(x/8),p=patches[pi],v=views[pi];if(!p||!v)continue;
   const age=year-period.openedYear-(h>>>16)%P.delay;if(age<0)continue;
   const stage=Math.min(stageOfAge(age),v.ceiling) as FloraStage;if(stage<1)continue;
   cands.push({x,y,h,zone:period.zone,period,stage,d:describeFloraPatch(p)});
  }
 }
 cands.sort((a,b)=>a.h-b.h||a.y-b.y||a.x-b.x);
 const dist2=(a:{x:number;y:number},b:{x:number;y:number})=>(a.x-b.x)**2+(a.y-b.y)**2;
 const trees=existing.filter(p=>p.kind==='tree'),lows=existing.filter(p=>p.kind==='low');
 const painter=(x:number,y:number)=>terrainHash([RECLAMATION_RULE_ID,'painter',seed,site,x,y])%2?'expressive' as const:'restrained' as const;
 const add=(c:C,kind:'tree'|'low',id:PlantArchetype,stage:'young'|'mature')=>{
  const plant=Object.freeze({kind,id,x:c.x,y:c.y,stage,variant:(c.h>>>5)%PLANT_VARIANTS,painter:painter(c.x,c.y)});
  plants.push(plant);(kind==='tree'?trees:lows).push(plant);
  roots.push(Object.freeze({x:c.x,y:c.y,zone:c.zone,openedYear:c.period.openedYear,stage:c.stage,sourceKey:c.period.sourceKey}));
 };
 for(const c of cands){
  if(c.stage<3||!c.d.canopy)continue;
  const density=FOREST_BIOMES.includes(c.d.biome)?SCENE_DENSITY.forest:SCENE_DENSITY.open;
  if(standing.some(o=>inPlot(o,c.x,c.y,Math.max(density.structureMarginX,density.structureMarginY))))continue;
  if(!trees.every(t=>dist2(t,c)>=density.treeSpacing**2))continue;
  add(c,'tree',c.d.canopy,c.stage===3?'young':'mature');
 }
 const lowCap=Math.round(area/64*P.lowPer64);let low=0;
 for(const c of cands){
  if(low>=lowCap)break;
  if(plants.some(p=>p.x===c.x&&p.y===c.y))continue;
  if(!trees.every(t=>dist2(t,c)>=LOW_TREE_CLEARANCE**2)||!lows.every(t=>dist2(t,c)>=LOW_SPACING**2))continue;
  const pool=(c.stage===1?[c.d.herb]:c.stage===2?[c.d.shrub??c.d.herb]:[c.d.shrub,c.d.herb]).filter((a):a is PlantArchetype=>a!==null);
  if(!pool.length)continue;
  add(c,'low',pool[(c.h>>>12)%pool.length]!,c.stage===1?'young':'mature');low++;
 }
 return {plants:Object.freeze(plants),roots:Object.freeze(roots)};
}

/** A facility's protected plan: its wall line, the 1 px edge of its footprint (the inside is its floor). */
export function facilityWallPlans(f:ScenePlot):readonly ScenePlot[] {
 return Object.freeze([{x:f.x,y:f.y,width:f.width,depth:1},{x:f.x,y:f.y+f.depth-1,width:f.width,depth:1},{x:f.x,y:f.y,width:1,depth:f.depth},{x:f.x+f.width-1,y:f.y,width:1,depth:f.depth}]);
}
/**
 * Assumed ground plan of the houses of a block (D1b): each roof part stands on its drawn width plus 1 px, and this many
 * rows behind its ground line. The live model records no plan depth for a part, so the plan is generous (D0 §4: unknown
 * places stay protected). Human review decides whether it is right.
 */
export const HOUSE_PLAN_DEPTH=Object.freeze({far:3,middle:4,near:5} as const);
const PART_WIDTH={far:5,middle:9,near:13} as const;
export function housingPartPlans(parts:readonly {readonly x:number;readonly y:number;readonly depth:'far'|'middle'|'near'}[]):readonly ScenePlot[] {
 return Object.freeze(parts.map(p=>{const w=PART_WIDTH[p.depth],d=HOUSE_PLAN_DEPTH[p.depth];return Object.freeze({x:p.x-Math.floor(w/2)-1,y:p.y-d,width:w+2,depth:d+1});}));
}
