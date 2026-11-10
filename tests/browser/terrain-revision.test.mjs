import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
import {coupledReviewServer} from '../../scripts/coupled-review-server.mjs';
import {createNewEconomicWorld} from '../../dist/story/new-world.js';import {advanceEconomicProductionWorld} from '../../dist/irrigation/economic-production-progression-v1.js';import {prepareEconomicProductionSave} from '../../dist/irrigation/economic-production-storage-v1.js';
test('unchanged D4 views preserve native RGBA, production scenery, walking and motion without changing v7',async()=>{
 const initial=await createNewEconomicWorld(42),world=advanceEconomicProductionWorld(initial.review,1000,'automatic'),save=JSON.stringify(await prepareEconomicProductionSave(world)),terrain=JSON.parse(await readFile('tests/fixtures/terrain-record-v1-seed42.json','utf8')),reference=JSON.parse(await readFile('tests/fixtures/terrain-record-v1-seed42-rgba-sha256.json','utf8'));
 const server=await coupledReviewServer();let browser;
 try{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage();await page.goto(server.url+'/capture');
 const result=await page.evaluate(async({save,terrain})=>{
  const {createTerrainHistory,resolveTerrainAtYear}=await import('/dist/terrain/terrain-revision-v1.js'),{drawTerrainRecord}=await import('/dist/terrain/draw-terrain-record-v1.js'),{decodeWorldSave}=await import('/dist/story/world-storage.js'),{restoreWorldSession,observeGeneratedWorldSession,prepareWorldSessionSave}=await import('/dist/story/world-session.js'),{observeTerrainRevisionScene}=await import('/dist/scene/terrain-revision-scene-v1.js'),{drawGeneratedSceneReview,projectScenePaint}=await import('/dist/scene/draw-generated-review.js'),{prepareSceneMotion}=await import('/dist/scene/motion-frame.js');
  const canvas=()=>document.createElement('canvas'),digest=async c=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',c.getContext('2d').getImageData(0,0,320,180).data))].map(n=>n.toString(16).padStart(2,'0')).join(''),hashes={},h=await createTerrainHistory(terrain,1000);
  for(const site of ['hill-side','river-bank','coast-inlet']){const c=canvas();drawTerrainRecord(c,resolveTerrainAtYear(h,1000),site);hashes[site]=await digest(c);}
  const session=restoreWorldSession(await decodeWorldSave(save)),before=JSON.stringify(await prepareWorldSessionSave(session)),history=await createTerrainHistory(session.review.review.terrain,1000);let scenes=0;
  for(const year of [0,100,575,1000])for(let site=0;site<3;site++){
   const original=observeGeneratedWorldSession(session,year,site),view=observeTerrainRevisionScene(original,resolveTerrainAtYear(history,year),session.state.housing),a=canvas(),b=canvas();drawGeneratedSceneReview(a,original);drawGeneratedSceneReview(b,view);if(await digest(a)!==await digest(b))throw Error('Revision changed scene pixels');
   const x=prepareSceneMotion(original),y=prepareSceneMotion(view);if(JSON.stringify(x.plan)!==JSON.stringify(y.plan))throw Error('Revision changed walking or motion');scenes++;
  }
  if(JSON.stringify(await prepareWorldSessionSave(session))!==before)throw Error('Observation changed persisted v7');return {hashes,scenes};
 },{save,terrain});assert.deepEqual(result.hashes,reference.rgbaSha256);assert.equal(result.scenes,12);
 }finally{await browser?.close();await server.close();}
});
