/** Issue #47 B2d: v10 scenes draw the world's flora, ordered against structures by ground line, in static and moving views. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createNewArchitectureWorld} from '../../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave} from '../../dist/story/world-session.js';
import {encodeWorldSave} from '../../dist/story/world-storage.js';

const port=process.env.FLORA_SCENE_TEST_PORT??'5241',origin='http://127.0.0.1:'+port;
let server,browser,saves;
test.before(async()=>{
 // A boreal world with mirrored and unmirrored sites, a busy town and a tree-less tundra.
 saves=[];for(const [seed,years] of [[18,1000],[4,400]])
  saves.push((await encodeWorldSave(await prepareWorldSessionSave(architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,years,'automatic'))))).json);
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
});
test.after(async()=>{try{await browser?.close();}finally{server?.kill();}});
const page=async t=>{const p=await browser.newPage();t.after(()=>p.close());const errors=[];p.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await p.route('**/flora-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>flora</title>'}));await p.goto(origin+'/flora-test');return p;};

test('B2d: plants cover a structure only when rooted in front of its ground line; static and moving views agree',async t=>{
 const p=await page(t);
 const result=await p.evaluate(async saves=>{
  const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),D=await import('/scene/draw-generated-review.js');
  const F=await import('/scene/flora-draw.js'),P=await import('/flora/flora-scene-v1.js'),R=await import('/terrain/owned-record-physics.js'),M=await import('/scene/motion-frame.js');
  const px=c=>c.getContext('2d').getImageData(0,0,320,180).data,rows=[];
  for(const json of saves){
   const session=S.restoreWorldSession(await decodeWorldSave(json)),painter=S.worldStructurePainter(session),year=session.state.year;
   for(let si=0;si<3;si++){
    const o=S.observeGeneratedWorldSession(session,year,si),paint=D.withoutLandscapePlants(D.projectScenePaint(o)),mirror=o.ground.terrain.sites[o.ground.site].render.mirrorX===true;
    const frame=document.createElement('canvas');S.drawWorldSession(frame,session,year,si);
    const again=document.createElement('canvas');S.drawWorldSession(again,S.restoreWorldSession(await decodeWorldSave(json)),year,si);
    // The live structure layer (with this year's roof snow, Issue #36 D2) as prepared for the moving view.
    const structures=M.prepareSceneMotion(o,painter).structures;
    const lines=F.structureGroundLines(o,paint.presentation,D.sceneStructureDrawer(paint,painter)),f=painter.flora(o);
    const plants=P.planFloraScene({seed:f.seed,site:o.ground.site,patches:f.patches,views:f.views,physics:R.readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics),occupied:F.sceneOccupiedPlots(o)});
    const layer=P.renderFloraLayer(plants,mirror,f.season),fr=px(frame),st=px(structures);
    let front=0,behind=0,unlined=0,wrong=0;
    for(let i=0;i<57600;i++){
     const a=i*4;if(!st[a+3])continue;if(lines[i]<0)unlined++;
     const plantFront=layer.root[i]>=0&&layer.root[i]>lines[i],src=plantFront?layer.rgba:st;
     if(plantFront)front++;else if(layer.root[i]>=0)behind++;
     if(fr[a]!==src[a]||fr[a+1]!==src[a+1]||fr[a+2]!==src[a+2])wrong++;
    }
    // Moving layers without the time-dependent smoke, still and at two swaying poses, checked per structure pixel.
    const moving=M.prepareSceneMotion(o,painter),raster=P.rasterizeFlora(plants,mirror,f.season);M.drawSceneMotion(document.createElement('canvas'),moving,0);
    const composite=seconds=>{moving.flora.at(seconds);const mv=document.createElement('canvas');mv.width=320;mv.height=180;const mc=mv.getContext('2d');
     mc.drawImage(moving.backdrop,0,0);mc.drawImage(moving.flora.behind,0,0);mc.drawImage(moving.structures,0,0);mc.drawImage(moving.flora.front,0,0);return px(mv);};
    const still=composite(undefined);let differ=0,swayWrong=0,swayed=false;
    for(let i=0;i<57600;i++)if(st[i*4+3]&&(still[i*4]!==fr[i*4]||still[i*4+1]!==fr[i*4+1]||still[i*4+2]!==fr[i*4+2]))differ++;
    for(const seconds of [1.7,4.2]){
     const pose=P.composeFlora(raster,Array.from({length:raster.trees},(_,t)=>P.treeSwayAt(t,seconds))),m=composite(seconds);
     for(let i=0;i<57600;i++){const a=i*4;if(m[a]!==still[a]||m[a+1]!==still[a+1]||m[a+2]!==still[a+2])swayed=true;if(!st[a+3])continue;
      const src=pose.root[i]>=0&&pose.root[i]>lines[i]?pose.rgba:st;if(m[a]!==src[a]||m[a+1]!==src[a+1]||m[a+2]!==src[a+2])swayWrong++;}
    }
    const bare=document.createElement('canvas');D.drawGeneratedSceneReview(bare,o,undefined,undefined,{...painter,flora:undefined});
    rows.push({site:o.ground.site,mirror,plants:plants.length,trees:plants.filter(q=>q.kind==='tree').length,front,behind,unlined,wrong,differ,swayWrong,swayed,
     deterministic:frame.toDataURL()===again.toDataURL(),changed:frame.toDataURL()!==bare.toDataURL(),structurePixels:st.reduce((n,v,i)=>n+(i%4===3&&v?1:0),0)});
   }
  }
  return rows;
 },saves);
 for(const r of result){
  assert.equal(r.unlined,0,'every structure pixel has a ground line');
  assert.equal(r.wrong,0,r.site+': structure pixels show the structure, or a plant rooted in front of it');
  assert.equal(r.differ,0,r.site+': the moving frame matches the static frame on structures');
  assert.equal(r.swayWrong,0,r.site+': swaying crowns keep the ground-line order');if(r.trees)assert.ok(r.swayed,'trees sway');
  assert.ok(r.deterministic,'reproducible after reload');assert.ok(r.changed,'v10 plants follow the flora');
 }
 assert.ok(result.some(r=>r.mirror)&&result.some(r=>!r.mirror),'both mirrored and unmirrored sites are covered');
 assert.ok(result.some(r=>r.front>0)&&result.some(r=>r.behind>0),'some plants stand in front of and some behind structures');
 assert.ok(result.slice(0,3).every(r=>r.trees>0)&&result.slice(3).every(r=>r.trees===0),'boreal woods, tree-less tundra');
});
