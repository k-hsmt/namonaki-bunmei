/** D4-B real 10,000-year lossless storage/reload probe, with original keys retained. */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {once} from 'node:events';import {chromium} from 'playwright';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';import {captureRiverReaches} from '../dist/terrain/river-reaches-review.js';
import {createGeneratedBridgeReview,advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';import {createGeneratedSaveDraft,serializeGeneratedSaveDraft,restoreGeneratedSaveDraft} from '../dist/story/generated-save-draft-review.js';
import {encodeReviewSaveDraft,decodeReviewSaveDraft} from '../dist/story/compressed-save-draft-review.js';import {createHousingCivilization} from '../dist/story/housing-persistence.js';import {step,chooseAutomatically} from '../dist/story/engine.js';
const out='artifacts/terrain31-save',start=performance.now();await mkdir(out,{recursive:true});
const terrain=captureTerrainRecord(generateWorldPrototype(1).world,process.env.REVIEW_SOURCE_SHA??'local-unidentified'),initial=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'field-only');assert.equal(initial.status,'review-only');
const source=advanceGeneratedBridgeReview(initial,10000,'automatic'),draft=createGeneratedSaveDraft(source),plain=serializeGeneratedSaveDraft(draft),encoded=await encodeReviewSaveDraft(draft),decoded=await decodeReviewSaveDraft(encoded),restored=restoreGeneratedSaveDraft(decoded);
assert.deepEqual(restored.review.state,source.review.state);assert.deepEqual(restored.review.placements,source.review.placements);const digest=createHash('sha256').update(JSON.stringify(decoded.state)).digest('hex');
await writeFile(out+'/seed1_field-only_10000_draft.json',plain);await writeFile(out+'/seed1_field-only_10000_compressed.json',encoded);
const legacy=createHousingCivilization(42);while(legacy.year<10000){step(legacy);if(legacy.pending)chooseAutomatically(legacy);}const legacyJson=JSON.stringify(legacy);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5306'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage(),blocked=[];
 await page.route('**/*',route=>{const path=new URL(route.request().url()).pathname;
  if(path.includes('prototype')||path.includes('/capture-terrain')){blocked.push(path);return route.abort();}
  if(path==='/generated-storage-review')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated v5 storage probe</title>'});return route.continue();
 });await page.goto('http://127.0.0.1:5306/generated-storage-review');
 const result=await page.evaluate(async ({encoded,legacyJson,digest})=>{
  const {decodeReviewSaveDraft,findEncodedReviewSaveDraft,storeEncodedReviewSaveDraft}=await import('/story/compressed-save-draft-review.js');const {REVIEW_V5_SAVE_KEY}=await import('/story/save-draft-dispatch-review.js');
  const {restoreGeneratedSaveDraft}=await import('/story/generated-save-draft-review.js');const {observeGeneratedSceneReview}=await import('/scene/generated-scene-review.js');const {drawGeneratedSceneReview}=await import('/scene/draw-generated-review.js');
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const draft=await decodeReviewSaveDraft(encoded);if(await hash(JSON.stringify(draft.state))!==digest)throw Error('Browser decompression changed state');
  localStorage.setItem('namonaki-story-v4',legacyJson);const saved=await storeEncodedReviewSaveDraft(localStorage,draft);if(saved.status!=='saved')throw Error('Compressed 10,000-year save did not coexist with original v4');
  const stored=localStorage.getItem(REVIEW_V5_SAVE_KEY),found=await findEncodedReviewSaveDraft(k=>localStorage.getItem(k));if(await hash(JSON.stringify(found.draft.state))!==digest)throw Error('Stored state mismatch');
  const review=restoreGeneratedSaveDraft(found.draft),images=[];
  for(const year of [0,994,1282,2000,10000])for(let index=0;index<3;index++){
   const o=observeGeneratedSceneReview(review,year,index),c=document.createElement('canvas');drawGeneratedSceneReview(c,o);const raw=c.toDataURL(),again=document.createElement('canvas');drawGeneratedSceneReview(again,o);if(again.toDataURL()!==raw)throw Error('Reloaded past scene changed');
   const large=document.createElement('canvas');large.width=1280;large.height=720;const z=large.getContext('2d');z.imageSmoothingEnabled=false;z.drawImage(c,0,0,1280,720);images.push({year,index,raw,large:large.toDataURL()});
  }
  let nativeQuota=false;try{localStorage.setItem(REVIEW_V5_SAVE_KEY,'x'.repeat(8*1024*1024));}catch(e){if(e.name!=='QuotaExceededError')throw e;nativeQuota=true;}
  if(!nativeQuota||localStorage.getItem(REVIEW_V5_SAVE_KEY)!==stored||localStorage.getItem('namonaki-story-v4')!==legacyJson)throw Error('Native quota changed an original value');
  const failed=await storeEncodedReviewSaveDraft({setItem(){throw new DOMException('controlled reduced quota','QuotaExceededError');}},draft);
  if(failed.status!=='not-saved'||failed.reason!=='quota'||await hash(JSON.stringify((await decodeReviewSaveDraft(failed.exportJson)).state))!==digest)throw Error('Quota export lost state');
  localStorage.setItem(REVIEW_V5_SAVE_KEY,'broken-v5');let stopped=false;try{await findEncodedReviewSaveDraft(k=>localStorage.getItem(k));}catch{stopped=true;}if(!stopped)throw Error('Broken v5 fell back to old key');
  if(localStorage.getItem('namonaki-story-v4')!==legacyJson)throw Error('Old key was modified');
  return {stored:true,coexistence:true,nativeQuotaPreserved:true,manualExportStateEqual:true,brokenCurrentStopped:true,storedUnits:stored.length,images};
 },{encoded,legacyJson,digest});
 assert.deepEqual(blocked,[]);for(const {year,index,raw,large} of result.images)for(const [kind,data] of [['raw',raw],['large',large]])await writeFile(`${out}/seed1_year${year}_site${index}_${kind}.png`,Buffer.from(data.split(',')[1],'base64'));
 const {images,...storage}=result,report={status:'D4B_SAVE_DRAFT_REVIEW_ONLY',sourceSHA:process.env.REVIEW_SOURCE_SHA??'local-unidentified',seed:1,mode:'field-only',year:10000,plainBytes:Buffer.byteLength(plain),compressedBytes:Buffer.byteLength(encoded),terrainBytes:Buffer.byteLength(JSON.stringify(terrain)),legacyBytes:Buffer.byteLength(legacyJson),landBirths:draft.landHistory.events.length,roundtripStateEqual:true,generatorImports:blocked,scenes:images.length,storage,elapsedMs:Math.round(performance.now()-start),
  limitations:['Independent draft codec/storage probe; live app and production policy remain unchanged','One 10,000-year generated case; not the full D5 acceptance set']};
 await writeFile(out+'/capacity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.kill();}
