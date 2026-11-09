/** C1 adapter retains its recorded-year observation limit. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {productionChannelAt,productionEnvironmentStateAt} from './production-history-v1.js';
import {irrigationSourcesFromWorld} from './sources-v1.js';
import {kernelGeometry} from './production-types-v1.js';
import type {ChannelEvent} from './review-types-v1.js';
import {economyEffectCalculator} from './economy-effect-core-v1.js';
export {economyGainBp,economyWorkBp,economyCostBp} from './economy-effect-core-v1.js';
export function economyEffectReader(world:GeneratedBridgeReview,introducedYear:number){
 const source=irrigationSourcesFromWorld(world),systems=new Map(world.irrigation!.systems.map(s=>[s.id,{...s,geometry:kernelGeometry(s.geometry)}])),events=new Map<number,ChannelEvent[]>();
 for(const e of world.irrigation!.events){const list=events.get(e.year)??[];events.set(e.year,[...list,e]);}
 const calculate=economyEffectCalculator(world.review,source,{channelAt:y=>productionChannelAt(world,y).channel,system:id=>systems.get(id),eventsAt:y=>events.get(y)??[],environmentAt:y=>{const s=productionEnvironmentStateAt(world,y);return {humidity:s.humidity,patchAt:i=>s.patches['river-bank'][i]??null};}},introducedYear);
 return (year:number)=>{if(!Number.isSafeInteger(year)||year<=introducedYear||year>world.environment!.confirmedThrough)throw Error('Unconfirmed economy effect');return calculate(year);};
}
