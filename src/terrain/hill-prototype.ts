/** D1-B only: initial hill geometry and diagnostics; never imported by the live game. */
export const hillVariants = ['H01','H02','H03','H04','H05','H06','H07','H08'] as const;
export type HillVariant = typeof hillVariants[number];
export const hillLabels:Record<HillVariant,string> = {
 H01:'One long hillside',H02:'Two round hills',H03:'Wide valley',H04:'Broad plateau',
 H05:'Rolling low hills',H06:'Diagonal ridge',H07:'River terraces',H08:'Rocky narrow valley',
};
export type Point = readonly [number,number];
export interface HillShape {
 id:string; kind:'plateau'|'slope'|'cliff'; polygon:readonly Point[];
 elevation:number; profile:null|{axis:'x'|'y';knots:readonly Point[]};
}
export interface HillPrototype {
 generatorId:'hill-prototype-v1'; seed:number; variant:HillVariant; attempt:number;
 shapes:readonly HillShape[];
}
export interface HillRaster {
 width:320;height:180;elevation:Uint8Array;grade:Uint8Array;bearing:Uint8Array;
}
export interface Plot {x:number;y:number;width:number;depth:number}
/** Length-prefixed UTF-8 FNV-1a + integer mix, as specified by D0 A.6. */
export function terrainHash(parts:readonly (string|number)[]):number {
 let h=2166136261;
 const byte=(b:number)=>{h=Math.imul(h^b,16777619);};
 for(const part of parts){
  const data=new TextEncoder().encode(String(part));
  for(let n=0;n<4;n++)byte((data.length>>>(n*8))&255);
  for(const b of data)byte(b);
 }
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;
 h=Math.imul(h,0x846ca68b);h^=h>>>16;return h>>>0;
}
export function hillVariantForSeed(input:number):HillVariant {
 const seed=(input>>>0)||1;
 return hillVariants[terrainHash(['hill-prototype-v1',seed,'hills','hill-side','',0,'variant'])%8]!;
}
/** Explicit variant override is for labelled catalog review, not production selection. */
export function generateHillPrototype(input:number,variant:HillVariant=hillVariantForSeed(input),attempt=0):HillPrototype {
 if(!hillVariants.includes(variant))throw Error('unknown hill variant');
 if(!Number.isSafeInteger(attempt)||attempt<0||attempt>31)throw Error('invalid attempt');
 const seed=(input>>>0)||1,shapes:HillShape[]=[];
 const pick=(key:string,n:number)=>terrainHash(['hill-prototype-v1',seed,'hills','hill-side',variant,attempt,key])%n;
 const shift=pick('offset',13)-6,height=8+pick('height',3)*8;
 const add=(id:string,kind:HillShape['kind'],polygon:readonly Point[],elevation:number,
  profile:HillShape['profile']=null)=>shapes.push({id,kind,polygon,elevation,profile});
 const slope=(id:string,p:readonly Point[],axis:'x'|'y',knots:readonly Point[])=>
  add(id,'slope',p,0,{axis,knots});
 // The contour is broad and intentionally low frequency. No noise-derived grade.
 switch(variant){
 case 'H01':
  add('long-top','plateau',[[0,96],[73+shift,96],[96+shift,113],[81+shift,139],[0,151]],height);
  slope('long-foot',[[73+shift,96],[105+shift,96],[146+shift,121],[129+shift,154],[0,166],[0,151],[81+shift,139],[96+shift,113]],'x',[[0,height],[90+shift,height],[146+shift,0]]);
  break;
 case 'H02':
  for(const [n,cx] of [79+shift,236+shift].entries()){
   slope('round-'+n,[[cx-60,115],[cx-44,98],[cx+24,96],[cx+52,112],[cx+58,135],[cx+30,153],[cx-28,156],[cx-56,141]],'y',[[96,16],[112,16],[156,0]]);
   add('cap-'+n,'plateau',[[cx-34,102],[cx-12,96],[cx+20,100],[cx+34,110],[cx+12,116],[cx-26,114]],16);
  }break;
 case 'H03':
  slope('valley-left',[[0,96],[77+shift,96],[89+shift,114],[68+shift,139],[54+shift,180],[0,180]],'x',[[0,height],[26,height],[89+shift,0]]);
  slope('valley-right',[[243+shift,96],[320,96],[320,180],[268+shift,180],[254+shift,144],[231+shift,116]],'x',[[231+shift,0],[290,height],[320,height]]);
  break;
 case 'H04':
  add('table','plateau',[[53+shift,96],[236+shift,96],[261+shift,116],[242+shift,139],[69+shift,139],[43+shift,120]],16);
  slope('table-face',[[43+shift,120],[69+shift,139],[242+shift,139],[261+shift,116],[280+shift,139],[250+shift,163],[60+shift,164],[28+shift,140]],'y',[[116,16],[139,16],[164,0]]);
  break;
 case 'H05':
  for(const [n,cx] of [42+shift,146+shift,265+shift].entries()){
   const y=101+pick('roll-'+n,16),h=8;
   slope('roll-'+n,[[Math.max(0,cx-47),y+12],[cx-26,y],[cx+14,y-3],[Math.min(320,cx+46),y+10],[Math.min(320,cx+49),y+28],[cx+20,y+38],[cx-27,y+34]],'y',[[y-3,h],[y+12,h],[y+38,0]]);
  }break;
 case 'H06':
  // Two ridge sections leave a real flat saddle, rather than a painted crossing.
  slope('ridge-back',[[163+shift,96],[238+shift,96],[221+shift,113],[191+shift,131],[158+shift,123],[143+shift,113]],'x',[[143+shift,0],[180+shift,16],[238+shift,0]]);
  slope('ridge-front',[[127+shift,131],[159+shift,141],[138+shift,159],[103+shift,180],[34+shift,180],[59+shift,160],[93+shift,139]],'x',[[34+shift,0],[101+shift,16],[159+shift,0]]);
  break;
 case 'H07':
  add('upper-terrace','plateau',[[0,96],[320,96],[320,112],[242,114],[162,110],[83,115],[0,112]],16);
  slope('upper-step',[[0,112],[83,115],[162,110],[242,114],[320,112],[320,129],[240,130],[160,127],[80,131],[0,128]],'y',[[110,16],[131,8]]);
  add('lower-terrace','plateau',[[0,128],[80,131],[160,127],[240,130],[320,129],[320,148],[238,145],[156,149],[80,146],[0,150]],8);
  slope('lower-step',[[0,150],[80,146],[156,149],[238,145],[320,148],[320,166],[240,163],[160,168],[80,164],[0,166]],'y',[[145,8],[168,0]]);
  break;
 case 'H08':
  add('rock-left','cliff',[[0,96],[65+shift,96],[88+shift,111],[69+shift,125],[93+shift,143],[71+shift,161],[57+shift,180],[0,180]],24);
  add('rock-right','cliff',[[253+shift,96],[320,96],[320,180],[263+shift,180],[248+shift,160],[226+shift,143],[250+shift,122],[232+shift,110]],24);
  slope('scree-left',[[88+shift,111],[104+shift,116],[89+shift,127],[110+shift,143],[89+shift,163],[74+shift,180],[57+shift,180],[71+shift,161],[93+shift,143],[69+shift,125]],'x',[[57+shift,8],[110+shift,0]]);
  slope('scree-right',[[232+shift,110],[216+shift,116],[232+shift,127],[210+shift,143],[232+shift,164],[247+shift,180],[263+shift,180],[248+shift,160],[226+shift,143],[250+shift,122]],'x',[[210+shift,0],[263+shift,8]]);
  break;
 }
 if(variant==='H07')for(const shape of shapes){
  shape.polygon=shape.polygon.map(([x,y])=>[x,y===96?y:y+shift]);
  if(shape.profile)shape.profile={axis:'y',knots:shape.profile.knots.map(([q,h])=>[q+shift,h])};
 }
 return {generatorId:'hill-prototype-v1',seed,variant,attempt,shapes};
}
/** Pixel-center even/odd fill; half-open edge crossings. */
export function hillContains(p:readonly Point[],x:number,y:number):boolean {
 let inside=false;
 for(let i=0,j=p.length-1;i<p.length;j=i++){
  const a=p[i]!,b=p[j]!;
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
function shapeHeight(s:HillShape,x:number,y:number):number {
 if(!s.profile)return s.elevation;
 const q=s.profile.axis==='x'?x:y,k=s.profile.knots;
 for(let i=1;i<k.length;i++){
  const a=k[i-1]!,b=k[i]!;
  if(q<=b[0])return Math.round(a[1]+(b[1]-a[1])*Math.max(0,Math.min(1,(q-a[0])/(b[0]-a[0]))));
 }return k[k.length-1]![1];
}
export function rasterizeHill(t:HillPrototype):HillRaster {
 const elevation=new Uint8Array(320*180),grade=new Uint8Array(320*180),bearing=new Uint8Array(320*180);
 for(const shape of t.shapes)for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  if(!hillContains(shape.polygon,x+.5,y+.5))continue;
  const i=y*320+x;elevation[i]=shapeHeight(shape,x+.5,y+.5);bearing[i]=shape.kind==='cliff'?2:0;
 }
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const i=y*320+x;let diff=0;
  for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
   if(nx!<0||nx!>=320||ny!<96||ny!>=180)continue;
   diff=Math.max(diff,Math.abs(elevation[i]!-elevation[ny!*320+nx!]!));
  }grade[i]=bearing[i]===2?2:Math.min(2,diff);
 }
 return {width:320,height:180,elevation,grade,bearing};
}
export function reviewHillPlot(r:HillRaster,p:Plot):'clear'|'outside-ground'|'steep'|'unstable' {
 if(![p.x,p.y,p.width,p.depth].every(Number.isSafeInteger)||p.width<=0||p.depth<=0||p.x<0||p.y<96||p.x+p.width>320||p.y+p.depth>180)return 'outside-ground';
 let lo=255,hi=0;
 for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++){
  const i=y*320+x;if(r.bearing[i]!==0)return 'unstable';if(r.grade[i]!>1)return 'steep';
  lo=Math.min(lo,r.elevation[i]!);hi=Math.max(hi,r.elevation[i]!);
 }return hi-lo>2?'steep':'clear';
}
/** All connectivity uses 2x2 window origins. Occupancy is ground, never roof bounds. */
export function hillAccess(r:HillRaster,occupied:readonly Plot[]=[]):{walk:Uint8Array;component:Int32Array;roots:Point[]} {
 const walk=new Uint8Array(320*180),component=new Int32Array(320*180);component.fill(-1);
 const blocked=new Uint8Array(320*180);
 for(const p of occupied)for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++)blocked[y*320+x]=1;
 for(let y=96;y<179;y++)for(let x=0;x<319;x++){
  const cells=[y*320+x,y*320+x+1,(y+1)*320+x,(y+1)*320+x+1];
  if(cells.every(i=>r.grade[i]!<=1&&r.bearing[i]===0&&!blocked[i]))walk[y*320+x]=1;
 }
 const roots:Point[]=[],queue=new Int32Array(320*180);let id=0;
 for(let y=96;y<179;y++)for(let x=0;x<319;x++){
  const start=y*320+x;if(!walk[start]||component[start]!==-1)continue;
  let head=0,tail=1,root:Point|undefined;queue[0]=start;component[start]=id;
  while(head<tail){
   const i=queue[head++]!,px=i%320,py=Math.floor(i/320);
   if((px===0||px===318||py===96||py===178)&&(!root||py<root[1]||(py===root[1]&&px<root[0])))root=[px,py];
   for(const [nx,ny] of [[px,py-1],[px+1,py],[px,py+1],[px-1,py]]){
    if(nx!<0||nx!>318||ny!<96||ny!>178)continue;
    const j=ny!*320+nx!;if(walk[j]&&component[j]===-1){component[j]=id;queue[tail++]=j;}
   }
  }if(root)roots[id]=root;id++;
 }return {walk,component,roots};
}
/** D1 existence check only. Does not rank or reserve any future facility. */
export function probeHillInitialPlots(r:HillRaster):null|{house:Plot;field:Plot;root:Point} {
 const base=hillAccess(r);
 const house:Plot={x:0,y:0,width:18,depth:7},field:Plot={x:0,y:0,width:26,depth:14};
 const entry=(p:Plot)=>[p.x+Math.floor((p.width-2)/2),p.y+p.depth] as const;
 for(let y=98;y<=156;y+=2)for(let x=2;x<=292;x+=2){
  house.x=x;house.y=y;if(reviewHillPlot(r,house)!=='clear')continue;
  const he=entry(house),hc=base.component[he[1]*320+he[0]]!;if(hc<0||!base.roots[hc])continue;
  // Bounded nearby pair fixture; full D3 scores and reservations are not implemented here.
  for(const [dx,dy] of [[24,0],[-32,0],[0,18],[24,18],[-32,18]]){
   field.x=x+dx!;field.y=y+dy!;if(reviewHillPlot(r,field)!=='clear')continue;
   const fe=entry(field),fc=base.component[fe[1]*320+fe[0]]!;if(fc!==hc)continue;
   const after=hillAccess(r,[house,field]),a=after.component[he[1]*320+he[0]]!,b=after.component[fe[1]*320+fe[0]]!;
   if(a>=0&&a===b&&after.roots[a])return {house:{...house},field:{...field},root:after.roots[a]!};
  }
 }return null;
}
