/**
 * Issue #35 D3-b: regional tradition change (architecture-change-v1).
 * Every 25 years (Human decision 3), each district's tradition may change on one axis at a time:
 *  - invention:    local building and repair experience, nudged by disasters that hit the district
 *  - transmission: a partner district it actually traded or exchanged migrants with (D3-a record)
 *  - revival:      a value the district's own tradition held earlier
 * Changes decided at boundary Y use only events of years Y-24..Y (all confirmed when Y is), take effect
 * from Y+1, and never touch buildings already standing. Contact does not force adoption (D0 §4.2): most
 * exposures change nothing. Probabilities are provisional; D3-d calibrates them with Human approval.
 * Deterministic: its own hash stream, never the civilization RNG.
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import {d2Inconsistencies,roofFamilies,eavesKinds,pitches,type PartialSpec,type Ornament} from './vocab-v1.js';
import {regionalCandidates,wallFits,type ArchitectureSite,type RegionalArchitecturalTradition,type WorldArchitecturalGrammar} from './grammar-v1.js';
import {routeEnds,type InteractionLedger} from './interaction-v1.js';

export const CHANGE_ID='architecture-change-v1';
export const CHANGE_PERIOD=25;
const SITES:readonly ArchitectureSite[]=['river-bank','hill-side','coast-inlet'];
const ORNAMENTS:readonly Ornament[]=['O1','O2','O3','O4','O5','O6','O7','O8'];
/** Provisional rates (per district per 25-year boundary, in per-mille). Calibrated in D3-d. */
export const changeRates=Object.freeze({inventionBase:6,inventionPerExperience:2,inventionCap:60,disasterBonus:10,
 transmissionPerExposure:40,transmissionCap:80,revival:4});

type Shared={roofFamily:string;eaves:string;pitch:string;ornaments:readonly string[]};
type Choices=RegionalArchitecturalTradition['choices'];
export type ChangeAxis=keyof Choices|'roofFamily'|'eaves'|'pitch'|'ornaments';
/** A tradition as it stands in a given year: the regional choices plus the (possibly diverged) roof axes. */
export interface EffectiveTradition {readonly siteId:ArchitectureSite;readonly choices:Choices;readonly shared:Shared}
export interface TraditionChange {
 readonly site:ArchitectureSite;readonly year:number;readonly effectiveFrom:number;
 readonly axis:ChangeAxis;readonly from:string;readonly to:string;
 readonly cause:'invention'|'transmission'|'revival';
 /** Structured sources: experience counts and record ids, or the partner district and its interaction. */
 readonly sources:{readonly experience?:number;readonly records?:readonly string[];readonly fromSite?:ArchitectureSite;
  readonly migrations?:number;readonly tradeYears?:number;readonly revivedFrom?:number};
}

/** Per-district facts of one 25-year window, all taken from confirmed records. */
export interface WindowFacts {readonly experience:number;readonly records:readonly string[];readonly disasters:number}
export interface ChangeInputs {
 readonly seed:number;readonly confirmedThrough:number;
 readonly grammar:WorldArchitecturalGrammar;readonly initial:readonly RegionalArchitecturalTradition[];
 readonly interaction:InteractionLedger;
 /** Facts of the window (year-24..year) for a district. */
 readonly facts:(site:ArchitectureSite,year:number)=>WindowFacts;
}
/** Contact of district `si` with each partner it shares a route with, in the window year-24..year (D3-a record). */
export function contactsOf(interaction:InteractionLedger,si:number,year:number):{route:number;partner:ArchitectureSite;tradeYears:number;migrations:number;exposure:number}[] {
 const out=[];
 for(const [r,ends] of routeEnds.entries()){
  if(ends.from!==si&&ends.to!==si)continue;
  const partnerIndex=ends.from===si?ends.to:ends.from;
  const tradeYears=interaction.trade.filter(x=>x[0]===r).reduce((n,[,a,b])=>n+Math.max(0,Math.min(b,year)-Math.max(a,year-CHANGE_PERIOD+1)+1),0);
  const migrations=interaction.migrations.filter(([y,from,to])=>y>year-CHANGE_PERIOD&&y<=year&&from===partnerIndex&&to===si).reduce((n,m)=>n+m[3],0);
  out.push({route:r,partner:SITES[partnerIndex]!,tradeYears,migrations,exposure:tradeYears/CHANGE_PERIOD+Math.min(1,migrations/200)});
 }
 return out;
}
const H=(...parts:(string|number)[])=>terrainHash(['architecture-change-v1',...parts]);
const encode=(axis:ChangeAxis,v:unknown)=>axis==='ornaments'?[...(v as string[])].sort().join('+'):String(v);
const decode=(axis:ChangeAxis,v:string)=>axis==='ornaments'?(v?v.split('+'):[]):v;

function apply(t:EffectiveTradition,c:TraditionChange):EffectiveTradition {
 const v=decode(c.axis,c.to);
 if(c.axis==='roofFamily'||c.axis==='eaves'||c.axis==='pitch'||c.axis==='ornaments')return {...t,shared:{...t.shared,[c.axis]:v}};
 return {...t,choices:{...t.choices,[c.axis]:v}};
}
const initialOf=(g:WorldArchitecturalGrammar,t:RegionalArchitecturalTradition):EffectiveTradition=>({siteId:t.siteId,choices:t.choices,shared:{...g.shared}});
/** The tradition in force in `year` (changes with effectiveFrom <= year). */
export function traditionAt(g:WorldArchitecturalGrammar,initial:RegionalArchitecturalTradition,changes:readonly TraditionChange[],year:number):EffectiveTradition {
 let t=initialOf(g,initial);
 for(const c of changes)if(c.site===initial.siteId&&c.effectiveFrom<=year)t=apply(t,c);
 return t;
}
const asSpec=(t:EffectiveTradition):PartialSpec&{use:'house'}=>({use:'house',...t.choices,roofFamily:t.shared.roofFamily as PartialSpec['roofFamily'],
 eaves:t.shared.eaves as PartialSpec['eaves'],pitch:t.shared.pitch as PartialSpec['pitch'],ornaments:[...t.shared.ornaments] as Ornament[]});
