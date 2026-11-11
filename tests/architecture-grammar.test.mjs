/** Issue #35 D2-a: world grammar, regional traditions, birth styles, use rules and envelope fallback. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import * as G from '../dist/architecture/grammar-v1.js';
import * as V from '../dist/architecture/vocab-v1.js';
import {measureSiteAdaptation,measurePlotAdaptation} from '../dist/architecture/adaptation-v1.js';
import {measureArchitecture} from '../dist/architecture/draw-v1.js';
import * as S from '../scripts/lib/architecture-samples.mjs';

const sites=['river-bank','hill-side','coast-inlet'];
const flat={slope:100,water:100,rock:0,forest:500};
const wet={slope:50,water:900,rock:0,forest:500};
const rocky={slope:900,water:0,rock:900,forest:100};
const plot={grade:0,nearWater:false};
/** Explicit always-true fit: audits and unit tests only. Production must pass the real air-space test. */
const anyFit=()=>true;
const refFor=(use,siteId,id)=>['rowhouse','courtyard'].includes(use)?{kind:'housing',siteId,blockId:id,parts:{from:0,to:3}}:{kind:'facility',siteId,id};
const birth=(grammar,tradition,use,id='b-1',year=10,extra={})=>G.deriveBirthStyle({grammar,tradition,use,plot,
 ref:refFor(use,tradition.siteId,id),source:{kind:'built',year},...extra},anyFit);

test('D2-a: 同じseedなら文法・伝統・建設時様式は完全に一致し、別のseedでは異なる',()=>{
 const a=G.createWorldGrammar(42),b=G.createWorldGrammar(42);
 assert.deepEqual(a,b);
 const ta=G.createRegionalTradition(a,'river-bank',flat),tb=G.createRegionalTradition(b,'river-bank',flat);
 assert.deepEqual(ta,tb);
 assert.deepEqual(birth(a,ta,'house'),birth(b,tb,'house'));
 const distinct=new Set(Array.from({length:40},(_,s)=>JSON.stringify(G.createWorldGrammar(s+1).shared)));
 assert.ok(distinct.size>20,'grammar barely depends on the seed: '+distinct.size);
});

test('D2-a: D2の文化は高度技術を選ばず、全ての建設時様式が制約を満たす',()=>{
 for(let seed=1;seed<=60;seed++){
  const g=G.createWorldGrammar(seed);
  for(const [i,site] of sites.entries()){
   const t=G.createRegionalTradition(g,site,[flat,wet,rocky][i]);
   for(const use of Object.keys(V.uses)){
    const r=birth(g,t,use,'b-'+use,seed);
    assert.equal(r.status,'ok',JSON.stringify(r));
    const spec={use,...r.features};
    assert.deepEqual(V.d2Inconsistencies(spec),[],`${seed} ${site} ${use}`);
    assert.doesNotThrow(()=>V.normalizeSpec(spec));
    assert.match(r.features.structure,/^S0[1-7]$/);
    assert.ok(!['metal','composite'].includes(r.features.wall)&&!['metal','glazed'].includes(r.features.roofMaterial));
    assert.ok(r.features.window!=='W7'&&r.features.foundation!=='F6');
    assert.ok(r.features.storeys===1||use==='hall','two storeys only for halls');
    assert.ok(!('roof' in r.features)&&r.features.roofFamily!=='R07','normal form only');
   }
  }
 }
});

test('D2-a/A02: 屋根と装飾は3地区で共通、配色は地区ごとに決まる',()=>{
 let paletteDiffers=0;
 for(let seed=1;seed<=60;seed++){
  const g=G.createWorldGrammar(seed),ts=sites.map((s,i)=>G.createRegionalTradition(g,s,[flat,wet,rocky][i]));
  const houses=ts.map(t=>birth(g,t,'house','same-id',100));
  for(const h of houses){assert.equal(h.features.roofFamily===g.shared.roofFamily||h.substitutions.some(s=>s.axis==='roofFamily'),true);}
  if(new Set(ts.map(t=>t.choices.palette)).size>1)paletteDiffers++;
 }
 assert.ok(paletteDiffers>0,'palette never differs between sites');
});

