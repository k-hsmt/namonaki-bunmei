/**
 * Issue #35 D3-a: structured inter-district interaction (architecture-interaction-v1), recorded from the
 * read-only interaction tap while v8 advances (Human decision S-A on PR #117). v8 does not keep this
 * history per district pair (a 20-year trade window and the last migration year only), so it cannot be
 * recomputed on load. Instead the reader checks it against everything v8 still keeps:
 *  - the last 20 trade flags of each route equal the route's saved tradeYears
 *  - replaying v8's own migration bookkeeping (a record only when 10+ years since the last one for that
 *    pair) over the recorded migrations reproduces the saved migrationYears exactly
 *  - each route's last origin / agreement / closure record id equals the saved route
 *  - every recorded route record id exists in the history with the same year
 *  - a SHA-256 commitment over the whole interaction block (corruption check, as v8's payloadHash)
 * Migrations from people with no home district (v8's "unlocated" index) are new settlement, not contact
 * between districts, and are not recorded.
 */
import type {InteractionCaptureInternal} from '../story/economy-observer.js';
import {links} from '../story/regional-economy.js';
import type {TerrainProductionWorld} from '../terrain/terrain-production-types-v1.js';
import {terrainRevisionHash} from '../terrain/terrain-revision-wire-v1.js';

export const INTERACTION_ID='architecture-interaction-v1';
const SITES=3;
type RouteField='originRecord'|'agreementRecord'|'closureRecord';
const ROUTE_FIELDS:readonly RouteField[]=['originRecord','agreementRecord','closureRecord'];
/** Routes in v8's order, with the districts each joins (site indices). */
export const routeEnds:readonly {readonly from:number;readonly to:number}[]=Object.freeze(links.map(l=>Object.freeze({from:l.from,to:l.to})));

export interface InteractionLedger {
 readonly format:typeof INTERACTION_ID;readonly confirmedThrough:number;
 /** [year, from site, to site, people] for each move between two districts. */
 readonly migrations:readonly (readonly [number,number,number,number])[];
 /** [route, first year, last year] inclusive runs of years with trade on that route. */
 readonly trade:readonly (readonly [number,number,number])[];
 /** [year, route, blocked] whenever a route opens or closes. */
 readonly routeStates:readonly (readonly [number,number,boolean])[];
 /** [year, route, field, record id or null] whenever a route's origin / agreement / closure record changes (v8 may clear an agreement). */
 readonly routeRecords:readonly (readonly [number,number,RouteField,string|null])[];
}
export const emptyInteraction=(year:number):InteractionLedger=>({format:INTERACTION_ID,confirmedThrough:year,migrations:[],trade:[],routeStates:[],routeRecords:[]});
const fail=(m:string):never=>{throw Error('architecture interaction: '+m);};

/** State of the routes as of the ledger's last year (rebuilt from the ledger, never stored twice). */
function lastRouteState(l:InteractionLedger){
 const blocked=routeEnds.map(()=>false),records=routeEnds.map(()=>({originRecord:null,agreementRecord:null,closureRecord:null} as Record<RouteField,string|null>));
 for(const [,r,b] of l.routeStates)blocked[r]=b;
 for(const [,r,f,id] of l.routeRecords)records[r]![f]=id;
 return {blocked,records};
}
/** Appends one advance's captures. Years must continue exactly from the ledger. */
export function appendInteraction(l:InteractionLedger,captures:readonly InteractionCaptureInternal[]):InteractionLedger {
 if(!captures.length)return l;
 const migrations=[...l.migrations],trade=l.trade.map(t=>[...t] as [number,number,number]),routeStates=[...l.routeStates],routeRecords=[...l.routeRecords];
 let {blocked,records}=lastRouteState(l),through=l.confirmedThrough;
 for(const c of captures){
  if(c.year!==through+1)fail('captured year '+c.year+' does not follow '+through);
  if(c.traded.length!==routeEnds.length||c.routes.length!==routeEnds.length)fail('route count changed');
  for(const m of c.moves){
   if(m.from===SITES)continue;
   if(!Number.isSafeInteger(m.from)||!Number.isSafeInteger(m.to)||m.from<0||m.from>=SITES||m.to<0||m.to>=SITES||!(m.amount>0))fail('invalid move');
   migrations.push([c.year,m.from,m.to,m.amount]);
  }
  c.traded.forEach((amount,r)=>{if(!(amount>0))return;const last=[...trade].reverse().find(t=>t[0]===r);
   if(last&&last[2]===c.year-1)last[2]=c.year;else trade.push([r,c.year,c.year]);});
  c.routes.forEach((route,r)=>{
   if(route.blocked!==blocked[r]){routeStates.push([c.year,r,route.blocked]);blocked[r]=route.blocked;}
   for(const f of ROUTE_FIELDS){const id=route[f];if(id!==records[r]![f]){routeRecords.push([c.year,r,f,id]);records[r]![f]=id;}}
  });
  through=c.year;
 }
 return {format:INTERACTION_ID,confirmedThrough:through,migrations,trade,routeStates,routeRecords};
}

