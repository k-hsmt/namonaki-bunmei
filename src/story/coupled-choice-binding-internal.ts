import type {CivilizationState} from './engine.js';
import {canonicalWire} from '../irrigation/wire-v1.js';
export function coupledChoiceBinding(s:CivilizationState):string {
 if(!s.pending)throw Error('No coupled choice pending');
 return 'coupled-decision-template-v1/'+canonicalWire({template:s.lastDecisionId,year:s.pending.year,id:s.pending.id,question:s.pending.question,options:s.pending.options});
}