test('D2-a: 地域適応は決定ではなく重み。水の多い地区ほど高床・木杭が増える',()=>{
 const count=(inputs,pred)=>{let n=0;for(let seed=1;seed<=300;seed++){const t=G.createRegionalTradition(G.createWorldGrammar(seed),'river-bank',inputs);if(pred(t.choices))n++;}return n;};
 const raised=c=>c.structure==='S07'||['F3','F5'].includes(c.foundation);
 const wetRaised=count(wet,raised),dryRaised=count({...wet,water:0},raised);
 assert.ok(wetRaised>dryRaised,`wet ${wetRaised} vs dry ${dryRaised}`);
 assert.ok(wetRaised<300,'water must not force raised floors everywhere');
 const stone=c=>['S04','S05'].includes(c.structure);
 assert.ok(count(rocky,stone)>count({...rocky,rock:0,slope:0},stone));
});

test('D2-a: 入力を書き換えず、範囲外の適応入力は拒否する',()=>{
 const g=Object.freeze(G.createWorldGrammar(7)),inputs=Object.freeze({...flat});
 const t=G.createRegionalTradition(g,'hill-side',inputs);
 assert.throws(()=>G.createRegionalTradition(g,'hill-side',{...flat,water:1001}),/per-mille/);
 assert.throws(()=>G.createRegionalTradition(g,'hill-side',{...flat,slope:.5}),/per-mille/);
 assert.throws(()=>birth(g,t,'house','x',-1),/birth year/);
 assert.throws(()=>G.deriveBirthStyle({grammar:g,tradition:t,use:'house',plot,ref:{kind:'facility',siteId:'river-bank',id:'x'},source:{kind:'built',year:1}},anyFit),/another site/);
});

test('D2-a/§3.4.1: 住宅の部品範囲と出典イベントごとに様式が決まり、同じ鍵なら一致する',()=>{
 const g=G.createWorldGrammar(11),t=G.createRegionalTradition(g,'coast-inlet',flat);
 const housing=(from,to,kind,year,seq)=>G.deriveBirthStyle({grammar:g,tradition:t,use:'rowhouse',plot,
  ref:{kind:'housing',siteId:'coast-inlet',blockId:'blk-1',parts:{from,to}},source:{kind,year,seq}},anyFit);
 assert.deepEqual(housing(0,3,'built',40,0),housing(0,3,'built',40,0));
 const seen=new Set();for(let y=41;y<120;y++)seen.add(JSON.stringify(housing(3,5,'expanded',y,0).features));
 assert.ok(seen.size>1,'expansions never vary individually');
});

test('D2-a/§6.2: 上空に収まらない場合は決まった順で代替し、最後でも収まらなければHOLD',()=>{
 let found=0;
 for(let seed=1;seed<=200&&found<5;seed++){
  const g=G.createWorldGrammar(seed);if(g.shared.eaves!=='deep')continue;
  const t=G.createRegionalTradition(g,'river-bank',flat),free=birth(g,t,'house','e',5);
  if(free.status!=='ok'||free.features.eaves!=='deep')continue;
  const width=free.envelope.left+free.envelope.right;
  const r=birth(g,t,'house','e',5);
  const narrow=G.deriveBirthStyle({grammar:g,tradition:t,use:'house',plot,ref:{kind:'facility',siteId:'river-bank',id:'e'},source:{kind:'built',year:5}},e=>e.left+e.right<width);
  // When something other than the roof sets the width (e.g. an E6 courtyard wall), no stage narrows it: HOLD is correct.
  if(narrow.status==='hold'){assert.equal(narrow.reason,'envelope');continue;}
  assert.ok(narrow.envelopeStage>=2,'deep eaves dropped first');
  found++;
  assert.equal(narrow.substitutions.find(s=>s.reason==='envelope').axis,'eaves');
  assert.equal(narrow.features.eaves,'normal');
  assert.ok(narrow.features.entrance!=='E3','deep-eave entrance is replaced with the eaves');
  assert.deepEqual(V.d2Inconsistencies({use:'house',...narrow.features}),[]);
  assert.ok(narrow.envelope.left+narrow.envelope.right<width);
  assert.deepEqual(r,free,'the predicate does not leak into unconstrained births');
  const hold=G.deriveBirthStyle({grammar:g,tradition:t,use:'house',plot,ref:{kind:'facility',siteId:'river-bank',id:'e'},source:{kind:'built',year:5}},()=>false);
  assert.equal(hold.status,'hold');assert.equal(hold.reason,'envelope');
 }
 assert.ok(found>0,'no deep-eaves world found to exercise the chain');
});

