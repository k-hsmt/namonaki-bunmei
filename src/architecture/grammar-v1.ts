/**
 * Issue #35 D2-a: world grammar, regional traditions and birth-time styles
 * (architecture-policy-v1 / architecture-use-rules-v1 / architecture-envelope-v2).
 * Pure and deterministic. Uses its own hash stream (terrainHash with architecture namespaces) and
 * never the civilization RNG, so adding architecture cannot change social, economic or terrain history.
 * Not yet connected to the annual batch, saves or the live renderer (D2-b / D2-c).
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import {d2Inconsistencies,advancedBirthInconsistencies,isAdvancedStructure,eavesKinds,pitches,roofFamilies,ARCHITECTURE_VOCAB_ID,ARCHITECTURE_CONSTRAINTS_ID,
 type ArchitectureSpec,type PartialSpec,type Use,type RoofFamily,type Eaves,type Pitch,type Structure,type WallMaterial,
 type Foundation,type RoofMaterial,type Window,type Entrance,type Ornament,type Palette} from './vocab-v1.js';
import {measureArchitecture,type ArchitectureEnvelope} from './draw-v1.js';
import {sitePercentiles,type SiteAdaptationInputs,type PlotAdaptationInputs} from './adaptation-v1.js';
import {ADAPTATION_REFERENCE_ID} from './adaptation-reference-v1.js';

export const architecturePolicy=Object.freeze({id:'architecture-policy-v1',vocab:ARCHITECTURE_VOCAB_ID,constraints:ARCHITECTURE_CONSTRAINTS_ID,
 useRules:'architecture-use-rules-v1',envelope:'architecture-envelope-v2',adaptation:'architecture-adaptation-v1',adaptationReference:ADAPTATION_REFERENCE_ID,introducedYear:0} as const);
export type ArchitectureSite='river-bank'|'hill-side'|'coast-inlet';

const H=(...parts:(string|number)[])=>terrainHash(parts);
type Entries<T extends string>=readonly (readonly [T,number])[];
/** Weighted pick by an integer hash. Weights are positive integers, so the result is exact. */
function pick<T extends string>(hash:number,entries:Entries<T>):T {
 const live=entries.filter(([,w])=>w>0);if(!live.length)throw Error('architecture: no candidate');
 let r=hash%live.reduce((a,[,w])=>a+w,0);
 for(const [v,w] of live){if(r<w)return v;r-=w;}
 return live[live.length-1]![0];
}

// ---- candidates the D2 grammar may select (no advanced technology) ----
export const regionalCandidates={
 structure:['S01','S02','S03','S04','S05','S06','S07'],
 foundation:['F1','F2','F3','F4','F5'],
 roofMaterial:['thatch','shingle','slate','tile','plaster'],
 window:['W1','W2','W3','W4','W5','W6'],
 /** E7 (wide opening) is functional and only enters through use rules. */
 entrance:['E1','E2','E3','E4','E5','E6'],
 palette:['P01','P02','P03','P04','P05'],
} as const satisfies Record<string,readonly string[]>;
const wallsFor:Readonly<Record<Exclude<Structure,'X1'|'X2'|'X3'>,readonly WallMaterial[]>>={
 S01:['wattle','plank','log'],S02:['plank','log'],S03:['earth','rammed','wattle'],S04:['rubble'],S05:['ashlar'],S06:['mixed'],S07:['plank','log','wattle'],
};
/** Whether a wall belongs to a vernacular structure in the D2 grammar (used by D3-b changes too). */
export const wallFits=(structure:Structure,wall:WallMaterial)=>(wallsFor[structure as keyof typeof wallsFor]??[]).includes(wall);
type RegionalAxis=keyof typeof regionalCandidates|'wall';
const allWalls:readonly WallMaterial[]=['log','plank','wattle','earth','rammed','rubble','ashlar','mixed'];
const ornamentIds:readonly Ornament[]=['O1','O2','O3','O4','O5','O6','O7','O8'];

