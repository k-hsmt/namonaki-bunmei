import {coupledRuntimeRules} from './coupled-types-v1.js';
/** Independent C2 reader: stored inputs/decisions only; no progression or proposal search. */
import {wireObject,assertJsonWire,sameWire,validateGeneratedState} from '../story/generated-state-review.js';
import {validateTerrainRecord} from '../terrain/terrain-record.js';
import {validateRiverReaches} from '../terrain/river-reaches-review.js';
import {validatePlans,reviewFromParts} from '../story/generated-save-draft-review.js';
import {captureGeneratedLandFoundations} from '../story/generated-land-foundations-review.js';
import {validateCoupledVegetation} from '../environment/history-v1.js';
import {verifyRecordedEnvironmentInternal,recordedEnvironmentStateInternal,projectRecordedEnvironmentInternal,productionChannelAt} from './production-history-v1.js';
import {parseWorldSaveAsync,type GeneratedWorldSave} from '../story/world-save.js';
import {hydrateCoupledOrigin,coupledSourceCursors} from './coupled-origin-v1.js';
import {knownCoupledReview,ownCoupledReview,isOwnedCoupledReview} from './coupled-owned-internal.js';
import {freezeReview,reviewBaseHash,canonicalWire} from './wire-v1.js';
import {coupledTrialBoundary} from '../story/trial-boundary.js';
import {irrigationEconomyRule,economyPolicies} from './economy-types-v1.js';
import {economyEffectCalculator} from './economy-effect-core-v1.js';
import {irrigationSourcesFromWorld} from './sources-v1.js';
import {coupledAnnualModifier} from '../story/coupled-economy-policy-internal.js';
import {boundedRngDraws,mulberryOutputAt} from '../story/rng-phase-diagnostics.js';
import {decisionTemplatesV1} from '../story/decision-templates-v1.js';
import {regions} from '../story/population.js';
import {createRegionalEconomy,regionalHarvestFactors,updateRegionalEconomy} from '../story/regional-economy.js';
import type {IrrigationCoupledReview,CoupledReviewWorld} from './coupled-types-v1.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {inflateCoupledWire,coupledMaxBytes} from './coupled-wire-v1.js';

