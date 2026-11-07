import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import {chromium} from 'playwright';
import {generateWorldPrototype} from '../../dist/terrain/world-prototype.js';import {captureTerrainRecord} from '../../dist/terrain/capture-terrain-record.js';import {captureRiverReaches} from '../../dist/terrain/river-reaches-review.js';
import {createGeneratedBridgeReview,advanceGeneratedBridgeReview} from '../../dist/story/generated-bridge-review.js';import {createGeneratedSaveDraft} from '../../dist/story/generated-save-draft-review.js';
test('browser loads and renders the saved generated draft with every generator blocked; native quota retains previous keys',async()=>{
 const terrain=captureTerrainRecord(generateWorldPrototype(6).world,'save-browser-test'),initial=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'field-only'),source=advanceGeneratedBridgeReview(initial,2000,'automatic'),draft=createGeneratedSaveDraft(source);
 const port='5305',server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage(),blocked=[];
  await page.route('**/*',route=>{
   const path=new URL(route.request().url()).pathname;if(path.includes('prototype')||path.includes('/capture-terrain')){blocked.push(path);return route.abort();}
   if(path==='/save-draft-test')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated save draft test</title>'});return route.continue();
  });await page.goto('http://127.0.0.1:'+port+'/save-draft-test');
  const result=await page.evaluate(async ({source,draft})=>{
   const {parseGeneratedSaveDraft,restoreGeneratedSaveDraft}=await import('/story/generated-save-draft-review.js');const {findReviewSaveDraft,storeReviewSaveDraft,REVIEW_V5_SAVE_KEY}=await import('/story/save-draft-dispatch-review.js');
   const {observeGeneratedSceneReview}=await import('/scene/generated-scene-review.js');const {drawGeneratedSceneReview}=await import('/scene/draw-generated-review.js');
   const encoded=JSON.stringify(draft),loaded=parseGeneratedSaveDraft(encoded),restored=restoreGeneratedSaveDraft(loaded);
   for(const year of [0,756,1096,1104,2000])for(let index=0;index<3;index++){
    const a=document.createElement('canvas'),b=document.createElement('canvas');drawGeneratedSceneReview(a,observeGeneratedSceneReview(source,year,index));drawGeneratedSceneReview(b,observeGeneratedSceneReview(restored,year,index));if(a.toDataURL()!==b.toDataURL())throw Error('Reloaded generated scene changed');
   }
   // This origin is a fresh, isolated Playwright context, never a user's save.
   localStorage.setItem('namonaki-story-v4','old-save-sentinel');const first=storeReviewSaveDraft(localStorage,loaded);if(first.status!=='saved')throw Error('Initial native save failed');
   const previous=localStorage.getItem(REVIEW_V5_SAVE_KEY),found=findReviewSaveDraft(k=>localStorage.getItem(k));if(found.draft.initialTerrain.mode!=='generated')throw Error('Wrong mode dispatch');
   // Controlled large narrative tests the real validated writer's quota branch.
   const large=structuredClone(loaded);large.state.history[0].body+='x'.repeat(6*1024*1024);const rejected=storeReviewSaveDraft(localStorage,large);
   if(rejected.status!=='not-saved'||rejected.reason!=='quota'||!rejected.exportJson||localStorage.getItem(REVIEW_V5_SAVE_KEY)!==previous||localStorage.getItem('namonaki-story-v4')!=='old-save-sentinel')throw Error('Quota lost a previous save');
   if(parseGeneratedSaveDraft(rejected.exportJson).state.history[0].body!==large.state.history[0].body)throw Error('Manual export lost the controlled narrative');
   localStorage.setItem(REVIEW_V5_SAVE_KEY,'broken-v5');let stopped=false;try{findReviewSaveDraft(k=>localStorage.getItem(k));}catch{stopped=true;}if(!stopped)throw Error('Broken v5 fell back to old key');
   return {scenes:15,bytes:new TextEncoder().encode(encoded).length,quotaPreserved:true,oldKeyPreserved:true};
  },{source,draft});
  assert.deepEqual(blocked,[]);assert.equal(result.scenes,15);assert.ok(result.bytes<2*1024*1024);assert.ok(result.quotaPreserved&&result.oldKeyPreserved);
 }finally{await browser?.close();server.kill();}
});
