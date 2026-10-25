#!/usr/bin/env node
/* Run after `cap add android` (and safe to re-run). Applies LifeLink's Android-specific settings:
   location + notification permissions, Firebase push setup, launcher icons (from the original logo), splash image and background colour. */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const manifest = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifest)) { console.error('android/ not found. Run: npm run android:add'); process.exit(1); }

let xml = fs.readFileSync(manifest, 'utf8'), added = [];
for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_NETWORK_STATE', 'POST_NOTIFICATIONS']) {
  if (!xml.includes('android.permission.' + p)) { xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.' + p + '" />\n</manifest>'); added.push(p); }
}
if (!xml.includes('android.hardware.location.gps')) xml = xml.replace('</manifest>', '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>');
fs.writeFileSync(manifest, xml);
console.log('manifest: permissions added -> ' + (added.join(', ') || 'none needed'));

/* Push notifications: copy Firebase's google-services.json (kept in the project root) into the Android app and make sure Gradle uses it. */
const gsSrc = path.join(root, 'google-services.json'), gsDest = path.join(root, 'android', 'app', 'google-services.json');
if (fs.existsSync(gsSrc)) {
  fs.copyFileSync(gsSrc, gsDest);
  console.log('firebase: google-services.json copied to android/app/');
  const patch = (file, fn) => { if (!fs.existsSync(file)) return; const a = fs.readFileSync(file, 'utf8'), b = fn(a); if (b !== a) { fs.writeFileSync(file, b); console.log('firebase: updated ' + path.relative(root, file)); } };
  patch(path.join(root, 'android', 'build.gradle'), (g) => /com\.google\.gms:google-services/.test(g) ? g
    : g.replace(/(classpath\s+['"]com\.android\.tools\.build:gradle:[^'"]+['"])/, "$1\n        classpath 'com.google.gms:google-services:4.4.2'"));
  patch(path.join(root, 'android', 'app', 'build.gradle'), (g) => /com\.google\.gms\.google-services/.test(g) ? g
    : g + "\napply plugin: 'com.google.gms.google-services'\n");
} else {
  console.warn('firebase: google-services.json not found in the project root. The app will build, but push notifications will not work.');
}

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

/* App version: versionCode / versionName come from version.json in the project root (one place to edit per release).
   Android only installs an update when versionCode is higher than the installed one. */
try {
  const vj = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  const gf = path.join(root, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gf) && Number.isInteger(vj.versionCode) && vj.versionName) {
    let g = fs.readFileSync(gf, 'utf8');
    g = g.replace(/versionCode\s+\d+/, 'versionCode ' + vj.versionCode).replace(/versionName\s+"[^"]*"/, 'versionName "' + String(vj.versionName).replace(/[^0-9A-Za-z._-]/g, '') + '"');
    fs.writeFileSync(gf, g);
    console.log('version: versionCode ' + vj.versionCode + ', versionName ' + vj.versionName);
  }
} catch (e) { console.warn('version: could not apply version.json (' + e.message + ')'); }
