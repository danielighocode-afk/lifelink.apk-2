#!/usr/bin/env node
/* Copies the web app into ./www for Capacitor. Allow-list only: pages, scripts, styles and images.
   Never copies supabase/ (migrations, edge functions), docs, scripts, android or node_modules.
   SPEED BUILD: the pages in www/ no longer download anything at start-up. This script
     1. compiles Tailwind to a local ll-tailwind.css (replaces the cdn.tailwindcss.com browser compiler),
     2. copies the Supabase SDK to www/vendor/supabase.js (pages use it before trying the CDN),
     3. copies the Plus Jakarta Sans font to www/fonts/ with a local fonts.css (replaces Google Fonts).
   The source .html files are NOT changed, so serving this folder directly (python -m http.server) still works via the CDNs. */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'www');
const rootFileOk = (f) => /\.(html|js|css|webmanifest)$/i.test(f) && f !== 'tailwind.config.js';
const die = (m) => { console.error('prepare-www: ' + m); process.exit(1); };
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(root, { withFileTypes: true })) {
  if (f.isFile() && rootFileOk(f.name)) { fs.copyFileSync(path.join(root, f.name), path.join(out, f.name)); n++; }
}
fs.cpSync(path.join(root, 'images'), path.join(out, 'images'), { recursive: true });

/* 1. Tailwind */
try {
  const cli = require.resolve('tailwindcss/lib/cli.js', { paths: [root] });
  cp.execFileSync(process.execPath, [cli, '-c', path.join(root, 'tailwind.config.js'), '-i', path.join(root, 'll-tailwind-src.css'), '-o', path.join(out, 'll-tailwind.css'), '--minify'], { cwd: root, stdio: 'inherit' });
} catch (e) { die('Tailwind build failed. Run "npm install" first (needs tailwindcss 3.4.17). ' + (e.message || '')); }

/* 2. Supabase SDK (UMD build) */
try {
  const sdk = require.resolve('@supabase/supabase-js/dist/umd/supabase.js', { paths: [root] });
  fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
  fs.copyFileSync(sdk, path.join(out, 'vendor', 'supabase.js'));
} catch (e) { die('Could not find @supabase/supabase-js/dist/umd/supabase.js. Run "npm install". ' + (e.message || '')); }

/* 3. Font (variable, latin) */
try {
  const dir = path.dirname(require.resolve('@fontsource-variable/plus-jakarta-sans/package.json', { paths: [root] }));
  const src = path.join(dir, 'files', 'plus-jakarta-sans-latin-wght-normal.woff2');
  fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
  fs.copyFileSync(src, path.join(out, 'fonts', 'plus-jakarta-sans.woff2'));
  fs.writeFileSync(path.join(out, 'fonts.css'),
    "@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-display:swap;font-weight:200 800;src:url(fonts/plus-jakarta-sans.woff2) format('woff2-variations'),url(fonts/plus-jakarta-sans.woff2) format('woff2');}\n");
} catch (e) { die('Could not find the Plus Jakarta Sans font package. Run "npm install". ' + (e.message || '')); }

/* 4. Rewrite the COPIED pages (never the sources) so nothing is fetched from the internet at start-up */
let rewritten = 0;
for (const f of fs.readdirSync(out)) {
  if (!f.endsWith('.html')) continue;
  const fp = path.join(out, f);
  let html = fs.readFileSync(fp, 'utf8'), before = html;
  const usesTailwind = /cdn\.tailwindcss\.com/i.test(html);   // home/welcome never used Tailwind: do not add its reset to them
  html = html.replace(/[ \t]*<script[^>]*src="https:\/\/cdn\.tailwindcss\.com[^"]*"[^>]*><\/script>[ \t]*\r?\n?/gi, '');
  html = html.replace(/[ \t]*<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>[ \t]*\r?\n?/gi, '');
  html = html.replace(/[ \t]*<link[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>[ \t]*\r?\n?/gi, '');
  if (html !== before) {
    // Tailwind's CDN appended its CSS at the END of <head> (after ll-app.css and page <style>); keep that cascade order.
    html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="fonts.css">\n' + (usesTailwind ? '  <link rel="stylesheet" href="ll-tailwind.css">\n' : '') + '</head>');
  }
  // SDK already on the page -> supabase-client.js skips the CDN download.
  if (/src="supabase-client\.js"/.test(html) && !/vendor\/supabase\.js/.test(html)) {
    html = html.replace(/(<script[^>]*src="supabase-config\.js"[^>]*><\/script>)/i, '<script src="vendor/supabase.js"></script>\n$1');
  }
  if (html !== before) { fs.writeFileSync(fp, html); rewritten++; }
}

const missing = [];
for (const f of fs.readdirSync(out)) {
  if (!f.endsWith('.html')) continue;
  const html = fs.readFileSync(path.join(out, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|png|jpe?g|svg|webp))(?:[?#][^"]*)?"/gi)) {
    if (!fs.existsSync(path.join(out, m[1]))) missing.push(f + ' -> ' + m[1]);
  }
  if (/cdn\.tailwindcss\.com|fonts\.googleapis\.com/.test(html)) console.warn('prepare-www: ' + f + ' still references a CDN (Tailwind/Fonts).');
}
console.log('prepare-www: copied ' + n + ' root files + images/ into www/, rewrote ' + rewritten + ' pages for local CSS/fonts/SDK.');
if (missing.length) { console.error('Missing referenced files:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log('prepare-www: all local file references resolve.');
