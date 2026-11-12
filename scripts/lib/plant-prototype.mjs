/**
 * Issue #47 B1a：植物13系統と地表材6種の造形試作。PROTOTYPE ONLY — NOT HISTORY。
 * 設計：docs/issue47-biome-design.md §5。本編（src/・dist/）を読まず、本編からも読まれない。
 * 整数矩形だけで描き、乱数・時刻を使わない。個体差は variant 番号からの固定ハッシュで決める。
 */
import {Raster} from './pixel-raster.mjs';

export const PROTOTYPE_ID='issue47-b1a-plant-forms-v0';
export const stages=Object.freeze(['young','mature']);
export const densities=Object.freeze(['sparse','dense']);
export const herbForms=Object.freeze({short:'短草',tall:'長草',dry:'乾草'});

const WOOD='#625745',WOOD_DARK='#4e463a',WOOD_PALE='#8c8063';

/**
 * 13系統。番号と名称は設計書§5の表に一致させる。layer は描画上の階層（高木／低木／草本／地表）。
 * palette は [基調, 明部, 暗部]。色は系統の識別手段として数えない（単色シルエットで別途比較する）。
 */
export const archetypes=Object.freeze({
 deciduous:{no:1,label:'落葉広葉樹',layer:'canopy',palette:['#6f8f55','#94aa6c','#4c6b43'],form:'丸く不均一な樹冠、透けて見える枝'},
 evergreen:{no:2,label:'常緑広葉樹',layer:'canopy',palette:['#3f6a45','#5f8a58','#2b4c35'],form:'低く厚く横に広がる葉群'},
 conifer:{no:3,label:'針葉樹',layer:'canopy',palette:['#3e5f4f','#5a7a62','#2a4239'],form:'尖った樹形、段状の枝'},
 tropical:{no:4,label:'熱帯高木',layer:'canopy',palette:['#3d6b3a','#68924c','#28472c'],form:'細く高い幹と板根、不規則な傘状樹冠、下層の葉群、垂れるつる'},
 savanna:{no:5,label:'乾燥地の疎林木',layer:'canopy',palette:['#7f8a4e','#a2a466','#5c6440'],form:'二股の幹、平たく薄い横長の樹冠'},
 riparian:{no:6,label:'河畔樹木',layer:'canopy',palette:['#7b9a5e','#a3b878','#56744a'],form:'傾いた幹、垂れ下がる枝の幕'},
 dryShrub:{no:7,label:'乾燥地の低木',layer:'shrub',palette:['#8a8a5a','#aaa572','#666448'],form:'V字の硬い小枝と葉の間隙'},
 coldShrub:{no:8,label:'寒冷地の低木',layer:'shrub',palette:['#7d8b6a','#9fa98a','#5d6a52'],form:'地表に沿う低いマット'},
 shrub:{no:9,label:'一般低木',layer:'shrub',palette:['#5f8352','#82a066','#45633f'],form:'まとまった丸い茂みと空隙'},
 herb:{no:10,label:'草本',layer:'herb',palette:['#7f9a5e','#a1b276','#5e7a4c'],form:'短草・長草・乾草の葉の束'},
 understory:{no:11,label:'林床植物',layer:'herb',palette:['#4f7a46','#79a05e','#355a37'],form:'弧を描くシダの葉と小葉'},
 wetland:{no:12,label:'湿地植物',layer:'herb',palette:['#7a9160','#a0b07a','#566c48'],form:'直立する葦状の茎、穂、株元'},
 moss:{no:13,label:'苔・地衣類',layer:'ground',palette:['#6d8a55','#b7bd9a','#4f6a42'],form:'地表・岩を覆う1〜2pxの斑'},
});

/** 地表材は植物とは別カテゴリ（設計書§5）。[基調, 斑1, 斑2]。 */
export const groundMaterials=Object.freeze({
 sand:{label:'砂',colors:['#cdbb8a','#ddcc9c','#b8a576']},
 rock:{label:'岩',colors:['#9c968a','#b5afa1','#7a756c']},
 bareSoil:{label:'裸土',colors:['#9a8768','#ad9a78','#82715a']},
 leafLitter:{label:'落葉',colors:['#8a7550','#a58c5a','#6e5e44']},
 wetSoil:{label:'湿った土',colors:['#6b6a52','#7b7c60','#575843']},
 coldGround:{label:'寒冷地表',colors:['#a7aa9c','#c8cbbe','#8a8e80']},
});

