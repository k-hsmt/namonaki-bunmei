/**
 * Issue #37 D1a PROTOTYPE: weathering, moss, vines and drifted sand on an abandoned building (ruleId ruin-weathering-v1,
 * parameters not final).
 *
 * Appearance only and not connected to anything: the live game never imports this module (D0 §11: D1a is an
 * independent drawing; D2 connects it). The D1a gallery gives each building development clocks (years since it was
 * abandoned, years since it became a ruin) and a world climate, and compares the results.
 *  - Two clocks (D0 §3): `abandonedYears` starts surface cover (fading, moss, vines, sand) and roof wear; `ruinedYears`
 *    starts the loss of walls. A building that is only vacant never loses walls here.
 *  - At ruinedYears 0 the outline is the live ruin (architecture-ruin-v1, `drawRuin`): same 3 px steps, same hashes,
 *    same weathered colours for stone. Later years lower each column towards a floor that depends on the wall material,
 *    so time alone never removes a building completely (D0 §6); the foundation always stays.
 *  - Moss and vines are drawn only on pixels of the building that still exist in that year (D0 §7); vines root only at
 *    the foot of a remaining wall. Nothing is drawn where the building has no pixel, except rubble and drifted sand at
 *    its foot.
 * Pure and deterministic: hashes of the building key and local coordinates; no random source, no time, no canvas.
 */
import type {WorldClimateBaseline} from '../climate/initial-climate-v1.js';

/**
 * Structural copies of the architecture drawing target and materials (architecture-draw-v1 / vocab-v1). The prototype
 * does not import src/architecture: the architecture code reaches the live game only through its release gates
 * (tests/architecture-prototype.test.mjs), and this module is not one of them.
 */
export type ArchitecturePart='foundation'|'wall'|'roof'|'opening'|'ornament';
export interface RectTarget {rect(x:number,y:number,w:number,h:number,color:string):void;part?(part:ArchitecturePart):void}
type WallMaterial='log'|'plank'|'wattle'|'earth'|'rammed'|'rubble'|'ashlar'|'mixed'|'metal'|'composite';
type RoofMaterial='thatch'|'shingle'|'slate'|'tile'|'plaster'|'metal'|'glazed';

export const RUIN_WEATHERING_RULE_ID='ruin-weathering-v1' as const;

/** Development clocks (D0 §3). Both null: in use, drawn as it is. */
export interface RuinClocks {
 /** Years since the building was vacated or abandoned; null while it is in use. */
 readonly abandonedYears:number|null;
 /** Years since it became a ruin; null while it stands (vacant). Never more than abandonedYears. */
 readonly ruinedYears:number|null;
}
/** 0..1 climate factors that drive weathering (from initial-climate-v1). */
export interface RuinClimate {readonly wet:number;readonly warm:number;readonly frost:number;readonly arid:number}

export type RuinWallClass='timber'|'wattle'|'earth'|'rubble'|'ashlar'|'mixed'|'modern';
export type RuinRoofClass='thatch'|'shingle'|'fired'|'earth'|'modern';
const wallClassOf:Readonly<Record<WallMaterial,RuinWallClass>>={log:'timber',plank:'timber',wattle:'wattle',earth:'earth',rammed:'earth',rubble:'rubble',ashlar:'ashlar',mixed:'mixed',metal:'modern',composite:'modern'};
const roofClassOf:Readonly<Record<RoofMaterial,RuinRoofClass>>={thatch:'thatch',shingle:'shingle',slate:'fired',tile:'fired',plaster:'earth',metal:'modern',glazed:'modern'};

/**
 * D1a parameters (to be calibrated by Human review).
 *  wall: tau = years for about 63% of the remaining height above the floor to fall; floor = share of the full height
 *        that stays in the long run; posts = timber posts that stand longer.
 *  roof: wear of a roof that still stands (vacant only): the share of roof pixels that become holes in the long run.
 */
