/**
 * Issue #35 D2-a: architecture vocabulary, normal form and constraints (architecture-vocab-v1 /
 * architecture-constraints-v1). Ported from the Human-accepted D1 prototype (PR #107).
 * Pure data and pure functions. Not connected to saves, history, RNG or the live scene.
 * Advanced entries (X1-X3, metal/composite walls, metal/glazed roofs, W7, F6) exist for drawing
 * the D1 comparison samples only; the D2 grammar never selects them.
 */
export const ARCHITECTURE_VOCAB_ID='architecture-vocab-v1';
export const ARCHITECTURE_CONSTRAINTS_ID='architecture-constraints-v1';

/** R07 (deep eaves) is a D1 catalog label only. It is never a roof family in the normal form. */
export const roofCatalog={R01:'切妻',R02:'急勾配切妻',R03:'寄棟',R04:'片流れ',R05:'平屋根',R06:'段状屋根',R07:'深い軒（修飾）',R08:'複合屋根'} as const;
export const roofFamilies=['R01','R02','R03','R04','R05','R06','R08'] as const;
export const eavesKinds=['normal','deep'] as const;
export const pitches=['low','mid','high'] as const;
export const structures={S01:'柱梁構造',S02:'板壁',S03:'厚い土壁',S04:'不揃いな石積み',S05:'整形石材',S06:'混合構造（石基礎＋木造）',S07:'高床'} as const;
export const advancedStructures={X1:'大スパン木造',X2:'石造＋アーチ',X3:'金属支持＋ガラス'} as const;
export const wallMaterials={log:'丸太',plank:'製材木板',wattle:'編み枝と塗り土',earth:'厚い土壁',rammed:'突き固め土',
 rubble:'不揃い石材',ashlar:'整形石材',mixed:'木石混合',metal:'金属支持（後年）',composite:'複合外皮（後年）'} as const;
export const roofMaterials={thatch:'茅葺き',shingle:'木片・木板',slate:'石板',tile:'焼成瓦',plaster:'土・漆喰',metal:'金属板（後年）',glazed:'透過材（後年）'} as const;
export const foundations={F1:'地面近くの低い基礎',F2:'石の土台',F3:'木杭',F4:'段状基礎',F5:'高床支柱',F6:'大規模構造の基礎（後年）'} as const;
export const windows={W1:'小さな正方形',W2:'縦長',W3:'横長',W4:'並列小窓',W5:'格子窓',W6:'高窓'} as const;
export const advancedWindows={W7:'大きな採光窓（高度技術）'} as const;
export const entrances={E1:'中央',E2:'側方',E3:'深い軒下',E4:'前室つき',E5:'階段つき',E6:'中庭向き',E7:'大開口（工房・市場）'} as const;
export const ornaments={O1:'棟端',O2:'梁端',O3:'露出木骨',O4:'雨戸・窓枠',O5:'帯状の壁模様',O6:'小庇',O7:'踏み石・階段',O8:'幾何学模様'} as const;
export const palettes={P01:'木褐・暗屋根',P02:'黄土・赤褐',P03:'石灰・青灰',P04:'生成り・くすみ屋根',P05:'複合材の混色',P06:'褪色（状態変化）'} as const;
export const uses={house:'独立住宅',rowhouse:'連棟住宅',courtyard:'中庭街区',granary:'穀物庫',workshop:'仕事場',market:'市場',hall:'会堂'} as const;

export type RoofFamily=typeof roofFamilies[number];
export type Eaves=typeof eavesKinds[number];
export type Pitch=typeof pitches[number];
export type Structure=keyof typeof structures|keyof typeof advancedStructures;
export type WallMaterial=keyof typeof wallMaterials;
export type RoofMaterial=keyof typeof roofMaterials;
export type Foundation=keyof typeof foundations;
export type Window=keyof typeof windows|keyof typeof advancedWindows;
export type Entrance=keyof typeof entrances;
export type Ornament=keyof typeof ornaments;
/** P06 is a condition (fading), never a cultural palette. */
export type Palette=Exclude<keyof typeof palettes,'P06'>;
export type Use=keyof typeof uses;

