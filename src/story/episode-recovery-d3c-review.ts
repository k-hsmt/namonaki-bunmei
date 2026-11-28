/**
 * Issue #40 D3c: the disaster-recovery system on the D2c episode frame (review-only; definition set `recovery-d3c`).
 *
 * D0 §4.2 recovery. The canonical facts are the confirmed chronicle records of the settlement buildings (bridges
 * included) and of the housing blocks: their damage, repair, abandonment (ruin) and reuse, each naming its object
 * (`buildingId`, the block id for housing). A damage record cites the disaster record that caused it (`relatedIds`).
 * The episode copies none of them and applies no effect: the existing annual processing is the only writer. A disaster
 * alone is not damage: an episode starts and grows only on damage records, never on the disaster record by itself.
 * Waterways are not read: their damage comes from lapsed upkeep (a clock) or a controlled input, never from a disaster.
 *
 * The object's own records decide everything; there is no threshold and no clock:
 *  - started: this year, damage records that cite a disaster of the same year (the disaster and the damage records are
 *    the origin).
 *  - reassessed: further-damage (more damage from a disaster while the episode runs); object-abandoned (a damaged
 *    object concerned went out of use: the building's abandonment, the block's ruin), when no response is running;
 *    object-repaired / object-reused (one more object restored the same way as the running response).
 *  - response-started / response-changed, from the records that restore an object concerned:
 *      repair  a damaged object (or a ruined housing block) was repaired (building-repaired / housing-repaired);
 *      reuse   a ruined building was reused (building-reused).
 *    The repair is the work itself: no record tells of an attempt that fell short, so none is claimed.
 *  - response-failed: object-abandoned (a damaged object concerned went out of use while a response was running: the
 *    restoration did not reach it).
 *  - resolved: restored (every object concerned is restored).
 *  - abandoned: left-in-ruin (no object concerned is damaged any more and at least one is left in ruin). The loss of use
 *    is itself the recorded change that ends the damage (D0: 放棄により課題終了); a later reuse of the ruin is not
 *    claimed for the episode.
 * One transition per year. A year's records that cannot be announced in their year wait in the episode's queue and are
 * taken in order (earliest year first; within a year: damage, abandonment, repair, reuse). An object's record is taken
 * only when it follows the object's state (abandoned or repaired when damaged, repaired or reused when ruined); others
 * (a restored object's later abandonment, say) are no part of the damage and are dropped.
 */
import {defineEpisodeSet,type EpisodeDefinition,type EpisodeYear,type EvidenceRef,type ActiveEpisode,type EpisodeProposal} from './episode-d2c-review.js';
import type {RecordEntry} from './engine.js';

export const RECOVERY_DISASTERS=Object.freeze(['flood','earthquake','fire','storm'] as const);
export type RecoveryResponse='repair'|'reuse';
type Status='damaged'|'ruined'|'restored';
type Category='damage'|'abandon'|'repair'|'reuse';
interface RecoveryObject {readonly status:Status;readonly damage:string;readonly last:string}
interface RecoveryState {
 /** Object key (`building:<id>` / `housing:<id>`) → its state in the episode. */
 readonly objects:{readonly [key:string]:RecoveryObject};
 /** Records not yet announced, in the order they were confirmed. */
 readonly pending:readonly string[];
 readonly response:RecoveryResponse|null;
}
const ORDER:readonly Category[]=['damage','abandon','repair','reuse'];
const CATEGORY:Readonly<Record<string,Category>>={'building-damaged':'damage','housing-damaged':'damage','building-abandoned':'abandon','housing-ruined':'abandon',
 'building-repaired':'repair','housing-repaired':'repair','building-reused':'reuse'};
