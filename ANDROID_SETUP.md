# Android App (Capacitor)

The Android app is the **same codebase** as the website — not a port. `dist/`
is bundled into the APK and rendered by a native WebView, so the astrology
engine, the tabs, the Kundali chart, the PDF parser and Supabase sync are all
byte-for-byte identical to https://astrology.penetacle.workers.dev.

Two things stay in sync automatically:

| What | Mechanism | Latency |
|---|---|---|
| **Your data** (profiles, predictions, life events) | Supabase row, pulled on every app resume / tab focus | Seconds |
| **The app itself** (HTML/CSS/JS) | OTA bundle published with every `wrangler deploy` | Next app restart |

So a profile you save on the phone shows up on the website, and a feature you
ship to the website reaches the phone without a Play Store release.

---

## 1. One-time setup

### Prerequisites

- **Node 22+** (`node --version`)
- A **JDK 21** and a handful of **Android SDK packages** — see below

You do **not** need Android Studio. The IDE, emulator and system images are
~8–12 GB and none of them are required to build an APK. What the build actually
needs is about **525 MB**:

| Package | Size | Why |
|---|---|---|
| JDK 21 (Temurin) | ~180 MB | Android Gradle Plugin 8.13 requires JDK 17+ |
| `cmdline-tools;latest` | ~180 MB | provides `sdkmanager` |
| `platforms;android-36` | ~90 MB | `compileSdkVersion = 36` in `android/variables.gradle` |
| `build-tools;36.0.0` | ~60 MB | dexing, packaging, zipalign |
| `platform-tools` | ~15 MB | `adb` |

Gradle then caches ~700 MB–1 GB of dependencies on the first build. That part is
unavoidable either way.

#### Automatic install

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-android-sdk.ps1
```

Installs everything above to `%LOCALAPPDATA%\Android\Sdk`, sets `ANDROID_HOME`
and `PATH`, accepts the SDK licenses, and writes `android/local.properties`.
Safe to re-run — each step is skipped if already done. **Open a new terminal
afterwards** so the updated `PATH` takes effect.

#### Manual equivalent

If you'd rather do it by hand: download "Command line tools only" from
<https://developer.android.com/studio>, unzip so that `sdkmanager.bat` sits at
`%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin\` (that nested `latest`
folder is required — the zip doesn't include it), then:

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

#### Testing on a real phone

Enable **Developer options** (*Settings → About phone →* tap *Build number*
seven times), turn on **USB debugging**, plug in, and accept the prompt. Check
with `adb devices`.

No emulator is installed by the script. If you ever need one:

```powershell
sdkmanager "emulator" "system-images;android-36;google_apis;x86_64"
```

That adds roughly 2–2.5 GB. A real device is also the more trustworthy test —
emulator WebViews lag behind real Chrome builds.

### Install and scaffold

Run these on **Windows**, in the project root:

```powershell
npm install
npm run android:init      # npx cap add android — generates the android/ folder
npm run android:sync      # build + copy the web app into the native project
```

`android:init` is only ever run once. It creates `android/`, a standard Gradle
project. After that, `android:sync` is the command you'll use constantly.

> **Do not** run `npm install` inside a Linux shell or container for this
> project. It pulls Linux-only binaries (`@sentry/cli-linux-x64`,
> `@rolldown/binding-linux-x64-gnu`) into `node_modules`, and the next Windows
> build fails at source-map upload. If that happens: delete `node_modules` and
> `package-lock.json`, then `npm install` again on Windows.

---

## 2. Daily development

| Command | What it does |
|---|---|
| `npm run dev` | Web dev server — use this for almost all UI work |
| `npm run android:sync` | Rebuild the web app and copy it into `android/` |
| `npm run android:open` | Open the project in Android Studio |
| `npm run android:run` | Sync, then build and launch on a connected device/emulator |

The fastest loop is still `npm run dev` in a browser. Only go to a device when
you're testing something the browser can't show you: safe-area insets, the
hardware back button, the PDF file picker, or the share sheet.

### Live reload against a real device

```powershell
npm run dev -- --host
npx cap run android --live-reload --host <your-LAN-IP> --port 5173
```

The device loads the Vite dev server over your network, so edits hot-reload on
the phone. Requires the phone and PC on the same Wi-Fi.

### Debugging

With the phone plugged in, open `chrome://inspect` in desktop Chrome — you get
the full DevTools console for the WebView, including network and `console.log`.

