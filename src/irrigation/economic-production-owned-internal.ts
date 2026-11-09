import type {EconomicProductionWorld} from './economic-production-types-v1.js';
import {freezeReview} from './wire-v1.js';
const owned=new WeakSet<object>();
export function ownEconomicProductionWorldInternal(world:EconomicProductionWorld):EconomicProductionWorld{freezeReview(world);owned.add(world);return world;}
export function isOwnedEconomicProductionWorldInternal(value:unknown):value is EconomicProductionWorld{return !!value&&typeof value==='object'&&owned.has(value);}
export function knownEconomicProductionWorldInternal(world:EconomicProductionWorld):void{if(!owned.has(world))throw Error('Use an owned or validated economic production world');}
const packets=new WeakMap<object,EconomicProductionWorld>();
export function ownEconomicProductionPacketInternal<T extends object>(packet:T,world:EconomicProductionWorld):T{knownEconomicProductionWorldInternal(world);freezeReview(packet);packets.set(packet,world);return packet;}
export function knownEconomicProductionPacketInternal(packet:unknown):EconomicProductionWorld|undefined{return packet&&typeof packet==='object'?packets.get(packet):undefined;}
