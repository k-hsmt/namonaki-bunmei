/** Issue #38 D1a: the fauna sprite prototype is a pure, deterministic drawing, inside the D0 size bands, and inert in the live game. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {FAUNA_KINDS,FAUNA_GROUP,FAUNA_SIZE,FAUNA_POSES,FAUNA_AIR_POSES,FAUNA_WATER_POSES,
 faunaSprite,faunaBounds,faunaLift,drawFauna,faunaDepthSize,faunaMotionAt,faunaMotionNet} from '../dist/fauna/fauna-sprites-v1.js';

const every=function*(){for(const kind of FAUNA_KINDS)for(let size=FAUNA_SIZE[kind].min;size<=FAUNA_SIZE[kind].band[1];size++)
 for(const [pose,n] of Object.entries(FAUNA_POSES[kind]))for(let frame=0;frame<n;frame++)yield {kind,size,pose,frame};};
const pixels=(kind,size,pose,frame,x,y,facing)=>{const m=new Map();drawFauna({rect(a,b,w,h,c){for(let yy=b;yy<b+h;yy++)for(let xx=a;xx<a+w;xx++)m.set(xx+','+yy,c);}},kind,size,pose,frame,x,y,facing);return m;};

test('D1a: every frame of every size is integer rectangles in valid colours, and stands on its ground line',()=>{
 let count=0;
 for(const {kind,size,pose,frame} of every()){
  const rects=faunaSprite(kind,size,pose,frame),b=faunaBounds(rects);count++;
  for(const r of rects){assert.ok([r.x,r.y,r.w,r.h].every(Number.isInteger)&&r.w>0&&r.h>0);assert.match(r.color,/^#[0-9a-f]{6}$/);}
  if(FAUNA_AIR_POSES.includes(pose))assert.ok(b.bottom<=0,`${kind} ${pose}: a flying bird is never below its origin row`);
  else assert.equal(b.bottom,0-faunaLift(kind,size,pose,frame),`${kind}:${size} ${pose}#${frame} lowest row`);
  if(FAUNA_WATER_POSES.includes(pose))assert.equal(faunaLift(kind,size,pose,frame),0);
 }
 assert.ok(count>300);
 // only the airborne frame of a hop leaves the ground
 assert.equal(faunaLift('hare',5,'hop',2),2);assert.equal(faunaLift('sparrow',3,'hop',1),1);assert.equal(faunaLift('deer',10,'walk',2),0);
});

test('D1a: the painted width of each preset lies in the D0 §9 band; larger sizes are never smaller',()=>{
 for(const kind of FAUNA_KINDS){
  const S=FAUNA_SIZE[kind],pose=FAUNA_GROUP[kind]==='flying-bird'?'glide':Object.keys(FAUNA_POSES[kind])[0];
  const w=faunaBounds(faunaSprite(kind,S.preset,pose,0)).width;
  assert.ok(w>=S.band[0]&&w<=S.band[1],`${kind}: preset width ${w} outside ${S.band}`);
  let last=0;for(let s=S.min;s<=S.band[1];s++){const ws=faunaBounds(faunaSprite(kind,s,pose,0)).width;assert.ok(ws>=last,`${kind} ${s}`);last=ws;}
 }
 // groups: large herbivores are larger than small ground animals and small birds
 const width=(k)=>faunaBounds(faunaSprite(k,FAUNA_SIZE[k].preset,Object.keys(FAUNA_POSES[k])[0],0)).width;
 for(const big of ['deer','horse','bison'])for(const small of ['hare','sparrow'])assert.ok(width(big)>width(small));
});

test('D1a: invalid kinds, sizes, poses and frames are refused; no livestock kind exists',()=>{
 assert.throws(()=>faunaSprite('cow',10,'stand',0));
 assert.throws(()=>faunaSprite('deer',15,'stand',0));assert.throws(()=>faunaSprite('deer',4,'stand',0));assert.throws(()=>faunaSprite('deer',10.5,'stand',0));
 assert.throws(()=>faunaSprite('deer',10,'fly',0));assert.throws(()=>faunaSprite('duck',6,'walk',0));
 assert.throws(()=>faunaSprite('deer',10,'walk',4));assert.throws(()=>faunaSprite('deer',10,'walk',-1));
 assert.throws(()=>drawFauna({rect(){}},'deer',10,'stand',0,1.5,10));assert.throws(()=>drawFauna({rect(){}},'deer',10,'stand',0,1,10,0));
 // D0 §2, §6: wild animals only; nothing is named or grouped as livestock
 assert.deepEqual([...new Set(Object.values(FAUNA_GROUP))].sort(),['flying-bird','large-herbivore','small-bird','small-ground','water-bird']);
 for(const k of FAUNA_KINDS)assert.doesNotMatch(k,/cow|cattle|chicken|sheep|goat|pig|livestock|domestic/);
});

test('D1a: facing −1 mirrors the frame about its origin column; a frame is the same wherever it is drawn',()=>{
 for(const {kind,size,pose,frame} of every()){
  if(size!==FAUNA_SIZE[kind].preset)continue;
  const right=pixels(kind,size,pose,frame,50,40,1),left=pixels(kind,size,pose,frame,50,40,-1),moved=pixels(kind,size,pose,frame,57,43,1);
  assert.equal(left.size,right.size);
  for(const [k,c] of right){const [x,y]=k.split(',').map(Number);assert.equal(left.get((100-x)+','+y),c);assert.equal(moved.get((x+7)+','+(y+3)),c);}
 }
});

test('D1a: walking moves the legs, grazing lowers the head, flapping changes the wings',()=>{
 const differs=(k,s,p,a,b)=>JSON.stringify(faunaSprite(k,s,p,a))!==JSON.stringify(faunaSprite(k,s,p,b));
 for(const k of ['deer','horse','bison','fox'])assert.ok(differs(k,FAUNA_SIZE[k].preset,'walk',0,1)&&differs(k,FAUNA_SIZE[k].preset,'walk',0,2));
 for(const k of ['deer','horse']){const s=FAUNA_SIZE[k].preset;assert.ok(faunaBounds(faunaSprite(k,s,'graze',0)).top>faunaBounds(faunaSprite(k,s,'stand',0)).top,k);}
 // the bison's hump stays the highest point; its head goes from the chest down to the grass
 const headLow=p=>Math.max(...faunaSprite('bison',11,p,0).filter(r=>r.x>=4).map(r=>r.y+r.h-1));
 assert.ok(headLow('graze')>headLow('stand'));assert.equal(headLow('graze'),0);
 for(const k of ['crow','gull','duck','heron','sparrow'])assert.ok(differs(k,FAUNA_SIZE[k].preset,'fly',0,2),k);
 // the up and down strokes mirror vertically around the body row
 const up=faunaBounds(faunaSprite('crow',7,'fly',0)),down=faunaBounds(faunaSprite('crow',7,'fly',2));
 assert.ok(up.top<down.top&&up.bottom<down.bottom);
});

test('D1a: motions are deterministic, at most 12 fps, and close their loop unless they leave while absent',()=>{
 const seg=[{pose:'stand',seconds:2},{pose:'walk',seconds:2,fps:6,vx:3},{pose:'walk',seconds:2,fps:6,vx:-3,facing:-1},{pose:'absent',seconds:1}];
 const random=Math.random,now=Date.now;Math.random=()=>{throw Error('random used');};Date.now=()=>{throw Error('clock used');};
 try{
  for(let f=0;f<84;f++){const t=f/12;assert.deepEqual(faunaMotionAt('deer',seg,t),faunaMotionAt('deer',seg,t));assert.deepEqual(faunaMotionAt('deer',seg,t),faunaMotionAt('deer',seg,t+7));}
 }finally{Math.random=random;Date.now=now;}
 assert.deepEqual(faunaMotionNet(seg),{dx:0,dy:0});
 assert.equal(faunaMotionAt('deer',seg,6.5),null);
 assert.deepEqual(faunaMotionAt('deer',seg,0),{pose:'stand',frame:0,dx:0,dy:0,facing:1});
 const w=faunaMotionAt('deer',seg,3);assert.equal(w.pose,'walk');assert.equal(w.dx,3);assert.equal(w.frame,6%4);
 assert.equal(faunaMotionAt('deer',seg,5).facing,-1);
 // the offset moves by whole pixels on the 12 fps clock and never jumps within a segment
 let last=0;for(let f=24;f<48;f++){const m=faunaMotionAt('deer',seg,f/12);assert.ok(Math.abs(m.dx-last)<=1);last=m.dx;}
 assert.throws(()=>faunaMotionAt('deer',seg,-1));assert.throws(()=>faunaMotionAt('deer',seg,NaN));
 assert.throws(()=>faunaMotionAt('deer',[{pose:'fly',seconds:1}],0));assert.throws(()=>faunaMotionAt('deer',[{pose:'walk',seconds:1,fps:24}],0));
 assert.throws(()=>faunaMotionAt('deer',[],0));assert.throws(()=>faunaMotionAt('deer',[{pose:'stand',seconds:0}],0));
});

test('D1a: the depth scaling candidate stays between the smallest size and the near size',()=>{
 for(const k of FAUNA_KINDS){const S=FAUNA_SIZE[k];
  assert.equal(faunaDepthSize(k,S.preset,1),S.preset);
  for(const d of [0,.25,.5,.75,1]){const s=faunaDepthSize(k,S.preset,d);assert.ok(s>=S.min&&s<=S.preset);faunaSprite(k,s,Object.keys(FAUNA_POSES[k])[0],0);}
 }
 assert.throws(()=>faunaDepthSize('deer',10,1.1));
});

test('D1a: the live game never loads the fauna prototype, and the prototype reads nothing from a world',()=>{
 const walk=d=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?walk(p):[p];});
 const users=walk('src').filter(f=>!f.startsWith(join('src','fauna'))&&/fauna\//.test(readFileSync(f,'utf8')));
 assert.deepEqual(users,[]);
 assert.doesNotMatch(readFileSync('index.html','utf8'),/fauna/);
 const source=readFileSync(join('src','fauna','fauna-sprites-v1.ts'),'utf8');
 assert.doesNotMatch(source,/^import /m,'the prototype imports nothing');
 assert.doesNotMatch(source,/Math\.random|Date\.now|performance\.now|localStorage/);
});