/** variant と通し番号からの固定ハッシュ（0..2^32-1）。文明RNG・標準乱数とは無関係。 */
function vh(variant,n){let h=Math.imul(variant+1,0x9e3779b1)^Math.imul(n+7,0x85ebca6b);h^=h>>>15;h=Math.imul(h,0xc2b2ae35);h^=h>>>13;return h>>>0;}

const CANVAS_W=96,CANVAS_H=72,ORIGIN_X=48,ORIGIN_Y=68;
export const canvasSize=Object.freeze({width:CANVAS_W,height:CANVAS_H,originX:ORIGIN_X,originY:ORIGIN_Y});

/** 単体描画面。原点（ox,oy）は根元の地面線。y は原点より上を負で数える。 */
function pen(raster,mono){
 const put=(x,y,w,h,c)=>{x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);if(w<=0||h<=0)return;raster.rect(ORIGIN_X+x,ORIGIN_Y+y,w,h,mono??c);};
 const empty=(x,y)=>{const X=ORIGIN_X+x,Y=ORIGIN_Y+y;if(X<0||Y<0||X>=CANVAS_W||Y>=CANVAS_H)return false;return raster.data[(Y*CANVAS_W+X)*4+3]===0;};
 return {
  rect:put,
  /** 透明な画素にだけ描く（樹冠の隙間から枝を見せる）。 */
  under(x,y,w,h,c){for(let yy=Math.round(y);yy<Math.round(y)+Math.round(h);yy++)for(let xx=Math.round(x);xx<Math.round(x)+Math.round(w);xx++)if(empty(xx,yy))put(xx,yy,1,1,c);},
  /** 隙間を空ける。 */
  clear(x,y,w,h){for(let yy=Math.round(y);yy<Math.round(y)+Math.round(h);yy++)for(let xx=Math.round(x);xx<Math.round(x)+Math.round(w);xx++){
   const X=ORIGIN_X+xx,Y=ORIGIN_Y+yy;if(X<0||Y<0||X>=CANVAS_W||Y>=CANVAS_H)continue;raster.data[(Y*CANVAS_W+X)*4+3]=0;}},
  /** 横長の楕円を1行ずつの矩形で塗る。(cx,top) は中心xと上端。 */
  blob(cx,top,w,h,c){if(w<1||h<1)return;for(let j=0;j<h;j++){const t=(2*j+1-h)/h,hw=Math.max(.5,w/2*Math.sqrt(Math.max(0,1-t*t)));
   const left=Math.round(cx-hw),right=Math.round(cx+hw);put(left,top+j,Math.max(1,right-left),1,c);}},
 };
}

function sizer(k,factor){return n=>Math.max(1,Math.round(n*k*factor));}