/**
 * A change is allowed only if the whole tradition still satisfies the D2 constraints afterwards,
 * including the grammar's structure-wall pairing (D3-d audit: without it, e.g. a timber frame S01 took
 * a rubble wall by transmission).
 */
const valid=(t:EffectiveTradition)=>d2Inconsistencies(asSpec(t)).length===0&&wallFits(t.choices.structure,t.choices.wall);

/** Candidate values an invention may move an axis to (neighbouring values, never advanced technology). */
function inventionCandidates(axis:ChangeAxis,t:EffectiveTradition,g:WorldArchitecturalGrammar):string[] {
 switch(axis){
  case 'roofFamily':return roofFamilies.filter(r=>r!==t.shared.roofFamily);
  case 'eaves':return eavesKinds.filter(e=>e!==t.shared.eaves);
  case 'pitch':{const i=pitches.indexOf(t.shared.pitch as typeof pitches[number]);return [pitches[i-1],pitches[i+1]].filter((p):p is typeof pitches[number]=>!!p);}
  case 'ornaments':{const have=new Set(t.shared.ornaments);return ORNAMENTS.map(o=>encode('ornaments',have.has(o)?[...have].filter(x=>x!==o):[...have,o]));}
  case 'wall':return Object.keys(g.weights.wall).filter(w=>w!==t.choices.wall);
  default:return (regionalCandidates[axis as keyof typeof regionalCandidates] as readonly string[]).filter(v=>v!==String(t.choices[axis as keyof Choices]));
 }
}
const AXES:readonly ChangeAxis[]=['structure','wall','foundation','roofMaterial','window','entrance','palette','roofFamily','eaves','pitch','ornaments'];
const current=(t:EffectiveTradition,axis:ChangeAxis)=>axis in t.shared?encode(axis,(t.shared as Record<string,unknown>)[axis]):String(t.choices[axis as keyof Choices]);

/** All tradition changes decided at boundaries 25, 50, ... up to the confirmed year. */
export function traditionChangesFor(input:ChangeInputs):TraditionChange[] {
 const {seed,grammar,initial,interaction}=input,out:TraditionChange[]=[];
 const state=new Map<ArchitectureSite,EffectiveTradition>(initial.map(t=>[t.siteId,initialOf(grammar,t)]));
 const history=new Map<ArchitectureSite,{axis:ChangeAxis;value:string;year:number}[]>(SITES.map(s=>[s,[]]));
 for(let year=CHANGE_PERIOD;year<=input.confirmedThrough;year+=CHANGE_PERIOD){
  const decided:TraditionChange[]=[];
  for(const [si,site] of SITES.entries()){
   const t=state.get(site)!,f=input.facts(site,year),h=(...k:(string|number)[])=>H(seed,site,year,...k);
   const tryChange=(axis:ChangeAxis,to:string,cause:TraditionChange['cause'],sources:TraditionChange['sources'])=>{
    const from=current(t,axis);if(from===to)return false;
    const c:TraditionChange={site,year,effectiveFrom:year+1,axis,from,to,cause,sources};
    if(!valid(apply(t,c)))return false;decided.push(c);return true;
   };
   // 1. transmission from each partner district actually in contact during the window
   let changed=false;
   for(const {partner,tradeYears,migrations,exposure} of contactsOf(interaction,si,year)){
    if(changed)break;
    if(exposure<=0)continue;
    const p=Math.min(changeRates.transmissionCap,Math.round(changeRates.transmissionPerExposure*exposure));
    if(h('accept',partner)%1000>=p)continue;
    const other=state.get(partner)!,differing=AXES.filter(a=>current(other,a)!==current(t,a));
    if(!differing.length)continue;
    const axis=differing[h('accept-axis',partner)%differing.length]!;
    changed=tryChange(axis,current(other,axis),'transmission',{fromSite:partner,tradeYears,migrations});
   }
   // 2. invention from local experience (disasters make builders reconsider)
   if(!changed){
    const p=Math.min(changeRates.inventionCap,changeRates.inventionBase+changeRates.inventionPerExperience*f.experience+(f.disasters?changeRates.disasterBonus:0));
    if(h('invent')%1000<p){
     const axis=AXES[h('invent-axis')%AXES.length]!,options=inventionCandidates(axis,t,grammar);
     if(options.length)changed=tryChange(axis,options[h('invent-value')%options.length]!,'invention',{experience:f.experience,records:f.records.slice(0,3)});
    }
   }
   // 3. revival of a value this district held before
   if(!changed){
    const past=history.get(site)!.filter(x=>current(t,x.axis)!==x.value);
    if(past.length&&h('revive')%1000<changeRates.revival){
     const pick=past[h('revive-pick')%past.length]!;
     tryChange(pick.axis,pick.value,'revival',{revivedFrom:pick.year});
    }
   }
  }
  // apply all of this boundary's decisions together (no district sees another's same-year change)
  for(const c of decided){
   history.get(c.site)!.push({axis:c.axis,value:c.from,year:c.year});
   state.set(c.site,apply(state.get(c.site)!,c));out.push(c);
  }
 }
 return out;
}
