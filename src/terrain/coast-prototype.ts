/** D1-C coast geometry. No live game/save imports. */
import {hillContains,hillAccess,probeHillInitialPlots,terrainHash,type Point,type Plot,type HillRaster} from './hill-prototype.js';
export const coastVariants=['C01','C02','C03','C04','C05','C06','C07','C08'] as const;
export type CoastVariant=typeof coastVariants[number];
export const coastLabels:Record<CoastVariant,string>={C01:'Broad shallow bay',C02:'Deep inlet',C03:'Sheltered inner bay',C04:'Cape and bay',C05:'Twin coves',C06:'River mouth',C07:'Sandbar inlet',C08:'Rocky shore'};
export interface CoastPrototype {
 generatorId:'coast-prototype-v1';seed:number;variant:CoastVariant;attempt:number;
 sea:readonly Point[];freshwater:readonly {streamId:string;polygon:readonly Point[]}[];
 sandbars:readonly (readonly Point[])[];rocks:readonly (readonly Point[])[];
}
export interface CoastRaster extends HillRaster {surface:Uint8Array}
export function generateCoastPrototype(input:number,variant:CoastVariant='C01',mouths:1|2=1,attempt=0):CoastPrototype {
 if(!coastVariants.includes(variant)||!Number.isSafeInteger(attempt)||attempt<0||attempt>31||![1,2].includes(mouths))throw Error('invalid coast prototype parameters');
 const seed=(input>>>0)||1,h=terrainHash(['coast-prototype-v1',seed,'coast','coast-inlet',variant,attempt,'shape']);
 const dx=h%13-6,dy=(h>>>8)%5-2;
 const curves:Record<CoastVariant,readonly Point[]>={
  C01:[[269,96],[239,109],[219,127],[210,145],[224,164],[253,180]],
  C02:[[280,96],[216,108],[155,128],[124,149],[149,166],[215,180]],
  C03:[[320,125],[266,130],[246,113],[210,103],[157,105],[121,122],[119,147],[154,164],[211,167],[247,154],[269,145],[320,149]],
  C04:[[261,96],[215,108],[246,121],[284,132],[258,143],[183,153],[155,169],[193,180]],
  C05:[[256,96],[190,104],[163,117],[195,128],[275,134],[280,143],[212,150],[159,163],[190,175],[247,180]],
  C06:[[268,96],[246,115],[221,132],[192,147],[178,164],[211,180]],
  C07:[[274,96],[216,105],[160,123],[143,147],[173,169],[242,180]],
  C08:[[276,96],[235,105],[251,116],[205,125],[232,140],[194,149],[217,162],[203,180]],
 };
 const curve=curves[variant].map(([x,y])=>[x===320?320:x+dx,y===96||y===180?y:y+dy] as Point);
 // C03 already traces the complete inner bay between two outer-sea ports.
 const sea=variant==='C03'?[...curve,[320,125] as Point]:[...curve,[320,180] as Point,[320,96] as Point];
 if(variant==='C03')sea.pop(); // closing is implicit, no duplicated endpoint
 const freshwater:CoastPrototype['freshwater'][number][]=[];
 if(variant==='C06'){
  freshwater.push({streamId:mouths===2?'mouth-a':'main',polygon:[[91+dx,96],[108+dx,96],[136+dx,115],[159+dx,132],[204+dx,147],[221+dx,158],[195+dx,164],[172+dx,151],[145+dx,139],[123+dx,118]]});
  if(mouths===2)freshwater.push({streamId:'mouth-b',polygon:[[151+dx,96],[168+dx,96],[186+dx,112],[205+dx,126],[237+dx,139],[220+dx,151],[191+dx,135],[169+dx,116]]});
 }
 const sandbars=variant==='C07'?[[[241+dx,180],[261+dx,158],[269+dx,130],[278+dx,118],[285+dx,136],[277+dx,165],[266+dx,180]] as Point[]]:[];
 const rocks=variant==='C08'?[
  [[203+dx,96],[247+dx,96],[226+dx,109],[241+dx,117],[200+dx,125],[184+dx,116]] as Point[],
  [[178+dx,135],[205+dx,132],[222+dx,141],[185+dx,153],[175+dx,166],[159+dx,157]] as Point[],
 ]:[];
 return {generatorId:'coast-prototype-v1',seed,variant,attempt,sea,freshwater,sandbars,rocks};
}
export function rasterizeCoast(t:CoastPrototype):CoastRaster {
 const surface=new Uint8Array(57600),elevation=new Uint8Array(57600),grade=new Uint8Array(57600),bearing=new Uint8Array(57600);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const i=y*320+x,px=x+.5,py=y+.5;surface[i]=1;
  if(hillContains(t.sea,px,py))surface[i]=3;
  else if(t.freshwater.some(f=>hillContains(f.polygon,px,py)))surface[i]=2;
  if(t.sandbars.some(p=>hillContains(p,px,py))){surface[i]=1;bearing[i]=1;}
  if(surface[i]===1&&t.rocks.some(p=>hillContains(p,px,py))){bearing[i]=2;grade[i]=2;elevation[i]=24;}
 }return {width:320,height:180,surface,elevation,grade,bearing};
}
/** Diagnostic adapter only: block non-land before using the D1-B 2x2 graph. */
export function coastLandRaster(r:CoastRaster):HillRaster {
 const bearing=r.bearing.slice();for(let i=0;i<bearing.length;i++)if(r.surface[i]!==1)bearing[i]=2;
 return {...r,bearing};
}
export function probeCoastInitialPlots(r:CoastRaster):ReturnType<typeof probeHillInitialPlots> {
 return probeHillInitialPlots(coastLandRaster(r));
}
export function reviewCoastPlot(r:CoastRaster,p:Plot):'clear'|'water'|'outside-ground'|'unstable' {
 if(![p.x,p.y,p.width,p.depth].every(Number.isSafeInteger)||p.width<=0||p.depth<=0||p.x<0||p.y<96||p.x+p.width>320||p.y+p.depth>180)return 'outside-ground';
 for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++){
  const i=y*320+x;if(r.surface[i]!==1)return 'water';if(r.bearing[i]!==0)return 'unstable';
 }return 'clear';
}
/** Sea connectivity; optionally require every freshwater pixel to reach the sea too. */
export function coastWaterConnected(r:CoastRaster,includeFreshwater=false):boolean {
 const seen=new Uint8Array(57600),q=new Int32Array(57600);let head=0,tail=0,total=0;
 const water=(i:number)=>r.surface[i]===3||(includeFreshwater&&r.surface[i]===2);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++)if(water(y*320+x)){total++;if(x===319&&r.surface[y*320+x]===3){q[tail++]=y*320+x;seen[y*320+x]=1;}}
 while(head<tail){const i=q[head++]!,x=i%320,y=Math.floor(i/320);
  for(const [nx,ny] of [[x,y-1],[x+1,y],[x,y+1],[x-1,y]]){
   if(nx!<0||nx!>319||ny!<96||ny!>179)continue;const j=ny!*320+nx!;
   if(!seen[j]&&water(j)){seen[j]=1;q[tail++]=j;}
  }
 }return total>0&&tail===total;
}
