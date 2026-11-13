/** Issue #36 D1a: the season prototype is appearance only, climate-driven and inert in the live game. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {PLANT_ARCHETYPES} from '../dist/flora/local-flora-v1.js';
import {seasonPhaseOfYear,seasonalViewOf,plantSeasonLook,groundSeasonLook} from '../dist/season/season-presentation-v1.js';
import {seasonSprite} from '../dist/season/season-sprites-v1.js';
import {restrainedSprite,expressiveSprite} from '../dist/flora/plant-sprites-v1.js';
import {renderFloraLayer} from '../dist/flora/flora-scene-v1.js';

const climateOf=b=>{for(let s=1;s<5000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return c;}};

test('D1a: the phase is the confirmed year mod 4 (a representative landscape, not a calendar)',()=>{
 assert.deepEqual([0,1,2,3,4,99,100,10000].map(seasonPhaseOfYear),[0,1,2,3,0,3,0,0]);
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
