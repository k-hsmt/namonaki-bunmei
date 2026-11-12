/** Issue 47 B1b: faithful extraction of PR #126 B1a independent expressive sprite painter.
 * Only its original draw shapes are reused; this is NOT game ecology/history.
 * A tiny in-memory Canvas adapter redirects pixel rectangles to the existing prototype Raster.
 * Human must approve shapes before any B2 production migration.
 */
import {Raster} from './pixel-raster.mjs';
class PixelCanvas {
 constructor(width=72,height=64){this.width=width;this.height=height;this.raster=new Raster(width,height)}
 getContext(kind){
  if(kind!=='2d')throw Error('Only 2d is supported');
  const canvas=this;
  return {
   imageSmoothingEnabled:false,fillStyle:'#000000',
   fillRect(x,y,w,h){canvas.raster.rect(Math.round(x),Math.round(y),Math.round(w),Math.round(h),this.fillStyle)},
   drawImage(src,sx,sy,sw,sh,dx,dy,dw,dh){
    if(arguments.length!==9)throw Error('Only 9 argument nearest-neighbor drawImage supported');
    const a=src.raster.data,b=canvas.raster.data;
    for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
     const X=dx+x,Y=dy+y,U=Math.floor(sx+x*sw/dw),V=Math.floor(sy+y*sh/dh);
     if(X<0||Y<0||X>=canvas.width||Y>=canvas.height||U<0||V<0||U>=src.width||V>=src.height)continue;
     const si=(V*src.width+U)*4,di=(Y*canvas.width+X)*4;
     if(a[si+3]!==0)b.set(a.subarray(si,si+4),di);
    }
   }
  };
 }
}
const document={createElement:(tag)=>{if(tag!=='canvas')throw Error('Unsupported prototype element');return new PixelCanvas()}};

'use strict';
const SPEC=[
 ['deciduous','落葉広葉樹','丸く分かれた樹冠と幹の枝分かれ','温帯林'],
 ['evergreen','常緑広葉樹','濃く厚い樹冠と密な葉の層','温暖な湿潤地'],
 ['conifer','針葉樹','細く高い尖塔形と水平の枝段','亜寒帯林'],
 ['tropical','熱帯高木','高い直幹・張り出す樹冠・つる','熱帯雨林'],
 ['savanna','乾燥地の疎林木','曲がる幹と横に平たい樹冠','サバンナ'],
 ['riparian','河畔樹木','縦に垂れる枝葉と明るい河畔の緑','川辺'],
 ['dry-shrub','乾燥地の低木','硬く分かれた小枝と隙間の多い葉','砂漠・ステップ'],
 ['tundra-shrub','寒冷地の低木','横に這う低い枝とまばらな葉','ツンドラ'],
 ['bush','一般低木','地表近くで丸く重なる小さな塊','温帯林'],
 ['grass','草本類','高さの違う穂と細い葉の束','草原・ステップ'],
 ['fern','林床植物','扇状に開く羽状葉とシダの層','熱帯・温帯林'],
 ['reeds','湿地植物','水際で垂直に伸びる葦と穂','淡水湿地'],
 ['moss','苔・地衣類','岩と地表に沿った薄い斑状被覆','ツンドラ・林床']
];
const P={bark:'#645744',bark2:'#827254',barkLight:'#a49270',dark:'#344f3c',leaf:'#58734d',light:'#8c9c65',bright:'#aeb381',fir:'#3e5c51',fir2:'#647b60',tropic:'#37634e',tropic2:'#648657',dry:'#8e8964',dry2:'#b2a177',cold:'#7e9085',cold2:'#a9b9a2',soil:'#a69c7c'};
function paper(){const c=document.createElement('canvas');c.width=72;c.height=64;return c}
function painter(c){const x=c.getContext('2d');x.imageSmoothingEnabled=false;const r=(a,b,w,h,col)=>{x.fillStyle=col;x.fillRect(Math.round(a),Math.round(b),w,h)};
 const line=(x1,y1,x2,y2,col,weight=1)=>{let dx=Math.abs(x2-x1),sx=x1<x2?1:-1,dy=-Math.abs(y2-y1),sy=y1<y2?1:-1,err=dx+dy;while(true){r(x1,y1,weight,weight,col);if(x1===x2&&y1===y2)break;const e2=2*err;if(e2>=dy){err+=dy;x1+=sx}if(e2<=dx){err+=dx;y1+=sy}}};
 const oval=(cx,cy,rx,ry,col)=>{for(let y=-ry;y<=ry;y++){const d=1-(y*y)/(ry*ry);if(d<0)continue;const width=Math.floor(rx*Math.sqrt(d));r(cx-width,cy+y,width*2+1,1,col)}};
 const shade=(cx,cy,rx,ry,a,b)=>{oval(cx,cy,rx,ry,a);oval(cx-rx/3|0,cy-ry/3|0,Math.max(1,rx-3),Math.max(1,ry-3),b)};
 const dot=(cx,cy,radius,col,count=12)=>{for(let i=0;i<count;i++){const u=((i*17+13)%37)/36*2-1,v=((i*11+3)%31)/30*2-1;if(u*u+v*v<.95)r(Math.round(cx+u*radius),Math.round(cy+v*radius*.6),i%3===0?2:1,1,col)}};
 return {x,r,line,oval,shade,dot};}
