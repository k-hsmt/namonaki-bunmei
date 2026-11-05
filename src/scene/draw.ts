import type {SiteSnapshot,SiteObject} from './model.js';
const W=320,H=180;
type C=CanvasRenderingContext2D;
const P={sky:'#b3c2b4',skyBottom:'#dfd3b1',far:'#8b9c85',hill:'#73896e',ground:'#9a9a70',front:'#76805b',bank:'#9d926c',river:'#658f92',riverLight:'#a0b5a1',wood:'#70594b',roof:'#8c6655',stone:'#aaa18a',bright:'#e6d6b2',dark:'#454e48',grass:'#5d7954'};
function rect(c:C,x:number,y:number,w:number,h:number,col:string){c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function poly(c:C,points:number[],col:string){c.fillStyle=col;c.beginPath();c.moveTo(points[0]!,points[1]!);for(let i=2;i<points.length;i+=2)c.lineTo(points[i]!,points[i+1]!);c.closePath();c.fill();}
function rng(seed:number){let z=seed>>>0;return ()=>{z=(Math.imul(1664525,z)+1013904223)>>>0;return z/4294967296;};}
function tree(c:C,x:number,y:number,k=1){rect(c,x-1*k,y-8*k,3*k,12*k,'#625745');rect(c,x-6*k,y-20*k,13*k,11*k,'#607b57');rect(c,x-10*k,y-17*k,8*k,9*k,'#77916a');rect(c,x+4*k,y-16*k,7*k,9*k,'#4d7055');rect(c,x-4*k,y-24*k,9*k,6*k,'#849672');}
function house(c:C,o:SiteObject,stone:boolean){let x=o.x,y=o.y;if(o.condition==='ruined'){rect(c,x-9,y-6,5,8,P.stone);rect(c,x+6,y-9,4,11,P.stone);rect(c,x-4,y-3,11,4,'#9e9680');rect(c,x-11,y+2,24,2,P.dark);return;}
 rect(c,x-10,y-12,21,14,stone?'#a6a18b':'#aa8f6d');rect(c,x-12,y-13,25,3,P.roof);poly(c,[x-13,y-13,x,y-22,x+14,y-13],stone?'#77716b':P.roof);rect(c,x-2,y-6,5,8,P.dark);rect(c,x-8,y-7,4,3,'#c7bd94');rect(c,x+7,y-7,3,3,'#c7bd94');}
function cloud(c:C,x:number,y:number,dim=false){const a=dim?'#a6afa4':'#e9e1cb';rect(c,x+4,y,19,3,a);rect(c,x,y+3,31,5,a);rect(c,x+8,y-4,10,4,a);rect(c,x+2,y+8,25,2,'#c2c5b3');}
function reeds(c:C,x:number,y:number){rect(c,x,y-7,1,9,'#546e4b');rect(c,x+3,y-5,1,7,'#72885a');rect(c,x+6,y-9,1,11,'#5c7958');rect(c,x-1,y-8,3,2,'#9c8c61');}
function boat(c:C,x:number,y:number){rect(c,x,y,19,3,'#6b5c4d');rect(c,x+3,y+3,13,2,'#92765b');rect(c,x+9,y-12,1,13,'#6d6253');poly(c,[x+10,y-11,x+10,y-1,x+18,y-1],'#dfd4b0');}
function fieldDetails(c:C,x:number,y:number,dry:boolean){for(let i=0;i<5;i++){rect(c,x+i*5,y,1,12,dry?'#ab9c64':'#6c7d49');rect(c,x+i*5-1,y+3,3,2,dry?'#c7b47c':'#a6ac63');rect(c,x+i*5-1,y+7,3,2,dry?'#c7b47c':'#9cad65');}}
function person(c:C,x:number,y:number,color:string){rect(c,x,y,2,2,'#d2b894');rect(c,x-1,y+2,4,4,color);rect(c,x,y+6,1,2,P.dark);rect(c,x+2,y+6,1,2,P.dark);}
export function drawScene(canvas:HTMLCanvasElement,s:SiteSnapshot,seed:number):void {
 const c=canvas.getContext('2d');if(!c)return;canvas.width=W;canvas.height=H;c.imageSmoothingEnabled=false;
 const random=rng(seed^0x1234567);const dry=s.scars.includes('drought'),flood=s.scars.includes('flood'),epidemic=s.scars.includes('epidemic');
 // Fixed horizon, shoreline, hill shapes, and old tree: never shift between dates.
 rect(c,0,0,W,H,dry?'#dac4a0':P.sky);
 rect(c,0,47,W,46,dry?'#c1b28a':P.skyBottom);cloud(c,46,27,dry);cloud(c,218,39,dry);
 poly(c,[0,85,28,72,60,81,103,58,143,78,182,65,223,85,259,63,300,78,320,70,320,117,0,117],P.far);
 poly(c,[0,99,43,89,77,98,132,81,179,106,240,88,320,97,320,138,0,138],P.hill);
 rect(c,0,108,W,72,dry?'#a49a69':P.ground);for(let i=0;i<27;i++){const x=7+i*12;rect(c,x,109+(i%4)*3,5,2,'#a5a47a');}
 // River follows the same course through all generations.
 poly(c,[131,95,147,100,144,115,130,128,123,142,144,160,176,180,265,180,194,160,167,146,158,131,165,115,154,95],flood?'#6296a0':P.river);
 poly(c,[141,101,149,104,146,118,136,131,135,144,151,157,182,180,196,180,154,159,146,145,147,125,154,111],P.riverLight);
 for(let k=0;k<13;k++){const x=133+(k*7)%45;const y=111+k*5;rect(c,x,y,5,1,k%3===0?'#d0c9ac':'#91b1ac');}rect(c,0,148,125,32,P.front);poly(c,[200,150,320,136,320,180,250,180],P.front);
 // Shoreline grass in seeded, permanent positions.
 for(let i=0;i<54;i++){const x=Math.floor(random()*W),y=110+Math.floor(random()*59);if(x>123&&x<200&&y>123)continue;rect(c,x,y,2,3,dry?'#aa9d73':i%3?'#718658':'#b7af82');}
 // Landmark tree remains recognizable, even after many generations.
 tree(c,28,104,2);tree(c,294,102,1);tree(c,310,124,1);for(let i=0;i<9;i++){const x=11+(i*33)%310,y=104+(i%3)*6;if(x>125&&x<180)continue;tree(c,x,y,i%4===0?0.8:0.55);}reeds(c,120,138);reeds(c,200,154);reeds(c,175,129);
 for(let i=0;i<7;i++){const x=8+Math.floor(random()*100),y=120+Math.floor(random()*30);rect(c,x,y,9,3,dry?'#a69a65':'#667d54');}
 const stone=s.objects.filter(o=>o.kind==='memorial').length>2 || s.population>47000;
 for(const o of s.objects){if(o.kind==='house'||o.kind==='ruin'||o.kind==='hall')house(c,o,stone);else if(o.kind==='field'){for(let j=0;j<5;j++)rect(c,o.x-12,o.y-12+j*3,26,1,dry?'#ad956c':'#536f49');fieldDetails(c,o.x-11,o.y-14,dry);}else if(o.kind==='memorial'){rect(c,o.x,o.y-8,4,10,P.stone);rect(c,o.x-2,o.y-9,8,2,P.dark);}}
 if(s.objects.some(o=>o.kind==='bridge'&&o.condition==='intact')){rect(c,120,141,51,4,'#8a755b');for(let j=0;j<5;j++)rect(c,124+j*10,139,2,6,P.wood);}
 if(s.objects.some(o=>o.kind==='bridge'&&o.condition==='damaged')){rect(c,119,143,17,3,P.wood);rect(c,156,144,13,3,P.wood);}
 if(s.population>12500&&!flood)boat(c,145,143);if(s.population>24000){rect(c,20,126,36,2,'#8d7b5e');for(let i=0;i<5;i++)rect(c,21+i*7,125,3,3,'#b7a070');}const count=epidemic?1:Math.min(9,2+Math.floor(Math.log2(Math.max(1,s.population)/1800)));
 const rp=rng((seed^Math.imul(Math.floor(s.year/20)+1,3571))>>>0);
 for(let i=0;i<count;i++){const x=48+Math.floor(rp()*56)+(i%2?150:0),y=123+Math.floor(rp()*12);person(c,x,y,['#66594f','#b29b74','#667a70'][i%3]!);}
 if(s.population>7000){for(let i=0;i<4;i++){const x=57+i*7;rect(c,x,134,1,3,'#c0b08a');rect(c,x+1,133,2,2,'#c4a779');}}if(s.scars.includes('festival')){for(let i=0;i<6;i++)rect(c,65+i*7,110-(i%2)*3,4,3,i%2?'#b98160':'#ddc482');}
 if(s.scars.includes('travel')){rect(c,236,129,18,4,'#8b6950');rect(c,241,133,3,3,P.dark);rect(c,251,133,3,3,P.dark);}
 if(s.scars.includes('fire')){rect(c,78,112,5,9,'#bd7557');rect(c,80,107,3,7,'#e6bc72');rect(c,80,103,5,3,'#b9af9a');}
 if(flood){poly(c,[100,140,126,130,147,142,190,147,213,180,96,180],P.river);rect(c,88,141,25,2,P.riverLight);}
 if(dry){rect(c,0,158,44,2,'#a99b70');rect(c,40,161,24,2,'#a99b70');}
 // Fixed foreground reeds and stones give a sense of depth.
 for(let i=0;i<19;i++){let x=(i*41+13)%320,y=160+(i*7)%18;if(x>134&&x<200)continue;rect(c,x,y,4,2,i%2?'#b4ac8c':'#627856');}
 // Subtle bottom border, purely decorative.
 rect(c,0,179,W,1,'#4b685d');
}
