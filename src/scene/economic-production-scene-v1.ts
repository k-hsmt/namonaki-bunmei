/** Read-only production projection uses the ordinary terrain/paint components and retains its boundary. */
import type {EconomicProductionWorld} from '../irrigation/economic-production-types-v1.js';
import {knownEconomicProductionWorldInternal} from '../irrigation/economic-production-owned-internal.js';
import {economicProductionViewInternal} from '../irrigation/economic-production-view-internal.js';
import {projectRecordedEnvironmentInternal,productionChannelAt} from '../irrigation/production-history-v1.js';
import {snapshotAt} from './model.js';
import {composeGeneratedScene,type GeneratedSceneGround} from './generated-ground-review.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
export function observeEconomicProductionScene(t:EconomicProductionWorld,year:number,siteIndex=0):GeneratedSceneObservation {
 knownEconomicProductionWorldInternal(t);if(!Number.isSafeInteger(year)||year<0||year>t.economicCoupling.confirmedThrough||!Number.isSafeInteger(siteIndex)||siteIndex<0||siteIndex>2)throw Error('Unconfirmed economic scene');
 const r=t.review,site=(['river-bank','hill-side','coast-inlet'] as const)[siteIndex]!,snapshot=snapshotAt(r.state,year,siteIndex,'generated-review-only'),i=t.irrigation!;
 const appearance=year<=i.introducedYear?(i.preIntroductionRendererId==='generated-scene-v5'?'landscape-v3':i.preIntroductionRendererId==='generated-scene-v4'?'landscape-v2':undefined):t.environmentAppearance;
 const ground:GeneratedSceneGround={...projectRecordedEnvironmentInternal(economicProductionViewInternal(t),year,site),...(appearance?{environmentAppearance:appearance}:{}),channelView:productionChannelAt(economicProductionViewInternal(t),year,site),terrain:r.terrain,site,primaryRoot:r.plans[site].primaryRoot,facilities:r.placements.filter(p=>p.site===site&&p.builtYear<=year).map(p=>({id:p.objectId,purpose:p.kind,plot:p.plot})),bridges:site==='river-bank'?r.bridgeReview!.bridges.filter(b=>b.builtYear<=year).map(b=>b.geometry):[]};
 return {snapshot,ground,composition:composeGeneratedScene(snapshot,r.state.housing,ground)};
}
