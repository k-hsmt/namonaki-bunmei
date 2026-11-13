/** Issue #47 B2d2: each patch's ground material is drawn with the reviewed B1a pattern. Appearance only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Raster} from '../scripts/lib/pixel-raster.mjs';
import {paintGround} from '../scripts/lib/plant-prototype.mjs';
import {toneDistantLand,DISTANT_HAZE,DISTANT_TONE_STRENGTH,DISTANT_GRAIN,paintGroundMaterials,GROUND_COLORS,GROUND_BASE_SHIFT,GROUND_FLECK_STRENGTH,GROUND_EDGE_JITTER} from '../dist/flora/ground-materials-v1.js';
import {GROUND_MATERIALS,FLORA_SITES,describeFloraPatch} from '../dist/flora/local-flora-v1.js';
import {BIOME_KINDS,generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {architectureProductionSession} from '../dist/story/world-session.js';

const allLand={surface:new Uint8Array(57600).fill(1),bearing:new Uint8Array(57600)};
const patchesOf=m=>Array.from({length:440},()=>[0,0,-1,-1,-1,GROUND_MATERIALS.indexOf(m),0,0]);
const grey=()=>new Uint8ClampedArray(57600*4).fill(128);
const hex=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));

test('B2d2: every material but sand uses the B1a flecks and colours, laid over the district in record coordinates',()=>{
 for(const m of GROUND_MATERIALS.filter(m=>m!=='sand')){
  const ref=new Raster(320,84);paintGround(ref,m,0,0,320,84);
  const out=grey();paintGroundMaterials(out,patchesOf(m),allLand,false);
  const [base]=GROUND_COLORS[m].map(hex);
  for(let y=96;y<180;y++)for(let x=0;x<320;x++){
   const r=((y-96)*320+x)*4,i=(y*320+x)*4,flecked=[0,1,2].some(j=>ref.data[r+j]!==base[j]);
   for(let j=0;j<3;j++){let v=128*(1-GROUND_BASE_SHIFT)+base[j]*GROUND_BASE_SHIFT;if(flecked)v=v*(1-GROUND_FLECK_STRENGTH)+ref.data[r+j]*GROUND_FLECK_STRENGTH;
    assert.equal(out[i+j],Math.round(v),m+' at '+x+','+y);}
  }
 }
});

test('B2d2: sand is single-pixel grains in the B1a sand colours (Human review)',()=>{
 const out=grey();paintGroundMaterials(out,patchesOf('sand'),allLand,false);
 const [base,a,b]=GROUND_COLORS.sand.map(hex),plain=[0,1,2].map(j=>Math.round(128*(1-GROUND_BASE_SHIFT)+base[j]*GROUND_BASE_SHIFT));
 const grain=c=>[0,1,2].map(j=>Math.round((128*(1-GROUND_BASE_SHIFT)+base[j]*GROUND_BASE_SHIFT)*(1-GROUND_FLECK_STRENGTH)+c[j]*GROUND_FLECK_STRENGTH));
 const at=(x,y)=>[...out.subarray((y*320+x)*4,(y*320+x)*4+3)],is=(p,q)=>p.every((v,j)=>v===q[j]);
 let grains=0,runs=0;
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){const p=at(x,y);
  assert.ok(is(p,plain)||is(p,grain(a))||is(p,grain(b)),'sand pixel '+x+','+y);
  if(!is(p,plain)){grains++;if(x<319&&!is(at(x+1,y),plain))runs++;}}
 const share=grains/(320*84);assert.ok(share>.03&&share<.1,'grain share '+share);
 assert.ok(runs/grains<.15,'grains are single pixels, not dashes');
});

test('B2d2: only stable, unbuilt land is painted; a mirrored scene shows the same ground mirrored',()=>{
 const physics={surface:new Uint8Array(57600).fill(1),bearing:new Uint8Array(57600)};
 for(let x=0;x<320;x++){physics.surface[120*320+x]=2;physics.bearing[130*320+x]=2;}
 const patches=Array.from({length:440},(_,i)=>[0,0,-1,-1,-1,i%GROUND_MATERIALS.length,0,0]),plot={x:40,y:140,width:30,depth:12};
 const plain=grey();paintGroundMaterials(plain,patches,physics,false,[plot]);
 for(let x=0;x<320;x++)for(const y of [50,120,130])assert.deepEqual([...plain.subarray((y*320+x)*4,(y*320+x)*4+4)],[128,128,128,128]);
 for(let y=140;y<152;y++)for(let x=40;x<70;x++)assert.equal(plain[(y*320+x)*4],128,'built ground keeps its paint');
 const mirrored=grey();paintGroundMaterials(mirrored,patches,physics,true,[plot]);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++)assert.deepEqual([...mirrored.subarray((y*320+x)*4,(y*320+x)*4+3)],[...plain.subarray((y*320+319-x)*4,(y*320+319-x)*4+3)]);
});

test('B2d2: patch edges are frayed by at most GROUND_EDGE_JITTER pixels, never a straight 8 px block edge',()=>{
 const patches=Array.from({length:440},(_,i)=>[0,0,-1,-1,-1,(i%40)<20?0:5,0,0]);// sand | cold ground from x=160
 const out=grey(),sand=grey();paintGroundMaterials(out,patches,allLand,false);paintGroundMaterials(sand,patchesOf('sand'),allLand,false);
 const differs=x=>{let n=0;for(let y=96;y<180;y++)if(out[(y*320+x)*4]!==sand[(y*320+x)*4])n++;return n;};
 assert.ok(differs(157)+differs(158)+differs(159)>0,'cold ground reaches into the sand patch near the edge');
 assert.equal(differs(156-GROUND_EDGE_JITTER),0,'but no further than the jitter');
 assert.ok(differs(160)<84,'and sand reaches into the cold ground');
});

test('B2d2: forests, deserts and tundra get distinct ground materials',async()=>{
 const find=b=>{for(let s=1;s<5000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}};
 const dominant={};
 for(const b of BIOME_KINDS){
  const w=architectureProductionSession((await createNewArchitectureWorld(find(b))).architecture),count=new Map();
  for(const site of FLORA_SITES)for(const p of w.flora.sites[site])if(p){const g=describeFloraPatch(p).ground;count.set(g,(count.get(g)??0)+1);}
  dominant[b]=[...count].sort((a,c)=>c[1]-a[1])[0][0];
 }
 assert.deepEqual(dominant,{desert:'sand',steppe:'bareSoil',grassland:'bareSoil',temperate_forest:'leafLitter',tropical_rainforest:'wetSoil',boreal_forest:'leafLitter',tundra:'coldGround'});
});

test('B2d2: ground painting uses no random source and is not read by civilisation code',()=>{
 assert.doesNotMatch(readFileSync('src/flora/ground-materials-v1.ts','utf8'),/Math\.random|Date\.now|performance\.now|new Date/);
 const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 for(const file of walk('src').filter(f=>/\/(story|irrigation|terrain|architecture|engine|environment|vegetation|climate)\//.test(f)))
  assert.doesNotMatch(readFileSync(file,'utf8'),/ground-materials-v1/,file);
});

test('B2d2: distant land moves toward the near ground, hazed more the farther it is; sky and snow stay as drawn',()=>{
 const ground=[150,130,90],sky=[0xbd,0xc9,0xbb],orig=[0x9d,0xa9,0x91];
 // One row per layer: sky, plain, farthest ridge, nearer ridge, middle hills; a snow pixel on the farthest ridge.
 const layers=new Uint8Array(320*96),labels=[0,1,2,3,255];for(let y=0;y<96;y++)layers.fill(labels[Math.min(4,Math.floor(y/19))],y*320,y*320+320);
 const rgba=new Uint8ClampedArray(57600*4);for(let k=0;k<320*96;k++)rgba.set([...orig,255],k*4);
 const keep=new Uint8Array(320*96);keep[40*320+5]=1;
 toneDistantLand(rgba,layers,ground,sky,'sand',2,keep);
 const at=k=>[...rgba.subarray(k*4,k*4+3)];
 assert.deepEqual(at(0),orig,'sky untouched');assert.deepEqual(at(40*320+5),orig,'snow untouched');
 const expected=haze=>orig.map((c,j)=>Math.round(c*(1-DISTANT_TONE_STRENGTH)+(ground[j]*(1-haze)+sky[j]*haze)*DISTANT_TONE_STRENGTH));
 for(const [row,haze] of [[19,DISTANT_HAZE.plain],[38,DISTANT_HAZE.farthest],[57,DISTANT_HAZE.nearFar]])for(let x=0;x<320;x++)assert.deepEqual(at(row*320+x),expected(haze));
 assert.ok(DISTANT_HAZE.plain>DISTANT_HAZE.farthest&&DISTANT_HAZE.farthest>DISTANT_HAZE.nearFar&&DISTANT_HAZE.nearFar>DISTANT_HAZE.middle,'more haze the farther it is');
 let grains=0,hills=0;for(let y=76;y<96;y++)for(let x=0;x<320;x++){hills++;if(at(y*320+x).join()!==expected(DISTANT_HAZE.middle).join())grains++;}
 assert.ok(grains/hills>DISTANT_GRAIN.share*.5&&grains/hills<DISTANT_GRAIN.share*1.5,'sparse grains on the middle hills only');
 const again=new Uint8ClampedArray(57600*4);for(let k=0;k<320*96;k++)again.set([...orig,255],k*4);toneDistantLand(again,layers,ground,sky,'sand',2,keep);
 assert.deepEqual(Buffer.from(again),Buffer.from(rgba),'deterministic');
});

