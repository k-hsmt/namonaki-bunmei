/**
 * Issue #38 D1a: fauna silhouettes, scale and short motions — an independent gallery (PROTOTYPE).
 * Hand-placed stages only: nothing is read from or written to a world, a habitat, a year, a save or a history
 * (D0 §12 D1a, §13). The live game does not load src/fauna.
 *
 *   npm run build && node scripts/preview-fauna-d1a.mjs  →  artifacts/fauna38-d1a/{gallery.html,report.json,*.png}
 *
 *  1. poses_<kind>:   every pose × frame of one kind at its preset size, next to the live person (2×7 px)
 *  2. scale_<kind>:   size candidates in the D0 §9 band next to a person, a near housing part, a house and a tree
 *  3. depth_<mode>:   far / middle / near on a 320×180 stage, animals at a fixed size (as people) or scaled by depth
 *  4. action_<kind>:  a 10 s loop of short motions (12 fps strip, animated in the gallery)
 *  5. stage_<id>:     320×180 stages, 10 s at 12 fps (strip) and the still at 0 s, with mechanical checks:
 *                     feet on land / water, no overlap with buildings, no appearing or vanishing inside the screen,
 *                     no jumps. The script fails if any check fails.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Raster} from './lib/pixel-raster.mjs';
import {drawArchitecture,measureArchitecture} from '../dist/architecture/draw-v1.js';
import {drawMiniature} from '../dist/architecture/miniature-v1.js';
import {rasterizeFlora} from '../dist/flora/flora-scene-v1.js';
import {terrainHash} from '../dist/terrain/terrain-hash-v1.js';
import {FAUNA_KINDS,FAUNA_GROUP,FAUNA_SIZE,FAUNA_POSES,FAUNA_PALETTE,FAUNA_AIR_POSES,FAUNA_WATER_POSES,FAUNA_SPRITES_RULE_ID,
 faunaSprite,faunaBounds,drawFauna,faunaDepthSize,faunaMotionAt,faunaMotionNet} from '../dist/fauna/fauna-sprites-v1.js';

const out='artifacts/fauna38-d1a',SKY='#c9cdb8',WATER='#6f8f9a',FPS=12,LOOP=10,FRAMES=FPS*LOOP;
await mkdir(out,{recursive:true});
const LABEL={deer:'シカ類',horse:'野生ウマ類',bison:'野生ウシ類（バイソン型）',hare:'ノウサギ類',fox:'キツネ類',sparrow:'小鳥（スズメ型）',duck:'水鳥（カモ型）',heron:'水鳥（サギ型）',crow:'飛翔鳥（カラス型）',gull:'飛翔鳥（カモメ型）'};
const POSE_LABEL={stand:'佇み',graze:'採食',walk:'歩行',rest:'休息（伏せ）',sit:'座り',hop:'跳躍',peck:'ついばみ',float:'水上浮遊',dabble:'逆立ち採食',wade:'水辺の歩行',fly:'羽ばたき',glide:'滑空'};
const files=[];
const save=async(name,raster,extra={})=>{const png=raster.png();await writeFile(`${out}/${name}.png`,png);files.push({name,width:raster.width,height:raster.height,sha256:createHash('sha256').update(png).digest('hex'),...extra});};
const hex=(r,g,b)=>'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');

// ---------------------------------------------------------------- the live references (not fauna)
/** The live person (scene/motion-frame.ts): 2 px wide, feet at y, 7 rows. */
const person=(r,x,y,i=0,walking=false,step=0)=>{r.rect(x,y-6,2,2,'#d2b894');r.rect(x,y-4,2,3,['#66594f','#b29b74','#667a70'][i%3]);
 if(walking){r.rect(x,y-1+step,1,2-step,'#454e48');r.rect(x+1,y-1+(step?0:1),1,2-(step?0:1),'#454e48');}else r.rect(x,y-1,2,2,'#454e48');};
/** Plants through the live rasterizer (B painter, live depth scale by root y). Returns drawables. */
const plants=list=>rasterizeFlora(list.map(p=>({kind:p.kind??'tree',id:p.id,x:p.x,y:p.y,stage:p.stage??'mature',variant:p.variant??0,painter:'restrained'})),false).items
 .map(it=>({y:it.root,order:0,draw:(r,dy=0)=>{for(let i=0;i<it.x.length;i++)r.rect(it.x[i],it.y[i]+dy,1,1,hex(it.rgba[i*4],it.rgba[i*4+1],it.rgba[i*4+2]));}}));
