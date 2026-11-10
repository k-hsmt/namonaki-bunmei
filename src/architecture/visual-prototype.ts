/** Issue #35 D1: isolated, non-historical architecture visual hypotheses.
 * No imports from civilization state, terrain, saves, or the production renderer.
 * All enum entries MUST have a visible dedicated comparison frame.
 */
export const ROOFS=['gable','steep-gable','hip','shed','flat','stepped','deep-eave','compound'] as const;
export const STRUCTURES=['timber-frame','plank','thick-earth','rubble-stone','cut-stone','mixed','raised'] as const;
export const WINDOWS=['square','narrow','horizontal','paired','lattice','clerestory'] as const;
export const ENTRANCES=['center','side','under-eave','porch','stairs','courtyard','wide'] as const;
export const DECORATIONS=['ridge-cap','beam-ends','exposed-posts','shutters','wall-band','small-awning','stepping-stones','geometric'] as const;
export const WALL_MATERIALS=['logs','planks','wattle','earth','rammed-earth','rubble','ashlar','mixed'] as const;
export const ROOF_MATERIALS=['thatch','shingles','boards','slate','tile','plaster','metal'] as const;
export const FOUNDATIONS=['earth','stone','timber-piles','terrace','stilts'] as const;
export const USES=['house','granary','workshop','market','hall'] as const;
export const TECHNOLOGIES=['long-span-timber','masonry-arch','metal-glass'] as const;

export type Roof=typeof ROOFS[number];
export type Structure=typeof STRUCTURES[number];
export type WindowStyle=typeof WINDOWS[number];
export type Entrance=typeof ENTRANCES[number];
export type Decoration=typeof DECORATIONS[number];
export type WallMaterial=typeof WALL_MATERIALS[number];
export type RoofMaterial=typeof ROOF_MATERIALS[number];
export type Foundation=typeof FOUNDATIONS[number];
export type Use=typeof USES[number];
export type Technology=typeof TECHNOLOGIES[number];
export type Palette={readonly wall:string;readonly roof:string;readonly trim:string;readonly shade:string;readonly opening:string;readonly ground:string};
export type ArchitectureStyle={
 readonly roof:Roof;readonly structure:Structure;
 readonly wallMaterial:WallMaterial;readonly roofMaterial:RoofMaterial;readonly foundation:Foundation;
 readonly window:WindowStyle;readonly entrance:Entrance;readonly decoration:Decoration;
 readonly palette:Palette;readonly steepness:number;readonly eave:number;
 readonly technology?:Technology;
};
export type CultureExample={
 readonly id:string;readonly name:string;readonly description:string;
 readonly style:ArchitectureStyle;
};
export type PreviewCase={
 readonly id:string;readonly family:'culture'|'roof'|'structure'|'window'|'entrance'|'decoration'|'wall-material'|'roof-material'|'technology'|'condition'|'use';
 readonly label:string;readonly premise:'explicit-controlled-prototype-not-history';
 readonly style:ArchitectureStyle;readonly use:Use;readonly condition:'intact'|'damaged'|'ruined';
 readonly compareFiveUses:boolean;
};

const palettes={
 wood:{wall:'#a78968',roof:'#574f47',trim:'#634e3b',shade:'#705d4d',opening:'#3d4646',ground:'#a29e78'},
 earth:{wall:'#d8b68d',roof:'#9e7256',trim:'#8c6854',shade:'#af876a',opening:'#685547',ground:'#b1a37b'},
 stone:{wall:'#a2a59b',roof:'#626d73',trim:'#676d6a',shade:'#888d85',opening:'#434c4f',ground:'#9b9d7d'},
 raised:{wall:'#b5a27b',roof:'#8a7354',trim:'#665b44',shade:'#85785f',opening:'#4a5148',ground:'#9b9f7c'},
 pale:{wall:'#e0cdb1',roof:'#a89b82',trim:'#806f62',shade:'#bdad92',opening:'#50565a',ground:'#a2a07b'},
 hybrid:{wall:'#b2a18d',roof:'#73695f',trim:'#695c4e',shade:'#8c8172',opening:'#475050',ground:'#a2a07b'},
} as const satisfies Record<string,Palette>;
const foundation:Foundation='stone';
const BASE:ArchitectureStyle={
 roof:'gable',structure:'timber-frame',wallMaterial:'planks',roofMaterial:'boards',foundation,
 window:'square',entrance:'center',decoration:'exposed-posts',palette:palettes.wood,steepness:12,eave:3,
};