/** The single normal form used for sampling, drawing and saved records. */
export interface ArchitectureSpec {
 readonly use:Use;readonly roofFamily:RoofFamily;readonly eaves:Eaves;readonly pitch:Pitch;
 readonly structure:Structure;readonly wall:WallMaterial;readonly roofMaterial:RoofMaterial;readonly foundation:Foundation;
 readonly window:Window;readonly entrance:Entrance;readonly ornaments:readonly Ornament[];readonly palette:Palette;
 readonly storeys:1|2;readonly faded?:boolean;
}
export type PartialSpec={-readonly [K in keyof ArchitectureSpec]?:ArchitectureSpec[K]};

const has=(o:object,k:unknown)=>typeof k==='string'&&Object.hasOwn(o,k);
export const isAdvancedStructure=(s:Structure)=>s[0]==='X';
const defaultWall:Record<Structure,WallMaterial>={S01:'wattle',S02:'plank',S03:'earth',S04:'rubble',S05:'ashlar',S06:'mixed',S07:'plank',X1:'plank',X2:'ashlar',X3:'metal'};
const defaultFoundation:Partial<Record<Structure,Foundation>>={S03:'F1',S04:'F2',S05:'F2',S06:'F2',S07:'F5',X1:'F2',X2:'F4',X3:'F6'};

/**
 * One rule per D1 constraint. A rule is evaluated only once every field it reads is fixed, so the
 * same table checks complete specs and guides axis-by-axis sampling.
 */
interface Rule {readonly fields:readonly (keyof ArchitectureSpec)[];readonly message:string;readonly broken:(s:Required<PartialSpec>)=>boolean}
const rules:readonly Rule[]=[
 {fields:['structure','foundation'],message:'高床(S07)は高床支柱(F5)が必要',broken:s=>s.structure==='S07'&&s.foundation!=='F5'},
 {fields:['structure','foundation'],message:'高床支柱(F5)に組積・土壁の重い壁は載せない',broken:s=>s.foundation==='F5'&&!['S01','S02','S07','X1'].includes(s.structure)},
 {fields:['foundation','entrance','use'],message:'高床の入口には階段(E5)か前室(E4)が必要',broken:s=>s.foundation==='F5'&&['E1','E2','E3','E6','E7'].includes(s.entrance)&&s.use!=='market'},
 {fields:['entrance','eaves'],message:'深い軒下の入口(E3)は深い軒が必要',broken:s=>s.entrance==='E3'&&s.eaves!=='deep'},
 {fields:['entrance','foundation'],message:'階段つき入口(E5)は床の上がる基礎が必要',broken:s=>s.entrance==='E5'&&s.foundation==='F1'},
 {fields:['wall','structure'],message:'金属支持・複合外皮は高度構造(X系)のみ',broken:s=>['metal','composite'].includes(s.wall)&&!isAdvancedStructure(s.structure)},
 {fields:['roofMaterial','structure'],message:'金属板・透過材の屋根は高度構造(X系)のみ',broken:s=>['metal','glazed'].includes(s.roofMaterial)&&!isAdvancedStructure(s.structure)},
 {fields:['window','structure'],message:'大きな採光窓(W7)は高度構造(X系)のみ',broken:s=>s.window==='W7'&&!isAdvancedStructure(s.structure)},
 {fields:['roofMaterial','roofFamily'],message:'茅葺きの平屋根は排水が成立しない',broken:s=>s.roofMaterial==='thatch'&&s.roofFamily==='R05'},
 {fields:['roofMaterial','pitch'],message:'茅葺きは低勾配で成立しない',broken:s=>s.roofMaterial==='thatch'&&s.pitch==='low'},
 {fields:['roofMaterial','roofFamily'],message:'土・漆喰の屋根は平・段状・緩い片流れのみ',broken:s=>s.roofMaterial==='plaster'&&!['R05','R06','R04'].includes(s.roofFamily)},
 {fields:['storeys','structure'],message:'複数階は整形石・混合・高度構造のみ',broken:s=>s.storeys>1&&!['S05','S06','X1','X2','X3'].includes(s.structure)},
];
/** D2 rule (Human decision 6): two storeys only for halls. Not part of the D1 drawing check. */
const d2Rules:readonly Rule[]=[
 {fields:['storeys','use'],message:'D2では2階建ては会堂のみ',broken:s=>s.storeys>1&&s.use!=='hall'},
 {fields:['structure'],message:'D2では高度構造を選ばない',broken:s=>isAdvancedStructure(s.structure)},
 {fields:['foundation'],message:'D2では大規模構造の基礎(F6)を選ばない',broken:s=>s.foundation==='F6'},
 {fields:['wall'],message:'D2では金属支持・複合外皮を選ばない',broken:s=>['metal','composite'].includes(s.wall)},
 {fields:['roofMaterial'],message:'D2では金属板・透過材の屋根を選ばない',broken:s=>['metal','glazed'].includes(s.roofMaterial)},
 {fields:['window'],message:'D2では大きな採光窓(W7)を選ばない',broken:s=>s.window==='W7'},
];
const evaluate=(list:readonly Rule[],s:PartialSpec)=>list.filter(r=>r.fields.every(f=>s[f]!==undefined)&&r.broken(s as Required<PartialSpec>)).map(r=>r.message);
/** D1 drawing constraints (architecture-constraints-v1). Accepts partial specs. */
export function inconsistencies(s:PartialSpec):string[]{return evaluate(rules,s);}
/** Constraints for D2 births: drawing constraints plus D2-only limits. */
export function d2Inconsistencies(s:PartialSpec):string[]{return [...evaluate(rules,s),...evaluate(d2Rules,s)];}