const boundsOf=paint=>{let l=Infinity,t=Infinity,rr=-Infinity,b=-Infinity;paint({rect(x,y,w,h){l=Math.min(l,x);t=Math.min(t,y);rr=Math.max(rr,x+w-1);b=Math.max(b,y+h-1);}});return {left:l,top:t,right:rr,bottom:b};};
const HOUSE={use:'house',structure:'S01',wall:'wattle',roofMaterial:'thatch',eaves:'deep',entrance:'E3',foundation:'F2'};
const HOUSE2={use:'house',structure:'S06',roofFamily:'R08',roofMaterial:'shingle',window:'W4',entrance:'E4',palette:'P05'};

// ---------------------------------------------------------------- 1. poses × frames
const PCW=30,PCH=24,PGY=PCH-5;
const poseCell=(kind,pose,frame,size=FAUNA_SIZE[kind].preset)=>{
 const c=new Raster(PCW,PCH),water=FAUNA_WATER_POSES.includes(pose);c.rect(0,0,PCW,PCH,SKY);c.rect(0,PGY+1,PCW,PCH-PGY-1,'#9a9a62');
 if(water)c.rect(8,PGY,PCW-8,PCH-PGY,WATER);
 person(c,3,PGY);
 const air=FAUNA_AIR_POSES.includes(pose)?8:0;drawFauna(c,kind,size,pose,frame,18,PGY-air,1);
 return c;
};
const sprites=[];
for(const kind of FAUNA_KINDS){
 const poses=Object.entries(FAUNA_POSES[kind]),cols=Math.max(...poses.map(p=>p[1])),r=new Raster(PCW*cols,PCH*poses.length);
 r.rect(0,0,r.width,r.height,'#e4e6de');
 poses.forEach(([pose,n],i)=>{for(let f=0;f<n;f++){r.blit(poseCell(kind,pose,f),f*PCW,i*PCH);
  const b=faunaBounds(faunaSprite(kind,FAUNA_SIZE[kind].preset,pose,f));sprites.push({kind,size:FAUNA_SIZE[kind].preset,pose,frame:f,width:b.width,height:b.height,lowest:b.bottom});}});
 await save('poses_'+kind,r,{poses:poses.map(p=>p[0]),columns:cols});
}

// ---------------------------------------------------------------- 2. scale candidates
const CANDIDATES={deer:[8,10,12,14],horse:[8,11,14],bison:[8,11,14],hare:[3,5,7],fox:[5,7],sparrow:[2,3,4,5],duck:[4,6,8],heron:[5,7,8],crow:[4,7,10],gull:[4,8,10]};
const SCW=24,SCH=40,SGY=34,REF=68;
/** The pose a scale candidate is shown in: flying birds by their span (glide), the rest by their first pose. */
const scalePose=kind=>FAUNA_GROUP[kind]==='flying-bird'?'glide':Object.keys(FAUNA_POSES[kind])[0];
const signature=(kind,s)=>JSON.stringify(faunaSprite(kind,s,scalePose(kind),0));
const scaleSheets={};
for(const kind of FAUNA_KINDS){
 // only sizes that draw a different sprite (small kinds have few distinct designs)
 const sizes=CANDIDATES[kind].filter((s,i,l)=>i===0||signature(kind,s)!==signature(kind,l[i-1])),r=new Raster(REF+SCW*sizes.length,SCH);r.rect(0,0,r.width,r.height,SKY);r.rect(0,SGY+1,r.width,SCH-SGY-1,'#9a9a62');
 // references: a mature deciduous tree at near scale (root y 176 → scale 1), a near housing part, a house, a person
 {const tmp=new Raster(320,180);for(const d of plants([{id:'deciduous',x:10,y:176}]))d.draw(tmp);
  for(let y=0;y<180;y++)for(let x=0;x<24;x++){const i=(y*320+x)*4;if(tmp.data[i+3]){const yy=y-176+SGY;if(yy>=0)r.rect(x,yy,1,1,hex(tmp.data[i],tmp.data[i+1],tmp.data[i+2]));}}}
 drawMiniature(r,HOUSE,30,SGY,'near');drawArchitecture(r,HOUSE2,52,SGY);
 sizes.forEach((s,j)=>{const x=REF+j*SCW,pose=scalePose(kind);person(r,x+1,SGY);
  if(FAUNA_WATER_POSES.includes(pose))r.rect(x+5,SGY,SCW-5,SCH-SGY,WATER);
  drawFauna(r,kind,s,pose,0,x+13,SGY-(FAUNA_AIR_POSES.includes(pose)?10:0),1);});
 scaleSheets[kind]=sizes.map(s=>{const pose=scalePose(kind),b=faunaBounds(faunaSprite(kind,s,pose,0));return {size:s,pose,width:b.width,height:b.height};});
 await save('scale_'+kind,r,{sizes});
}