export interface WorldArchitecturalGrammar {
 readonly policy:typeof architecturePolicy.id;readonly seed:number;
 /** Shared by all three sites (Human decision 4: roof and ornament are world-wide). */
 readonly shared:{readonly roofFamily:RoofFamily;readonly eaves:Eaves;readonly pitch:Pitch;readonly ornaments:readonly Ornament[]};
 /** Integer preference weights for site-level axes. */
 readonly weights:Readonly<Record<RegionalAxis,Readonly<Record<string,number>>>>;
}
export function createWorldGrammar(seed:number):WorldArchitecturalGrammar {
 if(!Number.isSafeInteger(seed)||seed<0)throw Error('architecture: invalid world seed');
 const g=(...k:(string|number)[])=>H('architecture-grammar-v1',seed,...k);
 const roofFamily=pick(g('roofFamily'),roofFamilies.map(r=>[r,1] as const));
 const eaves:Eaves=g('eaves')%100<35?'deep':'normal';
 const pitch=pick(g('pitch'),pitches.map(p=>[p,p==='mid'?2:1] as const));
 const ornaments=ornamentIds.filter(o=>g('ornament',o)%100<28);
 const weights={} as Record<RegionalAxis,Record<string,number>>;
 const axes:Record<RegionalAxis,readonly string[]>={...regionalCandidates,wall:allWalls};
 for(const [axis,list] of Object.entries(axes) as [RegionalAxis,readonly string[]][]){
  const favoured=list[g('favoured',axis)%list.length]!;
  weights[axis]=Object.fromEntries(list.map(v=>[v,(2+g('weight',axis,v)%5)*(v===favoured?3:1)]));
 }
 return {policy:architecturePolicy.id,seed,shared:{roofFamily,eaves,pitch,ornaments},weights};
}

// ---- regional adaptation (per-mille multipliers on grammar weights) ----
// Human decision on PR #113: options 2 + 3. Inputs are first converted to their position in the fixed
// world-wide reference distribution (sitePercentiles), and the kind of site itself also counts.
// The multiplier is 1000 + Σ k × percentile + 1000 × site-kind affinity; it shifts odds, never decides.
type Measure=(i:SiteAdaptationInputs)=>number;
const forest:Measure=i=>i.forest,open:Measure=i=>1000-i.forest,rock:Measure=i=>i.rock,slope:Measure=i=>i.slope,water:Measure=i=>i.water,dry:Measure=i=>1000-i.water;
const adaptation:Partial<Record<RegionalAxis,Readonly<Record<string,readonly (readonly [Measure,number])[]>>>>={
 structure:{S01:[[forest,2]],S02:[[forest,2]],S03:[[open,2]],S04:[[rock,3],[slope,1]],S05:[[rock,2],[slope,1]],S06:[[slope,1],[forest,1]],S07:[[water,3]]},
 wall:{log:[[forest,2]],plank:[[forest,1]],earth:[[open,2]],rammed:[[open,1],[dry,1]],rubble:[[rock,2]],ashlar:[[rock,1]]},
 foundation:{F1:[[i=>1000-i.slope,1]],F2:[[slope,1],[rock,1]],F3:[[water,2]],F4:[[slope,3]],F5:[[water,2]]},
 roofMaterial:{thatch:[[open,1]],shingle:[[forest,2]],slate:[[rock,3]],tile:[[open,1]],plaster:[[dry,1]]},
};
/** Palette follows the site's materials (Human decision 4: palette is per site). Colour never counts as form. */
const paletteAffinity:Readonly<Partial<Record<WallMaterial|RoofMaterial,Palette>>>={log:'P01',plank:'P01',shingle:'P01',earth:'P02',rammed:'P02',plaster:'P02',
 rubble:'P03',ashlar:'P03',slate:'P03',wattle:'P04',thatch:'P04',mixed:'P05',tile:'P02'};
