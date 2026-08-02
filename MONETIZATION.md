# Monetization setup — coin packs + rewarded ads

In-app shop UI is ready (**Get coins** packs + **Watch ad**).  
Until you finish the steps below, the web/app build uses a **preview** (fake ad / confirm dialog) so you can test the flow.

Product IDs match `capacitor.config.json` appId `com.kyh.jamodeul`.

| Pack | Coins | Price (suggested) | Product ID |
|------|------:|-------------------|------------|
| Small | 100 | $0.99 | `com.kyh.jamodeul.coins_100` |
| Popular | 550 | $4.99 | `com.kyh.jamodeul.coins_550` |
| Best | 1200 | $9.99 | `com.kyh.jamodeul.coins_1200` |

Ad reward (code): **+25 coins**, **5 / day**, **90s cooldown** — edit in `www/js/monetization-service.js` → `CONFIG`.

---

## A. What you can do right now (no accounts)

1. Open the site → **Shop** tab.
2. Tap **Watch** → short preview → +25 coins.
3. Tap a pack price → confirm dialog → coins added (preview only).

No Apple / Google / AdMob account needed for this preview.

---

## B. Outside setup — Rewarded ads (AdMob)

### 1. Create AdMob account
1. Go to [https://admob.google.com](https://admob.google.com) and sign in with Google.
2. Create an **app** for iOS and one for Android (or link Play/App Store listings once published).
3. For each app, create an ad unit:
   - Type: **Rewarded**
   - Copy the **App ID** (`ca-app-pub-…~…`) and **Ad unit ID** (`ca-app-pub-…/…`).

### 2. Put IDs in the game
Edit `www/js/monetization-service.js`:

```js
useTestAdIds: false,
admob: {
  androidAppId: 'ca-app-pub-XXXX~YYYY',
  iosAppId: 'ca-app-pub-XXXX~YYYY',
  rewardedAndroid: 'ca-app-pub-XXXX/ZZZZ',
  rewardedIos: 'ca-app-pub-XXXX/ZZZZ',
},
```

### 3. Install AdMob Capacitor plugin (on your machine)

```bash
cd "/Users/kyh/Code/korean wordle"
npm install @capacitor-community/admob
npx cap sync
```

Then follow the plugin README for native App ID entries:

- **Android**: `android/app/src/main/AndroidManifest.xml` → `com.google.android.gms.ads.APPLICATION_ID`
- **iOS**: `Info.plist` → `GADApplicationIdentifier`

### 4. Test ads
- Keep `useTestAdIds: true` until everything works (Google test units).
- Switch to your real IDs and `useTestAdIds: false` before store release.
- Real ads only fill on a **device build**, not in desktop Chrome.

---

## C. Outside setup — Coin packs (IAP)

You need **paid apps capability** on both stores.

### Apple (App Store Connect) — $99/year Apple Developer

1. [App Store Connect](https://appstoreconnect.apple.com) → your app (create if needed; bundle id `com.kyh.jamodeul`).
2. **Monetization → In-App Purchases → Create**.
3. Type: **Consumable** (coins are spent).
4. Create three products with **exact** Product IDs:

   - `com.kyh.jamodeul.coins_100`
   - `com.kyh.jamodeul.coins_550`
   - `com.kyh.jamodeul.coins_1200`

5. Set reference names, prices ($0.99 / $4.99 / $9.99), localization.
6. Submit IAP with an app version (first time needs review with a binary).
7. In Xcode: enable **In-App Purchase** capability for the app target.

### Google Play Console — one-time registration fee

1. [Play Console](https://play.google.com/console) → your app (applicationId `com.kyh.jamodeul`).
2. **Monetize → Products → In-app products → Create**.
3. Same three Product IDs as above, type **Managed / Consumable**.
4. Activate products.
5. License-test with a Gmail on the device (License testing in Play Console).

### Install a purchase plugin (pick one)

**Option A — Capgo Native Purchases (simpler):**

```bash
npm install @capgo/native-purchases
npx cap sync
```

**Option B — RevenueCat** (better analytics / receipts; free tier):

1. Create account at [https://www.revenuecat.com](https://www.revenuecat.com)
2. Add iOS + Android apps, paste App Store / Play credentials.
3. Create an Offering that maps to the three product IDs.
4. `npm install @revenuecat/purchases-capacitor` then `npx cap sync`
5. We can wire RevenueCat keys into `monetization-service.js` when you’re ready.

Until a plugin is installed, pack buttons keep using the **preview confirm** on device/web.

---

## D. Checklist before going live

- [ ] AdMob rewarded units live; `useTestAdIds: false`
- [ ] Three consumable IAPs created on **both** stores with matching IDs
- [ ] Capacitor plugins installed + `npx cap sync`
- [ ] Test on a real phone (Sandbox Apple ID / Play license tester)
- [ ] Privacy policy updated (ads + purchases)
- [ ] Later (recommended): server-side receipt validation so coins can’t be faked

---

## E. Ask me when ready

After you have:

1. AdMob App + rewarded unit IDs, and/or  
2. Store products created + which purchase plugin you chose  

…paste the IDs here and we can flip off preview mode and finish native wiring.