function renderPlant(id,young=false){
 const full=paper(),{r,line,oval,shade,dot}=painter(full);
 if(id==='deciduous'){
  r(34,30,4,30,P.bark);r(32,56,9,3,P.bark2);line(35,40,19,27,P.bark,2);line(37,42,50,24,P.bark,2);
  shade(20,25,12,9,'#4a6847','#71905c');shade(48,25,12,10,'#4e704d','#829866');shade(35,16,14,11,'#476b48','#7f9662');oval(35,30,14,7,'#527951');dot(23,22,11,'#a2ab77',16);dot(45,20,11,'#a3ac7c',14);
 }else if(id==='evergreen'){
  r(34,31,5,28,P.bark);r(31,57,11,2,P.bark2);line(35,39,24,30,P.bark2,2);line(37,37,48,31,P.bark2,2);
  oval(32,29,21,13,'#314f3c');oval(38,23,18,13,'#426a49');oval(29,19,15,12,'#507654');oval(42,25,12,9,'#58794d');dot(25,19,13,'#819a63',13);dot(41,20,13,'#819662',9);r(27,32,21,3,'#3c6043');
 }else if(id==='conifer'){
  r(34,11,3,49,'#705943');r(33,54,5,5,P.bark2);
  for(let i=0;i<7;i++){const y=11+i*6,w=2+i*3;r(35-w,y,w*2+1,5,'#324e48');r(35-w+2,y,w*2-3,2,'#5a7962');r(35-w+1,y+4,Math.max(2,w*2-1),1,'#425e50')}
  r(34,7,2,8,'#66806d');r(35,57,2,3,P.bark);
 }else if(id==='tropical'){
  r(33,23,5,36,'#715943');r(31,38,2,17,'#8a7151');line(33,49,25,59,'#755c46',2);line(38,50,45,59,'#755c46',2);line(35,25,18,17,P.bark,2);line(37,24,56,19,P.bark,2);
  oval(19,18,13,7,'#315b43');oval(50,16,15,8,'#3b6648');oval(34,11,17,10,'#3e6a49');oval(29,13,13,8,'#588055');dot(31,9,16,'#90a26b',12);
  for(const x of [13,18,49,56]){r(x,23,1,x%2?13:18,'#547753');r(x+1,29,1,2,'#8fa56e')}
 }else if(id==='savanna'){
  line(35,59,37,34,P.bark,3);line(37,36,27,26,P.bark,2);line(38,34,49,24,P.bark,2);line(30,29,18,24,P.bark2,1);line(45,27,58,24,P.bark2,1);
  oval(22,22,14,4,'#777f53');oval(48,20,18,5,'#657a4c');oval(35,18,20,5,'#82915a');r(15,23,12,2,'#536c46');r(45,24,15,2,'#596e49');dot(39,18,20,'#b0ad75',9);
 }else if(id==='riparian'){
  r(34,26,4,33,P.bark);line(36,35,21,27,P.bark2,2);line(36,37,52,28,P.bark2,2);
  oval(34,18,24,10,'#426d53');oval(23,23,17,10,'#64895e');oval(50,23,13,8,'#658f68');oval(31,13,16,8,'#93a57a');
  for(let x=13;x<60;x+=4){const top=18+(x%4),len=8+(x*7)%19;line(x,top,x+(x%3===0?1:-1),top+len,x%8===1?'#83a575':'#537e61');r(x,top+len,2,3,'#90a777')}
 }else if(id==='dry-shrub'){
  for(const [a,b,c,d]of [[35,58,20,43],[37,59,45,39],[38,55,57,45],[33,57,28,47],[34,57,40,43]])line(a,b,c,d,P.bark2,1);
  for(const [x,y] of [[20,43],[25,46],[44,39],[50,46],[56,45],[35,44],[31,42]]){r(x-3,y-2,7,3,'#8e936b');r(x-2,y-3,4,2,'#b3a77b');r(x,y,5,2,'#6c7657')}
  r(30,58,15,1,'#928667');
 }else if(id==='tundra-shrub'){
  line(16,57,50,57,P.bark2);for(const [x,dx,h] of [[20,-3,6],[28,3,7],[37,-4,9],[44,4,6],[53,3,4]]){line(x,57,x+dx,57-h,P.bark2);r(x+dx-3,56-h,7,3,'#718779');r(x+dx-2,54-h,5,2,'#9fae94')}
  for(let x=13;x<60;x+=9)r(x,59,6,1,'#9a9e86');
 }else if(id==='bush'){
  r(33,48,3,12,P.bark);for(const [x,y,rx,ry,col]of [[19,47,12,7,'#476548'],[47,45,12,8,'#51714e'],[34,40,15,10,'#5f8156'],[28,47,15,7,'#71915d']])oval(x,y,rx,ry,col);dot(34,42,21,'#9da87a',21);
 }else if(id==='grass'){
  for(const [x,ht]of [[16,13],[24,21],[32,14],[38,26],[44,18],[53,17]]){line(x,59,x+(x%4-2),59-ht,x%2?'#8b9661':'#a8a474');r(x+(x%4-2)-1,59-ht-3,3,4,'#c4b481')}
  for(const [x,d]of [[20,-9],[29,-7],[35,8],[42,10],[50,-7]])line(x,59,x+d,52,P.leaf);
  r(19,58,34,2,'#859268');
 }else if(id==='fern'){
  for(const [x,y,dx,dy]of [[36,57,-24,-24],[36,57,25,-23],[36,57,-11,-31],[36,57,7,-37]]){
   line(x,y,x+dx,y+dy,'#496d52');for(let k=2;k<12;k++){const xx=x+Math.round(dx*k/13),yy=y+Math.round(dy*k/13);r(xx-3,yy-2,4,2,'#719c67');r(xx,yy-3,4,2,'#5d885c')}}
  r(34,50,3,9,'#536e51');
 }else if(id==='reeds'){
  r(12,59,49,2,'#849177');for(const [x,h]of [[18,29],[23,34],[29,25],[33,39],[39,29],[45,36],[51,27],[56,32]]){r(x,59-h,1,h,'#6d906c');r(x-1,59-h-4,3,6,x%2?'#826c4f':'#a18e66');line(x,54,x+6,43,'#84a174');line(x,53,x-6,46,'#7b9571')}
 }else if(id==='moss'){
  for(const [x,y,rx,ry,col]of [[18,57,10,3,'#728475'],[31,56,12,4,'#839680'],[47,57,13,3,'#a6ad8b'],[55,58,6,2,'#758b7a']])oval(x,y,rx,ry,col);
  for(const [x,y]of [[21,57],[32,54],[49,55],[55,58]]){r(x,y,4,1,'#c0bfa0');r(x+3,y+1,1,1,'#627c77')}
  r(25,59,4,1,'#536f63');r(40,57,8,1,'#c2b99c');
 }else throw Error('Unknown archetype '+id);
 if(!young)return full;
 const out=paper(),d=out.getContext('2d');d.imageSmoothingEnabled=false;const scale=id==='conifer'||id==='tropical'?0.56:id==='grass'||id==='moss'?0.7:0.64;const w=Math.round(72*scale),h=Math.round(64*scale);d.drawImage(full,0,0,72,64,Math.round((72-w)/2),64-h,w,h);return out;
}

export const expressiveCatalog=Object.freeze(SPEC.map(([id,label])=>Object.freeze({id,label})));
export function renderExpressivePlant(id,{stage='mature'}={}){
 if(!['young','mature'].includes(stage))throw Error('Invalid expressive stage');
 if(!SPEC.some(s=>s[0]===id))throw Error('Unknown expressive plant '+id);
 return renderPlant(id,stage==='young').raster;
}