/** Site kind as an input (option 3): river flats, hill slopes and the coastal inlet favour different builds. */
const siteAffinity:Readonly<Record<ArchitectureSite,Partial<Record<RegionalAxis,Readonly<Record<string,number>>>>>>={
 'river-bank':{structure:{S01:1,S02:1,S07:1},foundation:{F3:1,F5:1},wall:{wattle:1,plank:1},roofMaterial:{thatch:1,shingle:1}},
 'hill-side':{structure:{S04:1,S05:1,S06:1},foundation:{F2:1,F4:1},wall:{rubble:1,ashlar:1,mixed:1},roofMaterial:{slate:1}},
 'coast-inlet':{structure:{S02:1,S07:1},foundation:{F3:1,F5:1},wall:{plank:1,log:1},roofMaterial:{tile:1,shingle:1}},
};
const adaptedWeight=(grammar:WorldArchitecturalGrammar,axis:RegionalAxis,value:string,percentiles:SiteAdaptationInputs,site:ArchitectureSite)=>
 (grammar.weights[axis][value]??0)*(1000+(adaptation[axis]?.[value]??[]).reduce((a,[m,k])=>a+k*m(percentiles),0)+1000*(siteAffinity[site][axis]?.[value]??0));

export interface RegionalArchitecturalTradition {
 /** `inputs` are the recorded raw measures; `percentiles` their fixed world-wide position (derived, stored for audit). */
 readonly siteId:ArchitectureSite;readonly year:0;readonly inputs:SiteAdaptationInputs;readonly percentiles:SiteAdaptationInputs;
 readonly choices:{readonly structure:Structure;readonly wall:WallMaterial;readonly foundation:Foundation;readonly roofMaterial:RoofMaterial;
  readonly window:Window;readonly entrance:Entrance;readonly palette:Palette};
 /** Second-choice values the tradition also allows for individual variation. */
 readonly alternates:{readonly window:Window;readonly roofMaterial:RoofMaterial|null};
 /** D3-b: roof axes once this district's tradition has diverged from the world grammar. Absent at year 0. */
 readonly shared?:WorldArchitecturalGrammar['shared'];
}
const sharedSpec=(g:WorldArchitecturalGrammar):PartialSpec=>({roofFamily:g.shared.roofFamily,eaves:g.shared.eaves,pitch:g.shared.pitch});
/** Candidates that do not break any constraint already decided. */
const compatible=<T extends string>(base:PartialSpec,axis:keyof PartialSpec,list:readonly T[])=>list.filter(v=>!d2Inconsistencies({...base,[axis]:v}).length);

export function createRegionalTradition(grammar:WorldArchitecturalGrammar,siteId:ArchitectureSite,inputs:SiteAdaptationInputs):RegionalArchitecturalTradition {
 for(const v of Object.values(inputs))if(!Number.isSafeInteger(v)||v<0||v>1000)throw Error('architecture: adaptation inputs must be per-mille integers');
 const t=(...k:(string|number)[])=>H('architecture-tradition-v1',grammar.seed,siteId,...k);
 const spec:PartialSpec={use:'house',...sharedSpec(grammar)},pct=sitePercentiles(inputs);
 const weigh=(axis:RegionalAxis,v:string)=>adaptedWeight(grammar,axis,v,pct,siteId);
 const choose=<T extends string>(axis:RegionalAxis,list:readonly T[],salt='')=>pick(t(axis,salt),compatible(spec,axis as keyof PartialSpec,list).map(v=>[v,weigh(axis,v)] as const));
 spec.structure=choose('structure',regionalCandidates.structure);
 spec.wall=choose('wall',wallsFor[spec.structure as keyof typeof wallsFor]);
 spec.foundation=choose('foundation',regionalCandidates.foundation);
 spec.roofMaterial=choose('roofMaterial',regionalCandidates.roofMaterial);
 spec.window=choose('window',regionalCandidates.window);
 spec.entrance=choose('entrance',regionalCandidates.entrance);
 const palette=pick(t('palette'),regionalCandidates.palette.map(p=>[p,(grammar.weights.palette[p]??1)*((paletteAffinity[spec.wall!]===p?3:1)+(paletteAffinity[spec.roofMaterial!]===p?2:0))] as const));
 const otherWindows=regionalCandidates.window.filter(w=>w!==spec.window);
 const otherRoofs=compatible(spec,'roofMaterial',regionalCandidates.roofMaterial.filter(r=>r!==spec.roofMaterial));
 return {siteId,year:0,inputs:{...inputs},percentiles:pct,
  choices:{structure:spec.structure,wall:spec.wall,foundation:spec.foundation,roofMaterial:spec.roofMaterial,window:spec.window,entrance:spec.entrance,palette},
  alternates:{window:pick(t('alt-window'),otherWindows.map(v=>[v,weigh('window',v)] as const)),
   roofMaterial:otherRoofs.length?pick(t('alt-roof'),otherRoofs.map(v=>[v,weigh('roofMaterial',v)] as const)):null}};
}

