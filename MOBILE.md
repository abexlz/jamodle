# 자모들 — App Store & Play Store setup

Your game runs as **HTML inside a native shell** (Capacitor). You edit `www/index.html`; the stores get a normal iOS/Android app.

## Project layout

```
korean wordle/
├── www/index.html          ← your game (ship this)
├── capacitor.config.json   ← app name, bundle ID, splash colors
├── package.json
├── ios/                    ← created after `npx cap add ios`
└── android/                ← created after `npx cap add android`
```

---

## One-time setup (do this first)

### 1. Install Node.js

If you don’t have it: https://nodejs.org (LTS).

Check:

```bash
node -v
npm -v
```

### 2. Install dependencies

In Terminal, from this folder:

```bash
cd "/Users/kyh/Code/korean wordle"
npm install
```

### 3. Change the bundle ID (required before stores)

Edit `capacitor.config.json` and replace:

```json
"appId": "com.yourname.jamodeul"
```

with something you own, e.g. `com.kyh.jamodeul` (reverse domain + app name).  
Use the **same** ID for iOS and Android.

### 4. Add iOS and Android projects

```bash
npx cap add ios
npx cap add android
npx cap sync
```

- **iOS** needs **Xcode** (Mac only).
- **Android** needs **Android Studio**.

---

## Every time you change the game

1. Edit `www/index.html` (your game code lives here now).
2. Sync into native projects:

```bash
npx cap sync
```

3. Rebuild in Xcode or Android Studio.

Optional shortcuts:

```bash
npm run open:ios      # opens Xcode
npm run open:android  # opens Android Studio
```

---

## Test on your phone

### iPhone

1. `npm run open:ios`
2. In Xcode: select your **Team** under Signing & Capabilities.
3. Plug in iPhone → select device → **Run** (▶).

### Android

1. `npm run open:android`
2. Enable **Developer options** + **USB debugging** on the phone.
3. In Android Studio → **Run** on device or emulator.

---

## App Store (iOS)

### Accounts & tools

- Apple Developer Program (**$99/year**)
- Xcode installed

### Steps

1. `npm run sync` (after any HTML change)
2. `npm run open:ios`
3. In Xcode:
   - Target **App** → **Signing & Capabilities** → Team + unique Bundle Identifier (matches `appId` in `capacitor.config.json`)
   - **App** → General → Version / Build
   - Add **App Icons** (1024×1024 and asset catalog)
4. Menu **Product → Archive**
5. **Distribute App** → App Store Connect → Upload
6. In [App Store Connect](https://appstoreconnect.apple.com):
   - Create app, screenshots, description, age rating
   - **Privacy**: if you only load Google Fonts, mention network use or self-host fonts
   - Submit for review

---

## Play Store (Android)

### Accounts & tools

- Google Play Console (**$25 one-time**)
- Android Studio installed

### Steps

1. `npm run sync`
2. `npm run open:android`
3. **Build → Generate Signed Bundle / APK** → **Android App Bundle (AAB)**
   - Create a keystore (save password + file safely)
   - Use **Play App Signing**
4. In [Play Console](https://play.google.com/console):
   - Create app
   - **Release → Production** (or testing track) → upload **AAB**
   - Store listing: icon 512×512, feature graphic 1024×500, screenshots
   - **Data safety** form (mostly “no data collected” if you don’t use analytics)
   - Content rating questionnaire
   - Privacy policy URL (required if you use network fonts or any third-party service)

### Build AAB from terminal (after signing is configured in Android Studio)

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## Icons & splash

- **iOS**: Xcode → `App/App/Assets.xcassets` → AppIcon
- **Android**: `android/app/src/main/res/` → mipmap folders

Splash background is already set to `#0B0F1A` in `capacitor.config.json`.

Generate icons: https://capacitorjs.com/docs/guides/splash-screens-and-icons  
Or use `@capacitor/assets`:

```bash
npm install @capacitor/assets --save-dev
# put icon.png (1024) and splash.png in a resources/ folder, then:
npx capacitor-assets generate
```

---

## What you do **not** need to do

- Rewrite in Swift or Kotlin
- “Convert” HTML to another language
- Change game logic for Capacitor (unless you add native plugins)

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| White screen on device | Run `npx cap sync`; check `www/index.html` exists |
| `npm` not found | Install Node.js |
| Xcode signing error | Set Team + unique Bundle ID |
| Play rejects target SDK | Update Android Studio + `npx cap sync` |
| Fonts don’t load offline | Self-host Google Fonts in `www/` |

---

## Quick reference

```bash
cd "/Users/kyh/Code/korean wordle"
npm install              # once
npx cap add ios          # once (Mac)
npx cap add android      # once
# edit www/index.html
npx cap sync             # after every HTML change
npm run open:ios         # Xcode
npm run open:android     # Android Studio
```
