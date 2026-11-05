/**
 * H1: 住宅街区の確定履歴だけを再構築する。人口・保存形式・既存建物履歴には依存しない。
 * events は年とseqで厳密に整列し、変更後状態は新規値として記録する。
 */
export type HousingCondition = 'sound'|'damaged'|'ruined';
export type HousingUse = 'occupied'|'underused'|'vacant';
export type HousingEventKind = 'built'|'expanded'|'underused'|'vacated'|'damaged'|'ruined'|'repaired'|'reused';
export type HousingSiteId = 'river-bank'|'hill-side'|'coast-inlet';
export interface HousingPlot {
 readonly x:number;readonly y:number;readonly width:number;readonly depth:number;
}
/** styleSeedとstyleIdは建設時に確定し、分類変更では変更しない。 */
export interface ResidentialBlock {
 readonly blockId:string;
 readonly siteId:HousingSiteId;
 readonly footprint:HousingPlot;
 readonly builtYear:number;
 readonly housingCount:number;
 readonly condition:HousingCondition;
 readonly use:HousingUse;
 readonly styleId:'low'|'terraced'|'courtyard';
 readonly styleSeed:number;
 readonly lastRenovatedYear?:number;
}
export interface ResidentialBlockEvent {
 readonly year:number;
 readonly seq:number;
 readonly kind:HousingEventKind;
 readonly blockId:string;
 /** 後続年の変更はスナップショットとして確定。既存ID・位置・建設年・様式を保持。 */
 readonly after:ResidentialBlock;
 readonly causeRecordId?:string;
}
export interface HousingHistory {
 /** この年より前に住宅記録がないことは「住戸0」と同義ではない。 */
 readonly introducedYear:number;
 readonly legacyUntracked:boolean;
 readonly events:readonly ResidentialBlockEvent[];
}
export interface HousingView {
 readonly status:'unknown'|'partial'|'known';
 readonly blocks:readonly ResidentialBlock[];
}
const fail=(message:string):never=>{throw new Error('住宅街区履歴: '+message);};
const int=(v:number)=>Number.isSafeInteger(v);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function checkBlock(b:ResidentialBlock):void{
 if(!b.blockId||!['river-bank','hill-side','coast-inlet'].includes(b.siteId))fail('街区IDまたは地点IDが不正');
 const f=b.footprint;
 if(![f.x,f.y,f.width,f.depth,b.builtYear,b.housingCount,b.styleSeed].every(int)||
 f.width<=0||f.depth<=0||f.x<0||f.y<0||f.x+f.width>320||f.y+f.depth>180||
 b.housingCount<=0||!int(b.styleSeed)||b.styleSeed<0)fail('敷地または住宅数が不正');
 if(!['low','terraced','courtyard'].includes(b.styleId))fail('建築様式が不正');
 if(!['sound','damaged','ruined'].includes(b.condition)||!['occupied','underused','vacant'].includes(b.use))fail('状態が不正');
 if(b.condition==='ruined'&&b.use!=='vacant')fail('廃墟は必ず未利用');
 if(b.lastRenovatedYear!==undefined&&(!int(b.lastRenovatedYear)||b.lastRenovatedYear<b.builtYear))fail('修繕年が不正');
}
const overlaps=(a:HousingPlot,b:HousingPlot)=>
 a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.depth&&b.y<a.y+a.depth;
/** 施設・河川との物理衝突は呼出側の確定済み土地占有データで別途検査する。 */
export function housingAt(history:HousingHistory|undefined,year:number,siteId?:HousingSiteId):HousingView{
 if(!int(year)||year<0)fail('観測年が不正');
 if(!history)return {status:'unknown',blocks:[]};
 if(!int(history.introducedYear)||history.introducedYear<0)fail('導入年が不正');
 if(year<history.introducedYear)return {status:history.legacyUntracked?'unknown':'known',blocks:[]};
 const current=new Map<string,ResidentialBlock>();
 let prevYear=-1,prevSeq=-1;
 for(const event of history.events){
  if(!int(event.year)||!int(event.seq)||event.seq<0||event.year<history.introducedYear||
   event.year<prevYear||(event.year===prevYear&&event.seq<=prevSeq))fail('イベント順序が不正');
  prevYear=event.year;prevSeq=event.seq;
  if(event.year>year)break;
  const b=event.after,old=current.get(event.blockId);
  checkBlock(b);
  if(event.blockId!==b.blockId)fail('街区ID不一致');
  if(b.lastRenovatedYear!==undefined&&b.lastRenovatedYear>event.year)fail('修繕年がイベント確定年より未来');
  if(event.kind==='built'){
   if(old||b.builtYear!==event.year||b.condition!=='sound'||b.use!=='occupied'||b.lastRenovatedYear!==undefined)fail('重複建設または建設時状態が不正');
   for(const other of current.values())if(other.siteId===b.siteId&&overlaps(other.footprint,b.footprint))fail('住宅敷地が重複');
  }else{
   if(!old)throw new Error('住宅街区履歴: 未建設街区の更新');
   if(old.siteId!==b.siteId||old.builtYear!==b.builtYear||
    !same(old.footprint,b.footprint)||old.styleId!==b.styleId||old.styleSeed!==b.styleSeed)fail('街区の不変属性が変更された');
   // 変更可能な属性はイベント種類ごとに限定する。
   // blockId/siteId/footprint/builtYear/styleId/styleSeed は上で不変性を検証済み。
   const changedStock=b.housingCount!==old.housingCount;
   const changedCondition=b.condition!==old.condition;
   const changedUse=b.use!==old.use;
   const changedRenovation=b.lastRenovatedYear!==old.lastRenovatedYear;
   switch(event.kind){
    case 'expanded':
     if(!changedStock||b.housingCount<=old.housingCount||
        changedCondition||changedUse||changedRenovation)fail('増築が不正');
     break;
    case 'underused':
     if(changedStock||changedCondition||changedRenovation||
        old.use!=='occupied'||b.use!=='underused')fail('低利用の遷移が不正');
     break;
    case 'vacated':
     if(changedStock||changedCondition||changedRenovation||
        old.use==='vacant'||b.use!=='vacant')fail('空き家化の遷移が不正');
     break;
    case 'damaged':
     if(changedStock||changedUse||changedRenovation||
        old.condition!=='sound'||b.condition!=='damaged')fail('損傷の遷移が不正');
     break;
    case 'ruined':
     // H1では長期損傷の履歴を経た街区のみ、明示イベントで廃墟化する。
     // 利用状態のvacantへの切替は同一イベントで原子的に確定する。
     if(changedStock||changedRenovation||
        old.condition!=='damaged'||b.condition!=='ruined'||b.use!=='vacant')fail('廃墟化の遷移が不正');
     break;
    case 'repaired':
     if(changedStock||changedUse||
        !['damaged','ruined'].includes(old.condition)||b.condition!=='sound'||
        (old.condition==='ruined'&&b.use!=='vacant')||
        b.lastRenovatedYear!==event.year)fail('修繕の遷移が不正');
     break;
    case 'reused':
     if(changedStock||changedCondition||changedRenovation||
        old.condition!=='sound'||old.use!=='vacant'||
        !['underused','occupied'].includes(b.use))fail('再利用の遷移が不正');
     break;
    default: fail('未知のイベント種別');
   }
  }
  current.set(b.blockId,{...b,footprint:{...b.footprint}});
 }
 return {status:history.legacyUntracked?'partial':'known',blocks:[...current.values()].filter(b=>!siteId||b.siteId===siteId).sort((a,b)=>a.blockId.localeCompare(b.blockId))};
}
