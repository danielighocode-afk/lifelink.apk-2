#!/usr/bin/env node
/* Copies the web app into ./www for Capacitor. Allow-list only: pages, scripts, styles and images.
   Never copies supabase/ (migrations, edge functions), docs, scripts, android or node_modules. */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'www');
const rootFileOk = (f) => /\.(html|js|css|webmanifest)$/i.test(f);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(root, { withFileTypes: true })) {
  if (f.isFile() && rootFileOk(f.name)) { fs.copyFileSync(path.join(root, f.name), path.join(out, f.name)); n++; }
}
fs.cpSync(path.join(root, 'images'), path.join(out, 'images'), { recursive: true });
const missing = [];
for (const f of fs.readdirSync(out)) {
  if (!f.endsWith('.html')) continue;
  const html = fs.readFileSync(path.join(out, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|png|jpe?g|svg|webp))(?:[?#][^"]*)?"/gi)) {
    if (!fs.existsSync(path.join(out, m[1]))) missing.push(f + ' -> ' + m[1]);
  }
}
console.log('prepare-www: copied ' + n + ' root files + images/ into www/');
if (missing.length) { console.error('Missing referenced files:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log('prepare-www: all local file references resolve.');
