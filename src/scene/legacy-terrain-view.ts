/** The legacy tag selects the existing fixed scene/land rules, not generated terrain. */
import {snapshotAt,type SiteSnapshot} from './model.js';
import {composeScene,type SceneComposition} from './composition.js';
import {drawScene} from './draw.js';
import {siteAt} from '../story/settlement-history.js';
import type {ValidatedLegacySaveDraft} from '../story/legacy-terrain-save.js';
export interface LegacyDraftObservation {
 readonly snapshot:SiteSnapshot;readonly composition:SceneComposition;
 readonly constructionEvidence:'recorded'|'legacy-display-only';
}
export function observeLegacySaveDraft(draft:ValidatedLegacySaveDraft,year:number,siteIndex=0):LegacyDraftObservation {
 if(!Number.isSafeInteger(siteIndex)||siteIndex<0||siteIndex>2)throw Error('invalid legacy site index');
 const snapshot=snapshotAt(draft.state,year,siteIndex),composition=composeScene(snapshot,draft.state.housing);
 return {snapshot,composition,constructionEvidence:siteAt(draft.state.observation?.sites,siteIndex,year)?'recorded':'legacy-display-only'};
}
export function drawLegacySaveDraft(canvas:HTMLCanvasElement,draft:ValidatedLegacySaveDraft,year:number,siteIndex=0):void {
 const {snapshot}=observeLegacySaveDraft(draft,year,siteIndex);drawScene(canvas,snapshot,draft.state.seed,draft.state.housing);
}
