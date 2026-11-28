import test from 'node:test';
import assert from 'node:assert/strict';
import {defineEpisodeSet,commitEpisodeYear,checkEpisodeHistory,episodesAt,EPISODE_KINDS} from '../dist/story/episode-d2c-review.js';
import {createReviewWorld,advanceReviewWorld,chooseReviewWorld,prepareReviewSave,restoreReviewSave} from '../dist/story/review-save-d2b.js';

// Issue #40 D2c: the common episode frame (review-only). Fixture definitions follow a script of proposals per year.
const minimal=()=>({year:0,history:[],observation:{lastYear:0},pending:null});
const record=(s,kind='fixture')=>{const id=`${s.year}-${s.history.length}`;s.history.push({id,year:s.year,tag:'地域',title:kind,body:'',causes:[],important:false,kind});return id;};
const nextYear=s=>{s.year++;s.observation.lastYear=s.year;};
/** A definition that does what script[year] says (a function of the year's view and the active episode). */
const scripted=(kind,script)=>({kind,definitionId:'fixture-'+kind,
 start:(y,last)=>script[y.year]?.(y,null,last)??null,advance:(y,e)=>script[y.year]?.(y,e)??null});
const ev=id=>[{type:'record',id}];

test('episodes: start, response, failure, retry, change, abandonment and a recurrence with a new id', () => {
 const s=minimal(),ids={};
 const script={
  1:y=>({evidence:ev(ids.a),state:{n:1}}),
  3:(y,e)=>({kind:'response-started',evidence:ev(ids.a),state:{n:2}}),
  5:(y,e)=>({kind:'response-failed',evidence:[{type:'ledger',key:'fixture.coverage',year:5}],state:{n:3},reason:'still-short'}),
  6:(y,e)=>({kind:'response-started',evidence:ev(ids.a),state:{n:4}}),
  7:(y,e)=>({kind:'response-changed',evidence:ev(ids.b),state:{n:5},reason:'other-means'}),
  9:(y,e)=>({kind:'abandoned',evidence:ev(ids.b),state:{n:5},reason:'given-up'}),
  10:(y,e,last)=>({evidence:ev(ids.c),state:{n:0},parentEpisodeId:last.id}),
 };
 const set=defineEpisodeSet('fixture-life',[scripted('food',script)]);
 for(let y=1;y<=12;y++){nextYear(s);if(y===1)ids.a=record(s);if(y===7)ids.b=record(s);if(y===10)ids.c=record(s);commitEpisodeYear(s,set);}
 const all=s.episodes.transitions;
 assert.deepEqual(all.map(t=>t.kind),['started','response-started','response-failed','response-started','response-changed','abandoned','started']);
 assert.deepEqual(all.map(t=>t.id),['food-1/0','food-1/1','food-1/2','food-1/3','food-1/4','food-1/5','food-10/0']);
 assert.equal(all[6].parentEpisodeId,'food-1');
 assert.deepEqual(checkEpisodeHistory(s),{episodes:2,transitions:7,active:1});
 assert.equal(s.episodes.active.food.response,'none');assert.equal(s.episodes.active.food.id,'food-10');
 // the past as observed then
 const at4=episodesAt(s,4);assert.equal(at4.length,1);assert.equal(at4[0].status,'active');assert.equal(at4[0].transitions.length,2);
 assert.equal(episodesAt(s,9)[0].status,'abandoned');assert.equal(episodesAt(s,9)[0].endedYear,9);
 assert.throws(()=>episodesAt(s,13),/committed year/);
});

test('episodes: kinds run in parallel, one active per kind, years committed once and only after the ledgers', () => {
 const s=minimal();let r;
 const start=()=>({evidence:ev(r),state:null});
 const set=defineEpisodeSet('fixture-parallel',EPISODE_KINDS.map(k=>scripted(k,{1:start,2:(y,e)=>e?null:start()})));
 nextYear(s);r=record(s);commitEpisodeYear(s,set);
 assert.deepEqual(s.episodes.transitions.map(t=>[t.episodeId,t.seq]),[['food-1',0],['trade-1',1],['recovery-1',2],['society-1',3]]);
 assert.throws(()=>commitEpisodeYear(s,set),/committed twice/);
 nextYear(s);s.observation.lastYear=1;assert.throws(()=>commitEpisodeYear(s,set),/after its ledgers/);
 s.observation.lastYear=2;commitEpisodeYear(s,set);assert.equal(s.episodes.transitions.length,4);
 assert.throws(()=>commitEpisodeYear(s,defineEpisodeSet('other',[])),/another definition set/);
 assert.throws(()=>defineEpisodeSet('dup',[scripted('food',{}),scripted('food',{})]),/one definition per kind/);
 assert.throws(()=>commitEpisodeYear(s,{id:'fixture-parallel',definitions:[]}),/defineEpisodeSet/);
});

