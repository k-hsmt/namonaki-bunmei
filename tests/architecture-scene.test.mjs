/** Issue #35 D2-c: size override, H1 miniature parts and the review-only scene painter. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {drawArchitecture,measureArchitecture} from '../dist/architecture/draw-v1.js';
import {drawMiniature,miniatureSizes} from '../dist/architecture/miniature-v1.js';
import {createArchitecturePainter} from '../dist/architecture/scene-v1.js';

const probe=()=>{const rects=[];return {rects,rect:(x,y,w,h,c)=>rects.push([x,y,w,h,c])};};
const bounds=rects=>({x0:Math.min(...rects.map(r=>r[0])),x1:Math.max(...rects.map(r=>r[0]+r[2])),y0:Math.min(...rects.map(r=>r[1])),y1:Math.max(...rects.map(r=>r[1]+r[3]))});
/** Minimal 2D context that records fills (enough for drawResidentialRoofs and the painter). */
const ctx=()=>{const calls=[];return {calls,fillStyle:'',fillRect(...a){calls.push(['fillRect',this.fillStyle,...a]);},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){calls.push(['fill',this.fillStyle]);},save(){},restore(){}};};
const house={use:'house',roofFamily:'R01',structure:'S01',roofMaterial:'thatch',pitch:'mid',palette:'P01',foundation:'F2'};

test('D2-c: 幅の指定を省けばD1と同じ描画、指定すれば会堂が敷地の幅まで広がる',()=>{
 const a=probe(),b=probe();drawArchitecture(a,{...house,use:'hall'},50,60);drawArchitecture(b,{...house,use:'hall'},50,60,undefined);
 assert.deepEqual(a.rects,b.rects);
 const wide=probe();drawArchitecture(wide,{...house,use:'hall'},50,60,{width:44});
 assert.ok(bounds(wide.rects).x1-bounds(wide.rects).x0>bounds(a.rects).x1-bounds(a.rects).x0);
 assert.throws(()=>drawArchitecture(probe(),house,50,60,{width:2}),/invalid size/);
 assert.throws(()=>drawArchitecture(probe(),house,50,60,{width:9.5}),/invalid size/);
});

test('D2-c/H1: 小さい版は今の屋根部品の大きさに収まり、決定的に描ける',()=>{
 for(const depth of ['far','middle','near'])for(const roofFamily of ['R01','R02','R03','R04','R05','R06','R08']){
  const spec={...house,roofFamily,roofMaterial:roofFamily==='R05'?'tile':'shingle',eaves:'deep'},a=probe(),b=probe();
  drawMiniature(a,spec,100,150,depth);drawMiniature(b,spec,100,150,depth);
  assert.deepEqual(a.rects,b.rects,depth+roofFamily);
  const [w,h]=miniatureSizes[depth],r=bounds(a.rects);
  assert.ok(r.y1<=150,'never below the part ground line');
  assert.ok(r.x1-r.x0<=w+4&&150-r.y0<=h+6,`${depth} ${roofFamily} too large: ${JSON.stringify(r)}`);
 }
});

test('D2-c/H1: 手前は屋根の系統の輪郭が違い、中は3つの形、奥は色だけ',()=>{
 const shape=(depth,roofFamily)=>{const p=probe();drawMiniature(p,{...house,roofFamily,roofMaterial:roofFamily==='R05'?'tile':'shingle'},100,150,depth);
  const px=new Set();for(const [x,y,w,h] of p.rects)for(let i=0;i<w;i++)for(let j=0;j<h;j++)px.add((x+i)+','+(y+j));return [...px].sort().join(' ');};
 const fams=['R01','R02','R03','R04','R05','R06','R08'];
 assert.equal(new Set(fams.map(f=>shape('near',f))).size,7,'near: seven outlines');
 assert.equal(new Set(fams.map(f=>shape('middle',f))).size,3,'middle: three outlines');
 assert.equal(new Set(fams.map(f=>shape('far',f))).size,1,'far: colour only');
});