const nat=(n:unknown,max=10000):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=max;
const u32=(n:unknown):n is number=>nat(n,0xffffffff);
const compare=(a:unknown,b:unknown,message:string)=>{if(!sameWire(a,b))throw Error(message);};
async function drain<T>(task:Generator<void,T>):Promise<T>{let mark=performance.now();for(;;){const r=task.next();if(r.done)return r.value;if(performance.now()-mark>=8){await new Promise(r=>setTimeout(r,0));mark=performance.now();}}}
function normalized(e:{title:string;body:string;causes:readonly string[];relatedIds?:readonly string[]}){return {title:e.title,body:e.body,causes:e.causes,relatedIds:e.relatedIds??[]};}
const adapters=new WeakMap<object,GeneratedBridgeReview>();
function adapter(world:CoupledReviewWorld):GeneratedBridgeReview{let value=adapters.get(world);if(!value){value=freezeReview({...world,format:'generated-bridge-review' as const});adapters.set(world,value);}return value;}
function validateLand(t:IrrigationCoupledReview):IrrigationCoupledReview {
 const w=wireObject(t.world,['format','status','review','irrigation','vegetation','environment'],['environmentAppearance']);
 if(w.format!=='irrigation-coupled-review-world-v1'||w.status!=='review-only'||w.environmentAppearance!==undefined&&!['landscape-v2','landscape-v3'].includes(w.environmentAppearance as string))throw Error('Invalid coupled world');
 const r=wireObject(w.review,['trialBoundary','format','status','placementPolicy','terrain','plans','reservationMode','state','growthPattern','placements','bridgeReview','diagnostics']);
 if(r.trialBoundary!==coupledTrialBoundary||r.format!=='generated-facility-review'||r.status!=='review-only'||r.placementPolicy!==null||r.reservationMode!=='field-only'||r.growthPattern!=='organic-v3'||!Array.isArray(r.placements)||r.placements.length>10000)throw Error('Invalid coupled land');
 compare(r.diagnostics,{holds:{},fullSearches:0},'Non-persistent diagnostics in coupled wire');
 const terrain=validateTerrainRecord(r.terrain),b=wireObject(r.bridgeReview,['schemaVersion','hydrology','bridges']),hydrology=validateRiverReaches(b.hydrology,terrain),plans=validatePlans(r.plans,terrain),state=validateGeneratedState(r.state,terrain.source.seed);
 for(const p of r.placements)wireObject(p,['objectId','site','kind','plot','entrance','builtYear','sourceRecordId']);
 const review={...t.world.review,terrain,plans,state,bridgeReview:{...t.world.review.bridgeReview!,hydrology}};
 const rebuilt=reviewFromParts(terrain,hydrology,plans,'field-only',state,captureGeneratedLandFoundations(review),'organic-v3',coupledTrialBoundary);
 compare(rebuilt.placements,review.placements,'Coupled placements differ from source history');compare(rebuilt.bridgeReview,review.bridgeReview,'Coupled bridges differ');
 const vegetation=validateCoupledVegetation(t.world.vegetation,review);
 return {...t,world:{...t.world,review,vegetation}};
}
function phaseProof(t:IrrigationCoupledReview,origin:GeneratedWorldSave){
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
/** Detached before every await. Exact frozen roots alone acquire continuation ownership. */
export async function validateCoupledReview(raw:unknown):Promise<IrrigationCoupledReview>{
 if(isOwnedCoupledReview(raw))return raw;assertJsonWire(raw);if(new TextEncoder().encode(JSON.stringify(raw)).length>coupledMaxBytes)throw Error('Coupled wire exceeds 16MiB');
 const packet=freezeReview(structuredClone(raw)) as Record<string,unknown>,{payloadHash,...payload}=packet;
 if(typeof payloadHash!=='string'||await reviewBaseHash(payload)!==payloadHash)throw Error('Coupled payload commitment differs');
 let t=inflateCoupledWire(payload);freezeReview(t);
 if(t.format!==coupledTrialBoundary||t.schemaVersion!==1||t.status!=='review-only'||t.ruleId!=='irrigation-economy-coupled-v1'||!sameWire(t.runtimeRules,coupledRuntimeRules)||!sameWire(t.formula,irrigationEconomyRule)||!economyPolicies.includes(t.policy)||!['automatic-per-branch-v1','common-explicit-v1'].includes(t.choiceProtocol)||!nat(t.introducedYear)||!nat(t.confirmedThrough)||t.confirmedThrough<t.introducedYear||typeof t.originPending!=='boolean'||!u32(t.originRngState)||typeof t.originHash!=='string'||!/^[a-f0-9]{64}$/.test(t.originHash)||!Array.isArray(t.checkpoints)||t.checkpoints.length!==Math.floor((t.confirmedThrough-t.introducedYear)/100)||t.receipts.length!==t.confirmedThrough-t.introducedYear)throw Error('Invalid coupled contract');
 t=validateLand(t);freezeReview(t);
 const hydrated=hydrateCoupledOrigin(t),candidate=hydrated.save;
 // Only the reconstructed pre-effect v6 prefix is a production value.
 const original={format:'generated-bridge-review' as const,status:'review-only' as const,review:{...t.world.review,state:candidate.state as GeneratedBridgeReview['review']['state'],placements:t.world.review.placements.filter(p=>p.builtYear<=t.introducedYear),bridgeReview:{...t.world.review.bridgeReview!,bridges:t.world.review.bridgeReview!.bridges.filter(p=>p.builtYear<=t.introducedYear)}},environment:candidate.environment,vegetation:candidate.vegetation,irrigation:candidate.irrigation};
 const reconstructed={...candidate,environment:{...candidate.environment!,current:{...recordedEnvironmentStateInternal(original,t.introducedYear,true),channel:productionChannelAt(original,t.introducedYear).channel}}};
 const origin=await parseWorldSaveAsync(JSON.stringify(reconstructed)) as GeneratedWorldSave;if(origin.version!==6||origin.environment!.confirmedThrough!==t.introducedYear||origin.state.rngState!==t.originRngState||!!origin.state.pending!==t.originPending||await reviewBaseHash(origin)!==t.originHash)throw Error('Coupled origin binding differs');
 compare(t.initialEconomy,origin.state.economy??createRegionalEconomy(),'Coupled initial economy differs');
 for(const key of ['schemaVersion','ruleId','climateRule','climateStart','introducedYear','seed'] as const)compare(t.world.environment![key],origin.environment![key],'Coupled climate policy changed');
 for(const key of ['schemaVersion','ruleId','introducedYear','preIntroductionRendererId'] as const)compare(t.world.irrigation![key],origin.irrigation![key],'Coupled water policy changed');
 compare(t.world.environmentAppearance,origin.environmentAppearance,'Coupled renderer policy changed');
 const {commitPhases,droughts}=phaseProof(t,origin),world=adapter(t.world),source=irrigationSourcesFromWorld(world),records=new Map(t.world.review.state.history.map(r=>[r.id,r])),populations=new Map<number,number[]>(),granaries=new Int8Array(t.confirmedThrough+1),floods=new Map<number,string>();
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
  if((r.year-t.introducedYear)%100===0){const c=t.checkpoints[checkpoint++]!;wireObject(c,['year','economy','people','phaseCount','sourceCursors']);compare(c,{year:r.year,economy,people,phaseCount:commitPhases.get(r.year),sourceCursors:coupledSourceCursors(world.review,r.year)},'Coupled economic checkpoint differs');}
 }));
 if(seen!==t.receipts.length)throw Error('Missing coupled economic replay');compare(economy,world.review.state.economy??createRegionalEconomy(),'Coupled current economy differs');
 return ownCoupledReview(t);
}

export function coupledRows(t:IrrigationCoupledReview){knownCoupledReview(t);let economy=structuredClone(t.initialEconomy);return t.receipts.map(r=>{const p=[...r.input[0]],f=regionalHarvestFactors(r.year,t.world.review.state.seed,r.input[1]);f[0]=f[0]!*(1+(r.gainBp-r.costBp)/10000);let n=0;const totals=updateRegionalEconomy(economy,p,r.year,{harvestFactors:f,blockedRegions:new Set(r.input[2]?['river']:[]),...(r.input[4]?{disruptionId:r.input[4]}:{}),...(r.input[3]>=0?{granaries:regions.map((_,i)=>!!(r.input[3]&(1<<i)))}:{})},()=>r.input[5][n++]!);return {year:r.year,effect:r.effect,gainBp:r.gainBp,costBp:r.costBp,reserve:economy.districts.map(d=>d.reserve),coverage:economy.districts.map(d=>d.coverage.at(-1)??1),people:p,...totals};});}
export function coupledEnvironment(t:IrrigationCoupledReview,year:number,site:'river-bank'|'hill-side'|'coast-inlet'){knownCoupledReview(t);if(!nat(year,t.confirmedThrough))throw Error('Unconfirmed coupled observation');return projectRecordedEnvironmentInternal(adapter(t.world),year,site);}
export function coupledChannel(t:IrrigationCoupledReview,year:number,site:'river-bank'|'hill-side'|'coast-inlet'){knownCoupledReview(t);return productionChannelAt(adapter(t.world),year,site);}
