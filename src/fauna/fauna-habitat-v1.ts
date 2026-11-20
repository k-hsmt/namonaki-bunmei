/**
 * Issue #38 D1b PROTOTYPE: habitat candidates, suitability and the appearance plan of one confirmed year
 * (ruleId fauna-habitat-v1). Appearance only (D0 §3, §11): nothing here is saved, and nothing in the live game
 * reads it. The live scene is not connected before the Human review of D1c (D0 §13).
 *
 * D0 §3 layers:
 *  1. HabitatCandidates: fixed points in record coordinates from (seed, site, cell) only. Never renumbered by year,
 *     environment or what is shown; a candidate that is unusable in a year simply shows nothing (D0 §4).
 *  2. Projection: per candidate and group, a suitability 0..1 from that year's confirmed terrain, plants, buildings
 *     and population (inputs of years after `year` are never passed in, so they cannot be read).
 *  3. AppearancePlan: which candidates show which kind, how many, and where each one stands. Every animal is placed
 *     only where its body fits on land (or water) of that year, off buildings; otherwise it is dropped, never moved
 *     far away (no warp, D0 §4). Missing terrain or plants fail closed.
 * Every choice comes from fixed thresholds and terrainHash(['fauna-habitat-v1', ...]); no RNG stream, no clock.
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import {FAUNA_SIZE,FAUNA_GROUP,faunaSprite,faunaBounds,faunaDepthSize,type FaunaKind,type FaunaGroup,type FaunaPose} from './fauna-sprites-v1.js';

export const FAUNA_HABITAT_RULE_ID='fauna-habitat-v1' as const;
type Site='river-bank'|'hill-side'|'coast-inlet';
/** Order of initial-climate-v1 BIOME_KINDS and local-flora-v1 HABITATS (the patch tuple stores these indices). */
const BIOMES=['desert','steppe','grassland','temperate_forest','tropical_rainforest','boreal_forest','tundra'] as const;
type Biome=typeof BIOMES[number];
const HABITATS=['ordinary','riparian','wetland','coastal','rocky'] as const;
type Habitat=typeof HABITATS[number];

/** Candidate grid: 20 × 7 cells of 16 × 12 px over the ground band (y 96–179). One candidate per cell. */
export const HABITAT_GRID=Object.freeze({cellWidth:16,cellHeight:12,top:96,cols:20,rows:7});
export const FAUNA_GROUPS:readonly FaunaGroup[]=Object.freeze(['large-herbivore','small-ground','small-bird','water-bird','flying-bird']);

/**
 * D1b parameters (to be calibrated by Human review). Thresholds were set from the measured suitabilities of the 7
 * biome worlds (D1b record §4) so that a site usually shows few animals (D0 §7). Thresholds are per group; each candidate shifts its own threshold
 * by ±spread/2 from a fixed hash, so neighbouring candidates do not switch on and off together.
 */
export const HABITAT_PARAMETERS=Object.freeze({
 threshold:{'large-herbivore':.7,'small-ground':.85,'small-bird':.75,'water-bird':.8,'flying-bird':.8} as Readonly<Record<FaunaGroup,number>>,
 thresholdSpread:.1,
 /** Neighbourhood radius (px) over which plants and water are read, per group (D0 §4: several patches, never one patch = one animal). */
 radius:{'large-herbivore':32,'small-ground':12,'small-bird':16,'water-bird':12,'flying-bird':48} as Readonly<Record<FaunaGroup,number>>,
 /** Distance (px) from standing buildings below which a group avoids a place, scaled by 0.5 + population pressure. */
 avoid:{'large-herbivore':[24,48],'small-ground':[8,20],'water-bird':[12,30]} as Readonly<Partial<Record<FaunaGroup,readonly [number,number]>>>,
 /** Fit of each biome per group (D0 §6 table). A riparian or wetland patch raises land groups to at least 0.8 (D0 §5). */
 biomeFit:{
  'large-herbivore':{desert:.6,steppe:.9,grassland:1,temperate_forest:.9,tropical_rainforest:.8,boreal_forest:.8,tundra:.6},
  'small-ground':{desert:1,steppe:.9,grassland:.9,temperate_forest:1,tropical_rainforest:1,boreal_forest:.8,tundra:.7},
  'small-bird':{desert:.8,steppe:.8,grassland:.9,temperate_forest:1,tropical_rainforest:1,boreal_forest:.8,tundra:.5},
  'water-bird':{desert:1,steppe:1,grassland:1,temperate_forest:1,tropical_rainforest:1,boreal_forest:1,tundra:1},
  'flying-bird':{desert:.8,steppe:.8,grassland:.9,temperate_forest:1,tropical_rainforest:1,boreal_forest:.9,tundra:.6},
 } as Readonly<Record<FaunaGroup,Readonly<Record<Biome,number>>>>,
 /** Largest group per kind of group, groups per site and year, animals per site and year, and the spacing of groups. */
 groupSize:{'large-herbivore':5,'small-ground':2,'small-bird':3,'water-bird':3,'flying-bird':3} as Readonly<Record<FaunaGroup,number>>,
 groupsPerSite:{'large-herbivore':2,'small-ground':1,'small-bird':1,'water-bird':1,'flying-bird':1} as Readonly<Record<FaunaGroup,number>>,
 /** A site with sea may show this many water-bird groups (Human review D1b-2: more kinds at the coast). */
 coastWaterGroups:2,
 animalsPerSite:10,
 groupSpacing:20,
 /** Margin (px) kept from standing building plots around each animal's body. */
 buildingMargin:{'large-herbivore':6,'small-ground':3,'small-bird':2,'water-bird':3,'flying-bird':0} as Readonly<Record<FaunaGroup,number>>,
 /** Room to take a short step: the body must also fit this many px to each side (D0 §8, local movement). */
 stepRoom:2,
 /** Flying birds keep above this row (building plots give no roof height, so the sky stays clear of every roof). */
 skyFloor:60,
});

