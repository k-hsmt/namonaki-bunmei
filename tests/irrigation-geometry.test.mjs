import {proposeBridgeGeometry,bridgeCrossing,bridgeOccupancy} from '../dist/terrain/bridge-geometry-review.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {proposeIrrigation,validateIrrigationGeometry,irrigationLimits} from '../dist/irrigation/geometry-v1.js';
import {shortestSimpleRoutes} from '../dist/irrigation/route-search-v1.js';
import {fixture,plot,land} from './helpers/irrigation-fixture.mjs';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
const at=p=>p[1]*320+p[0];
test('both banks have owned intakes and mirrored views retain canonical geometry without mutating inputs',()=>{
 for(const [field,root,left]of [[plot(130,120),[0,140],true],[plot(180,120),[318,140],false]]){
  const a=fixture({field,root}),before=JSON.stringify(a),result=proposeIrrigation(a);assert.equal(result.status,'proposed',JSON.stringify(result));assert.equal(JSON.stringify(a),before);const g=result.geometry,r=decodeRecordPhysics(a.ground.terrain.sites['river-bank'].physics);
  assert.equal(g.intake.water[0],left?150:169);assert.equal(g.intake.bank[0],left?149:170);assert.equal(g.intake.parentShapeId,'controlled-river');assert.equal(g.intake.streamId,'main');assert.ok(g.path.length<=64&&g.path.length>1);assert.ok(Object.isFrozen(g.path[0]));
  for(const p of g.cells){assert.equal(r.surface[at(p)],1);assert.equal(r.bearing[at(p)],0);assert.equal(r.elevation[at(p)],g.intake.head);assert.equal(r.grade[at(p)],0);assert.ok(!a.ground.occupancy.some(o=>p[0]>=o.plot.x&&p[0]<o.plot.x+o.plot.width&&p[1]>=o.plot.y&&p[1]<o.plot.y+o.plot.depth));}
  assert.deepEqual(proposeIrrigation(a),result);assert.deepEqual(proposeIrrigation(fixture({field,root,mirror:true})).geometry,g);assert.deepEqual(validateIrrigationGeometry(JSON.parse(JSON.stringify(g)),a),g);
 }
});
test('an access-losing shortest route is rejected and an equal-length alternative keeps the entrance reachable',()=>{
 const house={id:'controlled-house',plot:plot(140,111,8,8),entrance:[143,119]},ctx=fixture({extra:[house]}),a=proposeIrrigation(ctx);assert.equal(a.status,'proposed',JSON.stringify(a));assert.ok(a.metrics.accessRejected>0);assert.ok(a.metrics.candidates>1);assert.deepEqual(validateIrrigationGeometry(a.geometry,ctx),a.geometry);
 const limited=proposeIrrigation(ctx,{maxCandidates:1});assert.equal(limited.status,'hold');assert.equal(limited.reason,'search-limit');assert.equal(limited.metrics.candidates,1);
});
test('reservation walls, uphill targets, long paths and missing bank contracts stay distinct from exhausted searches',()=>{
 const wall={id:'reserved-wall',plot:plot(142,96,8,84)},occupied=proposeIrrigation(fixture({reservations:[wall]}));assert.equal(occupied.reason,'occupied',JSON.stringify(occupied));
 const raised=proposeIrrigation(fixture({shapes:[land('raised-field',129,119,12,10,1)]}));assert.equal(raised.reason,'no-flat-route',JSON.stringify(raised));
 const long=proposeIrrigation(fixture({field:plot(20,120)}));assert.equal(long.reason,'too-long',JSON.stringify(long));
 const noBank=proposeIrrigation(fixture({shapes:[land('west-lip',149,96,1,84,1),land('east-lip',170,96,1,84,1)]}));assert.equal(noBank.reason,'no-owned-intake',JSON.stringify(noBank));
 const ctx=fixture(),limit=proposeIrrigation(ctx,{maxSearchStates:1});assert.equal(limit.reason,'search-limit');assert.ok(limit.metrics.searchStates<=1);assert.throws(()=>proposeIrrigation(ctx,{maxSearchStates:irrigationLimits.maxSearchStates+1}));
 const none=proposeIrrigation({...ctx,fields:[]});assert.equal(none.reason,'no-active-field');assert.equal(none.metrics.searchStates,0);
});
test('existing access components on both banks are protected and future or partial inputs cannot mint geometry',()=>{
 const ctx=fixture();ctx.roots.push([318,140]);const g=proposeIrrigation(ctx);assert.equal(g.status,'proposed');
 assert.equal(proposeIrrigation({...ctx,ground:{...ctx.ground,site:'coast-inlet'}}).reason,'unsupported-site');
 assert.equal(proposeIrrigation({...ctx,ground:{...ctx.ground,historyStatus:'partial'}}).reason,'unknown-history');
 assert.equal(proposeIrrigation({...ctx,ground:{...ctx.ground,confirmedYear:9}}).reason,'unconfirmed-year');
 assert.throws(()=>proposeIrrigation({...ctx,fields:[{...ctx.fields[0],builtYear:11}]}));assert.throws(()=>proposeIrrigation({...ctx,fields:[{...ctx.fields[0],plot:plot(10,100)}]}));
 assert.throws(()=>proposeIrrigation({...ctx,roots:[]}));assert.throws(()=>proposeIrrigation({...ctx,cause:{recordId:'wrong-year',year:9}}));
});
test('stored geometry validates its source, reach, full width, adjacency, target, occupation and pedestrian continuity without rerouting',()=>{
 const ctx=fixture(),g=proposeIrrigation(ctx).geometry;
 for(const mutate of [x=>x.ruleId='future',x=>x.status='production',x=>x.waterContract='pumped',x=>x.source.seed++,x=>x.year++,x=>x.causeRecordId='invented',x=>x.intake.parentShapeId='invented',x=>x.intake.streamId='sea',x=>x.intake.fromY++,x=>x.intake.head++,x=>x.intake.water[0]=160,x=>x.field.sourceRecordId='invented',x=>x.path[1]=x.path[0],x=>x.path[1][1]+=2,x=>x.path.pop(),x=>x.cells.pop(),x=>x.path[0]=[150,120],x=>x.extra=true]){const c=structuredClone(g);mutate(c);assert.throws(()=>validateIrrigationGeometry(c,ctx),JSON.stringify(c));}
 const blocked={...ctx,ground:{...ctx.ground,reservations:[{id:'new-reservation',plot:plot(g.path[1][0],g.path[1][1],2,1)}]}};assert.throws(()=>validateIrrigationGeometry(g,blocked));
});
test('bounded Yen enumeration matches exhaustive loopless paths on small cyclic graphs',()=>{
 const compare=(a,b)=>a.length-b.length||a.reduce((d,v,i)=>d||v-b[i],0);let seed=7123;
 for(let trial=0;trial<35;trial++){const edges=Array.from({length:7},()=>[]);for(let i=0;i<6;i++)for(let j=1;j<7;j++)if(i!==j){seed=(Math.imul(seed,1664525)+1013904223)>>>0;if(seed%4===0)edges[i].push(j);}
  const all=[];function visit(path){const n=path.at(-1);if(n===6){all.push(path);return;}for(const next of edges[n])if(!path.includes(next))visit([...path,next]);}visit([0]);all.sort(compare);
  const budget={used:0,limit:1000000,exhausted:false},actual=[...shortestSimpleRoutes({size:7,source:0,sink:6,neighbors:n=>edges[n]},budget,compare)];assert.equal(budget.exhausted,false);assert.deepEqual(actual,all,'graph '+JSON.stringify(edges));
 }
});

