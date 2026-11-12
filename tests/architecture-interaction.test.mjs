/** Issue #35 D3-a: inter-district interaction tap and its v9 record (Human decision S-A on PR #117). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewTerrainWorld} from '../dist/story/new-world.js';
import {advanceTerrainProductionWorld} from '../dist/terrain/terrain-production-progression-v1.js';
import {prepareTerrainProductionSave} from '../dist/terrain/terrain-production-storage-v1.js';
import * as P from '../dist/architecture/production-v1.js';
import * as I from '../dist/architecture/interaction-v1.js';

// CI time (PR #123, Human decision B): 1500 years still has migrations (45), trade and route changes for seed 7
const SEED=7,YEARS=1500;
let world,plain,captures=[];
const ready=(async()=>{
 world=await P.advanceArchitectureWorld(P.introduceArchitectureProduction((await createNewTerrainWorld(SEED)).review),YEARS,'automatic');
 plain=await advanceTerrainProductionWorld((await createNewTerrainWorld(SEED)).review,YEARS,'automatic',{},c=>captures.push(c));
})();

test('D3-a: 交流の受け口はv8の歴史を変えず、毎年の交流を写しで受け取る',async()=>{
 await ready;
 const bare=await advanceTerrainProductionWorld((await createNewTerrainWorld(SEED)).review,YEARS,'automatic');
 assert.equal((await prepareTerrainProductionSave(plain)).payloadHash,(await prepareTerrainProductionSave(bare)).payloadHash);
 assert.equal(captures.length,YEARS);
 assert.deepEqual(captures.map(c=>c.year),Array.from({length:YEARS},(_,i)=>i+1));
 assert.ok(Object.isFrozen(captures[0])&&Object.isFrozen(captures[0].moves)&&Object.isFrozen(captures[0].routes));
 assert.equal(captures[0].routes.length,I.routeEnds.length);
});

test('D3-a: v9は組ごとの移住・交易・交易路の開閉を記録し、v8に残る材料と整合する',async()=>{
 await ready;
 const l=world.architecture.interaction;
 assert.equal(l.confirmedThrough,world.terrain.review.state.year);
 assert.ok(l.migrations.length>0&&l.trade.length>0,'interaction was recorded');
 for(const [year,from,to,amount] of l.migrations){assert.ok(from>=0&&from<3&&to>=0&&to<3&&from!==to&&amount>0&&year>0);}
 for(const [r,a,b] of l.trade)assert.ok(r>=0&&r<I.routeEnds.length&&a<=b);
 assert.doesNotThrow(()=>I.verifyInteraction(l,world.terrain,0));
 assert.deepEqual(I.routeEnds,[{from:0,to:1},{from:0,to:2}],'river–hill and river–coast');
});

test('D3-a: 読込で交流の記録の改竄を拒否する（ハッシュの不一致・材料との不整合）',async()=>{
 await ready;
 const json=JSON.stringify(await P.prepareArchitectureSave(world));
 assert.ok(await P.validateArchitectureSave(JSON.parse(json)));
 const mutate=async(f,rehash=false)=>{const d=JSON.parse(json);f(d.architecture.interaction);if(rehash)d.interactionHash=await I.interactionHash(d.architecture.interaction);return P.validateArchitectureSave(d);};
 await assert.rejects(mutate(l=>{l.migrations[0][3]+=1;}),/commitment/);
 // Removing the migration that set a pair's last bookkept year is detectable even when re-hashed.
 // (Known limit of S-A: removing an earlier migration that leaves every pair's last bookkept year
 // unchanged is caught only by the commitment, not by the consistency checks.)
 await assert.rejects(mutate(l=>{const last=l.migrations.at(-1);const key=last[1]+'-'+last[2];
  for(let i=l.migrations.length-1;i>=0;i--){const m=l.migrations[i];if(m[1]+'-'+m[2]===key){l.migrations.splice(i,1);break;}}
  l.migrations=l.migrations.filter(m=>!(m[1]+'-'+m[2]===key&&m[0]>last[0]-10));},true),/migration years|does not match/);
 await assert.rejects(mutate(l=>{const t=l.trade.at(-1);t[2]=t[2]-1;},true),/trade of route|does not match/);
 await assert.rejects(mutate(l=>{l.routeStates.push([l.confirmedThrough,0,!l.routeStates.filter(s=>s[1]===0).at(-1)?.[2]]);},true),/open\/closed|does not match/);
 await assert.rejects(mutate(l=>{l.confirmedThrough-=5;},true),/recorded through/);
});

const cap=(year,{moves=[],traded=[0,0],routes}={})=>({year,moves,traded,recordIds:[],
 routes:routes??[{blocked:false,originRecord:null,agreementRecord:null,closureRecord:null},{blocked:false,originRecord:null,agreementRecord:null,closureRecord:null}]});

test('D3-a: 記録は年が続いていなければ拒否し、居住地のない人々の移住は地区間の接触に数えない',()=>{
 const l0=I.emptyInteraction(0);
 assert.throws(()=>I.appendInteraction(l0,[cap(2)]),/does not follow/);
 const l=I.appendInteraction(l0,[cap(1,{moves:[{from:3,to:0,amount:50},{from:1,to:0,amount:7}],traded:[3,0]}),cap(2,{traded:[2,1]}),cap(3,{traded:[0,4]})]);
 assert.deepEqual(l.migrations,[[1,1,0,7]]);
 assert.deepEqual(l.trade,[[0,1,2],[1,2,3]]);
 assert.equal(l.confirmedThrough,3);
});

test('D3-a: 交易路の開閉と記録IDの変化（協定のnullへの戻りを含む）を記録する',()=>{
 const r=(blocked,agreementRecord)=>[{blocked,originRecord:null,agreementRecord,closureRecord:null},{blocked:false,originRecord:null,agreementRecord:null,closureRecord:null}];
 const l=I.appendInteraction(I.emptyInteraction(0),[cap(1,{routes:r(false,'1-5')}),cap(2,{routes:r(true,'1-5')}),cap(3,{routes:r(true,null)})]);
 assert.deepEqual(l.routeStates,[[2,0,true]]);
 assert.deepEqual(l.routeRecords,[[1,0,'agreementRecord','1-5'],[3,0,'agreementRecord',null]]);
});
