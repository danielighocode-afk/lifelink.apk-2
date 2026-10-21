#!/usr/bin/env node
/* Run after `cap add android` (and safe to re-run). Applies LifeLink's Android-specific settings:
   location permissions, launcher icons (from the original logo), splash image and background colour. */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const manifest = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifest)) { console.error('android/ not found. Run: npm run android:add'); process.exit(1); }

let xml = fs.readFileSync(manifest, 'utf8'), added = [];
for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_NETWORK_STATE']) {
  if (!xml.includes('android.permission.' + p)) { xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.' + p + '" />\n</manifest>'); added.push(p); }
}
if (!xml.includes('android.hardware.location.gps')) xml = xml.replace('</manifest>', '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>');
fs.writeFileSync(manifest, xml);
console.log('manifest: permissions added -> ' + (added.join(', ') || 'none needed'));

let icons = 0; const src = path.join(root, 'android-res');
for (const d of fs.readdirSync(src)) {
  const to = path.join(res, d); fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(path.join(src, d))) { fs.copyFileSync(path.join(src, d, f), path.join(to, f)); icons++; }
}
fs.mkdirSync(path.join(res, 'values'), { recursive: true });
fs.writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n');
console.log('icons: copied ' + icons + ' launcher files (original LifeLink pin)');

let splash = 0;
for (const d of fs.readdirSync(res)) {
  if (!d.startsWith('drawable')) continue;
  const f = path.join(res, d, 'splash.png');
  if (fs.existsSync(f)) { fs.copyFileSync(path.join(root, 'resources', 'splash.png'), f); splash++; }
}
console.log('splash: replaced ' + splash + ' splash images (original LifeLink logo on #F5F8F6)');
