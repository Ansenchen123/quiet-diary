# Quiet Diary

Quiet Diary is a local-first private diary PWA that can also be packaged as a Capacitor Android debug app. It is designed for personal journaling on one device, with a PIN gate, local IndexedDB storage, manual encrypted backup files, installable PWA metadata, and an Android wrapper for device testing.

## Overview

The project is a publish-ready private journaling app focused on offline-capable daily writing rather than accounts, collaboration, or cloud sync. The web app runs from static files, registers a Service Worker, stores diary data locally, and uses Capacitor to wrap the same web assets for Android with the app id configured in `capacitor.config.json`.

## Features

- First-run PIN setup and PIN-based unlock for the diary shell.
- PBKDF2-derived PIN keys with AES-GCM encrypted verifier data.
- Local IndexedDB persistence for entries, media, and settings.
- Diary entries with text, date/time, mood, comma-separated tags, photos, and videos.
- Timeline rendering with saved entries, local media previews, single-entry deletion, and a clear-all control.
- Current-month memory calendar with markers on days that have entries.
- Local theme selection and custom cover image storage.
- Manual encrypted JSON backup export and import after PIN unlock.
- Service Worker registration for offline app-shell reuse with network-first GET handling and cache fallback.
- Installable PWA metadata with standalone display, portrait orientation, theme colors, and `icons/icon.svg`.
- Capacitor Android wrapper using `android/` and the package/application id configured in `capacitor.config.json`.

## PWA Installation

Run the app from the repository root with a local HTTP server:

```powershell
python -m http.server 4173
```

Open http://localhost:4173/index.html. On desktop Chrome or Edge, use the browser install button when it appears. On Android Chrome, use Add to Home screen or Install app from the browser menu. Installability metadata comes from `manifest.webmanifest`, and offline app-shell caching comes from `sw.js`.

## Local Development

Install local dependencies inside the repository root:

```powershell
npm install
```

For web-only review, serve the static files from the repository root:

```powershell
python -m http.server 4173
```

For the Capacitor web asset staging step, run:

```powershell
npm run build:web
```

The build script in `scripts/build-web.ps1` copies `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, `icons/`, and `opendesign/` into the generated Capacitor web directory.

## Android Packaging

The Android project is present under `android/`, and Capacitor is configured by `capacitor.config.json` with `webDir` set to `www` and app id `app.quietdiary.personal`. The package scripts in `package.json` expose:

```powershell
npm run android:sync
npm run android:apk
```

The debug APK workflow is implemented by `scripts/build-android-apk.ps1`:

1. Reads the integer in `build-number.txt`.
2. Runs the web staging step from `scripts/build-web.ps1`.
3. Runs Capacitor sync for `android/`.
4. Runs the Gradle wrapper in `android/` with `diaryVersionCode` and `diaryVersionName` values.
5. Copies the debug APK into the generated distribution directory.
6. Increments `build-number.txt` after a successful build.

`android/app/build.gradle` maps `diaryVersionCode` and `diaryVersionName` into the Android default config. `android/app/src/main/AndroidManifest.xml` defines the launcher activity, FileProvider, and INTERNET permission. The current repository does not contain a release keystore, a custom release signing block, or a checked-in Google services JSON file; `.gitignore` and `android/.gitignore` contain ignore rules or comments for those local-only artifacts.

Before running the Android commands, install the local npm dependencies with `npm install`. The debug APK script expects a local Java runtime and Android SDK. If `JAVA_HOME`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT` are not already set, `scripts/build-android-apk.ps1` attempts to use the Android Studio bundled JBR and the default Android SDK location. The script uses `npx cap sync android`, then runs `android/gradlew.bat assembleDebug` from the Android project directory.

The generated debug APK is copied to the distribution output directory using a quiet-diary-0001-debug.apk style filename. The distribution output directory and generated web assets are intentionally ignored by `.gitignore`.

## Backup File Format

Backup export creates a JSON file using a quiet-diary-backup timestamped filename. The top-level JSON contains `type`, `salt`, and `archive` fields. The `archive` field contains AES-GCM encrypted JSON with `version`, `exportedAt`, `entries`, `media`, and `settings` after the current PIN is derived with PBKDF2-SHA-256.

Media blobs and thumbnails are stored inside the encrypted archive as data URLs. Import requires the same PIN that was active when the backup was exported. Forgetting the PIN prevents backup restore.

## Browser Support

Quiet Diary uses IndexedDB, Web Crypto, Service Workers, file input APIs, and object URLs. Use current Chrome, Edge, Firefox, or Safari for web review. Installable PWA behavior is best verified in Chrome or Edge on desktop and Chrome on Android.

Service Worker registration requires a secure context, with `localhost` accepted for local development. Offline behavior is available after the first successful load and Service Worker installation.

## Project Structure

- `.gitignore` - ignores local dependencies, generated web/build output, APK bundles, logs, and Android signing artifacts.
- `index.html` - app shell, lock screen, tabs, forms, timeline, calendar, theme, and backup UI.
- `styles.css` - responsive styling, themes, app shell, entry cards, media previews, and lock screen.
- `app.js` - IndexedDB data model, PIN flow, encryption helpers, entry/media handling, theme handling, backup import/export, calendar rendering, and Service Worker registration.
- `manifest.webmanifest` - PWA display metadata, colors, orientation, and icon definition.
- `sw.js` - Service Worker install, activate, cache cleanup, and GET fetch handling.
- `icons/` - PWA icon assets.
- `package.json` - npm scripts and Capacitor dependencies.
- `package-lock.json` - locked dependency graph for local installs.
- `capacitor.config.json` - Capacitor app id, app name, web directory, and Android scheme.
- `build-number.txt` - integer consumed and incremented by the Android debug APK script.
- `scripts/` - PowerShell build helpers.
- `scripts/build-web.ps1` - copies web assets for Capacitor.
- `scripts/build-android-apk.ps1` - stages web assets, syncs Capacitor Android, builds a debug APK, copies it to the generated distribution directory, and increments the build number.
- `android/` - Capacitor Android project.
- `android/app/build.gradle` - Android app namespace, package id, SDK settings, version properties, dependencies, and optional Google services hook.
- `android/app/src/main/AndroidManifest.xml` - Android launcher activity, FileProvider, and INTERNET permission.
- `opendesign/` - design mockup and design-system source files kept with the project.

## Publication Notes

The local readiness report records the latest source review, sensitive-data scan, and remaining owner-only release tasks. Before public release, provide release signing outside the repository, write a privacy policy, run device testing, and prepare store listing assets if distributing through an app store.

## 摘要

靜日記是一個本機優先的私密日記 PWA，也包含 Capacitor Android 專案。

目前功能以 PIN 解鎖、本機 IndexedDB 儲存、照片或影片附件、心情與標籤、時間線、月曆回憶、主題封面，以及手動加密備份為主。

PWA 安裝資訊來自 `manifest.webmanifest`，離線 App Shell 快取來自 `sw.js`。

Android 打包流程由 `scripts/build-android-apk.ps1` 串接 web asset staging、Capacitor sync、Gradle debug build 與 build number 遞增。

此專案目前沒有雲端同步、帳號登入或正式上架簽章設定；上架前仍需補齊 release signing、隱私政策、裝置測試與商店素材。
