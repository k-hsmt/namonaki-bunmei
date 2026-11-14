/** Issue #37 D1a: the ruin weathering prototype is appearance only, deterministic, draws only on what remains, and is inert in the live game. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {drawArchitecture} from '../dist/architecture/draw-v1.js';
import {drawMiniature} from '../dist/architecture/miniature-v1.js';
import {drawRuin} from '../dist/architecture/scene-v1.js';
import {normalizeSpec} from '../dist/architecture/vocab-v1.js';
import {ruinClimateOf,ruinAppearanceOf,ruinLookOf,drawWeatheredArchitecture} from '../dist/ruin/ruin-weathering-v1.js';

const climateOf=b=>{for(let s=1;s<5000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return ruinClimateOf(c);}};
const NONE={wet:0,warm:0,frost:0,arid:0};
const SPECS={
 log:{structure:'S02',wall:'log',roofMaterial:'shingle'},
 wattle:{structure:'S01',wall:'wattle',roofMaterial:'thatch',eaves:'deep',entrance:'E3',foundation:'F2'},
 earth:{structure:'S03',roofFamily:'R05',roofMaterial:'plaster'},
 rubble:{structure:'S04',roofFamily:'R06',roofMaterial:'slate',window:'W2',entrance:'E5',foundation:'F4'},
 ashlar:{structure:'S05',roofFamily:'R03',roofMaterial:'tile'},
 mixed:{structure:'S06',roofFamily:'R08',roofMaterial:'shingle',window:'W4',entrance:'E4'},
};
const spec=(id,use='house')=>normalizeSpec({use,...SPECS[id]});
/** A pixel map target: "x,y" → colour, last write wins. */
const pixels=paint=>{const m=new Map();paint({rect(x,y,w,h,c){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)m.set(xx+','+yy,c);}});return m;};
const look=ruinLookOf(NONE,'#7d8456');
const weathered=(id,clocks,climate=NONE,key='k:'+id,use='house')=>{const s=spec(id,use);
 return pixels(g=>drawWeatheredArchitecture(g,key,t=>drawArchitecture(t,s,40,60),ruinAppearanceOf(s,clocks,climate),ruinLookOf(climate,'#7d8456')));};

test('D1a: the part hook announces foundation, wall, roof and openings and never changes the drawing',()=>{
 for(const id of Object.keys(SPECS)){
  const s=spec(id),plain=pixels(g=>drawArchitecture(g,s,40,60)),parts=new Set();
  const hooked=pixels(g=>drawArchitecture({rect:g.rect,part:p=>parts.add(p)},s,40,60));
  assert.deepEqual([...hooked],[...plain]);
  for(const p of ['foundation','wall','roof','opening'])assert.ok(parts.has(p),id+' '+p);
  for(const d of ['far','middle','near']){
   const mp=new Set(),a=pixels(g=>drawMiniature(g,s,30,30,d)),b=pixels(g=>drawMiniature({rect:g.rect,part:p=>mp.add(p)},s,30,30,d));
   assert.deepEqual([...b],[...a]);assert.ok(mp.has('wall')&&mp.has('roof'));
  }
 }
});

test('D1a: a building in use is drawn exactly as before',()=>{
 for(const id of Object.keys(SPECS)){
  const s=spec(id);
  assert.deepEqual([...weathered(id,{abandonedYears:null,ruinedYears:null},climateOf('tropical_rainforest'))],[...pixels(g=>drawArchitecture(g,s,40,60))]);
 }
});

/** Pixels whose final (last painted) part is `part` in the plain drawing. */
const partPixels=(s,part)=>{const owner=new Map();let cur;drawArchitecture({rect(x,y,w,h){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)owner.set(xx+','+yy,cur);},part(p){cur=p;}},s,40,60);
 return new Set([...owner].filter(([,p])=>p===part).map(([k])=>k));};