// ---- use rules (architecture-use-rules-v1): functional differences, not culture ----
export interface UseRuleContext {readonly hash:number}
/** Applied to a culture's spec for one use. Generalises the D1 per-culture hand overrides. */
export function applyUseRules(spec:PartialSpec&{readonly use:Use},ctx:UseRuleContext={hash:0}):{spec:PartialSpec&{use:Use};applied:string[]} {
 const s:PartialSpec&{use:Use}={...spec,ornaments:[...(spec.ornaments??[])]},applied:string[]=[];
 const dressStone=()=>{if(s.structure==='S04'){s.structure='S05';s.wall='ashlar';applied.push('dressed-stone');}};
 switch(s.use){
  case 'hall':
   dressStone();
   if(!s.ornaments!.includes('O1')){s.ornaments=[...s.ornaments!,'O1'];applied.push('hall-ridge-ornament');}
   if((s.structure==='S05'||s.structure==='S06')&&ctx.hash%100<30){s.storeys=2;applied.push('hall-two-storeys');}
   break;
  case 'granary':
   dressStone();
   if(s.window!=='W6'){s.window='W1';applied.push('granary-small-windows');}
   break;
  case 'workshop':
   if(s.foundation!=='F5'&&s.eaves!=='deep'){s.entrance='E7';applied.push('workshop-wide-opening');}
   if(s.foundation==='F4'){s.foundation='F2';applied.push('workshop-level-floor');}
   break;
  case 'market':
   s.entrance=s.eaves==='deep'?'E3':s.foundation==='F5'||s.structure==='S07'?'E5':'E1';applied.push('market-open-front');
   break;
 }
 return {spec:s,applied};
}

// ---- birth (style fixed at construction) ----
export type BuildingRef=
 |{readonly kind:'facility';readonly siteId:ArchitectureSite;readonly id:string;readonly civic?:{readonly style:'great-hall'|'courtyard-hall';readonly constructionRecordId:string}}
 |{readonly kind:'housing';readonly siteId:ArchitectureSite;readonly blockId:string;readonly parts:{readonly from:number;readonly to:number}};
/** 'rebuilt' (D4): v9's rebuild at v8's recovery of a ruin (facility reused / housing repaired after ruin). */
export interface BirthSource {readonly kind:'built'|'expanded'|'rebuilt';readonly year:number;readonly seq?:number;readonly recordId?:string}
export interface Substitution {readonly axis:string;readonly from:string|number;readonly to:string|number;readonly reason:'constraint'|'envelope'}
export interface BirthStyle<E=ArchitectureEnvelope> {
 readonly status:'ok';readonly ref:BuildingRef;readonly source:BirthSource;readonly use:Use;readonly traditionSite:ArchitectureSite;
 readonly features:Omit<ArchitectureSpec,'use'|'faded'>;readonly envelope:E;
 readonly adjustments:readonly string[];readonly substitutions:readonly Substitution[];readonly envelopeStage:1|2|3|4|5;
}
export interface BirthHold {readonly status:'hold';readonly ref:BuildingRef;readonly source:BirthSource;readonly reason:'envelope'|'constraint';readonly detail:string}
export interface BirthInput {
 readonly grammar:WorldArchitecturalGrammar;readonly tradition:RegionalArchitecturalTradition;readonly ref:BuildingRef;readonly source:BirthSource;
 readonly use:Use;readonly plot:PlotAdaptationInputs;
 /** D3-c: technologies the district holds in the construction year (architecture-technology-v1). Absent = none. */
 readonly technologies?:readonly Technology[];
 /**
  * D4 (rebuild): the previous generation's features and the chosen way of rebuilding (D0 A14-A16).
  * 'old' reproduces them, 'mixed' keeps structure, wall and foundation, 'current' builds anew. An
  * advanced structure is kept only if the district still holds a technology for it.
  */
 readonly inherit?:{readonly features:Omit<ArchitectureSpec,'use'|'faded'>;readonly mode:'old'|'current'|'mixed'};
 /** D5: the district's settlement scale in the construction year (0 hamlet, 1 village, 2 town, 3 city; v8 observation ledger). */
 readonly scale?:number;
}
/** D5 (Human decision #1): uses that may rise to two storeys in towns and cities, and the per-cent chances (provisional). */
export const scaleStoreyUses:readonly Use[]=['house','rowhouse','courtyard','workshop','market'];
export const scaleStoreyChance:Readonly<Record<2|3,number>>={2:20,3:40};

