/**
 * Issue #40 D2a: review-only event eligibility and yearly draw probability (ruleId civilization-events-d2a-review).
 *
 * Never used by a production entry (new world, advance, choose, saves, UI). A trial passes a policy explicitly through
 * the production terrain advance; the world it produces is marked review-only, cannot be saved, and can only continue with
 * the same policy. At D5 the adopted parts become the default rule and this review structure is removed.
 *
 * Eligibility (Human decision Q2a on D2a): a candidate whose text states a fact the confirmed ledgers record is a
 * candidate only when that fact is confirmed. Ledger facts are read as confirmed at the end of the previous year (y-1,
 * D0 §8 step 1); the drought and epidemic counters and the six values are this year's basic state, computed before the
 * draw (D0 §8 step 2). What an event changes when it happens (its values, an institution it forms) is its outcome and is
 * never required beforehand. A kind whose text states nothing the ledgers record has no requirement (listed as 'none').
 * The weights, the repeat suppression and the turning points are production's; only the eligible set and the yearly
 * draw probability change. The RNG is used exactly as production: one draw per year against the probability, then one
 * draw to select when there is at least one candidate.
 */
import {checkEpisodeSet,type EpisodeDefinitionSet} from './episode-d2c-review.js';
import {siteAt,type SettlementHistory} from './settlement-history.js';
import type {CivilizationState} from './engine.js';

export const EVENT_POLICY_D2A_ID='civilization-events-d2a-review' as const;
/** D2a Human review: hardship-linked adopted (0.07 + 0.40 × hardship; final coefficients in D4c). The others were not adopted. */
export const EVENT_POLICY_SETTINGS=['hardship-linked'] as const;
export type EventPolicySetting=typeof EVENT_POLICY_SETTINGS[number];

/** The confirmed facts the requirements read. */
export interface ConfirmedEventFacts {
 readonly ledgerYear:number;
 readonly inhabitedSites:number;readonly uninhabitedSite:boolean;readonly townOrLarger:boolean;
 readonly marketStanding:boolean;readonly riverMarketStanding:boolean;readonly granaryStanding:boolean;
 readonly councilSites:number;readonly splitCommunity:boolean;readonly riverInhabited:boolean;readonly coastInhabited:boolean;
 readonly communalWork:boolean;readonly archivePractice:boolean;
 readonly districtShortage:boolean;readonly recentTrade:boolean;readonly pastDisease:boolean;readonly pastConflict:boolean;
 readonly pastRecordEvent:boolean;readonly drought:boolean;
}
export type EventRequirement='town'|'market'|'river-market'|'granary'|'council-two-sites'|'two-inhabited-sites'|'communal-work'|
 'split-community'|'river-inhabited'|'coast-inhabited'|'district-shortage'|'drought'|'recent-trade'|'past-disease'|'past-conflict'|
 'past-record-activity'|'suspended'|'none';

/** Requirement of every production event kind (a kind missing here is an error, not an eligible candidate). */
export const EVENT_REQUIREMENTS:Readonly<Record<string,EventRequirement>>=Object.freeze({
 decline:'suspended',abandon:'suspended',rebirth:'suspended',cold:'suspended',well:'suspended',storm:'suspended',
 first_city:'town',market:'market',first_port:'river-market',first_granary:'granary',
 first_confederation:'council-two-sites',council:'two-inhabited-sites',tax:'communal-work',split:'split-community',first_fragment:'split-community',
 flood:'river-inhabited',irrigation:'river-inhabited',dike:'river-inhabited',fish:'river-inhabited',fishing_ban:'river-inhabited',ferry:'river-inhabited',
 navigation:'coast-inhabited',famine:'district-shortage',drought:'drought',isolation:'recent-trade',healing:'past-disease',reconciliation:'past-conflict',
 first_library:'past-record-activity',
 earthquake:'none',eruption:'none',harvest:'none',disease:'none',migration:'none',arrival:'none',trade:'none',
 language:'none',ritual:'none',song:'none',craft:'none',writing:'none',dispute:'none',fire:'none',garden:'none',forest:'none',peace:'none',
 salt:'none',pottery:'none',midwife:'none',new_crops:'none',marriage:'none',funeral:'none',
 pilgrim:'none',apprentice:'none',storyteller:'none',landslide:'none',artisan:'none',
 first_archive:'none',first_terrace:'none',
});
/** Kinds held back because the current model cannot confirm what their text states (never inferred; D2a Human review). */
export const SUSPENDED_EVENTS:Readonly<Record<string,{readonly reason:string;readonly revisit:string}>>=Object.freeze({
 decline:{reason:'衰退の実際の状態遷移を根拠にする再設計が必要',revisit:'D4b'},
 abandon:{reason:'地区の無人化の実際の状態遷移を根拠にする再設計が必要',revisit:'D4b'},
 rebirth:{reason:'再定住の実際の状態遷移を根拠にする再設計が必要',revisit:'D4b'},
 cold:{reason:'文が述べる空き家の発生を確認できない',revisit:'空き家を確定するモデルの後'},
 well:{reason:'井戸の建設を確定するモデルがない',revisit:'井戸を確定するモデルの後'},
 storm:{reason:'自然現象と実際の被害（住まいの喪失）を区別し、喪失を事前に検証できない',revisit:'D3c'},
});
/** Where the fact each requirement reads comes from, and how a finished history re-checks it. */
export const REQUIREMENT_SOURCES:Readonly<Record<Exclude<EventRequirement,'suspended'|'none'>,string>>=Object.freeze({
 town:'settlement-ledger','market':'settlement-ledger','river-market':'settlement-ledger',granary:'settlement-ledger',
 'council-two-sites':'settlement-ledger','two-inhabited-sites':'settlement-ledger','communal-work':'settlement-ledger',
 'split-community':'settlement-ledger','river-inhabited':'settlement-ledger','coast-inhabited':'settlement-ledger',
 'district-shortage':'economy','recent-trade':'economy','past-disease':'chronicle','past-conflict':'chronicle+settlement-ledger',
 'past-record-activity':'chronicle+settlement-ledger',drought:'basic-state (draw receipt only)',
});