export const RUIN_PARAMETERS=Object.freeze({
 wall:Object.freeze({
  timber:{tau:110,floor:.04,posts:true},wattle:{tau:100,floor:.06,posts:true},earth:{tau:260,floor:.12,posts:false},
  rubble:{tau:600,floor:.18,posts:false},ashlar:{tau:1200,floor:.24,posts:false},mixed:{tau:150,floor:.18,posts:false},modern:{tau:300,floor:.12,posts:false},
 } as Readonly<Record<RuinWallClass,{readonly tau:number;readonly floor:number;readonly posts:boolean}>>),
 roof:Object.freeze({thatch:{tau:40,max:.4},shingle:{tau:60,max:.28},fired:{tau:120,max:.14},earth:{tau:80,max:.22},modern:{tau:150,max:.1}} as Readonly<Record<RuinRoofClass,{readonly tau:number;readonly max:number}>>),
 /** Fading of a vacant building (a ruin is fully weathered as in architecture-ruin-v1). */
 fadeTau:50,fadeMax:.55,
 moss:Object.freeze({tau:100,max:.85,material:{timber:.8,wattle:.6,earth:.45,rubble:1,ashlar:.9,mixed:.9,modern:.5} as Readonly<Record<RuinWallClass,number>>}),
 vine:Object.freeze({tau:90,rootEvery:4}),
 sand:Object.freeze({tau:150,maxPx:3}),
});

const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const r2=(v:number)=>Math.round(v*100)/100;
/**
 * Climate factors from the world climate (same indices as #36 seasons): wet from effective moisture, warm from effective
 * temperature (0 at the boreal/tundra side, 1 from about the tropical line), frost from the winter estimate
 * (temperature − 0.8 × annual range), arid below the steppe line.
 */
export function ruinClimateOf(c:Pick<WorldClimateBaseline,'effectiveTemperature'|'effectiveMoisture'|'annualTemperatureRangeIndex'>):RuinClimate {
 const winter=c.effectiveTemperature-.8*c.annualTemperatureRangeIndex;
 return Object.freeze({wet:r2(clamp01((c.effectiveMoisture+65)/100)),warm:r2(clamp01((c.effectiveTemperature+50)/90)),
  frost:r2(clamp01((-10-winter)/40)),arid:r2(clamp01((-c.effectiveMoisture-36)/40))});
}

export interface RuinAppearance {
 readonly ruleId:typeof RUIN_WEATHERING_RULE_ID;
 readonly wall:RuinWallClass;readonly roof:RuinRoofClass;readonly clocks:RuinClocks;
 /** 0..1 colour weathering (1 = architecture-ruin-v1). */
 readonly weathering:number;
 /** 0..1 share of a standing roof worn into holes (vacant only; a ruin has lost its roof). */
 readonly roofWear:number;
 /** Years for the walls of this material in this climate (see RUIN_PARAMETERS.wall). */
 readonly wallTau:number;
 /** 0..1 progress of wall loss since the building became a ruin (0 = the live ruin outline). */
 readonly wallLoss:number;
 /** 0..1 moss, vines, sand reached by surface cover since abandonment. */
 readonly moss:number;readonly vine:number;readonly sand:number;
 /** Growth rates of this climate (moss, vine), kept so that newly exposed faces can be aged separately. */
 readonly mossRate:number;readonly vineRate:number;
}
const validClocks=(k:RuinClocks)=>{
 const ok=(v:number|null)=>v===null||Number.isSafeInteger(v)&&v>=0;
 if(!ok(k.abandonedYears)||!ok(k.ruinedYears)||k.ruinedYears!==null&&(k.abandonedYears===null||k.ruinedYears>k.abandonedYears))throw Error('Invalid ruin clocks');
};
const grow=(years:number,tau:number)=>1-Math.exp(-years/tau);
export function mossRateOf(c:RuinClimate,wall:RuinWallClass):number {return clamp01(c.wet**1.5*(.3+.7*(1-.4*c.frost))*RUIN_PARAMETERS.moss.material[wall]);}
export function vineRateOf(c:RuinClimate):number {return clamp01(c.wet*(.15+.85*c.warm)*(1-.3*c.frost));}