// ---------------------------------------------------------------- 3. depth: fixed (as people) vs scaled (as plants)
const DEPTHS=[{id:'far',y:106},{id:'middle',y:140},{id:'near',y:174}];
const DEPTH_KINDS=['deer','horse','bison','hare','fox','sparrow','heron','crow'];
const depthInfo=[];
for(const mode of ['fixed','scaled']){
 const r=new Raster(320,180);r.rect(0,0,320,96,SKY);r.rect(0,96,320,84,'#9a9a62');
 const items=[];
 for(const d of DEPTHS){
  const depth=(d.y-96)/84;items.push(...plants([{id:'deciduous',x:12,y:d.y}]));
  items.push({y:d.y,order:1,draw:g=>drawMiniature(g,HOUSE,36,d.y,d.id)});
  items.push({y:d.y,order:2,draw:g=>person(g,48,d.y)});
  DEPTH_KINDS.forEach((k,i)=>{const near=FAUNA_SIZE[k].preset,size=mode==='fixed'?near:faunaDepthSize(k,near,depth),pose=FAUNA_AIR_POSES.includes(Object.keys(FAUNA_POSES[k])[0])?'fly':Object.keys(FAUNA_POSES[k])[0];
   depthInfo.push({mode,depth:d.id,kind:k,size});items.push({y:d.y,order:3,draw:g=>drawFauna(g,k,size,pose,0,68+i*32,d.y,1)});});
 }
 items.sort((a,b)=>a.y-b.y||a.order-b.order).forEach(it=>it.draw(r));
 await save('depth_'+mode,r);
}

// ---------------------------------------------------------------- 4. short actions (10 s loops)
/** start: the origin offset at 0 s; segments as fauna-sprites-v1 FaunaSegment. Every loop is exactly 10 s. */
const ACTIONS={
 deer:{start:[18,0],segments:[{pose:'stand',seconds:2},{pose:'graze',seconds:3,fps:2},{pose:'walk',seconds:1.5,fps:6,vx:4},{pose:'stand',seconds:1},{pose:'walk',seconds:1.5,fps:6,vx:-4,facing:-1},{pose:'graze',seconds:1,fps:2,facing:1}]},
 horse:{start:[18,0],segments:[{pose:'graze',seconds:3,fps:2},{pose:'walk',seconds:2,fps:5,vx:3},{pose:'stand',seconds:1.5},{pose:'walk',seconds:2,fps:5,vx:-3,facing:-1},{pose:'rest',seconds:1.5,facing:1}]},
 bison:{start:[20,0],segments:[{pose:'graze',seconds:4,fps:1.5},{pose:'walk',seconds:2,fps:4,vx:2},{pose:'rest',seconds:2},{pose:'walk',seconds:2,fps:4,vx:-2,facing:-1}]},
 hare:{start:[14,0],segments:[{pose:'sit',seconds:2},{pose:'graze',seconds:2,fps:2},{pose:'hop',seconds:1,fps:8,vx:12},{pose:'sit',seconds:1.5},{pose:'graze',seconds:1.5,fps:2},{pose:'hop',seconds:1,fps:8,vx:-12,facing:-1},{pose:'sit',seconds:1,facing:1}]},
 fox:{start:[16,0],segments:[{pose:'stand',seconds:1.5},{pose:'walk',seconds:3,fps:8,vx:8},{pose:'rest',seconds:2},{pose:'walk',seconds:3,fps:8,vx:-8,facing:-1},{pose:'stand',seconds:.5,facing:1}]},
 sparrow:{start:[16,0],segments:[{pose:'stand',seconds:1},{pose:'peck',seconds:2,fps:4},{pose:'hop',seconds:.5,fps:4,vx:6},{pose:'peck',seconds:1.5,fps:4},{pose:'hop',seconds:.5,fps:4,vx:-6,facing:-1},{pose:'stand',seconds:1,facing:1},{pose:'fly',seconds:1.5,fps:10,vx:10,vy:-6},{pose:'fly',seconds:1.5,fps:10,vx:-10,vy:6,facing:-1},{pose:'stand',seconds:.5,facing:1}]},
 duck:{start:[20,0],segments:[{pose:'float',seconds:3,fps:2},{pose:'float',seconds:2,fps:2,vx:3},{pose:'dabble',seconds:1.5,fps:2},{pose:'float',seconds:2,fps:2,vx:-3,facing:-1},{pose:'float',seconds:1.5,fps:2,facing:1}]},
 heron:{start:[22,0],segments:[{pose:'stand',seconds:3},{pose:'wade',seconds:2,fps:2,vx:2},{pose:'peck',seconds:2,fps:1.5},{pose:'wade',seconds:2,fps:2,vx:-2,facing:-1},{pose:'stand',seconds:1,facing:1}]},
 crow:{start:[-8,-14],segments:[{pose:'fly',seconds:2,fps:10,vx:12,vy:7},{pose:'stand',seconds:1},{pose:'peck',seconds:2.5,fps:3},{pose:'fly',seconds:2,fps:10,vx:12,vy:-7},{pose:'glide',seconds:1.5,vx:16},{pose:'absent',seconds:1}]},
 gull:{start:[-10,-12],segments:[{pose:'glide',seconds:3,vx:10},{pose:'fly',seconds:1,fps:8,vx:8,vy:12},{pose:'float',seconds:3,fps:2},{pose:'fly',seconds:1.5,fps:10,vx:10,vy:-8},{pose:'glide',seconds:1.5,vx:16}]},
};
const ACW=64,ACH=30,AGY=24;
const loopSeconds=s=>s.reduce((a,x)=>a+x.seconds,0);
const actionInfo=[];
for(const kind of FAUNA_KINDS){
 const a=ACTIONS[kind];if(Math.abs(loopSeconds(a.segments)-LOOP)>1e-9)throw Error('action loop is not 10 s: '+kind);
 const strip=new Raster(ACW,ACH*FRAMES),waterCell=a.segments.some(s=>FAUNA_WATER_POSES.includes(s.pose));
 for(let f=0;f<FRAMES;f++){
  const c=new Raster(ACW,ACH);c.rect(0,0,ACW,ACH,SKY);c.rect(0,AGY+1,ACW,ACH-AGY-1,'#9a9a62');if(waterCell)c.rect(0,AGY,ACW,ACH-AGY,WATER);
  person(c,3,AGY);
  const m=faunaMotionAt(kind,a.segments,f/FPS);if(m)drawFauna(c,kind,FAUNA_SIZE[kind].preset,m.pose,m.frame,a.start[0]+m.dx,AGY+a.start[1]+m.dy,m.facing);
  strip.blit(c,0,f*ACH);
 }
 actionInfo.push({kind,start:a.start,segments:a.segments,net:faunaMotionNet(a.segments)});
 await save('action_'+kind,strip,{frames:FRAMES,frameHeight:ACH});
}

