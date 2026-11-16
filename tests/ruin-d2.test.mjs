/** Issue #37 D2: the live painter weathers vacant and ruined buildings by the confirmed history, without changing anything else. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {drawArchitecture} from '../dist/architecture/draw-v1.js';
import {drawMiniature} from '../dist/architecture/miniature-v1.js';
import {createArchitecturePainter} from '../dist/architecture/scene-v1.js';
import {ruinTimelines,ruinClocksAt,ruinContextOf} from '../dist/ruin/ruin-history-v1.js';
import {ruinAppearanceOf,settledRuinAppearance,drawWeatheredArchitecture,ruinClimateOf,ruinLookOf} from '../dist/ruin/ruin-weathering-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import * as P from '../dist/architecture/production-v1.js';

const CLIMATE={effectiveTemperature:-5,effectiveMoisture:28,annualTemperatureRangeIndex:43},GROUND='#7d8456';
const house={roofFamily:'R01',structure:'S04',wall:'rubble',roofMaterial:'slate',pitch:'mid',palette:'P03',foundation:'F2',eaves:'normal',window:'W1',entrance:'E1',ornaments:[],storeys:1};
const birth=(ref,use='house')=>({status:'ok',ref,source:{kind:'built',year:5},use,traditionSite:'river-bank',features:house,adjustments:[],substitutions:[]});
const ctx=()=>{const calls=[];return {calls,fillStyle:'',fillRect(...a){calls.push([this.fillStyle,...a]);},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},save(){},restore(){}};};
const pixels=calls=>{const m=new Map();for(const [c,x,y,w,h] of calls)for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)m.set(i+','+j,c);return m;};
const B=(year,kind,id,condition)=>({year,building:{id,kind,condition}});
const H=(year,seq,blockId,use,condition)=>({year,seq,blockId,after:{use,condition}});
const STATE={housing:{events:[H(10,0,'b1','occupied','sound'),H(100,0,'b1','vacant','sound'),H(130,0,'b1','vacant','ruined'),H(300,0,'b1','vacant','sound'),H(320,0,'b1','occupied','sound')]},
 observation:{sites:[{buildingChanges:[B(5,'house','f1','intact'),B(8,'field','x','intact'),B(50,'house','f1','damaged'),B(60,'house','f1','intact'),B(120,'house','f1','ruined'),B(400,'house','f1','intact')]}]}};
const truncated=y=>({housing:{events:STATE.housing.events.filter(e=>e.year<=y)},observation:{sites:[{buildingChanges:STATE.observation.sites[0].buildingChanges.filter(c=>c.year<=y)}]}});
const fo=(condition)=>({id:'f1',kind:'house',x:50,y:60,builtYear:5,condition});
const plot={x:41,y:57,width:18,depth:7};
const part=(condition,use)=>({partId:'b1:0',blockId:'b1',x:100,y:150,depth:'near',styleId:'low',variant:0,representedUnits:1,condition,use});
const conditionAt=y=>y<120||y>=400?'intact':'ruined';

test('D2: timelines come from housing events and building changes; clocks read only the changes up to the year',()=>{
 const t=ruinTimelines(STATE);
 assert.deepEqual(t.facilities.get('f1').map(c=>[c.year,c.condition]),[[5,'intact'],[50,'damaged'],[60,'intact'],[120,'ruined'],[400,'intact']]);
 assert.equal(t.facilities.has('x'),false,'fields are not weathered');
 assert.deepEqual(ruinClocksAt(t.facilities.get('f1'),119,'facility'),{abandonedYears:null,ruinedYears:null});
 assert.deepEqual(ruinClocksAt(t.facilities.get('f1'),150,'facility'),{abandonedYears:30,ruinedYears:30});
 assert.deepEqual(ruinClocksAt(t.housing.get('b1'),110,'housing'),{abandonedYears:10,ruinedYears:null});
 assert.deepEqual(ruinClocksAt(t.housing.get('b1'),200,'housing'),{abandonedYears:100,ruinedYears:70});
 assert.deepEqual(ruinClocksAt(t.housing.get('b1'),310,'housing'),{abandonedYears:10,ruinedYears:null},'a repaired ruin weathers anew');
 assert.deepEqual(ruinClocksAt(t.housing.get('b1'),330,'housing'),{abandonedYears:null,ruinedYears:null});
 for(const y of [0,99,100,129,130,200,299,300,319,320,399,400,500])for(const [kind,key] of [['housing','b1'],['facility','f1']]){
  const full=ruinTimelines(STATE)[kind==='housing'?'housing':'facilities'].get(key),cut=ruinTimelines(truncated(y))[kind==='housing'?'housing':'facilities'].get(key);
  assert.deepEqual(ruinClocksAt(full,y,kind),ruinClocksAt(cut,y,kind),`${kind} ${y}: a later change altered an earlier year`);
 }
 assert.throws(()=>ruinTimelines({housing:{events:[H(1,0,'b','abandoned','sound')]}}));
 assert.throws(()=>ruinTimelines({observation:{sites:[{buildingChanges:[B(1,'house','f','gone')]}]}}));
});

test('D2: the painter draws buildings in use exactly as before and weathers vacant and ruined ones by their clocks',()=>{
 const context=ruinContextOf(STATE,CLIMATE,GROUND),painter=createArchitecturePainter([birth({kind:'facility',siteId:'river-bank',id:'f1'}),birth({kind:'housing',siteId:'river-bank',blockId:'b1',parts:{from:0,to:1}})],context);
 const facility=y=>{const c=ctx();painter.facility(c,fo(conditionAt(y)),plot,y);return c.calls;};
 const plain=ctx();drawArchitecture({rect(x,y,w,h,col){plain.fillStyle=col;plain.fillRect(x,y,w,h);}},{use:'house',...house},50,60);
 assert.deepEqual(facility(100),plain.calls,'in use: unchanged');
 // ruined: the D1a drawing with the clocks of the history
 const expect=y=>{const c=ctx();drawWeatheredArchitecture({rect(x,yy,w,h,col){c.fillStyle=col;c.fillRect(x,yy,w,h);}},'f1',t=>drawArchitecture(t,{use:'house',...house},50,60),ruinAppearanceOf({...house},ruinClocksAt(context.timelines.facilities.get('f1'),y,'facility'),context.climate),context.look);return c.calls;};
 for(const y of [120,150,250,399])assert.deepEqual(facility(y),expect(y),'ruin '+y);
 const top=calls=>Math.min(...calls.map(c=>c[2]));
 assert.ok(top(facility(120))<top(facility(399)),'a fresh ruin stands taller than an old one');
 assert.deepEqual(facility(400),plain.calls,'reused: the standing building again');
 // housing part: vacant (weathered, not fallen), ruined, in use
 const roof=(y,condition,use)=>{const c=ctx();painter.residentialRoofs(c,{year:y,residentialBlocks:[{blockId:'b1',roofParts:[part(condition,use)]}]},'near');return c.calls;};
 const mini=ctx();drawMiniature({rect(x,y,w,h,col){mini.fillStyle=col;mini.fillRect(x,y,w,h);}},{use:'house',...house},100,150,'near');
 assert.deepEqual(roof(50,'sound','occupied'),mini.calls);assert.deepEqual(roof(330,'sound','occupied'),mini.calls);
 const vacant=pixels(roof(125,'sound','vacant')),standing=pixels(mini.calls);
 assert.notDeepEqual([...vacant],[...standing],'a vacant house fades');
 assert.ok([...standing.keys()].every(k=>vacant.has(k)),'a vacant house loses no wall or roof pixel');
 assert.ok(top(roof(200,'ruined','vacant'))>top(mini.calls),'a ruin has lost its roof');
});

test('D2: the cache never changes a drawing, past years stay as they were, and a ruin with no record is the settled outline',()=>{
 const make=s=>createArchitecturePainter([birth({kind:'facility',siteId:'river-bank',id:'f1'})],ruinContextOf(s,CLIMATE,GROUND));
 const draw=(p,y)=>{const c=ctx();p.facility(c,fo(conditionAt(y)),plot,y);return JSON.stringify(c.calls);};
 const p=make(STATE),years=[150,250,150,399,150];
 const first=years.map(y=>draw(p,y)),fresh=years.map(y=>draw(make(STATE),y));
 assert.deepEqual(first,fresh,'cached and uncached draws agree');
 for(const y of [150,250,399])assert.equal(draw(p,y),draw(make(truncated(y)),y),'observing later years does not change '+y);
 // no recorded change: settled outline, no cover, age not guessed
 const none=make({}),c=ctx();none.facility(c,fo('ruined'),plot,9999);
 const climate=ruinClimateOf(CLIMATE),e=ctx();
 drawWeatheredArchitecture({rect(x,y,w,h,col){e.fillStyle=col;e.fillRect(x,y,w,h);}},'f1',t=>drawArchitecture(t,{use:'house',...house},50,60),settledRuinAppearance({...house},climate),ruinLookOf(climate,GROUND));
 assert.deepEqual(c.calls,e.calls);
});

test('D2: drawing a real world with the live painter is deterministic and leaves the world unchanged',async()=>{
 const world=await P.advanceArchitectureWorld((await createNewArchitectureWorld(6)).architecture,1400,'automatic');
 const before=JSON.stringify(await P.prepareArchitectureSave(world));
 const {worldStructurePainter,architectureProductionSession,worldRuinContext}=await import('../dist/story/world-session.js');
 const painter=worldStructurePainter(architectureProductionSession(world)),again=createArchitecturePainter(world.architecture.births,worldRuinContext(world));
 const state=world.terrain.review.state,t=ruinTimelines(state);
 const ruined=[...t.facilities].filter(([,l])=>l.some(c=>c.condition==='ruined')).slice(0,4);
 assert.ok(ruined.length>0,'the world has ruins by year 1400');
 let weathered=0;
 for(const [id,l] of ruined){
  const r=l.find(c=>c.condition==='ruined').year,birthOf=world.architecture.births.find(b=>b.ref.kind==='facility'&&b.ref.id===id);if(!birthOf)continue;
  for(const y of [r,r+30,Math.min(1400,r+150)]){
   const condition=[...l].reverse().find(c=>c.year<=y).condition,o={id,kind:'house',x:60,y:120,builtYear:0,condition};
   const a=ctx(),b=ctx();painter.facility(a,o,{x:51,y:117,width:18,depth:7},y);again.facility(b,o,{x:51,y:117,width:18,depth:7},y);
   assert.deepEqual(a.calls,b.calls);if(condition==='ruined')weathered++;
  }
 }
 assert.ok(weathered>0);
 assert.equal(JSON.stringify(await P.prepareArchitectureSave(world)),before,'drawing changed nothing in the world');
});
