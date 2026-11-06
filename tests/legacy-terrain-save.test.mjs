import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {parseHousingSave,createHousingCivilization,findSavedHousing} from '../dist/story/housing-persistence.js';
import {lastObservedYear,choose,step,chooseAutomatically} from '../dist/story/engine.js';
import {snapshotAt} from '../dist/scene/model.js';import {composeScene} from '../dist/scene/composition.js';
import {parseLegacyCompatibleSave,migrateLegacySave,validateLegacySaveDraft,serializeLegacySaveDraft,findLegacyDraftSave,advanceLegacySaveDraft,chooseLegacySaveDraft,LegacyDraftError} from '../dist/story/legacy-terrain-save.js';
import {observeLegacySaveDraft} from '../dist/scene/legacy-terrain-view.js';
const root=new URL('./fixtures/legacy-terrain/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
const rawFor=c=>{const b=readFileSync(new URL(c.file,root));return c.file.endsWith('.gz')?gunzipSync(b).toString():b.toString();};
const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(sort(x))).digest('hex');

for(const c of manifest.cases)test('legacy migration/past/continuation stays pinned: '+c.id,()=>{
 const raw=rawFor(c),original=JSON.parse(raw),before=structuredClone(original),draft=migrateLegacySave(original),baseline=parseHousingSave(raw);
 assert.equal(createHash('sha256').update(raw).digest('hex'),c.rawSha256);
 assert.deepEqual(original,before);assert.deepEqual(draft.state,baseline);assert.equal(hash(draft.state),c.normalizedSha256);
 assert.equal(draft.version,5);assert.equal(draft.state.version,4);assert.equal(draft.initialTerrain.mode,'legacy-fixed');
 assert.equal(draft.origin.saveVersion,c.sourceVersion);assert.equal(draft.origin.confirmedYear,c.confirmedYear);
 assert.deepEqual(draft.state.pending,original.pending);assert.equal(draft.state.rngState,original.rngState);
 const packed=serializeLegacySaveDraft(draft),restored=parseLegacyCompatibleSave(packed);
 assert.deepEqual(restored,draft);assert.deepEqual(validateLegacySaveDraft(restored),draft);
 assert.ok(Object.isFrozen(draft)&&Object.isFrozen(draft.state.history));
 assert.throws(()=>draft.state.history.push({}),TypeError);
 for(const v of c.views){
  const observed=observeLegacySaveDraft(draft,v.year,v.site);
  assert.equal(hash(observed.snapshot),v.snapshotSha256);assert.equal(hash(observed.composition),v.compositionSha256);
  if(c.sourceVersion===2)assert.equal(observed.constructionEvidence,'legacy-display-only');
 }
 const after=advanceLegacySaveDraft(draft,100,'automatic');assert.equal(hash(after.state),c.future100AutoSha256);
 assert.equal(hash(draft.state),c.normalizedSha256,'input mutated by continuation');
 for(const v of c.views){const old=observeLegacySaveDraft(after,v.year,v.site);assert.equal(hash(old.snapshot),v.snapshotSha256);assert.equal(hash(old.composition),v.compositionSha256);}
 if(c.pending){
  const stop=advanceLegacySaveDraft(draft,10);assert.deepEqual(stop,draft);assert.equal(lastObservedYear(stop.state),c.confirmedYear);
  const chosen=chooseLegacySaveDraft(draft,0),expected=structuredClone(baseline);choose(expected,0,'manual');
  assert.deepEqual(chosen.state,expected);assert.deepEqual(draft.state.pending,original.pending);
 }
});

test('v4 absence of optional public-space history remains absent; missing housing is rejected',()=>{
 const s=createHousingCivilization(42);delete s.publicSpaces;const before=structuredClone(s),d=migrateLegacySave(s);
 assert.ok(!Object.hasOwn(d.state,'publicSpaces'));assert.deepEqual(s,before);
 delete s.housing;assert.throws(()=>migrateLegacySave(s),LegacyDraftError);
});

test('already migrated partial v4 retains its original unknown/partial boundary',()=>{
 const raw=rawFor(manifest.cases.find(c=>c.id==='v3-normal')),partial=parseHousingSave(raw),introduced=partial.housing.introducedYear;
 for(let i=0;i<100;i++){step(partial);if(partial.pending)chooseAutomatically(partial);}
 const before=structuredClone(partial),d=migrateLegacySave(partial);
 assert.equal(d.origin.saveVersion,4);assert.equal(d.state.housing.introducedYear,introduced);assert.equal(d.state.housing.legacyUntracked,true);
 assert.deepEqual(d.state,before);
 assert.equal(observeLegacySaveDraft(d,introduced-1).composition.housingStatus,'unknown');
 assert.equal(observeLegacySaveDraft(d,introduced).composition.housingStatus,'partial');
});