// ---- advanced technology (D3-c, Human decision 2: only what D1 drew; no 3+ storeys) ----
/** T01+T07 large-span timber, T02+T04 masonry and arch, T05+T06+T09 metal support, glazing and skin. */
export type Technology='timber-span'|'masonry-arch'|'metal-glass';
export const technologies:readonly Technology[]=['timber-span','masonry-arch','metal-glass'];
/** Uses where a held technology may be adopted. Houses and granaries stay vernacular (D1 A1-A3; design §3.3). */
export const technologyUses:readonly Use[]=['hall','market','workshop'];
/** Per-cent chance that one of these buildings adopts a held technology. Provisional (D3-d). */
export const technologyAdoption=60;
/** The technology an advanced structure needs (D1 A1-A3). */
export const structureTechnology:Readonly<Record<'X1'|'X2'|'X3',Technology>>={X1:'timber-span',X2:'masonry-arch',X3:'metal-glass'};
/** What a building adopting the technology changes (the D1 A1-A3 vocabulary). */
function adoptTechnology(s:PartialSpec&{use:Use},t:Technology):void {
 switch(t){
  case 'timber-span':s.structure='X1';if(s.wall!=='plank'&&s.wall!=='log')s.wall='plank';break;
  case 'masonry-arch':s.structure='X2';s.wall='ashlar';s.foundation=s.use==='workshop'?(s.foundation==='F5'?'F2':s.foundation):'F6';break;
  case 'metal-glass':s.structure='X3';s.wall='metal';s.roofMaterial=s.use==='market'?'glazed':'metal';s.window='W7';s.foundation='F6';break;
 }
}
const refKey=(ref:BuildingRef,source:BirthSource)=>JSON.stringify([ref.kind,ref.siteId,ref.kind==='facility'?ref.id:ref.blockId,ref.kind==='housing'?[ref.parts.from,ref.parts.to]:null,source.kind,source.year,source.seq??null]);

/** Deterministic constraint repair. Each change is recorded; no change is silent. */
function repair(s:PartialSpec&{use:Use},subs:Substitution[],reason:Substitution['reason'],advanced=false):void {
 const check=advanced?advancedBirthInconsistencies:d2Inconsistencies;
 const set=<K extends keyof PartialSpec>(axis:K,to:NonNullable<PartialSpec[K]>)=>{subs.push({axis,from:String(s[axis]),to:String(to),reason});s[axis]=to;};
 for(let guard=0;guard<8;guard++){
  const issues=check(s);if(!issues.length)return;
  if(s.storeys===2&&issues.some(m=>m.includes('階')))set('storeys',1);
  else if(s.structure==='S07'&&s.foundation!=='F5')set('foundation','F5');
  else if(s.foundation==='F5'&&!['S01','S02','S07'].includes(s.structure!))set('foundation','F2');
  else if(s.entrance==='E3'&&s.eaves!=='deep')set('entrance',s.foundation==='F5'?'E5':'E1');
  else if(s.foundation==='F5'&&['E1','E2','E3','E6','E7'].includes(s.entrance!)&&s.use!=='market')set('entrance','E5');
  else if(s.entrance==='E5'&&s.foundation==='F1')set('entrance','E1');
  else if(s.roofMaterial==='thatch'&&(s.roofFamily==='R05'||s.pitch==='low'))set('roofMaterial','shingle');
  else if(s.roofMaterial==='plaster'&&!['R04','R05','R06'].includes(s.roofFamily!))set('roofMaterial','tile');
  else throw Error('architecture: unrepairable '+issues.join('; '));
 }
 throw Error('architecture: repair did not converge');
}

