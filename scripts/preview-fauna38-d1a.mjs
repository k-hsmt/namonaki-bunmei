/** Issue #38 D1a: 288 native 320x180 scene comparisons and report.
 * npm run build && node scripts/preview-fauna38-d1a.mjs
 * The sampled animals are controlled visual inputs, NOT real ecosystem inhabitants.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FAUNA_D1A_RULE,SPECIES,STYLES,DEPTHS,FRAMES,WIDTH,HEIGHT,ANIM_CYCLE,ANIM_STARTS,
  renderFaunaD1a} from './lib/fauna38-d1a.mjs';

const dir='artifacts/fauna38-d1a',sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(dir,{recursive:true});
const results=[];
for(const species of SPECIES)for(const style of STYLES)for(const depth of DEPTHS)for(const frame of FRAMES){
 const args={speciesId:species.id,styleId:style.id,depthId:depth.id,frame};
 const a=renderFaunaD1a(args),b=renderFaunaD1a(args);
 assert.deepEqual(a.raster.data,b.raster.data,'Nondeterministic D1a image');
 const png=a.raster.png(),filename=[species.id,style.id,depth.id,frame].join('_')+'.png';
 assert.equal(png.readUInt32BE(16),WIDTH);assert.equal(png.readUInt32BE(20),HEIGHT);
 await writeFile(dir+'/'+filename,png);
 results.push({filename,sha256:sha(png),species:species.id,style:style.id,depth:depth.id,
  frame,metrics:a.metrics,fixture:a.fixture});
}
assert.equal(results.length,288);
const checks=[];
for(const species of SPECIES)for(const depth of DEPTHS){
 const group=results.filter(x=>x.species===species.id&&x.depth===depth.id);
 assert.equal(group.length,16);
 const a=group.find(x=>x.style==='restrained'&&x.frame===0);
 const b=group.find(x=>x.style==='legible'&&x.frame===0);
 const moving=group.find(x=>x.style==='restrained'&&x.frame===5);
 assert.notEqual(a.sha256,b.sha256,'Missing visual style distinction: '+species.id+'/'+depth.id);
 assert.notEqual(a.sha256,moving.sha256,'Missing motion distinction: '+species.id+'/'+depth.id);
 checks.push({species:species.id,depth:depth.id,stylesDiffer:true,framesDiffer:true});
}
const report={
 issue:38,stage:'D1a',ruleId:FAUNA_D1A_RULE,sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 status:'CONTROLLED_ART_ONLY_NOT_CONFIRMED_FAUNA',images:results.length,width:WIDTH,height:HEIGHT,
 species:SPECIES,styles:STYLES,depths:DEPTHS,frames:FRAMES,
 animation:{cycleSeconds:ANIM_CYCLE,frameStartsSeconds:ANIM_STARTS},
 fixture:{
  architecture:'Existing drawArchitecture() / S02 house at (250,147)',
  person:'Current approx. 2x6px person reference at (214,147)',
  terrain:'FIXED ILLUSTRATIVE STAGE, not the saved world terrain',
  water:'FIXED ILLUSTRATIVE POND for waterbird; not the saved water record',
  animals:'EXPLICIT art fixtures, NOT real habitat observations',
  wildEquine:'Wild equid, without domestication, ownership, equipment, or livestock history',
 },
 exclusions:{
  productionCodeChanged:false,writesWorldOrSave:false,consumesCivilizationRng:false,
  simulatesHabitat:false,testsActualCollision:false,simulatesAnimalPopulation:false,
  drawsRealFloraOcclusion:false,integratesLiveMotion:false,validatesFlightExitPath:false},
 caveats:[
  'A/B are provisional silhouette variants; Human has not approved either.',
  'Eight controlled poses do not prove seamless long-duration movement or valid routes.',
  'The controlled background is not a verified scene from the game.',
  'Animal placement, groups, birth, grazing economy, and domestication are NOT simulated.',
  'Actual climate, population, vegetation, occupancy, support and season integration belong to D1b/D1c.',
 ],checks,results,
};
await writeFile(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
await copyFile('scripts/templates/fauna38-d1a-gallery.html',dir+'/gallery.html');
console.log(JSON.stringify({directory:dir,images:results.length,files:['gallery.html','report.json'],checks:checks.length}));
