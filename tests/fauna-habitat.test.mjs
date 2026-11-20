/** Issue #38 D1b: habitat candidates are fixed, suitability reads only the year it is given, plans place bodies only where they fit. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {faunaHabitatCandidates,candidateThreshold,habitatFeatures,faunaSuitability,planFaunaAppearance,faunaBodyFits,smoothedSuitability,
 HABITAT_GRID,HABITAT_PARAMETERS,FAUNA_GROUPS} from '../dist/fauna/fauna-habitat-v1.js';
import {faunaSprite,faunaBounds} from '../dist/fauna/fauna-sprites-v1.js';

/** A synthetic district: grassland (biome 2) everywhere, open plants at stage 2, a river at x 150–169. */
function district({river=true,standing=[],population=0,biome=2,canopy=-1,stage=2,year=500}={}){
 const surface=new Uint8Array(57600),grade=new Uint8Array(57600);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++)surface[y*320+x]=river&&x>=150&&x<170?2:1;
 const patches=Array.from({length:440},(_,i)=>{const x=(i%40)*8;return river&&x>=150&&x<168?null:[0,biome,canopy,8,9,2,40,60];});
 const views=patches.map((p,i)=>p?{index:i,stage,ceiling:4,age:40,disturbedYear:null}:null);
 return {seed:23,site:'river-bank',year,surface,grade,patches,views,standing,population};
}
const all=plan=>plan.groups.flatMap(g=>g.members.map(m=>({...m,group:g.group,candidate:g.candidate})));

test('D1b: candidates are fixed per seed and site — one per grid cell, unique ids, never renumbered',()=>{
 const a=faunaHabitatCandidates(23,'river-bank'),b=faunaHabitatCandidates(23,'river-bank'),G=HABITAT_GRID;
 assert.equal(a.length,G.cols*G.rows);assert.deepEqual(a,b);
 assert.equal(new Set(a.map(c=>c.id)).size,a.length);
 for(const c of a){assert.ok(c.x>=c.col*G.cellWidth&&c.x<(c.col+1)*G.cellWidth);assert.ok(c.y>=G.top+c.row*G.cellHeight&&c.y<G.top+(c.row+1)*G.cellHeight);}
 assert.notDeepEqual(a.map(c=>[c.x,c.y]),faunaHabitatCandidates(24,'river-bank').map(c=>[c.x,c.y]));
 assert.notDeepEqual(a.map(c=>[c.x,c.y]),faunaHabitatCandidates(23,'hill-side').map(c=>[c.x,c.y]));
 // thresholds are fixed per candidate and group, within the parameter band
 for(const c of a)for(const g of FAUNA_GROUPS){const t=candidateThreshold(23,c,g),P=HABITAT_PARAMETERS;assert.equal(t,candidateThreshold(23,c,g));assert.ok(Math.abs(t-P.threshold[g])<=P.thresholdSpread/2+1e-9);}
 assert.throws(()=>faunaHabitatCandidates(1.5,'river-bank'));
});

test('D1b: missing terrain or plants fail closed; nothing depends on the year label, a random source or the clock',()=>{
 const d=district();
 assert.throws(()=>planFaunaAppearance({...d,surface:undefined}));assert.throws(()=>planFaunaAppearance({...d,patches:[]}));
 assert.throws(()=>planFaunaAppearance({...d,views:d.views.slice(1)}));assert.throws(()=>planFaunaAppearance({...d,population:-1}));
 const random=Math.random,now=Date.now;Math.random=()=>{throw Error('random used');};Date.now=()=>{throw Error('clock used');};
 try{
  const a=planFaunaAppearance(d),b=planFaunaAppearance({...d,year:7000});
  assert.deepEqual({...a,year:0},{...b,year:0});assert.deepEqual(a,planFaunaAppearance(d));
  assert.ok(all(a).length>0);
 }finally{Math.random=random;Date.now=now;}
});