/** Representative controlled examples, NOT a finite menu of production civilizations. */
export const CULTURES:readonly CultureExample[]=[
 {id:'wood-deep-eave',name:'木骨と深い軒',description:'木骨＋深い軒／暗い屋根／小窓',style:{...BASE,roof:'deep-eave',eave:7,structure:'timber-frame',wallMaterial:'planks',roofMaterial:'boards',window:'square',decoration:'beam-ends',palette:palettes.wood}},
 {id:'earth-flat',name:'土壁と低い屋根',description:'厚い土壁／平屋根／小開口',style:{...BASE,roof:'flat',structure:'thick-earth',wallMaterial:'earth',roofMaterial:'plaster',foundation:'earth',window:'narrow',entrance:'side',decoration:'wall-band',eave:1,steepness:4,palette:palettes.earth}},
 {id:'stone-terraced',name:'石積みと段状屋根',description:'石積み／段状屋根／石板',style:{...BASE,roof:'stepped',structure:'rubble-stone',wallMaterial:'rubble',roofMaterial:'slate',foundation:'terrace',window:'narrow',decoration:'ridge-cap',palette:palettes.stone}},
 {id:'raised-light',name:'高床と軽い屋根',description:'高床の支柱／木板屋根／階段',style:{...BASE,roof:'steep-gable',structure:'raised',wallMaterial:'wattle',roofMaterial:'thatch',foundation:'stilts',entrance:'stairs',decoration:'stepping-stones',eave:4,steepness:19,palette:palettes.raised}},
 {id:'pale-courtyard',name:'明るい壁面と中庭',description:'淡い土壁／寄棟／中庭向きの入口',style:{...BASE,roof:'hip',structure:'thick-earth',wallMaterial:'rammed-earth',roofMaterial:'tile',foundation:'stone',entrance:'courtyard',decoration:'geometric',eave:2,palette:palettes.pale}},
 {id:'mixed-compound',name:'木石混合と複合屋根',description:'石基礎＋木造上部／複合屋根',style:{...BASE,roof:'compound',structure:'mixed',wallMaterial:'mixed',roofMaterial:'shingles',foundation:'stone',window:'paired',entrance:'porch',decoration:'shutters',palette:palettes.hybrid}},
] as const;

const make=(family:PreviewCase['family'],id:string,label:string,style:ArchitectureStyle,options:Partial<Pick<PreviewCase,'use'|'condition'|'compareFiveUses'>>={}):PreviewCase=>({
 id:family+'-'+id,family,label,style,use:options.use??'house',condition:options.condition??'intact',compareFiveUses:options.compareFiveUses??false,premise:'explicit-controlled-prototype-not-history',
});
const example=(i:number)=>CULTURES[i]!.style;
export function allArchitectureD1Cases():readonly PreviewCase[]{
 return [
  ...CULTURES.map(c=>make('culture',c.id,c.name,c.style,{compareFiveUses:true})),
  ...ROOFS.map(id=>make('roof',id,id,{...example(0),roof:id,eave:id==='deep-eave'?8:3,steepness:id==='steep-gable'?21:12})),
  ...STRUCTURES.map(id=>make('structure',id,id,{...example(0),structure:id,foundation:id==='raised'?'stilts':'stone'})),
  ...WINDOWS.map(id=>make('window',id,id,{...example(0),window:id})),
  ...ENTRANCES.map(id=>make('entrance',id,id,{...example(0),entrance:id})),
  ...DECORATIONS.map(id=>make('decoration',id,id,{...example(0),decoration:id})),
  ...WALL_MATERIALS.map(id=>make('wall-material',id,id,{...example(0),wallMaterial:id})),
  ...ROOF_MATERIALS.map(id=>make('roof-material',id,id,{...example(0),roofMaterial:id})),
  ...TECHNOLOGIES.map((id,i)=>make('technology',id,['大スパン木造','石造＋アーチ','金属＋ガラス'][i]!,{
   ...example(i===0?0:i===1?2:5),
   technology:id,
   roof:i===0?'compound':i===1?'hip':'flat',structure:i===0?'timber-frame':i===1?'cut-stone':'mixed',
   wallMaterial:i===0?'planks':i===1?'ashlar':'mixed',roofMaterial:i===2?'metal':'slate',
   window:i===2?'horizontal':'narrow',eave:i===0?5:2,
  },{use:'hall'})),
  ...(['intact','damaged','ruined'] as const).map(condition=>make('condition',condition,condition,example(2),{condition})),
  ...USES.map(use=>make('use',use,use,example(5),{use})),
 ];
}
export function auditArchitectureD1Catalog(cases:readonly PreviewCase[]):void{
 const ids=new Set<string>();for(const v of cases){if(ids.has(v.id)||v.premise!=='explicit-controlled-prototype-not-history')throw Error('Duplicate or historical prototype');ids.add(v.id);}
 const expect:Record<PreviewCase['family'],number>={culture:6,roof:8,structure:7,window:6,entrance:7,decoration:8,'wall-material':8,'roof-material':7,technology:3,condition:3,use:5};
 for(const [family,n]of Object.entries(expect))if(cases.filter(c=>c.family===family).length!==n)throw Error('Missing D1 catalog family '+family);
 for(const c of cases)if(!Number.isInteger(c.style.steepness)||c.style.steepness<0||!Number.isInteger(c.style.eave)||c.style.eave<0)throw Error('Invalid style geometry');
}