export interface HabitatCandidate {readonly id:string;readonly col:number;readonly row:number;readonly x:number;readonly y:number}
/** The fixed candidates of a site: one point per grid cell, from (seed, site, cell) only. */
export function faunaHabitatCandidates(seed:number,site:Site):readonly HabitatCandidate[] {
 if(!Number.isSafeInteger(seed))throw Error('Invalid world seed');
 const G=HABITAT_GRID,out:HabitatCandidate[]=[];
 for(let row=0;row<G.rows;row++)for(let col=0;col<G.cols;col++){
  const h=terrainHash([FAUNA_HABITAT_RULE_ID,'candidate',seed,site,col,row]);
  out.push(Object.freeze({id:`${site}:${col}:${row}`,col,row,x:col*G.cellWidth+2+h%(G.cellWidth-4),y:G.top+row*G.cellHeight+2+Math.floor(h/97)%(G.cellHeight-3)}));
 }
 return Object.freeze(out);
}
/** A candidate's own threshold for a group (fixed: never depends on the year or the environment). */
export function candidateThreshold(seed:number,c:HabitatCandidate,g:FaunaGroup):number {
 const P=HABITAT_PARAMETERS,h=terrainHash([FAUNA_HABITAT_RULE_ID,'threshold',seed,c.id,g])%1000/999;
 return Math.round((P.threshold[g]+(h-.5)*P.thresholdSpread)*1000)/1000;
}

export interface HabitatPlot {readonly x:number;readonly y:number;readonly width:number;readonly depth:number}
/**
 * One site in one confirmed year. `patches` are the local-flora-v1 tuples and `views` the flora-growth-v1 views of
 * that year (440 each, null where there is no land patch). `standing` are the plots of that year that a body may not
 * enter (buildings in use or in ruins, fields, used public spaces, bridges: scene/flora-draw sceneOccupiedPlots).
 */
export interface FaunaHabitatYear {
 readonly seed:number;readonly site:Site;readonly year:number;
 readonly surface:Uint8Array;readonly grade:Uint8Array;
 readonly patches:readonly (readonly number[]|null)[];readonly views:readonly ({readonly stage:number}|null)[];
 readonly standing:readonly HabitatPlot[];readonly population:number;
}
export interface HabitatFeatures {
 readonly land:boolean;readonly biome:Biome|null;readonly habitat:Habitat|null;
 /** Shares of the land patches around the point (per group radius): open (grass, shrub, young growth), cover (trees at stage ≥ 3), bare (stage 0). */
 readonly open:number;readonly cover:number;readonly bare:number;
 /** Shares of water pixels around the point, and whether fresh / sea water is within 6 px. */
 readonly water:number;readonly sea:number;readonly freshNear:boolean;readonly waterNear:boolean;
 /** Distance (px, Chebyshev to the plot rectangle) to the nearest standing plot; Infinity without any. */
 readonly human:number;
 /** 0..1 from the district population: log10(1 + population) / 5. */
 readonly pressure:number;
}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number,a:number,b:number)=>clamp((v-a)/(b-a));
const round3=(v:number)=>Math.round(v*1000)/1000;
function validate(y:FaunaHabitatYear):void {
 if(!y||!(y.surface instanceof Uint8Array)||y.surface.length!==57600||!(y.grade instanceof Uint8Array)||y.grade.length!==57600)throw Error('Fauna habitat needs the terrain of the year');
 if(!Array.isArray(y.patches)||y.patches.length!==440||!Array.isArray(y.views)||y.views.length!==440)throw Error('Fauna habitat needs the plants of the year');
 if(!Number.isSafeInteger(y.year)||y.year<0||!Number.isFinite(y.population)||y.population<0)throw Error('Invalid fauna habitat year');
}
const distanceTo=(p:HabitatPlot,x:number,y:number)=>Math.max(p.x-x,x-(p.x+p.width-1),p.y-y,y-(p.y+p.depth-1),0);

