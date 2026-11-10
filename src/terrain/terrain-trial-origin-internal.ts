/** D4 origin v7 shares append-only ledgers with the continued world exactly once. */
type Path=readonly (string|number)[];
const prefixFormat='terrain-origin-prefix-v1',refFormat='terrain-origin-ref-v1';
function binding(path:Path):{prefix:boolean;blocks?:true}|undefined {
 const key=path.join('/');
 if(['initialTerrain/record','initialTerrain/hydrology','initialTerrain/plans','vegetation/initial','economicCoupling/originPrefix'].includes(key))return {prefix:false};
 if(['landHistory/events','vegetation/events','environment/targets','environment/uses','environment/checkpoints','irrigation/systems','irrigation/events','irrigation/attempts','economicCoupling/receipts','economicCoupling/phases','economicCoupling/checkpoints'].includes(key))return {prefix:true};
 if(/^state\/(history|decisions|samples|memory\/log|housing\/events|publicSpaces\/events|observation\/blocks)$/.test(key)||/^state\/observation\/sites\/[012]\/(changes|buildingChanges|practiceChanges)$/.test(key))return {prefix:true,...(key==='state/observation/blocks'?{blocks:true}:{})};
}
export function captureTerrainOriginInternal(save:unknown):{readonly format:typeof prefixFormat;readonly template:unknown}{
 const walk=(value:unknown,path:Path):unknown=>{
  const b=binding(path);if(b){if(b.prefix&&!Array.isArray(value))throw Error('Missing terrain origin ledger');return {format:refFormat,path,...(b.prefix?{count:(value as unknown[]).length}:{}),...(b.blocks?{lastChanges:((value as {changes:unknown[]}[]).at(-1)?.changes.length??0)}:{})};}
  if(Array.isArray(value))return value.map((v,i)=>walk(v,[...path,i]));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,[...path,k])]));return value;
 };return {format:prefixFormat,template:walk(save,[])};
}
export function hydrateTerrainOriginInternal(raw:unknown,world:unknown):unknown {
 if(!raw||typeof raw!=='object'||Object.keys(raw).sort().join('/')!=='format/template'||(raw as {format:unknown}).format!==prefixFormat)throw Error('Unknown terrain origin prefix');
 const walk=(value:unknown,path:Path):unknown=>{
  const b=binding(path);if(b){
   if(!value||typeof value!=='object')throw Error('Missing terrain origin reference');const ref=value as {format?:unknown;path?:unknown;count?:unknown;lastChanges?:unknown},keys=['format','path',...(b.prefix?['count']:[]),...(b.blocks?['lastChanges']:[])].sort();
   if(Object.keys(value).sort().join('/')!==keys.join('/')||ref.format!==refFormat||JSON.stringify(ref.path)!==JSON.stringify(path))throw Error('Invalid terrain origin reference');
   let current:unknown=world;for(const part of path){if(!current||typeof current!=='object'||!Object.hasOwn(current,part))throw Error('Missing terrain origin value');current=(current as Record<string|number,unknown>)[part];}
   if(b.prefix){if(!Array.isArray(current)||!Number.isSafeInteger(ref.count)||Number(ref.count)<0||Number(ref.count)>current.length)throw Error('Invalid terrain origin count');current=current.slice(0,Number(ref.count));
    if(b.blocks){const blocks=current as {changes:unknown[]}[],last=blocks.at(-1);if(!last||!Number.isSafeInteger(ref.lastChanges)||Number(ref.lastChanges)<0||Number(ref.lastChanges)>last.changes.length)throw Error('Invalid terrain origin block count');blocks[blocks.length-1]={...last,changes:last.changes.slice(0,Number(ref.lastChanges))};}
   }return current;
  }
  if(Array.isArray(value))return value.map((v,i)=>walk(v,[...path,i]));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,[...path,k])]));return value;
 };return walk((raw as {template:unknown}).template,[]);
}
