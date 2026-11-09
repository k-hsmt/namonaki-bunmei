/** Recorded regional economics: pure proof shared by trial and production adapters. No ownership registration. */
import {wireObject,sameWire} from '../story/generated-state-review.js';
import {verifyRecordedEnvironmentInternal} from './production-history-v1.js';
import {canonicalWire} from './wire-v1.js';
import {economyEffectCalculator} from './economy-effect-core-v1.js';
import {irrigationSourcesFromWorld} from './sources-v1.js';
import {coupledAnnualModifier} from '../story/coupled-economy-policy-internal.js';
import {boundedRngDraws,mulberryOutputAt} from '../story/rng-phase-diagnostics.js';
import {decisionTemplatesV1} from '../story/decision-templates-v1.js';
import {regions} from '../story/population.js';
import {createRegionalEconomy,regionalHarvestFactors,updateRegionalEconomy} from '../story/regional-economy.js';
import {economicSourceCursorsInternal} from './economic-source-cursors-internal.js';
import type {GeneratedWorldSave} from '../story/world-save.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import type {IrrigationCoupledReview} from './coupled-types-v1.js';
export type RecordedEconomicHistory=Omit<IrrigationCoupledReview,'format'|'status'|'ruleId'|'world'|'origin'|'choiceProtocol'>&{readonly world:GeneratedBridgeReview;readonly choiceProtocol:'automatic-per-branch-v1'|'common-explicit-v1'|'production-mixed-v1'};
const nat=(n:unknown,max=10000):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=max;
const u32=(n:unknown):n is number=>nat(n,0xffffffff);
const compare=(a:unknown,b:unknown,message:string)=>{if(!sameWire(a,b))throw Error(message);};
async function drain<T>(task:Generator<void,T>):Promise<T>{let mark=performance.now();for(;;){const r=task.next();if(r.done)return r.value;if(performance.now()-mark>=8){await new Promise(r=>setTimeout(r,0));mark=performance.now();}}}
function normalized(e:{title:string;body:string;causes:readonly string[];relatedIds?:readonly string[]}){return {title:e.title,body:e.body,causes:e.causes,relatedIds:e.relatedIds??[]};}
function phaseProof(t:RecordedEconomicHistory,origin:GeneratedWorldSave){
 let confirmed=t.introducedYear,year=origin.state.year,pending=!!origin.state.pending,rng=origin.state.rngState,total=0,choiceCursor=origin.state.decisions.length,lastTemplate=origin.state.lastDecisionId,drought=origin.state.drought;
 const commitPhases=new Map<number,number>(),droughts=new Map<number,number>(),choices=t.world.review.state.history.filter(r=>r.tag==='選択');if(choices.length!==t.world.review.state.decisions.length)throw Error('Extra coupled choice record');
 for(const [i,p]of t.phases.entries()){
  wireObject(p,['phase','year','confirmedBefore','confirmedAfter','rngBefore','rngAfter','pending','draws','ecologyBefore','ecologyAfter'],['choice']);
  if(!['step','automatic-choice','manual-choice'].includes(p.phase)||typeof p.pending!=='boolean'||!u32(p.rngBefore)||!u32(p.rngAfter)||p.rngBefore!==rng||p.confirmedBefore!==confirmed||p.ecologyBefore!==confirmed)throw Error('Broken coupled phase chain');
  const limit=p.phase==='step'?64:p.phase==='automatic-choice'?1:0,draws=boundedRngDraws(p.rngBefore,p.rngAfter,limit);
  if(p.draws!==draws||(p.phase==='step'?draws<6:p.phase==='automatic-choice'?draws!==1:draws!==0))throw Error('Invalid coupled RNG count');total+=draws;if(total>1000000)throw Error('Coupled RNG budget');
  if(p.phase==='step'){if(pending||p.choice!==undefined||p.year!==year+1||p.year>10000)throw Error('Invalid coupled annual phase');
   const rain=(mulberryOutputAt((p.rngBefore+0x6d2b79f5)>>>0)+mulberryOutputAt((p.rngBefore+Math.imul(0x6d2b79f5,2))>>>0)+mulberryOutputAt((p.rngBefore+Math.imul(0x6d2b79f5,3))>>>0))/3;
   drought=rain<.29?drought+1:Math.max(0,drought-1);year++;pending=p.pending;if(!pending)confirmed++;
  }
  else {
   if(!pending||p.pending||p.year!==year||!p.choice||t.choiceProtocol==='automatic-per-branch-v1'&&p.phase!=='automatic-choice'||t.choiceProtocol==='common-explicit-v1'&&p.phase!=='manual-choice')throw Error('Invalid coupled choice phase');
   wireObject(p.choice,['index','fingerprint']);if(typeof p.choice.fingerprint!=='string'||!p.choice.fingerprint.startsWith('coupled-decision-template-v1/'))throw Error('Unknown choice binding');
   const content=wireObject(JSON.parse(p.choice.fingerprint.slice('coupled-decision-template-v1/'.length)),['template','year','id','question','options']),template=nat(content.template,decisionTemplatesV1.length-1)?decisionTemplatesV1[content.template]:undefined;
   if(!template||content.year!==year||content.id!=='choice-'+year||!nat(p.choice.index,template.options.length-1))throw Error('Invalid coupled decision template');
   compare({question:content.question,options:content.options},template,'Coupled decision content changed');
   if(p.choice.fingerprint!=='coupled-decision-template-v1/'+canonicalWire(content)||p.phase==='automatic-choice'&&p.choice.index!==Math.floor(mulberryOutputAt(p.rngAfter)*template.options.length))throw Error('Coupled choice binding or automatic result differs');
   const option=template.options[p.choice.index]!,decision=t.world.review.state.decisions[choiceCursor++],record=choices.find(r=>r.year===year);
   compare(decision,{year,label:option.label},'Coupled decision ledger differs');if(!record||record.title!==option.label||record.body!==option.consequence)throw Error('Missing coupled choice record');
   compare(record.causes,[p.phase==='automatic-choice'?'偶然に委ねられた選択':'観察者が選んだ一度きりの分岐'],'Choice source differs');pending=false;confirmed++;
   lastTemplate=Number(content.template);
  }
  if(p.confirmedAfter!==confirmed||p.ecologyAfter!==confirmed)throw Error('Coupled commit boundary differs');if(!p.pending){commitPhases.set(confirmed,i+1);droughts.set(confirmed,drought);}rng=p.rngAfter;
 }
 if(confirmed!==t.confirmedThrough||year!==t.world.review.state.year||pending!==!!t.world.review.state.pending||rng!==t.world.review.state.rngState||choiceCursor!==t.world.review.state.decisions.length)throw Error('Coupled current phase differs');
 const state=t.world.review.state;
 if(state.drought!==drought)throw Error('Coupled drought current differs from phase inputs');
 if(pending){const template=nat(state.lastDecisionId,decisionTemplatesV1.length-1)?decisionTemplatesV1[state.lastDecisionId]:undefined;if(!template||state.pending!.id!=='choice-'+year||state.pending!.year!==year)throw Error('Invalid pending template');compare({question:state.pending!.question,options:state.pending!.options},template,'Pending choice content differs');}else if(state.lastDecisionId!==lastTemplate)throw Error('Decision cursor differs');
 for(const key of ['name','homeland','trait','seed','version'] as const)compare(state[key],origin.state[key],'Immutable civilization origin changed');
 return {commitPhases,droughts};
}
export async function verifyRecordedEconomyInternal(t:RecordedEconomicHistory,origin:GeneratedWorldSave):Promise<void>{
 compare(t.initialEconomy,origin.state.economy??createRegionalEconomy(),'Coupled initial economy differs');
 for(const key of ['schemaVersion','ruleId','climateRule','climateStart','introducedYear','seed'] as const)compare(t.world.environment![key],origin.environment![key],'Coupled climate policy changed');
 for(const key of ['schemaVersion','ruleId','introducedYear','preIntroductionRendererId'] as const)compare(t.world.irrigation![key],origin.irrigation![key],'Coupled water policy changed');
 compare(t.world.environmentAppearance,origin.environmentAppearance,'Coupled renderer policy changed');
 const {commitPhases,droughts}=phaseProof(t,origin),world=t.world,source=irrigationSourcesFromWorld(world),records=new Map(t.world.review.state.history.map(r=>[r.id,r])),populations=new Map<number,number[]>(),granaries=new Int8Array(t.confirmedThrough+1),floods=new Map<number,string>();
 for(const block of world.review.state.observation!.blocks){let p=[...block.population];populations.set(block.year,p);for(const [i,d]of block.changes.entries()){p=p.map((n,j)=>n+d[j]!);populations.set(block.year+i+1,p);}}
 for(const [index,s]of world.review.state.observation!.sites!.entries()){let n=0,active=false;for(let y=2;y<=t.confirmedThrough;y++){while(n<s.practiceChanges.length&&s.practiceChanges[n]!.year<=y-1){active=s.practiceChanges[n++]!.practices.some(p=>p.kind==='granary'&&p.active);}if(active)granaries[y]!|=1<<index;}}if(t.confirmedThrough>=1)granaries[1]=-1;
 for(const r of records.values())if(r.kind==='flood')for(let y=r.year;y<=Math.min(t.confirmedThrough,r.year+2);y++)floods.set(y,r.id);
 let economy=structuredClone(t.initialEconomy),seen=0,prefixYear=-1,prefix:Parameters<NonNullable<Parameters<typeof verifyRecordedEnvironmentInternal>[1]>>[1],checkpoint=0;
 const requirePrefix=(year:number)=>{if(year!==prefixYear)throw Error('Coupled effect reads a different prefix');};
 const effect=economyEffectCalculator(world.review,source,{channelAt:y=>{requirePrefix(y);return prefix.channel;},system:id=>prefix.systems.find(s=>s.id===id),eventsAt:y=>{requirePrefix(y);return prefix.events;},environmentAt:y=>{requirePrefix(y);return prefix;}},t.introducedYear);
 await drain(verifyRecordedEnvironmentInternal(world,(y,p)=>{
  prefixYear=y;prefix=p;if(y<t.introducedYear)return;
  if(y===t.confirmedThrough&&!t.world.review.state.pending){if(t.prepared!==null)throw Error('Unexpected prepared effect');return;}
  const e=effect(y+1),m=coupledAnnualModifier(y+1,t.policy,e);
  if(y===t.confirmedThrough){if(t.prepared===null){if(t.phases.length||!t.originPending)throw Error('Missing pending effect');}else compare(t.prepared,{effect:e,modifier:m},'Pending effect differs');return;}
  const r=t.receipts[seen++]!;wireObject(r,['year','effect','gainBp','costBp','input','harvest','discarded']);compare(r.effect,e,'Coupled effect differs from confirmed source');if(r.year!==y+1||r.gainBp!==m.gainBp||r.costBp!==m.costBp)throw Error('Coupled modifier differs');
  const row=r.input;if(!Array.isArray(row)||row.length!==6||!Array.isArray(row[0])||row[0].length!==4||row[0].some(n=>!nat(n,1e9))||row[0][3]!==0||!nat(row[1])||row[1]!==droughts.get(r.year)||row[2]!== (floods.has(r.year)?1:0)||row[3]!==granaries[r.year]||row[4]!== (floods.get(r.year)??null)||!Array.isArray(row[5])||row[5].length>1000||new Set(row[5]).size!==row[5].length)throw Error('Invalid coupled annual inputs');
  const people=[...row[0]],factors=regionalHarvestFactors(r.year,world.review.state.seed,row[1]);factors[0]=factors[0]!*(1+(m.gainBp-m.costBp)/10000);let issued=0;
  const totals=updateRegionalEconomy(economy,people,r.year,{harvestFactors:factors,blockedRegions:new Set(row[2]?['river']:[]),...(row[4]?{disruptionId:row[4]}:{}),...(row[3]>=0?{granaries:regions.map((_,i)=>!!(row[3]&(1<<i)))}:{})},event=>{const id=row[5][issued++],source=id?records.get(id):undefined;if(!source||source.year!==r.year||source.tag!=='地域')throw Error('Missing coupled economic source');compare(normalized(event),normalized(source),'Coupled economic record differs');return id!;});
  if(issued!==row[5].length)throw Error('Unused coupled economic record');compare(people,populations.get(r.year),'Coupled population differs');compare(r.harvest,totals.harvest,'Coupled harvest differs');compare(r.discarded,totals.discarded,'Coupled discarded food differs');
  if((r.year-t.introducedYear)%100===0){const c=t.checkpoints[checkpoint++]!;wireObject(c,['year','economy','people','phaseCount','sourceCursors']);compare(c,{year:r.year,economy,people,phaseCount:commitPhases.get(r.year),sourceCursors:economicSourceCursorsInternal(world.review,r.year)},'Coupled economic checkpoint differs');}
 }));
 if(seen!==t.receipts.length)throw Error('Missing coupled economic replay');compare(economy,world.review.state.economy??createRegionalEconomy(),'Coupled current economy differs');
}
export function economicRowsInternal(t:RecordedEconomicHistory){let economy=structuredClone(t.initialEconomy);return t.receipts.map(r=>{const p=[...r.input[0]],f=regionalHarvestFactors(r.year,t.world.review.state.seed,r.input[1]);f[0]=f[0]!*(1+(r.gainBp-r.costBp)/10000);let n=0;const totals=updateRegionalEconomy(economy,p,r.year,{harvestFactors:f,blockedRegions:new Set(r.input[2]?['river']:[]),...(r.input[4]?{disruptionId:r.input[4]}:{}),...(r.input[3]>=0?{granaries:regions.map((_,i)=>!!(r.input[3]&(1<<i)))}:{})},()=>r.input[5][n++]!);return {year:r.year,effect:r.effect,gainBp:r.gainBp,costBp:r.costBp,reserve:economy.districts.map(d=>d.reserve),coverage:economy.districts.map(d=>d.coverage.at(-1)??1),people:p,...totals};});}
