/**
 * Conservative PR CI routing. Unknown or mixed changes run the FULL suite.
 * docs: explanatory files only; prototype: Issue #35 D1 only; full: otherwise.
 * Full suite runs on all main pushes and workflow_dispatch.
 */
import {spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const DOC_EXTENSIONS=new Set(['.md','.markdown','.txt','.png','.jpg','.jpeg','.webp','.svg']);
const PROTOTYPE_FILES=new Set([
  'scripts/preview-architecture.mjs',
  'scripts/lib/architecture-prototype.mjs',
  'tests/architecture-prototype.test.mjs',
]);
const ext=(path)=>{const i=path.lastIndexOf('.');return i===-1?'':path.slice(i).toLowerCase();};
const isDoc=(path)=>path==='README.md'||(path.startsWith('docs/')&&DOC_EXTENSIONS.has(ext(path)));
const isPrototype=(path)=>PROTOTYPE_FILES.has(path);

/** Pure; exercised independently by tests/ci-scope.test.mjs. */
export function chooseCiScope(files,{event='pull_request',forceFull=false}={}){
 if(event!=='pull_request'||forceFull)return 'full';
 if(!Array.isArray(files)||files.length===0)return 'full';
 // Invalid paths cannot reduce the scope.
 if(files.some(p=>typeof p!=='string'||!p||p.startsWith('/')||p.includes('\\')||p.includes('\n')||p.includes('..')))return 'full';
 if(files.every(isDoc))return 'docs';
 if(files.every(p=>isDoc(p)||isPrototype(p))&&files.some(isPrototype))return 'prototype';
 return 'full';
}

function changedFiles(base,head){
 if(!/^[0-9a-f]{40}$/.test(base)||!/^[0-9a-f]{40}$/.test(head))throw Error('Invalid base/head SHA; cannot scope CI');
 const merge=spawnSync('git',['merge-base',base,head],{encoding:'utf8'});
 if(merge.status!==0)throw Error('git merge-base failed: '+merge.stderr);
 const anchor=merge.stdout.trim();
 if(!/^[0-9a-f]{40}$/.test(anchor))throw Error('Invalid git merge base');
 const diff=spawnSync('git',['diff','--name-only','-z','--no-renames',anchor,head],{encoding:'buffer',maxBuffer:16*1024*1024});
 if(diff.status!==0)throw Error('git diff failed: '+String(diff.stderr));
 return diff.stdout.toString('utf8').split('\0').filter(Boolean);
}

function main(){
 const event=process.env.CI_EVENT_NAME||'';
 const forceFull=process.env.CI_FORCE_FULL==='true';
 const files=event==='pull_request'?changedFiles(process.env.CI_BASE_SHA||'',process.env.CI_HEAD_SHA||''):[];
 const mode=chooseCiScope(files,{event,forceFull});
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'mode='+mode+'\n');
 if(process.env.GITHUB_STEP_SUMMARY){
  const escaped=files.map(f=>'- '+f.replaceAll('|','\\|').replaceAll('\n',' ')+'\n').join('');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '## CI execution scope: '+mode+'\n\n'+
   '| Scope | Verification |\n|---|---|\n'+
   '| docs | Classifier and classifier tests only |\n'+
   '| prototype | Architecture D1 unit tests and 320×180 gallery |\n'+
   '| full | All existing CI jobs and matrices |\n\n'+
   'Event: '+event+'; changed paths: '+files.length+'; forced full: '+forceFull+'\n\n'+
   '<details><summary>Changed paths</summary>\n\n'+escaped+'\n</details>\n');
 }
 console.log(JSON.stringify({event,mode,fileCount:files.length,forceFull,files}));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))main();
