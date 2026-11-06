import {projectStreetscape} from './streetscape.js';
import type {HousingHistory} from '../story/housing-history.js';
import type {SiteSnapshot,SiteObject,VisualProfile} from './model.js';
import {composeScene,type SceneComposition} from './composition.js';
const W=320,H=180;
type C=CanvasRenderingContext2D;
const P={sky:'#b3c2b4',skyBottom:'#dfd3b1',far:'#8b9c85',hill:'#73896e',ground:'#9a9a70',front:'#76805b',bank:'#9d926c',river:'#658f92',riverLight:'#a0b5a1',wood:'#70594b',roof:'#8c6655',stone:'#aaa18a',bright:'#e6d6b2',dark:'#454e48',grass:'#5d7954'};
function rect(c:C,x:number,y:number,w:number,h:number,col:string){c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function poly(c:C,points:number[],col:string){c.fillStyle=col;c.beginPath();c.moveTo(points[0]!,points[1]!);for(let i=2;i<points.length;i+=2)c.lineTo(points[i]!,points[i+1]!);c.closePath();c.fill();}
function rng(seed:number){let z=seed>>>0;return ()=>{z=(Math.imul(1664525,z)+1013904223)>>>0;return z/4294967296;};}
function tree(c:C,x:number,y:number,k=1){rect(c,x-1*k,y-8*k,3*k,12*k,'#625745');rect(c,x-6*k,y-20*k,13*k,11*k,'#607b57');rect(c,x-10*k,y-17*k,8*k,9*k,'#77916a');rect(c,x+4*k,y-16*k,7*k,9*k,'#4d7055');rect(c,x-4*k,y-24*k,9*k,6*k,'#849672');}
/** H4-D1: 建設時の施設種別だけで輪郭を決める。規模・年・人口に依存しない。 */
/** H4-D4-C: 新築時に確定した公共施設だけを大きい建築として描く。
 * 実施設の独立した1件であり、住宅や規模分類から生成される飾りではない。
 */
export function drawCivicArchitecture(c:C,o:SiteObject):void{
 const civic=o.civic;
 if(!civic||o.kind!=='hall')return;
 const {x,y}=o;
 const court=civic.architectureStyle==='courtyard-hall';
 const half=court?28:22;
 if(o.condition==='ruined'){
  // 同じ様式を維持したまま、壁・屋根の一部が欠ける。
  rect(c,x-half-1,y-3,half*2+3,5,'#8b8874');
  rect(c,x-half-1,y-18,7,18,'#9b947c');
  rect(c,x+half-5,y-15,6,17,'#a79b80');
  if(court){
   rect(c,x-12,y-6,24,3,'#a39c83');
   rect(c,x-25,y-21,15,3,'#7c7464');
   rect(c,x+14,y-23,13,3,'#857767');
  }else{
   poly(c,[x-21,y-19,x-9,y-27,x-3,y-20],'#857867');
   rect(c,x+9,y-21,9,3,'#777064');
  }
  for(let k=-half+8;k<half;k+=11)rect(c,x+k,y+3,3,2,'#747e66');
  return;
 }
 const damaged=o.condition==='damaged';
 if(court){
  // 低い両翼棟と中央に開いた中庭。「大きい家」にならない空間的な抜け。
  rect(c,x-29,y-15,19,17,'#b0a18a');
  rect(c,x+11,y-15,19,17,'#b5a68b');
  poly(c,[x-32,y-15,x-20,y-29,x-7,y-15],'#80756a');
  poly(c,[x+8,y-15,x+20,y-30,x+33,y-15],'#80756a');
  // 奥の回廊と手前の回廊で中庭の空隙を囲む。
  rect(c,x-13,y-19,27,4,'#997f67');
  for(const dx of [-11,-4,4,11])rect(c,x+dx,y-14,2,6,'#c5ae8c');
  rect(c,x-11,y-8,23,10,'#b7a888');
  rect(c,x-10,y-7,21,7,'#a99c7f');
  rect(c,x-3,y-4,7,4,'#879777');
  rect(c,x-31,y+1,63,3,'#847765');
  rect(c,x-18,y-7,5,7,'#5d5d52');
  rect(c,x+14,y-7,5,7,'#5d5d52');
  // 手前の列柱を断続的にして中庭が原寸で見える余地を保つ。
  for(const dx of [-10,10])rect(c,x+dx,y-1,2,4,'#8e775e');
  if(damaged){rect(c,x+16,y-26,7,5,'#a29b83');rect(c,x-26,y-15,5,4,'#6c665b');}
 }else{
  // 大きな会堂：通常のhallより屋根高と列柱のスパンを大きく取る。
  rect(c,x-22,y-17,45,19,'#b7aa91');
  rect(c,x-24,y-21,49,5,'#8d7967');
  poly(c,[x-26,y-21,x,y-38,x+26,y-21],'#77756d');
  rect(c,x-26,y+1,53,3,'#8c7e68');
  for(const dx of [-18,-11,10,17])rect(c,x+dx,y-11,3,13,'#d0bfa0');
  rect(c,x-5,y-10,11,12,'#545b55');
  rect(c,x-4,y-12,9,2,'#8b806f');
  if(damaged){rect(c,x+12,y-31,8,5,'#aaa18a');rect(c,x-22,y-20,6,3,'#656960');}
 }
}
export function drawBuildingSprite(c:C,o:SiteObject,stone:boolean):void {
 const {x,y}=o;
 if(o.condition==='ruined'){
  // 廃墟でも元の種別を捨てず、輪郭の一部を残す。
  const wide=o.kind==='hall'?31:o.kind==='granary'?17:o.kind==='workshop'?25:21;
  const left=x-Math.floor(wide/2);
  rect(c,left,y-4,wide,6,'#978e78');
  rect(c,left,y-9,o.kind==='hall'?5:3,10,'#9e9680');
  rect(c,left+wide-4,y-11,4,12,P.stone);
  rect(c,left+5,y-6,Math.max(2,wide-12),3,'#6a7166');
  if(o.kind==='granary')for(const dx of [-5,3])rect(c,x+dx,y+2,3,3,P.wood);
  return;
 }
 const wall=stone?'#aea58e':'#ab9173';
 switch(o.kind){
  case 'hall':{
   // 広い間口・高い二段屋根・中央の入口（共同施設）。
   rect(c,x-17,y-14,35,16,'#b5a58a');
   rect(c,x-18,y-18,37,5,'#8d7564');
   poly(c,[x-20,y-18,x,y-31,x+20,y-18],'#77756b');
   rect(c,x-3,y-11,7,13,P.dark);
   for(const dx of [-13,10])rect(c,x+dx,y-9,4,5,'#d1bfa0');
   rect(c,x-20,y+1,41,2,'#897b65');
   break;
  }
  case 'granary':{
   // 高床・縦長・窓の少ない箱形。
   for(const dx of [-8,6])rect(c,x+dx,y-3,3,8,P.wood);
   rect(c,x-10,y-20,21,18,'#a99d7e');
   rect(c,x-12,y-22,25,4,'#746f62');
   poly(c,[x-13,y-22,x,y-30,x+14,y-22],'#84735e');
   rect(c,x-2,y-14,4,5,P.dark);
   rect(c,x-12,y+3,25,2,'#6b6457');
   break;
  }
  case 'workshop':{
   // 横長の作業場・低い張り出し屋根と煙突。
   rect(c,x-14,y-13,29,15,wall);
   poly(c,[x-16,y-13,x-2,y-22,x+17,y-13],'#8e6957');
   rect(c,x+9,y-28,5,14,'#929083');
   rect(c,x+10,y-30,3,2,'#c4b9a3');
   rect(c,x-17,y-8,10,4,'#a58a66');
   rect(c,x-16,y-4,2,7,P.wood);
   rect(c,x-7,y-4,2,7,P.wood);
   rect(c,x+2,y-6,7,8,'#615747');
   break;
  }
  case 'house':
  case 'ruin':
  default:{
   // 規模で変化しない小さな住宅。IDごとの安定した屋根の向き。
   let h=2166136261;
   for(const ch of o.id)h=Math.imul(h^ch.charCodeAt(0),16777619);
   const extended=(h>>>0)%3===0;
   const wide=extended?25:20;
   rect(c,x-Math.floor(wide/2),y-11,wide,13,wall);
   if(extended){
    rect(c,x-Math.floor(wide/2)-1,y-16,wide+2,5,'#886859');
    rect(c,x+4,y-19,6,3,'#a18b74');
   }else{
    poly(c,[x-12,y-11,x,y-21,x+12,y-11],P.roof);
   }
   rect(c,x-2,y-5,4,7,P.dark);
   rect(c,x-8,y-7,3,3,'#c6ba99');
   break;
  }
 }
}
function cloud(c:C,x:number,y:number,dim=false){const a=dim?'#a6afa4':'#e9e1cb';rect(c,x+4,y,19,3,a);rect(c,x,y+3,31,5,a);rect(c,x+8,y-4,10,4,a);rect(c,x+2,y+8,25,2,'#c2c5b3');}
function reeds(c:C,x:number,y:number){rect(c,x,y-7,1,9,'#546e4b');rect(c,x+3,y-5,1,7,'#72885a');rect(c,x+6,y-9,1,11,'#5c7958');rect(c,x-1,y-8,3,2,'#9c8c61');}
function boat(c:C,x:number,y:number){rect(c,x,y,19,3,'#6b5c4d');rect(c,x+3,y+3,13,2,'#92765b');rect(c,x+9,y-12,1,13,'#6d6253');poly(c,[x+10,y-11,x+10,y-1,x+18,y-1],'#dfd4b0');}
function fieldDetails(c:C,x:number,y:number,dry:boolean){for(let i=0;i<5;i++){rect(c,x+i*5,y,1,12,dry?'#ab9c64':'#6c7d49');rect(c,x+i*5-1,y+3,3,2,dry?'#c7b47c':'#a6ac63');rect(c,x+i*5-1,y+7,3,2,dry?'#c7b47c':'#9cad65');}}
function person(c:C,x:number,y:number,color:string){rect(c,x,y,2,2,'#d2b894');rect(c,x-1,y+2,4,4,color);rect(c,x,y+6,1,2,P.dark);rect(c,x+2,y+6,1,2,P.dark);}
/** Paths and public space are paint on existing land, not facilities in the ledger. */
function builtGround(c:C,profile:VisualProfile,index:number):void {
 const road=profile.roadLevel,square=profile.squareLevel,shore=profile.riversideLevel;
 if(road===0){
  rect(c,44,135,58,1,'#aa9c76');rect(c,214,131,75,1,'#aa9c76');
 }else{
  const width=road>=3?7:road===2?5:3;
  // Keep the established channel free; roads run on either bank.
  rect(c,33,130,width+70,2+road,'#b5a281');
  rect(c,205,125,99,2+road,'#b5a281');
  if(road>=2){rect(c,89,113,width,39,'#b5a281');rect(c,251,109,width,42,'#b5a281');}
  if(road>=3){rect(c,36,111,84,2,'#c9b796');rect(c,213,147,96,2,'#c9b796');}
 }
 if(square>=1){
  const x=index===0?65:195,y=118;
  const w=square===1?15:square===2?27:40;
  rect(c,x,y,w,4+square,'#b7a787');
  if(square>=2)rect(c,x+2,y+1,w-4,1,'#d0bd9d');
  if(square===3){rect(c,x+4,y+6,w-8,1,'#8b856d');rect(c,x+3,y+2,1,3,'#857b67');}
 }
 if(index===0&&shore>=1){
  // Riverbank treatments stay on dry ground; bridge existence is checked separately.
  rect(c,105,137,13+shore*2,2,'#ad9e7a');
  rect(c,204,149,16+shore*4,2,'#ad9e7a');
  if(shore>=2){rect(c,206,145,23,2,'#c0ae8d');rect(c,211,143,3,2,'#8e795c');}
  if(shore>=3){rect(c,230,141,36,3,'#b9a68a');rect(c,235,139,3,2,'#8d7a61');}
 }
}
/** Street blocks are surface markings around documented building footprints.
 * No visual building copies are introduced. All marks stay on dry land.
 */
function neighborhood(c:C,buildings:readonly SiteObject[],profile:VisualProfile,index:number):void {
 const density=profile.densityLevel;
 if(density===0)return;
 const isDry=(x:number,y:number):boolean=>{
  if(x<3||x>316||y<104||y>146)return false;
  // River observation: channel occupies the middle; use conservative dry-bank masks.
  if(index===0)return (x>=33&&x<=115&&y>=109&&y<=144)||(x>=208&&x<=288&&y>=107&&y<=137);
  // Avoid claiming artificial blocks in the hills or the lakeside.
  return index===1?y<=132:false;
 };
 const occupied=buildings.filter(o=>o.kind!=='field'&&o.kind!=='bridge'&&o.kind!=='memorial'&&o.condition!=='ruined');
 for(const o of occupied){
  const x=o.x,y=o.y;
  const left=x-16,right=x+16,top=y-25,bottom=y+4;
  // Plot edges and compact paving only, below and beside real building roofs.
  for(let dx=-16;dx<=16;dx+=2){
   if(isDry(x+dx,bottom))rect(c,x+dx,bottom,2,1,'#877e64');
  }
  if(density>=2){
   for(const edge of [left,right]){
    for(let dy=-9;dy<=2;dy+=3)if(isDry(edge,y+dy))rect(c,edge,y+dy,1,2,'#a99b7c');
   }
   for(let dx=-12;dx<=12;dx+=6)if(isDry(x+dx,y+5))rect(c,x+dx,y+5,3,2,'#b9a98b');
  }
  if(density>=3){
   // Narrow gridded courtyards on existing lots; no extra building silhouettes.
   for(const side of [-1,1]){
    for(let k=0;k<3;k++){
     const px=x+side*(17+k*3),py=y-7+(k%2)*4;
     if(isDry(px,py))rect(c,px,py,2,2,k===1?'#c1b192':'#847b65');
    }
   }
   for(let dx=-14;dx<=14;dx+=4){
    if(isDry(x+dx,y+8))rect(c,x+dx,y+8,2,1,'#817965');
   }
  }
 }
 // Closely spaced land divisions only where anchored by two existing buildings.
 if(density>=3){
  const ordered=[...occupied].sort((a,b)=>a.x-b.x);
  for(let i=1;i<ordered.length;i++){
   const a=ordered[i-1]!,b=ordered[i]!;
   if(b.x-a.x>55||Math.abs(b.y-a.y)>23)continue;
   const y=Math.max(a.y,b.y)+10;
   for(let x=a.x+18;x<b.x-16;x+=5)if(isDry(x,y))rect(c,x,y,3,1,'#ab9b7e');
  }
 }
}
/** Visible use of land is derived from the buildings that actually existed at the observed year.
 * It adds no extra structures, and an overgrown plot retains its original anchor.
 */
function drawHistorySurface(c:C,scene:SceneComposition):void {
 const index=scene.siteIndex;
 for(const lot of scene.blocks){
  const {x,y,treatment}=lot;
  // Avoid water and retained shoreline landmarks in the river observation.
  if(index===0&&(x>120&&x<205))continue;
  if(treatment==='overgrown'){
   rect(c,x-12,y+3,25,2,'#71865c');
   for(let i=0;i<5;i++)rect(c,x-9+i*5,y-1+(i%2),2,4,'#6b855d');
  }else if(treatment==='paving'){
   rect(c,x-14,y+3,29,3,'#c0af8f');
   for(let i=0;i<5;i++)rect(c,x-12+i*6,y+4,3,1,'#8d8870');
  }else if(treatment==='courtyard'){
   rect(c,x-12,y+3,25,2,'#b9ab8a');
   rect(c,x-8,y+5,17,2,'#b9ab8a');
  }else{
   rect(c,x-8,y+3,17,1,'#b5a17d');
  }
 }
 // River work is only shown when historical trade structures exist.
 if(index===0&&scene.riverUse==='working'){
  rect(c,207,148,21,2,'#ae9d7c');
  for(let i=0;i<3;i++)rect(c,211+i*6,145,3,3,'#91785b');
 }
}
/** H4-D7-A: 公共空地の歴史イベントが実在する場合に限る地表。
 * 住宅・会堂・川とは独立した「占有と利用状態」の表示である。
 * 自然進行での成立判定は後工程。既存の前庭や描画からは遡及作成しない。
 */
function drawConfirmedPublicSpaces(c:C,spaces:NonNullable<SiteSnapshot['publicSpaces']>):void{
 for(const p of [...spaces].sort((a,b)=>a.id.localeCompare(b.id))){
  const f=p.footprint,overgrown=p.condition==='overgrown';
  rect(c,f.x,f.y,f.width,f.depth,overgrown?'#8d9777':'#b7a987');
  rect(c,f.x+1,f.y+1,f.width-2,1,overgrown?'#7a8967':'#9d9076');
  rect(c,f.x+1,f.y+f.depth-2,f.width-2,1,overgrown?'#778a68':'#92886f');
  if(overgrown){
   // 人が去ったあとも地表占有と形を残し、植生にゆっくり覆われる。
   for(let x=f.x+3;x<f.x+f.width-2;x+=7){
    rect(c,x,f.y+3+(x%2),3,2,'#718865');
    rect(c,x+1,f.y+5+(x%2),1,2,'#5f7c5b');
   }
  }else if(p.kind==='assembly-ground'){
   // 寄り合いの空地は舗装の少ない広場。中央に建物や人を捏造しない。
   for(let x=f.x+4;x<f.x+f.width-3;x+=9){
    rect(c,x,f.y+Math.floor(f.depth/2),4,1,'#a79a7e');
   }
   for(let y=f.y+3;y<f.y+f.depth-2;y+=6){
    rect(c,f.x+2,y,2,1,'#998e76');
    rect(c,f.x+f.width-4,y,2,1,'#998e76');
   }
  }else{
   // 市の余白。常設市場とは別の、使われる土間だけを表す。
   for(let y=f.y+3;y<f.y+f.depth-2;y+=4){
    for(let x=f.x+3+(y%2)*2;x<f.x+f.width-3;x+=7)
     rect(c,x,y,3,1,'#9c917b');
   }
  }
 }
}

/** H4-D2: 両端に確定した住宅がある歩行の痕跡と既存公共施設の前庭。
 * すべて地表検査済みであり、未記録の道路・広場を新設しない。
 */
function drawStreetscape(
 c:C,scene:SceneComposition,buildings:readonly SiteObject[],
 publicSpaces:NonNullable<SiteSnapshot['publicSpaces']>=[],
):void {
 for(const mark of projectStreetscape(scene,buildings)){
  // 実在の公共空地に、史実ではない古い前庭・歩行痕を上書きしない。
  if(publicSpaces.some(p=>
   mark.x<p.footprint.x+p.footprint.width&&p.footprint.x<mark.x+mark.width&&
   mark.y<p.footprint.y+p.footprint.depth&&p.footprint.y<mark.y+mark.depth))continue;
  if(mark.kind==='civic-margin'){
   // 実在施設の敷地のすぐ外側だけ。舗装広場ではなく土の色の揺らぎ。
   rect(c,mark.x,mark.y,mark.width,mark.depth,'#b3a489');
   if(mark.width>mark.depth)rect(c,mark.x+2,mark.y,Math.max(1,mark.width-4),1,'#a69a7d');
   else rect(c,mark.x,mark.y+2,1,Math.max(1,mark.depth-4),'#a69a7d');
   continue;
  }
  if(mark.kind==='civic-approach'){
   // 連続した2px幅の帯は柵のように見えるため避ける。
   // 短く途切れた2px以内の踏み跡で地面の使われ方を示す。
   if(mark.width>=mark.depth){
    for(let x=mark.x+1;x<mark.x+mark.width-1;x+=5){
     const n=Math.min(3,mark.x+mark.width-1-x);
     if(n>0)rect(c,x,mark.y+((x+mark.y)%3===0?1:0),n,2,'#ad9e80');
    }
   }else{
    for(let y=mark.y+1;y<mark.y+mark.depth-1;y+=5){
     const n=Math.min(3,mark.y+mark.depth-1-y);
     if(n>0)rect(c,mark.x+((mark.x+y)%3===0?1:0),y,2,n,'#ad9e80');
    }
   }
   continue;
  }
  const base=mark.kind==='lane'?'#b8a888':'#c4b294';
  rect(c,mark.x,mark.y,mark.width,mark.depth,base);
  if(mark.kind==='lane'&&mark.width>=5){
   rect(c,mark.x+1,mark.y,mark.width-2,1,'#9e9078');
  }
  if(mark.kind==='forecourt'){
   for(let dx=1;dx<mark.width-1;dx+=4)rect(c,mark.x+dx,mark.y+1,2,1,'#968b73');
  }
 }
}

/**
 * H4-B: 確定済み街区の敷地内にだけ、屋根をつなぐ生活面を描く。
 * 道路・公共施設の履歴を捏造しない。水辺や既存施設への重複は
 * composeSceneの地表占有検証に任せ、敷地外へ描画しない。
 */
function drawHousingPlotSurface(c:C,scene:SceneComposition):void{
 for(const block of scene.residentialBlocks){
  const f=block.footprint;
  const x=Math.round(f.x),y=Math.round(f.y);
  const w=Math.round(f.width),h=Math.round(f.depth);
  if(w<2||h<2)continue;
  const abandoned=block.condition==='ruined'||block.use==='vacant';
  const path=abandoned?'#8b9077':block.use==='underused'?'#a49779':'#c0ae8c';
  const edge=abandoned?'#708264':'#817660';
  // 敷地の輪郭と一本の内側通路。規模の分類ではなく住宅の実在が条件。
  rect(c,x,y+h-2,w,1,edge);
  rect(c,x+1,y+h-4,Math.max(1,w-2),2,path);
  for(let dx=1;dx<w-1;dx+=5){
   rect(c,x+dx,y+h-1,2,1,edge);
  }
  if(block.roofPartCount>1&&h>=6){
   rect(c,x+1,y+1,Math.max(1,w-2),1,abandoned?'#778762':'#b2a184');
  }
 }
}

/** H1: 履歴由来の住宅部品だけを描画する。屋根部品は独立施設ではない。 */
function drawResidentialRoofs(c:C,scene:SceneComposition,depth:'far'|'middle'|'near'):void {
 const roofs=scene.residentialBlocks.flatMap(b=>b.roofParts)
  .filter(p=>p.depth===depth).sort((a,b)=>a.y-b.y||a.x-b.x||a.partId.localeCompare(b.partId));
 for(const p of roofs){
  const width=depth==='far'?5:depth==='middle'?9:13;
  const height=depth==='far'?4:depth==='middle'?7:10;
  const x=p.x,y=p.y;
  if(p.condition==='ruined'){
   rect(c,x-width/2,y-2,width,2,'#857a66');
   rect(c,x-width/2,y-height+2,2,height-3,'#8b8677');
   rect(c,x+width/2-2,y-height+3,2,height-4,'#827a68');
   continue;
  }
  const wall=p.use==='vacant'?'#8b8e7d':p.condition==='damaged'?'#a29a80':'#b3a286';
  const roof=p.styleId==='terraced'?'#777e79':p.styleId==='courtyard'?'#9d7665':'#836657';
  rect(c,x-width/2,y-height+2,width,height-2,wall);
  if(p.styleId==='terraced'){
   // 連棟屋根：水平方向の屋根面と段差を強調する。
   rect(c,x-width/2-1,y-height,width+2,3,roof);
   rect(c,x-width/2,y-height-2,Math.max(3,width-2),2,'#a39c89');
   if(depth!=='far')rect(c,x+width/2-3,y-height+3,2,Math.max(2,height-4),'#82796a');
  }else if(p.styleId==='courtyard'){
   // 中庭型：緩い平屋根と中心の明るい抜け。
   rect(c,x-width/2-1,y-height,width+2,3,roof);
   if(width>=9)rect(c,x-2,y-height+1,4,2,'#c0ae91');
   rect(c,x-width/2,y-height-2,2,2,'#8a6e5b');
   rect(c,x+width/2-2,y-height-2,2,2,'#8a6e5b');
  }else{
   // 小屋型：同じ街区IDのまま切妻の高さに微差を持つ。
   poly(c,[x-width/2-1,y-height+2,x,y-height-3-(p.variant%2),x+width/2+1,y-height+2],roof);
   if(depth!=='far'&&p.variant===2)rect(c,x-1,y-height-4,2,2,'#a6957e');
  }
  if(depth!=='far'){
   rect(c,x-width/2+2,y-3,2,2,p.use==='vacant'?'#555a54':'#665849');
   if(p.condition==='damaged')rect(c,x-width/2,y-height+3,3,2,'#4d504b');
  }
 }
}
export function drawScene(canvas:HTMLCanvasElement,s:SiteSnapshot,seed:number,housing?:HousingHistory):void {
 const c=canvas.getContext('2d');if(!c)return;canvas.width=W;canvas.height=H;c.imageSmoothingEnabled=false;
 const index=s.local?.index??0;
 const population=s.local?.population??s.population;
 const random=rng(seed^0x1234567^Math.imul(index,1237));const dry=s.scars.includes('drought'),flood=s.scars.includes('flood'),epidemic=s.scars.includes('epidemic');
 // Fixed horizon, shoreline, hill shapes, and old tree: never shift between dates.
 rect(c,0,0,W,H,dry?'#dac4a0':P.sky);
 rect(c,0,47,W,46,dry?'#c1b28a':P.skyBottom);cloud(c,46,27,dry);cloud(c,218,39,dry);
 poly(c,[0,85,28,72,60,81,103,58,143,78,182,65,223,85,259,63,300,78,320,70,320,117,0,117],P.far);
 poly(c,[0,99,43,89,77,98,132,81,179,106,240,88,320,97,320,138,0,138],P.hill);
 rect(c,0,108,W,72,dry?'#a49a69':P.ground);for(let i=0;i<27;i++){const x=7+i*12;rect(c,x,109+(i%4)*3,5,2,'#a5a47a');}
 // Each place has a fixed outline across generations.
 if(index===1){
  poly(c,[0,132,60,126,111,132,171,115,223,123,320,114,320,180,0,180],P.front);
  poly(c,[0,157,77,144,169,151,227,131,320,134,320,143,229,139,171,159,77,151,0,167],P.bank);
 }else if(index===2){
  poly(c,[0,151,56,149,127,155,192,145,260,148,320,141,320,180,0,180],P.river);
  for(let i=0;i<16;i++)rect(c,(i*47)%305,155+(i%5)*5,12,1,P.riverLight);
 }else{
 poly(c,[131,95,147,100,144,115,130,128,123,142,144,160,176,180,265,180,194,160,167,146,158,131,165,115,154,95],flood?'#6296a0':P.river);
 poly(c,[141,101,149,104,146,118,136,131,135,144,151,157,182,180,196,180,154,159,146,145,147,125,154,111],P.riverLight);
 for(let k=0;k<13;k++){const x=133+(k*7)%45;const y=111+k*5;rect(c,x,y,5,1,k%3===0?'#d0c9ac':'#91b1ac');}rect(c,0,148,125,32,P.front);poly(c,[200,150,320,136,320,180,250,180],P.front);
 }
 // Shoreline grass in seeded, permanent positions.
 for(let i=0;i<54;i++){const x=Math.floor(random()*W),y=110+Math.floor(random()*59);if(x>123&&x<200&&y>123)continue;rect(c,x,y,2,3,dry?'#aa9d73':i%3?'#718658':'#b7af82');}
 // Landmark tree remains recognizable, even after many generations.
 tree(c,28,104,2);tree(c,294,102,1);tree(c,310,124,1);for(let i=0;i<9;i++){const x=11+(i*33)%310,y=104+(i%3)*6;if(x>125&&x<180)continue;tree(c,x,y,i%4===0?0.8:0.55);}reeds(c,120,138);reeds(c,200,154);reeds(c,175,129);
 for(let i=0;i<7;i++){const x=8+Math.floor(random()*100),y=120+Math.floor(random()*30);rect(c,x,y,9,3,dry?'#a69a65':'#667d54');}
 const composition=composeScene(s,housing);
 if(s.visual){builtGround(c,s.visual,index);neighborhood(c,s.objects,s.visual,index);}
 drawHistorySurface(c,composition);
 if(s.publicSpaces?.length)drawConfirmedPublicSpaces(c,s.publicSpaces);
 drawStreetscape(c,composition,s.objects,s.publicSpaces);
 drawHousingPlotSurface(c,composition);
 // すべての住宅屋根を確定施設より先に描く。
 // 前景住宅は住宅内では前に見えるが、歴史上の市場・集会所・仕事場を隠さない。
 drawResidentialRoofs(c,composition,'far');
 drawResidentialRoofs(c,composition,'middle');
 drawResidentialRoofs(c,composition,'near');
 const stone=!s.local&&(s.objects.filter(o=>o.kind==='memorial').length>2 || population>47000);
 // 大型公共施設の屋根は住宅より前景、既存の市場・小規模施設より背面。
 // こうして新しい建物によって古い橋・市場の視認性を消さない。
 for(const o of s.objects)if(o.civic&&o.kind==='hall')drawCivicArchitecture(c,o);
 for(const o of s.objects){
  if(o.civic&&o.kind==='hall')continue;
  if(o.kind==='bridge')continue;
  if(o.condition==='ruined'){drawBuildingSprite(c,o,false);continue;}
  if(o.kind==='field'){
   for(let j=0;j<5;j++)rect(c,o.x-12,o.y-12+j*3,26,1,dry?'#ad956c':'#536f49');
   fieldDetails(c,o.x-11,o.y-14,dry);
  }else if(o.kind==='memorial'){
   rect(c,o.x,o.y-8,4,10,P.stone);rect(c,o.x-2,o.y-9,8,2,P.dark);
  }else if(o.kind==='market'){
   // 開放的な長屋根と連続する柱。確定済みmarket 1件の外観のみ。
   rect(c,o.x-16,o.y-13,33,4,'#97765e');
   poly(c,[o.x-19,o.y-13,o.x,o.y-21,o.x+19,o.y-13],'#ad7c5c');
   for(let j=0;j<5;j++)rect(c,o.x-15+j*7,o.y-12,3,3,j%2?'#e2c9a1':'#ba9875');
   for(const dx of [-13,0,13])rect(c,o.x+dx,o.y-9,2,15,P.wood);
   rect(c,o.x-15,o.y+2,31,2,'#826c55');
  }else{
   drawBuildingSprite(c,o,stone||o.kind==='hall'||o.kind==='granary');
  }
  if(o.condition==='damaged')rect(c,o.x-10,o.y-2,8,3,P.dark);
 }
 if(s.objects.some(o=>o.kind==='bridge'&&o.condition==='intact')){rect(c,120,141,51,4,'#8a755b');for(let j=0;j<5;j++)rect(c,124+j*10,139,2,6,P.wood);}
 if(s.objects.some(o=>o.kind==='bridge'&&o.condition!=='intact')){rect(c,119,143,17,3,P.wood);rect(c,156,144,13,3,P.wood);}
 if(!s.local&&population>12500&&!flood)boat(c,145,143);if(!s.local&&population>24000){rect(c,20,126,36,2,'#8d7b5e');for(let i=0;i<5;i++)rect(c,21+i*7,125,3,3,'#b7a070');}const count=population===0?0:epidemic?1:Math.min(9,Math.max(1,2+Math.floor(Math.log2(Math.max(1,population)/1800))));
 const rp=rng((seed^Math.imul(Math.floor(s.year/20)+1,3571))>>>0);
 for(let i=0;i<count;i++){const x=48+Math.floor(rp()*56)+(i%2?150:0),y=123+Math.floor(rp()*12);person(c,x,y,['#66594f','#b29b74','#667a70'][i%3]!);}
 if(!s.local&&population>7000){for(let i=0;i<4;i++){const x=57+i*7;rect(c,x,134,1,3,'#c0b08a');rect(c,x+1,133,2,2,'#c4a779');}}if(s.scars.includes('festival')){for(let i=0;i<6;i++)rect(c,65+i*7,110-(i%2)*3,4,3,i%2?'#b98160':'#ddc482');}
 if(s.scars.includes('travel')){rect(c,236,129,18,4,'#8b6950');rect(c,241,133,3,3,P.dark);rect(c,251,133,3,3,P.dark);}
 if(s.scars.includes('fire')){rect(c,78,112,5,9,'#bd7557');rect(c,80,107,3,7,'#e6bc72');rect(c,80,103,5,3,'#b9af9a');}
 if(flood&&index===0){poly(c,[100,140,126,130,147,142,190,147,213,180,96,180],P.river);rect(c,88,141,25,2,P.riverLight);}
 if(dry){rect(c,0,158,44,2,'#a99b70');rect(c,40,161,24,2,'#a99b70');}
 // Fixed foreground reeds and stones give a sense of depth.
 for(let i=0;i<19;i++){let x=(i*41+13)%320,y=160+(i*7)%18;if(x>134&&x<200)continue;rect(c,x,y,4,2,i%2?'#b4ac8c':'#627856');}
 // Subtle bottom border, purely decorative.
 rect(c,0,179,W,1,'#4b685d');
}
