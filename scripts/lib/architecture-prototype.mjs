/**
 * Issue #35 / D1 ビジュアル試作専用。PROTOTYPE ONLY — NOT HISTORY。
 * ゲーム本編（src/・dist/）から読み込まない。保存形式・履歴・RNG・既存描画に一切接続しない。
 * ここでの「文化」「技術」は比較用の固定サンプルであり、D2以降の生成規則・正本ではない。
 * 描画は整数座標の矩形だけで行う（アンチエイリアスなし、Node単体で決定的）。
 */
export const PROTOTYPE_ID='architecture35-d1-v1';

// ---- カタログ（設計書 docs/issue35-architecture-design.md §3 と1対1） ----
export const roofs={
 R01:'切妻',R02:'急勾配切妻',R03:'寄棟',R04:'片流れ',R05:'平屋根',R06:'段状屋根',R07:'深い軒（修飾）',R08:'複合屋根'};
export const structures={
 S01:'柱梁構造',S02:'板壁',S03:'厚い土壁',S04:'不揃いな石積み',S05:'整形石材',S06:'混合構造（石基礎＋木造）',S07:'高床'};
/** 高度技術の比較用（§3.2「上位表現／別構造系統」）。S01〜S07を置換しない。 */
export const advancedStructures={X1:'大スパン木造',X2:'石造＋アーチ',X3:'金属支持＋ガラス'};
export const wallMaterials={
 log:'丸太',plank:'製材木板',wattle:'編み枝と塗り土',earth:'厚い土壁',rammed:'突き固め土',
 rubble:'不揃い石材',ashlar:'整形石材',mixed:'木石混合',metal:'金属支持（後年）',composite:'複合外皮（後年）'};
export const roofMaterials={
 thatch:'茅葺き',shingle:'木片・木板',slate:'石板',tile:'焼成瓦',plaster:'土・漆喰',metal:'金属板（後年）',glazed:'透過材（後年）'};
export const foundations={
 F1:'地面近くの低い基礎',F2:'石の土台',F3:'木杭',F4:'段状基礎',F5:'高床支柱',F6:'大規模構造の基礎（後年）'};
export const windows={W1:'小さな正方形',W2:'縦長',W3:'横長',W4:'並列小窓',W5:'格子窓',W6:'高窓'};
export const advancedWindows={W7:'大きな採光窓（高度技術）'};
export const entrances={
 E1:'中央',E2:'側方',E3:'深い軒下',E4:'前室つき',E5:'階段つき',E6:'中庭向き',E7:'大開口（工房・市場）'};
export const ornaments={
 O1:'棟端',O2:'梁端',O3:'露出木骨',O4:'雨戸・窓枠',O5:'帯状の壁模様',O6:'小庇',O7:'踏み石・階段',O8:'幾何学模様'};
export const palettes={
 P01:'木褐・暗屋根',P02:'黄土・赤褐',P03:'石灰・青灰',P04:'生成り・くすみ屋根',P05:'複合材の混色',P06:'褪色（状態変化）'};
export const uses={
 house:'独立住宅',rowhouse:'連棟住宅',courtyard:'中庭街区',granary:'穀物庫',workshop:'仕事場',market:'市場',hall:'会堂'};

const slots={
 P01:{timber:'#7a5f4a',plaster:'#b9a787',earth:'#a8926c',stone:'#9c9684',roof:'#5d554c',straw:'#8f7f58',accent:'#4f4a40'},
 P02:{timber:'#7b5a3f',plaster:'#d0b47e',earth:'#c29a5c',stone:'#a79a7c',roof:'#9a5a42',straw:'#b09658',accent:'#8a4c38'},
 P03:{timber:'#6f675c',plaster:'#d6d2c0',earth:'#bdb8a4',stone:'#a4a8a4',roof:'#667884',straw:'#9a9a80',accent:'#4f6470'},
 P04:{timber:'#8a7862',plaster:'#ddd3ba',earth:'#cdbf9f',stone:'#b3ab98',roof:'#8c8474',straw:'#a39a7a',accent:'#7b6f5c'},
 P05:{timber:'#6b5444',plaster:'#c9b08a',earth:'#b08a66',stone:'#8f9a98',roof:'#7f6a5a',straw:'#9b8a5c',accent:'#5c6f73'},
};
const DARK='#454e48',GLASS='#a9c4c2',GLASS_HI='#cfdcd2',METAL='#5b6466',METAL_HI='#8d989a';

// ---- 色 ----
const hex=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
const toHex=v=>'#'+v.map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>{const p=hex(a),q=hex(b);return toHex(p.map((n,i)=>n+(q[i]-n)*t));};
const dark=(c,t=.22)=>mix(c,'#2c302c',t),light=(c,t=.2)=>mix(c,'#f4ecd6',t);
/** P06：文化ではなく状態。彩度を落とし、色を風化側へ寄せる。 */
const fade=c=>mix(c,'#a3a290',.42);
const hash=(x,y,k=0)=>{let h=Math.imul(x*374761393+y*668265263+k*2147483647|0,1274126177);h^=h>>>15;return (h>>>0)%97;};

