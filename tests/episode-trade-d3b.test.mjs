import test from 'node:test';
import assert from 'node:assert/strict';
import {TRADE_EPISODE_D3B} from '../dist/story/episode-trade-d3b-review.js';
import {links} from '../dist/story/regional-economy.js';
import {checkEpisodeHistory,episodesAt} from '../dist/story/episode-d2c-review.js';
import {createReviewWorld,advanceReviewWorld,chooseReviewWorld} from '../dist/story/review-save-d2b.js';
import {recheckTradeEpisodes,TRADE_RECHECK} from '../scripts/lib/history40-trade.mjs';

// Issue #40 D3b: the trade system on the episode frame (review-only), checked against what it cites.
const POLICY='hardship-linked+decisions-d2b+episodes-trade-d3b';
async function to(seed,years,policy=POLICY){
 const captures=[],o={economy:c=>captures.push(c)};let w=await createReviewWorld(seed,policy);
 while(w.terrain.review.state.year<years||w.terrain.review.state.pending){const s=w.terrain.review.state;w=s.pending?await chooseReviewWorld(w,'random',o):await advanceReviewWorld(w,years-s.year,'stop',o);}
 return {w,s:w.terrain.review.state,captures};
}
const memo=new Map(),once=(seed,years)=>{const k=seed+':'+years;if(!memo.has(k))memo.set(k,to(seed,years));return memo.get(k);};
const kindsOf=s=>new Set(s.episodes.transitions.map(t=>t.kind+(t.reason?':'+t.reason:'')));

test('trade episodes: the re-check uses the same thresholds as the definition', () => {
 const D=TRADE_EPISODE_D3B;
 assert.deepEqual(TRADE_RECHECK,{recent:D.recentTradeYears,stable:D.stableYears,failure:D.failureYears,convert:D.convertYears,abandon:D.abandonYears,coverage:D.coverage,recovery:D.recoveryYears});
});

test('trade episodes: a closure reopens, trade resumes and the relation settles; another means is tried and fails', async () => {
 const {s,captures}=await once(23,900);
 checkEpisodeHistory(s);
 assert.deepEqual(recheckTradeEpisodes(s,captures,links),[]);
 const kinds=kindsOf(s);
 for(const k of ['started','reassessed:route-closed','reassessed:route-reopened','reassessed:trade-resumed','resolved:relation-stable','response-started:local-storage','response-failed:supply-still-short'])assert.ok(kinds.has(k),k);
 const episodes=episodesAt(s,900);
 assert.ok(episodes.some(e=>e.status==='resolved'&&!e.transitions.some(t=>t.kind.startsWith('response'))),'a relation settles without a response');
 // a long stretch without trade on an open route is not a broken relation: the episode stays open, it does not end
 const quiet=episodes.find(e=>e.id==='trade-153');assert.ok(quiet);
 assert.deepEqual(quiet.transitions.map(t=>t.reason??t.kind),['started','route-reopened','route-closed','route-reopened','trade-resumed','relation-stable']);
 const origins=episodes.flatMap(e=>e.originRecordIds);assert.equal(new Set(origins).size,origins.length);
});

test('trade episodes: joint upkeep starts an episode, is the response, and its lapse is the failure', async () => {
 const {s,captures}=await once(20,700);
 checkEpisodeHistory(s);
 assert.deepEqual(recheckTradeEpisodes(s,captures,links),[]);
 const e=episodesAt(s,700).find(e=>e.id==='trade-606');assert.ok(e);
 assert.deepEqual(e.transitions.map(t=>t.kind+':'+(t.reason??'')),['started:','response-started:joint-upkeep','response-failed:upkeep-lapsed','reassessed:trade-resumed','resolved:relation-stable']);
 assert.match(s.history.find(r=>r.id===e.originRecordIds[0]).title,/が交易路を共同で維持する$/);
});

test('trade episodes: the re-check rejects a claim its sources do not support', async () => {
 const {s,captures}=await once(23,900);
 const tamper=(year,f)=>captures.map(c=>c.year!==year?c:f(c));
 const reopened=s.episodes.transitions.find(t=>t.reason==='route-reopened');
 assert.ok(recheckTradeEpisodes(s,tamper(reopened.year,c=>({...c,routes:c.routes.map(r=>({...r,blocked:true}))})),links).some(p=>p.includes('route-reopened')));
 const resumed=s.episodes.transitions.find(t=>t.reason==='trade-resumed'),episode=resumed.episodeId;
 const since=s.episodes.transitions.filter(t=>t.episodeId===episode&&t.year<resumed.year).at(-1).year;
 const silent=captures.map(c=>c.year>=since&&c.year<=resumed.year?{...c,traded:c.traded.map(()=>0)}:c);
 assert.ok(recheckTradeEpisodes(s,silent,links).some(p=>p.includes('trade-resumed')));
 const failed=s.episodes.transitions.find(t=>t.reason==='supply-still-short');
 assert.ok(recheckTradeEpisodes(s,tamper(failed.year,c=>({...c,economy:{...c.economy,districts:c.economy.districts.map(d=>({...d,shortageYears:0}))}})),links).some(p=>p.includes('supply-still-short')));
 const started=s.episodes.transitions.find(t=>t.kind==='started'&&/往来が途絶える$/.test(s.history.find(r=>r.id===t.evidence[0].id).title));
 const never=captures.map(c=>c.year>started.year-20&&c.year<=started.year?{...c,traded:c.traded.map(()=>0)}:c);
 assert.ok(recheckTradeEpisodes(s,never,links).some(p=>p.includes('no trade in 20 years')));
});

test('trade episodes write nothing else: the world is the one without episodes', async () => {
 const {w}=await once(23,900),{w:without}=await to(23,900,'hardship-linked+decisions-d2b');
 const {episodes,...rest}=w.terrain.review.state;
 assert.equal(JSON.stringify(rest),JSON.stringify(without.terrain.review.state));
 assert.equal(JSON.stringify(w.architecture),JSON.stringify(without.architecture));
});