const standing=(site:ReturnType<typeof siteAt>,kind:string)=>!!site?.buildings.some(b=>b.kind===kind&&b.condition!=='ruined');
export type LedgerEventFacts=Pick<ConfirmedEventFacts,'ledgerYear'|'inhabitedSites'|'uninhabitedSite'|'townOrLarger'|'marketStanding'|
 'riverMarketStanding'|'granaryStanding'|'councilSites'|'splitCommunity'|'riverInhabited'|'coastInhabited'|'communalWork'|'archivePractice'>;
/** The settlement-ledger facts as confirmed at the end of `year` (pure; also used to audit a finished history). */
export function ledgerEventFactsAt(history:SettlementHistory,year:number):LedgerEventFacts {
 const sites=[0,1,2].map(i=>siteAt(history,i,year)),inhabited=sites.filter(v=>v?.inhabited);
 return {ledgerYear:year,inhabitedSites:inhabited.length,uninhabitedSite:sites.some(v=>v&&!v.inhabited),
  townOrLarger:inhabited.some(v=>v!.scale>=2),marketStanding:sites.some(v=>standing(v,'market')),riverMarketStanding:standing(sites[0],'market'),
  granaryStanding:sites.some(v=>standing(v,'granary')),
  councilSites:sites.filter(v=>v?.practices.some(p=>p.kind==='council'&&p.active)).length,
  splitCommunity:sites.some(v=>v&&v.communityId!=='founding-community'),riverInhabited:!!sites[0]?.inhabited,coastInhabited:!!sites[2]?.inhabited,
  // communal work or an institution for it: a council or communal-store practice, or a standing meeting hall
  communalWork:sites.some(v=>v&&(v.practices.some(p=>(p.kind==='council'||p.kind==='granary')&&p.active)||standing(v,'hall'))),
  archivePractice:sites.some(v=>v?.practices.some(p=>p.kind==='archive'&&p.active))};
}
/** Facts for this year's draw: ledgers as confirmed at the end of year - 1, counters of this year's basic state. */
export function confirmedEventFacts(s:CivilizationState):ConfirmedEventFacts {
 const year=s.year-1,ledger=s.observation;
 if(!ledger?.sites)throw Error('event policy: missing settlement ledger');
 if(ledger.lastYear!==year)throw Error('event policy: facts must be read from the previous confirmed year');
 const f=ledgerEventFactsAt(ledger.sites,year);
 return {...f,districtShortage:!!s.economy?.districts.some(d=>d.shortageYears>0),recentTrade:!!s.economy?.routes.some(r=>r.tradeYears.some(Boolean)),
  pastDisease:s.lastKind.disease!==undefined,pastConflict:s.lastKind.dispute!==undefined||f.splitCommunity,
  pastRecordEvent:s.lastKind.first_archive!==undefined||s.lastKind.writing!==undefined,drought:s.drought>0};
}
/** Requirements read from the settlement ledger alone (auditable afterwards from a finished history). */
export const LEDGER_REQUIREMENTS:readonly EventRequirement[]=Object.freeze(['town','market','river-market','granary',
 'council-two-sites','two-inhabited-sites','communal-work','split-community','river-inhabited','coast-inhabited']);

export function meetsRequirement(requirement:EventRequirement,f:ConfirmedEventFacts):boolean {
 switch(requirement){
  case 'town':return f.townOrLarger;case 'market':return f.marketStanding;
  case 'river-market':return f.riverMarketStanding;case 'granary':return f.granaryStanding;case 'council-two-sites':return f.councilSites>=2;
  case 'two-inhabited-sites':return f.inhabitedSites>=2;case 'communal-work':return f.communalWork;case 'split-community':return f.splitCommunity;case 'river-inhabited':return f.riverInhabited;
  case 'coast-inhabited':return f.coastInhabited;case 'district-shortage':return f.districtShortage;case 'drought':return f.drought;
  case 'recent-trade':return f.recentTrade;case 'past-disease':return f.pastDisease;case 'past-conflict':return f.pastConflict;
  case 'past-record-activity':return f.pastRecordEvent||f.archivePractice;case 'suspended':return false;case 'none':return true;
 }
}

