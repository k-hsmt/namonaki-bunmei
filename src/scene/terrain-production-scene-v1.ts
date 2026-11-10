/** Recorded same-year production terrain and ecology; no progression or candidate search. */
import type {TerrainProductionWorld} from '../terrain/terrain-production-types-v1.js';
import {knownTerrainProductionWorldInternal} from '../terrain/terrain-production-owned-internal.js';
import {observeTerrainEvolutionSceneInternal,terrainEvolutionUseAtInternal} from './terrain-evolution-scene-internal.js';
export function observeTerrainProductionScene(world:TerrainProductionWorld,year:number,siteIndex=0){knownTerrainProductionWorldInternal(world);return observeTerrainEvolutionSceneInternal(world,year,siteIndex);}
export function terrainProductionUseAt(world:TerrainProductionWorld,year:number){knownTerrainProductionWorldInternal(world);return terrainEvolutionUseAtInternal(world,year);}