test('D2-a: 敷地の傾斜・水際は建設年の敷地の観測から基礎を調整する',()=>{
 for(let seed=1;seed<=200;seed++){
  const g=G.createWorldGrammar(seed),t=G.createRegionalTradition(g,'hill-side',flat);
  if(t.choices.foundation!=='F1')continue;
  const steep=G.deriveBirthStyle({grammar:g,tradition:t,use:'house',plot:{grade:800,nearWater:false},ref:{kind:'facility',siteId:'hill-side',id:'p'},source:{kind:'built',year:3}},anyFit);
  assert.equal(steep.features.foundation,'F4');assert.ok(steep.adjustments.includes('plot:slope'));
  return;
 }
 assert.fail('no F1 tradition found');
});

test('D2-a: 用途の規則はD1の汎用規則（市場・穀物庫）を全文化で再現する',()=>{
 for(const key of Object.keys(S.cultures)){
  const base=S.toNormalForm({...S.cultures[key].base,use:'house'});
  for(const use of ['market','granary']){
   if(S.cultures[key].per[use])continue;
   const ruled=G.applyUseRules({...base,use}).spec,d1=S.toNormalForm(S.cultureSpec(key,use));
   for(const axis of ['entrance','window'])assert.equal(ruled[axis]??'W1',d1[axis]??'W1',`${key} ${use} ${axis}`);
  }
 }
});

test('D2-a: 地区と敷地の観測は記録された地形・植生だけから整数で測る',()=>{
 const n=320*180,raster={surface:new Uint8Array(n),grade:new Uint8Array(n),bearing:new Uint8Array(n),elevation:new Uint8Array(n)};
 for(let i=96*320;i<n;i++){raster.surface[i]=1;raster.grade[i]=1;}
 for(let i=170*320;i<n;i++)raster.surface[i]=2;
 const m=measureSiteAdaptation(raster,[[200,1,4],[10,2,4],null]);
 assert.deepEqual(m,{slope:500,water:Math.round(1000*10*320/(84*320)),rock:0,forest:500});
 assert.deepEqual(measurePlotAdaptation(raster,{x:10,y:162,width:10,depth:6}),{grade:500,nearWater:true});
 assert.deepEqual(measurePlotAdaptation(raster,{x:10,y:110,width:10,depth:6}),{grade:500,nearWater:false});
});

test('D2-a: 文明の乱数・時刻・本編の年次処理を読まない',async()=>{
 for(const f of await readdir('src/architecture')){
  const text=await readFile('src/architecture/'+f,'utf8');
  // The culture modules stay strict. production-v1 (D2-b1) may read the owned v8 production world
  // and its terrain-at-year, but never the civilization RNG or the annual engine directly.
  // scene-v1 (D2-c, review only) paints into the live scene: it may read the live scene drawing only.
  const allowed=f==='scene-v1.ts'?/^\.\/|^\.\.\/scene\/(draw|draw-generated-review)\.js$/
   :f==='airspace-v1.ts'?/^\.\/|^\.\.\/scene\/composition\.js$|^\.\.\/terrain\/terrain-record-raster-v1\.js$/
   :f==='production-v1.ts'
   ?/^\.\/|^\.\.\/terrain\/(terrain-production-(types-v1|wire-v1|owned-internal|progression-v1|storage-v1|history-v1|contract-v1)|terrain-revision-v1|owned-record-physics)\.js$|^\.\.\/story\/housing-history\.js$/
   :/^\.\/|^\.\.\/terrain\/(terrain-hash-v1|terrain-record-raster-v1)\.js$|^\.\.\/vegetation\/history-v1\.js$/;
  for(const m of text.matchAll(/from\s+'([^']+)'/g))assert.ok(allowed.test(m[1]),f+' imports '+m[1]);
  assert.ok(!/engine\/rng|story\/engine/.test(text),f+' touches the civilization RNG or engine');
  assert.ok(!/Math\.random|Date\.now|performance\.now/.test(text),f);
 }
});