test('episodes: evidence must exist and never come from a later year; origins and parents are checked', () => {
 const cases=[
  [{1:()=>({evidence:[],state:null})},/needs evidence/],
  [{1:()=>({evidence:ev('1-99'),state:null})},/unknown record/],
  [{1:()=>({evidence:[{type:'ledger',key:'x',year:2}],state:null})},/an episode starts from records|later year/],
  [{1:y=>({evidence:[...ev(y.records[0].id),{type:'ledger',key:'x',year:2}],state:null})},/later year/],
  [{1:y=>({evidence:ev(y.records[0].id),state:null,parentEpisodeId:'food-0'})},/unknown or later parent/],
  [{1:y=>({evidence:ev(y.records[0].id),state:{f:()=>1}})},/JSON-plain|JSON/],
  [{1:y=>({evidence:ev(y.records[0].id),state:null}),2:(y,e)=>({kind:'response-failed',evidence:ev(y.records[0]?.id??'1-0'),state:null,reason:'x'})},/no response is running/],
  [{1:y=>({evidence:ev(y.records[0].id),state:null}),2:(y,e)=>({kind:'abandoned',evidence:ev('1-0'),state:null})},/states its reason/],
  [{1:y=>({evidence:ev(y.records[0].id),state:null}),2:(y,e)=>({kind:'resolved',evidence:ev('1-0'),state:null}),3:(y,e)=>e?null:{evidence:ev('1-0'),state:null}},/already started an episode/],
  [{1:y=>({evidence:ev(y.records[0].id),state:null}),2:(y,e)=>({kind:'reassessed',evidence:[{type:'episode',id:'food-1'}],state:null})},/own episode/],
 ];
 cases.forEach(([script,error],i)=>{
  const s=minimal(),set=defineEpisodeSet('fixture-bad-'+i,[scripted('food',script)]);
  assert.throws(()=>{for(let y=1;y<=3;y++){nextYear(s);record(s);commitEpisodeYear(s,set);}},error,'case '+i);
 });
 // a record of a later year cannot be cited: it does not exist yet when the year is committed
 const s=minimal(),set=defineEpisodeSet('fixture-future',[scripted('food',{1:()=>({evidence:ev('2-1'),state:null})})]);
 nextYear(s);record(s);assert.throws(()=>commitEpisodeYear(s,set),/unknown record/);
});

test('episodes: the whole typed history is rebuilt and tampering is rejected', () => {
 const s=minimal();let r;
 const set=defineEpisodeSet('fixture-tamper',[scripted('food',{1:()=>({evidence:ev(r),state:{a:1}}),3:(y,e)=>({kind:'reassessed',evidence:ev(r),state:{a:2}}),4:(y,e)=>({kind:'resolved',evidence:ev(r),state:{a:2}})})]);
 for(let y=1;y<=5;y++){nextYear(s);if(y===1)r=record(s);commitEpisodeYear(s,set);}
 assert.deepEqual(checkEpisodeHistory(s),{episodes:1,transitions:3,active:0});
 const t=s=>JSON.parse(JSON.stringify(s));
 const bad=[
  x=>{x.episodes.transitions.push({...x.episodes.transitions[1],id:'food-1/3',seq:0,year:5});},
  x=>{x.episodes.transitions.splice(1,1);},
  x=>{x.episodes.transitions[1].year=7;},
  x=>{x.episodes.active.food={...x.episodes.transitions[0],id:'food-1'};},
  x=>{x.episodes.transitions[0].evidence=[{type:'record',id:'9-9'}];},
  x=>{x.episodes.committedThrough=4;},
  x=>{x.episodes.transitions.reverse();},
 ];
 bad.forEach((f,i)=>{const x=t(s);f(x);assert.throws(()=>checkEpisodeHistory(x),undefined,'tamper '+i);});
 // the frame writes nothing but s.episodes
 const before=t(s);delete before.episodes;nextYear(s);nextYear(before);commitEpisodeYear(s,set);const after=t(s);delete after.episodes;
 assert.deepEqual(after,before);
});

test('episodes on a real world: the world is unchanged, the past stays as observed, a pending save with an active episode round-trips', async () => {
 const POLICY='hardship-linked+decisions-d2b+episodes-probe-d2c';
 const a=await advanceReviewWorld(await createReviewWorld(6,POLICY),1200),b=await advanceReviewWorld(await createReviewWorld(6,'hardship-linked+decisions-d2b'),1200);
 const {episodes,...rest}=a.terrain.review.state;
 assert.equal(JSON.stringify(rest),JSON.stringify(b.terrain.review.state));assert.equal(JSON.stringify(a.architecture),JSON.stringify(b.architecture));
 const summary=checkEpisodeHistory(a.terrain.review.state);assert.ok(summary.episodes>=2,JSON.stringify(summary));
 const past=JSON.stringify(episodesAt(a.terrain.review.state,900));
 // stop at a branch while an episode is active
 let w=await advanceReviewWorld(a,1,'stop');
 while(!(w.terrain.review.state.pending&&w.terrain.review.state.episodes.active.food))w=w.terrain.review.state.pending?await chooseReviewWorld(w,'random'):await advanceReviewWorld(w,3000-w.terrain.review.state.year,'stop');
 const s=w.terrain.review.state;assert.equal(s.episodes.committedThrough,s.year-1,'the pending year is not committed');
 assert.equal(JSON.stringify(episodesAt(s,900)),past,'later years do not change the past');
 const save=await prepareReviewSave(w),restored=await restoreReviewSave(JSON.parse(JSON.stringify(save)));
 assert.equal(JSON.stringify(restored.terrain.review.state),JSON.stringify(s));
 const x=await advanceReviewWorld(await chooseReviewWorld(restored,0),120),y=await advanceReviewWorld(await chooseReviewWorld(w,0),120);
 assert.equal(JSON.stringify(x.terrain.review.state),JSON.stringify(y.terrain.review.state));
 assert.equal(x.terrain.review.state.episodes.committedThrough,x.terrain.review.state.year);checkEpisodeHistory(x.terrain.review.state);
});