const facilityUses:readonly Use[]=['house','granary','workshop','market','hall'];
/** ResidentialBlock styleId low/terraced/courtyard map to house/rowhouse/courtyard (design §3.4). */
const housingUses:readonly Use[]=['house','rowhouse','courtyard'];
const nonEmpty=(v:unknown)=>typeof v==='string'&&v.length>0;
/**
 * Fail-closed entry checks for contradictions detectable without history (design §5.2). Matching
 * against the recorded placements / housing.events themselves happens when D2-b connects history.
 */
export function assertBirthInput(input:BirthInput):void {
 const {tradition,ref,source,use,plot}=input;
 const fail=(m:string):never=>{throw Error('architecture: '+m);};
 if(ref.siteId!==tradition.siteId)fail('tradition belongs to another site');
 if(!Number.isSafeInteger(source.year)||source.year<0)fail('invalid birth year');
 if(source.seq!==undefined&&(!Number.isSafeInteger(source.seq)||source.seq<0))fail('invalid source seq');
 if(source.recordId!==undefined&&!nonEmpty(source.recordId))fail('invalid source record id');
 if((source.kind==='rebuilt')!==(input.inherit!==undefined))fail('a rebuild needs its previous generation, and only a rebuild has one');
 if(ref.kind==='facility'){
  if(!nonEmpty(ref.id))fail('facility id required');
  if(source.kind!=='built'&&source.kind!=='rebuilt')fail('a facility birth must come from its built or rebuilt source');
  if(!facilityUses.includes(use))fail('use '+use+' is not a facility use');
  if(ref.civic){
   if(use!=='hall')fail('civic attribute only on halls');
   if(!['great-hall','courtyard-hall'].includes(ref.civic.style)||!nonEmpty(ref.civic.constructionRecordId))fail('invalid civic reference');
  }
 }else if(ref.kind==='housing'){
  if(!nonEmpty(ref.blockId))fail('housing block id required');
  const {from,to}=ref.parts??{};
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from!<0||from!>=to!)fail('housing parts must be integers with 0 <= from < to');
  if((source.kind==='built'||source.kind==='rebuilt')&&from!==0)fail('a built or rebuilt block starts at part 0');
  if(source.kind==='expanded'&&from===0)fail('an expansion adds parts after existing ones');
  if(source.kind!=='built'&&source.kind!=='expanded'&&source.kind!=='rebuilt')fail('unknown housing source');
  if(!housingUses.includes(use))fail('use '+use+' is not a housing use');
 }else fail('unknown building reference');
 if(!Number.isSafeInteger(plot?.grade)||plot.grade<0||plot.grade>1000||typeof plot.nearWater!=='boolean')fail('invalid plot inputs');
}

/**
 * Fixes the style of one construction. `fits` is required: it answers whether an envelope may occupy
 * the air above the plot (D2 §6.2). Production callers pass the real neighbour/bridge/water test;
 * only audits and unit tests may pass an explicit always-true predicate.
 */
