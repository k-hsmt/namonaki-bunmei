import type {CoupledEconomyReceipt} from './coupled-types-v1.js';
import type {AnnualReceipt} from './annual-baseline-internal.js';
export function economicTuplesInternal(t:{readonly receipts:readonly CoupledEconomyReceipt[];readonly phases:readonly AnnualReceipt[]}){return {
 receipts:t.receipts.map(r=>{const e=r.effect;return [e.systemId,e.status,e.wetCells,e.fieldCells,e.moisture,e.fieldCount,e.gainBp,e.requestedCostBp,e.costBp,e.workEventIds,r.gainBp,r.costBp,r.input,r.harvest,r.discarded];}),
 phases:t.phases.map(p=>[p.phase==='step'?0:p.phase==='automatic-choice'?1:2,p.year,p.confirmedBefore,p.confirmedAfter,p.rngBefore,p.rngAfter,p.pending,p.draws,p.ecologyBefore,p.ecologyAfter,p.choice?.index??null,p.choice?.fingerprint??null])};}
export function inflateEconomicTuplesInternal(receiptsWire:unknown,phasesWire:unknown,introducedYear:number){
 if(!Array.isArray(receiptsWire)||receiptsWire.length>10000||!Array.isArray(phasesWire)||phasesWire.length>20100)throw Error('Oversized economic records');
 const receipts=receiptsWire.map((r,n)=>{if(!Array.isArray(r)||r.length!==15)throw Error('Invalid compact economic receipt');const sourceYear=introducedYear+n;return {year:sourceYear+1,effect:{sourceYear,systemId:r[0],status:r[1],wetCells:r[2],fieldCells:r[3],moisture:r[4],fieldCount:r[5],gainBp:r[6],requestedCostBp:r[7],costBp:r[8],workEventIds:r[9]},gainBp:r[10],costBp:r[11],input:r[12],harvest:r[13],discarded:r[14]} as CoupledEconomyReceipt;});
 const phases=phasesWire.map(p=>{if(!Array.isArray(p)||p.length!==12||![0,1,2].includes(p[0])||(p[10]===null)!==(p[11]===null))throw Error('Invalid compact phase');return {phase:['step','automatic-choice','manual-choice'][p[0]],year:p[1],confirmedBefore:p[2],confirmedAfter:p[3],rngBefore:p[4],rngAfter:p[5],pending:p[6],draws:p[7],ecologyBefore:p[8],ecologyAfter:p[9],...(p[10]!==null?{choice:{index:p[10],fingerprint:p[11]}}:{})} as AnnualReceipt;});
 return {receipts,phases};
}