test('an intake can use saved freshwater on row 95 while its full-width bank and conveyance stay on land from row 96',()=>{
 const ctx=fixture({field:plot(154,99,10,4),riverPolygon:[[150,95],[170,95],[190,96],[190,180],[170,180],[170,96],[150,96]],riverOut:[180,179]}),r=proposeIrrigation(ctx);assert.equal(r.status,'proposed',JSON.stringify(r));assert.equal(r.geometry.intake.water[1],95);assert.ok(r.geometry.cells.every(p=>p[1]>=96));assert.deepEqual(validateIrrigationGeometry(r.geometry,ctx),r.geometry);
});
test('verified bridge decks stay reserved for crossing and cannot become conveyance cells',()=>{
 const ctx=fixture();ctx.roots.push([318,140]);const bridge=proposeBridgeGeometry(ctx.ground,ctx.hydrology,ctx.roots,[120,140],'controlled-bridge');assert.equal(bridge.status,'proposed');const parts=bridgeOccupancy(bridge.geometry);ctx.ground={...ctx.ground,occupancy:[...ctx.ground.occupancy,...parts],crossings:[bridgeCrossing(bridge.geometry)]};
 const result=proposeIrrigation(ctx);assert.equal(result.status,'proposed',JSON.stringify(result));for(const [x,y]of result.geometry.cells)assert.equal(parts.some(o=>x>=o.plot.x&&x<o.plot.x+o.plot.width&&y>=o.plot.y&&y<o.plot.y+o.plot.depth),false);assert.deepEqual(validateIrrigationGeometry(result.geometry,ctx),result.geometry);
});
test('target order is by confirmed birth then ID; a failed earlier field does not hide a feasible later field',()=>{
 const ctx=fixture(),old={id:'older-field',plot:plot(20,120),builtYear:0,sourceRecordId:'old-birth'};ctx.fields=[ctx.fields[0],old];ctx.ground.occupancy.push({id:old.id,plot:old.plot,entrance:[24,128]});const result=proposeIrrigation(ctx);assert.equal(result.status,'proposed',JSON.stringify(result));assert.equal(result.geometry.field.id,'controlled-field');assert.equal(result.diagnostics[0].fieldId,'older-field');assert.equal(result.diagnostics[0].reason,'too-long');assert.equal(result.diagnostics[0].causeRecordId,ctx.cause.recordId);
});

