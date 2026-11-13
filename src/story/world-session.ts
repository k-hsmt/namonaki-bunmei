import type {TerrainProductionWorld} from '../terrain/terrain-production-types-v1.js';
import {knownTerrainProductionWorldInternal} from '../terrain/terrain-production-owned-internal.js';
import {introduceTerrainProduction,advanceTerrainProductionWorld,chooseTerrainProductionWorld,improveTerrainProductionEnvironment,slowTerrainProductionClimate} from '../terrain/terrain-production-progression-v1.js';
import {prepareTerrainProductionSave} from '../terrain/terrain-production-storage-v1.js';
import {restoreTerrainProductionSave} from '../terrain/terrain-production-history-v1.js';
import {observeTerrainProductionScene,terrainProductionUseAt} from '../scene/terrain-production-scene-v1.js';
import type {EconomicProductionWorld} from '../irrigation/economic-production-types-v1.js';
import {knownEconomicProductionWorldInternal} from '../irrigation/economic-production-owned-internal.js';
import {introduceEconomicProduction,advanceEconomicProductionWorld,chooseEconomicProductionWorld,improveEconomicProductionEnvironment,slowEconomicProductionClimate} from '../irrigation/economic-production-progression-v1.js';
import {prepareEconomicProductionSave} from '../irrigation/economic-production-storage-v1.js';
import {restoreEconomicProductionSave} from '../irrigation/economic-production-history-v1.js';
import {observeEconomicProductionScene} from '../scene/economic-production-scene-v1.js';
import type {GeneratedSceneObservation} from '../scene/generated-scene-review.js';
import {knownArchitectureWorld,advanceArchitectureWorld,chooseArchitectureWorld,type ArchitectureProductionWorld} from '../architecture/production-v1.js';
import {prepareClimateWorldSave,restoreClimateWorldSave,worldClimate,worldFlora} from '../climate/climate-world-v1.js';
import type {LocalFlora} from '../flora/local-flora-v1.js';
import {floraSiteAt,type FloraPatchView} from '../flora/flora-growth-v1.js';
import type {WorldClimateBaseline} from '../climate/initial-climate-v1.js';
import {createArchitecturePainter} from '../architecture/scene-v1.js';
import {classifyLayout,layoutLabel,layoutThresholds,type LayoutBuilding} from '../architecture/layout-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import type {GeneratedStructurePainter} from '../scene/draw-generated-review.js';
import type {SceneFloraSource} from '../scene/flora-draw.js';
import {seasonalViewOf,seasonPhaseOfYear} from '../season/season-presentation-v1.js';
import {assertProductionBoundary} from './trial-boundary.js';
import {introduceProductionIrrigation,slowProductionClimate} from '../irrigation/production-progression-v1.js';
import {ownProductionWorld} from '../irrigation/production-history-v1.js';
import {relaxEnvironment} from '../environment/progression-v1.js';
import type {CoupledVegetation} from '../environment/model-v1.js';
/** One explicit mode controls progression, observation and persistence together. */
import {advance,choose,chooseAutomatically,legacyNames,type CivilizationState} from './engine.js';
import {advanceGeneratedBridgeReview,chooseGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview,type GeneratedBridgeReview} from './generated-bridge-review.js';
import {createGeneratedWorldSave,generatedWorld,restoreGeneratedWorld,validateWorldSave,type WorldSave,type LegacyWorldSave} from './world-save.js';
import {snapshotAt,type SiteSnapshot} from '../scene/model.js';
import {drawScene} from '../scene/draw.js';
import {observeGeneratedSceneReview} from '../scene/generated-scene-review.js';
import {drawGeneratedSceneReview} from '../scene/draw-generated-review.js';
export type BaselineGeneratedSession={mode:'generated';review:GeneratedBridgeReview;state:CivilizationState};
export type EconomicGeneratedSession={mode:'generated';review:EconomicProductionWorld;state:CivilizationState};
export type TerrainGeneratedSession={mode:'generated';review:TerrainProductionWorld;state:CivilizationState};
/**
 * Issue #35 D2-d/D3 (v9): the owned v8 world stays in `review`, so every v8 observation, control and
 * limit applies unchanged; `architecture` adds the recorded birth styles. Progression and persistence
 * always go through the v9 owner (checked before the v8 branch everywhere).
 */
export type ArchitectureGeneratedSession=TerrainGeneratedSession&{architecture:ArchitectureProductionWorld;
 /** Issue #47 B2a: the world's initial climate, a pure function of its seed; saved and checked in v10. */
 climate:WorldClimateBaseline;
 /** Issue #47 B2b: each patch's local habitat and initial plant community; saved and checked in v10. */
 flora:LocalFlora};