test('D1a: a fresh ruin has lost its roof but stands taller than the live ruin, keeping every live wall pixel',()=>{
 for(const id of Object.keys(SPECS)){
  const s=spec(id),live=pixels(g=>drawRuin(g,'k:'+id,t=>drawArchitecture(t,s,40,60)));
  const fresh=weathered(id,{abandonedYears:0,ruinedYears:0}),roof=partPixels(s,'roof'),foundation=partPixels(s,'foundation');
  const ap=ruinAppearanceOf(s,{abandonedYears:0,ruinedYears:0},NONE);assert.equal(ap.freshness,1);
  for(const k of fresh.keys())assert.ok(!roof.has(k)||foundation.has(k)||Number(k.split(',')[1])>=58,id+' roof pixel in a ruin '+k);
  const rubbleRows=k=>(id==='earth'||id==='wattle')&&Number(k.split(',')[1])>=58;
  for(const k of live.keys())if(!roof.has(k)&&!rubbleRows(k))assert.ok(fresh.has(k),id+' fresh ruin lost a live pixel '+k);
  assert.ok(fresh.size>live.size,id+' fresh ruin is not taller');
 }
});

test('D1a: once settled (freshness 0, no further loss) the outline is the live ruin plus the kept foundation; stone keeps the live colours too',()=>{
 for(const id of ['rubble','ashlar','log','mixed','earth']){
  const s=spec(id),live=pixels(g=>drawRuin(g,'k:'+id,t=>drawArchitecture(t,s,40,60)));
  const ap={...ruinAppearanceOf(s,{abandonedYears:0,ruinedYears:0},NONE),freshness:0};
  const proto=pixels(g=>drawWeatheredArchitecture(g,'k:'+id,t=>drawArchitecture(t,s,40,60),ap,look));
  const foundation=partPixels(s,'foundation'),roof=partPixels(s,'roof');
  const stone=id==='rubble'||id==='ashlar';
  // earth slumps into a low mound instead of the live stone rubble (the two bottom rows); a ruin keeps no roof pixels
  const rubbleRows=k=>id==='earth'&&Number(k.split(',')[1])>=58;
  for(const [k,c] of live)if(!foundation.has(k)&&!rubbleRows(k)&&!roof.has(k)){assert.ok(proto.has(k),id+' missing '+k);if(stone)assert.equal(proto.get(k),c,id+' '+k);}
  for(const k of proto.keys())if(!live.has(k))assert.ok(foundation.has(k),id+' extra pixel outside the foundation '+k);
 }
});

test('D1a: walls only fall after the ruin, never come back, and time alone never removes the building',()=>{
 const above=(m,base)=>[...m.keys()].filter(k=>Number(k.split(',')[1])<base-3).length;
 for(const id of Object.keys(SPECS))for(const climate of [NONE,climateOf('tropical_rainforest'),climateOf('desert'),climateOf('tundra')]){
  // vacant: no wall loss (only colour, roof holes and cover)
  const standing=pixels(g=>drawArchitecture(g,spec(id),40,60)).size;
  assert.equal(weathered(id,{abandonedYears:300,ruinedYears:null},{...climate,arid:0}).size>=standing,true,id);
  let last=Infinity;
  for(const r of [0,5,10,20,50,100,200,500,1000,3000,10000]){
   const m=weathered(id,{abandonedYears:r+30,ruinedYears:r},{...NONE,frost:climate.frost,wet:climate.wet,warm:climate.warm});
   const n=above(m,60);assert.ok(n<=last,`${id} r=${r}: ${n}>${last}`);last=n;
   assert.ok(m.size>0,id+' vanished at '+r);
  }
 }
 // stone outlasts timber in the same climate
 const wet=climateOf('temperate_forest'),c={abandonedYears:530,ruinedYears:500};
 assert.ok(above(weathered('ashlar',c,{...wet,arid:0}),60)>above(weathered('log',c,{...wet,arid:0}),60));
});