test('D2-a: 輪郭の計測は描画と同じ経路で、深い軒は張り出しを広げる',()=>{
 const a=measureArchitecture({use:'house',roofFamily:'R01',structure:'S01'}),b=measureArchitecture({use:'house',roofFamily:'R01',eaves:'deep',structure:'S01'});
 assert.ok(b.left>a.left&&b.right>a.right);
 assert.ok(a.top>0&&a.left>0&&a.right>0);
});

test('D2-a/§5.2: 建設時様式の入口で、履歴なしに分かる参照と出典の矛盾を拒否する',()=>{
 const g=G.createWorldGrammar(5),t=G.createRegionalTradition(g,'river-bank',flat);
 const call=(ref,source,use='house',p=plot)=>()=>G.deriveBirthStyle({grammar:g,tradition:t,use,plot:p,ref,source},anyFit);
 const fac={kind:'facility',siteId:'river-bank',id:'f'},blk=parts=>({kind:'housing',siteId:'river-bank',blockId:'b',parts});
 assert.throws(call(fac,{kind:'expanded',year:10}),/facility birth must come from its built source/);
 assert.throws(call(fac,{kind:'built',year:10},'rowhouse'),/not a facility use/);
 assert.throws(call({...fac,civic:{style:'great-hall',constructionRecordId:'r'}},{kind:'built',year:1},'house'),/civic attribute only on halls/);
 assert.throws(call({...fac,civic:{style:'castle',constructionRecordId:'r'}},{kind:'built',year:1},'hall'),/invalid civic/);
 assert.throws(call({...fac,id:''},{kind:'built',year:1}),/facility id required/);
 assert.throws(call(blk({from:5,to:2}),{kind:'expanded',year:10},'rowhouse'),/0 <= from < to/);
 assert.throws(call(blk({from:-1,to:2}),{kind:'built',year:10},'rowhouse'),/0 <= from < to/);
 assert.throws(call(blk({from:0,to:1.5}),{kind:'built',year:10},'rowhouse'),/0 <= from < to/);
 assert.throws(call(blk({from:2,to:4}),{kind:'built',year:10},'rowhouse'),/starts at part 0/);
 assert.throws(call(blk({from:0,to:4}),{kind:'expanded',year:10},'rowhouse'),/after existing ones/);
 assert.throws(call(blk({from:0,to:3}),{kind:'built',year:10},'hall'),/not a housing use/);
 assert.throws(call(blk({from:0,to:3}),{kind:'damaged',year:10},'rowhouse'),/unknown housing source/);
 assert.throws(call(fac,{kind:'built',year:10,seq:-1}),/invalid source seq/);
 assert.throws(call(fac,{kind:'built',year:10},'house',{grade:1200,nearWater:false}),/invalid plot/);
 assert.throws(call({kind:'tower',siteId:'river-bank',id:'x'},{kind:'built',year:1}),/unknown building reference/);
 assert.equal(call(blk({from:0,to:3}),{kind:'built',year:10},'courtyard')().status,'ok');
 assert.equal(call({...fac,civic:{style:'courtyard-hall',constructionRecordId:'r-1'}},{kind:'built',year:1},'hall')().status,'ok');
});

test('D2-a/§6.2: 上空の判定は省略できない',()=>{
 const g=G.createWorldGrammar(5),t=G.createRegionalTradition(g,'river-bank',flat);
 assert.throws(()=>G.deriveBirthStyle({grammar:g,tradition:t,use:'house',plot,ref:{kind:'facility',siteId:'river-bank',id:'f'},source:{kind:'built',year:1}}),/fit test is required/);
});

