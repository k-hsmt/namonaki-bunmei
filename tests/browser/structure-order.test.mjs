/** Issue #47 B3 review: a field (flat ground) never paints over a building or roof standing in front of it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createNewArchitectureWorld} from '../../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave} from '../../dist/story/world-session.js';
import {encodeWorldSave} from '../../dist/story/world-storage.js';

const port=process.env.STRUCTURE_ORDER_TEST_PORT??'5243',origin='http://127.0.0.1:'+port;
let server,browser,saves;
test.before(async()=>{
 // seed 23 (coast inlet) and 44 (river bank, coast inlet): the first house stands in front of a field listed after it.
 saves=[];for(const seed of [23,44])saves.push((await encodeWorldSave(await prepareWorldSessionSave(architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,300,'automatic'))))).json);
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
});
test.after(async()=>{try{await browser?.close();}finally{server?.kill();}});

test('B3: where a field and a building in front of it overlap, the building shows, in static and moving views',async t=>{
 const p=await browser.newPage();t.after(()=>p.close());const errors=[];p.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await p.route('**/order-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>order</title>'}));await p.goto(origin+'/order-test');
 const rows=await p.evaluate(async saves=>{
  const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),D=await import('/scene/draw-generated-review.js'),M=await import('/scene/motion-frame.js');
  const px=c=>c.getContext('2d').getImageData(0,0,320,180).data,out=[];
  for(const json of saves){
   const session=S.restoreWorldSession(await decodeWorldSave(json)),painter=S.worldStructurePainter(session),year=session.state.year;
   for(let si=0;si<3;si++){
    const o=S.observeGeneratedWorldSession(session,year,si),paint=D.withoutLandscapePlants(D.projectScenePaint(o)),objects=o.snapshot.objects;
    const only=list=>{const o2={...o,snapshot:{...o.snapshot,objects:list},composition:{...o.composition,residentialBlocks:o.composition.residentialBlocks.map(b=>({...b,roofParts:[]}))}};
     const c=document.createElement('canvas');D.drawGeneratedSceneReview(c,o2,'structures',{observation:o2,presentation:{...paint.presentation,festival:null,fire:null,cart:null},vegetation:paint.vegetation},painter);return px(c);};
    const layer=document.createElement('canvas');D.drawGeneratedSceneReview(layer,o,'structures',paint,painter);const full=px(layer);
    const moving=M.prepareSceneMotion(o,painter),mv=px(moving.structures);
    const plot=id=>o.ground.facilities.find(f=>f.id===id).plot;
    for(const f of objects.filter(x=>x.kind==='field'))for(const b of objects.filter(x=>x.kind!=='field'&&x.kind!=='bridge')){
     const fp=plot(f.id),bp=plot(b.id);if(bp.y+bp.depth<=fp.y+fp.depth)continue;
     const a=only([f]),c=only([b]);let overlap=0,wrong=0;
     for(let i=0;i<57600;i++){if(!a[i*4+3]||!c[i*4+3])continue;overlap++;
      // The pixel may still be covered by a roof or a building drawn later; it must never be the field's.
      for(const d of [full,mv])if(d[i*4]===a[i*4]&&d[i*4+1]===a[i*4+1]&&d[i*4+2]===a[i*4+2]&&!(c[i*4]===a[i*4]&&c[i*4+1]===a[i*4+1]&&c[i*4+2]===a[i*4+2]))wrong++;}
     if(overlap)out.push({site:o.ground.site,field:f.id,building:b.id,overlap,wrong});
    }
   }
  }
  return out;
 },saves);
 assert.ok(rows.some(r=>r.overlap>=50),'the audited worlds contain a building in front of a field that overlaps it');
 for(const r of rows)assert.equal(r.wrong,0,`${r.site}: field ${r.field} paints over ${r.building} in front of it`);
});