// ---- 正規化と整合検査（§3.2「整合しない組み合わせは除外」） ----
const sizes={house:[19,11],rowhouse:[39,11],courtyard:[35,10],granary:[17,14],workshop:[27,12],market:[33,11],hall:[37,15]};
export function normalizeSpec(input){
 const s={use:'house',roof:'R01',deepEaves:false,pitch:'mid',structure:'S02',wall:null,roofing:'shingle',foundation:null,
  window:'W1',entrance:'E1',ornaments:[],palette:'P01',faded:false,storeys:1,...input};
 if(s.roof==='R07'){s.roof='R01';s.deepEaves=true;}
 const all={...structures,...advancedStructures};
 if(!uses[s.use])throw Error('unknown use '+s.use);
 if(!roofs[s.roof])throw Error('unknown roof '+s.roof);
 if(!all[s.structure])throw Error('unknown structure '+s.structure);
 if(!roofMaterials[s.roofing])throw Error('unknown roofing '+s.roofing);
 if(!windows[s.window]&&!advancedWindows[s.window])throw Error('unknown window '+s.window);
 if(!entrances[s.entrance])throw Error('unknown entrance '+s.entrance);
 if(!slots[s.palette])throw Error('unknown palette '+s.palette);
 if(!['low','mid','high'].includes(s.pitch))throw Error('unknown pitch '+s.pitch);
 for(const o of s.ornaments)if(!ornaments[o])throw Error('unknown ornament '+o);
 s.wall??={S01:'wattle',S02:'plank',S03:'earth',S04:'rubble',S05:'ashlar',S06:'mixed',S07:'plank',X1:'plank',X2:'ashlar',X3:'metal'}[s.structure];
 if(!wallMaterials[s.wall])throw Error('unknown wall material '+s.wall);
 s.foundation??={S03:'F1',S04:'F2',S05:'F2',S06:'F2',S07:'F5',X1:'F2',X2:'F4',X3:'F6'}[s.structure]??'F1';
 if(!foundations[s.foundation])throw Error('unknown foundation '+s.foundation);
 const issues=inconsistencies(s);
 if(issues.length)throw Error('inconsistent prototype: '+issues.join('; '));
 return s;
}
/** 支持・屋根・入口が成立しない組み合わせ。描画せずに除外する。 */
export function inconsistencies(s){
 const out=[],advanced=s.structure[0]==='X';
 if(s.structure==='S07'&&s.foundation!=='F5')out.push('高床(S07)は高床支柱(F5)が必要');
 if(s.foundation==='F5'&&!['S01','S02','S07','X1'].includes(s.structure))out.push('高床支柱(F5)に組積・土壁の重い壁は載せない');
 if(s.foundation==='F5'&&['E1','E2','E3','E6','E7'].includes(s.entrance)&&s.use!=='market')out.push('高床の入口には階段(E5)か前室(E4)が必要');
 if(s.entrance==='E3'&&!s.deepEaves)out.push('深い軒下の入口(E3)は深い軒(R07)が必要');
 if(s.entrance==='E5'&&['F1'].includes(s.foundation))out.push('階段つき入口(E5)は床の上がる基礎が必要');
 if(['metal','composite'].includes(s.wall)&&!advanced)out.push('金属支持・複合外皮は高度構造(X系)のみ');
 if(['metal','glazed'].includes(s.roofing)&&!advanced)out.push('金属板・透過材の屋根は高度構造(X系)のみ');
 if(s.window==='W7'&&!advanced)out.push('大きな採光窓(W7)は高度構造(X系)のみ');
 if(s.roofing==='thatch'&&s.roof==='R05')out.push('茅葺きの平屋根は排水が成立しない');
 if(s.roofing==='thatch'&&s.pitch==='low')out.push('茅葺きは低勾配で成立しない');
 if(s.roofing==='plaster'&&!['R05','R06','R04'].includes(s.roof))out.push('土・漆喰の屋根は平・段状・緩い片流れのみ');
 if(s.storeys>1&&!['S05','S06','X1','X2','X3'].includes(s.structure))out.push('複数階は整形石・混合・高度構造のみ');
 if(s.storeys>2)out.push('D1試作は2階まで（多層T08の上限は未決）');
 return out;
}

