import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {once} from 'node:events';import {mkdir,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
import {generateWorldPrototype} from '../../dist/terrain/world-prototype.js';import {captureTerrainRecord} from '../../dist/terrain/capture-terrain-record.js';
import {captureRiverReaches} from '../../dist/terrain/river-reaches-review.js';import {createGeneratedBridgeReview,advanceGeneratedBridgeReview} from '../../dist/story/generated-bridge-review.js';
test('generated Canvas preserves source geometry, projects west-side coordinates and leaves broken bridge water visible',async()=>{
 const terrain=captureTerrainRecord(generateWorldPrototype(6).world,'browser-generated-scene'),initial=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'field-only');
 const input=advanceGeneratedBridgeReview(initial,2000,'automatic'),westTerrain=captureTerrainRecord(generateWorldPrototype(1).world,'browser-generated-west'),west=createGeneratedBridgeReview(westTerrain,captureRiverReaches(westTerrain),'field-only'),port='5304',server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage({reducedMotion:'reduce'});
  await page.route('**/generated-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Generated Canvas test</title>'}));await page.goto('http://127.0.0.1:'+port+'/generated-test');
  const results=await page.evaluate(async ({input,west})=>{
   const {observeGeneratedSceneReview}=await import('/scene/generated-scene-review.js');const {drawGeneratedSceneReview}=await import('/scene/draw-generated-review.js');const {drawTerrainRecord}=await import('/terrain/draw-terrain-record-v1.js');
   const original=JSON.stringify(input),images=[],canvas=()=>document.createElement('canvas'),pixels=c=>c.getContext('2d').getImageData(0,0,320,180).data;
   for(let index=0;index<3;index++){
    const o=observeGeneratedSceneReview(input,2000,index),a=canvas(),b=canvas();drawGeneratedSceneReview(a,o);drawGeneratedSceneReview(b,o);
    if(a.width!==320||a.height!==180||a.toDataURL()!==b.toDataURL())throw Error('Resolution or repeatability failed');
    images.push({site:index,png:a.toDataURL()});
   }
   for(let index=0;index<3;index++){
    const o=observeGeneratedSceneReview(west,0,index),c=canvas();if(!o.ground.terrain.sites[o.ground.site].render.mirrorX)throw Error('Fixture must use west-side projection');drawGeneratedSceneReview(c,o);
    const house=o.snapshot.objects[0],pixel=Array.from(c.getContext('2d').getImageData(319-house.x,house.y,1,1).data);
    if(JSON.stringify(pixel)!==JSON.stringify([69,78,72,255]))throw Error('House door is not at its mirrored saved anchor');
   }
   const g=input.review.bridgeReview.bridges[0].geometry,x=g.deck.x+Math.floor(g.deck.width/2),y=g.deck.y+2,screenX=input.review.terrain.sites['river-bank'].render.mirrorX?319-x:x;
   // Controlled overlay fixture: the flood paint may change only saved water pixels.
   const {decodeRecordPhysics}=await import('/terrain/terrain-record-raster-v1.js'),raster=decodeRecordPhysics(input.review.terrain.sites['river-bank'].physics),o=observeGeneratedSceneReview(input,1000,0),dry=canvas(),wet=canvas();
   drawGeneratedSceneReview(dry,{...o,snapshot:{...o.snapshot,scars:[]}});drawGeneratedSceneReview(wet,{...o,snapshot:{...o.snapshot,scars:['flood']}});
   const a=pixels(dry),b=pixels(wet);let waterChanges=0;
   for(let y=96;y<180;y++)for(let sx=0;sx<320;sx++)if([0,1,2,3].some(ch=>a[(y*320+sx)*4+ch]!==b[(y*320+sx)*4+ch])){
    const x=input.review.terrain.sites['river-bank'].render.mirrorX?319-sx:sx;if(raster.surface[y*320+x]!==2)throw Error('Flood paint changed saved land');waterChanges++;
   }
   if(!waterChanges)throw Error('Flood overlay did not paint saved water');
   const pixel=c=>Array.from(c.getContext('2d').getImageData(screenX,y,1,1).data),base=canvas();drawTerrainRecord(base,input.review.terrain,'river-bank');const water=pixel(base),states=[];
   for(const year of [755,756,1096,1104,1289]){const o=observeGeneratedSceneReview(input,year,0),c=canvas();drawGeneratedSceneReview(c,o);const expected=o.snapshot.scars.includes('flood')?[98,150,160,255]:water;states.push({year,isWater:JSON.stringify(pixel(c))===JSON.stringify(expected)});}
   if(JSON.stringify(input)!==original)throw Error('Rendering mutated saved state');return {images,states};
  },{input,west});
  assert.deepEqual(results.states,[[755,true],[756,false],[1096,true],[1104,false],[1289,true]].map(([year,isWater])=>({year,isWater})));
  await mkdir('artifacts/terrain31-scene-tests',{recursive:true});for(const {site,png} of results.images)await writeFile(`artifacts/terrain31-scene-tests/seed6_site${site}.png`,Buffer.from(png.split(',')[1],'base64'));
 }finally{await browser?.close();server.kill();}
});