const rec=(id:string):EvidenceRef=>({type:'record',id});
const keyOf=(r:RecordEntry)=>r.kind&&r.buildingId?r.kind.split('-')[0]+':'+r.buildingId:null;
const categoryOf=(r:RecordEntry):Category|null=>r.kind?CATEGORY[r.kind]??null:null;
/** The disaster records a damage record cites, in its own year. */
function disastersOf(y:EpisodeYear,r:RecordEntry):RecordEntry[] {
 return (r.relatedIds??[]).map(id=>y.record(id)).filter((d):d is RecordEntry=>!!d&&d.year===r.year&&(RECOVERY_DISASTERS as readonly string[]).includes(d.kind??''));
}
const isDisasterDamage=(y:EpisodeYear,r:RecordEntry)=>categoryOf(r)==='damage'&&keyOf(r)!==null&&disastersOf(y,r).length>0;
/** Whether the record follows the object's state in the episode. */
function follows(c:Category,o:RecoveryObject|undefined,y:EpisodeYear,r:RecordEntry):boolean {
 if(c==='damage')return isDisasterDamage(y,r)&&o?.status!=='damaged'&&o?.status!=='ruined';
 if(!o)return false;
 if(c==='abandon')return o.status==='damaged';
 // a housing block is repaired out of ruin; a building is reused out of it
 if(c==='repair')return o.status==='damaged'||o.status==='ruined'&&r.kind==='housing-repaired';
 return o.status==='ruined';
}
/** The damage evidence: each disaster once, then the damage records. */
function damageEvidence(y:EpisodeYear,rs:readonly RecordEntry[]):EvidenceRef[] {
 const disasters=[...new Set(rs.flatMap(r=>disastersOf(y,r).map(d=>d.id)))];
 return [...disasters.map(rec),...rs.map(r=>rec(r.id))];
}

const recovery:EpisodeDefinition={kind:'recovery',definitionId:'recovery-d3c',
 start:y=>{
  const damage=y.records.filter(r=>isDisasterDamage(y,r));if(!damage.length)return null;
  const objects:{[key:string]:RecoveryObject}={};for(const r of damage)objects[keyOf(r)!]={status:'damaged',damage:r.id,last:r.id};
  const state:RecoveryState={objects,pending:[],response:null};
  return {evidence:damageEvidence(y,damage),state:state as never};
 },
 advance:(y,e:ActiveEpisode)=>{
  const s=e.state as unknown as RecoveryState,running=e.response==='running';
  // the queue: what waited, then this year's records that may concern the episode (checked when they are taken)
  const queued=new Set(s.pending),pendingDamage=new Set<string>();
  for(const id of s.pending){const r=y.record(id);if(r&&categoryOf(r)==='damage')pendingDamage.add(keyOf(r)!);}
  const fresh=y.records.filter(r=>{const c=categoryOf(r),k=keyOf(r);if(!c||!k||queued.has(r.id))return false;
   return c==='damage'?isDisasterDamage(y,r):k in s.objects||pendingDamage.has(k);});
  let queue=[...s.pending.map(id=>y.record(id)!),...fresh];
  const next=(kind:EpisodeProposal['kind'],evidence:EvidenceRef[],state:RecoveryState,reason:string):EpisodeProposal=>({kind,evidence,state:state as never,reason});
  while(queue.length){
   const year=Math.min(...queue.map(r=>r.year)),c=ORDER.find(c=>queue.some(r=>r.year===year&&categoryOf(r)===c))!;
   const taken=queue.filter(r=>r.year===year&&categoryOf(r)===c);queue=queue.filter(r=>!taken.includes(r));
   const objects={...s.objects},used:RecordEntry[]=[];
   for(const r of taken){const k=keyOf(r)!;if(!follows(c,objects[k],y,r))continue;used.push(r);
    objects[k]=c==='damage'?{status:'damaged',damage:r.id,last:r.id}:{...objects[k]!,status:c==='abandon'?'ruined':'restored',last:r.id};}
   if(!used.length)continue;
   const pending=queue.map(r=>r.id);
   if(c==='damage')return next('reassessed',damageEvidence(y,used),{...s,objects,pending},'further-damage');
   // the damage each record follows is cited with it
   const evidence=[...used.map(r=>rec(r.id)),...used.map(r=>rec(s.objects[keyOf(r)!]!.damage))];
   if(c==='abandon')return running
    ?next('response-failed',evidence,{objects,pending,response:null},'object-abandoned')
    :next('reassessed',evidence,{...s,objects,pending},'object-abandoned');
   const kind:RecoveryResponse=c;
   if(running&&s.response===kind)return next('reassessed',evidence,{...s,objects,pending},kind==='repair'?'object-repaired':'object-reused');
   return next(running?'response-changed':'response-started',evidence,{objects,pending,response:kind},running?'to-'+kind:kind);
  }
  // nothing waits: the episode ends once no object concerned is damaged
  const all=Object.values(s.objects);
  if(all.some(o=>o.status==='damaged'))return null;
  const evidence=all.map(o=>rec(o.last));
  return all.every(o=>o.status==='restored')?next('resolved',evidence,s,'restored'):next('abandoned',evidence,s,'left-in-ruin');
 }};
export const EPISODE_RECOVERY_D3C=defineEpisodeSet('recovery-d3c',[recovery]);
