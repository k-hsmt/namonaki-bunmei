/** Explicitly controlled A2 geometry cases. No fixtures are imported into live sessions. */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {chromium} from 'playwright';
import {terrainCutFixture,terrainCutPlot} from '../tests/helpers/terrain-cut-fixture.mjs';import {coupledReviewServer} from './coupled-review-server.mjs';
const sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),out='artifacts/environment34-terrain-cut-fixtures',ctx=await terrainCutFixture(),server=await coupledReviewServer();await mkdir(out,{recursive:true});let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage();await page.goto(server.url+'/capture');
 const report=await page.evaluate(async({initial,ground,field,causeRecordId,plot})=>{
  const {createTerrainHistory,resolveTerrainAtYear,terrainHistoryThrough}=await import('/dist/terrain/terrain-revision-v1.js'),{proposeTerrainCut,commitTerrainCut}=await import('/dist/terrain/terrain-earthwork-v1.js'),{drawTerrainRevision}=await import('/dist/terrain/draw-terrain-cut-v1.js');
  const images=[],pixels=[],draw=(h,year)=>{const c=document.createElement('canvas');drawTerrainRevision(c,resolveTerrainAtYear(h,year),'hill-side');return c;};
  const history=await createTerrainHistory(initial,100),context={history,ground:{...ground,terrain:resolveTerrainAtYear(history,100)},field,causeRecordId,protectedPlots:[]},proposal=await proposeTerrainCut(context,plot);if(proposal.status!=='review-only')throw Error(proposal.reason);
  const next=terrainHistoryThrough(commitTerrainCut(proposal),1000);
  for(const year of [99,100,101,116,300,1000]){const c=draw(next,year);images.push({year,png:c.toDataURL()});pixels.push(c.getContext('2d').getImageData(0,0,320,180).data);}
  const same=(a,b)=>a.every((v,i)=>v===b[i]);if(!same(pixels[0],pixels[1]))throw Error('Approval changed past scenery');if(same(pixels[1],pixels[2]))throw Error('Cut is invisible at effect year');
  const box=proposal.change.bounds,mirror=initial.sites['hill-side'].render.mirrorX;let changed=0;
  for(let y=0;y<180;y++)for(let sx=0;sx<320;sx++){const i=(y*320+sx)*4;if([0,1,2,3].some(k=>pixels[1][i+k]!==pixels[2][i+k])){const x=mirror?319-sx:sx;if(x<box.x||x>=box.x+box.width||y<box.y||y>=box.y+box.depth)throw Error('Cut changed pixels outside its influence');changed++;}}
  if(!changed||same(pixels[1],pixels.at(-1)))throw Error('Permanent topography was lost');
  const opposite=structuredClone(initial);opposite.geography.seaSide=mirror?'east':'west';for(const site of Object.values(opposite.sites))site.render.mirrorX=!mirror;
  const oppositeHistory=await createTerrainHistory(opposite,100),oppositeContext={...context,history:oppositeHistory,ground:{...ground,terrain:resolveTerrainAtYear(oppositeHistory,100)}},oppositeProposal=await proposeTerrainCut(oppositeContext,plot);if(oppositeProposal.status!=='review-only')throw Error('Mirrored cut failed');
  const c=draw(terrainHistoryThrough(commitTerrainCut(oppositeProposal),101),101),other=c.getContext('2d').getImageData(0,0,320,180).data;
  for(let y=0;y<180;y++)for(let x=0;x<320;x++)for(let k=0;k<4;k++)if(pixels[2][(y*320+x)*4+k]!==other[(y*320+319-x)*4+k])throw Error('Canonical cut was mirrored twice');
  return {images,changedPixels:changed,cells:proposal.change.cells.length,cutVolume:proposal.change.cutVolume,disturbedPatches:proposal.change.disturbedPatches,passed:true};
 },{initial:ctx.history.initial,ground:{...ctx.ground,terrain:null},field:ctx.field,causeRecordId:ctx.causeRecordId,plot:terrainCutPlot});
 assert.ok(report.passed);for(const {year,png}of report.images)await writeFile(out+`/year${year}.png`,Buffer.from(png.split(',')[1],'base64'));
 await writeFile(out+'/audit.json',JSON.stringify({sourceSHA,scope:'Controlled A2 gentle slope, no naturally occurring construction or ecology recovery is claimed.',...report,images:report.images.map(({year})=>({year,path:`year${year}.png`}))},null,2));
 await writeFile(out+'/index.html',`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>D4-A2 切り土の制御比較</title><style>body{margin:2rem;background:#f6f3eb;color:#263c3c;font:16px sans-serif}main{display:flex;gap:1rem;flex-wrap:wrap}figure{margin:0;padding:1rem;background:white;border:1px solid #c8ccc2}img{width:640px;max-width:100%;height:auto;image-rendering:pixelated}code{overflow-wrap:anywhere}</style><h1>D4-A2：切り土の制御比較</h1><p>人工の緩斜面です。自然成立・耕作・植生の回復を示す資料ではありません。承認100年／作用101年。土の露出色は15年で消え、切り下げた標高と段差は残ります。</p><p>変更${report.cells}セル、攪乱${report.disturbedPatches.length}パッチ。水面・他地区・範囲外の画素は保持し、逆向き投影も照合済み。</p><main>${report.images.map(({year})=>`<figure><figcaption>${year}年</figcaption><img src="year${year}.png" width="640" height="360"></figure>`).join('')}</main><p>source <code>${sourceSHA}</code> ／ <a href="audit.json">検証値</a></p>`);
 console.log(JSON.stringify({passed:report.passed,changedPixels:report.changedPixels,cells:report.cells,disturbedPatches:report.disturbedPatches}));
}finally{await browser?.close();await server.close();}