test('a stored canal cannot acquire additional river contacts along its conveyance',()=>{
 const ctx=fixture(),g=structuredClone(proposeIrrigation(ctx).geometry);g.intake.bank=[149,110];g.intake.water=[150,110];g.path=[...Array.from({length:11},(_,i)=>[148,110+i]),...Array.from({length:8},(_,i)=>[147-i,120])];g.cells=[...new Set(g.path.flatMap(([x,y])=>[y*320+x,y*320+x+1]))].sort((a,b)=>a-b).map(i=>[i%320,Math.floor(i/320)]);assert.throws(()=>validateIrrigationGeometry(g,ctx),/conveyance/);
 const result=proposeIrrigation(ctx),r=decodeRecordPhysics(ctx.ground.terrain.sites['river-bank'].physics),first=new Set(result.geometry.path.slice(0,1).flatMap(([x,y])=>[y*320+x,y*320+x+1]));
 for(const p of result.geometry.cells){if(first.has(at(p)))continue;for(const delta of [-320,-1,1,320])assert.notEqual(r.surface[at(p)+delta],2);}
});
test('static reuse never conceals changed occupation or mutable river ownership',()=>{const ctx=fixture(),first=proposeIrrigation(ctx);assert.equal(first.status,'proposed');ctx.ground.reservations=[{id:'new-wall',plot:plot(142,96,8,84)}];assert.equal(proposeIrrigation(ctx).reason,'occupied');ctx.ground.reservations=[];assert.deepEqual(proposeIrrigation(ctx).geometry,first.geometry);const mutable=structuredClone(ctx.hydrology);Object.freeze(mutable);const c={...ctx,hydrology:mutable};assert.equal(proposeIrrigation(c).status,'proposed');mutable.reaches[0].streamId='invented';assert.throws(()=>proposeIrrigation(c));});
