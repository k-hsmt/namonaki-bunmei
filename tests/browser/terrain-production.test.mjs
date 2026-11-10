import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {coupledReviewServer} from '../../scripts/coupled-review-server.mjs';
import {createNewEconomicWorld} from '../../dist/story/new-world.js';
import {advanceEconomicProductionWorld} from '../../dist/irrigation/economic-production-progression-v1.js';
import {prepareEconomicProductionSave} from '../../dist/irrigation/economic-production-storage-v1.js';
import {introduceTerrainProduction,advanceTerrainProductionWorld} from '../../dist/terrain/terrain-production-progression-v1.js';
import {prepareTerrainProductionSave} from '../../dist/terrain/terrain-production-storage-v1.js';

test('normal v8 native pixels match accepted preproduction and a later adoption preserves every sampled old view',async()=>{
 const source=(await createNewEconomicWorld(42)).review,base=advanceEconomicProductionWorld(source,700,'automatic'),world=await advanceTerrainProductionWorld(await introduceTerrainProduction(source),700,'automatic'),at575=advanceEconomicProductionWorld(source,575,'automatic'),later=await introduceTerrainProduction(at575),reference=JSON.parse(await readFile('tests/fixtures/terrain-trial-preproduction-rgba.json','utf8')),rows=reference.cases.filter(r=>r[0]===42&&r[2]<=700),server=await coupledReviewServer();let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url+'/capture');
  const result=await page.evaluate(async({base,world,at575,later,rows})=>{
   const{decodeWorldSave}=await import('/dist/story/world-storage.js'),{restoreTerrainProductionSave}=await import('/dist/terrain/terrain-production-history-v1.js'),{restoreWorldSession,observeGeneratedWorldSession}=await import('/dist/story/world-session.js'),{observeTerrainProductionScene}=await import('/dist/scene/terrain-production-scene-v1.js'),{drawGeneratedSceneReview}=await import('/dist/scene/draw-generated-review.js'),{prepareSceneMotion,drawSceneMotion}=await import('/dist/scene/motion-frame.js'),{prepareTerrainProductionSave}=await import('/dist/terrain/terrain-production-storage-v1.js');
   const normal=restoreTerrainProductionSave(await decodeWorldSave(world)),baseline=restoreWorldSession(await decodeWorldSave(base)),previous=restoreWorldSession(await decodeWorldSave(at575)),introduced=restoreTerrainProductionSave(await decodeWorldSave(later)),before=(await prepareTerrainProductionSave(normal)).payloadHash,images=[];let checks=0;
   for(const [,policy,year,site,expected]of rows){const c=document.createElement('canvas');drawGeneratedSceneReview(c,policy==='baseline'?observeGeneratedWorldSession(baseline,year,site):observeTerrainProductionScene(normal,year,site));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',c.getContext('2d').getImageData(0,0,320,180).data))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==expected)throw Error('Frozen preproduction pixels differ: '+policy+'/'+year+'/'+site);checks++;if(policy==='terrain'&&site===1&&[100,101,116,600,601].includes(year))images.push({year,png:c.toDataURL()});}
   for(const year of [0,100,300,574,575])for(let site=0;site<3;site++){const a=document.createElement('canvas'),b=document.createElement('canvas');drawGeneratedSceneReview(a,observeGeneratedWorldSession(previous,year,site));drawGeneratedSceneReview(b,observeTerrainProductionScene(introduced,year,site));if(a.toDataURL()!==b.toDataURL())throw Error('Adoption changes the source past');checks++;}
   for(const year of [100,101,116,600,601]){const c=document.createElement('canvas'),motion=prepareSceneMotion(observeTerrainProductionScene(normal,year,1));for(const time of [0,1.25,3])drawSceneMotion(c,motion,time);}
   if((await prepareTerrainProductionSave(normal)).payloadHash!==before)throw Error('Observation or motion changed the v8 packet');return {checks,images};
  },{base:JSON.stringify(await prepareEconomicProductionSave(base)),world:JSON.stringify(await prepareTerrainProductionSave(world)),at575:JSON.stringify(await prepareEconomicProductionSave(at575)),later:JSON.stringify(await prepareTerrainProductionSave(later)),rows});
  assert.equal(result.checks,rows.length+15);assert.deepEqual(errors,[]);await mkdir('artifacts/environment34-terrain-production-tests',{recursive:true});for(const {year,png}of result.images)await writeFile(`artifacts/environment34-terrain-production-tests/year${year}.png`,Buffer.from(png.split(',')[1],'base64'));
 }finally{await browser?.close();await server.close();}
});