export function ruinAppearanceOf(spec:{readonly wall:WallMaterial;readonly roofMaterial:RoofMaterial},clocks:RuinClocks,climate:RuinClimate):RuinAppearance {
 validClocks(clocks);
 const wall=Object.hasOwn(wallClassOf,spec.wall)?wallClassOf[spec.wall]:undefined,roof=Object.hasOwn(roofClassOf,spec.roofMaterial)?roofClassOf[spec.roofMaterial]:undefined,P=RUIN_PARAMETERS,{wet,warm,frost}=climate;
 if(!wall||!roof)throw Error('Unknown building material');
 const a=clocks.abandonedYears??0,r=clocks.ruinedYears;
 // rot in wet and warm worlds; rain washes earth away; freeze and thaw opens stone joints; dry worlds keep everything longer
 const woody=wall==='timber'||wall==='wattle'||wall==='mixed';
 const speed=woody?.6+.8*wet*(.5+.5*warm):wall==='earth'?(.5+1.2*wet)*(1+.5*frost*wet):.8+.8*frost*wet;
 const wallTau=Math.round(P.wall[wall].tau/speed);
 const roofP=P.roof[roof],mossRate=mossRateOf(climate,wall),vineRate=vineRateOf(climate);
 const vacant=clocks.abandonedYears!==null;
 return Object.freeze({ruleId:RUIN_WEATHERING_RULE_ID,wall,roof,clocks:Object.freeze({...clocks}),
  weathering:r!==null?1:vacant?r2(P.fadeMax*grow(a,P.fadeTau)):0,
  roofWear:vacant&&r===null?r2(roofP.max*(.6+.4*wet)*grow(a,roofP.tau)):0,
  wallTau,wallLoss:r===null?0:r2(grow(r,wallTau)),
  moss:r2(P.moss.max*mossRate*grow(a,P.moss.tau)),vine:r2(vineRate*grow(a,P.vine.tau)),sand:r2(climate.arid*grow(a,P.sand.tau)),
  mossRate:r2(mossRate),vineRate:r2(vineRate)});
}

/** Colours of the surface cover in a climate, and the ground colour the earth walls return to. */
export interface RuinLook {readonly moss:readonly [string,string];readonly vine:readonly [string,string,string];readonly sand:readonly [string,string];readonly ground:string}
const hex=/^#[0-9a-f]{6}$/i;
const rgb=(c:string)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const mix=(a:string,b:string,t:number)=>{if(!hex.test(a))return a;const p=rgb(a),q=rgb(b);return '#'+p.map((n,i)=>Math.round(n+(q[i]!-n)*t).toString(16).padStart(2,'0')).join('');};
/** Cold worlds have olive-brown moss and dull vines; warm wet worlds vivid green. */
export function ruinLookOf(c:RuinClimate,ground:string):RuinLook {
 if(!hex.test(ground))throw Error('Invalid ground colour');
 const w=c.warm*(1-c.frost);
 return Object.freeze({moss:[mix('#56643a','#3f6a34',w),mix('#6f7c46','#5f8c42',w)] as const,
  vine:[mix('#4b5a36','#3a5a2c',w),mix('#5f7444','#4f7d38',w),mix('#73885a','#6a9a48',w)] as const,
  sand:['#cdbb8a','#b8a576'] as const,ground});
}

// ---- drawing ----
const fnv=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
/** architecture-ruin-v1 hash, kept so that the ruin outline at ruinedYears 0 is the live one. */
const ruinHash=(key:string,n:number)=>fnv(key+':'+n)%100;
const mixHash=(seed:number,x:number,y:number,salt:number)=>{let h=Math.imul(seed^Math.imul(x+7919,374761393)^Math.imul(y+104729,668265263)^Math.imul(salt,2246822519),1274126177);h^=h>>>15;h=Math.imul(h,2654435761);h^=h>>>13;return (h>>>0)/4294967296;};
/** architecture-ruin-v1 colour weathering, scaled by `t` and with a material-specific dust colour. */
const weatherColor=(c:string,t:number,dust:string)=>{if(!hex.test(c)||t<=0)return c;const v=rgb(c);return v[0]!+v[1]!+v[2]!<200?c:mix(mix(c,dust,.6*t),'#2c302c',.2*t);};
const STONE_DUST='#857f6c',WOOD_DUST='#8b877a',RUBBLE_STONE=['#6e695b','#7f7867','#5e5a4f'],RUBBLE_WOOD=['#5e5246','#6f6252'],HOLE='#3a3d38';
const dustOf=(wall:RuinWallClass,ground:string)=>wall==='timber'||wall==='wattle'?WOOD_DUST:wall==='earth'?mix(STONE_DUST,ground,.5):STONE_DUST;
const isVoid=(c:string)=>{const v=rgb(c);return v[0]!+v[1]!+v[2]!<200;};

