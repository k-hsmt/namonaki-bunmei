import { SeededRng } from '../engine/rng.js';
export type Trait = '川沿いの農耕'|'高原の放牧'|'沿岸の漁撈'|'森林の採集';
export type Dimension = 'population'|'food'|'cohesion'|'knowledge'|'exchange'|'culture';
export interface RecordEntry { id:string; year:number; tag:string; title:string; body:string; causes:string[]; important?:boolean; }
export interface Choice { label:string; description:string; impacts:Partial<Record<Dimension,number>>; consequence:string; }
export interface Decision { id:string; year:number; question:string; context:string; options:Choice[]; }
export type LegacyKind = 'granary'|'waterworks'|'trade_network'|'archive'|'council'|'care'|'migration'|'fracture';
export interface Legacy {kind:LegacyKind; established:number; strength:number; lastChanged:number; origin:string;}
export type MemoryLog = {year:number;kind:LegacyKind;action:'formed'|'strengthened'|'weakened'|'lost';reason:string;strength:number;established:number};
export interface CivilizationMemory {legacies:Partial<Record<LegacyKind,Legacy>>;log:MemoryLog[];}
export interface CivilizationState { version:2; memory?:CivilizationMemory; seed:number; rngState:number; year:number; name:string; homeland:string; trait:Trait; population:number; food:number; cohesion:number; knowledge:number; exchange:number; culture:number; drought:number; epidemic:number; lastKind:Record<string,number>; history:RecordEntry[]; pending:Decision|null; decisions:{year:number;label:string}[]; samples:{year:number;population:number}[]; lastDecisionId?:number; }
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const names=['アムラ','セイラ','ルグナ','オルフェ','サリュ','ナヴァ','イリス','ヘルメ','トルア','ヴェリ','ミルハ','シルダ'];
const places=['碧い大河の流域','石灰岩の高原','霧深い湾岸','北方の針葉樹林','季節風の吹く丘陵','内海に面した湿地','二つの山脈の谷間','乾燥した草原の縁'];
const traits:Trait[]=['川沿いの農耕','高原の放牧','沿岸の漁撈','森林の採集'];
function entry(s:CivilizationState,tag:string,title:string,body:string,causes:string[]=[],important=false){s.history.push({id:`${s.year}-${s.history.length}`,year:s.year,tag,title,body,causes,important});}
export function createCivilization(seed:number):CivilizationState {
 const n=(seed>>>0)||1; const r=new SeededRng(n); const homeland=places[r.int(0,places.length-1)]!; const trait=traits[r.int(0,traits.length-1)]!;
 const s:CivilizationState={version:2,seed:n,rngState:r.state,year:0,name:names[r.int(0,names.length-1)]!+'の民',homeland,trait,population:r.int(1800,7000),food:r.int(50,76),cohesion:r.int(52,74),knowledge:r.int(5,16),exchange:r.int(9,29),culture:r.int(25,52),drought:0,epidemic:0,lastKind:{},history:[],pending:null,decisions:[],samples:[],lastDecisionId:-1,memory:{legacies:{},log:[]}};
 s.rngState=r.state; entry(s,'誕生',`${s.name}が生まれる`,`${homeland}に、いくつかの集落が形成された。人々は${trait}を暮らしの中心とし、まだ自分たちの行く末を知らない。`,['地形と生活様式が抽選された'],true); s.samples.push({year:0,population:s.population}); return s;
}
// Institutions and shared practices persist beyond the event that created them.
// Their strength changes slowly, affects later outcomes and can disappear.
export function ensureMemory(s:CivilizationState):CivilizationMemory {
 if(!s.memory||!s.memory.legacies||!Array.isArray(s.memory.log))s.memory={legacies:{},log:[]};
 return s.memory;
}
const descriptions:Record<LegacyKind,string>={
 granary:'共同の穀物庫',waterworks:'水路と堤の管理',trade_network:'継続した交易網',
 archive:'記録の習慣',council:'寄り合いの制度',care:'看病と衛生の知恵',
 migration:'移住者との共生',fracture:'分かれた共同体の記憶'
};
export {descriptions as legacyNames};
export function legacyStrength(s:CivilizationState,k:LegacyKind):number{return ensureMemory(s).legacies[k]?.strength??0;}
function remember(s:CivilizationState,k:LegacyKind,delta:number,reason:string){
 const m=ensureMemory(s),before=m.legacies[k];const next=clamp((before?.strength??0)+delta,0,100);
 if(!before&&next===0)return;
 const action:MemoryLog['action']=!before?'formed':next===0?'lost':next>before.strength?'strengthened':'weakened';
 if(next===0)delete m.legacies[k];else m.legacies[k]={kind:k,established:before?.established??s.year,strength:next,lastChanged:s.year,origin:before?.origin??reason};
 m.log.push({year:s.year,kind:k,action,reason,strength:next,established:before?.established??s.year});
 // Record major turning points, not every small adjustment.
 if(action==='formed'||action==='lost')entry(s,'継承',action==='formed'?`${descriptions[k]}が根づく`:`${descriptions[k]}が失われる`,reason,[`長く続く暮らしの変化`],true);
}
function recordLegacy(s:CivilizationState,kind:string,title:string){
 const mapping:Record<string,LegacyKind>={first_granary:'granary',first_port:'trade_network',first_archive:'archive',first_confederation:'council',first_fragment:'fracture',irrigation:'waterworks',dike:'waterworks',healing:'care',arrival:'migration',trade:'trade_network',council:'council',split:'fracture',writing:'archive',well:'waterworks',bridge_repair:'waterworks',ferry:'trade_network',midwife:'care',tax:'council'};
 const k=mapping[kind];if(!k)return;
 const initial={granary:45,waterworks:28,trade_network:30,archive:36,council:32,care:25,migration:22,fracture:32}[k];
 const existing=legacyStrength(s,k);
 // Repeated practice reinforces existing institutions but not indefinitely.
 if(existing>0&&existing>=90)return;
 remember(s,k,existing?Math.min(9,100-existing):initial,`${title}。この経験が後の世代へ受け継がれた。`);
}
function ageLegacies(s:CivilizationState,rng:SeededRng){
 const m=ensureMemory(s);
 for(const k of Object.keys(m.legacies) as LegacyKind[]){
  const legacy=m.legacies[k]!;
  // One annual update. Fragile arrangements need continued support.
  const support=k==='granary'?s.food:k==='trade_network'?s.exchange:k==='archive'?s.knowledge:k==='council'?s.cohesion:k==='waterworks'?s.food:k==='care'?s.culture:k==='migration'?s.cohesion:100-s.cohesion;
  const stress=support<36?1.6:support<55?.55:.16;
  if(rng.next()<.08+stress*.09){const loss=stress>1?2:1;const next=Math.max(0,legacy.strength-loss);legacy.strength=next;legacy.lastChanged=s.year;
   if(next>0)m.log.push({year:s.year,kind:k,action:'weakened',reason:'長年の維持と環境条件による変化',strength:next,established:legacy.established});
   if(next===0){delete m.legacies[k];m.log.push({year:s.year,kind:k,action:'lost',reason:`維持する人々が減り、${descriptions[k]}は次第に使われなくなった。`,strength:0,established:legacy.established});entry(s,'継承',`${descriptions[k]}が失われる`,'かつて受け継がれていた習慣や施設は、いまでは見られなくなった。',['維持する条件の変化'],true);}
  }
 }
}
export function legacySummary(s:CivilizationState):{kind:LegacyKind;name:string;strength:number;established:number}[]{
 return Object.values(ensureMemory(s).legacies).map(x=>({kind:x.kind,name:descriptions[x.kind],strength:x.strength,established:x.established})).sort((a,b)=>a.established-b.established);
}
export function chooseAutomatically(s:CivilizationState):number {
 if(!s.pending)throw Error('No choice pending');
 const rng=new SeededRng(s.rngState);const i=rng.int(0,s.pending.options.length-1);
 s.rngState=rng.state;choose(s,i,'auto');return i;
}
interface EventRule {kind:string; tag:string; weight:(s:CivilizationState)=>number; apply:(s:CivilizationState,r:SeededRng)=>[string,string,string[]]; important?:boolean; }
const bump=(s:CivilizationState,k:Dimension,amount:number)=>{(s as any)[k]=k==='population'?Math.max(60,Math.round(s.population*(1+amount))):clamp((s as any)[k]+amount,0,100);};
const rules:EventRule[]=[
 {kind:'flood',tag:'自然',weight:s=>s.trait==='川沿いの農耕'?8:3,apply:s=>{bump(s,'food',-13);bump(s,'population',-.022);return ['大河が堤を越える','数日続いた雨で低地が水に浸かった。失われた畑がある一方、水が引いた土地には新しい土が残った。',['河川に近い居住地','大雨による浸水']]}},
 {kind:'earthquake',tag:'自然',weight:()=>2.5,apply:s=>{bump(s,'cohesion',-8);bump(s,'population',-.018);return ['大地が揺れ、集落の一部が崩れる','揺れは短かったが、家屋と水路に被害を残した。人々は住む場所の安全を考え直し始めた。',['地殻活動（簡略化した確率モデル）']]}},
 {kind:'storm',tag:'自然',weight:s=>s.trait==='沿岸の漁撈'?8:4,apply:s=>{bump(s,'food',-8);return ['激しい嵐が季節を乱す','風雨によって食糧の蓄えと住まいの一部が失われた。再建は少しずつ進む。',['季節的な気象の変動']]}},
 {kind:'eruption',tag:'自然',weight:()=>.9,apply:s=>{bump(s,'food',-19);bump(s,'population',-.045);return ['遠くの山から灰が降る','数日間、空は薄暗かった。灰は畑を覆い、翌年の収穫にも影響が残った。',['火山活動を仮定した稀な出来事']]} ,important:true},
 {kind:'drought',tag:'自然',weight:s=>s.drought>2?11:3.5,apply:s=>{bump(s,'food',-12);bump(s,'cohesion',-3);return ['雨を待つ季節が続く','井戸は浅くなり、共同の貯蔵庫が開かれた。畑と家畜のどちらを優先するかで意見が分かれる。',['連続した少雨','貯蔵食糧への依存']]}},
 {kind:'harvest',tag:'暮らし',weight:s=>s.food<65?10:5,apply:s=>{bump(s,'food',13);return ['思いがけず豊作の年となる','季節の巡りが穏やかで、蓄えを増やすことができた。人々の暮らしに短い余裕が訪れた。',['降雨が比較的安定','食糧生産の年変動']]}},
 {kind:'famine',tag:'危機',weight:s=>s.food<35?15:0.2,apply:s=>{bump(s,'population',-.08);bump(s,'cohesion',-9);return ['飢えの季節が訪れる','食糧が足りず、幼い者や年長者から命を落とす人が出た。別の土地を目指す家族もいる。',['食糧備蓄の不足','社会の脆弱性']]} ,important:true},
 {kind:'disease',tag:'疫病',weight:s=>s.population>7000?6+s.exchange/30:2,apply:(s,r)=>{const loss=r.between(.025,.11)*(1+s.exchange/180);bump(s,'population',-loss);bump(s,'cohesion',-6);s.epidemic=5;return ['熱病が集落を巡る',`発熱を伴う病が広がった。看病と葬送が日常を変え、人々の往来もしばらく減った。`,['人口集中による接触機会','交流路を介した伝播の可能性']]} ,important:true},
 {kind:'healing',tag:'暮らし',weight:s=>s.epidemic>0?13:1,apply:s=>{bump(s,'cohesion',6);return ['病を見守る習わしが広まる','経験を語り継ぐ者が増え、病人を隔てて世話する工夫が生まれた。効果はまだ確かなものではない。',['過去の流行の記憶']]}},
 {kind:'migration',tag:'人々',weight:s=>s.food<45?11:4,apply:s=>{bump(s,'population',-.023);bump(s,'exchange',4);return ['一部の家族が新天地へ旅立つ','土地の負担と新しい暮らしへの期待から、幾つかの家族が遠くへ移った。彼らの消息はときおり届く。',['土地への人口圧力','移住という選択']]}},
 {kind:'arrival',tag:'人々',weight:s=>s.exchange>38?9:3,apply:s=>{bump(s,'population',.025);bump(s,'culture',5);return ['遠方から旅人が訪れる','異なる言葉と習慣を持つ一団が定住を望んだ。最初は距離があったが、次第に仕事を分かち合った。',['移住ネットワーク','社会的接触']]}},
 {kind:'trade',tag:'交流',weight:s=>s.exchange>25?12:5,apply:s=>{bump(s,'exchange',7);bump(s,'food',4);return ['物々交換の道が伸びる','山向こうの集落と品物が行き交い、ここにはない素材や食べ物が手に入るようになった。',['人の移動','余剰生産物の交換']]}},
 {kind:'isolation',tag:'交流',weight:s=>s.exchange>33?6:2,apply:s=>{bump(s,'exchange',-10);bump(s,'cohesion',2);return ['古い交易路が途絶える','遠くから届いていた品が来なくなった。集落は身近な資源を頼るようになった。',['交通や相手社会の変化']]}},
 {kind:'language',tag:'文化',weight:()=>5,apply:s=>{bump(s,'culture',8);return ['新しい言い回しが広がる','季節の祭りで歌われた言葉が、離れた集落にも伝わった。少しずつ共通の言葉が育ってゆく。',['集落間の交流','世代を越えた伝承']]}},
 {kind:'ritual',tag:'文化',weight:()=>5,apply:s=>{bump(s,'culture',7);bump(s,'cohesion',2);return ['祖先を偲ぶ祭りが始まる','死者の名を語る集まりが、年に一度の習わしになった。誰が始めたのかは、やがて忘れられた。',['社会的記憶','儀礼の共有']]}},
 {kind:'song',tag:'文化',weight:()=>6,apply:s=>{bump(s,'culture',6);return ['川辺の歌が幾世代も歌い継がれる','ある歌は広く知られるようになり、歌詞を変えながら遠くの村へ伝わった。',['口承文化の変化']]}},
 {kind:'craft',tag:'知恵',weight:()=>7,apply:s=>{bump(s,'knowledge',6);return ['道具づくりに新しい工夫が生まれる','木や石を扱う手順が少し変わり、仕事に必要な時間が減った。すべての集落に伝わるには時間がかかる。',['反復作業からの学習']]}},
 {kind:'irrigation',tag:'知恵',weight:s=>s.trait==='川沿いの農耕'?10:2,apply:s=>{bump(s,'knowledge',6);bump(s,'food',9);return ['水を分けるための溝が掘られる','いくつかの集落が協力し、畑へ水を引く仕組みを作った。維持のための取り決めも生まれた。',['河川へのアクセス','共同労働']]}},
 {kind:'navigation',tag:'知恵',weight:s=>s.trait==='沿岸の漁撈'?10:2,apply:s=>{bump(s,'knowledge',5);bump(s,'exchange',8);return ['遠い岬を越える航海が試みられる','風を読む経験が積み重なり、沿岸の移動は少しずつ遠くまで届くようになった。',['海岸生活','移動技術の伝承']]}},
 {kind:'writing',tag:'知恵',weight:s=>s.knowledge>35&&s.population>18000?7:0,apply:s=>{bump(s,'knowledge',12);bump(s,'culture',6);return ['数を記すしるしが使われ始める','収穫物と交換品の記録に、決まった印が使われるようになった。それは次第に言葉を表す仕組みへ変化するかもしれない。',['交易の管理','蓄積した知識']]} ,important:true},
 {kind:'council',tag:'社会',weight:s=>s.population>5000?7:2,apply:s=>{bump(s,'cohesion',7);return ['集落を越えた話し合いが始まる','用水と境界をめぐる争いを収めるため、人々は定期的に集まるようになった。',['共同資源の管理']]}},
 {kind:'dispute',tag:'社会',weight:s=>s.cohesion<55?10:3,apply:s=>{bump(s,'cohesion',-10);return ['土地の使い方をめぐって対立する','新しい畑を求める家族と古い習慣を守る家族の間で、長い話し合いが続いた。',['人口と土地への需要','意思決定の摩擦']]}},
 {kind:'reconciliation',tag:'社会',weight:s=>s.cohesion<42?15:2,apply:s=>{bump(s,'cohesion',9);return ['対立した集落が和解する','共同の祭りを機に、争っていた集落は再び行き来を始めた。',['分断による負担','交流の回復']]}},
 {kind:'split',tag:'社会',weight:s=>s.population>18000&&s.cohesion<32?20:0,apply:s=>{bump(s,'cohesion',8);bump(s,'population',-.065);bump(s,'culture',3);return ['人々は二つの道を選ぶ','長年の対立から、一部の集落が別の共同体として暮らし始めた。文化の一部は受け継がれ、別の習慣が生まれる。',['低下した社会的結束','集落間の対立']]} ,important:true},
 {kind:'fire',tag:'災厄',weight:s=>s.population>10000?5:3,apply:s=>{bump(s,'food',-6);bump(s,'knowledge',2);return ['大きな火災が住まいを焼く','乾いた季節の火が集落へ燃え移った。再建を通して住居の造りを改める人々もいた。',['可燃物の蓄積','乾燥した気候']]}},
 {kind:'garden',tag:'暮らし',weight:s=>s.food>45?6:3,apply:s=>{bump(s,'food',5);bump(s,'culture',3);return ['家々で小さな菜園が広まる','家の近くで育てる作物が増え、食卓に季節ごとの変化が生まれた。',['日々の試行錯誤']]}},
 {kind:'forest',tag:'自然',weight:s=>s.trait==='森林の採集'?10:2,apply:s=>{bump(s,'food',-5);bump(s,'knowledge',3);return ['森の姿が変わり始める','長年の伐採と火入れによって、集落を囲む植生が少しずつ変わった。',['人間活動による環境変化']]}},
 {kind:'market',tag:'交流',weight:s=>s.population>12000?7:1,apply:s=>{bump(s,'exchange',8);bump(s,'culture',4);return ['定期的な市が立つ','月に幾度か、離れた集落の人々が品物と噂話を持ち寄るようになった。',['人口集中','交換の反復']]}},
 {kind:'peace',tag:'暮らし',weight:()=>5,apply:s=>{bump(s,'cohesion',4);return ['特筆すべき争いのない時代が続く','子が大人となり、親の仕事を受け継いだ。歴史書にはわずかしか記されない、長い日常があった。',['比較的安定した社会環境']]}},
 {kind:'decline',tag:'人々',weight:s=>s.food<43&&s.cohesion<50?13:1,apply:s=>{bump(s,'population',-.045);return ['人の住まなくなった村が現れる','かつての道は草に覆われた。人々が去った理由は一つではなかった。',['生活基盤の変化','移住の蓄積']]}},
 {kind:'rebirth',tag:'人々',weight:s=>s.population<13000&&s.food>68?12:2,apply:s=>{bump(s,'population',.055);bump(s,'cohesion',5);return ['忘れられた土地に人が戻る','離れていた家族の子孫が再び暮らし始めた。古い石積みは、新しい家の一部となった。',['利用可能な土地','生計の回復']]}},
];
// Rare or threshold-driven turning points are recorded once, rather than recurring forever.
const turningPoints:EventRule[]=[
 {kind:'first_granary',tag:'制度',weight:s=>s.population>6500&&s.food>48?18:0,apply:s=>{bump(s,'food',8);return ['共同の穀物庫が築かれる','豊かな季節の余剰を集め、飢えた家へ分ける場所が生まれた。管理をめぐる新しい役目も生まれる。',['余剰生産','食糧の共同管理']]}},
 {kind:'first_port',tag:'交流',weight:s=>s.exchange>45?15:0,apply:s=>{bump(s,'exchange',7);return ['川辺に常設の交易所ができる','往来する旅人のために、荷を預かる家と舟着場が整えられた。知らない土地の物語が語られる。',['交易網の定着']]}},
 {kind:'first_archive',tag:'文化',weight:s=>s.knowledge>43&&s.culture>47?18:0,apply:s=>{bump(s,'culture',8);return ['記録を守る人々が現れる','季節の巡りや過去の飢饉を書き残す習わしが生まれた。記録は争いにも和解にも使われた。',['知識の蓄積','共同体の記憶']]}},
 {kind:'first_city',tag:'社会',weight:s=>s.population>28000&&s.food>43?18:0,apply:s=>{bump(s,'cohesion',-5);return ['村々の中心に大きな町が生まれる','住居と仕事場が密集し、人々は互いに知らない隣人と暮らすようになった。',['人口集中','役割の分化']]} ,important:true},
 {kind:'first_confederation',tag:'制度',weight:s=>s.population>18000&&s.cohesion>60?11:0,apply:s=>{bump(s,'cohesion',5);return ['集落の寄り合いが連合となる','それぞれの土地の決まりを残したまま、川と道の維持だけを共同で担うことになった。',['集落間の協力']]}},
 {kind:'first_fragment',tag:'社会',weight:s=>s.population>13000&&s.cohesion<28?15:0,apply:s=>{bump(s,'population',-.045);return ['長く続いた共同の決まりが解かれる','集落は互いに違う決まりで暮らし始めた。古い祭りだけはしばらく一緒に行われた。',['社会の分化']]} ,important:true},
 {kind:'first_terrace',tag:'知恵',weight:s=>s.knowledge>55?10:0,apply:s=>{bump(s,'food',8);return ['土地を幾段にも整える', '耕地に石を積み、雨の水をとどめる工夫が伝わった。維持するための労働も増えた。',['土地利用の変化']]}},
 {kind:'first_library',tag:'文化',weight:s=>s.knowledge>72?12:0,apply:s=>{bump(s,'culture',6);return ['物語と記録が集められる','長い歳月の出来事をまとめる人が現れた。記されなかった暮らしも数多くあった。',['記録の保存']]}},
];
const everydayVariants:{kind:string;tag:string;title:string;body:string;causes:string[];food?:number;cohesion?:number;culture?:number;exchange?:number;knowledge?:number;weight:(s:CivilizationState)=>number}[]=[
 {kind:'salt',tag:'交流',title:'塩を運ぶ道が定まる',body:'遠くの土地から塩が運ばれ、保存食の作り方が変わった。',causes:['交易路の形成'],exchange:3,weight:s=>s.exchange>25?5:1},
 {kind:'pottery',tag:'知恵',title:'器を焼く窯が改良される',body:'長く火を保つ方法が伝わり、丈夫な器が日常に増えた。',causes:['ものづくりの蓄積'],knowledge:3,weight:s=>s.knowledge>20?5:2},
 {kind:'midwife',tag:'暮らし',title:'出産を助ける経験が語り継がれる',body:'年長者の経験が家々へ伝わり、家族のあり方にも小さな変化が生まれた。',causes:['世代間の知識の伝承'],cohesion:2,weight:()=>4},
 {kind:'well',tag:'暮らし',title:'共同井戸が掘られる',body:'水を汲むための場所ができ、朝には自然と人が集まるようになった。',causes:['水の確保'],food:3,weight:s=>s.food<60?6:2},
 {kind:'bridge_repair',tag:'暮らし',title:'古い橋が修繕される',body:'傷んだ橋板を取り換えた。旅をする人も、近くに暮らす人も、その小さな仕事に助けられた。',causes:['交通の維持'],exchange:3,weight:s=>s.exchange>25?6:2},
 {kind:'new_crops',tag:'暮らし',title:'遠来の種が畑に根づく',body:'持ち込まれた種は最初こそ珍しがられたが、やがて土地の食卓になじんだ。',causes:['人と作物の移動'],food:5,weight:s=>s.exchange>40?6:1},
 {kind:'marriage',tag:'人々',title:'離れた集落同士の婚姻が増える',body:'親族のつながりが広がり、境界の意味が少しずつ変わった。',causes:['社会関係の拡大'],cohesion:3,weight:()=>4},
 {kind:'cold',tag:'自然',title:'厳しい冬が家々を試す',body:'薪が足りず、人々は集まって冬を越した。春にはいくつかの家が空になっていた。',causes:['寒冷な季節'],food:-4,weight:()=>3},
 {kind:'fish',tag:'暮らし',title:'川の漁に新しい網が使われる',body:'編み方を変えた網が広まり、浅瀬での漁の仕方が変わった。',causes:['生計の工夫'],knowledge:3,weight:s=>s.trait==='川沿いの農耕'?6:2},
 {kind:'funeral',tag:'文化',title:'墓地の場所をめぐり話し合う',body:'亡き人を葬る土地が狭くなり、人々は新しい場所を定めた。',causes:['人口と土地利用'],culture:4,weight:s=>s.population>9000?5:2},
 {kind:'dike',tag:'知恵',title:'川沿いに低い土手が築かれる',body:'毎年の増水を避けるため土を運び、農地を守ろうとした。',causes:['洪水の経験'],knowledge:3,weight:s=>s.trait==='川沿いの農耕'?6:2},
 {kind:'tax',tag:'制度',title:'共同作業の分担が記される',body:'誰が何日働いたかを記す決まりが生まれ、負担の公平さが話し合われた。',causes:['共同事業の複雑化'],cohesion:-2,weight:s=>s.population>12000?6:1},
 {kind:'pilgrim',tag:'文化',title:'遠くの祈りの場所へ向かう人が現れる',body:'人々は旅の途中で歌や物語を交換した。',causes:['文化的な往来'],culture:4,weight:s=>s.culture>40?5:2},
 {kind:'fishing_ban',tag:'社会',title:'川の一部で漁を休む決まりができる',body:'魚が減ったとの声を受け、季節ごとの禁漁が試された。',causes:['資源利用の調整'],cohesion:3,weight:()=>3},
 {kind:'apprentice',tag:'知恵',title:'職人たちが弟子を集める',body:'道具の扱い方を教える場ができ、技術が一族の外へ伝わった。',causes:['技能の継承'],knowledge:4,weight:s=>s.knowledge>38?6:2},
 {kind:'storyteller',tag:'文化',title:'旅する語り部が集落を訪れる',body:'遠くの話と土地の昔話が混じり、誰も由来を知らない物語が生まれた。',causes:['口承文化の交流'],culture:4,weight:()=>4},
 {kind:'landslide',tag:'自然',title:'丘の斜面が崩れる',body:'夜半に土砂が流れ、小道がふさがれた。人々は迂回路を探した。',causes:['斜面の不安定化'],food:-3,weight:()=>2},
 {kind:'abandon',tag:'人々',title:'遠い村で灯りが消える',body:'かつて人の住んだ場所が使われなくなり、草が道を覆った。',causes:['地域ごとの人口移動'],cohesion:-2,weight:s=>s.population>15000?5:2},
 {kind:'artisan',tag:'暮らし',title:'布の染め方が変わる',body:'新しい色の布が祭りに現れ、やがて普段着にも使われた。',causes:['工芸と習慣の変化'],culture:3,weight:s=>s.exchange>30?5:2},
 {kind:'ferry',tag:'交流',title:'渡し舟が定期的に出るようになる',body:'川向こうへの移動が日常になり、両岸のことばが似てきた。',causes:['水路交通の定着'],exchange:4,weight:()=>4},
];
for(const e of everydayVariants){rules.push({kind:e.kind,tag:e.tag,weight:e.weight,apply:s=>{for(const k of ['food','cohesion','culture','exchange','knowledge'] as const){const n=e[k];if(n!==undefined)bump(s,k,n);}return [e.title,e.body,e.causes];}});}
rules.push(...turningPoints);
const decisionTemplates=[
 {question:'食糧の蓄えが乏しくなった。人々の間で、二つの考えが語られている。', options:[
  {label:'蓄えを共同で分かち合う',description:'短期的な不足を皆で引き受ける。',impacts:{food:-7,cohesion:11},consequence:'蓄えを分ける決まりが生まれた。'},
  {label:'各集落の判断に任せる',description:'地域の自律性を優先する。',impacts:{cohesion:-6,exchange:4},consequence:'集落ごとに異なる方法が試みられた。'},
  {label:'新しい土地を探す',description:'一部の人々が移住する。',impacts:{population:-.055,food:9,exchange:7},consequence:'旅立つ人々が現れ、故郷に残る人々もいた。'}]},
 {question:'遠方から、異なる習慣を持つ人々が訪れた。集落の長たちが話し合っている。',options:[
  {label:'迎え入れて共に暮らす',description:'新しい文化との接触が増える。',impacts:{population:.04,culture:11,cohesion:-3},consequence:'異なる言葉が村の広場で聞かれるようになった。'},
  {label:'交易のみを続ける',description:'往来は増やすが居住は分ける。',impacts:{exchange:10,culture:4},consequence:'交易所で人々の交流が続いた。'},
  {label:'しばらく距離を置く',description:'共同体内部の習慣を守る。',impacts:{exchange:-7,cohesion:5},consequence:'訪問者は別の土地へ向かっていった。'}]},
 {question:'共同の水路が傷み、修復には大勢の働き手が必要になった。',options:[
  {label:'共同作業の日を定める',description:'労力はかかるが、水路を維持する。',impacts:{food:9,cohesion:6},consequence:'集落が力を合わせ、水路に水が戻った。'},
  {label:'それぞれの畑を優先する',description:'すぐの暮らしを守る。',impacts:{food:-5,cohesion:-4},consequence:'水路の一部は使われなくなった。'},
  {label:'新しい方法を試す',description:'成功は保証されない。',impacts:{knowledge:10,food:-3},consequence:'水の扱いを工夫する人々が現れた。'}]},
 {question:'若者たちが、伝統とは異なる祭りの形を提案している。',options:[
  {label:'新しい形を受け入れる',description:'習慣が少しずつ変わる。',impacts:{culture:11,cohesion:2},consequence:'古い歌に新しい節が加わった。'},
  {label:'古い形式を守り続ける',description:'受け継がれた形を重んじる。',impacts:{culture:5,cohesion:5},consequence:'祭りは祖先の頃の順序で行われた。'},
  {label:'集落ごとに任せる',description:'土地ごとの多様性が生まれる。',impacts:{culture:8,cohesion:-2},consequence:'祭りは村ごとに少しずつ違うものになった。'}]}
 ,{question:'古い木を切り、新しい建物を建てる計画が持ち上がった。',options:[
 {label:'木を残して別の場所を探す',description:'時間と土地を必要とする。',impacts:{culture:5,food:-2},consequence:'古い木は残され、広場の形は変わった。'},
 {label:'材を使って建て直す',description:'新たな集会所ができる。',impacts:{knowledge:4,cohesion:3},consequence:'木は伐られ、記憶は新しい建物に引き継がれた。'}]},
 {question:'川の魚が減り、漁をめぐって意見が分かれている。',options:[
 {label:'数年だけ漁を制限する',description:'いまの食糧を犠牲にする。',impacts:{food:-5,cohesion:4},consequence:'漁を休む区間が定められた。'},
 {label:'川の上流へ漁場を移す',description:'別の土地との摩擦があり得る。',impacts:{food:4,exchange:-3},consequence:'新しい漁場へ通う人々が増えた。'},
 {label:'新しい網を試す',description:'技術を試すが資源は戻らない。',impacts:{knowledge:6,food:2},consequence:'網の工夫が広まった。'}]},
 {question:'大雨で橋が流され、両岸の暮らしが離れてしまった。',options:[
 {label:'共同で再建する',description:'労働力を集める。',impacts:{cohesion:7,food:-3},consequence:'両岸を結ぶ橋が再び架けられた。'},
 {label:'渡し舟で行き来する',description:'新しい仕事が生まれる。',impacts:{exchange:6,knowledge:2},consequence:'舟を操る人々が増えた。'}]},
 {question:'古い記録と語り継がれた記憶に食い違いが見つかった。',options:[
 {label:'両方を残す',description:'ひとつに決めつけない。',impacts:{culture:7},consequence:'異なる記憶が併記されるようになった。'},
 {label:'記録を正本として扱う',description:'統一した歴史が語られる。',impacts:{cohesion:3,knowledge:4},consequence:'一冊の年代記が編まれた。'},
 {label:'語り継ぐ人々に委ねる',description:'口承の多様さを尊重する。',impacts:{culture:5,cohesion:-2},consequence:'村ごとに違う過去が語られ続けた。'}]},
 {question:'人口が減った地域の住居をどう扱うか、議論が始まった。',options:[
 {label:'建物を修繕して残す',description:'記憶を残すための労力が必要。',impacts:{food:-3,culture:6},consequence:'使われない家にも手入れが続けられた。'},
 {label:'建材を別の土地へ運ぶ',description:'今ある暮らしに役立てる。',impacts:{knowledge:3,exchange:3},consequence:'古い家の石や木材が新しい家に使われた。'}]},
 {question:'豊かな季節が続き、共同の余剰をどう使うかが話し合われた。',options:[
 {label:'蓄えを増やす',description:'将来の不足に備える。',impacts:{food:9},consequence:'共同の倉に穀物が積み重なった。'},
 {label:'祭りを開いて分かち合う',description:'人々が集まる機会を作る。',impacts:{food:-4,culture:7,cohesion:4},consequence:'広場で歌や踊りが続いた。'},
 {label:'遠くの村へ贈る',description:'今は見返りを求めない。',impacts:{food:-5,exchange:8},consequence:'舟に食糧が積まれ、遠くへ運ばれた。'}]},
];
function generateDecision(s:CivilizationState,r:SeededRng){let index=r.int(0,decisionTemplates.length-1);if(index===s.lastDecisionId)index=(index+1+r.int(0,decisionTemplates.length-2))%decisionTemplates.length;s.lastDecisionId=index;const t=decisionTemplates[index]!;s.pending={id:`choice-${s.year}`,year:s.year,question:t.question,context:`世界暦${s.year}年。${s.name}は${s.homeland}で暮らしている。どの道も、未来を約束するものではない。`,options:t.options};}
export function choose(s:CivilizationState,index:number,source:'manual'|'auto'='manual'){if(!s.pending)throw Error('No choice pending');const option=s.pending.options[index];if(!option)throw Error('Invalid choice'); for(const [key,val] of Object.entries(option.impacts))bump(s,key as Dimension,val!);s.decisions.push({year:s.year,label:option.label});entry(s,'選択',option.label,option.consequence,[source==='auto'?'偶然に委ねられた選択':'観察者が選んだ一度きりの分岐'],true);
 const label=option.label;
 if(/蓄え|共同で分かち合う/.test(label))remember(s,'granary',18,`世界暦${s.year}年の選択から備蓄を共有する習慣が深まった。`);
 if(/水路|橋|堤|再建/.test(label))remember(s,'waterworks',18,'共同作業の経験が次の世代へ伝わった。');
 if(/記録|正本|両方を残す/.test(label))remember(s,'archive',16,'異なる記憶を残すという判断が伝承された。');
 if(/迎え入れ|共に暮らす/.test(label))remember(s,'migration',25,'移住者を迎え入れた経験が地域の習慣になった。');
 if(/交易|遠くの村/.test(label))remember(s,'trade_network',15,'遠方への往来が次世代まで続いた。');
 if(/看病/.test(label))remember(s,'care',15,'病人を助けた記憶が残った。');s.pending=null;return s;}
