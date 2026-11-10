/**
 * Issue #35 D1 comparison samples, drawn with the production vocabulary/drawing in src/architecture
 * (via dist/; run `npm run build` first). PROTOTYPE SAMPLES ONLY — NOT HISTORY.
 * The six cultures and three advanced samples are fixed comparison inputs, not D2 generation rules.
 * D1 specs use the D1 catalog spelling (roof incl. R07, deepEaves, roofing); toNormalForm converts
 * them to the D2 normal form (roofFamily + eaves, roofMaterial). No other logic lives here.
 */
import * as V from '../../dist/architecture/vocab-v1.js';
import {drawArchitecture} from '../../dist/architecture/draw-v1.js';

export const PROTOTYPE_ID='architecture35-d1-v1';
export const roofs=V.roofCatalog,structures=V.structures,advancedStructures=V.advancedStructures,wallMaterials=V.wallMaterials,
 roofMaterials=V.roofMaterials,foundations=V.foundations,windows=V.windows,advancedWindows=V.advancedWindows,entrances=V.entrances,
 ornaments=V.ornaments,palettes=V.palettes,uses=V.uses;

/** D1 catalog spelling → D2 normal form. R07 is "R01 + deep eaves" exactly as D1 drew it. */
export function toNormalForm({roof,deepEaves,roofing,...rest}){
 const out={use:'house',...rest};
 if(roof!==undefined)out.roofFamily=roof==='R07'?'R01':roof;
 if(roof==='R07'||deepEaves)out.eaves='deep';
 if(roofing!==undefined)out.roofMaterial=roofing;
 return out;
}
export const normalizeSpec=spec=>V.normalizeSpec(toNormalForm(spec));
export const formAxes=spec=>V.formAxes(toNormalForm(spec));
export const drawBuilding=(g,spec,cx,gy)=>drawArchitecture(g,toNormalForm(spec),cx,gy);

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
 if(use==='granary'&&!c.per.granary?.window&&spec.window!=='W6')spec.window='W1';
 if(use==='market'){spec.entrance=spec.deepEaves?'E3':spec.foundation==='F5'||spec.structure==='S07'?'E5':'E1';}
 return spec;
}