test('D1a: moss and vines grow only on pixels of the building that remain that year',()=>{
 const wet=climateOf('tropical_rainforest');assert.ok(wet.wet>.8&&wet.arid===0);
 for(const id of Object.keys(SPECS))for(const clocks of [{abandonedYears:25,ruinedYears:null},{abandonedYears:80,ruinedYears:50},{abandonedYears:500,ruinedYears:470}]){
  const s=spec(id),ap=ruinAppearanceOf(s,clocks,wet),bare=ruinAppearanceOf(s,clocks,{...wet,wet:0});
  // the same remaining building, without cover (wet 0 changes rates only, not the outline; wall loss uses wallTau of the wet climate)
  const shape=pixels(g=>drawWeatheredArchitecture(g,'k',t=>drawArchitecture(t,s,40,60),{...ap,moss:0,vine:0},look));
  const covered=pixels(g=>drawWeatheredArchitecture(g,'k',t=>drawArchitecture(t,s,40,60),ap,ruinLookOf(wet,'#7d8456')));
  assert.ok(ap.moss>0&&ap.vine>0&&bare.moss===0&&bare.vine===0);
  let changed=0;for(const [k,c] of covered){assert.ok(shape.has(k),`${id} cover outside the building at ${k}`);if(shape.get(k)!==c)changed++;}
  assert.equal(covered.size,shape.size);
  if(clocks.abandonedYears>=80)assert.ok(changed>0,id+' no visible cover');
 }
});

test('D1a: climate decides the cover — no moss or vines in the desert, sand there; more vines in rainforest than tundra; wood rots faster where wet and warm',()=>{
 const at=(b,id='rubble',a=200)=>ruinAppearanceOf(spec(id),{abandonedYears:a,ruinedYears:a-30},climateOf(b));
 assert.equal(at('desert').moss,0);assert.equal(at('desert').vine,0);assert.ok(at('desert').sand>0);
 for(const b of ['temperate_forest','tropical_rainforest','boreal_forest'])assert.equal(at(b).sand,0);
 assert.ok(at('tropical_rainforest').vine>at('temperate_forest').vine&&at('temperate_forest').vine>at('tundra').vine);
 assert.ok(at('temperate_forest').moss>at('steppe').moss);
 assert.ok(at('tropical_rainforest','log').wallTau<at('desert','log').wallTau);
 assert.ok(at('tropical_rainforest','earth').wallTau<at('desert','earth').wallTau);
 for(const b of BIOME_KINDS){const c=climateOf(b);for(const v of Object.values(c))assert.ok(v>=0&&v<=1);}
 // cover never shrinks with time
 for(const b of BIOME_KINDS){let prev=null;for(const a of [0,10,50,200,500,2000]){const x=at(b,'rubble',Math.max(a,30));if(prev)for(const k of ['moss','vine','sand'])assert.ok(x[k]>=prev[k]);prev=x;}}
});

test('D1a: clocks are validated and drawing is deterministic without any random source',()=>{
 for(const c of [{abandonedYears:-1,ruinedYears:null},{abandonedYears:10,ruinedYears:11},{abandonedYears:null,ruinedYears:0},{abandonedYears:1.5,ruinedYears:null}])
  assert.throws(()=>ruinAppearanceOf(spec('log'),c,NONE));
 const random=Math.random;Math.random=()=>{throw Error('random used');};
 try{
  const c=climateOf('temperate_forest'),clocks={abandonedYears:200,ruinedYears:170};
  for(const id of Object.keys(SPECS))assert.deepEqual([...weathered(id,clocks,c)],[...weathered(id,clocks,c)]);
  // a different building key gives a different pattern (the key, not a call count, decides it)
  assert.notDeepEqual([...weathered('rubble',clocks,c,'a')],[...weathered('rubble',clocks,c,'b')]);
 }finally{Math.random=random;}
});

test('D1a: nothing in the live game imports the ruin prototype',()=>{
 const walk=d=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?walk(p):[p];});
 for(const f of walk('src').filter(f=>!f.startsWith(join('src','ruin'))))assert.ok(!/ruin\/ruin-weathering/.test(readFileSync(f,'utf8')),f);
 assert.ok(!readFileSync('index.html','utf8').includes('ruin-weathering'));
});
