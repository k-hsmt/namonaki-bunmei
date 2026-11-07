import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';import {migrateLegacySave} from '../dist/story/legacy-terrain-save.js';
import {encodeReviewSaveDraft,decodeReviewSaveDraft,findEncodedReviewSaveDraft,storeEncodedReviewSaveDraft} from '../dist/story/compressed-save-draft-review.js';
import {REVIEW_V5_SAVE_KEY,parseReviewSaveDraft} from '../dist/story/save-draft-dispatch-review.js';
const legacy=migrateLegacySave(createHousingCivilization(42));
test('frozen generated v5 fixture loads by saved results with the pinned complete domain value',async()=>{
 const draft=await decodeReviewSaveDraft(readFileSync(new URL('./fixtures/generated-save-draft-v1-seed42-year0.json',import.meta.url),'utf8'));
 assert.equal(draft.initialTerrain.mode,'generated');assert.equal(draft.state.seed,42);assert.equal(draft.state.year,0);
 assert.equal(createHash('sha256').update(JSON.stringify(draft)).digest('hex'),'42e89ae91880e86413cb79f85f7356c9c9578bd90657ce195e5bfcc323ff22eb');
});
test('standard gzip storage restores the complete legacy envelope without changing modes or inputs',async()=>{
 const before=JSON.stringify(legacy),encoded=await encodeReviewSaveDraft(legacy),container=JSON.parse(encoded);assert.equal(container.encoding,'gzip-base64-v1');
 assert.deepEqual(await decodeReviewSaveDraft(encoded),legacy);assert.deepEqual(await decodeReviewSaveDraft(before),legacy);assert.equal(JSON.stringify(legacy),before);
});
test('corrupt gzip, unknown codecs/modes, length lies, extra fields and expansion beyond the bound fail closed',async()=>{
 const container=JSON.parse(await encodeReviewSaveDraft(legacy));
 for(const mutate of [d=>d.version=4,d=>d.schemaVersion=2,d=>d.encoding='future',d=>d.mode='future',d=>d.mode='generated',d=>d.uncompressedBytes++,d=>d.uncompressedBytes=16,d=>d.uncompressedBytes=17*1024*1024,d=>d.data='bad!',d=>d.data=d.data.slice(0,-4),d=>d.extra=true]){
  const bad=structuredClone(container);mutate(bad);await assert.rejects(()=>decodeReviewSaveDraft(JSON.stringify(bad)));
 }
});
test('encoded discovery never skips a broken current key; quota exports the full plain validated draft',async()=>{
 const encoded=await encodeReviewSaveDraft(legacy),reads=[],values=new Map([[REVIEW_V5_SAVE_KEY,encoded],['namonaki-story-v4','old-value']]);
 const found=await findEncodedReviewSaveDraft(key=>{reads.push(key);return values.get(key)??null;});assert.deepEqual(found.draft,legacy);assert.deepEqual(reads,[REVIEW_V5_SAVE_KEY]);
 values.set(REVIEW_V5_SAVE_KEY,'broken');reads.length=0;await assert.rejects(()=>findEncodedReviewSaveDraft(key=>{reads.push(key);return values.get(key)??null;}));assert.deepEqual(reads,[REVIEW_V5_SAVE_KEY]);
 const before=Array.from(values),result=await storeEncodedReviewSaveDraft({setItem(){throw new DOMException('controlled quota','QuotaExceededError');}},legacy);
 assert.equal(result.status,'not-saved');assert.equal(result.reason,'quota');assert.deepEqual(parseReviewSaveDraft(result.exportJson),legacy);assert.deepEqual(Array.from(values),before);
 const writes=[];const ok=await storeEncodedReviewSaveDraft({setItem:(k,v)=>writes.push([k,v])},legacy);assert.equal(ok.status,'saved');assert.equal(writes[0][0],REVIEW_V5_SAVE_KEY);assert.deepEqual(await decodeReviewSaveDraft(writes[0][1]),legacy);
});
