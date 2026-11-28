/**
 * Issue #40 D2b: the review-only save of a world advanced with the review event policy (format namonaki-review-save).
 *
 * D0 §10.1: D2–D4 use their own trial save, never accepted as a production save (the production envelope rejects it, and
 * a review world cannot be prepared as a production save). Human review of D2a: D2b/D2c must save and restore review
 * worlds, including a pending branch.
 *
 * The save records the new world's seed, the review policy and every operation since year 0 (advance / choose), plus a
 * SHA-256 of the resulting history (civilization state and architecture ledger). Restoring replays the operations from a
 * new world under the same policy and accepts the save only when the replayed history has the same hash, the same year
 * and the same pending state: nothing is redrawn differently and nothing missing is inferred. The rule is deterministic,
 * so the replay reproduces the saved history exactly; a tampered save (operations, hash, unknown fields) is rejected.
 * Issue #40 D2c: with episodes, the typed episode history is part of the hashed state and is checked on save and load.
 * Restoring costs a replay (about 7 s per 5000 years in Node): acceptable for review, not a production design.
 */
import {createNewArchitectureWorld} from './new-world.js';
import {advanceArchitectureWorld,chooseArchitectureWorld,type ArchitectureProductionWorld} from '../architecture/production-v1.js';
import {createEventPolicyD2a,EVENT_POLICY_D2A_ID,type EventDrawReceipt,type EventPolicyInternal} from './event-policy-d2a-review.js';
import type {InteractionCaptureInternal} from './economy-observer.js';
import {checkEpisodeHistory} from './episode-d2c-review.js';
import {EPISODE_FOOD_D3A} from './episode-food-d3a-review.js';

export const REVIEW_SAVE_FORMAT='namonaki-review-save' as const;
export const REVIEW_POLICIES=['hardship-linked','hardship-linked+decisions-d2b','hardship-linked+decisions-d2b+episodes-food-d3a'] as const;
export type ReviewPolicyName=typeof REVIEW_POLICIES[number];
export type ReviewOperation=readonly ['advance',number,'stop'|'automatic']|readonly ['choose',number|'random'];
export interface ReviewSave {
 readonly format:typeof REVIEW_SAVE_FORMAT;readonly schemaVersion:1;readonly ruleId:typeof EVENT_POLICY_D2A_ID;readonly policy:ReviewPolicyName;
 readonly seed:number;readonly operations:readonly ReviewOperation[];readonly year:number;readonly pending:boolean;readonly historySha256:string;
}
interface Log {readonly seed:number;readonly policy:ReviewPolicyName;readonly operations:readonly ReviewOperation[]}
const logs=new WeakMap<ArchitectureProductionWorld,Log>();
const fail=(m:string):never=>{throw Error('review save: '+m);};
const policyOf=(name:ReviewPolicyName,observeDraw?:(r:EventDrawReceipt)=>void):EventPolicyInternal=>
 createEventPolicyD2a('hardship-linked',{...(observeDraw?{observeDraw}:{}),decisions:name!=='hardship-linked',...(name==='hardship-linked+decisions-d2b+episodes-food-d3a'?{episodes:EPISODE_FOOD_D3A}:{})});
const logOf=(world:ArchitectureProductionWorld)=>logs.get(world)??fail('not a review world made by this module');
const next=(world:ArchitectureProductionWorld,log:Log,op:ReviewOperation)=>{logs.set(world,{...log,operations:[...log.operations,op]});return world;};