// ---- 描画 ----
/** g: {rect(x,y,w,h,color)}。cx=建物中心、gy=接地線（この行の直上までが建物）。 */
export function drawBuilding(g,input,cx,gy){
 const s=normalizeSpec(input);
 let p={...slots[s.palette]};
 if(s.faded)p=Object.fromEntries(Object.entries(p).map(([k,v])=>[k,fade(v)]));
 const tone=c=>s.faded?fade(c):c;
 const R=(x,y,w,h,c)=>{if(w>0&&h>0)g.rect(x,y,w,h,c);};
 const [w0,h0]=sizes[s.use];
 let w=w0,h=h0+(s.storeys-1)*8;
 if(s.structure==='X1'&&['hall','market','workshop'].includes(s.use)){w+=8;}
 if(s.structure==='S03')h-=1; // 厚い土壁は低く構える
 const wallColor={log:p.timber,plank:light(p.timber,.12),wattle:p.plaster,earth:p.earth,rammed:mix(p.earth,p.stone,.25),
  rubble:p.stone,ashlar:light(p.stone,.12),mixed:light(p.timber,.1),metal:tone(METAL),composite:tone('#b9bdb2')}[s.wall];
 const roofColor={thatch:p.straw,shingle:dark(p.timber,.12),slate:mix(p.stone,'#56656e',.55),tile:p.roof,plaster:light(p.earth,.18),
  metal:tone('#6f7f80'),glazed:tone(GLASS)}[s.roofing];
 const lift={F1:0,F2:2,F3:2,F4:4,F5:6,F6:3}[s.foundation];
 const x0=cx-(w>>1),base=gy-lift,top=base-h;
 const ov=s.deepEaves?4:s.structure==='S03'&&s.roof==='R05'?0:1;

 // 1. 基礎
 if(s.foundation==='F1')R(x0,gy-1,w,1,dark(wallColor,.3));
 if(s.foundation==='F2'){R(x0-1,gy-2,w+2,2,p.stone);for(let x=x0;x<x0+w;x+=4)R(x,gy-2,1,1,dark(p.stone,.2));}
 if(s.foundation==='F3'){for(let x=x0+1;x<x0+w-1;x+=4)R(x,gy-2,1,2,dark(p.timber,.2));R(x0,gy-3,w,1,dark(p.timber,.1));}
 if(s.foundation==='F4'){R(x0-4,gy-2,w+8,2,dark(p.stone,.12));R(x0-2,gy-4,w+4,2,p.stone);}
 if(s.foundation==='F5'){R(x0+1,gy-1,w-2,1,'#7d8062');for(let x=x0;x<x0+w-2;x+=Math.max(4,Math.round((w-1)/Math.round(w/6))))R(x,gy-6,1,6,dark(p.timber,.25));R(x0+w-1,gy-6,1,6,dark(p.timber,.25));R(x0-1,gy-7,w+2,1,dark(p.timber,.3));}
 if(s.foundation==='F6'){R(x0-3,gy-3,w+6,3,tone('#8f9288'));R(x0-3,gy-3,w+6,1,tone('#a9aca0'));}

 // 2. 壁の量塊（段状・複合・中庭は複数）
 const masses=[];
 if(s.use==='courtyard'){
  const wing=13;masses.push({x:x0,w:wing,top,main:true},{x:x0+w-wing,w:wing,top,main:true},{x:x0+wing,w:w-2*wing,top:base-4,link:true});
 }else if(s.roof==='R06'){
  const a=Math.round(w*.42),b=w>30?Math.round(w*.3):0;
  masses.push({x:x0,w:a,top:top-3,main:true});
  if(b)masses.push({x:x0+a,w:b,top:top,main:false});
  masses.push({x:x0+a+b,w:w-a-b,top:top+(b?3:2),main:false});
 }else if(s.roof==='R08'){
  const wing=Math.max(7,Math.round(w*.34));
  masses.push({x:x0+w-2,w:wing,top:top+3,wing:true},{x:x0,w,top,main:true});
 }else masses.push({x:x0,w,top,main:true});

 const wallAt=(m)=>{
  const mh=base-m.top,c=wallColor;
  R(m.x,m.top,m.w,mh,c);
  if(m.link){R(m.x,m.top,m.w,1,light(c,.2));R(m.x+(m.w>>1)-1,m.top+1,3,mh-1,DARK);return;}
  switch(s.wall){
   case 'log':for(let y=m.top+1;y<base;y+=2)R(m.x,y,m.w,1,dark(c,.2));R(m.x-1,m.top+1,1,mh-1,dark(c,.3));R(m.x+m.w,m.top+1,1,mh-1,dark(c,.3));break;
   case 'plank':for(let x=m.x+2;x<m.x+m.w;x+=3)R(x,m.top,1,mh,dark(c,.14));break;
   case 'wattle':for(let x=m.x+1;x<m.x+m.w;x+=2)for(let y=m.top+1;y<base;y+=3)if(hash(x,y)%3===0)R(x,y,1,1,dark(c,.12));break;
   case 'earth':R(m.x,m.top,m.w,1,light(c,.22));R(m.x-1,base-Math.ceil(mh*.55),1,Math.ceil(mh*.55),c);R(m.x+m.w,base-Math.ceil(mh*.55),1,Math.ceil(mh*.55),c);
    R(m.x-2,base-Math.ceil(mh*.25),1,Math.ceil(mh*.25),c);R(m.x+m.w+1,base-Math.ceil(mh*.25),1,Math.ceil(mh*.25),c);break;
   case 'rammed':for(let y=m.top+2;y<base;y+=3)R(m.x,y,m.w,1,dark(c,.1));break;
   case 'rubble':for(let y=m.top;y<base;y++)for(let x=m.x;x<m.x+m.w;x++){const v=hash(x,y,3);if(v<16)R(x,y,1,1,dark(c,.25));else if(v>84)R(x,y,1,1,light(c,.22));}break;
   case 'ashlar':for(let y=m.top+2,r=0;y<base;y+=3,r++){R(m.x,y,m.w,1,dark(c,.16));for(let x=m.x+(r%2?2:5);x<m.x+m.w;x+=6)R(x,y-2,1,2,dark(c,.16));}break;
   case 'mixed':{const sh=Math.max(3,Math.round(mh*.4));R(m.x,base-sh,m.w,sh,p.stone);
    for(let y=base-sh;y<base;y++)for(let x=m.x;x<m.x+m.w;x++)if(hash(x,y,5)<14)R(x,y,1,1,dark(p.stone,.25));
    for(let x=m.x+2;x<m.x+m.w;x+=3)R(x,m.top,1,mh-sh,dark(c,.14));R(m.x,base-sh-1,m.w,1,dark(p.timber,.25));break;}
   case 'metal':R(m.x,m.top,m.w,mh,tone(GLASS));for(let x=m.x;x<m.x+m.w;x+=5)R(x,m.top,1,mh,c);R(m.x+m.w-1,m.top,1,mh,c);
    for(let y=m.top;y<base;y+=8)R(m.x,y,m.w,1,c);for(let x=m.x+2;x<m.x+m.w-1;x+=5)R(x,m.top+2,1,2,tone(GLASS_HI));break;
   case 'composite':for(let x=m.x+4;x<m.x+m.w;x+=5)R(x,m.top,1,mh,dark(c,.12));for(let y=m.top+4;y<base;y+=5)R(m.x,y,m.w,1,dark(c,.12));break;
  }
  if(s.structure==='S01'||s.structure==='X1'){
   const bay=s.structure==='X1'?10:6,t=dark(p.timber,.18);
   for(let x=m.x;x<m.x+m.w-1;x+=bay)R(x,m.top,1,mh,t);R(m.x+m.w-1,m.top,1,mh,t);R(m.x,m.top,m.w,1,t);
   if(s.structure==='X1')for(let x=m.x;x<m.x+m.w-bay;x+=bay){R(x+1,m.top+1,1,1,t);R(x+2,m.top+1,1,1,t);R(x+1,m.top+2,1,1,t);R(x+bay-1,m.top+1,1,1,t);R(x+bay-2,m.top+1,1,1,t);R(x+bay-1,m.top+2,1,1,t);}
  }
  if(s.storeys>1&&s.wall!=='metal')R(m.x,m.top+8,m.w,1,dark(c,.25));
 };

 // 3. 屋根（列ごとの高さで塗る）
 const roofTex=(x,y,d,edge)=>{
  const c=roofColor;
  if(edge)return light(c,.18);
  switch(s.roofing){
   case 'thatch':return hash(x,y,7)<22?light(c,.2):d%3===2?dark(c,.1):c;
   case 'shingle':return d%2?dark(c,.16):c;
   case 'slate':return d%2?dark(c,.2):(x+d)%4===0?dark(c,.1):c;
   case 'tile':return x%2?dark(c,.18):c;
   case 'plaster':return c;
   case 'metal':return x%3===0?dark(c,.2):d===1?light(c,.25):c;
   case 'glazed':return x%4===0||d%4===3?tone(METAL):d===1?tone(GLASS_HI):c;
  }
 };
 const paintRoof=(xa,xb,topOf,eave,thick)=>{
  for(let x=xa;x<xb;x++){const t=topOf(x),b=thick?Math.min(eave,t+thick):eave;
   for(let y=t;y<b;y++)R(x,y,1,1,y===b-1&&b-t>1?dark(roofColor,.3):roofTex(x,y,y-t,y===t));}
 };
 const pitchK={low:.55,mid:.85,high:1.25}[s.pitch];
 const roofOn=(m,kind,o=ov)=>{
  const xa=m.x-o,xb=m.x+m.w+o,half=(xb-xa)/2,mid=xa+half-.5,e=m.top+(s.deepEaves?1:0);
  if(s.deepEaves)R(m.x,m.top+1,m.w,1,dark(wallColor,.35)); // 軒下の影
  if(kind==='R01'||kind==='R02'){
   const H=Math.max(4,Math.round(half*(kind==='R02'?1.5:1)*pitchK*(s.roofing==='thatch'?1.1:1)));
   // 本編の既存建築と同じく、正面の三角は屋根面として塗る（素材の質感が読める面積を確保）
   paintRoof(xa,xb,x=>e-Math.max(2,Math.round(H*(1-Math.abs(x-mid)/(half+.5)))),e,0);
   return {apex:[Math.round(mid),e-H],H,xa,xb};
  }
  if(kind==='R03'){
   const H=Math.max(3,Math.round(half*.5*pitchK+1.5));
   paintRoof(xa,xb,x=>e-Math.max(2,Math.min(H,Math.round((half-Math.abs(x-mid))*1.1+1))),e,0);
   const rl=Math.max(1,Math.round(half-H/1.1));R(Math.round(mid-rl)+1,e-H,Math.max(1,rl*2-1),1,light(roofColor,.3));
   return {apex:[Math.round(mid),e-H],H,xa,xb,ridge:[Math.round(mid-rl)+1,Math.round(mid+rl)-1]};
  }
  if(kind==='R04'){
   const H=Math.max(3,Math.round((xb-xa)*.3*pitchK)),topOf=x=>e-1-Math.round(H*(xb-1-x)/(xb-xa-1));
   for(let x=m.x;x<m.x+m.w;x++){const t=topOf(x)+2;if(t<e)R(x,t,1,e-t,wallColor);}
   if(s.wall==='plank'||s.wall==='mixed')for(let x=m.x+2;x<m.x+m.w;x+=3){const t=topOf(x)+2;if(t<e)R(x,t,1,e-t,dark(wallColor,.14));}
   paintRoof(xa,xb,topOf,e+1,2);
   return {apex:[xa+1,e-1-H],H,xa,xb};
  }
  if(kind==='R05'){
   paintRoof(xa,xb,()=>e-2,e,0);
   R(xa,e-3,2,1,light(roofColor,.1));R(xb-2,e-3,2,1,light(roofColor,.1)); // 胸壁の端
   return {apex:[Math.round(mid),e-2],H:2,xa,xb,flat:true};
  }
 };
 let crown=null;
 for(const m of masses){
  wallAt(m);
  if(m.link){R(m.x,m.top-1,m.w,1,dark(roofColor,.1));continue;}
  let kind=s.roof;
  if(s.roof==='R06')kind=s.roofing==='plaster'?'R05':'R03';
  if(s.roof==='R08')kind=m.wing?'R04':'R01';
  const r=roofOn(m,kind,m.wing?1:ov);
  if(m.main&&!crown)crown=r;
  if(s.roof==='R08'&&m.main){ // 主屋根の前に小さな妻屋根
   const gx=m.x+Math.round(m.w*.3),gh=Math.max(3,Math.round(r.H*.55));
   for(let i=0;i<gh;i++)R(gx-i,m.top-gh+i+1,i*2+1,1,i===0?light(roofColor,.25):dark(roofColor,.14));
  }
 }

 // 4. 開口
 const main=masses.find(m=>m.main),units=s.use==='rowhouse'?3:1,frame=s.ornaments.includes('O4');
 const openDark=DARK,winColor=s.structure==='X3'?tone(GLASS_HI):'#3f4741';
 const door=(dx,dw=3,dh=6)=>{const b=base;R(dx,b-dh,dw,dh,openDark);if(s.structure==='X2'){R(dx,b-dh,1,1,wallColor);R(dx+dw-1,b-dh,1,1,wallColor);}return [dx,dw,dh];};
 const win=(wx,wy)=>{
  const F=(x,y,ww,hh)=>{if(frame)R(x-1,y-1,ww+2,hh+2,light(p.plaster,.3));R(x,y,ww,hh,winColor);if(frame){R(x-2,y,1,hh,p.accent);R(x+ww+1,y,1,hh,p.accent);}
   if(s.ornaments.includes('O6'))R(x-1,y-2,ww+2,1,dark(roofColor,.1));
   if(s.structure==='S03')R(x,y,ww,1,'#2c312d');if(s.structure==='X2'&&ww>=3){R(x,y,1,1,wallColor);R(x+ww-1,y,1,1,wallColor);}};
  switch(s.window){
   case 'W1':F(wx-1,wy,2,2);break;
   case 'W2':F(wx,wy-1,s.use==='hall'?2:1,5);break;
   case 'W3':F(wx-2,wy,5,2);break;
   case 'W4':F(wx-2,wy,2,2);F(wx+1,wy,2,2);break;
   case 'W5':R(wx-2,wy-1,5,5,light(p.plaster,.35));for(let i=0;i<5;i++)for(let j=0;j<5;j++)if((i+j)%2===0)R(wx-2+i,wy-1+j,1,1,winColor);break;
   case 'W6':break; // 高窓は壁面上端にまとめて描く
   case 'W7':R(wx-3,wy-2,7,6,tone(GLASS));R(wx-3,wy-2,7,1,tone(GLASS_HI));R(wx,wy-2,1,6,wallColor);break;
  }
 };
 const facade=(fx,fw,ft,isMainDoor)=>{
  const fh=base-ft,wy=ft+Math.max(2,Math.round(fh*.3))+(s.deepEaves?1:0);
  let d=null,slotsX=[];
  const big=fw>=25,c=fx+(fw>>1);
  if(!isMainDoor){slotsX=fw>=13?[fx+3,fx+fw-4]:[c];}
  else if(s.entrance==='E1'){d=door(c-1-(big?1:0),big?5:3,big?8:6);slotsX=big?[fx+4,fx+10,fx+fw-11,fx+fw-5]:[fx+4,fx+fw-5];}
  else if(s.entrance==='E2'){d=door(fx+2,3,6);slotsX=big?[c-4,c+3,fx+fw-11,fx+fw-5]:[c+1,fx+fw-4];}
  else if(s.entrance==='E3'){ // 軒下に奥まった入口と縁の柱
   R(fx,ft+2,fw,1,dark(wallColor,.3));d=door(c-1-(big?1:0),big?5:3,(big?7:5));
   for(const px of big?[fx-3,fx+7,fx+fw-8,fx+fw+2]:[fx-3,fx+fw+2])R(px,ft+1,1,fh-1,dark(p.timber,.25));
   R(fx-4,base-1,fw+8,1,dark(p.timber,.05));slotsX=big?[fx+4,fx+11,fx+fw-12,fx+fw-5]:[fx+4,fx+fw-5];}
  else if(s.entrance==='E4'){ // 前室：手前へ出る小さな箱と小屋根
   const pw=big?9:7,ph=big?8:6,px=c-(pw>>1);R(px,base-ph,pw,ph,light(wallColor,.12));R(px-1,base-ph-1,pw+2,2,dark(roofColor,.08));R(px,base-ph-2,pw,1,light(roofColor,.15));
   R(c-1,base-ph+2,3,ph-2,openDark);d=[px,pw,ph];slotsX=big?[fx+4,fx+10,fx+fw-11,fx+fw-5]:[fx+3,fx+fw-4];}
  else if(s.entrance==='E5'){ // 階段：床が上がる基礎に対応
   d=door(c-1,3,6);const st=light(p.stone,.1),n=Math.max(2,lift);
   for(let i=0;i<n;i++)R(c-2-i,base+i,5+i*2,1,i%2?dark(st,.12):st);slotsX=big?[fx+4,fx+10,fx+fw-11,fx+fw-5]:[fx+4,fx+fw-5];}
  else if(s.entrance==='E6'){ // 正面は閉じ、塀の切れ目から中庭へ入る
   const ww=big?13:9,wx0=fx-ww+1,wc=light(wallColor,.05);R(wx0,base-5,ww,5,wc);R(wx0,base-6,ww,1,dark(roofColor,.05));R(wx0+3,base-5,3,5,openDark);R(wx0+2,base-7,5,1,dark(roofColor,.15));
   d=null;slotsX=big?[fx+5,c-3,c+3,fx+fw-6]:[fx+5,fx+fw-6];}
  else if(s.entrance==='E7'){ // 大開口：まぐさと中柱
   const ow=big?15:9,ox=fx+2;R(ox,base-8,ow,8,openDark);R(ox-1,base-9,ow+2,1,dark(p.timber,.3));R(ox+(ow>>1),base-8,1,8,dark(p.timber,.1));
   if(s.structure==='X2'){R(ox,base-8,2,1,wallColor);R(ox,base-7,1,1,wallColor);R(ox+ow-2,base-8,2,1,wallColor);R(ox+ow-1,base-7,1,1,wallColor);}
   d=[ox,ow,8];slotsX=big?[fx+fw-13,fx+fw-6]:[fx+fw-5];}
  if(s.window==='W6'){for(let x=fx+2;x<fx+fw-3;x+=4)R(x,ft+2+(s.deepEaves?1:0),2,1,winColor);}
  else for(const x of slotsX){if(d&&x>=d[0]-3&&x<=d[0]+d[1]+2)continue;win(x,wy);if(s.storeys>1)win(x,wy+8);}
  if(s.storeys>1&&s.window!=='W6'&&d)win(d[0]+(d[1]>>1),ft+3);
  return d;
 };
 let mainDoor=null;
 if(s.use==='courtyard'){mainDoor=facade(masses[0].x,masses[0].w,masses[0].top,false);facade(masses[1].x,masses[1].w,masses[1].top,false);}
 else if(units>1){const uw=Math.floor(main.w/units);for(let u=0;u<units;u++){if(u)R(main.x+u*uw,main.top,1,base-main.top,dark(wallColor,.3));mainDoor=facade(main.x+u*uw,uw,main.top,true);}}
 else if(s.use==='market'){
  // 市場：前面開放。柱と奥の暗がり、売り台。実在しない店舗を増やさない＝1棟分の間口のみ。
  const t=main.top+2;R(main.x+1,t,main.w-2,base-t-2,'#59605a');
  for(let x=main.x;x<main.x+main.w;x+=s.structure==='X1'?10:s.structure==='X3'?8:6)R(x,t,s.wall==='rubble'||s.wall==='ashlar'||s.wall==='earth'||s.wall==='rammed'?2:1,base-t,s.structure==='X3'?tone(METAL):s.wall==='plank'||s.wall==='wattle'||s.wall==='log'||s.wall==='mixed'?dark(p.timber,.2):wallColor);
  if(s.structure==='X2')for(let x=main.x+2;x<main.x+main.w-4;x+=6){R(x,t,1,1,wallColor);R(x+3,t,1,1,wallColor);}
  for(let x=main.x+3;x<main.x+main.w-4;x+=6)R(x,base-3,3,1,mix(p.straw,'#e2c9a1',.5));
  R(main.x,base-2,main.w,2,s.foundation==='F1'?dark(p.earth,.2):p.stone);
 }else{
  for(const m of masses)if(!m.main&&!m.link)facade(m.x,m.w,m.top,false);
  mainDoor=facade(main.x,main.w,main.top,true);
 }

 // 5. 装飾
 const O=k=>s.ornaments.includes(k);
 if(O('O1')&&crown){const [ax,ay]=crown.apex,c=dark(p.timber,.35);
  if(crown.ridge){for(const rx of crown.ridge){R(rx,ay-1,1,1,c);R(rx+(rx<ax?-1:1),ay-2,1,1,c);}}
  else if(crown.flat){R(crown.xa,ay-2,1,2,c);R(crown.xb-1,ay-2,1,2,c);}
  else{R(ax-1,ay-1,1,1,c);R(ax+1,ay-1,1,1,c);R(ax-2,ay-2,1,1,c);R(ax+2,ay-2,1,1,c);}}
 if(O('O2')){const c=dark(p.timber,.4),y=main.top+(s.deepEaves?1:0);for(let x=main.x+1;x<main.x+main.w;x+=3)R(x,y,1,1,c);R(main.x-2,y,1,1,c);R(main.x+main.w+1,y,1,1,c);}
 if(O('O3')){const c=dark(p.timber,.3),mh=base-main.top;R(main.x,main.top+Math.round(mh*.55),main.w,1,c);
  for(let i=0;i<Math.min(4,mh-2);i++){R(main.x+1+i,base-2-i,1,1,c);R(main.x+main.w-2-i,base-2-i,1,1,c);}R(main.x,main.top,1,mh,c);R(main.x+main.w-1,main.top,1,mh,c);}
 if(O('O5')){const y=main.top+Math.max(1,Math.round((base-main.top)*.18));for(const m of masses)if(!m.link)for(let x=m.x;x<m.x+m.w;x++)if(!(mainDoor&&x>=mainDoor[0]&&x<mainDoor[0]+mainDoor[1]&&y>=base-mainDoor[2]))R(x,y,1,1,p.accent);}
 if(O('O6')&&mainDoor)R(mainDoor[0]-2,base-mainDoor[2]-2,mainDoor[1]+4,1,dark(roofColor,.1));
 if(O('O7')){const c=light(p.stone,.2),dx=mainDoor?mainDoor[0]+(mainDoor[1]>>1):cx;for(let i=0;i<3;i++)R(dx-1+(i%2),gy+1+i*2,2,1,c);}
 if(O('O8')){const c=p.accent;
  if(crown&&!crown.flat&&!crown.ridge&&crown.H>=7){const [ax,ay]=crown.apex,y=ay+Math.round(crown.H*.55),c=light(p.plaster,.3);R(ax,y-1,1,1,c);R(ax-1,y,3,1,c);R(ax,y+1,1,1,c);}
  else{const y=main.top+Math.max(2,Math.round((base-main.top)*.45));for(let x=main.x+2;x<main.x+main.w-2;x+=4){if(mainDoor&&x>=mainDoor[0]-1&&x<=mainDoor[0]+mainDoor[1])continue;R(x,y,1,1,c);R(x+1,y-1,1,1,c);R(x+2,y,1,1,c);}}}
 if(s.faded){for(let x=x0;x<x0+w;x++)if(hash(x,top,11)<9)R(x,top-1-(hash(x,top,12)%3),1,1,'#7d8a6a');}
 return s;
}