This works out of the box on debug builds and is off on release builds, because
`capacitor.config.json` deliberately does **not** set
`android.webContentsDebuggingEnabled`. Capacitor defaults that flag to the
app's `FLAG_DEBUGGABLE` (`CapConfig.java`), which is exactly the behaviour you
want — setting it explicitly either way is worse: `true` leaves release builds
inspectable by anyone, `false` blocks debugging even locally.

---

## 3. Releasing

### Debug APK (sideload, no signing)

```powershell
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` — copy to the phone
and install (allow "install from unknown sources").

### Signed release build

**Create a keystore once.** Guard this file: lose it and you can never update
the app on Play Store under the same listing.

```powershell
keytool -genkey -v -keystore astrology-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias astrology
```

Create `android/keystore.properties` (already git-ignored):

```properties
storeFile=D:/AntigravityProjects/Astrology/astrology-release.jks
storePassword=<your-password>
keyAlias=astrology
keyPassword=<your-password>
```

Wire it into `android/app/build.gradle`, inside the `android { }` block:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

signingConfigs {
    release {
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

Then:

```powershell
npm run android:apk       # APK   — for sideloading
npm run android:bundle    # AAB   — required by Google Play
```

Outputs land in `android/app/build/outputs/`.

---

## 4. Live (OTA) updates — how the app tracks the website

`npm run build:ota` runs `vite build` and then `scripts/build-ota.mjs`, which:

1. Zips `dist/` into `dist/ota/bundle-<version>.zip` (excluding `ota/` itself
   and any `.map` files).
2. Writes `dist/ota/manifest.json` with the version, path, and SHA-256.

Both files deploy with the site. On every foreground, the app fetches
`/ota/manifest.json`; if the version differs from what it's running it
downloads the zip, verifies the checksum, and stages it for the **next** app
start — never mid-session, so nobody loses a reading they're halfway through.

**Publishing an update:**

```powershell
npm run deploy      # = build:ota + wrangler deploy
```

Use this rather than a bare `npx wrangler deploy` — deploying without
`build:ota` publishes a site with no `/ota/manifest.json`, and installed apps
then have nothing to update to. (The worker answers 404 in that case rather
than letting the SPA fallback hand the app an HTML page to parse.)

Note that `android:sync` runs plain `npm run build`, **not** `build:ota`. That's
deliberate: `cap sync` copies everything in `dist/`, so including `dist/ota/`
would bake a redundant ~1.1 MB copy of the app inside its own APK.

### What OTA can and cannot ship

| Ships over the air | Needs a new APK/AAB |
|---|---|
| React components, tabs, styling | Adding or upgrading a Capacitor plugin |
| Astrology engine changes | New Android permissions |
| New API calls to the worker | `targetSdk` / `minSdk` bumps |
| Bug fixes, copy, assets | App icon, splash screen, app name |

Rule of thumb: if it lives in `src/`, OTA covers it. If it changes `android/`,
you need a release.

**Rollback safety.** A freshly-installed bundle must call
`notifyAppReady()` (it does, from `src/native/index.js`). If a bundle crashes
before that, the plugin automatically reverts to the previous working one — a
bad deploy can't brick installed apps.

---

## 5. What the native layer adds

All of this lives in `src/native/` and is a **no-op on the web** — the plugins
are dynamically imported behind an `isNative()` check, so the browser bundle
never loads them.

- **Status bar and splash screen** themed to match the app's dark palette.
- **Safe-area insets** as CSS variables (`--safe-top`, `--safe-bottom`, …), so
  content clears the notch and the gesture bar on edge-to-edge Android 15+.
- **Hardware back button** closes the open modal, then falls back to the first
  tab, then exits — instead of killing the app from any screen.
- **Keyboard handling** so the layout reflows rather than hiding the input.
- **Offline banner** driven by the Network plugin.
- **Resume hooks** that re-pull cloud data and check for a live update.

Two conventions worth knowing if you add features:

- `window.dispatchEvent(new CustomEvent('astro:resume'))` — anything that needs
  refreshing when the app comes back to the foreground should listen for this.
- `'astro:backbutton'` is **cancelable**. Call `preventDefault()` to say you
  handled the press (see the handler in `App.jsx`).

---

## 6. Deep links (optional)

Shared chart links (`?chart=…`) open in the browser by default. To make them
open in the app, add an intent filter to
`android/app/src/main/AndroidManifest.xml` inside the main `<activity>`:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https"
          android:host="astrology.penetacle.workers.dev" />
</intent-filter>
```

Then serve a Digital Asset Links file at
`https://astrology.penetacle.workers.dev/.well-known/assetlinks.json`
containing your release keystore's SHA-256 fingerprint, and handle the incoming
URL with the App plugin's `appUrlOpen` listener.

Note that `buildShareUrl()` already stamps links with the **public** origin
rather than the WebView's internal `https://localhost`, so links generated
inside the app are shareable as-is.

---

## 7. Troubleshooting

**"AI Reading" fails only in the app.**
The bundled site is served from `https://localhost`, so `/api/*` calls are
cross-origin. `src/apiBase.js` rewrites them to the deployed worker, and
`worker/index.js` allows the `https://localhost` origin via CORS. If you add a
new API call, use `apiUrl('/api/…')` — never a bare relative path.

**Blank white screen on launch.**
Almost always a JS error. Connect `chrome://inspect` and read the console. If it
started right after an OTA update, the plugin should have rolled back on its
own — force-stop and relaunch.

**Changes don't appear after editing code.**
`cap sync` copies `dist/`, so you must rebuild first. Use `npm run android:sync`
(which builds) rather than `npx cap sync` on its own.

**`ERROR: JAVA_HOME is set to an invalid directory`** (or `adb` not recognised).
Both mean the same thing: your terminal was opened *before* the environment
variables were set, so it's still holding the old values. Windows snapshots the
environment at process start — `setx` and `SetEnvironmentVariable` only affect
processes launched afterwards. Open a new terminal, or refresh in place:

```powershell
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME','User')
$env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
            [Environment]::GetEnvironmentVariable('PATH','User')
```

To see which scope a value is coming from:

```powershell
"Process: $env:JAVA_HOME"
"User:    $([Environment]::GetEnvironmentVariable('JAVA_HOME','User'))"
"Machine: $([Environment]::GetEnvironmentVariable('JAVA_HOME','Machine'))"
```

A leftover machine-scope `JAVA_HOME` pointing at an uninstalled JDK is a common
cause. User scope overrides it for your account, but it's worth deleting from
*System Properties → Environment Variables*.

**`ERR_SDK_NOT_FOUND: No valid Android SDK root found.`**
`ANDROID_HOME` isn't set, or the terminal predates it being set. Run
`scripts\setup-android-sdk.ps1`, then open a **new** terminal — `setx` and
`[Environment]::SetEnvironmentVariable` only affect processes started
afterwards. Verify with `echo $env:ANDROID_HOME`.

**Gradle can't find the SDK.**
Create `android/local.properties` with
`sdk.dir=C\:\\Users\\adity\\AppData\\Local\\Android\\Sdk` (note the escaped
colons and backslashes). The setup script writes this for you.

**PDF upload does nothing.**
The parser needs the pdf.js worker asset. It's imported via `?url` in
`pdfParser.js`, so it ships inside the bundle — confirm `dist/assets/` contains
a `pdf.worker*` file after building.

**Supabase "Failed to fetch".**
Free-tier projects auto-pause after ~7 idle days. The keep-alive cron in
`wrangler.jsonc` normally prevents this — check the Supabase dashboard.
