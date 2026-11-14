/** Issue #37 D1b: local access for plants on abandoned ground — opened by confirmed changes, never on structures, never re-ageing patches. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {PLANT_ARCHETYPES,GROUND_MATERIALS} from '../dist/flora/local-flora-v1.js';
import {BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {stageOfAge} from '../dist/flora/flora-growth-v1.js';
import {LOW_SPACING} from '../dist/flora/flora-scene-v1.js';
import {reclamationPeriods,openZonesAt,reclamationMask,planReclamation,facilityWallPlans,housingPartPlans,RECLAMATION_PARAMETERS} from '../dist/ruin/reclamation-access-v1.js';

const H=(year,use,condition)=>({year,use,condition,sourceKey:'h:'+year});
const F=(year,condition)=>({year,condition,sourceKey:'f:'+year});
const block=(changes,footprint={x:40,y:140,width:48,depth:22})=>({kind:'housing',id:'blk',footprint,
 protectedPlans:housingPartPlans([{x:46,y:150,depth:'near'},{x:58,y:150,depth:'near'},{x:46,y:160,depth:'near'},{x:58,y:160,depth:'near'}]),changes});
const LIFE=[H(0,'occupied','sound'),H(90,'underused','sound'),H(110,'vacant','sound'),H(140,'vacant','ruined'),H(320,'vacant','sound'),H(335,'occupied','sound'),H(400,'vacant','sound')];
const physics=()=>{const p={surface:new Uint8Array(57600),grade:new Uint8Array(57600),bearing:new Uint8Array(57600)};for(let i=96*320;i<57600;i++)p.surface[i]=1;return p;};
const patches=Array.from({length:440},()=>Object.freeze([0,BIOME_KINDS.indexOf('temperate_forest'),PLANT_ARCHETYPES.indexOf('deciduous'),PLANT_ARCHETYPES.indexOf('shrub'),PLANT_ARCHETYPES.indexOf('herb'),GROUND_MATERIALS.indexOf('leafLitter'),40,85]));
const views=(ceiling=4)=>patches.map((_,i)=>({index:i,stage:ceiling,ceiling,age:500,disturbedYear:null}));
const plan=(owner,year,o={})=>{const ph=o.physics??physics(),standing=o.standing??[],mask=reclamationMask(owner,ph,standing);
 return {mask,...planReclamation({seed:7,site:'river-bank',owner,year,mask,patches,views:views(o.ceiling),existing:o.existing??[],standing})};};

test('D1b: zones open from confirmed changes — perimeter while vacant, interior while ruined; a repair or reuse closes them, a new vacancy reopens',()=>{
 assert.deepEqual(reclamationPeriods(block(LIFE)).map(p=>[p.zone,p.openedYear,p.closedYear,p.sourceKey]),[
  ['perimeter',110,335,'h:110'],['exposed-interior',140,320,'h:140'],['perimeter',400,null,'h:400']]);
 const fac={kind:'facility',id:'f',footprint:{x:100,y:146,width:18,depth:7},protectedPlans:facilityWallPlans({x:100,y:146,width:18,depth:7}),changes:[F(0,'intact'),F(50,'damaged'),F(120,'ruined'),F(420,'intact')]};
 assert.deepEqual(reclamationPeriods(fac).map(p=>[p.zone,p.openedYear,p.closedYear]),[['exposed-interior',120,420],['perimeter',120,420]]);
 // damaged alone opens nothing
 assert.deepEqual(reclamationPeriods(block([H(0,'occupied','sound'),H(10,'occupied','damaged')])),[]);
 const p=reclamationPeriods(block(LIFE));
 assert.deepEqual(openZonesAt(p,100),[]);assert.deepEqual(openZonesAt(p,110).map(x=>x.zone),['perimeter']);
 assert.deepEqual(openZonesAt(p,200).map(x=>x.zone),['perimeter','exposed-interior']);assert.deepEqual(openZonesAt(p,330).map(x=>x.zone),['perimeter']);
 assert.deepEqual(openZonesAt(p,350),[]);assert.deepEqual(openZonesAt(p,401).map(x=>x.openedYear),[400]);
});

test('D1b: invalid timelines are refused (unsorted, a ruin in use, starting abandoned, unknown states)',()=>{
 for(const c of [[H(10,'occupied','sound'),H(5,'vacant','sound')],[H(0,'occupied','sound'),H(5,'occupied','ruined')],[H(0,'vacant','sound')],[H(0,'occupied','new')],[{year:0,use:'occupied',condition:'sound',sourceKey:''}]])
  assert.throws(()=>reclamationPeriods(block(c)));
 assert.throws(()=>reclamationPeriods(block([])));
 assert.throws(()=>openZonesAt([],-1));
});

test('D1b: the mask avoids structure plans with clearance, water and standing neighbours; the interior is inside the footprint only',()=>{
 const owner=block(LIFE),ph=physics();for(let y=96;y<180;y++)for(let x=90;x<96;x++)ph.surface[y*320+x]=2;
 const neighbour={x:92,y:140,width:20,depth:22},mask=reclamationMask(owner,ph,[neighbour]),f=owner.footprint,c=RECLAMATION_PARAMETERS.clearance;
 let interior=0,perimeter=0;
 for(let i=0;i<57600;i++){if(!mask[i])continue;const x=i%320,y=Math.floor(i/320);
  assert.equal(ph.surface[i],1,'water '+x+','+y);
  for(const p of owner.protectedPlans)assert.ok(!(x>=p.x-c&&x<p.x+p.width+c&&y>=p.y-c&&y<p.y+p.depth+c),'on a structure '+x+','+y);
  assert.ok(!(x>=neighbour.x-4&&x<neighbour.x+neighbour.width+4&&y>=neighbour.y-4&&y<neighbour.y+neighbour.depth+4),'in a standing neighbour '+x+','+y);
  const inside=x>=f.x&&x<f.x+f.width&&y>=f.y&&y<f.y+f.depth;
  if(mask[i]===2){interior++;assert.ok(inside&&x>=f.x+2&&x<f.x+f.width-2&&y>=f.y+2&&y<f.y+f.depth-2);}else perimeter++;
 }
 assert.ok(interior>0&&perimeter>0);
 // a facility's interior is inside its wall line
 const fp={x:100,y:146,width:18,depth:7},fm=reclamationMask({kind:'facility',id:'f',footprint:fp,protectedPlans:facilityWallPlans(fp),changes:[F(0,'intact')]},physics(),[]);
 for(let i=0;i<57600;i++)if(fm[i]===2){const x=i%320,y=Math.floor(i/320);assert.ok(x>=fp.x+2&&x<fp.x+fp.width-2&&y>=fp.y+2&&y<fp.y+fp.depth-2);}
});

test('D1b: roots stand only on open zones, grow from the opening year through the stages, and stop at the community ceiling',()=>{
 const owner=block(LIFE);
 assert.equal(plan(owner,100).plants.length,0,'nothing while in use');
 for(const year of [112,130,170,250,330,450,800]){
  const {mask,plants,roots}=plan(owner,year),open=openZonesAt(reclamationPeriods(owner),year);
  assert.equal(plants.length,roots.length);
  for(const r of roots){
   const period=open.find(p=>p.zone===r.zone&&p.openedYear===r.openedYear);assert.ok(period,'root on a closed zone');
   for(const [dx,dy] of [[0,0],[1,0],[0,1],[1,1]])assert.equal(mask[(r.y+dy)*320+r.x+dx],r.zone==='perimeter'?1:2);
   assert.ok(r.stage>=1&&r.stage<=stageOfAge(year-r.openedYear),`stage ${r.stage} too high for ${year-r.openedYear} years`);
  }
  for(const p of plants)if(p.kind==='low')for(const q of plants)if(q!==p&&q.kind==='low')assert.ok((p.x-q.x)**2+(p.y-q.y)**2>=LOW_SPACING**2);
 }
 // a new vacancy starts again from grass: no trees 20 years after reopening
 assert.ok(plan(owner,420).plants.every(p=>p.kind==='low'&&p.stage==='young'));
 // a ceiling of grass keeps it grass
 assert.ok(plan(owner,800,{ceiling:1}).plants.every(p=>p.kind==='low'&&p.stage==='young'));
 assert.ok(plan(owner,300).plants.some(p=>p.kind==='tree'),'a long ruin grows trees in a forest');
});

test('D1b: later changes never alter an earlier year, existing plants are kept apart and untouched, and nothing uses a random source',()=>{
 const owner=block(LIFE),truncated=y=>block(LIFE.filter(c=>c.year<=y));
 for(const year of [115,200,330])assert.deepEqual(plan(owner,year).plants,plan(truncated(year),year).plants);
 const existing=Object.freeze([Object.freeze({kind:'tree',id:'deciduous',x:60,y:136,stage:'mature',variant:0,painter:'restrained'})]);
 const r=plan(owner,300,{existing});
 assert.equal(existing.length,1);assert.ok(r.plants.every(p=>p!==existing[0]));
 for(const p of r.plants)assert.ok((p.x-60)**2+(p.y-136)**2>=(p.kind==='tree'?10:8)**2);
 const random=Math.random;Math.random=()=>{throw Error('random used');};
 try{assert.deepEqual(plan(owner,300).plants,plan(owner,300).plants);}finally{Math.random=random;}
});

test('D1b: nothing in the live game imports the ruin prototypes',()=>{
 const walk=d=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?walk(p):[p];});
 for(const f of walk('src').filter(f=>!f.startsWith(join('src','ruin'))))assert.ok(!/ruin\/(ruin-weathering|reclamation-access)/.test(readFileSync(f,'utf8')),f);
 assert.ok(!/reclamation-access/.test(readFileSync('index.html','utf8')));
});
