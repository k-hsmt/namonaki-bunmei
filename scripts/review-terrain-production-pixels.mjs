/** Normal v7/v8 against RGBA frozen from accepted, committed preproduction CI images. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {coupledReviewServer} from './coupled-review-server.mjs';
const out='artifacts/environment34-terrain-production',audit=JSON.parse(await readFile(out+'/audit.json','utf8')),fixed=JSON.parse(await readFile('tests/fixtures/terrain-trial-preproduction-rgba.json','utf8')),sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(audit.sourceSHA,sourceSHA);
const report={sourceSHA,reference:fixed.source,scope:fixed.scope,pictures:0,cases:[]},server=await coupledReviewServer();let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 for(const entry of audit.cases){
  const seed=entry.seed,dir=out+'/seed'+seed;await mkdir(dir,{recursive:true});await copyFile(out+`/seed${seed}-v7-baseline.json`,dir+'/baseline.json');await copyFile(out+`/seed${seed}-v8.json`,dir+'/terrain.json');
  for(const policy of ['baseline','terrain']){
   const page=await browser.newPage();await page.goto(server.url+'/capture');
   await page.evaluate(async({url,policy})=>{
    const{decodeWorldSave}=await import('/dist/story/world-storage.js');const packet=await decodeWorldSave(await(await fetch(url)).text());
    if(policy==='baseline'){const{restoreWorldSession}=await import('/dist/story/world-session.js');window.session=restoreWorldSession(packet);window.beforeHash=packet.payloadHash;}
    else{const{restoreTerrainProductionSave}=await import('/dist/terrain/terrain-production-history-v1.js');window.world=restoreTerrainProductionSave(packet);window.beforeHash=packet.payloadHash;}
   },{url:server.url+'/'+dir+'/'+policy+'.json',policy});
   const rows=fixed.cases.filter(c=>c[0]===seed&&c[1]===policy);
   for(const [, ,year,site,expected]of rows){
    const result=await page.evaluate(async({year,site,policy})=>{
     const{drawGeneratedSceneReview}=await import('/dist/scene/draw-generated-review.js'),canvas=document.getElementById('scene');let observation;
     if(policy==='baseline'){const{observeGeneratedWorldSession}=await import('/dist/story/world-session.js');observation=observeGeneratedWorldSession(window.session,year,site);}
     else{const{observeTerrainProductionScene}=await import('/dist/scene/terrain-production-scene-v1.js');observation=observeTerrainProductionScene(window.world,year,site);}
     drawGeneratedSceneReview(canvas,observation);const bytes=canvas.getContext('2d').getImageData(0,0,320,180).data,hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');return {hash,png:canvas.toDataURL('image/png').split(',')[1]};
    },{year,site,policy});
    assert.equal(result.hash,expected,`Frozen RGBA seed ${seed} ${policy} year ${year} site ${site}`);await writeFile(dir+`/${policy}-y${year}-s${site}.png`,Buffer.from(result.png,'base64'));report.pictures++;
   }
   const immutable=await page.evaluate(async policy=>{const after=policy==='baseline'?(await(await import('/dist/story/world-session.js')).prepareWorldSessionSave(window.session)).payloadHash:(await(await import('/dist/terrain/terrain-production-storage-v1.js')).prepareTerrainProductionSave(window.world)).payloadHash;return after===window.beforeHash;},policy);assert.ok(immutable);report.cases.push({seed,policy,pictures:rows.length,rgbaExact:true,observationImmutable:true});await page.close();
  }
 }
}finally{await browser?.close();await server.close();}
assert.equal(report.pictures,fixed.cases.length);await writeFile(out+'/pixel-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pictures:report.pictures,rgbaExact:true}));