export type WorldSession=BaselineGeneratedSession|EconomicGeneratedSession|TerrainGeneratedSession|ArchitectureGeneratedSession|{mode:'legacy-fixed';template:LegacyWorldSave;state:CivilizationState};
function architecture(session:WorldSession):session is ArchitectureGeneratedSession {
 if(!('architecture' in session)||!session.architecture)return false;
 knownArchitectureWorld(session.architecture);
 if(session.review!==session.architecture.terrain||session.state!==session.architecture.terrain.review.state)throw Error('Architecture session differs from its owned world');return true;
}
export function architectureProductionSession(world:ArchitectureProductionWorld):ArchitectureGeneratedSession{knownArchitectureWorld(world);return {mode:'generated',review:world.terrain,state:world.terrain.review.state,architecture:world,climate:worldClimate(world),flora:worldFlora(world)};}
const painters=new WeakMap<ArchitectureProductionWorld,GeneratedStructurePainter>();
/**
 * D5 (Human decisions #2, #3): the district's layout in `year` as text for the observation panel, e.g.
 * 「水辺沿いに並ぶ町」. Classified from what stands there (architecture-layout-v1); read-only.
 * Undefined for sessions without the architecture record.
 */
export function worldStreetscapeAt(session:WorldSession,year:number,siteIndex:number):string|undefined{
 if(!architecture(session))return undefined;
 const o=observeGeneratedWorldSession(session,year,siteIndex),siteId=(['river-bank','hill-side','coast-inlet'] as const)[siteIndex]!;
 const births=session.architecture.architecture.births.filter(b=>b.ref.siteId===siteId&&b.source.year<=year);
 const foundation=(id:string)=>births.filter(b=>(b.ref.kind==='facility'?b.ref.id:b.ref.blockId)===id).at(-1)?.features.foundation;
 const kinds:Readonly<Record<string,LayoutBuilding['kind']>>={house:'house',hall:'hall',market:'market',workshop:'workshop',granary:'granary'};
 const buildings:LayoutBuilding[]=[];
 for(const b of o.snapshot.objects)if(b.condition!=='ruined'&&kinds[b.kind]){const f=foundation(b.id);buildings.push({x:b.x,y:b.y,kind:kinds[b.kind]!,...(f?{foundation:f}:{})});}
 for(const b of o.composition.residentialBlocks??[])if(b.condition!=='ruined'){const f=b.footprint,fd=foundation(b.blockId);
  buildings.push({x:f.x+f.width/2,y:f.y+f.depth/2,kind:'block',courtyard:b.roofParts.some(p=>p.styleId==='courtyard'),...(fd?{foundation:fd}:{})});}
 for(const p of o.snapshot.publicSpaces??[])buildings.push({x:p.footprint.x+p.footprint.width/2,y:p.footprint.y+p.footprint.depth/2,kind:'public'});
 const raster=readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics);
 // search as far as the classifier looks (layoutThresholds.waterReach); farther water counts as none
 const reach=layoutThresholds.waterReach+1;
 const waterDistance=(x:number,y:number)=>{let best=Infinity;for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++){const px=Math.round(x)+dx,py=Math.round(y)+dy;
  if(px<0||px>=320||py<0||py>=180)continue;const s=raster.surface[py*320+px];if(s===2||s===3)best=Math.min(best,Math.hypot(dx,dy));}return best;};
 return layoutLabel(classifyLayout({buildings,waterDistance}),o.composition.scale);
}
/** D4-c: a chronicle line for a v9 rebuild, shown right after the v8 record it rebuilt at. */
export interface ArchitectureChronicleNote {readonly afterRecordId:string;readonly year:number;readonly title:string}
const notes=new WeakMap<ArchitectureProductionWorld,readonly ArchitectureChronicleNote[]>();
const modeText:Readonly<Record<string,string>>={old:'もとの様式で',current:'その時の様式で',mixed:'もとの造りに、その時の様式を合わせて'};
const techText:Readonly<Record<string,string>>={'timber-span':'大スパンの木造で','masonry-arch':'石造とアーチで','metal-glass':'金属とガラスで'};
/** Read-only: v9 rebuild lines for the chronicle (empty for other sessions). */
export function worldArchitectureChronicle(session:WorldSession):readonly ArchitectureChronicleNote[]{
 if(!architecture(session))return [];
 const world=session.architecture,cached=notes.get(world);if(cached)return cached;
 const titles=new Map(world.terrain.review.state.history.map(h=>[h.id,h.title]));
 const list=world.architecture.births.filter(b=>b.rebuild&&b.source.recordId).map(b=>{
  const base=(titles.get(b.source.recordId!)??'建物').replace(/が(再利用|修繕)される$/,'')+'が建て直される';
  const mode=b.adjustments.find(x=>/^rebuild:(old|current|mixed)$/.test(x))?.slice(8)??'current',tech=b.adjustments.find(x=>x.startsWith('technology:'))?.slice(11);
  return {afterRecordId:b.source.recordId!,year:b.source.year,title:`${base}（${modeText[mode]}${tech&&techText[tech]?'、'+techText[tech]:''}）`};
 });
 notes.set(world,list);return list;
}
/** Read-only: the painter draws recorded birth styles and never changes the record (D2 §6.4). */
/** The recorded-style painter of a v9 session (undefined otherwise). Read-only; used by every scene painter. */
/**
 * Issue #47 B2c: plant development of one site in a confirmed year (appearance only; nothing civilisational
 * reads it). Undefined for sessions without the climate record.
 */
