import test from 'node:test';
import assert from 'node:assert/strict';
import {checkEpisodeHistory,episodesAt} from '../dist/story/episode-d2c-review.js';
import {createReviewWorld,advanceReviewWorld,chooseReviewWorld} from '../dist/story/review-save-d2b.js';
import {recheckRecoveryEpisodes} from '../scripts/lib/history40-recovery.mjs';

// Issue #40 D3c: the disaster-recovery system on the episode frame (review-only), checked against the chronicle.
const POLICY='hardship-linked+decisions-d2b+episodes-recovery-d3c';
async function to(seed,years,policy=POLICY){
 let w=await createReviewWorld(seed,policy);
 while(w.terrain.review.state.year<years||w.terrain.review.state.pending){const s=w.terrain.review.state;w=s.pending?await chooseReviewWorld(w,'random'):await advanceReviewWorld(w,years-s.year,'stop');}
 return {w,s:w.terrain.review.state};
}
const memo=new Map(),once=(seed,years)=>{const k=seed+':'+years;if(!memo.has(k))memo.set(k,to(seed,years));return memo.get(k);};
const kindsOf=s=>new Set(s.episodes.transitions.map(t=>t.kind+(t.reason?':'+t.reason:'')));
const record=(s,id)=>s.history.find(r=>r.id===id);

test('recovery episodes: damage from a disaster starts one; repairs restore the objects; more damage widens it', async () => {
 const {s}=await once(23,900);
 checkEpisodeHistory(s);
 assert.deepEqual(recheckRecoveryEpisodes(s),[]);
 const kinds=kindsOf(s);
 for(const k of ['started','response-started:repair','reassessed:object-repaired','reassessed:further-damage','resolved:restored'])assert.ok(kinds.has(k),k);
 for(const e of episodesAt(s,900)){
  // the origin is a disaster and the damage it caused, never the disaster alone
  const origin=e.originRecordIds.map(id=>record(s,id));
  assert.ok(origin.some(r=>/-damaged$/.test(r.kind)),e.id);
  for(const d of origin.filter(r=>/-damaged$/.test(r.kind)))assert.ok(d.relatedIds.some(id=>origin.some(r=>r.id===id&&['flood','earthquake','fire','storm'].includes(r.kind))),d.id);
 }
 // one housing block waited 244 years for its repair: the episode stays open until it is repaired (no clock ends it)
 const long=episodesAt(s,900).find(e=>e.id==='recovery-125');
 assert.equal(long.endedYear,370);assert.equal(long.transitions.at(-1).reason,'restored');
});

test('recovery episodes: a damaged object goes out of use; during a response that is the failure; a ruin left ends it', async () => {
 const {s}=await once(11,700);
 checkEpisodeHistory(s);
 assert.deepEqual(recheckRecoveryEpisodes(s),[]);
 const e=episodesAt(s,700).find(e=>e.id==='recovery-627');assert.ok(e);
 const reasons=e.transitions.map(t=>t.kind+':'+(t.reason??''));
 for(const k of ['response-failed:object-abandoned','reassessed:object-abandoned','abandoned:left-in-ruin'])assert.ok(reasons.includes(k),k);
 assert.equal(e.status,'abandoned');
 // the abandonment cites the damage it follows
 const failed=e.transitions.find(t=>t.kind==='response-failed');
 const cited=failed.evidence.map(x=>record(s,x.id));
 assert.ok(cited.some(r=>/abandoned|ruined$/.test(r.kind))&&cited.some(r=>/-damaged$/.test(r.kind)));
});

test('recovery episodes: the re-check rejects a claim the chronicle does not support', async () => {
 const {s}=await once(23,900);
 const clone=()=>structuredClone(s);
 // a damage without its disaster
 {const t=clone(),start=t.episodes.transitions.find(x=>x.kind==='started');const d=t.history.find(r=>r.id===start.evidence.find(x=>/-damaged$/.test(t.history.find(r=>r.id===x.id).kind)).id);d.relatedIds=[];
  assert.ok(recheckRecoveryEpisodes(t).some(p=>p.includes('does not cite a disaster')));}
 // a repair that the chronicle does not hold
 {const t=clone(),rep=t.episodes.transitions.find(x=>x.reason==='object-repaired');const r=t.history.find(r=>r.id===rep.evidence[0].id);r.kind='housing-underused';
  assert.ok(recheckRecoveryEpisodes(t).some(p=>p.includes('object-repaired')));}
 // a repair the episode never cites: it is missed
 {const t=clone(),i=t.episodes.transitions.findIndex(x=>x.reason==='object-repaired');const missed=t.episodes.transitions[i].evidence[0].id;t.episodes.transitions.splice(i,1);
  assert.ok(recheckRecoveryEpisodes(t).some(p=>p.includes(missed)&&p.includes('not cited')));}
 // restored while an object is still damaged
 {const t=clone(),i=t.episodes.transitions.findIndex(x=>x.reason==='object-repaired');t.episodes.transitions.splice(i,1);
  assert.ok(recheckRecoveryEpisodes(t).some(p=>p.includes('restored')&&p.includes('not every object')));}
});

test('recovery episodes write nothing else: the world is the one without episodes', async () => {
 const {w}=await once(23,900),{w:without}=await to(23,900,'hardship-linked+decisions-d2b');
 const {episodes,...rest}=w.terrain.review.state;
 assert.equal(JSON.stringify(rest),JSON.stringify(without.terrain.review.state));
 assert.equal(JSON.stringify(w.architecture),JSON.stringify(without.architecture));
});