/** Checks the recorded interaction against what the v8 world still keeps. Throws on any difference. */
export function verifyInteraction(l:InteractionLedger,world:TerrainProductionWorld,introducedYear:number):void {
 if(l.format!==INTERACTION_ID)fail('unknown format');
 const state=world.review.state;
 // A world that has not run its first year has no economy yet (v8 creates it in year 1): only an empty
 // record at the introduction year is consistent with that.
 if(!state.economy){
  if(state.year===introducedYear&&l.confirmedThrough===introducedYear&&!l.migrations.length&&!l.trade.length&&!l.routeStates.length&&!l.routeRecords.length)return;
  fail('missing economy');
 }
 const economy=state.economy!;
 // While a choice is pending, v8 has entered the year but not yet run its economy: the economy (and so
 // the interaction record) is confirmed through the previous year.
 if(l.confirmedThrough!==state.year&&!(state.pending&&l.confirmedThrough===state.year-1))fail('recorded through '+l.confirmedThrough+' but the world is at '+state.year+(state.pending?' (pending)':''));
 // trade: the last 20 flags of each route
 routeEnds.forEach((_,r)=>{
  const saved=economy.routes[r]?.tradeYears??fail('missing route '+r),span=Math.min(20,l.confirmedThrough-introducedYear);
  const flags:boolean[]=[];for(let y=l.confirmedThrough-span+1;y<=l.confirmedThrough;y++)flags.push(l.trade.some(([rr,a,b])=>rr===r&&a<=y&&y<=b));
  if(JSON.stringify(flags)!==JSON.stringify(saved))fail('trade of route '+r+' does not match the saved window');
 });
 // migrations: replay v8's bookkeeping (a record only when 10+ years since the last for that pair)
 const expected:Record<string,number>={};
 for(const [year,from,to] of l.migrations){const key=from+'-'+to;if(year-(expected[key]??-Infinity)>=10)expected[key]=year;}
 const savedMigrations=Object.fromEntries(Object.entries(economy.migrationYears).filter(([k])=>!k.startsWith(SITES+'-')));
 if(JSON.stringify(Object.entries(expected).sort())!==JSON.stringify(Object.entries(savedMigrations).sort()))fail('migrations do not reproduce the saved migration years');
 // route records and states
 const {blocked,records}=lastRouteState(l);
 routeEnds.forEach((_,r)=>{
  const route=economy.routes[r]!;
  if(route.blocked!==blocked[r])fail('route '+r+' open/closed state differs');
  for(const f of ROUTE_FIELDS)if(route[f]!==records[r]![f])fail('route '+r+' '+f+' differs');
 });
 const byId=new Map(state.history.map(h=>[h.id,h.year]));
 for(const [year,,,id] of l.routeRecords)if(id!==null&&byId.get(id)!==year)fail('route record '+id+' is not in the history at '+year);
 for(const [year,,,] of l.migrations)if(year<=introducedYear||year>l.confirmedThrough)fail('migration outside the recorded years');
}
export async function interactionHash(l:InteractionLedger):Promise<string>{return terrainRevisionHash(l);}