test('D1b: groups react to people in different directions; water birds need water',()=>{
 const c=faunaHabitatCandidates(23,'river-bank').find(c=>c.row===3&&c.col===4);
 const free=faunaSuitability(district(),c),near=[{x:c.x+6,y:c.y-2,width:10,depth:6}];
 const crowded=faunaSuitability(district({standing:near,population:20000}),c);
 assert.ok(crowded['large-herbivore']<free['large-herbivore'],'large herbivores avoid a building next to them');
 // small birds favour the edge of a settlement (about 20 px from a building) over open land
 const edge=faunaSuitability(district({standing:[{x:c.x+20,y:c.y-3,width:8,depth:6}],population:500}),c);
 assert.ok(edge['small-bird']>free['small-bird']);
 const dry=faunaSuitability(district({river:false}),faunaHabitatCandidates(23,'river-bank').find(c=>c.col===10&&c.row===3));
 assert.equal(dry['water-bird'],0);
 // flying birds are read only on the horizon row
 assert.ok(faunaHabitatCandidates(23,'river-bank').filter(c=>c.row>0).every(c=>faunaSuitability(district(),c)['flying-bird']===0));
 // features read neighbouring patches, never one patch alone
 const f=habitatFeatures(district({stage:0}),c.x,c.y,32);assert.equal(f.bare,1);assert.equal(f.open,0);
});

test('D1b: every animal fits its body on land (or water), off standing plots, near its own candidate, without overlap',()=>{
 const plots=[{x:40,y:120,width:60,depth:30},{x:200,y:100,width:40,depth:20}];
 for(const d of [district(),district({standing:plots,population:5000}),district({biome:6}),district({biome:3,canopy:0,stage:3})]){
  const plan=planFaunaAppearance(d),members=all(plan),P=HABITAT_PARAMETERS;
  assert.ok(members.length<=P.animalsPerSite);
  for(const g of FAUNA_GROUPS)assert.ok(plan.groups.filter(q=>q.group===g).length<=P.groupsPerSite[g]);
  const cands=new Map(faunaHabitatCandidates(d.seed,d.site).map(c=>[c.id,c]));
  for(const m of members){
   assert.ok(faunaBodyFits(d,m.kind,m.size,m.pose,m.x,m.y));
   if(m.group!=='flying-bird'){
    const c=cands.get(m.candidate);assert.ok(Math.abs(m.x-c.x)<=10&&Math.abs(m.y-c.y)<=4,'no far move');
    const b=faunaBounds(faunaSprite(m.kind,m.size,m.pose,0));
    for(const p of d.standing)assert.ok(m.x+b.right<p.x||m.x+b.left>=p.x+p.width||m.y+b.top>=p.y+p.depth||m.y+b.bottom<p.y,'body off plots');
   }else assert.ok(m.y<P.skyFloor);
   if(m.pose==='float')assert.ok(d.surface[m.y*320+m.x]===2);
  }
  for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const a=members[i],b=members[j];assert.ok(!(a.x===b.x&&a.y===b.y));}
 }
 // a body never stands on water, on a plot, or on a steep slope
 const d=district({standing:[{x:20,y:140,width:20,depth:10}]});
 assert.equal(faunaBodyFits(d,'deer',10,'stand',160,150),false);
 assert.equal(faunaBodyFits(d,'deer',10,'stand',30,149),false);
 assert.equal(faunaBodyFits(d,'duck',6,'float',160,150),true);assert.equal(faunaBodyFits(d,'duck',6,'float',60,150),false);
 const steep=district();steep.grade.fill(2);assert.equal(faunaBodyFits(steep,'deer',10,'stand',60,150),false);
});

test('D1b: smoothing is the mean of earlier sampled suitabilities and needs at least one year',()=>{
 const a={'large-herbivore':1,'small-ground':0,'small-bird':.5,'water-bird':0,'flying-bird':.2},b={...a,'large-herbivore':0,'small-ground':1};
 assert.deepEqual(smoothedSuitability([a,b]),{'large-herbivore':.5,'small-ground':.5,'small-bird':.5,'water-bird':0,'flying-bird':.2});
 assert.throws(()=>smoothedSuitability([]));
});

test('D1b: the habitat prototype reads only the hash and the D1a sprites',()=>{
 const imports=[...readFileSync('src/fauna/fauna-habitat-v1.ts','utf8').matchAll(/^import .* from '(.+)';$/gm)].map(m=>m[1]).sort();
 assert.deepEqual(imports,['../terrain/terrain-hash-v1.js','./fauna-sprites-v1.js']);
});
