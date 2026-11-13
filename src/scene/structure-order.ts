import type {GeneratedSceneObservation} from './generated-scene-review.js';
type SceneObjects=GeneratedSceneObservation['snapshot']['objects'];
/**
 * Structure drawing order of a generated scene: fields first (flat ground on their own footprint), then residential
 * roofs (far, middle, near), then civic buildings, then other buildings. Bridges are part of the ground layer.
 */
export function sceneFields(objects:SceneObjects):SceneObjects {return objects.filter(o=>!o.civic&&o.kind==='field');}
export function sceneBuildings(objects:SceneObjects):SceneObjects {return [...objects.filter(o=>o.civic),...objects.filter(o=>!o.civic&&o.kind!=='bridge'&&o.kind!=='field')];}