/** Style fixed at construction without the air-space step (D2-b1; Human decision A on D2-b). */
export interface BirthFeatures {
 readonly status:'ok';readonly ref:BuildingRef;readonly source:BirthSource;readonly use:Use;readonly traditionSite:ArchitectureSite;
 readonly features:Omit<ArchitectureSpec,'use'|'faded'>;readonly adjustments:readonly string[];readonly substitutions:readonly Substitution[];
}
type Composed={spec:PartialSpec&{use:Use};adjustments:string[];subs:Substitution[];advanced:boolean};
function composeBirth(input:BirthInput):Composed|BirthHold {
 assertBirthInput(input);
 const {grammar,tradition,ref,source,use,plot}=input;
 const b=(...k:(string|number)[])=>H('architecture-birth-v1',grammar.seed,refKey(ref,source),...k);
 const c=tradition.choices,adjustments:string[]=[],subs:Substitution[]=[];
 const shared=tradition.shared??grammar.shared;
 const s:PartialSpec&{use:Use}={use,roofFamily:shared.roofFamily,eaves:shared.eaves,pitch:shared.pitch,structure:c.structure,wall:c.wall,foundation:c.foundation,roofMaterial:c.roofMaterial,
  window:c.window,entrance:c.entrance,palette:c.palette,ornaments:[...shared.ornaments],storeys:1};
 // individual variation inside what the tradition allows (D2 §3.5)
 if(b('pitch')%100<15){const i=pitches.indexOf(s.pitch!),j=Math.max(0,Math.min(2,i+(b('pitch-dir')%2?1:-1)));if(j!==i){s.pitch=pitches[j];adjustments.push('variation:pitch');}}
 if(b('window')%100<20){s.window=tradition.alternates.window;adjustments.push('variation:window');}
 if(tradition.alternates.roofMaterial&&b('roof')%100<10&&!d2Inconsistencies({...s,roofMaterial:tradition.alternates.roofMaterial}).length){s.roofMaterial=tradition.alternates.roofMaterial;adjustments.push('variation:roof-material');}
 const kept=s.ornaments!.filter(o=>b('ornament',o)%100<80);if(kept.length!==s.ornaments!.length){s.ornaments=kept;adjustments.push('variation:ornaments');}
 // plot adaptation at the construction year (D2 §4.3)
 if(s.foundation==='F1'&&plot.grade>=500){s.foundation='F4';adjustments.push('plot:slope');}
 else if(s.foundation==='F1'&&plot.nearWater&&b('wet')%100<50){s.foundation='F3';adjustments.push('plot:water');}
 // D4 rebuild: the way of rebuilding is settled first; an advanced structure is reproduced only while
 // its technology is still held, otherwise the rebuild is current
 const keep=(st:Structure)=>!isAdvancedStructure(st)||(input.technologies??[]).includes(structureTechnology[st as 'X1'|'X2'|'X3']);
 let mode=input.inherit?.mode;
 if(input.inherit&&mode!=='current'&&!keep(input.inherit.features.structure)){adjustments.push('rebuild:'+mode+'-technology-lost');mode='current';}
 // D3-c: a building of a technology use may adopt one technology its district holds in the construction
 // year (a rebuild only when it builds anew)
 const held=technologies.filter(t=>input.technologies?.includes(t));
 const advanced=held.length>0&&technologyUses.includes(use)&&(mode===undefined||mode==='current')&&b('technology')%100<technologyAdoption;
 if(advanced){const t=held[b('technology-pick')%held.length]!;adoptTechnology(s,t);adjustments.push('technology:'+t);}
 const ruled=applyUseRules(s,{hash:b('use')});Object.assign(s,ruled.spec);adjustments.push(...ruled.applied.map(a=>'use:'+a));
 // D4 rebuild: carry over the previous generation where the chosen way asks for it
 let rebuiltAdvanced=false;
 if(input.inherit){
  const prev=input.inherit.features;
  if(mode==='old'){Object.assign(s,{...prev,ornaments:[...prev.ornaments]});}
  else if(mode==='mixed'){s.structure=prev.structure;s.wall=prev.wall;s.foundation=prev.foundation;if(s.storeys!>1&&!['S05','S06','X1','X2','X3'].includes(s.structure))s.storeys=1;}
  rebuiltAdvanced=isAdvancedStructure(s.structure!);
  adjustments.push('rebuild:'+mode);
 }
 // D5: height by settlement scale (not when a rebuild reproduces the old building)
 const scale=input.scale??0;
 if(mode!=='old'&&scale>=2&&scaleStoreyUses.includes(use)&&(s.structure==='S05'||s.structure==='S06'||isAdvancedStructure(s.structure!))&&
  b('storeys')%100<scaleStoreyChance[scale>=3?3:2]){s.storeys=2;adjustments.push('scale:two-storeys');}
 const anyAdvanced=advanced||rebuiltAdvanced;
 try{repair(s,subs,'constraint',anyAdvanced);}catch(e){return {status:'hold',ref,source,reason:'constraint',detail:String((e as Error).message)};}
 return {spec:s,adjustments,subs,advanced:anyAdvanced};
}
const featuresOf=(x:PartialSpec&{use:Use})=>{const {use:_,faded:__,...features}=x as ArchitectureSpec;return {...features,ornaments:[...features.ornaments]};};
/** D2-b1: the recorded birth style. No envelope; the air-space contract is added in D2-b2 after D2-c fixes drawing geometry. */
export function deriveBirthFeatures(input:BirthInput):BirthFeatures|BirthHold {
 const composed=composeBirth(input);if('status' in composed)return composed;
 return {status:'ok',ref:input.ref,source:input.source,use:input.use,traditionSite:input.tradition.siteId,features:featuresOf(composed.spec),adjustments:composed.adjustments,substitutions:composed.subs};
}
const lowerRoof:Readonly<Record<RoofFamily,RoofFamily>>={R01:'R03',R02:'R03',R08:'R03',R03:'R05',R04:'R05',R06:'R05',R05:'R05'};
/**
 * Full birth with the air-space fallback chain (D2-b2). `fits` is required. `measure` turns a candidate
 * spec into its envelope; the default is the relative D1 bounds, production passes the absolute
 * air-space geometry of airspace-v1.
 */