// ---------------------------------------------------------------- 5. 320×180 stages
const phaseOf=(stage,i)=>(terrainHash(['fauna-d1a-stage',stage,i])%100)/10;
/** A walk to and fro along x for people (live speed 2–2.5 px/s, rests at both ends). */
const personLoop=(x0,x1,y,i,speed=2.2,rest=2)=>{const d=x1-x0,travel=Math.abs(d)/speed,cycle=2*travel+2*rest;
 if(Math.abs(LOOP%cycle)>1e-9&&Math.abs(cycle-LOOP)>1e-9)throw Error('person loop must divide 10 s');
 return t=>{const u=t%cycle;let x=x0,walking=false;if(u<rest)x=x0;else if(u<rest+travel){x=x0+Math.sign(d)*Math.floor((u-rest)*speed);walking=true;}else if(u<2*rest+travel)x=x1;else{x=x1-Math.sign(d)*Math.floor((u-2*rest-travel)*speed);walking=true;}
  return {x,y,i,walking,step:walking?Math.floor(t*3)%2:0};};};
const STILL=(pose,fps)=>[{pose,seconds:LOOP,fps}];
const GRAZERS=(kind,i,busy)=>busy?[{pose:'graze',seconds:3,fps:2},{pose:'walk',seconds:2,fps:5,vx:3},{pose:'stand',seconds:1},{pose:'walk',seconds:2,fps:5,vx:-3,facing:-1},{pose:'graze',seconds:2,fps:2,facing:1}]
 :i%3===2?[{pose:'rest',seconds:6},{pose:'stand',seconds:4}]:[{pose:'graze',seconds:6,fps:1.5},{pose:'stand',seconds:4}];

