# WorldMonitor — Android APK (Trusted Web Activity)

Wraps the live PWA https://worldmonitor-core.vercel.app/ as an Android app via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). The result is a thin Java shell that opens the PWA in a Chrome Custom Tab with no URL bar — indistinguishable from a native app at runtime.

## Prerequisites

- Node ≥ 18, JDK 17, Android SDK build-tools 34+
- `npm i -g @bubblewrap/cli`

## Build the APK (and AAB for Play Store)

```bash
cd packages/twa
bubblewrap init --manifest ./twa-manifest.json
bubblewrap build
# Outputs:
#   app-release-signed.apk    (sideload / direct install)
#   app-release-bundle.aab    (Google Play upload)
```

## Digital Asset Links (one-time)

Bubblewrap will print a SHA-256 fingerprint after build. Add to
`worldmonitor-ui-components/public/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.yavro.worldmonitor",
    "sha256_cert_fingerprints": ["<bubblewrap printed this>"]
  }
}]
```

Redeploy the Next.js frontend, then the TWA will run without the address bar.

## Test on device

```bash
adb install app-release-signed.apk
```

## Why TWA over Capacitor / React Native

- **Zero code duplication.** The PWA is the source of truth.
- **Auto-updates.** Push to Vercel → users get it next session, no Play Store roundtrip.
- **6 MB APK.** No bundled WebView; uses the device's Chrome.
- **Same backend.** All API calls go to the existing Railway/Vercel endpoints.

## Limitations

- Requires Chrome ≥ 75 on Android (~98% market share in 2026).
- iOS equivalent doesn't exist (Apple doesn't allow TWA-style wrappers). Use [PWABuilder](https://www.pwabuilder.com) → iOS package, which produces a similar wrapper using `WKWebView` for App Store submission.
