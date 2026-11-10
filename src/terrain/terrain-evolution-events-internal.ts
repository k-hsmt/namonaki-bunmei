import type {TerrainHistory} from './terrain-revision-v1.js';
import {vegetationPatchPlot,type VegetationEvent} from '../vegetation/history-v1.js';
export function terrainCutVegetationEventsInternal(history:TerrainHistory,year:number):readonly VegetationEvent[]{
 return history.events.filter(e=>e.effectiveYear===year).flatMap(e=>e.disturbedPatches.map(index=>({id:'terrain-clear/'+e.id+'/'+index,year,site:'hill-side' as const,kind:'clear' as const,plot:vegetationPatchPlot(index),sourceRecordId:e.id})));
}
