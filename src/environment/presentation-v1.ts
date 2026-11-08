import {paintLandscapeGround,landscapeBand} from './landscape-v2.js';
/** Observed environment only; never changes surface, occupation or the model. */
import type {GeneratedSceneGround} from '../scene/generated-ground-review.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {vegetationPatchPlot} from '../vegetation/history-v1.js';
import type {EnvironmentView} from './model-v1.js';
/** Only values that affect pixels; numeric labels and soil clocks stay in observation. */
export function environmentAppearance(e:EnvironmentView|undefined,profile?:'landscape-v2'){if(e&&profile==='landscape-v2')return [2,landscapeBand(e.humidity),landscapeBand(e.temperature),e.moisture.map(m=>m===null?null:landscapeBand(m))];return e?[e.humidity>20,e.temperature< -25,e.moisture.map(m=>m===null?null:m< -35?0:m< -15?1:m>30?3:2)]:null;}
export function environmentLabel(e:EnvironmentView):string {const labels=[];if(e.humidity<=-20)labels.push('乾燥傾向');else if(e.humidity>=20)labels.push('湿潤傾向');if(e.temperature<=-25)labels.push('寒冷傾向');else if(e.temperature>=25)labels.push('温暖傾向');return '長期環境：'+(labels.join('・')||'穏やかな推移');}
export function paintEnvironmentGround(c:CanvasRenderingContext2D,g:GeneratedSceneGround):void {
 const e=g.environment;if(!e)return;if(g.environmentAppearance==='landscape-v2'){paintLandscapeGround(c,g);return;}const r=readOwnedRecordPhysics(g.terrain.sites[g.site].physics);
 for(const [index,m] of e.moisture.entries()){
  if(m===null)continue;const dry=m< -15,cold=e.temperature< -25,wet=e.humidity>20&&m>30;if(!dry&&!cold&&!wet)continue;
  const p=vegetationPatchPlot(index),density=dry?m< -35?7:3:cold?2:1;c.fillStyle=dry?'#b3ab7f':cold?'#aeb39d':'#929d76';
  for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+8;x++){const i=y*320+x;let h=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^g.terrain.source.seed;h=Math.imul(h^(h>>>13),1274126177);if(r.surface[i]===1&&r.bearing[i]===0&&((h^(h>>>16))&15)<density)c.fillRect(x,y,1,1);}
 }
}