export function worldFloraAt(session:WorldSession,year:number,siteIndex:number):readonly (FloraPatchView|null)[]|undefined{
 if(!architecture(session))return undefined;
 const site=(['river-bank','hill-side','coast-inlet'] as const)[siteIndex];if(!site)throw Error('Invalid flora site');
 const observation=observeGeneratedWorldSession(session,year,siteIndex);
 return floraSiteAt({seed:session.state.seed,climate:session.climate,flora:session.flora,environment:session.review.environment!,year,site,vegetation:observation.ground.vegetation??[]});
}
export function worldStructurePainter(session:WorldSession):GeneratedStructurePainter|undefined{return architecture(session)?painterOf(session.architecture):undefined;}
/** Recorded birth styles plus the world's flora (Issue #47 B2d) and season (Issue #36 D2) of each observed year and site, cached per observation. */
function painterOf(world:ArchitectureProductionWorld):GeneratedStructurePainter{
 let p=painters.get(world);if(p)return p;
 const climate=worldClimate(world),flora=worldFlora(world),seen=new WeakMap<GeneratedSceneObservation,SceneFloraSource>();
 p={...createArchitecturePainter(world.architecture.births),flora:o=>{let f=seen.get(o);if(!f){
  f={seed:world.terrain.review.state.seed,patches:flora.sites[o.ground.site],views:floraSiteAt({seed:world.terrain.review.state.seed,climate,flora,environment:world.terrain.environment!,year:o.snapshot.year,site:o.ground.site,vegetation:o.ground.vegetation??[]}),
   // Issue #36 D2: the season of the observed confirmed year (appearance only; derived, never saved).
   season:seasonalViewOf(seasonPhaseOfYear(o.snapshot.year),climate)};
  seen.set(o,f);}return f;}};
 painters.set(world,p);return p;
}
function terrain(session:WorldSession):session is TerrainGeneratedSession {
 if(session.mode!=='generated'||session.review.format!=='terrain-production-world-v1')return false;
 knownTerrainProductionWorldInternal(session.review);if(session.state!==session.review.review.state)throw Error('Terrain session state differs from its owned world');return true;
}
export function terrainProductionSession(review:TerrainProductionWorld):TerrainGeneratedSession{knownTerrainProductionWorldInternal(review);return {mode:'generated',review,state:review.review.state};}
function economic(session:WorldSession):session is EconomicGeneratedSession {
 if(session.mode!=='generated'||session.review.format!=='irrigation-economic-production-world-v1')return false;
 knownEconomicProductionWorldInternal(session.review);if(session.state!==session.review.review.state)throw Error('Economic session state differs from its owned world');return true;
}
export function economicProductionSession(review:EconomicProductionWorld):EconomicGeneratedSession{knownEconomicProductionWorldInternal(review);return {mode:'generated',review,state:review.review.state};}

