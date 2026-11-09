import {economicTuplesInternal,inflateEconomicTuplesInternal} from './economic-tuples-internal.js';
/** Compact storage view. Non-persistent placement diagnostics never enter the wire. */
import type {IrrigationCoupledReview} from './coupled-types-v1.js';
import {wireObject} from '../story/generated-state-review.js';
export const coupledMaxBytes=16*1024*1024;
export function coupledWire(t:IrrigationCoupledReview){const e=t.world.environment!,last=e.checkpoints.length-1;return {...t,storageEncoding:'compact-coupled-tuples-v1',world:{...t.world,review:{...t.world.review,diagnostics:{holds:{},fullSearches:0}},environment:{...e,current:e.checkpoints[last]?.year===e.current.year?{format:'coupled-environment-checkpoint-ref-v1',index:last}:e.current}},...economicTuplesInternal(t)};}
export function inflateCoupledWire(raw:unknown):IrrigationCoupledReview {
 const d=wireObject(raw,['format','schemaVersion','status','ruleId','runtimeRules','formula','policy','choiceProtocol','originHash','introducedYear','confirmedThrough','originPending','originRngState','initialEconomy','origin','checkpoints','world','receipts','phases','prepared','storageEncoding']);
 if(d.storageEncoding!=='compact-coupled-tuples-v1'||!Array.isArray(d.receipts)||d.receipts.length>10000||!Array.isArray(d.phases)||d.phases.length>20100)throw Error('Unknown or oversized coupled wire');
 const {receipts,phases}=inflateEconomicTuplesInternal(d.receipts,d.phases,Number(d.introducedYear));
 const {storageEncoding:_,...rest}=d,result={...rest,receipts,phases} as unknown as IrrigationCoupledReview;
 const env=result.world?.environment,current=env?.current as unknown as {format?:string;index?:number};
 if(current?.format==='coupled-environment-checkpoint-ref-v1'){
  const ref=wireObject(current,['format','index']);if(!env||!Array.isArray(env.checkpoints)||ref.index!==env.checkpoints.length-1||env.checkpoints[Number(ref.index)]?.year!==result.confirmedThrough)throw Error('Invalid current environment reference');
  return {...result,world:{...result.world,environment:{...env,current:env.checkpoints[Number(ref.index)]!}}};
 }return result;
}
