import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {validateTerrainRecord} from '../dist/terrain/terrain-record.js';import {encodeRecordPhysics,rasterizeRecordShapes,decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {createTerrainHistory,resolveTerrainAtYear,terrainHistoryThrough} from '../dist/terrain/terrain-revision-v1.js';
import {proposeTerrainCut,commitTerrainCut,verifyTerrainCut} from '../dist/terrain/terrain-earthwork-v1.js';
import {terrainCutFixture as context,terrainCutPlot as plot} from './helpers/terrain-cut-fixture.mjs';
test('cut commits all physics once, starts the following year and preserves the initial record forever',async()=>{
 const ctx=await context(),before=JSON.stringify(ctx),proposal=await proposeTerrainCut(ctx,plot);assert.equal(proposal.status,'review-only');const e=proposal.change;assert.ok(e.cutVolume>0);assert.ok(e.cells.length<=640);assert.equal(e.approvedYear,100);assert.equal(e.effectiveYear,101);
 const committed=commitTerrainCut(proposal);assert.equal(commitTerrainCut(proposal),committed);assert.equal(committed.confirmedThrough,100);assert.equal(resolveTerrainAtYear(committed,100).revisionId,ctx.history.baseHash);assert.throws(()=>resolveTerrainAtYear(committed,101));
 const extended=terrainHistoryThrough(committed,300),after=resolveTerrainAtYear(extended,101);assert.equal(after.revisionId,e.revisionId);assert.equal(after.sites['river-bank'],ctx.ground.terrain.sites['river-bank']);assert.equal(after.sites['coast-inlet'],ctx.ground.terrain.sites['coast-inlet']);
 const old=decodeRecordPhysics(ctx.ground.terrain.sites['hill-side'].physics),next=decodeRecordPhysics(after.sites['hill-side'].physics),changed=new Set(e.cells.map(c=>c[0]));let lower=0;
 for(let i=0;i<57600;i++){assert.equal(next.surface[i],old.surface[i]);assert.equal(next.bearing[i],old.bearing[i]);assert.ok(next.elevation[i]<=old.elevation[i]);if(next.elevation[i]<old.elevation[i])lower++;if(!changed.has(i))for(const k of ['surface','grade','bearing','elevation'])assert.equal(next[k][i],old[k][i]);}
 assert.ok(lower>0);assert.equal(JSON.stringify(ctx),before);assert.equal(resolveTerrainAtYear(extended,99).sites,ctx.history.initial.sites);assert.equal(resolveTerrainAtYear(extended,300).sites,after.sites);assert.throws(()=>validateTerrainRecord(after));
 assert.equal((await proposeTerrainCut({...ctx,history:committed,ground:{...ctx.ground,terrain:resolveTerrainAtYear(committed,100)}},plot)).reason,'limit');
});
test('same candidate replay validates all values and rejects recomputed hashes, stale parents and copied proposals',async()=>{
 const ctx=await context(),proposal=await proposeTerrainCut(ctx,plot),wire=structuredClone(proposal.change),verified=await verifyTerrainCut(wire,ctx);assert.deepEqual(commitTerrainCut(verified).events,commitTerrainCut(proposal).events);
 for(const edit of [e=>e.cells[0][4]++,e=>e.cells[0][8]++,e=>e.cells.reverse(),e=>e.parentRevision='0'.repeat(64),e=>e.effectiveYear++,e=>e.cause.fieldSourceRecordId='invented',e=>e.revisionId='0'.repeat(64)]){const bad=structuredClone(wire);edit(bad);await assert.rejects(()=>verifyTerrainCut(bad,ctx));}
 assert.throws(()=>commitTerrainCut(structuredClone(proposal)),/Unowned/);assert.throws(()=>commitTerrainCut({status:'hold',reason:'occupied',conflicts:[]}));
});
test('failed cuts protect occupation, reservations, earlier earthworks, cliffs and existing access atomically',async()=>{
 const cases=[[{height:0},plot,'unchanged'],[{height:16},plot,'cut-limit'],[{cliff:true},plot,'unstable'],[{extra:[{id:'new-house',plot:{x:24,y:108,width:18,depth:7},entrance:[32,115]}]},plot,'occupied'],[{reservations:[{id:'reserved',plot}]},plot,'occupied'],[{protectedPlots:[{id:'channel-intake',plot}]},plot,'occupied'],[{year:10000},plot,'unconfirmed-year'],[{}, {...plot,x:27},'outside-ground'],[{}, {...plot,invented:1},'outside-ground'],[{extra:[{id:'wall',plot:{x:0,y:98,width:320,depth:1},entrance:[0,99]}],root:[0,96]},plot,'no-access']];
 for(const [options,p,reason] of cases){const ctx=await context(options),before=JSON.stringify(ctx),result=await proposeTerrainCut(ctx,p);assert.equal(result.status,'hold',reason);assert.equal(result.reason,reason);assert.equal(JSON.stringify(ctx),before);}
 const ctx=await context(),successful=commitTerrainCut(await proposeTerrainCut(ctx,plot)),history=terrainHistoryThrough(successful,600),next={...ctx,history,ground:{...ctx.ground,year:600,confirmedYear:600,terrain:resolveTerrainAtYear(history,600)}};assert.equal((await proposeTerrainCut(next,plot)).reason,'occupied');
});