/** Features read at a point with a radius. Pure. */
export function habitatFeatures(input:FaunaHabitatYear,x:number,y:number,radius:number):HabitatFeatures {
 validate(input);
 const S=input.surface,at=(px:number,py:number)=>px>=0&&px<320&&py>=96&&py<180?S[py*320+px]!:0;
 let n=0,open=0,cover=0,bare=0;
 // only the patches whose centre can be within reach (the same test below decides; Issue #38 D2 performance)
 const reach=radius+4,c0=Math.max(0,Math.ceil((x-reach-4)/8)),c1=Math.min(39,Math.floor((x+reach-4)/8)),r0=Math.max(0,Math.ceil((y-reach-100)/8)),r1=Math.min(10,Math.floor((y+reach-100)/8));
 for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++){
  const i=row*40+col,p=input.patches[i],v=input.views[i];if(!p||!v)continue;
  const cx=col*8+4,cy=96+row*8+4;if(Math.abs(cx-x)+Math.abs(cy-y)>reach)continue;
  n++;if(v.stage===0)bare++;else if(p[2]!>=0&&v.stage>=3)cover++;else open++;
 }
 let samples=0,water=0,sea=0;
 for(let dy=-radius;dy<=radius;dy+=2)for(let dx=-radius;dx<=radius;dx+=2){if(Math.abs(dx)+Math.abs(dy)>radius)continue;const s=at(x+dx,y+dy);if(s===0)continue;samples++;if(s===2||s===3)water++;if(s===3)sea++;}
 let freshNear=false,waterNear=false;
 for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){const s=at(x+dx,y+dy);if(s===2)freshNear=true;if(s===2||s===3)waterNear=true;}
 const near=Math.floor((y-96)/8)*40+Math.floor(x/8),patch=near>=0&&near<440?input.patches[near]:null;
 const human=input.standing.reduce((m,p)=>Math.min(m,distanceTo(p,x,y)),Infinity);
 return Object.freeze({land:at(x,y)===1,biome:patch?BIOMES[patch[1]!]??null:null,habitat:patch?HABITATS[patch[0]!]??null:null,
  open:n?round3(open/n):0,cover:n?round3(cover/n):0,bare:n?round3(bare/n):0,
  water:samples?round3(water/samples):0,sea:samples?round3(sea/samples):0,freshNear,waterNear,
  human,pressure:round3(clamp(Math.log10(1+input.population)/5))});
}
/** Avoidance of standing buildings (1 = none), the distance band growing with population pressure. */
const avoidance=(g:FaunaGroup,f:HabitatFeatures)=>{const a=HABITAT_PARAMETERS.avoid[g];if(!a||f.human===Infinity)return 1;const k=.5+f.pressure;return smooth(f.human,a[0]*k,a[1]*k);};
const fitOf=(g:FaunaGroup,f:HabitatFeatures)=>{if(!f.biome)return 0;const base=HABITAT_PARAMETERS.biomeFit[g][f.biome];
 return g!=='water-bird'&&g!=='flying-bird'&&(f.habitat==='riparian'||f.habitat==='wetland')?Math.max(base,.8):f.habitat==='rocky'&&g==='large-herbivore'?base*.6:base;};

/**
 * Suitability 0..1 of each group at a candidate in a year (0 where a requirement fails). Groups react to people in
 * different directions (D0 §5: no rule that every group falls as people grow): large herbivores and small ground
 * animals avoid buildings, small birds favour the edge of a settlement, crows ignore it.
 */
