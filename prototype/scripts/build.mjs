// Bundles the game into single self-contained HTML files (no CDN needed at runtime):
//   dist/tiny-titans.html  - a complete page you can open from any static host
//   dist/artifact.html     - the same content without the <html>/<head>/<body> wrapper,
//                            for hosts that supply their own document skeleton
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const out = await build({
  entryPoints: [new URL('src/main.js', root).pathname],
  bundle: true, minify: true, format: 'iife', target: 'es2020', write: false,
  legalComments: 'none',
});
let js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = await readFile(new URL('index.html', root), 'utf8');
const full = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '')
  .replace('<script type="module" src="src/main.js"></script>', () => `<script>${js}</script>`);

const fragment = full
  .replace(/<!doctype html>\n?/i, '')
  .replace(/<html[^>]*>\n?/i, '').replace(/<\/html>\n?/i, '')
  .replace(/<head>\n?/i, '').replace(/<\/head>\n?/i, '')
  .replace(/<body>\n?/i, '').replace(/<\/body>\n?/i, '')
  .replace(/<meta charset="utf-8">\n?/i, '')
  .replace(/<meta name="viewport"[^>]*>\n?/i, '');

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/tiny-titans.html', root), full);
await writeFile(new URL('dist/artifact.html', root), fragment);
console.log(`built dist/tiny-titans.html (${(full.length / 1024).toFixed(0)} KB) and dist/artifact.html`);