const STAGES=[];
// A/B: grassland before settlement, the same animals busy or still
for(const busy of [true,false]){
 const id=busy?'grassland_busy':'grassland_still';
 STAGES.push({id,label:busy?'草原・文明以前（動きが多い）':'草原・文明以前（静止が多い）',ground:'#9a9a62',
  water:()=>false,
  plants:[{id:'savanna',x:40,y:118},{id:'savanna',x:250,y:112},{id:'savanna',x:292,y:150},{id:'herb',kind:'low',x:120,y:166},{id:'herb',kind:'low',x:200,y:172},{id:'dryShrub',kind:'low',x:80,y:140}],
  houses:[],people:[],
  animals:[
   ...[[130,132],[146,128],[160,136],[176,131],[150,142]].map(([x,y],i)=>({kind:'horse',x,y,segments:GRAZERS('horse',i,busy)})),
   {kind:'hare',x:70,y:164,segments:busy?ACTIONS.hare.segments:STILL('sit')},
   {kind:'hare',x:230,y:158,segments:busy?[{pose:'graze',seconds:4,fps:2},{pose:'hop',seconds:1,fps:8,vx:-10,facing:-1},{pose:'sit',seconds:4},{pose:'hop',seconds:1,fps:8,vx:10,facing:1}]:[{pose:'graze',seconds:10,fps:1}]},
   ...(busy?[{kind:'crow',x:-10,y:40,segments:[{pose:'fly',seconds:4,fps:8,vx:50},{pose:'glide',seconds:3,vx:50},{pose:'absent',seconds:3}]},
             {kind:'crow',x:330,y:58,segments:[{pose:'absent',seconds:3},{pose:'glide',seconds:5,vx:-50,facing:-1},{pose:'fly',seconds:2,fps:8,vx:-50,facing:-1}]}]
           :[{kind:'crow',x:-10,y:46,segments:[{pose:'glide',seconds:10,vx:34}]}]),
   {kind:'sparrow',x:100,y:170,segments:busy?ACTIONS.sparrow.segments:STILL('peck',1)},
   {kind:'sparrow',x:106,y:172,segments:busy?[{pose:'peck',seconds:3,fps:4},{pose:'hop',seconds:1,fps:4,vx:4},{pose:'stand',seconds:5},{pose:'hop',seconds:1,fps:4,vx:-4,facing:-1}]:STILL('stand')},
  ]});
}
// C: temperate forest edge and a village: deer keep to the forest edge, away from the houses and paths
STAGES.push({id:'forest_village',label:'温帯林の縁と村',ground:'#7d8456',water:()=>false,
 plants:[{id:'deciduous',x:14,y:122},{id:'evergreen',x:36,y:118},{id:'deciduous',x:24,y:146},{id:'conifer',x:56,y:128},{id:'deciduous',x:8,y:170},{id:'understory',kind:'low',x:70,y:150},{id:'shrub',kind:'low',x:86,y:132},{id:'deciduous',x:300,y:112}],
 houses:[{full:HOUSE2,x:236,y:132},{mini:HOUSE,x:196,y:122},{mini:HOUSE,x:212,y:122},{mini:HOUSE,x:268,y:150},{mini:HOUSE,x:284,y:150},{full:HOUSE,x:218,y:160}],
 people:[personLoop(180,190,140,0,2.5,1),personLoop(250,240,172,1,2.5,1)],
 animals:[
  {kind:'deer',x:80,y:140,segments:[{pose:'graze',seconds:4,fps:2},{pose:'stand',seconds:2},{pose:'walk',seconds:2,fps:6,vx:4},{pose:'walk',seconds:2,fps:6,vx:-4,facing:-1}]},
  {kind:'deer',x:100,y:126,segments:[{pose:'stand',seconds:3},{pose:'graze',seconds:7,fps:2}]},
  {kind:'sparrow',x:186,y:150,segments:ACTIONS.sparrow.segments},
  {kind:'sparrow',x:252,y:160,segments:[{pose:'peck',seconds:4,fps:4},{pose:'stand',seconds:6}]},
  {kind:'crow',x:150,y:158,segments:[{pose:'stand',seconds:2},{pose:'peck',seconds:8,fps:3}]},
 ]});
// D: river bank and wetland
const riverTop=x=>150+Math.round(2*Math.sin(x/23)),riverBottom=x=>168+Math.round(2*Math.sin(x/31));
STAGES.push({id:'river',label:'河畔・湿地',ground:'#86905e',water:(x,y)=>y>=riverTop(x)&&y<riverBottom(x),
 plants:[{id:'riparian',x:30,y:146},{id:'riparian',x:270,y:144},{id:'wetland',kind:'low',x:110,y:148},{id:'wetland',kind:'low',x:200,y:147},{id:'riparian',x:150,y:178}],
 houses:[],people:[],
 animals:[
  {kind:'duck',x:120,y:158,segments:ACTIONS.duck.segments},
  {kind:'duck',x:132,y:161,segments:[{pose:'float',seconds:4,fps:2},{pose:'dabble',seconds:2,fps:2},{pose:'float',seconds:4,fps:2,vx:0}]},
  {kind:'duck',x:230,y:157,segments:[{pose:'float',seconds:5,fps:2,vx:-2,facing:-1},{pose:'float',seconds:5,fps:2,vx:2,facing:1}]},
  {kind:'heron',x:80,y:148,segments:[{pose:'stand',seconds:4},{pose:'peck',seconds:4,fps:1.5},{pose:'stand',seconds:2}]},
  {kind:'gull',x:-12,y:62,segments:[{pose:'glide',seconds:6,vx:45},{pose:'fly',seconds:2,fps:8,vx:45},{pose:'absent',seconds:2}]},
  {kind:'deer',x:186,y:140,segments:[{pose:'graze',seconds:10,fps:1.5}]},
 ]});
