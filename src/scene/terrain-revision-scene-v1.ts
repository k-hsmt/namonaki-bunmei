/** Explicit D4 review adapter. Ordinary production sessions keep their original observations. */
import {assertResolvedTerrain,terrainInitialRecord,type ResolvedTerrainAtYear} from '../terrain/terrain-revision-v1.js';
import {composeGeneratedScene} from './generated-ground-review.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import type {HousingHistory} from '../story/housing-history.js';
export function observeTerrainRevisionScene(observation:GeneratedSceneObservation,view:ResolvedTerrainAtYear,housing:HousingHistory|undefined):GeneratedSceneObservation {
 assertResolvedTerrain(view,observation.snapshot.year,terrainInitialRecord(observation.ground.terrain));
 if(observation.ground.vegetation&&view.changes.some(e=>e.site===observation.ground.site))throw Error('Changed terrain requires D4 ecology projection');
 const ground={...observation.ground,terrain:view};
 return {snapshot:observation.snapshot,ground,composition:composeGeneratedScene(observation.snapshot,housing,ground)};
}
