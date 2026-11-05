import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const dir = path.resolve('dist');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 5173);
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json'};
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(dir, '.' + pathname);
    if (!target.startsWith(dir + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
    if (!(await stat(target)).isFile()) throw new Error('not a file');
    res.writeHead(200, {'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(await readFile(target));
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, host, () => console.log(`名もなき文明: http://${host}:${port}`));