export function faunaSuitability(input:FaunaHabitatYear,c:HabitatCandidate):Readonly<Record<FaunaGroup,number>> {
 const R=HABITAT_PARAMETERS.radius,F=(g:FaunaGroup)=>habitatFeatures(input,c.x,c.y,R[g]),out={} as Record<FaunaGroup,number>;
 const large=F('large-herbivore'),small=F('small-ground'),bird=F('small-bird'),water=F('water-bird');
 // in the rainforest the woodland itself is the habitat, so it does not empty as the forest matures (Human review
 // D1b-4). Temperate and boreal forests keep the reviewed weights (their amounts were accepted in D1b-1).
 const forest=(f:HabitatFeatures)=>f.biome==='tropical_rainforest';
 out['large-herbivore']=large.land?round3(clamp(large.open+(forest(large)?.9:.3)*large.cover)*fitOf('large-herbivore',large)*avoidance('large-herbivore',large)):0;
 out['small-ground']=small.land?round3(clamp(small.open+(forest(small)?1:.8)*small.cover)*fitOf('small-ground',small)*avoidance('small-ground',small)):0;
 // small birds: 0.7 away from people, up to 1.0 about 20 px from a building, 0.3 right next to one
 const edge=bird.human===Infinity?.7:bird.human<4?.3:.7+.3*Math.max(0,1-Math.abs(bird.human-20)/20);
 out['small-bird']=bird.land?round3(clamp(bird.open+(forest(bird)?.9:.7)*bird.cover+.3*bird.bare)*fitOf('small-bird',bird)*edge):0;
 out['water-bird']=water.waterNear?round3(clamp(water.water*1.5)*(water.freshNear||water.habitat==='wetland'||water.habitat==='coastal'?1:.6)*avoidance('water-bird',water)):0;
 if(c.row===0){
  const sky=F('flying-bird');
  out['flying-bird']=round3(Math.max(clamp(sky.sea*1.5),clamp(sky.open+.5*sky.bare+(forest(sky)?1:.3)*sky.cover)*fitOf('flying-bird',sky)));
 }else out['flying-bird']=0;
 return Object.freeze(out);
}
/** The provisional kind a group shows at a candidate (D0 §6 table; not a species decided by the world). */
export function faunaKindAt(input:FaunaHabitatYear,c:HabitatCandidate,g:FaunaGroup):FaunaKind {
 const f=habitatFeatures(input,c.x,c.y,HABITAT_PARAMETERS.radius[g]),b=f.biome,h=terrainHash([FAUNA_HABITAT_RULE_ID,'kind',input.seed,c.id,g]);
 if(g==='large-herbivore')return b==='tundra'?'bison':b==='steppe'?(['horse','bison','gazelle'] as const)[h%3]!:b==='grassland'?(h%3===0?'gazelle':'horse'):b==='desert'?'gazelle'
  :b==='tropical_rainforest'?(h%3===0?'deer':'boar'):b==='temperate_forest'?(h%3===0?'boar':'deer'):'deer';
 if(g==='small-ground')return b==='desert'?(h%2?'lizard':'hare'):b==='tropical_rainforest'?(['lizard','fox','hare'] as const)[h%3]!
  :b==='temperate_forest'||b==='boreal_forest'?(h%3===0?'fox':'hare'):h%4===0?'fox':'hare';
 if(g==='small-bird')return 'sparrow';
 // water birds: a heron on a shore, ducks or gulls on the water (at the sea both; Human review D1b-2 asked for variety)
 if(g==='water-bird')return f.land?'heron':f.sea>.15?(h%2?'gull':'duck'):f.freshNear&&f.habitat!=='coastal'&&h%3===0?'heron':'duck';
 return b==='tropical_rainforest'?(h%3===0?'crow':'parrot'):f.sea>.15?(h%3===0?'crow':'gull'):'crow';
}

/** Mean of a candidate's suitabilities over sampled years up to the observed one (the smoothing alternative, D0 §5). */
export function smoothedSuitability(history:readonly Readonly<Record<FaunaGroup,number>>[]):Readonly<Record<FaunaGroup,number>> {
 if(history.length===0)throw Error('Empty suitability history');
 const out={} as Record<FaunaGroup,number>;for(const g of FAUNA_GROUPS)out[g]=round3(history.reduce((s,h)=>s+h[g],0)/history.length);
 return Object.freeze(out);
}

