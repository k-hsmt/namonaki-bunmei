import { cpSync, copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
mkdirSync('dist',{recursive:true});
cpSync('assets','dist/assets',{recursive:true,force:true});
// Keep root module paths for existing model tests; publish the application with
// a content-addressed ENTIRE module graph so Pages caches cannot mix revisions.
const modules=files('src').filter(file=>file.endsWith('.ts')).map(file=>path.relative('src',file).replace(/\.ts$/,'.js'));
const assets=files('assets');
const releaseFiles=[...modules,...assets].sort();
const html=readFileSync('index.html','utf8'),hash=createHash('sha256').update(html);
for(const file of releaseFiles)hash.update(file).update(readFileSync(path.join('dist',file)));
const release=`releases/${hash.digest('hex').slice(0,16)}`;
rmSync('dist/releases',{recursive:true,force:true});
for(const file of releaseFiles){const target=path.join('dist',release,file);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(path.join('dist',file),target);}
writeFileSync('dist/index.html',html.replaceAll('./assets/',`./${release}/assets/`).replaceAll('src="./main.js"',`src="./${release}/main.js"`).replaceAll('src="./music-entry.js"',`src="./${release}/music-entry.js"`));
writeFileSync('dist/release.json',JSON.stringify({release})+'\n');