export function generatedSession(review:GeneratedBridgeReview):BaselineGeneratedSession {assertProductionBoundary(review);
 if(review.review.reservationMode!=='field-only')throw Error('Unapproved session policy');return {mode:'generated',review,state:review.review.state};
}
export function restoreWorldSession(save:WorldSave):WorldSession {
 const valid=validateWorldSave(save);if(valid.version===10)return architectureProductionSession(restoreClimateWorldSave(valid));if(valid.version===8)return terrainProductionSession(restoreTerrainProductionSave(valid));if(valid.version===7)return economicProductionSession(restoreEconomicProductionSave(valid));if(generatedWorld(valid))return generatedSession(restoreGeneratedWorld(valid));
 if(!valid.state.history.length)throw Error('Missing legacy birth record');
 if(valid.state.memory){const memory=valid.state.memory;if(!memory.legacies||typeof memory.legacies!=='object'||Array.isArray(memory.legacies)||!Array.isArray(memory.log)||memory.log.some(e=>!e||!Number.isSafeInteger(e.year)||e.year<0||e.year>valid.state.year||!Object.hasOwn(legacyNames,e.kind)))throw Error('Invalid legacy memory');}
 return {mode:'legacy-fixed',template:valid,state:structuredClone(valid.state)};
}
export function saveWorldSession(session:WorldSession):WorldSave {if(architecture(session))throw Error('Architecture sessions require prepareWorldSessionSave');if(terrain(session))throw Error('Terrain sessions require prepareWorldSessionSave');if(economic(session))throw Error('Economic sessions require prepareWorldSessionSave');if(session.mode==='generated')assertProductionBoundary(session.review);
 return session.mode==='generated'?createGeneratedWorldSave(session.review):validateWorldSave({...session.template,state:session.state});
}
export function advanceWorldSession(session:WorldSession,maxYears=36):WorldSession {
 if(terrain(session))throw Error('Terrain sessions require asynchronous advance');
 if(economic(session)){if(!Number.isSafeInteger(maxYears)||maxYears<0||maxYears>10000)throw Error('Invalid world advance');const years=Math.min(maxYears,Math.max(0,10000-session.state.year));return years?economicProductionSession(advanceEconomicProductionWorld(session.review,years,'stop',{stopAtNewRecord:true})):session;}
 if(session.mode==='generated')assertProductionBoundary(session.review);
 if(!Number.isSafeInteger(maxYears)||maxYears<0||maxYears>10000)throw Error('Invalid world advance');
 if(session.mode==='generated'&&session.review.irrigation){maxYears=Math.min(maxYears,Math.max(0,10000-session.state.year));if(!maxYears)return session;}
 if(session.mode==='generated')return generatedSession(advanceGeneratedBridgeReview(session.review,maxYears,'stop',{stopAtNewRecord:true}));
 const state=structuredClone(session.state),start=state.history.length;
 for(let i=0;i<maxYears&&!state.pending;i++){advance(state,1);if(state.history.length>start)break;}return {...session,state};
}
export function chooseWorldSession(session:WorldSession,index:number|'random'):WorldSession {if(terrain(session))throw Error('Terrain sessions require asynchronous choice');if(economic(session))return economicProductionSession(chooseEconomicProductionWorld(session.review,index));if(session.mode==='generated')assertProductionBoundary(session.review);
 if(session.mode==='generated')return generatedSession(index==='random'?chooseAutomaticallyGeneratedBridgeReview(session.review):chooseGeneratedBridgeReview(session.review,index));
 const state=structuredClone(session.state);if(index==='random')chooseAutomatically(state);else choose(state,index);return {...session,state};
}
export function observeWorldSession(session:WorldSession,year:number,siteIndex=0):SiteSnapshot {
 return session.mode==='generated'?observeGeneratedWorldSession(session,year,siteIndex).snapshot:snapshotAt(session.state,year,siteIndex);
}
export function drawWorldSession(canvas:HTMLCanvasElement,session:WorldSession,year:number,siteIndex=0):SiteSnapshot {
 if(session.mode==='generated'){const o=observeGeneratedWorldSession(session,year,siteIndex);drawGeneratedSceneReview(canvas,o,undefined,undefined,architecture(session)?painterOf(session.architecture):undefined);return o.snapshot;}
 const s=snapshotAt(session.state,year,siteIndex);drawScene(canvas,s,session.state.seed,session.state.housing);return s;
}

/** Explicit future-only opt-in. Existing foundations, records and terrain stay intact. */
export function improveWorldGrowth(session:WorldSession):WorldSession {if(architecture(session))return session;if(terrain(session))return session;if(economic(session))return session;if(session.mode==='generated')assertProductionBoundary(session.review);
 if(session.mode!=='generated')throw Error('Fixed worlds do not support generated growth');
 if(session.review.review.growthPattern==='organic-v3')return session;
 return generatedSession({...session.review,review:{...session.review.review,growthPattern:'organic-v3'}});
}

/** Explicit appearance upgrade; every recorded model value stays intact. */
export function improveWorldEnvironment(session:WorldSession):WorldSession {if(architecture(session))return session;if(terrain(session))return terrainProductionSession(improveTerrainProductionEnvironment(session.review));if(economic(session))return economicProductionSession(improveEconomicProductionEnvironment(session.review));if(session.mode==='generated')assertProductionBoundary(session.review);
 if(session.mode!=='generated'||!session.review.environment)throw Error('No recorded environment');
 if(session.review.environmentAppearance==='landscape-v3')return session;
 const next={...session.review,environmentAppearance:'landscape-v3' as const};return generatedSession(next.irrigation?ownProductionWorld(next):next);
}

