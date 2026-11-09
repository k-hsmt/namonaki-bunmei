import http from 'node:http';import {readFile,stat} from 'node:fs/promises';import path from 'node:path';
export async function coupledReviewServer(){
 const root=process.cwd(),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png'};
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),name=decodeURIComponent(u.pathname);if(name==='/capture'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><canvas id="scene" width="320" height="180"></canvas>');return;}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)||!/^\/(dist|artifacts)\//.test(name)||!(await stat(file)).isFile())throw Error();res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file));
 }catch{res.writeHead(404).end('Not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>server.close(r))};
}