// ---- 比較用の固定サンプル：代表文化6＋高度技術3（§3.5）。自然生成の規則ではない。 ----
const C=(label,base,per={})=>({label,base,per});
export const cultures={
 C1:C('木骨＋深い軒',{structure:'S01',roof:'R01',deepEaves:true,roofing:'thatch',pitch:'mid',window:'W1',entrance:'E3',ornaments:['O2','O3'],palette:'P01',foundation:'F2'},
  {granary:{entrance:'E3',roofing:'shingle'},hall:{ornaments:['O1','O2','O3']}}),
 C2:C('厚い土壁＋低い平屋根',{structure:'S03',roof:'R05',roofing:'plaster',window:'W1',entrance:'E1',ornaments:['O5'],palette:'P02'},
  {hall:{ornaments:['O5','O1']},workshop:{entrance:'E7'},granary:{window:'W6'}}),
 C3:C('石積み＋段状屋根',{structure:'S04',roof:'R06',roofing:'slate',window:'W2',entrance:'E5',ornaments:['O7'],palette:'P03',foundation:'F4'},
  {hall:{structure:'S05',ornaments:['O7','O8']},workshop:{entrance:'E7',foundation:'F2'},granary:{structure:'S05'}}),
 C4:C('高床＋軽い木板屋根',{structure:'S07',roof:'R04',roofing:'shingle',pitch:'mid',window:'W3',entrance:'E5',ornaments:[],palette:'P04'},
  {hall:{ornaments:['O2']},granary:{window:'W1'}}),
 C5:C('明るい壁面＋中庭',{structure:'S03',wall:'wattle',roof:'R03',roofing:'tile',pitch:'low',window:'W6',entrance:'E6',ornaments:['O5'],palette:'P04',foundation:'F1'},
  {hall:{ornaments:['O5','O1']},workshop:{entrance:'E7',window:'W6'},granary:{entrance:'E2'}}),
 C6:C('木石混合＋複合屋根',{structure:'S06',roof:'R08',roofing:'shingle',pitch:'mid',window:'W4',entrance:'E4',ornaments:['O6'],palette:'P05'},
  {hall:{ornaments:['O1','O6'],roofing:'tile'},workshop:{entrance:'E7'},granary:{window:'W1'}}),
};
export const advancedSamples={
 A1:C('大スパン木造（T01・T07）',{structure:'X1',roof:'R01',deepEaves:true,roofing:'shingle',pitch:'low',window:'W6',entrance:'E3',ornaments:['O2'],palette:'P01'},
  {house:{structure:'S01',roofing:'thatch',pitch:'mid',window:'W1',ornaments:['O2','O3'],foundation:'F2'},rowhouse:{structure:'S01',window:'W1',foundation:'F2'},courtyard:{structure:'S01',window:'W1',foundation:'F2'},granary:{structure:'S01',window:'W1',foundation:'F2'}}),
 A2:C('石造＋アーチ（T02・T04）',{structure:'X2',roof:'R03',roofing:'tile',pitch:'low',window:'W2',entrance:'E7',ornaments:['O5'],palette:'P03'},
  {house:{structure:'S04',roof:'R06',roofing:'slate',entrance:'E5',ornaments:['O7'],foundation:'F4'},rowhouse:{structure:'S05',entrance:'E1',foundation:'F2'},courtyard:{structure:'S05',entrance:'E1',foundation:'F2'},granary:{entrance:'E1'},hall:{entrance:'E1',storeys:2}}),
 A3:C('金属支持＋ガラス（T05・T06・T09）',{structure:'X3',roof:'R04',roofing:'metal',pitch:'low',window:'W7',entrance:'E1',ornaments:[],palette:'P05'},
  {house:{structure:'S03',wall:'earth',roof:'R05',roofing:'plaster',window:'W1',ornaments:['O5'],palette:'P02',foundation:'F1'},rowhouse:{structure:'S02',roof:'R01',roofing:'shingle',pitch:'mid',window:'W1',foundation:'F1'},
   courtyard:{structure:'S02',roof:'R01',roofing:'shingle',pitch:'mid',window:'W1',foundation:'F1'},granary:{structure:'S06',roof:'R01',roofing:'shingle',pitch:'mid',window:'W1',foundation:'F2'},hall:{storeys:2,roof:'R05'},workshop:{entrance:'E7'}}),
};
export function cultureSpec(culture,use){
 const c=cultures[culture]??advancedSamples[culture];if(!c)throw Error('unknown culture '+culture);
 const spec={...c.base,...(c.per[use]??{}),use};
 // 用途の機能に由来する共通調整（文化差ではない）
 if(use==='granary'&&!c.per.granary?.window&&spec.window!=='W6')spec.window='W1';
 if(use==='market'){spec.entrance=spec.deepEaves?'E3':spec.foundation==='F5'||spec.structure==='S07'?'E5':'E1';}
 return spec;
}
/** 色（palette・faded）を除いた形の軸。A01「色替えだけはNG」の機械的な事前確認に使う。 */
export function formAxes(input){
 const s=normalizeSpec(input);
 return {roof:s.roof+(s.deepEaves?'+R07':'')+'/'+s.pitch,structure:s.structure,wall:s.wall,roofing:s.roofing,foundation:s.foundation,window:s.window,entrance:s.entrance,
  ornaments:[...s.ornaments].sort().join('+'),storeys:String(s.storeys)};
}
