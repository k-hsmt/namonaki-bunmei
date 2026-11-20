/** Issue #38 D1c: short motions stay on the proven spot, flying birds cross the whole screen, and the still is second 0. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {planFaunaAppearance,faunaBodyFits,HABITAT_PARAMETERS} from '../dist/fauna/fauna-habitat-v1.js';
import {faunaSceneLoops,faunaSceneAt,FAUNA_LOOP_SECONDS} from '../dist/fauna/fauna-scene-v1.js';
import {faunaSprite,faunaBounds,FAUNA_GROUP,faunaMotionNet} from '../dist/fauna/fauna-sprites-v1.js';

/** A synthetic grassland district with a river at x 150–169 (same as the D1b tests). */
function district({biome=2,river=true}={}){
 const surface=new Uint8Array(57600),grade=new Uint8Array(57600);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++)surface[y*320+x]=river&&x>=150&&x<170?2:1;
 const patches=Array.from({length:440},(_,i)=>{const x=(i%40)*8;return river&&x>=150&&x<168?null:[0,biome,-1,8,9,2,40,60];});
 return {seed:23,site:'river-bank',year:500,surface,grade,patches,views:patches.map((p,i)=>p?{index:i,stage:2,ceiling:4,age:40,disturbedYear:null}:null),standing:[],population:0};
}
const box=s=>{const b=faunaBounds(faunaSprite(s.kind,s.size,s.pose,s.frame));return s.facing===1?{l:s.x+b.left,r:s.x+b.right}:{l:s.x-b.right,r:s.x-b.left};};

test('D1c: every loop is 10 s and closes; ground and water animals stay within the step room of their spot',()=>{
 for(const d of [district(),district({biome:4}),district({biome:0})]){
  const plan=planFaunaAppearance(d),loops=faunaSceneLoops(plan,d);assert.ok(loops.length>0);
  for(const l of loops){
   assert.equal(l.segments.reduce((s,x)=>s+x.seconds,0),FAUNA_LOOP_SECONDS,l.kind);
   if(FAUNA_GROUP[l.kind]==='flying-bird')continue;
   assert.deepEqual(faunaMotionNet(l.segments),{dx:0,dy:0});
   for(let k=0;k<FAUNA_LOOP_SECONDS*12;k++){const s=faunaSceneAt([l],k/12)[0];
    assert.ok(Math.abs(s.x-l.x)<=HABITAT_PARAMETERS.stepRoom&&s.y===l.y,`${l.kind} moved too far`);
    assert.ok(faunaBodyFits(d,s.kind,s.size,s.pose,s.x,s.y,s.frame,0,s.facing),`${l.kind} ${s.pose} off its ground at ${k/12}s`);}
  }
 }
});

test('D1c: flying birds cross from one edge to the other and are absent only off screen',()=>{
 const d=district(),loops=faunaSceneLoops(planFaunaAppearance(d),d).filter(l=>FAUNA_GROUP[l.kind]==='flying-bird');
 assert.ok(loops.length>0,'the synthetic district shows a flock');
 for(const l of loops){
  let prev=null,seen=false;
  for(let k=0;k<=FAUNA_LOOP_SECONDS*12*2;k++){const s=faunaSceneAt([l],k/12)[0]??null,on=s&&box(s).r>=0&&box(s).l<320;if(on)seen=true;
   if(prev&&!s)assert.ok(!(box(prev).r>=0&&box(prev).l<320),'vanished inside the screen');
   if(!prev&&s&&k>0)assert.ok(!on,'appeared inside the screen');
   if(s)assert.ok(s.y<HABITAT_PARAMETERS.skyFloor);prev=s;}
  assert.ok(seen);
 }
});

test('D1c: a loop whose moves leave the ground holds the planned pose; the still image is second 0; nothing reads a clock',()=>{
 // a duck on a 1-px-wider-than-needed pond: drifting would leave the water, so it holds still
 const d=district({river:false});for(let y=150;y<153;y++)for(let x=100;x<112;x++)d.surface[y*320+x]=2;
 const plan={ruleId:'fauna-habitat-v1',seed:23,site:'river-bank',year:500,dropped:{cap:0,spacing:0,'no-room':0},
  groups:[{candidate:'river-bank:6:4',group:'water-bird',kind:'duck',suitability:1,threshold:.8,members:[{kind:'duck',size:6,pose:'float',x:106,y:151,facing:1}]}]};
 const [held]=faunaSceneLoops(plan,d);assert.equal(held.segments.length,1);assert.equal(held.segments[0].pose,'float');
 for(let k=0;k<120;k++){const s=faunaSceneAt([held],k/12)[0];assert.equal(s.frame,0);assert.equal(s.x,106);}
 const [free]=faunaSceneLoops(plan);assert.ok(free.segments.length>1,'without the year input the loop is not checked');
 const random=Math.random,now=Date.now;Math.random=()=>{throw Error('random');};Date.now=()=>{throw Error('clock');};
 try{const loops=faunaSceneLoops(planFaunaAppearance(district()),district());assert.deepEqual(faunaSceneAt(loops,0),faunaSceneAt(loops,FAUNA_LOOP_SECONDS));assert.deepEqual(faunaSceneAt(loops,3.25),faunaSceneAt(loops,3.25));}
 finally{Math.random=random;Date.now=now;}
 assert.throws(()=>faunaSceneAt([],-1));
});

test('D1c: a body fits only where its mirrored feet fit too',()=>{
 // a duck whose ripple trails to its left: facing right it fits against the left shore, facing left the ripple is on land
 const d=district({river:false});for(let y=140;y<143;y++)for(let x=100;x<106;x++)d.surface[y*320+x]=2;
 const fits=f=>faunaBodyFits(d,'duck',6,'float',104,141,0,0,f);
 assert.notEqual(fits(1),fits(-1));assert.equal(fits(1),true);assert.equal(faunaBodyFits(d,'duck',6,'float',104,141,0,0),false,"the plan's default needs both facings");
});

test('D2: the live game loads src/fauna only through the world session',()=>{
 const walk=d=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?walk(p):[p];});
 assert.deepEqual(walk('src').filter(f=>!f.startsWith(join('src','fauna'))&&/fauna\//.test(readFileSync(f,'utf8'))),[join('src','story','world-session.ts')]);
});