interface Pixel {color:string;part:ArchitecturePart}
/**
 * Draws `draw` (a building drawn at its place) weathered by `appearance`. In use (both clocks null) it is drawn as it is.
 * `key` identifies the building (the live ruin uses the part or facility id), so the pattern is stable over the years.
 */
export function drawWeatheredArchitecture(g:RectTarget,key:string,draw:(t:RectTarget)=>void,ap:RuinAppearance,look:RuinLook):void {
 if(ap.clocks.abandonedYears===null){draw(g);return;}
 // 1. capture the building pixel by pixel, with its parts (last write wins, as on a canvas)
 const px=new Map<number,Pixel>(),rects:[number,number,number,number][]=[];let part:ArchitecturePart='wall';
 const K=(x:number,y:number)=>(y+4096)*8192+(x+4096);
 draw({rect(x,y,w,h,color){rects.push([x,y,w,h]);for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)px.set(K(xx,yy),{color,part});},part(p){part=p;}});
 if(!rects.length)return;
 const top=Math.min(...rects.map(r=>r[1])),base=Math.max(...rects.map(r=>r[1]+r[3])),height=base-top;
 const left=Math.floor(Math.min(...rects.map(r=>r[0]))),right=Math.ceil(Math.max(...rects.map(r=>r[0]+r[2])));
 const seed=fnv(key),H=(x:number,y:number,salt:number)=>mixHash(seed,x-left,y-base,salt);
 const ruined=ap.clocks.ruinedYears!==null,a=ap.clocks.abandonedYears,r=ap.clocks.ruinedYears??0,P=RUIN_PARAMETERS.wall[ap.wall];

 // 2. which pixels remain: the live ruin outline (3 px steps), lowered towards the material's floor
 const remain=new Map<number,number>();
 if(ruined){
  const raw:number[]=[];
  for(let x=left;x<right;x++){
   const n=Math.floor(x/3),h=ruinHash(key,n);
   const start=h<25?Math.min(2,height):Math.round(height*(20+ruinHash(key+'~',n)%26)/100);
   const post=P.posts&&mixHash(seed,x-left,0,11)<.16;
   const floor=Math.min(start,Math.round(height*(post?.4:P.floor)*(.6+.8*mixHash(seed,ap.wall==='timber'||ap.wall==='wattle'?x-left:n,0,12))));
   const loss=post?1-Math.exp(-r/(ap.wallTau*2.5)):ap.wallLoss;
   raw.push(floor+(start-floor)*(1-loss));
  }
  for(let i=0;i<raw.length;i++){
   let v=raw[i]!;
   if(ap.wall==='earth'){// earth slumps: peaks settle towards their neighbours and corners wear down first (both grow with the loss, never raise a column)
    const w=raw.slice(Math.max(0,i-2),i+3),avg=w.reduce((s,q)=>s+q,0)/w.length,l=ap.wallLoss;
    v-=l*Math.max(0,v-avg);
    if(l>0)v*=Math.min(1,(Math.min(i,raw.length-1-i)+1)/(4*l));
   }
   remain.set(left+i,Math.round(v));
  }
 }
 const kept=(x:number,y:number)=>{const p=px.get(K(x,y));if(!p)return undefined;if(!ruined||p.part==='foundation')return p;
  const h=remain.get(x);return h!==undefined&&y>=base-h?p:undefined;};

 // 3. the building, weathered; a standing roof wears into holes
 const dust=dustOf(ap.wall,look.ground),out=new Map<number,string>();
 const holeAt=(x:number,y:number)=>ap.roofWear>0&&mixHash(seed,(x-left)>>1,(y-base)>>1,21)<ap.roofWear&&px.get(K(x,y-1))?.part==='roof';
 for(let y=top;y<base;y++)for(let x=left;x<right;x++){
  const p=kept(x,y);if(!p)continue;
  out.set(K(x,y),p.part==='roof'&&holeAt(x,y)?HOLE:weatherColor(p.color,ap.weathering,dust));
 }
 for(const [k,c] of out)g.rect(k%8192-4096,Math.floor(k/8192)-4096,1,1,c);

 // 4. rubble at the foot: stone stays as stones, timber rots into soil, earth slumps into a low mound
 if(ruined){
  const soil=mix(look.ground,'#4a4438',.25),rot=1-Math.exp(-r/(ap.wallTau*1.5));
  for(let x=left-1;x<=right;x++){
   const h=ruinHash(key+'#',x);
   if(ap.wall==='earth'||ap.wall==='wattle'){
    const mound=Math.round((h<70?1:0)+2*ap.wallLoss*Math.min(1,(Math.min(x-left+1,right-x)+1)/4));
    if(mound>0)g.rect(x,base-mound,1,mound,h%3?mix(dust,look.ground,.4):mix(dust,look.ground,.7));
   }else if(h<70){
    const wood=ap.wall==='timber'||ap.wall==='mixed'&&h%2===0;
    const color=wood?(mixHash(seed,x-left,0,31)<rot?soil:RUBBLE_WOOD[h%2]!):RUBBLE_STONE[h%3]!;
    g.rect(x,base-1-(h<20?1:0),1,1+(h<20?1:0),color);
   }
  }
 }
 // everything visible at the foot or on the building (for moss, vines and sand)
 const surface=(x:number,y:number)=>{const p=kept(x,y);return p&&!isVoid(out.get(K(x,y))??p.color)?p:undefined;};

 // 5. moss: patchy, thick near the ground, on the tops of broken walls and on stone; faces exposed by the ruin are younger
 if(ap.moss>0){
  const newFaceMoss=RUIN_PARAMETERS.moss.max*ap.mossRate*grow(r,RUIN_PARAMETERS.moss.tau);
  for(let y=top;y<base;y++)for(let x=left;x<right;x++){
   const p=surface(x,y);if(!p)continue;
   const upEmpty=!kept(x,y-1),cut=ruined&&remain.has(x)&&y<base-remain.get(x)!+2;
   const amount=cut?newFaceMoss:ap.moss;
   const weight=(1-.5*(base-y)/Math.max(1,height))*(p.part==='foundation'?1.25:1)*(upEmpty?1.6:1);
   const score=.6*mixHash(seed,(x-left)>>1,(y-base)>>1,41)+.4*mixHash(seed,x-left,y-base,42);
   if(score<amount*weight)g.rect(x,y,1,1,mixHash(seed,x-left,y-base,43)<.6?look.moss[0]:look.moss[1]);
  }
 }
 // 6. vines: rooted at the foot of a remaining wall, climbing only over remaining surface
 if(ap.vine>0){
  const every=RUIN_PARAMETERS.vine.rootEvery;
  for(let x0=left+1;x0<right-1;x0++){
   if(mixHash(seed,x0-left,0,51)>=1/every)continue;
   const v=mixHash(seed,x0-left,0,52);if(v>=ap.vine*1.6)continue;
   if(!surface(x0,base-1)&&!surface(x0,base-2))continue;
   const len=Math.round(ap.vine*height*(.55+.45*mixHash(seed,x0-left,0,53)));
   let x=x0;
   for(let s=0;s<len;s++){
    const y=base-1-s;
    if(s>0&&s%2===0){const nx=x+Math.floor(mixHash(seed,x0-left,s,54)*3)-1;if(surface(nx,y))x=nx;}
    if(!surface(x,y))break;
    g.rect(x,y,1,1,look.vine[0]);
    if(s%2===1){const side=mixHash(seed,x0-left,s,55)<.5?-1:1;if(surface(x+side,y))g.rect(x+side,y,1,1,mixHash(seed,x0-left,s,56)<.5?look.vine[1]:look.vine[2]);}
   }
  }
 }
 // 7. drifted sand: against the foot, deeper on the windward (left) side, with a ramp outside the building
 if(ap.sand>0){
  const depth=RUIN_PARAMETERS.sand.maxPx*ap.sand;
  const at=(x:number)=>x<left?depth*1.2-(left-x)*.7:x>=right?depth*.7-(x-right+1)*.9:depth*(1.2-.5*(x-left)/Math.max(1,right-left))*(.8+.4*mixHash(seed,(x-left)>>2,0,61));
  for(let x=left-Math.ceil(depth*2);x<right+Math.ceil(depth);x++){
   const d=Math.round(at(x));
   for(let y=base-d;y<base;y++)g.rect(x,y,1,1,mixHash(seed,x-left,y-base,62)<.25?look.sand[1]:look.sand[0]);
  }
 }
}
