/** Append-only cursors for a privately owned annual world. No full history scan per year. */
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
import {lastObservedYear} from '../story/engine.js';
import {vegetationSites,type VegetationEvent} from '../vegetation/history-v1.js';
import type {LandUseEvent} from './model-v1.js';
import type {GroundPlot} from '../terrain/ground-access-review.js';

export function annualLandSources(r:GeneratedFacilityReview){
 let through=-1,placement=0,bridge=0,housing=0,space=0,history=0;
 const changes=[0,0,0],previous=vegetationSites.map(()=>new Map<string,string>()),plots=new Map<string,GeneratedFacilityReview['placements'][number]>(),records=new Map<string,GeneratedFacilityReview['state']['history'][number]>();
 return {take(){
  const end=lastObservedYear(r.state);if(end<through)throw Error('Cannot rewind annual land cursor');
  const uses:LandUseEvent[]=[],events:VegetationEvent[]=[],riverChanges:{year:number;id:string}[]=[],causes:GeneratedFacilityReview['state']['history']=[];
  const changed=(year:number,id:string|undefined)=>{if(!id)throw Error('Missing land-use source');riverChanges.push({year,id});};
  const use=(id:string,year:number,site:LandUseEvent['site'],objectId:string,sourceRecordId:string,plot:GroundPlot,active:boolean,farm=false)=>uses.push({id,year,site,objectId,sourceRecordId,plot:{...plot},active,farm});
  const vegetation=(id:string,year:number,site:VegetationEvent['site'],kind:VegetationEvent['kind'],plot:GroundPlot,sourceRecordId:string)=>{
   const record=records.get(sourceRecordId);if(!record||record.year!==year)throw Error('Unconfirmed vegetation source');events.push({id,year,site,kind,plot:{...plot},sourceRecordId});
  };
  while(history<r.state.history.length&&r.state.history[history]!.year<=end){const e=r.state.history[history++]!;records.set(e.id,e);if(e.kind==='irrigation')causes.push(e);}
  while(placement<r.placements.length&&r.placements[placement]!.builtYear<=end){const p=r.placements[placement++]!;plots.set(p.objectId,p);
   use('foundation/'+p.objectId,p.builtYear,p.site,p.objectId,p.sourceRecordId,p.plot,true,p.kind==='field');vegetation('foundation/'+p.objectId,p.builtYear,p.site,'clear',p.plot,p.sourceRecordId);if(p.site==='river-bank')changed(p.builtYear,p.sourceRecordId);
  }
  const bridges=r.bridgeReview?.bridges??[];
  while(bridge<bridges.length&&bridges[bridge]!.builtYear<=end){const b=bridges[bridge++]!;for(const [n,p]of b.geometry.bankSupports.entries()){
   const id='bridge/'+b.geometry.bridgeId+'/'+n;use(id,b.builtYear,'river-bank',b.geometry.bridgeId+'/'+n,b.sourceRecordId,p,true);vegetation(id,b.builtYear,'river-bank','clear',p,b.sourceRecordId);
  }}
  const homes=r.state.housing?.events??[];
  while(housing<homes.length&&homes[housing]!.year<=end){const e=homes[housing++]!;if(e.after.siteId==='river-bank')changed(e.year,e.causeRecordId);
   if(e.kind==='built'){use('housing/'+e.blockId,e.year,e.after.siteId,e.blockId,e.causeRecordId!,e.after.footprint,true);vegetation('housing/'+e.blockId,e.year,e.after.siteId,'clear',e.after.footprint,e.causeRecordId!);}
  }
  const spaces=r.state.publicSpaces?.events??[];
  while(space<spaces.length&&spaces[space]!.year<=end){const e=spaces[space++]!;if(e.after.siteId==='river-bank')changed(e.year,e.causeRecordId);
   use('space/'+e.spaceId+'/'+e.seq,e.year,e.after.siteId,e.spaceId,e.causeRecordId,e.after.footprint,e.after.condition==='used');vegetation('space/'+e.spaceId+'/'+e.year+'/'+e.seq,e.year,e.after.siteId,e.kind==='overgrown'?'release':'clear',e.after.footprint,e.causeRecordId);
  }
  for(const [index,site]of vegetationSites.entries()){
   const ledger=r.state.observation?.sites?.[index]?.buildingChanges??[],prior=previous[index]!;
   while(changes[index]!<ledger.length&&ledger[changes[index]!]!.year<=end){const n=changes[index]!,c=ledger[n]!;changes[index]=n+1;
    const b=c.building,p=plots.get(b.id),before=prior.get(b.id);prior.set(b.id,b.condition);
    if(index===0)changed(c.year,b.recordId??(c.year===0&&p?.builtYear===0?p.sourceRecordId:undefined));
    if(!p||before===undefined)continue;
    if(b.kind==='field'&&p.kind==='field'&&(b.condition==='ruined')!==(before==='ruined'))use('field/'+p.objectId+'/'+n,c.year,site,p.objectId,b.recordId!,p.plot,b.condition!=='ruined',true);
    if(!b.recordId)continue;
    if(b.kind==='field'&&b.condition!==before&&(b.condition==='ruined'||before==='ruined'))vegetation('field/'+b.id+'/'+c.year,c.year,site,b.condition==='ruined'?'release':'clear',p.plot,b.recordId);
    if(b.condition==='damaged'&&before!=='damaged'&&records.get(b.recordId)?.relatedIds?.some(id=>records.get(id)?.kind==='fire')){
     const x=Math.max(0,p.plot.x-24),y=Math.max(96,p.plot.y-24),plot={x,y,width:Math.min(320,p.plot.x+p.plot.width+24)-x,depth:Math.min(180,p.plot.y+p.plot.depth+24)-y};vegetation('fire/'+b.id+'/'+c.year,c.year,site,'fire',plot,b.recordId);
    }
   }
  }
  through=end;uses.sort((a,b)=>a.year-b.year);events.sort((a,b)=>a.year-b.year||(a.site<b.site?-1:a.site>b.site?1:0)||(a.id<b.id?-1:a.id>b.id?1:0));
  return {through,uses,events,riverChanges,causes};
 }};
}
export type AnnualLandDelta=ReturnType<ReturnType<typeof annualLandSources>['take']>;