/** Hardship of this year's basic state, 0..1: low food, low cohesion, drought, epidemic (one quarter each). */
export function hardship(s:CivilizationState):number {
 return ((s.food<40?1:s.food<55?.5:0)+(s.cohesion<40?1:s.cohesion<55?.5:0)+(s.drought>2?1:s.drought>0?.5:0)+(s.epidemic>0?1:0))/4;
}
/** The yearly draw probability (adopted: hardship-linked, D2a Human review). */
export const DRAW_PROBABILITY:Readonly<Record<EventPolicySetting,(s:CivilizationState)=>number>>=Object.freeze({
 'hardship-linked':s=>.07+.40*hardship(s),
});

/** One year's draw, as the policy saw it (review-only audit; never persisted). */
export interface EventDrawReceipt {
 readonly year:number;readonly probability:number;
 readonly inputs:{readonly food:number;readonly cohesion:number;readonly drought:number;readonly epidemic:number};
 readonly facts:ConfirmedEventFacts;readonly drawn:boolean;readonly candidates:number;readonly selected:string|null;
}
export interface EventPolicyInternal {
 readonly ruleId:typeof EVENT_POLICY_D2A_ID;readonly setting:EventPolicySetting;
 readonly facts:(s:CivilizationState)=>ConfirmedEventFacts;
 readonly eligible:(kind:string,facts:ConfirmedEventFacts)=>boolean;
 readonly drawProbability:(s:CivilizationState)=>number;
 /** Review-only audit tap: one frozen receipt per drawn-or-not year. */
 readonly observeDraw?:(receipt:EventDrawReceipt)=>void;
 /** Issue #40 D2b: issue-based branches and the people's own choice (story/decision-policy-d2b-review). */
 readonly decisions?:boolean;
 /** Issue #40 D2c: the episode definitions committed at the end of each year (story/episode-d2c-review). */
 readonly episodes?:EpisodeDefinitionSet;
}
const policies=new WeakSet<object>();
export function createEventPolicyD2a(setting:EventPolicySetting,options:{readonly observeDraw?:(receipt:EventDrawReceipt)=>void;readonly decisions?:boolean;readonly episodes?:EpisodeDefinitionSet}={}):EventPolicyInternal {
 if(options.episodes!==undefined)checkEpisodeSet(options.episodes);
 if(options.decisions!==undefined&&typeof options.decisions!=='boolean')throw Error('event policy: invalid decisions option');
 if(!EVENT_POLICY_SETTINGS.includes(setting))throw Error('event policy: unknown setting');
 if(options.observeDraw!==undefined&&typeof options.observeDraw!=='function')throw Error('event policy: invalid draw observer');
 const policy=Object.freeze({ruleId:EVENT_POLICY_D2A_ID,setting,facts:confirmedEventFacts,...(options.observeDraw?{observeDraw:options.observeDraw}:{}),...(options.decisions?{decisions:true}:{}),...(options.episodes?{episodes:options.episodes}:{}),
  eligible:(kind:string,facts:ConfirmedEventFacts)=>{const r=EVENT_REQUIREMENTS[kind];if(r===undefined)throw Error('event policy: no requirement for '+kind);return meetsRequirement(r,facts);},
  drawProbability:DRAW_PROBABILITY[setting]});
 policies.add(policy);return policy;
}
/** Only policies made here are accepted (a look-alike object is rejected). Returns its key. */
export function checkEventPolicyInternal(policy:unknown):string {
 if(!policy||typeof policy!=='object'||!policies.has(policy))throw Error('event policy: use createEventPolicyD2a');
 const p=policy as EventPolicyInternal;return p.ruleId+':'+p.setting+(p.decisions?'+decisions-d2b':'')+(p.episodes?'+episodes:'+p.episodes.id:'');
}

// ---- review-only worlds ----
const reviewWorlds=new WeakMap<object,string>();
export function markReviewOnlyWorldInternal(world:object,key:string):void {reviewWorlds.set(world,key);}
export function reviewOnlyWorldKeyInternal(world:object):string|undefined {return reviewWorlds.get(world);}
/**
 * A world advances with an event policy only from year 0 (a new world) or when it was already advanced with the same
 * policy; a review-only world never continues without it. Returns the key the result must carry (or undefined).
 */
export function continueReviewOnlyWorldInternal(world:object,year:number,policy:unknown):string|undefined {
 const held=reviewWorlds.get(world),key=policy===undefined?undefined:checkEventPolicyInternal(policy);
 if(held!==key){
  if(held!==undefined)throw Error('event policy: a review-only world continues only with its own policy');
  if(year!==0)throw Error('event policy: a review-only rule starts from a new world (year 0)');
 }
 return key;
}