export function deriveBirthStyle<E=ArchitectureEnvelope>(input:BirthInput,fits:(e:E)=>boolean,measure:(spec:PartialSpec&{use:Use})=>E=measureArchitecture as unknown as (spec:PartialSpec&{use:Use})=>E):BirthStyle<E>|BirthHold {
 if(typeof fits!=='function')throw Error('architecture: the envelope fit test is required');
 const composed=composeBirth(input);if('status' in composed)return composed;
 const {ref,source,use,tradition}=input,{spec:s,adjustments,subs,advanced}=composed;
 // envelope fallback chain (architecture-envelope-v2, D2 §6.2). Stage 5 may still fail: fail closed.
 const stages:((x:PartialSpec&{use:Use})=>void)[]=[
  ()=>{},
  x=>{if(x.eaves==='deep'){subs.push({axis:'eaves',from:'deep',to:'normal',reason:'envelope'});x.eaves='normal';}},
  x=>{const i=pitches.indexOf(x.pitch!);if(i>0){subs.push({axis:'pitch',from:x.pitch!,to:pitches[i-1]!,reason:'envelope'});x.pitch=pitches[i-1];}},
  // Stage 4 (Human decision on D2-c', architecture-envelope-v2): the nearest LOWER roof of the same
  // character. Peaked roofs (gable, steep gable, composite) become a hip roof, which keeps a peaked
  // outline but rises less; stepped, hip and shed roofs become flat. Flat stays flat.
  x=>{const to:RoofFamily=lowerRoof[x.roofFamily!];if(to!==x.roofFamily){subs.push({axis:'roofFamily',from:x.roofFamily!,to,reason:'envelope'});x.roofFamily=to;}},
  x=>{for(const [axis,to] of [['roofFamily','R05'],['eaves','normal'],['pitch','low']] as const)if(x[axis]!==to){subs.push({axis,from:String(x[axis]),to,reason:'envelope'});(x as Record<string,unknown>)[axis]=to;}},
 ];
 const work={...s};
 for(let stage=0;stage<stages.length;stage++){
  stages[stage]!(work);
  try{repair(work,subs,'constraint',advanced);}catch(e){return {status:'hold',ref,source,reason:'constraint',detail:String((e as Error).message)};}
  let envelope=measure(work);
  // D5: a storey added for the town's scale is the first thing given up when the air above is taken
  if(stage===0&&!fits(envelope)&&work.storeys===2&&adjustments.includes('scale:two-storeys')){
   subs.push({axis:'storeys',from:2,to:1,reason:'envelope'});work.storeys=1;envelope=measure(work);
  }
  if(fits(envelope))return {status:'ok',ref,source,use,traditionSite:tradition.siteId,features:featuresOf(work),envelope,adjustments,substitutions:subs,envelopeStage:(stage+1) as 1|2|3|4|5};
 }
 return {status:'hold',ref,source,reason:'envelope',detail:'no fallback stage fits the air above the plot'};
}
/** Exposed for tests: the eaves/pitch/roof vocab the chain may move through. */
export const envelopeVocabulary={eavesKinds,pitches,roofFamilies} as const;