// E: tundra / steppe: a small bison group, a fox crossing the whole screen
STAGES.push({id:'tundra',label:'ツンドラ・ステップ',ground:'#a7aa9c',water:()=>false,
 plants:[{id:'coldShrub',kind:'low',x:40,y:150},{id:'coldShrub',kind:'low',x:262,y:132},{id:'moss',kind:'low',x:150,y:170},{id:'coldShrub',kind:'low',x:300,y:168}],
 houses:[],people:[],
 animals:[
  ...[[120,124],[138,120],[154,127],[142,132]].map(([x,y],i)=>({kind:'bison',x,y,segments:i===3?[{pose:'rest',seconds:10}]:[{pose:'graze',seconds:4,fps:1.5},{pose:'walk',seconds:1.5,fps:4,vx:2},{pose:'stand',seconds:3},{pose:'walk',seconds:1.5,fps:4,vx:-2,facing:-1}].map(s=>i===1?{...s,vx:-(s.vx??0),facing:s.vx?-(s.facing??1):-1}:s)})),
  {kind:'fox',x:-8,y:162,segments:[{pose:'walk',seconds:7,fps:8,vx:48},{pose:'absent',seconds:3}]},
  {kind:'hare',x:250,y:150,segments:[{pose:'sit',seconds:3},{pose:'graze',seconds:4,fps:2},{pose:'sit',seconds:3}]},
  {kind:'sparrow',x:60,y:166,segments:[{pose:'peck',seconds:5,fps:4},{pose:'stand',seconds:5}]},
 ]});

const isGroundPose=p=>!FAUNA_AIR_POSES.includes(p)&&!FAUNA_WATER_POSES.includes(p);
const stageInfo=[];
for(const st of STAGES){
 const land=(x,y)=>x>=0&&x<320&&y>=96&&y<180&&!st.water(x,y),water=(x,y)=>x>=0&&x<320&&y>=96&&y<180&&st.water(x,y);
 const backdrop=new Raster(320,180);backdrop.rect(0,0,320,96,SKY);backdrop.rect(0,96,320,84,st.ground);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++)if(st.water(x,y))backdrop.rect(x,y,1,1,WATER);
 const flora=plants(st.plants);
 const houses=st.houses.map(h=>{const draw=g=>h.full?drawArchitecture(g,h.full,h.x,h.y):drawMiniature(g,h.mini,h.x,h.y,'near');return {y:h.y,order:1,draw,box:boundsOf(draw)};});
 st.animals.forEach((a,i)=>{const total=loopSeconds(a.segments);if(Math.abs(total-LOOP)>1e-9)throw Error(`${st.id} animal ${i}: loop is not 10 s`);});
 const strip=new Raster(320,180*FRAMES),issues=[],prev=new Map();let maxVisible=0,minVisible=Infinity;
 for(let f=0;f<FRAMES;f++){
  const t=f/FPS,frame=new Raster(320,180);frame.blit(backdrop,0,0);
  const items=[...flora,...houses];let visible=0;
  for(const p of st.people){const s=p(t);items.push({y:s.y,order:2,draw:g=>person(g,s.x,s.y,s.i,s.walking,s.step)});}
  const air=[];
  st.animals.forEach((a,i)=>{
   const size=FAUNA_SIZE[a.kind].preset,m=faunaMotionAt(a.kind,a.segments,(t+phaseOf(st.id,i))%LOOP),was=prev.get(i);
   if(!m){if(was&&was.left>=0&&was.right<320)issues.push({frame:f,animal:i,kind:a.kind,issue:'vanished inside the screen'});prev.set(i,null);return;}
   const x=a.x+m.dx,y=a.y+m.dy,b=drawFauna({rect(){}},a.kind,size,m.pose,m.frame,x,y,m.facing);
   if(was===null&&f>0&&b.left>=0&&b.right<320)issues.push({frame:f,animal:i,kind:a.kind,issue:'appeared inside the screen'});
   // a jump: the origin moves farther in one frame than the fastest segment of this animal allows
   const onScreen=q=>q.right>=0&&q.left<320,limit=Math.ceil(Math.max(0,...a.segments.map(s=>Math.max(Math.abs(s.vx??0),Math.abs(s.vy??0))))/FPS)+1;
   if(was&&(onScreen(b)||onScreen(was))&&(Math.abs(x-was.x)>limit||Math.abs(y-was.y)>limit))issues.push({frame:f,animal:i,kind:a.kind,issue:'jumped'});
   prev.set(i,{...b,x,y});
   if(b.right>=0&&b.left<320)visible++;
   if(isGroundPose(m.pose)){
    // the feet row must be land at every pixel the sprite paints there; the body must not overlap a building
    const feet=faunaSprite(a.kind,size,m.pose,m.frame).filter(r=>r.y+r.h-1===0);
    for(const r of feet)for(let k=0;k<r.w;k++){const px=m.facing===1?x+r.x+k:x-r.x-k;if(px>=0&&px<320&&!land(px,y))issues.push({frame:f,animal:i,kind:a.kind,issue:'feet not on land'});}
   }else if(FAUNA_WATER_POSES.includes(m.pose)){
    for(const r of faunaSprite(a.kind,size,m.pose,m.frame).filter(r=>r.y+r.h-1===0))for(let k=0;k<r.w;k++){const px=m.facing===1?x+r.x+k:x-r.x-k;if(!water(px,y))issues.push({frame:f,animal:i,kind:a.kind,issue:'not on water'});}
   }
   for(const h of houses)if(b.left<=h.box.right&&b.right>=h.box.left&&b.top<=h.box.bottom&&b.bottom>=h.box.top)issues.push({frame:f,animal:i,kind:a.kind,issue:'overlaps a building'});
   const draw=g=>drawFauna(g,a.kind,size,m.pose,m.frame,x,y,m.facing);
   if(FAUNA_AIR_POSES.includes(m.pose)&&y<96)air.push(draw);else items.push({y:FAUNA_AIR_POSES.includes(m.pose)?y+2:y,order:3,draw});
  });
  maxVisible=Math.max(maxVisible,visible);minVisible=Math.min(minVisible,visible);
  items.sort((a,b)=>a.y-b.y||a.order-b.order).forEach(it=>it.draw(frame));
  for(const d of air)d(frame);
  strip.blit(frame,0,f*180);
  if(f===0)await save('stage_'+st.id,frame);
 }
 await save('stage_'+st.id+'_motion',strip,{frames:FRAMES,frameHeight:180});
 const counts={};for(const a of st.animals)counts[a.kind]=(counts[a.kind]??0)+1;
 stageInfo.push({id:st.id,label:st.label,animals:counts,people:st.people.length,houses:st.houses.length,visibleAnimals:{min:minVisible,max:maxVisible},issues:issues.length,firstIssues:issues.slice(0,10)});
}

