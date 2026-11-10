/**
 * Issue #35 D2-a audit: initial-value distributions over real generated worlds.
 * Measures year-0 site inputs from the recorded terrain and initial vegetation, then builds the world
 * grammar and three regional traditions. It does not advance history, save, or draw the live scene.
 *   npm run build && node scripts/audit-architecture-d2a.mjs [seeds=200]  →  artifacts/architecture35-d2a/audit.json
 * The numbers are mechanical evidence for review, not a visual or design acceptance.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {captureRiverReaches} from '../dist/terrain/river-reaches-review.js';
import {createGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {createInitialVegetation} from '../dist/vegetation/initial-v1.js';
import {readOwnedRecordPhysics} from '../dist/terrain/owned-record-physics.js';
import {measureSiteAdaptation} from '../dist/architecture/adaptation-v1.js';
import * as G from '../dist/architecture/grammar-v1.js';
import * as V from '../dist/architecture/vocab-v1.js';
import * as S from './lib/architecture-samples.mjs';

const count=Number(process.argv[2]??200);
if(!Number.isSafeInteger(count)||count<1)throw Error('seed count');
const sites=['river-bank','hill-side','coast-inlet'],uses=Object.keys(V.uses),inputKeys=['slope','water','rock','forest'];
const regionalAxes=['structure','wall','foundation','roofMaterial','window','entrance'];
const tally=()=>({}),bump=(t,k)=>{t[k]=(t[k]??0)+1;};
const stats=xs=>{const s=[...xs].sort((a,b)=>a-b);return {min:s[0],p10:s[Math.floor(s.length*.1)],median:s[Math.floor(s.length/2)],p90:s[Math.floor(s.length*.9)],max:s[s.length-1]};};

const inputsBySite=Object.fromEntries(sites.map(s=>[s,Object.fromEntries(inputKeys.map(k=>[k,[]]))]));
const spread=Object.fromEntries(inputKeys.map(k=>[k,[]]));
const choices=Object.fromEntries(regionalAxes.concat('palette').map(a=>[a,Object.fromEntries(sites.map(s=>[s,tally()]))]));
const shared={roofFamily:tally(),eaves:tally(),pitch:tally(),ornamentCount:tally()};
// Conditional distributions (PR #113 review): terrain condition → choice tendency, not just "sites differ".
const traits={
 raised:c=>c.structure==='S07'||['F3','F5'].includes(c.foundation),
 stone:c=>['S04','S05'].includes(c.structure)||['rubble','ashlar'].includes(c.wall),
 timber:c=>['S01','S02'].includes(c.structure)||['log','plank'].includes(c.wall),
 terraced:c=>['F2','F4'].includes(c.foundation),
};
const driver={raised:'water',stone:'slope',timber:'forest',terraced:'slope'};
const conditional=Object.fromEntries(Object.keys(traits).map(k=>[k,{bySite:Object.fromEntries(sites.map(s=>[s,[0,0]])),byDriver:{low:[0,0],mid:[0,0],high:[0,0]}}]));
const tercile=p=>p<334?'low':p<667?'mid':'high';
const pairDifferences=[],identicalWorlds=[],births={total:0,hold:0,constraintSubstitutions:tally(),envelopeStage:tally(),adjustments:tally()};
let skipped=0;
const started=Date.now();
for(let seed=1,used=0;used<count;seed++){
 const result=generateWorldPrototype(seed);if(result.status!=='ok'){skipped++;continue;}
 const terrain=captureTerrainRecord(result.world,'world-terrain-v1');
 const review=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'field-only','organic-v3');
 if(review.status!=='review-only'){skipped++;continue;}
 used++;
 const vegetation=createInitialVegetation(review.review),grammar=G.createWorldGrammar(seed);
 bump(shared.roofFamily,grammar.shared.roofFamily);bump(shared.eaves,grammar.shared.eaves);bump(shared.pitch,grammar.shared.pitch);bump(shared.ornamentCount,grammar.shared.ornaments.length);
 const traditions=sites.map(site=>{
  const inputs=measureSiteAdaptation(readOwnedRecordPhysics(terrain.sites[site].physics),vegetation.initial[site]);
  for(const k of inputKeys)inputsBySite[site][k].push(inputs[k]);
  const t=G.createRegionalTradition(grammar,site,inputs);
  for(const a of regionalAxes.concat('palette'))bump(choices[a][site],t.choices[a]);
  for(const [k,f] of Object.entries(traits)){const hit=f(t.choices)?1:0,c=conditional[k];c.bySite[site][0]+=hit;c.bySite[site][1]++;
   const b=c.byDriver[tercile(t.percentiles[driver[k]])];b[0]+=hit;b[1]++;}
  return t;
 });
 for(const k of inputKeys){const v=traditions.map(t=>t.inputs[k]);spread[k].push(Math.max(...v)-Math.min(...v));}
 const pairs=[[0,1],[0,2],[1,2]].map(([a,b])=>regionalAxes.filter(x=>traditions[a].choices[x]!==traditions[b].choices[x]).length);
 pairDifferences.push(...pairs);
 if(pairs.some(n=>n===0))identicalWorlds.push(seed);
 for(const t of traditions)for(const use of uses){
  const ref=['rowhouse','courtyard'].includes(use)?{kind:'housing',siteId:t.siteId,blockId:'audit-'+use,parts:{from:0,to:3}}:{kind:'facility',siteId:t.siteId,id:'audit-'+use};
  // Explicit always-true air-space test: D2-a has no neighbours yet, so every birth stays at envelope stage 1.
  const r=G.deriveBirthStyle({grammar,tradition:t,use,plot:{grade:0,nearWater:false},ref,source:{kind:'built',year:0}},()=>true);
  births.total++;if(r.status!=='ok'){births.hold++;continue;}
  bump(births.envelopeStage,r.envelopeStage);
  for(const s of r.substitutions)bump(births.constraintSubstitutions,s.axis+':'+s.from+'→'+s.to);
  for(const a of r.adjustments)bump(births.adjustments,a);
 }
}

// D1 hand overrides vs the generated use rules (design §3.4: can the rules reproduce C1–C6?)
const reproduction={};
for(const key of Object.keys(S.cultures)){
 reproduction[key]={};
 for(const use of uses){
  const base=V.normalizeSpec(S.toNormalForm({...S.cultures[key].base,use}));
  const ruled=V.normalizeSpec(G.applyUseRules(base).spec),d1=V.normalizeSpec(S.toNormalForm(S.cultureSpec(key,use)));
  const a=V.formAxes(ruled),b=V.formAxes(d1),mismatch=Object.keys(a).filter(k=>a[k]!==b[k]);
  reproduction[key][use]=mismatch.length?Object.fromEntries(mismatch.map(k=>[k,{rule:a[k],d1:b[k]}])):'match';
 }
}
const cells=Object.values(reproduction).flatMap(o=>Object.values(o));
const report={status:'D2A_AUDIT_NOT_ACCEPTANCE',issue:35,stage:'D2-a',policy:G.architecturePolicy,
 sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',worlds:count,skippedSeeds:skipped,seconds:Math.round((Date.now()-started)/1000),
 siteInputsPermille:Object.fromEntries(sites.map(s=>[s,Object.fromEntries(inputKeys.map(k=>[k,stats(inputsBySite[s][k])]))])),
 betweenSiteSpreadPermille:Object.fromEntries(inputKeys.map(k=>[k,stats(spread[k])])),
 sharedChoices:shared,traditionChoices:choices,
 regionalFormAxesDifferingPerSitePair:{...stats(pairDifferences),histogram:pairDifferences.reduce((t,n)=>(bump(t,n),t),{})},
 worldsWithAnIdenticalSitePair:identicalWorlds.length,
 conditionalShares:Object.fromEntries(Object.entries(conditional).map(([k,c])=>[k,{driver:driver[k],
  bySite:Object.fromEntries(Object.entries(c.bySite).map(([s,[h,n]])=>[s,{share:n?Math.round(1000*h/n):null,n}])),
  byDriverTercile:Object.fromEntries(Object.entries(c.byDriver).map(([s,[h,n]])=>[s,{share:n?Math.round(1000*h/n):null,n}]))}])),
 births,
 d1Reproduction:{matchingCells:cells.filter(c=>c==='match').length,totalCells:cells.length,detail:reproduction},
};
await mkdir('artifacts/architecture35-d2a',{recursive:true});
await writeFile('artifacts/architecture35-d2a/audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({type:'architecture35-d2a-audit',worlds:count,skipped,seconds:report.seconds,
 pairDiff:report.regionalFormAxesDifferingPerSitePair,identicalPairWorlds:identicalWorlds.length,
 births:{total:births.total,hold:births.hold},d1Reproduction:`${report.d1Reproduction.matchingCells}/${cells.length}`,
 conditional:Object.fromEntries(Object.entries(report.conditionalShares).map(([k,v])=>[k,{site:Object.values(v.bySite).map(x=>x.share),driver:Object.values(v.byDriverTercile).map(x=>x.share+'/'+x.n)}]))}));
