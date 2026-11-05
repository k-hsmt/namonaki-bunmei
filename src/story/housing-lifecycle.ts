/**
 * H3-B: 履歴と当年の地域条件から、住宅街区の状態遷移を最大1件提案する。
 * 人口・施設・乱数状態は変更しない。確定は呼出元が行う。
 *
 * 判定順: 明示災害→損傷の修繕/放置→廃墟の修繕→利用低下→再利用。
 * 一街区につき同一年1件。修繕と再利用は異なる確定年に発生する。
 */
import {housingAt,type HousingHistory,type ResidentialBlock,type ResidentialBlockEvent,type HousingEventKind} from './housing-history.js';

export interface HousingLifecycleInput {
 readonly history:HousingHistory;
 readonly year:number;
 readonly siteId:'river-bank'|'hill-side'|'coast-inlet';
 readonly population:number;
 readonly coverage:number;
 readonly shortageYears:number;
 readonly hazard?:{readonly id:string;readonly kind:string};
}
export interface HousingLifecycleProposal {
 readonly kind:HousingEventKind;
 readonly blockId:string;
 readonly after:ResidentialBlock;
 readonly causeRecordId?:string;
 readonly reason:'hazard'|'prolonged-shortage'|'repair-capacity'|'reoccupation';
}
const age=(year:number,start:number)=>year-start;
const finite=(value:number)=>Number.isFinite(value);
const latestEventYear=(history:HousingHistory,blockId:string,builtYear:number)=>
 history.events.reduce((last,e)=>e.blockId===blockId?e.year:last,builtYear);
const hazardAffects=(kind:string,siteId:HousingLifecycleInput['siteId'])=>
 kind==='earthquake'||
 (siteId==='river-bank'&&(kind==='fire'||kind==='flood'))||
 (siteId==='coast-inlet'&&kind==='storm');

export function proposeHousingLifecycle(input:HousingLifecycleInput):HousingLifecycleProposal|null {
 const {history,year,siteId,population,coverage,shortageYears,hazard}=input;
 if(!Number.isSafeInteger(year)||year<0||!finite(coverage)||coverage<0||coverage>1||
    !Number.isSafeInteger(population)||population<0||
    !Number.isSafeInteger(shortageYears)||shortageYears<0)throw Error('住宅状態判定の入力が不正');
 if(year<history.introducedYear)return null;
 const view=housingAt(history,year,siteId);
 // 旧住宅は推定しない。明示的なbuiltイベントから作られた街区だけを更新する。
 for(const block of view.blocks){
  const last=latestEventYear(history,block.blockId,block.builtYear);
  if(last>=year)continue;
  const elapsed=age(year,last);
  const totalAge=age(year,block.builtYear);
  const transition=(kind:HousingEventKind,after:ResidentialBlock,
   reason:HousingLifecycleProposal['reason'],causeRecordId?:string):HousingLifecycleProposal=>
   ({kind,blockId:block.blockId,after,reason,...(causeRecordId?{causeRecordId}:{})});
  if(block.condition==='sound'&&hazard&&hazardAffects(hazard.kind,siteId)&&
     totalAge>=3){
   return transition('damaged',{...block,condition:'damaged'},'hazard',hazard.id);
  }
  if(block.condition==='damaged'){
   // 災害の当年は先に損傷を確定。後年にのみ修繕か廃墟化する。
   if(elapsed>=4&&coverage>=.94&&population>=900)
    return transition('repaired',{...block,condition:'sound',lastRenovatedYear:year},'repair-capacity');
   if(elapsed>=15&&coverage<.78&&shortageYears>=8)
    return transition('ruined',{...block,condition:'ruined',use:'vacant'},'prolonged-shortage');
   continue;
  }
  if(block.condition==='ruined'){
   if(elapsed>=12&&coverage>=.96&&population>=1200)
    return transition('repaired',{...block,condition:'sound',use:'vacant',lastRenovatedYear:year},'repair-capacity');
   continue;
  }
  // 健全な空き家は修繕ではなく再利用できる。廃墟なら必ずrepairedを先行させる。
  if(block.use==='vacant'){
   if(elapsed>=3&&coverage>=.92&&population>=900)
    return transition('reused',{...block,use:'occupied'},'reoccupation');
  }else if(block.use==='underused'){
   if(elapsed>=8&&coverage<.76&&shortageYears>=9)
    return transition('vacated',{...block,use:'vacant'},'prolonged-shortage');
  }else if(block.use==='occupied'){
   if(elapsed>=12&&coverage<.85&&shortageYears>=5)
    return transition('underused',{...block,use:'underused'},'prolonged-shortage');
  }
 }
 return null;
}

/**
 * 同一年の住宅建設イベントに続く場合もseqを単調増加させる。
 * H1のevent reducerで検査可能な形だけを返す。
 */
export function appendHousingLifecycle(
 history:HousingHistory,year:number,proposal:HousingLifecycleProposal,
 causeRecordId:string,
):HousingHistory{
 if(history.events.some(e=>e.year===year&&e.blockId===proposal.blockId))
  throw Error('同一年の住宅街区状態変更が重複');
 const sameYear=history.events.filter(e=>e.year===year);
 if(history.events.some(e=>e.year>year))throw Error('過去年への住宅状態遡及');
 const seq=sameYear.length?Math.max(...sameYear.map(e=>e.seq))+1:0;
 const event:ResidentialBlockEvent={
  year,seq,kind:proposal.kind,blockId:proposal.blockId,after:proposal.after,
  causeRecordId,
 };
 const next={...history,events:[...history.events,event]};
 housingAt(next,year); // 年次・変更許可属性・廃墟原子性を確定前に検証
 return next;
}