test('read order is v5/v4/v3/v2, JSON version drives migration, and corrupt first value never falls back',()=>{
 const c=manifest.cases.find(c=>c.id==='v3-normal'),raw=rawFor(c),keys=['namonaki-story-v5','namonaki-story-v4','namonaki-story-v3','namonaki-story-v2'];
 const map=new Map([[keys[2],raw]]),reads=[];const read=k=>{reads.push(k);return map.get(k)??null;};
 assert.equal(findLegacyDraftSave(read).draft.origin.saveVersion,3);assert.deepEqual(reads,keys.slice(0,3));
 map.set(keys[0],raw);assert.equal(findLegacyDraftSave(k=>map.get(k)??null).draft.origin.saveVersion,3);
 for(const bad of ['', '{ broken', JSON.stringify({version:5}),JSON.stringify({version:6})]){
  map.set(keys[0],bad);const calls=[];assert.throws(()=>findLegacyDraftSave(k=>{calls.push(k);return map.get(k)??null;}),LegacyDraftError);assert.deepEqual(calls,[keys[0]]);
 }
 assert.equal(findLegacyDraftSave(()=>null),null);
 // Existing UI still uses its unchanged v4-first reader.
 assert.equal(findSavedHousing(k=>k===keys[0]?'bad draft':k===keys[1]?raw:null).key,keys[1]);
});

const base=()=>parseLegacyCompatibleSave(rawFor(manifest.cases.find(c=>c.id==='v4-normal')));
const invalid=[
 ['wrong wrapper version',x=>x.version=4],['unknown schema',x=>x.schemaVersion=2],['unknown format',x=>x.format='generated-save'],
 ['activation status',x=>x.status='active'],['generated terrain',x=>x.initialTerrain.mode='generated'],
 ['invented terrain shape',x=>x.initialTerrain.sites={}],['missing terrain',x=>delete x.initialTerrain],
 ['unknown renderer',x=>x.initialTerrain.rendererId='future'],['unknown ground',x=>x.initialTerrain.groundRule='future'],
 ['new progression',x=>x.progressionPolicy='terrain-placement-v1'],['nested v5',x=>x.state.version=5],
 ['string version',x=>x.state.version='4'],['invented state terrain',x=>x.state.initialTerrain={}],
 ['missing housing',x=>delete x.state.housing],['origin future',x=>x.origin.confirmedYear=x.state.year+1],
 ['forged old housing boundary',x=>x.origin.saveVersion=2],['unknown origin',x=>x.origin.saveVersion=5],
 ['bad pending',x=>x.state.pending=true],['NaN food',x=>x.state.food=NaN],
 ['broken history entry',x=>delete x.state.history[0].title],['broken population sample',x=>x.state.samples[0].population='100'],['broken lastKind',x=>x.state.lastKind=null],
];
for(const [name,mutate] of invalid)test('legacy rejects '+name,()=>{
 const d=structuredClone(base());mutate(d);const before=structuredClone(d);assert.throws(()=>validateLegacySaveDraft(d),LegacyDraftError);assert.deepEqual(d,before);
});

test('old numeric version confusion and mixed future ledgers stop before migration',()=>{
 for(const version of ['2','3','4',5,6]){
  const raw=JSON.parse(rawFor(manifest.cases[0]));raw.version=version;assert.throws(()=>migrateLegacySave(raw),LegacyDraftError);
 }
 const raw=JSON.parse(rawFor(manifest.cases[0]));raw.observation={};assert.throws(()=>migrateLegacySave(raw),/MIXED_STATE/);
 delete raw.observation;raw.housing={};assert.throws(()=>migrateLegacySave(raw),/MIXED_STATE/);
});

test('step and choice arguments cannot change the source draft',()=>{
 const d=base(),before=serializeLegacySaveDraft(d);
 for(const n of [-1,10001,1.5,NaN])assert.throws(()=>advanceLegacySaveDraft(d,n),LegacyDraftError);
 assert.throws(()=>advanceLegacySaveDraft(d,1,'unknown'),LegacyDraftError);
 assert.throws(()=>chooseLegacySaveDraft(d,0),LegacyDraftError);
 assert.equal(serializeLegacySaveDraft(d),before);
 assert.throws(()=>observeLegacySaveDraft(d,-1),/観測年/);
 assert.throws(()=>observeLegacySaveDraft(d,d.state.year+1),/観測年/);
 assert.throws(()=>observeLegacySaveDraft(d,0,3),/site index/);
});