/** Validates a normal-form spec. `roofFamily: 'R07'` and unknown IDs are rejected. */
export function normalizeSpec(input:PartialSpec&{readonly use:Use}):ArchitectureSpec {
 const structure=input.structure??'S02';
 const s={use:input.use,roofFamily:input.roofFamily??'R01',eaves:input.eaves??'normal',pitch:input.pitch??'mid',structure,
  wall:input.wall??defaultWall[structure],roofMaterial:input.roofMaterial??'shingle',foundation:input.foundation??defaultFoundation[structure]??'F1',
  window:input.window??'W1',entrance:input.entrance??'E1',ornaments:[...(input.ornaments??[])],palette:input.palette??'P01',storeys:input.storeys??1,
  ...(input.faded?{faded:true}:{})} as ArchitectureSpec;
 if(!has(uses,s.use))throw Error('unknown use '+s.use);
 if(!(roofFamilies as readonly string[]).includes(s.roofFamily))throw Error('unknown roof family '+s.roofFamily);
 if(!(eavesKinds as readonly string[]).includes(s.eaves))throw Error('unknown eaves '+s.eaves);
 if(!(pitches as readonly string[]).includes(s.pitch))throw Error('unknown pitch '+s.pitch);
 if(!has(structures,s.structure)&&!has(advancedStructures,s.structure))throw Error('unknown structure '+s.structure);
 if(!has(wallMaterials,s.wall))throw Error('unknown wall material '+s.wall);
 if(!has(roofMaterials,s.roofMaterial))throw Error('unknown roof material '+s.roofMaterial);
 if(!has(foundations,s.foundation))throw Error('unknown foundation '+s.foundation);
 if(!has(windows,s.window)&&!has(advancedWindows,s.window))throw Error('unknown window '+s.window);
 if(!has(entrances,s.entrance))throw Error('unknown entrance '+s.entrance);
 if(!has(palettes,s.palette)||s.palette==='P06' as string)throw Error('unknown palette '+s.palette);
 if(s.storeys!==1&&s.storeys!==2)throw Error('unsupported storeys '+s.storeys);
 for(const o of s.ornaments)if(!has(ornaments,o))throw Error('unknown ornament '+o);
 const issues=inconsistencies(s);
 if(issues.length)throw Error('inconsistent architecture: '+issues.join('; '));
 return s;
}
/** Non-colour axes. Palette and fading never count as a form difference (A01/A02). */
export function formAxes(input:PartialSpec&{readonly use:Use}):Record<string,string>{
 const s=normalizeSpec(input);
 return {roof:s.roofFamily+(s.eaves==='deep'?'+R07':'')+'/'+s.pitch,structure:s.structure,wall:s.wall,roofMaterial:s.roofMaterial,foundation:s.foundation,
  window:s.window,entrance:s.entrance,ornaments:[...s.ornaments].sort().join('+'),storeys:String(s.storeys)};
}
