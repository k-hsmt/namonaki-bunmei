/** Issue #36 D1a: the season prototype is appearance only, climate-driven and inert in the live game. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {PLANT_ARCHETYPES} from '../dist/flora/local-flora-v1.js';
import {seasonPhaseOfYear,SEASON_PHASE_YEARS,seasonalViewOf,plantSeasonLook,groundSeasonLook} from '../dist/season/season-presentation-v1.js';
import {seasonSprite} from '../dist/season/season-sprites-v1.js';
import {restrainedSprite,expressiveSprite} from '../dist/flora/plant-sprites-v1.js';
import {renderFloraLayer} from '../dist/flora/flora-scene-v1.js';

const climateOf=b=>{for(let s=1;s<5000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return c;}};

test('D1c trial: each phase lasts SEASON_PHASE_YEARS confirmed years and the four phases make one round (not a calendar)',()=>{
 assert.equal(SEASON_PHASE_YEARS,25);
 assert.deepEqual([0,24,25,49,50,75,99,100,124,125,10000].map(seasonPhaseOfYear),[0,0,1,1,2,3,3,0,0,1,0]);
 assert.throws(()=>seasonPhaseOfYear(-1));assert.throws(()=>seasonPhaseOfYear(1.5));
});

test('D1a: season strength follows the climate — cold winters in boreal and tundra, dry seasons in warm grassland, little in rainforest',()=>{
 const v=b=>seasonalViewOf(3,climateOf(b));
 assert.ok(v('boreal_forest').cold>=.9&&v('tundra').cold>=.9);
 assert.ok(v('temperate_forest').cold>.4);
 assert.equal(v('tropical_rainforest').cold,0);assert.ok(v('tropical_rainforest').dry<.3);
 assert.ok(v('grassland').dry>.4&&v('grassland').cold===0);
 for(const b of ['desert','steppe','grassland','temperate_forest','tropical_rainforest','boreal_forest','tundra'])for(const p of [0,1,2,3]){
  const s=seasonalViewOf(p,climateOf(b));assert.ok(s.cold>=0&&s.cold<=1&&s.dry>=0&&s.dry<=1);
  for(const id of PLANT_ARCHETYPES){const l=plantSeasonLook(id,s);assert.ok(l.leaves>=0&&l.leaves<=1);if(l.tint)assert.ok(l.tint.strength>0&&l.tint.strength<=1);}
  const g=groundSeasonLook(b,s);assert.ok([g.green,g.straw,g.litter].every(x=>x>=0&&x<=.2));
 }
});

test('D1a: deciduous trees go bare in a cold dormant phase; evergreens keep their leaves; rainforest never takes autumn colours',()=>{
 const cold=seasonalViewOf(3,climateOf('boreal_forest')),warm=seasonalViewOf(2,climateOf('tropical_rainforest'));
 assert.equal(plantSeasonLook('deciduous',cold).leaves,0);
 for(const id of ['conifer','evergreen'])assert.equal(plantSeasonLook(id,cold).leaves,1);
 assert.notEqual(plantSeasonLook('tropical',warm).tint?.color,'autumn');
 assert.equal(plantSeasonLook('deciduous',seasonalViewOf(2,climateOf('temperate_forest'))).tint.color,'autumn');
});

test('D1a: a seasonal sprite keeps its size and root; a bare tree shows branches, not only a stump',()=>{
 const look=plantSeasonLook('deciduous',seasonalViewOf(3,climateOf('boreal_forest')));
 for(const s of [restrainedSprite('deciduous','mature',0),expressiveSprite('deciduous','mature')]){
  const bare=seasonSprite(s,'deciduous',look,7);
  assert.equal(bare.width,s.width);assert.equal(bare.height,s.height);assert.equal(bare.originX,s.originX);assert.equal(bare.originY,s.originY);
  const count=(d,f)=>{let n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]&&f(d[i],d[i+1],d[i+2]))n++;return n;};
  const green=(r,g,b)=>g>=r-2&&g>b+8;
  assert.equal(count(bare.data,green),0,'no leaves left');
  assert.ok(count(bare.data,()=>true)>count(s.data,(r,g,b)=>!green(r,g,b))*1.2,'branches added to the trunk');
 }
 const still=restrainedSprite('herb','mature',0);assert.equal(seasonSprite(still,'herb',{leaves:1,tint:null},1),still);
});

test('D1a: without a season the plant layer is exactly the B2d layer',()=>{
 const plants=[{kind:'tree',id:'deciduous',x:100,y:150,stage:'mature',variant:2,painter:'restrained'},{kind:'low',id:'herb',x:140,y:150,stage:'mature',variant:1,painter:'expressive'}];
 assert.deepEqual(Buffer.from(renderFloraLayer(plants,false,undefined).rgba),Buffer.from(renderFloraLayer(plants,false).rgba));
 assert.notDeepEqual(Buffer.from(renderFloraLayer(plants,false,seasonalViewOf(2,climateOf('temperate_forest'))).rgba),Buffer.from(renderFloraLayer(plants,false).rgba));
});

test('D1a: the season prototype uses no random source, and neither civilisation code nor the live world passes a season',()=>{
 for(const f of readdirSync('src/season'))assert.doesNotMatch(readFileSync('src/season/'+f,'utf8'),/Math\.random|Date\.now|performance\.now|new Date/,f);
 const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 for(const file of walk('src').filter(f=>/\/(story|irrigation|terrain|architecture|engine|environment|vegetation|climate|economy)\//.test(f)))
  assert.doesNotMatch(readFileSync(file,'utf8'),/season\/season-|season:/,file+' must not set or read a season (D0 §10: no live integration before D2)');
});

test('D1b: snow lies deep in the dormant phase of cold worlds, a little in spring and late autumn, never in warm worlds',async()=>{
 const {snowCoverOf}=await import('../dist/season/season-presentation-v1.js');
 for(const b of ['tropical_rainforest','grassland','desert'])for(const p of [0,1,2,3])assert.equal(seasonalViewOf(p,climateOf(b)).snow,0,b);
 const boreal=[0,1,2,3].map(p=>seasonalViewOf(p,climateOf('boreal_forest')).snow);
 assert.equal(boreal[1],0);assert.ok(boreal[3]>=.99);assert.ok(boreal[0]>0&&boreal[0]<boreal[3]);assert.ok(boreal[2]<=boreal[0]);
 assert.ok(seasonalViewOf(3,climateOf('temperate_forest')).snow>.5);
 for(const c of [0,.3,.5,.8,1])for(const p of [0,1,2,3]){const s=snowCoverOf(p,c);assert.ok(s>=0&&s<=1);}
});

test('D1b: tree snow sits on the upward edges of the seasonal sprite and never below the trunk base',()=>{
 const v=seasonalViewOf(3,climateOf('boreal_forest'));
 for(const s of [restrainedSprite('conifer','mature',0),expressiveSprite('conifer','mature')]){
  const snowy=seasonSprite(s,'conifer',plantSeasonLook('conifer',v),5),W=s.width;let snow=0;
  for(let y=0;y<s.height;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,d=snowy.data;if(d[i]===0xe9&&d[i+1]===0xed&&d[i+2]===0xe5||d[i]===0xd3&&d[i+1]===0xda&&d[i+2]===0xd2){snow++;assert.ok(y<s.originY-2);assert.ok(s.data[i+3]!==0,'snow only on the plant itself');}}
  assert.ok(snow>5,'conifer tiers carry snow');
 }
});
