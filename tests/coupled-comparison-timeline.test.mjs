import test from 'node:test';
import assert from 'node:assert/strict';
import {timeline,firstTimeline} from '../scripts/coupled-comparison-timeline.mjs';
const trial=(id='record-a')=>({phases:[{year:1,phase:'step',rngBefore:1,rngAfter:2,draws:1},{year:1,phase:'auto-choice',choice:{index:0,fingerprint:'question'}}],world:{review:{state:{history:[{id,year:1,kind:'flood',tag:'自然',title:'洪水',body:'水があふれる',causes:[]},{id:'decision',year:1,kind:'choice',tag:'選択',title:'避難',body:'高台へ',causes:[],relatedIds:[id]}]}}}});
test('choice and chronicle timelines stay distinct, and unchosen phases do not repeat history',()=>{
 const t=trial(),choice=timeline(t,'choice'),chronicle=timeline(t,'chronicle');
 assert.equal(choice.size,1);assert.equal(choice.get(1).split('\n').length,1);
 assert.equal(chronicle.get(1).split('\n').length,2);
 assert.equal(timeline(t,'disaster').get(1).split('\n').length,1);
 t.world.review.state.history[0].body='違う浸水';
 assert.equal(firstTimeline(chronicle,t,'chronicle'),1);
});
test('renumbering records and their references does not invent a chronicle difference',()=>{
 const a=trial(),b=trial('record-renumbered');
 assert.equal(firstTimeline(timeline(a,'chronicle'),b,'chronicle'),null);
 b.phases[1].choice.index=1;assert.equal(firstTimeline(timeline(a,'choice'),b,'choice'),1);
});
