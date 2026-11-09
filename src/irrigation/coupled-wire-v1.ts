/** Compact storage view. Non-persistent placement diagnostics never enter the wire. */
import type {IrrigationCoupledReview,CoupledEconomyReceipt} from './coupled-types-v1.js';
import type {AnnualReceipt} from './annual-baseline-internal.js';
import {wireObject} from '../story/generated-state-review.js';
export const coupledMaxBytes=16*1024*1024;
export function coupledWire(t:IrrigationCoupledReview){const e=t.world.environment!,last=e.checkpoints.length-1;return {...t,storageEncoding:'compact-coupled-tuples-v1',world:{...t.world,review:{...t.world.review,diagnostics:{holds:{},fullSearches:0}},environment:{...e,current:e.checkpoints[last]?.year===e.current.year?{format:'coupled-environment-checkpoint-ref-v1',index:last}:e.current}},receipts:t.receipts.map(r=>{const e=r.effect;return [e.systemId,e.status,e.wetCells,e.fieldCells,e.moisture,e.fieldCount,e.gainBp,e.requestedCostBp,e.costBp,e.workEventIds,r.gainBp,r.costBp,r.input,r.harvest,r.discarded];}),phases:t.phases.map(p=>[p.phase==='step'?0:p.phase==='automatic-choice'?1:2,p.year,p.confirmedBefore,p.confirmedAfter,p.rngBefore,p.rngAfter,p.pending,p.draws,p.ecologyBefore,p.ecologyAfter,p.choice?.index??null,p.choice?.fingerprint??null])};}
export function inflateCoupledWire(raw:unknown):IrrigationCoupledReview {
 const d=wireObject(raw,['format','schemaVersion','status','ruleId','runtimeRules','formula','policy','choiceProtocol','originHash','introducedYear','confirmedThrough','originPending','originRngState','initialEconomy','origin','checkpoints','world','receipts','phases','prepared','storageEncoding']);
 if(d.storageEncoding!=='compact-coupled-tuples-v1'||!Array.isArray(d.receipts)||d.receipts.length>10000||!Array.isArray(d.phases)||d.phases.length>20100)throw Error('Unknown or oversized coupled wire');
 const receipts=d.receipts.map((r,n)=>{if(!Array.isArray(r)||r.length!==15)throw Error('Invalid compact economic receipt');const sourceYear=Number(d.introducedYear)+n;return {year:sourceYear+1,effect:{sourceYear,systemId:r[0],status:r[1],wetCells:r[2],fieldCells:r[3],moisture:r[4],fieldCount:r[5],gainBp:r[6],requestedCostBp:r[7],costBp:r[8],workEventIds:r[9]},gainBp:r[10],costBp:r[11],input:r[12],harvest:r[13],discarded:r[14]} as CoupledEconomyReceipt;});
 const phases=d.phases.map(p=>{if(!Array.isArray(p)||p.length!==12||![0,1,2].includes(p[0])||(p[10]===null)!==(p[11]===null))throw Error('Invalid compact phase');return {phase:['step','automatic-choice','manual-choice'][p[0]],year:p[1],confirmedBefore:p[2],confirmedAfter:p[3],rngBefore:p[4],rngAfter:p[5],pending:p[6],draws:p[7],ecologyBefore:p[8],ecologyAfter:p[9],...(p[10]!==null?{choice:{index:p[10],fingerprint:p[11]}}:{})} as AnnualReceipt;});
 const {storageEncoding:_,...rest}=d,result={...rest,receipts,phases} as unknown as IrrigationCoupledReview;
 const env=result.world?.environment,current=env?.current as unknown as {format?:string;index?:number};
 if(current?.format==='coupled-environment-checkpoint-ref-v1'){
  const ref=wireObject(current,['format','index']);if(!env||!Array.isArray(env.checkpoints)||ref.index!==env.checkpoints.length-1||env.checkpoints[Number(ref.index)]?.year!==result.confirmedThrough)throw Error('Invalid current environment reference');
  return {...result,world:{...result.world,environment:{...env,current:env.checkpoints[Number(ref.index)]!}}};
 }return result;
}