/** Switch only future climate; observation, civilization and past ecology stay identical. */
export function slowWorldClimate(session:WorldSession):WorldSession {if(architecture(session))return session;if(terrain(session))return terrainProductionSession(slowTerrainProductionClimate(session.review));if(economic(session))return economicProductionSession(slowEconomicProductionClimate(session.review));if(session.mode==='generated')assertProductionBoundary(session.review);
 if(session.mode!=='generated'||!session.review.environment)throw Error('No recorded environment');
 if(session.review.irrigation)return generatedSession(slowProductionClimate(session.review));
 const environment=relaxEnvironment(session.review.environment,session.review.vegetation as CoupledVegetation,session.review.review);
 return environment===session.review.environment?session:generatedSession({...session.review,environment});
}

export function enableWorldIrrigation(session:WorldSession):WorldSession {if(architecture(session))return session;if(terrain(session))return session;if(economic(session))return session;if(session.mode!=='generated')throw Error('Generated environment required');return generatedSession(introduceProductionIrrigation(session.review));}

/** Complete async v7/v8 hashing before exposing a WorldSave to the common storage envelope. */
export async function prepareWorldSessionSave(session:WorldSession):Promise<WorldSave>{return architecture(session)?prepareClimateWorldSave(session.architecture):terrain(session)?prepareTerrainProductionSave(session.review):economic(session)?prepareEconomicProductionSave(session.review):saveWorldSession(session);}
export async function enableWorldEconomicCoupling(session:WorldSession):Promise<WorldSession>{
 if(architecture(session)||terrain(session))return session;
 if(economic(session))return session;if(session.mode!=='generated')throw Error('Generated v6 required');
 return economicProductionSession(await introduceEconomicProduction(session.review));
}
export function observeGeneratedWorldSession(session:BaselineGeneratedSession|EconomicGeneratedSession|TerrainGeneratedSession,year:number,siteIndex=0):GeneratedSceneObservation{
 return terrain(session)?observeTerrainProductionScene(session.review,year,siteIndex):economic(session)?observeEconomicProductionScene(session.review,year,siteIndex):observeGeneratedSceneReview(session.review,year,siteIndex);
}

/** New asynchronous contract; historical session APIs retain synchronous behavior. */
export async function advanceWorldSessionAsync(session:WorldSession,maxYears=36):Promise<WorldSession>{
 const v9=architecture(session);
 if(!v9&&!terrain(session))return advanceWorldSession(session,maxYears);
 if(!Number.isSafeInteger(maxYears)||maxYears<0||maxYears>10000)throw Error('Invalid world advance');const years=Math.min(maxYears,Math.max(0,10000-session.state.year));
 if(v9)return years?architectureProductionSession(await advanceArchitectureWorld(session.architecture,years,'stop',{stopAtNewRecord:true})):session;
 return years?terrainProductionSession(await advanceTerrainProductionWorld(session.review,years,'stop',{stopAtNewRecord:true})):session;
}
export async function chooseWorldSessionAsync(session:WorldSession,index:number|'random'):Promise<WorldSession>{return architecture(session)?architectureProductionSession(await chooseArchitectureWorld(session.architecture,index)):terrain(session)?terrainProductionSession(await chooseTerrainProductionWorld(session.review,index)):chooseWorldSession(session,index);}
export async function enableWorldTerrainDevelopment(session:WorldSession):Promise<WorldSession>{
 if(architecture(session)||terrain(session))return session;if(!economic(session))throw Error('Recorded v7 economics required for terrain adoption');return terrainProductionSession(await introduceTerrainProduction(session.review));
}
/** Observer metadata only, filtered to the requested confirmed year. */
export function worldTerrainDevelopmentAtYear(session:WorldSession,year:number){
 if(!terrain(session))return null;const w=session.review,t=w.terrainDevelopment;
 if(!Number.isSafeInteger(year)||year<0||year>t.confirmedThrough)throw Error('Unconfirmed terrain summary');
 const active=w.terrainHistory.events.filter(e=>e.effectiveYear<=year),next=w.terrainHistory.events.filter(e=>e.approvedYear<=year&&e.effectiveYear>year);
 return {introducedYear:t.introducedYear,activeCount:active.length,pendingCount:next.length,uses:active.length?terrainProductionUseAt(w,year):[]};
}
