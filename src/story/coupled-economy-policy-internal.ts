import {economyPolicies,type EconomyPolicy,irrigationEconomyRule as rule,type EconomyEffect} from '../irrigation/economy-types-v1.js';
export interface CoupledAnnualModifier {readonly year:number;readonly sourceYear:number;readonly policy:EconomyPolicy;readonly gainBp:number;readonly costBp:number}
export function coupledAnnualModifier(year:number,policy:EconomyPolicy,effect:EconomyEffect):CoupledAnnualModifier {
 const value=Object.freeze({year,sourceYear:effect.sourceYear,policy,gainBp:policy==='combined'||policy==='yield-only'?effect.gainBp:0,costBp:policy==='combined'||policy==='cost-only'?effect.costBp:0});
 checkCoupledModifier(value,year);return value;
}
export function checkCoupledModifier(v:CoupledAnnualModifier,year:number):void {
 if(!Object.isFrozen(v)||v.year!==year||!Number.isSafeInteger(year)||year<1||year>10000||v.sourceYear!==year-1||!economyPolicies.includes(v.policy)||!Number.isSafeInteger(v.gainBp)||v.gainBp<0||v.gainBp>rule.gainMaxBp||!Number.isSafeInteger(v.costBp)||v.costBp<0||v.costBp>rule.costMaxBp||!['combined','yield-only'].includes(v.policy)&&v.gainBp!==0||!['combined','cost-only'].includes(v.policy)&&v.costBp!==0)throw Error('Invalid coupled annual economy modifier');
}
