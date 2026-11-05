/**
 * H3-A: 河畔のみの安全な住宅自然建設試験。
 * 定数は建設を試みる候補座標群であって街区数上限ではない。
 * 地形データ未整備の丘陵・入り江は確定イベントを発行しない。
 */
import {hash01} from '../engine/rng.js';
import type {ResidentialBlock,HousingHistory,ResidentialBlockEvent} from './housing-history.js';
import {housingAt} from './housing-history.js';
import {findHousingGroundConflicts} from '../scene/housing-ground.js';
import type {SiteObject} from '../scene/model.js';

export interface HousingProgressionInput{
 readonly history:HousingHistory;
 readonly year:number;
 readonly seed:number;
 readonly siteIndex:number;
 readonly population:number;
 readonly buildings:readonly SiteObject[];
}
export type HousingProgressionResult=
 |{status:'built';event:ResidentialBlockEvent}
 |{status:'hold';reason:'not-ready'|'unsupported-terrain'|'no-safe-plot'|'before-boundary'};

/**
 * 共通の地表検査に通ったときだけbuiltを提案。
 * イベントの追記は呼出元が観測確定年に行う。
 */
export function proposeHousingConstruction(input:HousingProgressionInput):HousingProgressionResult{
 const {history,year,seed,siteIndex,population,buildings}=input;
 if(!Number.isSafeInteger(year)||year<0)throw Error('住宅建設の年が不正');
 if(year<history.introducedYear)return {status:'hold',reason:'before-boundary'};
 if(siteIndex!==0)return {status:'hold',reason:'unsupported-terrain'};
 if(year===0||year%60!==0||population<900)return {status:'hold',reason:'not-ready'};
 const before=housingAt(history,year,'river-bank');
 const count=before.blocks.length;
 // 候補位置は描画上の屋根ではなく、現実に占有する地面の区画。
 // 密度と街区数の上限を規則にせず、候補がない場合はHOLDする。
 const offset=Math.floor(hash01(seed,year,0)*7);
 for(const y of [98,116,134,153]){
  for(let n=0;n<13;n++){
   const x=8+((n+offset)%13)*23;
   const id='river-residential-'+String(count+1).padStart(5,'0');
   const candidate:ResidentialBlock={
    blockId:id,siteId:'river-bank',
    footprint:{x,y,width:18,depth:8},
    builtYear:year,housingCount:2+Math.floor(hash01(seed,year,1)*3),
    condition:'sound',use:'occupied',
    styleId:y<120?'low':y<145?'courtyard':'terraced',
    styleSeed:(seed+year+count)>>>0,
   };
   if(findHousingGroundConflicts([...before.blocks,candidate],buildings,0).length!==0)continue;
   return {status:'built',event:{year,seq:0,kind:'built',blockId:id,after:candidate}};
  }
 }
 return {status:'hold',reason:'no-safe-plot'};
}
