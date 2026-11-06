import {hash01} from '../engine/rng.js';
import {prototypeWaterAt,type RiverPrototype} from './river-prototype.js';
export const prototypeWaterColors=['#6c999e','#8aadb0'] as const;
/** 320×180の地形だけの試作。家・橋・文明史・植生遷移を生成しない。 */
export function drawRiverPrototype(canvas:HTMLCanvasElement,t:RiverPrototype,drawFar?:(c:CanvasRenderingContext2D)=>void):void{
 canvas.width=320;canvas.height=180;
 const c=canvas.getContext('2d');if(!c)return;c.imageSmoothingEnabled=false;
 c.fillStyle='#b4c3b8';c.fillRect(0,0,320,95);
 c.fillStyle='#d8cfad';c.fillRect(0,48,320,47);
 if(drawFar)drawFar(c);
 else {c.fillStyle='#8b9a7e';c.beginPath();c.moveTo(0,95);
  for(const [x,y] of [[0,84],[42,69],[83,80],[125,61],[172,82],[216,68],[267,80],[320,66],[320,95]])c.lineTo(x!,y!);
  c.closePath();c.fill();}
 c.fillStyle='#9b9e78';c.fillRect(0,95,320,85);
 // 河岸の輪郭を別ロジックで描き直さず、敷地検査と同じ水面マスクを描く。
 for(let y=95;y<180;y++){
  for(let x=0;x<320;x++)if(prototypeWaterAt(t,x+.5,y+.5)){
   c.fillStyle=(y%13===0&&x%19<8)?prototypeWaterColors[1]:prototypeWaterColors[0];
   c.fillRect(x,y,1,1);
  }
 }
 for(let n=0;n<100;n++){
  const x=Math.floor(hash01(t.seed,n,33)*318),y=97+Math.floor(hash01(t.seed,n,34)*80);
  if(!prototypeWaterAt(t,x+.5,y+.5)&&!prototypeWaterAt(t,x+1.5,y+.5)){
   c.fillStyle=n%3?'#8b946a':'#b2ab80';c.fillRect(x,y,2,1);
  }
 }
}