test('D2-a/§3.2: D2の制約は高度技術の部材を単体でも拒否する',()=>{
 for(const bad of [{foundation:'F6'},{wall:'metal'},{wall:'composite'},{roofMaterial:'metal'},{roofMaterial:'glazed'},{window:'W7'},{structure:'X2'}])
  assert.ok(V.d2Inconsistencies({use:'hall',...bad}).length>0,JSON.stringify(bad));
 assert.deepEqual(V.d2Inconsistencies({use:'hall',structure:'S05',foundation:'F2'}),[]);
 assert.ok(V.d2Inconsistencies({use:'hall',structure:'S05',foundation:'F6'}).length>0);
});

test('D2-a/A02（案2）: 地形の値は固定した全世界の分布の中での位置に直す。下限の同値は0に留まる',async()=>{
 const {sitePercentiles}=await import('../dist/architecture/adaptation-v1.js');
 const {adaptationReference,ADAPTATION_REFERENCE_ID}=await import('../dist/architecture/adaptation-reference-v1.js');
 assert.equal(G.architecturePolicy.adaptationReference,ADAPTATION_REFERENCE_ID);
 for(const k of ['slope','water','rock','forest']){
  const q=adaptationReference[k];assert.equal(q.length,101);
  for(let i=1;i<q.length;i++)assert.ok(q[i]>=q[i-1],k+' quantiles must be sorted');
  assert.ok(Object.isFrozen(q));
 }
 const none=sitePercentiles({slope:0,water:0,rock:0,forest:0});
 assert.deepEqual(none,{slope:0,water:0,rock:0,forest:0});
 const top=sitePercentiles({slope:1000,water:1000,rock:1000,forest:1000});
 for(const v of Object.values(top))assert.ok(v>900);
 const t=G.createRegionalTradition(G.createWorldGrammar(3),'river-bank',{slope:0,water:133,rock:0,forest:200});
 assert.deepEqual(t.percentiles,sitePercentiles(t.inputs));
});

test('D2-a/A02（案3）: 同じ地形の値でも地区の種類が傾向を変える（決定はしない）',()=>{
 const same={slope:100,water:100,rock:0,forest:200};
 const share=(site,pred)=>{let n=0;for(let seed=1;seed<=300;seed++)if(pred(G.createRegionalTradition(G.createWorldGrammar(seed),site,same).choices))n++;return n;};
 const stone=c=>['S04','S05'].includes(c.structure);
 const hill=share('hill-side',stone),river=share('river-bank',stone);
 assert.ok(hill>river,`stone on hills ${hill} vs river ${river}`);
 assert.ok(hill<300&&river>0,'site kind shifts odds but never decides');
});

test("D2-c'/段階4: 山形の屋根は寄棟、段状・寄棟・片流れは平屋根へ下げる（元の系統に近い低い屋根）",()=>{
 const expect={R01:'R03',R02:'R03',R08:'R03',R03:'R05',R04:'R05',R06:'R05'};
 const seen=new Set();
 for(let seed=1;seed<=400&&seen.size<6;seed++){
  const g=G.createWorldGrammar(seed),from=g.shared.roofFamily;if(from==='R05'||seen.has(from))continue;
  const t=G.createRegionalTradition(g,'river-bank',flat);
  // measure returns the candidate spec itself; only the stage-4 roof (or later) fits
  const r=G.deriveBirthStyle({grammar:g,tradition:t,use:'house',plot,ref:{kind:'facility',siteId:'river-bank',id:'s4'},source:{kind:'built',year:3}},
   spec=>spec.roofFamily===expect[from]&&spec.pitch==='low',spec=>({...spec}));
  if(r.status!=='ok')continue;
  seen.add(from);
  assert.equal(r.features.roofFamily,expect[from],from);
  // a peaked roof keeps a peaked outline (hip) instead of falling to flat at the last stage
  if(expect[from]==='R03')assert.ok(r.envelopeStage<=4,'peaked roofs stop at the hip roof');
 }
 assert.ok(seen.size>=4,'covered roof families: '+[...seen]);
 assert.equal(G.architecturePolicy.envelope,'architecture-envelope-v2');
});