export async function createReviewWorld(seed:number,policy:ReviewPolicyName):Promise<ArchitectureProductionWorld> {
 if(!REVIEW_POLICIES.includes(policy))fail('unknown policy');
 const world=(await createNewArchitectureWorld(seed)).architecture;
 // the new world itself is the production one; its review copy is the same object only until the first operation
 logs.set(world,{seed,policy,operations:[]});return world;
}
export async function advanceReviewWorld(world:ArchitectureProductionWorld,years:number,choices:'stop'|'automatic'='automatic',
 observe?:{readonly draw?:(r:EventDrawReceipt)=>void;readonly economy?:(c:InteractionCaptureInternal)=>void}):Promise<ArchitectureProductionWorld> {
 const log=logOf(world);if(!Number.isSafeInteger(years)||years<1)fail('invalid years');
 const result=await advanceArchitectureWorld(world,years,choices,{},observe?.economy,policyOf(log.policy,observe?.draw));
 return result===world?world:next(result,log,['advance',years,choices]);
}
export async function chooseReviewWorld(world:ArchitectureProductionWorld,index:number|'random',
 observe?:{readonly economy?:(c:InteractionCaptureInternal)=>void}):Promise<ArchitectureProductionWorld> {
 const log=logOf(world);if(index!=='random'&&(!Number.isSafeInteger(index)||index<0))fail('invalid choice');
 return next(await chooseArchitectureWorld(world,index,policyOf(log.policy),observe?.economy),log,['choose',index]);
}

async function historyHash(world:ArchitectureProductionWorld):Promise<string> {
 const bytes=new TextEncoder().encode(JSON.stringify({state:world.terrain.review.state,architecture:world.architecture}));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function prepareReviewSave(world:ArchitectureProductionWorld):Promise<ReviewSave> {
 const log=logOf(world),state=world.terrain.review.state;checkEpisodeHistory(state);
 return Object.freeze({format:REVIEW_SAVE_FORMAT,schemaVersion:1,ruleId:EVENT_POLICY_D2A_ID,policy:log.policy,seed:log.seed,
  operations:Object.freeze(log.operations.map(op=>Object.freeze([...op]) as ReviewOperation)),year:state.year,pending:!!state.pending,historySha256:await historyHash(world)});
}
/** Validates the save, replays it from a new world and checks the replayed history. Never repairs anything. */
export async function restoreReviewSave(raw:unknown):Promise<ArchitectureProductionWorld> {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('save must be an object');
 const d=JSON.parse(JSON.stringify(raw)) as Record<string,unknown>;
 if(Object.keys(d).sort().join(',')!=='format,historySha256,operations,pending,policy,ruleId,schemaVersion,seed,year')fail('unknown fields');
 if(d.format!==REVIEW_SAVE_FORMAT||d.schemaVersion!==1||d.ruleId!==EVENT_POLICY_D2A_ID)fail('unknown review save contract');
 if(!REVIEW_POLICIES.includes(d.policy as ReviewPolicyName))fail('unknown policy');
 if(!Number.isSafeInteger(d.seed)||(d.seed as number)<1||(d.seed as number)>0xffffffff)fail('invalid seed');
 if(!Number.isSafeInteger(d.year)||(d.year as number)<0||(d.year as number)>10000||typeof d.pending!=='boolean')fail('invalid year');
 if(typeof d.historySha256!=='string'||!/^[0-9a-f]{64}$/.test(d.historySha256))fail('invalid history hash');
 if(!Array.isArray(d.operations)||d.operations.length>20000)fail('invalid operations');
 let total=0;
 for(const op of d.operations as unknown[]){
  if(!Array.isArray(op))fail('invalid operation');const o=op as unknown[];
  if(o[0]==='advance'){if(o.length!==3||!Number.isSafeInteger(o[1])||(o[1] as number)<1||!['stop','automatic'].includes(o[2] as string))fail('invalid advance');total+=o[1] as number;}
  else if(o[0]==='choose'){if(o.length!==2||!(o[1]==='random'||Number.isSafeInteger(o[1])&&(o[1] as number)>=0))fail('invalid choice');}
  else fail('unknown operation');
 }
 if(total>10000)fail('operations exceed 10000 years');
 let world=await createReviewWorld(d.seed as number,d.policy as ReviewPolicyName);
 for(const op of d.operations as ReviewOperation[])world=op[0]==='advance'?await advanceReviewWorld(world,op[1],op[2]):await chooseReviewWorld(world,op[1]);
 const state=world.terrain.review.state;
 if(state.year!==d.year||!!state.pending!==d.pending)fail('the replayed history does not reach the saved year');
 if(await historyHash(world)!==d.historySha256)fail('the replayed history differs from the saved one');
 checkEpisodeHistory(state);
 return world;
}
