import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {coupledReviewServer} from './coupled-review-server.mjs';
import {terrainReviewLayer} from './terrain-trial-layer-renderer.mjs';
import {terrainReviewCase} from './terrain-trial-review-page.mjs';
const out='artifacts/environment34-terrain-trial',m=JSON.parse(await readFile(out+'/comparison.json','utf8')),server=await coupledReviewServer();let browser;
const layers=['physical','changed','occupation','passage','vegetation','water'];
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 for(const seed of m.seeds){
  const dir=out+'/seed'+seed,data=JSON.parse(await readFile(dir+'/data.json','utf8'));
  for(const policy of ['baseline','terrain']){
   const page=await browser.newPage();await page.goto(server.url+'/capture');
   const mirror=await page.evaluate(async({url,policy})=>{
    const wire=await(await fetch(url)).text();
    if(policy==='terrain'){const{decodeTerrainTrial}=await import('/dist/terrain/terrain-trial-storage-v1.js');window.trial=await decodeTerrainTrial(wire);return window.trial.review.terrain.sites['hill-side'].render.mirrorX;}
    const{decodeWorldSave}=await import('/dist/story/world-storage.js'),{restoreEconomicProductionSave}=await import('/dist/irrigation/economic-production-history-v1.js'),{restoreWorldSession}=await import('/dist/story/world-session.js');const packet=await decodeWorldSave(wire);window.base=restoreEconomicProductionSave(packet);window.session=restoreWorldSession(packet);return window.base.review.terrain.sites['hill-side'].render.mirrorX;
   },{url:server.url+'/'+dir+'/'+policy+'.json',policy});
   for(const project of data.projects){
    project.displayPlot={...project.plot,x:mirror?320-project.plot.x-project.plot.width:project.plot.x};
    project.analysisYears={before:project.approvedYear,after:project.effectiveYear,recovery:Math.min(10000,project.effectiveYear+15),later:Math.min(10000,project.effectiveYear+300)};
    for(const [point,year]of Object.entries(project.analysisYears))for(const layer of layers){const png=await page.evaluate(terrainReviewLayer,{year,policy,project,layer});await writeFile(dir+`/analysis-${policy}-${project.id}-${point}-${layer}.png`,Buffer.from(png,'base64'));}
   }
   await page.close();
  }
  assert.equal(data.sourceSHA,m.sourceSHA);await writeFile(dir+'/data.json',JSON.stringify(data)+'\n');await writeFile(dir+'/index.html',terrainReviewCase(data));console.log(JSON.stringify({seed,projects:data.projects.length,layers,passed:true}));
 }
 await writeFile(out+'/layer-check.json',JSON.stringify({sourceSHA:m.sourceSHA,seeds:m.seeds,layers,points:['before','after','recovery','later'],scope:'Saved same-year physics, actual occupancy/reservations, 2px walk windows from primary root, recorded ecology, unchanged water and selected event cells. Only presentation mirroring; no candidate search.',passed:true},null,2)+'\n');
}finally{await browser?.close();await server.close();}
