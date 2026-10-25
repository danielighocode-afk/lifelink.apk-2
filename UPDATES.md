# Signed builds and the in-app update prompt

## One-time setup
1. Create ONE release key and keep it forever (back it up in two places; if you lose it nobody can update the app):
   `keytool -genkey -v -keystore lifelink-release.jks -alias lifelink -keyalg RSA -keysize 2048 -validity 10000`
2. Turn it into text:
   - Mac/Linux: `base64 -w0 lifelink-release.jks`
   - Windows cmd: `certutil -encode lifelink-release.jks ks.b64`, then open ks.b64 and copy everything BETWEEN the BEGIN/END lines.
3. GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret. Add four:
   - `ANDROID_KEYSTORE_BASE64` (the text from step 2)
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS` (lifelink)
   - `ANDROID_KEY_PASSWORD`
4. Never commit the .jks file or the passwords.

## Every release
1. Edit `version.json`: raise `versionCode` (must go up every time), set `versionName` and `notes`.
2. Commit and push, then tag and push the tag:
   `git tag v1.1.1` then `git push origin v1.1.1`
3. GitHub builds a signed `LifeLink.apk` and publishes a release containing `LifeLink.apk` and `version.json`.
4. Installed apps (that already include this update prompt) see the new version on next launch and offer Update.
   `releases/latest/download/LifeLink.apk` always points to the newest APK, use it on your download page.

## Important
- Phones that have the old debug-signed app must UNINSTALL it once, then install the first signed build. After that, updates install over the top.
- Set `"force": true` in version.json to make the prompt impossible to dismiss.
- The repo must be public for the app to read version.json.
