import test from 'node:test';
import assert from 'node:assert/strict';
import {FOOD_EPISODE_D3A} from '../dist/story/episode-food-d3a-review.js';
import {checkEpisodeHistory,episodesAt} from '../dist/story/episode-d2c-review.js';
import {createReviewWorld,advanceReviewWorld,chooseReviewWorld} from '../dist/story/review-save-d2b.js';
import {recheckFoodEpisodes,FOOD_RECHECK} from '../scripts/lib/history40-food.mjs';

// Issue #40 D3a: the food system on the episode frame (review-only), checked against what it cites.
const POLICY='hardship-linked+decisions-d2b+episodes-food-d3a';
async function to(seed,years,policy=POLICY){
 const captures=[],o={economy:c=>captures.push(c)};let w=await createReviewWorld(seed,policy);
 while(w.terrain.review.state.year<years||w.terrain.review.state.pending){const s=w.terrain.review.state;w=s.pending?await chooseReviewWorld(w,'random',o):await advanceReviewWorld(w,years-s.year,'stop',o);}
 return {w,s:w.terrain.review.state,captures};
}
let world;const once=async()=>world??=await to(23,1700);

test('food episodes: the re-check uses the same thresholds as the definition', () => {
 assert.deepEqual({coverage:FOOD_RECHECK.coverage,recovery:FOOD_RECHECK.recovery,stable:FOOD_RECHECK.stable,failure:FOOD_RECHECK.failure,abandon:FOOD_RECHECK.abandon},
  {coverage:FOOD_EPISODE_D3A.coverage,recovery:FOOD_EPISODE_D3A.recoveryYears,stable:FOOD_EPISODE_D3A.stableYears,failure:FOOD_EPISODE_D3A.failureYears,abandon:FOOD_EPISODE_D3A.abandonYears});
});

test('food episodes: start from records, respond, fail, are abandoned or resolve; every transition holds against its sources', async () => {
 const {s,captures}=await once();
 checkEpisodeHistory(s);
 assert.deepEqual(recheckFoodEpisodes(s,captures),[]);
 const kinds=new Set(s.episodes.transitions.map(t=>t.kind+(t.reason?':'+t.reason:'')));
 for(const k of ['started','reassessed:supply-recovering','reassessed:supply-relapsed','response-failed:shortage-persisted','abandoned:no-response-after-failure','resolved:supply-stable'])assert.ok(kinds.has(k),k);
 assert.ok([...kinds].some(k=>k.startsWith('response-started:')));
 const episodes=episodesAt(s,1700);
 assert.ok(episodes.some(e=>e.status==='resolved'&&!e.transitions.some(t=>t.kind.startsWith('response'))),'an episode resolves without a response');
 assert.ok(episodes.some(e=>e.status==='abandoned'),'an episode is abandoned');
 // an abandoned episode does not claim the shortage ended: a new one needs a new origin record
 const origins=episodes.flatMap(e=>e.originRecordIds);assert.equal(new Set(origins).size,origins.length);
});

test('food episodes: the re-check rejects a claim its sources do not support', async () => {
 const {s,captures}=await once();
 const recovering=s.episodes.transitions.find(t=>t.reason==='supply-recovering');
 const dented=captures.map(c=>c.year!==recovering.year?c:{...c,economy:{...c.economy,districts:c.economy.districts.map(d=>({...d,coverage:.5}))}});
 assert.ok(recheckFoodEpisodes(s,dented).some(p=>p.includes('supply-recovering')));
 const failed=s.episodes.transitions.find(t=>t.reason==='shortage-persisted');
 const easy=captures.map(c=>c.year!==failed.year?c:{...c,economy:{...c.economy,districts:c.economy.districts.map(d=>({...d,shortageYears:0}))}});
 assert.ok(recheckFoodEpisodes(s,easy).some(p=>p.includes('shortage-persisted')));
 const response=s.episodes.transitions.find(t=>t.kind==='response-started'&&t.reason.startsWith('decision:'));
 if(response){const other={...s,decisions:s.decisions.filter(d=>d.templateId!=='scarce-stores')};assert.ok(recheckFoodEpisodes(other,captures).some(p=>p.includes('scarce-stores')));}
});

test('food episodes write nothing else: the world is the one without episodes', async () => {
 const {w}=await once(),{w:without}=await to(23,1700,'hardship-linked+decisions-d2b');
 const {episodes,...rest}=w.terrain.review.state;
 assert.equal(JSON.stringify(rest),JSON.stringify(without.terrain.review.state));
 assert.equal(JSON.stringify(w.architecture),JSON.stringify(without.architecture));
});
