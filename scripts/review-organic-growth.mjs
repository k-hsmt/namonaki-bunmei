/** Same terrain/seed/choices; compare compact v1 and organic v2 natural growth. */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';import {chromium} from 'playwright';
import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';import {housingAt} from '../dist/story/housing-history.js';
const out='artifacts/terrain31-organic',seeds=[10,42,3],years=[100,300,1000],sites=['river-bank','hill-side','coast-inlet'],policies=['terrain-placement-v1','terrain-placement-v2'];
const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();
const sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),frames=[],cases=[];await mkdir(out,{recursive:true});
for(const seed of seeds)for(const policy of policies){
 const world=createNewWorld(seed,policy),outer=advanceGeneratedBridgeReview(world.review,1000,'automatic');
 await writeFile(`${out}/seed${seed}_${policy}_review.json`,JSON.stringify(outer));frames.push({seed,policy,outer});
 for(const year of years)for(let index=0;index<3;index++){
  const o=observeGeneratedSceneReview(outer,year,index),plots=[...o.ground.facilities.filter(p=>p.purpose!=='field').map(p=>p.plot),...housingAt(outer.review.state.housing,year,sites[index]).blocks.map(b=>b.footprint)];
  const root=outer.review.plans[sites[index]].nucleus,distances=plots.map(p=>Math.hypot(p.x+p.width/2-root[0],p.y+p.depth/2-root[1])).sort((a,b)=>a-b);
  const span=plots.length?{width:Math.max(...plots.map(p=>p.x+p.width))-Math.min(...plots.map(p=>p.x)),depth:Math.max(...plots.map(p=>p.y+p.depth))-Math.min(...plots.map(p=>p.y))}:{width:0,depth:0};
  cases.push({seed,policy,year,site:sites[index],buildings:plots.length,span,medianDistanceFromOrigin:distances[Math.floor(distances.length/2)]??0,within40px:distances.filter(d=>d<=40).length,holds:outer.review.diagnostics.holds});
 }
 console.log(JSON.stringify({seed,policy,status:'natural-1000-year-progress'}));
}
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5314'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage();
 await page.route('**/organic-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Organic growth</title>'}));await page.goto('http://127.0.0.1:5314/organic-review');
 for(const frame of frames){
  const images=await page.evaluate(async ({outer,years})=>{
   const {validateTerrainRecord}=await import('/terrain/terrain-record.js');const {observeGeneratedSceneReview}=await import('/scene/generated-scene-review.js');const {drawGeneratedSceneReview}=await import('/scene/draw-generated-review.js');outer.review.terrain=validateTerrainRecord(outer.review.terrain);
   const images=[];for(const year of years)for(let index=0;index<3;index++){
    const o=observeGeneratedSceneReview(outer,year,index),canvas=document.createElement('canvas');drawGeneratedSceneReview(canvas,o);const raw=canvas.toDataURL(),copy=document.createElement('canvas');drawGeneratedSceneReview(copy,o);if(copy.toDataURL()!==raw)throw Error('PNG changed');
    const large=document.createElement('canvas');large.width=1280;large.height=720;const c=large.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(canvas,0,0,1280,720);images.push({year,index,raw,large:large.toDataURL()});
   }return images;
  },{outer:frame.outer,years});
  for(const im of images)for(const size of ['raw','large'])await writeFile(`${out}/seed${frame.seed}_${frame.policy}_${sites[im.index]}_${im.year}_${size}.png`,Buffer.from(im[size].split(',')[1],'base64'));
 }
}finally{await browser?.close();server.kill();}
await writeFile(out+'/report.json',JSON.stringify({sourceSHA,dirty,seeds,years,policies,cases},null,2)+'\n');
const cards=seeds.flatMap(seed=>sites.flatMap(site=>years.map(year=>`<section><h2>seed ${seed} / ${site} / ${year}年</h2><div class="row">`+policies.map(policy=>{
 const c=cases.find(c=>c.seed===seed&&c.site===site&&c.year===year&&c.policy===policy),name=`seed${seed}_${policy}_${site}_${year}`;
 return `<article><h3>${policy.endsWith('v1')?'従来：初期拠点への集中':'改善：余白と周辺への成長'}</h3><p>建物 ${c.buildings} / 広がり ${c.span.width}×${c.span.depth}px</p><img width="640" height="360" src="${name}_raw.png"><details><summary>4倍</summary><img src="${name}_large.png"></details></article>`;
}).join('')+'</div></section>')));
await writeFile(out+'/index.html',`<!doctype html><meta charset="utf-8"><title>集落の自然な成長 比較</title><style>body{font:15px sans-serif;background:#eee8da;color:#354333}.row{display:flex;gap:20px}article{width:650px}img{image-rendering:pixelated}section{margin-bottom:32px}</style><h1>集落の自然な成長</h1><p>同一地形・seed・自動選択。建物や人口を画像のために改変せず、自然進行の100・300・1000年を比較。source ${sourceSHA}。</p>`+cards.join(''));
assert.equal(cases.length,54);console.log(JSON.stringify({cases:cases.length,index:out+'/index.html'}));