const draw={
 deciduous(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(10),W=z(15),C=z(10),top=-H-C+1;
  p.rect(0,-H,2,H,WOOD);
  const shift=vh(o.variant,1)%3-1;
  // 不均一な3つの塊（左・右・上）。塊の大きさを個体ごとに少し変える。
  p.blob(-z(3)+shift,top+z(3),z(9),C-z(3),P[2]);
  p.blob(z(4)+shift,top+z(2),z(8)+vh(o.variant,2)%2,C-z(3),P[0]);
  p.blob(shift+1,top,z(10),C-z(2),P[0]);
  p.blob(shift-z(1),top+1,z(6),Math.max(2,z(4)),P[1]);
  if(!o.dense){
   // 疎：樹冠に穴を開け、透けた枝を見せる。
   // 疎：枝の通り道に沿って樹冠を欠き、透けた枝を見せる（内部の穴だけにすると白い斑に見える）。
   for(let i=z(2);i<=z(5);i+=2){p.clear(-i,-H-i-1,2,2);p.clear(1+i,-H-i-1,2,2);}
   p.clear(-z(8)+shift,top+z(5),z(3),z(2));
  }
  // 枝（Y字の分岐）。樹冠の下と隙間にだけ見え、樹冠の外へは突き出さない。
  const reach=o.dense?z(4):z(6);
  for(let i=1;i<=reach;i++){p.under(-i+1,-H-i,1,1,WOOD);p.under(1+i,-H-i,1,1,WOOD);}
  p.under(0,-H-reach,1,reach,WOOD);
  void W;
 },
 evergreen(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(5),W=z(21),C=z(10),top=-H-C+1,shift=vh(o.variant,1)%3-1;
  p.rect(-1,-H,3,H,WOOD_DARK);p.rect(-2,-1,5,1,WOOD_DARK);
  p.blob(shift,top+z(2),W,C-z(2),P[2]);
  p.blob(shift,top,W-z(3),C-z(3),P[0]);
  p.blob(shift-z(3),top+1,Math.max(2,z(9)),Math.max(2,z(3)),P[1]);
  p.rect(shift-Math.round(W/2)+1,top+C-2,W-1,1,P[2]);
  // 疎：輪郭の縁を欠く（葉群の内部に穴を開けない）。
  if(!o.dense){p.clear(shift+Math.round(W/2)-z(3),top,z(4),z(4));p.clear(shift-Math.round(W/2),top+z(5),z(3),z(3));p.clear(shift-z(2),top,z(3),1);}
 },
 conifer(p,o,P){
  const z=sizer(o.k,o.young?.55:1),tiers=o.young?3:5,trunk=z(3),tier=Math.max(2,z(4)),base=z(13);
  p.rect(0,-trunk,2,trunk,WOOD_DARK);
  let y=-trunk;
  for(let t=0;t<tiers;t++){
   const w=Math.max(2,Math.round(base*(1-t/(tiers+.6)))),left=-Math.floor(w/2)+1;
   p.rect(left,y-1,w,1,P[2]);                         // 枝の暗い下面
   p.rect(left+1,y-tier,Math.max(1,w-2),tier-1,P[0]);  // 枝の葉群
   p.rect(left+1,y-tier,Math.max(1,Math.floor((w-2)/2)),1,P[1]);
   y-=tier-(o.dense?0:-1);
   if(!o.dense)p.rect(0,y+1,2,1,WOOD_DARK);           // 疎：段の間に幹が見える
  }
  p.rect(0,y-z(3),2,z(3),P[0]);p.rect(1,y-z(3)-1,1,1,P[0]);
 },
 tropical(p,o,P){
  const z=sizer(o.k,o.young?.55:1),H=z(20),W=z(25),C=Math.max(3,z(6)),top=-H-C+1;
  p.rect(0,-H,2,H,WOOD_PALE);
  p.rect(-1,-z(3),4,z(3),WOOD_PALE);p.rect(-2,-1,6,1,WOOD_PALE);         // 板根
  // 主樹冠：平たく不規則な傘。上縁の凹凸は個体ごとに違う。
  p.blob(1,top+1,W,C,P[2]);p.blob(0,top,W-z(4),C-1,P[0]);
  // 上縁の凹凸は樹冠の内側にだけ置き、宙に浮かせない。
  for(let i=0;i<3;i++){const bx=-Math.round(W/2)+z(5)+i*z(6)+vh(o.variant,i)%2;p.rect(bx,top-1,z(3),2,i%2?P[1]:P[0]);}
  if(!o.young&&o.dense){
   // 下層の葉群（垂直の階層）。短い枝で幹とつなぐ。
   const ly=-Math.round(H*.55),ry=-Math.round(H*.32);
   p.rect(-z(3),ly+1,z(3),1,WOOD_PALE);p.blob(-z(5),ly-1,z(7),Math.max(2,z(3)),P[0]);p.rect(-z(8),ly+1,z(6),1,P[2]);
   p.rect(2,ry+1,z(2),1,WOOD_PALE);p.blob(z(5),ry-1,z(6),Math.max(2,z(3)),P[0]);p.rect(z(3),ry+1,z(5),1,P[2]);
  }
  // つる：樹冠から垂れる細い線。
  const vines=o.dense?3:1;for(let i=0;i<vines;i++){const vx=-Math.round(W/2)+z(4)+i*z(7);p.rect(vx,top+C,1,z(4)+vh(o.variant,30+i)%3,P[2]);}
  // 疎：樹冠を2〜3の塊に切り分ける（内部の四角い穴にしない）。
  if(!o.dense){p.clear(-z(4),top-2,Math.max(1,z(2)),C+1);p.clear(z(6),top-2,1,C+1);}
 },
 savanna(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(6),spread=z(7),W=z(23),top=-H-spread-Math.max(2,z(3))+1;
  p.rect(0,-H,2,H,WOOD);
  for(let i=1;i<=spread;i++){p.rect(-i+1,-H-i,1,1,WOOD);p.rect(1+i,-H-i,1,1,WOOD);if(i%2)p.rect(-Math.round(i/2),-H-i,1,1,WOOD);}
  const thick=Math.max(2,z(3)),shift=vh(o.variant,1)%3-1,left=-Math.round(W/2)+1+shift;
  if(o.dense){p.rect(left,top+thick-1,W,1,P[2]);p.rect(left+1,top,W-2,thick-1,P[0]);p.rect(left+2,top,Math.round(W/2),1,P[1]);}
  else for(let i=0;i<3;i++){const pw=Math.max(2,Math.round(W/4)),px=left+i*Math.round(W/3)+(i===1?1:0);p.rect(px,top+thick-1,pw,1,P[2]);p.rect(px,top-(i===1?1:0),pw,thick-1,P[0]);p.rect(px,top-(i===1?1:0),Math.max(1,pw-2),1,P[1]);}
 },
 riparian(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(10),W=z(17),C=Math.max(3,z(6)),lean=Math.max(1,z(2)),top=-H-C+1;
  p.rect(0,-Math.round(H/2),2,Math.round(H/2),WOOD);p.rect(lean,-H,2,H-Math.round(H/2),WOOD);
  p.blob(lean,top,W,C,P[0]);p.blob(lean-z(2),top,Math.max(2,z(9)),Math.max(2,C-2),P[1]);
  // 垂れ下がる枝の幕。
  const step=o.dense?2:3;
  for(let x=-Math.round(W/2)+1;x<=Math.round(W/2)-1;x+=step){const len=z(5)+vh(o.variant,40+x+20)%Math.max(2,z(4));p.rect(lean+x,top+C-1,1,len,x%4===0?P[2]:P[0]);}
 },
 dryShrub(p,o,P){
  const z=sizer(o.k,o.young?.6:1),H=z(6),W=z(9);
  p.rect(0,-1,2,1,WOOD_PALE);
  const twigs=o.dense?5:3;
  for(let t=0;t<twigs;t++){const dir=t-(twigs>>1),len=Math.max(2,H-(Math.abs(dir)>1?1:0)-vh(o.variant,t)%2);
   for(let i=1;i<len;i++)p.rect(Math.round(dir*i*W/(2*H))+(dir>=0?1:0),-1-i,1,1,WOOD_PALE);
   const tx=Math.round(dir*(len-1)*W/(2*H))+(dir>=0?1:0);p.rect(tx-(dir<0?1:0),-len,2,1,P[t%2?1:0]);}
  if(o.dense){p.rect(-1,-Math.max(2,z(3)),1,1,P[2]);p.rect(2,-Math.max(2,z(4)),1,1,P[2]);}
 },
 coldShrub(p,o,P){
  const z=sizer(o.k,o.young?.6:1),W=z(13),H=Math.max(2,z(3)),left=-Math.round(W/2)+1;
  if(o.dense){p.rect(left,-1,W,1,P[2]);for(let x=0;x<W;x++){const h=1+(vh(o.variant,x)%H);if(h>1)p.rect(left+x,-h,1,h-1,x%3?P[0]:P[1]);}
   p.rect(left+Math.round(W/3),-2,1,1,'#8a6553');}
  else{const a=Math.round(W*.4);p.rect(left,-1,a,1,P[2]);p.rect(left+1,-2,a-2,1,P[0]);p.rect(left+W-a,-1,a,1,P[2]);p.rect(left+W-a+1,-2,Math.max(1,a-3),1,P[1]);}
 },
 shrub(p,o,P){
  const z=sizer(o.k,o.young?.6:1),W=z(11),H=z(7);
  if(o.dense){p.blob(0,-H,W,H,P[2]);p.blob(-1,-H,W-z(2),H-z(2),P[0]);p.blob(-z(2),-H,Math.max(2,z(4)),Math.max(1,z(2)),P[1]);p.clear(z(2),-z(3),1,Math.max(1,z(2)));}
  else{p.blob(-z(3),-z(5),z(6),z(5),P[0]);p.blob(-z(3),-z(5),Math.max(2,z(3)),Math.max(1,z(2)),P[1]);p.blob(z(3),-z(4),z(5),z(4),P[2]);p.rect(0,-1,1,1,WOOD);}
 },
 herb(p,o,P){
  const form=o.form??(o.young?'short':'tall'),z=sizer(o.k,1),W=z(11),left=-Math.round(W/2)+1,step=o.dense?1:2;
  const pal=form==='dry'?['#b3a36c','#cdbd86','#8f8256']:P;
  for(let x=0;x<W;x+=step){
   const v=vh(o.variant,x),base=form==='short'?1:form==='tall'?z(4):z(3),h=Math.max(1,base+(v%Math.max(1,form==='short'?2:z(3)))-(x===0||x===W-1?1:0));
   p.rect(left+x,-h,1,h,x%3===1?pal[1]:x%3===2?pal[2]:pal[0]);
   if(form==='dry'&&h>2)p.rect(left+x+(v%2?1:-1),-h,1,1,pal[1]);       // 乾いて倒れた穂先
   if(form==='tall'&&h>3&&v%3===0)p.rect(left+x+1,-h+1,1,1,pal[1]);      // 長草のしなり
  }
 },
 understory(p,o,P){
  const z=sizer(o.k,o.young?.6:1),reach=z(6),rise=z(4);
  // 2〜4枚の葉が根元から弧を描いて外へ垂れる。小葉を1つおきに付ける。
  const fronds=o.dense?[-1,1,-.5,.5]:[-1,1];
  fronds.forEach((d,f)=>{const r=Math.max(2,Math.round(reach*Math.abs(d))+vh(o.variant,50+f)%2),side=Math.sign(d);
   for(let i=0;i<=r;i++){const t=i/r,y=-Math.round(rise*(Math.abs(d)<1?.7:1)*4*t*(1-t*.75))-1,x=side*i+(side>0?1:0);
    p.rect(x,y,1,1,f%2?P[0]:P[2]);if(i%2===0&&i>0)p.rect(x,y-1,1,1,P[1]);}});
  p.rect(0,-1,2,1,P[2]);
  if(o.dense)p.rect(0,-rise-1,1,rise,P[0]);
 },
 wetland(p,o,P){
  const z=sizer(o.k,o.young?.55:1),W=z(9),left=-Math.round(W/2)+1,step=o.dense?1:2;
  p.rect(left,-1,W,1,P[2]);
  for(let x=0;x<W;x+=step){const v=vh(o.variant,x),h=z(6)+v%Math.max(1,z(4));
   p.rect(left+x,-h,1,h-1,x%2?P[0]:P[1]);
   if(!o.young&&v%3===0)p.rect(left+x,-h-1,1,2,'#8b7354');                  // 穂
  }
 },
 moss(p,o,P){
  const z=sizer(o.k,o.young?.6:1),W=z(13),left=-Math.round(W/2)+1;
  if(o.substrate==='rock'){p.blob(0,-z(5),W+z(2),z(5),'#9c968a');p.rect(left,-z(5)+1,W,1,'#b5afa1');}
  const y0=o.substrate==='rock'?-z(5):-1;
  for(let x=0;x<W;x++){const v=vh(o.variant,x);if(!o.dense&&v%3!==0&&x!==Math.floor(W/2))continue; // 疎でも中央の斑は残す
   p.rect(left+x,y0,1,1,v%4===0?P[1]:P[0]);if(v%5===0)p.rect(left+x,y0-1,1,1,v%2?P[2]:P[0]);}
 },
};

