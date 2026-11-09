/** Read-only C2 projection uses the ordinary terrain/paint components and retains its boundary. */
import type {IrrigationCoupledReview} from '../irrigation/coupled-types-v1.js';
import {knownCoupledReview} from '../irrigation/coupled-owned-internal.js';
import {coupledEnvironment,coupledChannel} from '../irrigation/coupled-history-v1.js';
import {snapshotAt} from './model.js';
import {composeGeneratedScene,type GeneratedSceneGround} from './generated-ground-review.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
export function observeCoupledScene(t:IrrigationCoupledReview,year:number,siteIndex=0):GeneratedSceneObservation {
 knownCoupledReview(t);if(!Number.isSafeInteger(year)||year<0||year>t.confirmedThrough||!Number.isSafeInteger(siteIndex)||siteIndex<0||siteIndex>2)throw Error('Unconfirmed coupled scene');
 const r=t.world.review,site=(['river-bank','hill-side','coast-inlet'] as const)[siteIndex]!,snapshot=snapshotAt(r.state,year,siteIndex,'generated-review-only'),i=t.world.irrigation!;
 const appearance=year<=i.introducedYear?(i.preIntroductionRendererId==='generated-scene-v5'?'landscape-v3':i.preIntroductionRendererId==='generated-scene-v4'?'landscape-v2':undefined):t.world.environmentAppearance;
 const ground:GeneratedSceneGround={...coupledEnvironment(t,year,site),...(appearance?{environmentAppearance:appearance}:{}),channelView:coupledChannel(t,year,site),terrain:r.terrain,site,primaryRoot:r.plans[site].primaryRoot,facilities:r.placements.filter(p=>p.site===site&&p.builtYear<=year).map(p=>({id:p.objectId,purpose:p.kind,plot:p.plot})),bridges:site==='river-bank'?r.bridgeReview!.bridges.filter(b=>b.builtYear<=year).map(b=>b.geometry):[]};
 return {snapshot,ground,composition:composeGeneratedScene(snapshot,r.state.housing,ground)};
}
