/** Independent trial observation never accepts a production terrain root. */
import type {TerrainTrialWorld} from '../terrain/terrain-trial-types-v1.js';
import {knownTerrainTrialWorldInternal} from '../terrain/terrain-trial-owned-internal.js';
import {observeTerrainEvolutionSceneInternal,terrainEvolutionUseAtInternal} from './terrain-evolution-scene-internal.js';
export function observeTerrainTrialScene(world:TerrainTrialWorld,year:number,siteIndex=0){knownTerrainTrialWorldInternal(world);return observeTerrainEvolutionSceneInternal(world,year,siteIndex);}
export function terrainCutUseAt(world:TerrainTrialWorld,year:number){knownTerrainTrialWorldInternal(world);return terrainEvolutionUseAtInternal(world,year);}