const birth=(ref,use,features=house)=>{const {use:_,...f}=features;return {status:'ok',ref,source:{kind:'built',year:5},use,traditionSite:'river-bank',features:{eaves:'normal',window:'W1',entrance:'E1',ornaments:[],storeys:1,wall:'wattle',...f},adjustments:[],substitutions:[]};};

test('D2-c: 描き方の差し替えは、廃墟・field・記録のない建物では本番の絵に戻す',()=>{
 const painter=createArchitecturePainter([birth({kind:'facility',siteId:'river-bank',id:'f1'},'house')]);
 const o=(id,kind,condition='intact')=>({id,kind,x:50,y:60,builtYear:5,condition});
 const plot={x:41,y:57,width:18,depth:7};
 assert.equal(painter.facility(ctx(),o('f1','house'),plot),true);
 assert.equal(painter.facility(ctx(),o('f1','house','ruined'),plot),false);
 assert.equal(painter.facility(ctx(),o('f2','house'),plot),false,'no birth recorded');
 assert.equal(painter.facility(ctx(),o('f1','field'),plot),false);
 const damaged=ctx();painter.facility(damaged,o('f1','house','damaged'),plot);
 assert.ok(damaged.calls.some(c=>c[1]==='#454e48'&&c[2]===44&&c[3]===58),'live damage mark kept');
});

test('D2-c: 共同建築は敷地の幅で描き、住宅の部品は部品番号の範囲の記録で描く',()=>{
 const civic={id:'civic-river-bank-40-great-hall',kind:'hall',x:60,y:80,builtYear:40,condition:'intact',civic:{architectureStyle:'great-hall',footprint:{x:38,y:63,width:44,depth:22},constructionRecordId:'40-1'}};
 const painter=createArchitecturePainter([birth({kind:'facility',siteId:'river-bank',id:civic.id,civic:{style:'great-hall',constructionRecordId:'40-1'}},'hall'),
  birth({kind:'housing',siteId:'river-bank',blockId:'b1',parts:{from:0,to:2}},'rowhouse',{...house,roofFamily:'R05',roofMaterial:'tile'})]);
 const c=ctx();assert.equal(painter.facility(c,civic,civic.civic.footprint),true);
 const xs=c.calls.filter(k=>k[0]==='fillRect').map(k=>[k[2],k[2]+k[4]]);
 assert.ok(Math.max(...xs.map(x=>x[1]))-Math.min(...xs.map(x=>x[0]))>=44);
 const part=(i,condition='sound')=>({partId:'b1:'+i,blockId:'b1',x:100+i*12,y:150,depth:'near',styleId:'terraced',variant:0,representedUnits:1,condition,use:'occupied'});
 const scene={residentialBlocks:[{blockId:'b1',roofParts:[part(0),part(1),part(2),part(0,'ruined')]}]};
 const r=ctx();painter.residentialRoofs(r,scene,'near');
 assert.ok(r.calls.length>0);
 // part 2 has no birth and the ruined part keeps the live drawing: both use live colours
 assert.ok(r.calls.some(k=>k[1]==='#857a66'),'live ruin drawn');
 assert.ok(r.calls.some(k=>k[1]==='#777e79'),'live terraced roof drawn for the part without a birth');
});

test('D2-c: 本番の描画への差し替えは任意で、通常画面は使わない',async()=>{
 const live=await readFile('src/scene/draw-generated-review.ts','utf8');
 assert.match(live,/\(painter\?\.residentialRoofs\?\?drawResidentialRoofs\)\(c,scene,depth\)/);
 assert.match(live,/if\(painter\?\.facility\?\.\(c,o,f\)\)return;/);
 for(const f of ['src/main.ts','src/story/world-session.ts','index.html'])assert.ok(!(await readFile(f,'utf8')).includes('architecture/'),f);
});
