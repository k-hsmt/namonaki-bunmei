import { cpSync, copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
copyFileSync('index.html', 'dist/index.html');
cpSync('assets', 'dist/assets', { recursive: true, force: true });
