/** D2-B: continue a fixed legacy world to 10,000 without adopting generated terrain. */
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {parseLegacyCompatibleSave,serializeLegacySaveDraft,advanceLegacySaveDraft} from '../dist/story/legacy-terrain-save.js';
import {observeLegacySaveDraft} from '../dist/scene/legacy-terrain-view.js';
const root='tests/fixtures/legacy-terrain/';
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(sorted(x))).digest('hex');
export async function auditLegacyTerrain(output='artifacts/terrain31-legacy'){
 await mkdir(output,{recursive:true});const manifest=JSON.parse(await readFile(root+'manifest.json','utf8'));
 const fixture=manifest.cases.find(c=>c.id===manifest.longrun.caseId),bytes=await readFile(root+fixture.file),raw=gunzipSync(bytes).toString();
 const initial=parseLegacyCompatibleSave(raw),before=serializeLegacySaveDraft(initial),after=advanceLegacySaveDraft(initial,manifest.longrun.endYear-initial.state.year,'automatic');
 assert.equal(after.state.year,10000);assert.equal(hash(after.state),manifest.longrun.stateSha256);assert.equal(serializeLegacySaveDraft(initial),before);
 for(const v of fixture.views){const old=observeLegacySaveDraft(after,v.year,v.site);assert.equal(hash(old.snapshot),v.snapshotSha256);assert.equal(hash(old.composition),v.compositionSha256);}
 const draftJson=serializeLegacySaveDraft(after),v4Json=JSON.stringify(after.state);
 await writeFile(output+'/legacy-v4-year10000.json',v4Json);await writeFile(output+'/legacy-draft-year10000.json',draftJson);
 const report={status:'LEGACY_DRAFT_REVIEW_ONLY',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',baselineSource:manifest.baselineSource,
  startYear:initial.state.year,endYear:after.state.year,stateSha256:hash(after.state),baselineStateHashEqual:true,oldViewsEqual:true,viewsChecked:fixture.views.length,
  initialTerrain:after.initialTerrain,progressionPolicy:after.progressionPolicy,
  capacity:{v4Utf8Bytes:Buffer.byteLength(v4Json),draftUtf8Bytes:Buffer.byteLength(draftJson),
   v4Utf16CodeUnits:v4Json.length,draftUtf16CodeUnits:draftJson.length,
   simultaneousUtf8Bytes:Buffer.byteLength(v4Json)+Buffer.byteLength(draftJson),
   note:'Independent serialized sizes; browser quota must be tested, not inferred from UTF-8 size.'}};
 await writeFile(output+'/longrun-report.json',JSON.stringify(report,null,2));return {report,v4Json,draftJson};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const {report}=await auditLegacyTerrain();console.log(JSON.stringify(report));}