export function step(s:CivilizationState){if(s.version!==2)throw Error('Unsupported version');if(s.pending)return s;const rng=new SeededRng(s.rngState);s.year++;
 const rain=(rng.next()+rng.next()+rng.next())/3;const scarcity=rain<.29?1:0;s.drought=scarcity?s.drought+1:Math.max(0,s.drought-1);s.epidemic=Math.max(0,s.epidemic-1);
 ageLegacies(s,rng);
 const reserve=legacyStrength(s,'granary')/100;
 const waterways=legacyStrength(s,'waterworks')/100;
 const trade=legacyStrength(s,'trade_network')/100;
 const care=legacyStrength(s,'care')/100;
 const carrying=14000+s.knowledge*560+s.exchange*220+waterways*5500+trade*2500;const pressure=clamp((s.population-carrying)/Math.max(1,carrying),0,2); const foodDrift=(rain-.5)*9*(1-waterways*.26) + (s.knowledge-35)*.025 - pressure*2.6 - .12 + waterways*.18 + reserve*(s.food<40?.28:0);s.food=clamp(s.food+foodDrift,0,100);
 const g=(s.food-51)/4600 + .001 - pressure*.004 - (s.epidemic>0?.0012:0);s.population=Math.max(60,Math.round(s.population*(1+clamp(g,-.025,.012))));
 s.cohesion=clamp(s.cohesion+(s.food<30?-.25:.035)-(s.population>50000?.035:0),0,100);
 if(rng.next()<.018+legacyStrength(s,'archive')/5000)s.knowledge=clamp(s.knowledge+.55,0,100);if(rng.next()<.016)s.exchange=clamp(s.exchange+.4,0,100);
 // A hazard is sampled conditionally; this is an explicitly illustrative fiction, not empirical calibration.
 if(rng.next()<(s.year<30?.12:.19)){
  const eligible=rules.map(rule=>({rule,weight:(turningPoints.includes(rule)&&s.lastKind[rule.kind]!==undefined?0:rule.weight(s))*(s.year-(s.lastKind[rule.kind]??-100)>55?1:0.015)})).filter(x=>x.weight>0);const sum=eligible.reduce((a,x)=>a+x.weight,0);let draw=rng.next()*sum;const selected=eligible.find(x=>(draw-=x.weight)<=0)?.rule??eligible[eligible.length-1]?.rule;
  if(selected){
   const beforePopulation=s.population;const beforeFood=s.food;
   const [title,body,causes]=selected.apply(s,rng);
   // Shared practices moderate some crises, without guaranteeing a good outcome.
   if(['famine','drought','flood'].includes(selected.kind))s.food=clamp(s.food+(beforeFood-s.food)*reserve*.35,0,100);
   if(['disease','famine'].includes(selected.kind))s.population=Math.round(s.population+(beforePopulation-s.population)*(selected.kind==='disease'?care*.40:reserve*.18));
   if(['trade','arrival'].includes(selected.kind)&&trade>.35)bump(s,'culture',2);
   s.lastKind[selected.kind]=s.year;entry(s,selected.tag,title,body,causes,selected.important);
   recordLegacy(s,selected.kind,title);
  }
 }
 // Prompt about once a century, no more than 1 in 85 years.
 const last=s.decisions.length?s.decisions[s.decisions.length-1]!.year:0;
 if(s.year>=60&&s.year-last>=85&&rng.next()<.012)generateDecision(s,rng);
 if(s.year%10===0)s.samples.push({year:s.year,population:s.population});s.rngState=rng.state;return s;
}
export function advance(s:CivilizationState,years:number){if(!Number.isInteger(years)||years<0||years>10000)throw Error('Invalid years');for(let i=0;i<years&&!s.pending;i++)step(s);return s;}
export function clone(s:CivilizationState):CivilizationState{return JSON.parse(JSON.stringify(s)) as CivilizationState;}