export interface FaunaMember {readonly kind:FaunaKind;readonly size:number;readonly pose:FaunaPose;readonly x:number;readonly y:number;readonly facing:1|-1}
export interface FaunaGroupPlan {readonly candidate:string;readonly group:FaunaGroup;readonly kind:FaunaKind;readonly suitability:number;readonly threshold:number;readonly members:readonly FaunaMember[]}
export interface FaunaAppearancePlan {
 readonly ruleId:typeof FAUNA_HABITAT_RULE_ID;readonly seed:number;readonly site:Site;readonly year:number;
 readonly groups:readonly FaunaGroupPlan[];
 /** Candidates above their threshold that showed nothing, by reason (counted, never moved elsewhere). */
 readonly dropped:Readonly<Record<'cap'|'spacing'|'no-room',number>>;
}
const restPose=(g:FaunaGroup,k:FaunaKind):FaunaPose=>g==='flying-bird'?'glide':g==='water-bird'&&k!=='heron'?'float':k==='hare'?'sit':'stand';
const isLand=(input:FaunaHabitatYear,x:number,y:number)=>x>=0&&x<320&&y>=96&&y<180&&input.surface[y*320+x]===1&&input.grade[y*320+x]!<=1;
const isWater=(input:FaunaHabitatYear,x:number,y:number)=>x>=0&&x<320&&y>=96&&y<180&&(input.surface[y*320+x]===2||input.surface[y*320+x]===3);
/**
 * Whether a body of `kind` and `size` in `pose` fits with its origin at (x, y) in that year: every foot pixel on land
 * (gentle grade) or on water for a floating bird, the whole body clear of standing plots by the group margin, and
 * room for a short step to each side (`room` px; 0 checks the spot alone). `frame` picks the sprite frame. `facing`
 * mirrors the sprite about its origin column; 'both' (the plan's default) requires both facings to fit, because a
 * member turns while it moves. A heron stands on land with water within 4 px. Flying birds stay in the sky.
 */
export function faunaBodyFits(input:FaunaHabitatYear,kind:FaunaKind,size:number,pose:FaunaPose,x:number,y:number,frame=0,room:number=HABITAT_PARAMETERS.stepRoom,facing:1|-1|'both'='both'):boolean {
 validate(input);
 if(facing==='both')return faunaBodyFits(input,kind,size,pose,x,y,frame,room,1)&&faunaBodyFits(input,kind,size,pose,x,y,frame,room,-1);
 const rects=faunaSprite(kind,size,pose,frame),b=faunaBounds(rects),group=FAUNA_GROUP[kind],m=HABITAT_PARAMETERS.buildingMargin[group];
 const left=facing===1?b.left:-b.right,right=facing===1?b.right:-b.left,px=(r:{x:number;w:number},k:number)=>facing===1?r.x+k:-r.x-k;
 if(group==='flying-bird')return y+b.bottom<HABITAT_PARAMETERS.skyFloor&&y+b.top>=0&&x+left>=0&&x+right<320;
 const water=pose==='float'||pose==='dabble';
 for(const dx of room?[-room,0,room]:[0]){
  for(const r of rects){if(r.y+r.h-1!==0)continue;for(let k=0;k<r.w;k++){const fx=x+dx+px(r,k);if(water?!isWater(input,fx,y):!isLand(input,fx,y))return false;}}
  const L=x+dx+left-m,Rr=x+dx+right+m,T=y+b.top-m,B=y+b.bottom+m;
  if(input.standing.some(p=>L<p.x+p.width&&Rr>=p.x&&T<p.y+p.depth&&B>=p.y))return false;
 }
 if(kind==='heron'){let near=false;for(let dy=-4;dy<=4&&!near;dy++)for(let dx=-4;dx<=4;dx++)if(isWater(input,x+dx,y+dy)){near=true;break;}if(!near)return false;}
 return true;
}
/** The box a member's body can cover facing either way (the sprite mirrored about its origin column). */
const memberBox=(kind:FaunaKind,size:number,pose:FaunaPose,x:number,y:number)=>{const b=faunaBounds(faunaSprite(kind,size,pose,0)),reach=Math.max(-b.left,b.right);return {left:x-reach,right:x+reach,top:y+b.top,bottom:y+b.bottom};};
/** Body size by depth (Human decision D1a-3); flying birds keep their near size. */
const sizeAt=(kind:FaunaKind,y:number)=>FAUNA_GROUP[kind]==='flying-bird'?FAUNA_SIZE[kind].preset:faunaDepthSize(kind,FAUNA_SIZE[kind].preset,Math.max(0,Math.min(1,(y-96)/84)));

