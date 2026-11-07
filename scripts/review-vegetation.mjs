/** Natural game progression and explicitly controlled ecology trials on saved terrain. */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {execFileSync,spawn} from 'node:child_process';import {once} from 'node:events';import {chromium} from 'playwright';
import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';import {vegetationAt} from '../dist/vegetation/history-v1.js';
const out='artifacts/vegetation32',sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty=execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim(),frames=[],report={sourceSHA,dirty,natural:[],controlled:[]};await mkdir(out,{recursive:true});
for(const seed of [42,1,21]){
 const outer=advanceGeneratedBridgeReview(createNewWorld(seed).review,300,'automatic');await writeFile(`${out}/seed${seed}-review.json`,JSON.stringify(outer));
 for(const year of [0,30,100,200,300])for(let siteIndex=0;siteIndex<3;siteIndex++){
  const site=['river-bank','hill-side','coast-inlet'][siteIndex],patches=vegetationAt(outer.vegetation,year,site),counts=patches.reduce((a,p)=>(a[p.stage]++,a),[0,0,0,0,0]),id=`natural-${seed}-${site}-${year}`;report.natural.push({id,seed,site,year,counts});frames.push({id,label:`自然進行 seed ${seed} / ${site} / ${year}年`,outer,year,siteIndex});
 }
 if(seed===42){
  // Controlled interventions are labelled as trials and never saved as production histories.
  const base=structuredClone(outer.vegetation);base.events=[];for(const site of Object.keys(base.initial))base.initial[site]=base.initial[site].map(p=>p?[0,1,p[2]]:null);
  for(const scenario of ['succession','clearing-recovery','fire-recovery','open-slope']){
   const v=structuredClone(base);if(scenario==='open-slope')v.initial['river-bank']=v.initial['river-bank'].map(p=>p?[0,2,2]:null);
   const event=(year,kind)=>({id:`trial-${kind}-${year}`,year,site:'river-bank',kind,plot:{x:200,y:112,width:112,depth:64},sourceRecordId:'CONTROLLED-TRIAL'});
   if(scenario==='clearing-recovery')v.events=[event(100,'clear'),event(150,'release')];if(scenario==='fire-recovery')v.events=[event(100,'fire')];
   for(const year of [0,100,150,200,300]){
    const id=`trial-${scenario}-${year}`,view=vegetationAt(v,year,'river-bank');report.controlled.push({id,scenario,year,counts:view.reduce((a,p)=>(a[p.stage]++,a),[0,0,0,0,0])});frames.push({id,label:`独立試走 ${scenario} / ${year}年`,outer,year,siteIndex:0,controlled:view});
   }
  }
 }
}
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5320'},stdio:['ignore','pipe','inherit']});let browser;
try{await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage();await page.route('**/vegetation-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>植生遷移比較</title>'}));await page.goto('http://127.0.0.1:5320/vegetation-review');
 for(const frame of frames){const im=await page.evaluate(async f=>{
  const {validateTerrainRecord}=await import('/terrain/terrain-record.js'),{observeGeneratedSceneReview}=await import('/scene/generated-scene-review.js'),{drawGeneratedSceneReview}=await import('/scene/draw-generated-review.js');f.outer.review.terrain=validateTerrainRecord(f.outer.review.terrain);let o=observeGeneratedSceneReview(f.outer,f.year,f.siteIndex);
  if(f.controlled){const g={...o.ground,vegetation:f.controlled};o={...o,ground:g,composition:{...o.composition,generatedGround:g}};}
  const canvas=document.createElement('canvas');drawGeneratedSceneReview(canvas,o);const raw=canvas.toDataURL(),again=document.createElement('canvas');drawGeneratedSceneReview(again,o);if(again.toDataURL()!==raw)throw Error('Repeated scene changed');const large=document.createElement('canvas');large.width=1280;large.height=720;const c=large.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(canvas,0,0,1280,720);return {raw,large:large.toDataURL()};},frame);for(const size of ['raw','large'])await writeFile(`${out}/${frame.id}-${size}.png`,Buffer.from(im[size].split(',')[1],'base64'));}
}finally{await browser?.close();server.kill();}
await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await writeFile(out+'/index.html',`<!doctype html><meta charset="utf-8"><title>植生の自然遷移 / Issue 32</title><style>body{background:#eee8da;color:#354333;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(3,450px);gap:20px}img{width:440px;image-rendering:pixelated}h2{font-size:16px}</style><h1>植生の自然遷移</h1><p>自然進行は建物・人口を編集せず、保存された履歴を観測。独立試走は、同じ自然進行の建物を背景に植生条件と攪乱だけを制御した比較で、本番保存には混入しません。右岸の一部を年100に伐採／火災、伐採地は年150に放棄。開けた斜面の条件は試走用の制御値で、実際の気温や土壌の推定ではありません。source ${sourceSHA}。</p><main>`+frames.map(f=>`<section><h2>${f.label}</h2><a href="${f.id}-large.png"><img src="${f.id}-raw.png"></a></section>`).join('')+'</main>');assert.equal(frames.length,65);console.log(JSON.stringify({frames:frames.length,index:out+'/index.html'}));