function validate(id,o){
 if(!Object.hasOwn(archetypes,id))throw Error('unknown plant archetype '+id);
 if(!stages.includes(o.stage))throw Error('unknown stage '+o.stage);
 if(!densities.includes(o.density))throw Error('unknown density '+o.density);
 if(!(Number.isFinite(o.k)&&o.k>=.3&&o.k<=1.6))throw Error('scale out of range');
 if(!Number.isInteger(o.variant)||o.variant<0)throw Error('variant must be a non-negative integer');
 if(o.form!==undefined&&(id!=='herb'||!Object.hasOwn(herbForms,o.form)))throw Error('form applies to herb only');
 if(o.substrate!==undefined&&(id!=='moss'||o.substrate!=='rock'))throw Error('substrate applies to moss only');
 if(o.mono!==undefined&&!/^#[0-9a-f]{6}$/.test(o.mono))throw Error('invalid mono colour');
}

/** 単体を固定寸法の透明ラスタへ描く。根元は (originX, originY)。 */
export function renderPlant(id,options={}){
 const o={stage:'mature',density:'dense',k:1,variant:0,...options};validate(id,o);
 const r=new Raster(CANVAS_W,CANVAS_H);
 // 個体差：個体0を基準形とし、それ以外は大きさを0.88〜1.12倍の範囲で変える（形の揺らぎは各系統の描画内で別に与える）。
 const k=o.variant===0?o.k:o.k*(.88+(vh(o.variant,99)%25)/100);
 draw[id](pen(r,o.mono),{...o,k,young:o.stage==='young',dense:o.density==='dense'},archetypes[id].palette);
 return r;
}

/** 目標ラスタの (x, groundY) に根元を置いて重ねる。 */
export function drawPlant(target,id,x,groundY,options={}){target.blit(renderPlant(id,options),x-ORIGIN_X,groundY-ORIGIN_Y);}

/** 不透明域の外接矩形（根元基準）と画素数。描画面の縁に触れたら切れている恐れがあるので clipped=true。 */
export function measure(r){
 let minX=Infinity,minY=Infinity,maxX=-1,maxY=-1,opaque=0;
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++)if(r.data[(y*r.width+x)*4+3]){opaque++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 if(!opaque)return {opaque:0,width:0,height:0,clipped:false};
 return {opaque,width:maxX-minX+1,height:maxY-minY+1,left:minX-ORIGIN_X,top:minY-ORIGIN_Y,bottom:maxY-ORIGIN_Y,clipped:minX===0||minY===0||maxX===r.width-1||maxY===r.height-1};
}

/** 地表材の見本。座標からの固定パターンで斑を置く（乱数なし）。 */
export function paintGround(target,id,x,y,w,h){
 if(!Object.hasOwn(groundMaterials,id))throw Error('unknown ground material '+id);
 const [base,a,b]=groundMaterials[id].colors;target.rect(x,y,w,h,base);
 for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
  const v=vh(xx*31+yy,yy*17+xx)%29;
  if(id==='rock'){if(yy%5===0&&v<7)target.rect(x+xx,y+yy,Math.min(3,w-xx),1,a);else if(yy%5===1&&v<4)target.rect(x+xx,y+yy,Math.min(2,w-xx),1,b);}
  else if(id==='leafLitter'){if(v<3)target.rect(x+xx,y+yy,Math.min(2,w-xx),1,v?a:b);}
  else if(id==='wetSoil'){if(yy%4===1&&v<9)target.rect(x+xx,y+yy,1,1,a);else if(v===0)target.rect(x+xx,y+yy,1,1,b);}
  else if(id==='coldGround'){if(v<2)target.rect(x+xx,y+yy,1,1,a);else if(v===2)target.rect(x+xx,y+yy,1,1,b);}
  else if(id==='sand'){if(yy%3===0&&(xx+yy)%7===0)target.rect(x+xx,y+yy,Math.min(2,w-xx),1,a);else if(v===0)target.rect(x+xx,y+yy,1,1,b);}
  else if(v<2)target.rect(x+xx,y+yy,1,1,v?a:b);
 }
}