/**
 * The appearance plan of a site in a year. `suitability` may be the year's own values (fixed thresholds) or the
 * smoothed values over earlier sampled years; the rest of the plan is the same. Pure and deterministic.
 */
export function planFaunaAppearance(input:FaunaHabitatYear,suitability?:ReadonlyMap<string,Readonly<Record<FaunaGroup,number>>>):FaunaAppearancePlan {
 validate(input);
 const P=HABITAT_PARAMETERS,cands=faunaHabitatCandidates(input.seed,input.site),H=(...k:(string|number)[])=>terrainHash([FAUNA_HABITAT_RULE_ID,input.seed,...k]);
 const ranked:{c:HabitatCandidate;g:FaunaGroup;s:number;t:number}[]=[];
 for(const c of cands){const s=suitability?.get(c.id)??faunaSuitability(input,c);for(const g of FAUNA_GROUPS){const t=candidateThreshold(input.seed,c,g);if(s[g]>=t)ranked.push({c,g,s:s[g],t});}}
 // a fixed priority per candidate and group (never the year's margin): a candidate that keeps qualifying keeps its
 // place, so near-equal candidates do not trade the group cap from year to year (D1b record §5)
 ranked.sort((a,b)=>H('rank',a.c.id,a.g)-H('rank',b.c.id,b.g)||(a.c.id<b.c.id?-1:a.c.id>b.c.id?1:0));
 let coast=false;for(let i=96*320;i<57600&&!coast;i++)coast=input.surface[i]===3;
 const groups:FaunaGroupPlan[]=[],perGroup=new Map<FaunaGroup,number>(),dropped={cap:0,spacing:0,'no-room':0};let animals=0;
 for(const r of ranked){
  const cap=r.g==='water-bird'&&coast?P.coastWaterGroups:P.groupsPerSite[r.g];
  if((perGroup.get(r.g)??0)>=cap||animals>=P.animalsPerSite){dropped.cap++;continue;}
  if(groups.some(q=>{const o=cands.find(c=>c.id===q.candidate)!;return Math.abs(o.x-r.c.x)+Math.abs(o.y-r.c.y)<P.groupSpacing;})){dropped.spacing++;continue;}
  // a second water-bird group shows the other floating kind, so a coast with two groups shows two kinds
  const first=faunaKindAt(input,r.c,r.g),kind=r.g==='water-bird'&&first!=='heron'&&groups.some(q=>q.group===r.g&&q.kind===first)?(first==='gull'?'duck':'gull'):first,pose=restPose(r.g,kind),want=Math.min(P.animalsPerSite-animals,1+Math.floor(clamp((r.s-r.t)/Math.max(.05,1-r.t))*(P.groupSize[r.g]-1)+.5));
  const members:FaunaMember[]=[];
  for(let m=0;m<want;m++){
   // up to 6 fixed offsets near the candidate; a member that fits none is left out (no far move)
   for(let k=0;k<6;k++){
    const h=H('member',r.c.id,r.g,m,k),dx=m===0&&k===0?0:h%21-10,dy=m===0&&k===0?0:Math.floor(h/21)%9-4;
    let x=r.c.x+dx,y=r.c.y+dy;
    if(r.g==='flying-bird'){x=r.c.x+dx*2;y=12+H('sky',r.c.id)%(P.skyFloor-24)+dy;}
    // animals never overlap, in the group or across groups: their bodies (facing either way) keep a 1 px gap
    const size=sizeAt(kind,y),box=memberBox(kind,size,pose,x,y);
    if([...groups.flatMap(q=>q.members),...members].some(q=>{const o=memberBox(q.kind,q.size,q.pose,q.x,q.y);return box.left<=o.right+1&&box.right>=o.left-1&&box.top<=o.bottom+1&&box.bottom>=o.top-1;}))continue;
    if(!faunaBodyFits(input,kind,size,pose,x,y))continue;
    members.push(Object.freeze({kind,size,pose,x,y,facing:H('facing',r.c.id,m)%2?1:-1}));break;
   }
  }
  if(members.length===0){dropped['no-room']++;continue;}
  groups.push(Object.freeze({candidate:r.c.id,group:r.g,kind,suitability:r.s,threshold:r.t,members:Object.freeze(members)}));
  perGroup.set(r.g,(perGroup.get(r.g)??0)+1);animals+=members.length;
 }
 return Object.freeze({ruleId:FAUNA_HABITAT_RULE_ID,seed:input.seed,site:input.site,year:input.year,groups:Object.freeze(groups),dropped:Object.freeze(dropped)});
}
