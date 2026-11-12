/**
 * Issue #35 D3-c: district building capabilities (architecture-technology-v1). Decided every 25 years
 * (Human decision 3), from confirmed records only, on its own hash stream (never the civilization RNG):
 *  - establish:  the district is town-sized, has building experience, and its tradition can lead there
 *  - acquire:    a town-sized district learns a technology from a partner it is in contact with (D3-a)
 *  - lose:       a held technology is lost after a century without any building or repair work
 *  - rediscover: a lost technology is established again (more easily than the first time)
 * Holding a technology does not make anyone use it: only hall / market / workshop births may adopt it
 * (grammar-v1). Losing it never changes buildings already standing (D0 A09).
 * Design §3.3 asks for the district's scale (town / city). D5 (Human decision #4): the town condition is
 * the real scale from v8's observation ledger (town or city in the boundary year). D3-c had used "a market
 * and a workshop built" on the wrong belief that v8 keeps no structured scale history.
 * Rates are provisional; D3-d calibrates them with Human approval.
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import {technologies,type ArchitectureSite,type RegionalArchitecturalTradition,type Technology,type WorldArchitecturalGrammar} from './grammar-v1.js';
import {CHANGE_PERIOD,contactsOf,traditionAt,type TraditionChange,type WindowFacts} from './change-v1.js';
import type {InteractionLedger} from './interaction-v1.js';
import type {Structure} from './vocab-v1.js';

export const TECHNOLOGY_ID='architecture-technology-v1';
const SITES:readonly ArchitectureSite[]=['river-bank','hill-side','coast-inlet'];
/** Provisional rates (per-mille per district per boundary) and thresholds. Calibrated in D3-d. */
export const technologyRates=Object.freeze({
 /** building and repair works in the last 100 years needed to establish a technology */
 experienceNeeded:4,establishBase:10,establishPerExperience:2,establishCap:40,
 rediscoverFactor:2,acquirePerExposure:30,acquireCap:60,
 /** a century with no work at all */
 loss:100,
});
/** Traditions that can lead to a technology by themselves (D1 A1: timber, A2: masonry). */
const leadsTo:Readonly<Record<Exclude<Technology,'metal-glass'>,readonly Structure[]>>={
 'timber-span':['S01','S02','S06','S07'],
 'masonry-arch':['S04','S05','S06'],
};
export interface CapabilityEvent {
 readonly site:ArchitectureSite;readonly year:number;readonly effectiveFrom:number;
 readonly technology:Technology;readonly op:'establish'|'acquire'|'lose'|'rediscover';
 readonly sources:{readonly experience?:number;readonly records?:readonly string[];readonly fromSite?:ArchitectureSite;
  readonly tradeYears?:number;readonly migrations?:number};
}
export interface TechnologyInputs {
 readonly seed:number;readonly confirmedThrough:number;
 readonly grammar:WorldArchitecturalGrammar;readonly initial:readonly RegionalArchitecturalTradition[];
 readonly changes:readonly TraditionChange[];readonly interaction:InteractionLedger;
 /** Facts of the window (year-24..year) for a district. */
 readonly facts:(site:ArchitectureSite,year:number)=>WindowFacts;
 /** Whether the district is a town or a city in `year`. */
 readonly town:(site:ArchitectureSite,year:number)=>boolean;
}
const H=(...parts:(string|number)[])=>terrainHash([TECHNOLOGY_ID,...parts]);

/** Technologies a district holds in `year` (events with effectiveFrom <= year). */
export function technologiesAt(events:readonly CapabilityEvent[],site:ArchitectureSite,year:number):Technology[] {
 const held=new Set<Technology>();
 for(const e of events)if(e.site===site&&e.effectiveFrom<=year){if(e.op==='lose')held.delete(e.technology);else held.add(e.technology);}
 return technologies.filter(t=>held.has(t));
}

/** All capability events decided at boundaries 25, 50, ... up to the confirmed year. */
export function capabilityEventsFor(input:TechnologyInputs):CapabilityEvent[] {
 const {seed,grammar,initial,changes,interaction}=input,out:CapabilityEvent[]=[];
 const held=new Map<ArchitectureSite,Set<Technology>>(SITES.map(s=>[s,new Set()])),lost=new Map<ArchitectureSite,Set<Technology>>(SITES.map(s=>[s,new Set()]));
 for(let year=CHANGE_PERIOD;year<=input.confirmedThrough;year+=CHANGE_PERIOD){
  const decided:CapabilityEvent[]=[];
  for(const [si,site] of SITES.entries()){
   const h=(...k:(string|number)[])=>H(seed,site,year,...k),mine=held.get(site)!;
   const windows=[0,1,2,3].map(i=>year-i*CHANGE_PERIOD).filter(y=>y>0).map(y=>input.facts(site,y));
   const experience=windows.reduce((n,f)=>n+f.experience,0),records=windows.flatMap(f=>f.records).slice(0,3);
   const town=input.town(site,year),contacts=contactsOf(interaction,si,year);
   const structure=traditionAt(grammar,initial.find(t=>t.siteId===site)!,changes,year).choices.structure;
   const traded=contacts.some(c=>c.tradeYears>0);
   const reaches=(t:Technology)=>t==='metal-glass'?(mine.has('timber-span')||mine.has('masonry-arch'))&&traded:leadsTo[t].includes(structure);
   const event=(technology:Technology,op:CapabilityEvent['op'],sources:CapabilityEvent['sources'])=>{decided.push({site,year,effectiveFrom:year+1,technology,op,sources});};
   for(const t of technologies){
    if(mine.has(t)){
     if(experience===0&&h('lose',t)%1000<technologyRates.loss){event(t,'lose',{experience:0});break;}
     continue;
    }
    if(!town)continue;
    // acquire from a partner that holds it (metal-glass still needs a base technology here)
    const teacher=contacts.find(c=>c.exposure>0&&held.get(c.partner)!.has(t));
    if(teacher&&(t!=='metal-glass'||mine.has('timber-span')||mine.has('masonry-arch'))&&
     h('acquire',t)%1000<Math.min(technologyRates.acquireCap,Math.round(technologyRates.acquirePerExposure*teacher.exposure))){
     event(t,'acquire',{fromSite:teacher.partner,tradeYears:teacher.tradeYears,migrations:teacher.migrations});break;
    }
    if(experience<technologyRates.experienceNeeded||!reaches(t))continue;
    const again=lost.get(site)!.has(t);
    const base=Math.min(technologyRates.establishCap,technologyRates.establishBase+technologyRates.establishPerExperience*(experience-technologyRates.experienceNeeded));
    if(h('establish',t)%1000<(again?base*technologyRates.rediscoverFactor:base)){event(t,again?'rediscover':'establish',{experience,records});break;}
   }
  }
  // all districts decide from the state before this boundary
  for(const e of decided){
   if(e.op==='lose'){held.get(e.site)!.delete(e.technology);lost.get(e.site)!.add(e.technology);}else held.get(e.site)!.add(e.technology);
   out.push(e);
  }
 }
 return out;
}