const failed=stageInfo.filter(s=>s.issues>0);
const report={issue:38,stage:'D1a',ruleId:FAUNA_SPRITES_RULE_ID,status:'PROTOTYPE — independent drawing; no world, habitat, year, save or history',
 reference:{person:{width:2,height:7,source:'scene/motion-frame.ts'},nearHousingPart:'13×10 (miniature near)',tree:'restrained painter, live depth scale 0.58–1.00'},
 kinds:FAUNA_KINDS.map(k=>({kind:k,label:LABEL[k],group:FAUNA_GROUP[k],size:FAUNA_SIZE[k],poses:FAUNA_POSES[k],palette:FAUNA_PALETTE[k]})),
 sprites,scale:scaleSheets,depth:depthInfo,actions:actionInfo,stages:stageInfo,fps:FPS,loopSeconds:LOOP,files};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');

// ---------------------------------------------------------------- gallery
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const file=n=>files.find(x=>x.name===n);
const img=(n,scale)=>{const f=file(n);return `<img src="${n}.png" width="${f.width*scale}" height="${f.height*scale}" alt="${esc(n)}" loading="lazy">`;};
const anim=(n,scale)=>{const f=file(n),w=f.width*scale,h=f.frameHeight*scale;
 return `<div class="anim" role="img" aria-label="${esc(n)}" style="width:${w}px;height:${h}px;background-image:url(${n}.png);background-size:${w}px ${h*f.frames}px;--end:-${h*f.frames}px;animation-timing-function:steps(${f.frames})"></div>`;};
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue 38 D1a 動物の造形と動作</title>
<style>body{font:14px/1.6 system-ui,sans-serif;background:#eceee8;color:#263028;margin:0;padding:20px}main{max-width:1500px;margin:auto}img{display:block;image-rendering:pixelated}
.anim{image-rendering:pixelated;background-repeat:no-repeat;animation-name:play;animation-duration:${LOOP}s;animation-iteration-count:infinite}
@keyframes play{from{background-position:0 0}to{background-position:0 var(--end)}}@media (prefers-reduced-motion:reduce){.anim{animation:none}}
.row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}figure{margin:0}figcaption{font-size:12px}.scroll{overflow-x:auto}small{color:#5d6a5f}
.sheet{display:grid;align-items:center;gap:0}.sheet span{font-size:12px;padding-right:6px}table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #c8ccc0;padding:2px 6px}</style>
<main><h1>Issue #38 D1a｜動物の造形・縮尺・短い動作（独立描画）</h1>
<p><b>PROTOTYPE。</b>世界・生息候補・観測年・保存・歴史には接続していない手置きの比較。人物は本編と同じ2×7px、建物は本編の描画器、樹木は本編の植物描画（B）。種名は造形試作の候補で、世界から特定の種を決めたものではない（D0 §6）。動きは12fpsの10秒ループ（OS・ブラウザの「動きを減らす」設定では停止）。</p>
<h2>1. 種群×動作（各列がコマ。左は人物）</h2>
${FAUNA_KINDS.map(k=>{const f=file('poses_'+k);return `<h3>${LABEL[k]} <small>${FAUNA_GROUP[k]}／既定 名目${FAUNA_SIZE[k].preset}（佇み等の最初の姿で横${sprites.find(x=>x.kind===k).width}px）</small></h3><div class="row"><figure>${img('poses_'+k,1)}<figcaption>原寸</figcaption></figure><figure><div class="sheet" style="grid-template-columns:7em auto">${f.poses.map((p,i)=>`<span style="grid-row:${i+1}">${POSE_LABEL[p]}</span>`).join('')}<div style="grid-column:2;grid-row:1/span ${f.poses.length}">${img('poses_'+k,4)}</div></div><figcaption>4倍</figcaption></figure></div>`;}).join('')}
<h2>2. 縮尺の候補（左から樹木・住宅片（近景）・住宅・各サイズの人物と動物）</h2>
${FAUNA_KINDS.map(k=>`<h3>${LABEL[k]} <small>${scaleSheets[k].map(c=>`名目${c.size}＝${c.width}×${c.height}px`).join(' ／ ')}（${POSE_LABEL[scaleSheets[k][0].pose]}、D0 §9の帯 横${FAUNA_SIZE[k].band.join('〜')}px）</small></h3><div class="row"><figure>${img('scale_'+k,1)}<figcaption>原寸</figcaption></figure><figure>${img('scale_'+k,4)}<figcaption>4倍</figcaption></figure></div>`).join('')}
<h2>3. 奥行き：人物と同じ固定サイズ／植物と同じ奥行き縮小</h2><p>本編の人物は奥行きで縮小しない（2×7px）。植物（B）は0.58〜1.00倍、住宅片は遠・中・近の3段。</p>
<div class="row">${['fixed','scaled'].map(m=>`<figure>${img('depth_'+m,2)}<figcaption>${m==='fixed'?'固定サイズ（人物と同じ扱い）':'奥行き縮小（植物と同じ倍率、最小サイズで下限）'}</figcaption></figure>`).join('')}</div>
<h2>4. 短い動作（10秒ループ）</h2><div class="row">${FAUNA_KINDS.map(k=>`<figure>${anim('action_'+k,4)}<figcaption>${LABEL[k]}</figcaption></figure>`).join('')}</div>
<h2>5. 320×180の舞台</h2>
${stageInfo.map(s=>`<h3>${esc(s.label)} <small>${Object.entries(s.animals).map(([k,n])=>`${LABEL[k]}×${n}`).join('、')}${s.people?`／人物${s.people}`:''}／画面内の動物 ${s.visibleAnimals.min}〜${s.visibleAnimals.max}頭／機械検査の違反 ${s.issues}件</small></h3>
<div class="row"><figure>${anim('stage_'+s.id+'_motion',2)}<figcaption>2倍・動き</figcaption></figure><figure>${anim('stage_'+s.id+'_motion',1)}<figcaption>原寸・動き</figcaption></figure><figure>${img('stage_'+s.id,1)}<figcaption>原寸・0秒の静止画</figcaption></figure></div>`).join('')}
<h2>6. 既定サイズの寸法</h2><table><tr><th>種群</th><th>動作</th><th>コマ</th><th>幅</th><th>高さ</th></tr>${sprites.map(s=>`<tr><td>${LABEL[s.kind]}</td><td>${POSE_LABEL[s.pose]}</td><td>${s.frame}</td><td>${s.width}</td><td>${s.height}</td></tr>`).join('')}</table>
</main></html>`;
await writeFile(`${out}/gallery.html`,html);
console.log(JSON.stringify({type:'issue38-d1a',images:files.length,out,stageIssues:stageInfo.map(s=>[s.id,s.issues])}));
if(failed.length){console.error(JSON.stringify(failed.map(s=>({id:s.id,firstIssues:s.firstIssues})),null,1));process.exit(1);}
