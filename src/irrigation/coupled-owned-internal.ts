/** Ownership is separate from production and from the trial progression writer. */
import type {IrrigationCoupledReview} from './coupled-types-v1.js';
import {freezeReview} from './wire-v1.js';
const owned=new WeakSet<object>();
export function ownCoupledReview(value:IrrigationCoupledReview):IrrigationCoupledReview {freezeReview(value);owned.add(value);return value;}
export function isOwnedCoupledReview(value:unknown):value is IrrigationCoupledReview{return !!value&&typeof value==='object'&&owned.has(value);}
export function knownCoupledReview(value:IrrigationCoupledReview):void {if(!owned.has(value))throw Error('Use an owned or validated coupled review');}
