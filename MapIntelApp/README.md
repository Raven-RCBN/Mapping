# MapIntel Android — 36.82.105

Installed application: `ai.agrinexus.mapintel`. Launcher name: **MapIntel**, with the gold Agrinexus a. Login/loading use the supplied MapIntel / ESTATE INTELLIGENCE wordmark beside the a. The login footer reads `MapIntel Ver 36.82.105` and `© Agrinexus Inteligence 2026`, as requested.

## Development structure

- `android/`: Java 17 Android shell, secure login/session, HTTPS client, verified estate storage, foreground GPS and app lifecycle. Android API 26+, target/compile 35.
- `ui/`: bundled React/OpenLayers map, Production and Analytics, plus native mobile UI wrappers. It contains no bundled estate or financial dataset; the build's virtual data modules read the authenticated private snapshot supplied by Android.
- `build-ui.mjs`: creates the offline HTML/JavaScript/CSS assets.
- `android/app/src/androidTest/`: separate instrumentation package for device verification; it is not included in the application APK.

This follows the Advisory management app's native Android/API/session approach while retaining the Mapping OpenLayers map implementation. The earlier React Native scaffold remains in `apps/mobile`; this app does not depend on Metro or that scaffold's native toolchain. The browser mockup lives outside this repository in the sibling `mapintel-mobile-preview` folder; the Android UI is self-contained here.

## Build

With JDK 17 and Android SDK 35 available:

```sh
npm ci
npm run build:ui
./android/gradlew -p android :app:assembleDebug :app:lintDebug
```

Set `JAVA_HOME` and `ANDROID_HOME` for the local installation. APK: `android/app/build/outputs/apk/debug/app-debug.apk`. The shared package is saved at `outputs/mapintel-android-20261117/MapIntel-36.82.105.apk` relative to the repository root. The installed/shared package is a debug-signed testing build; no private distribution key is included. Generated assets, APKs, SDK paths and caches are excluded from Git.

## API and access

The fixed HTTPS origin is `https://mapintel.agrinexus.ai`; redirects are disabled and system TLS verification is retained. Login/logout reuse `/api/v1/users`. Reading uses `/api/EstateAtlas/bootstrap`, `/workspace`, `/map-assets`, authorized asset files and `/production/recorded` for monthly/yearly records. No second account database or API authentication service is introduced.

The first estate selection is deliberately the permitted Oban Nigeria estate, selected from the server bootstrap. An account without Oban or the relevant menu grants is refused or has those functions hidden. The server independently checks current account, estate and menu access for every request. The app exposes Map, Production and Analytics only, with offline management in the header. Time machine, IoT Movement, Operations, Wages and an Offline bottom tab are excluded.

Monthly production is parsed incrementally and projected into the fields required by the UI. Full raw workbooks/source metadata are not retained in the mobile production snapshot. Annual yield comes from the webapp API's `yieldPerHa`, including its crop/area rules. Missing values remain unavailable. Separate reporting records sharing a map block remain distinct.

## Saved login and offline data

Keep me logged in is optional and selected by default. Only the session cookie is persisted, encrypted using an Android Keystore AES-GCM key; the password is never stored. API/session credentials never enter JavaScript. The approved backend change gives remembered sessions a rolling 30-day inactivity window; ordinary web sessions retain eight hours. Online access always checks the active user and current permissions. Expired, revoked and disabled sessions cannot be renewed.

A remembered account can reopen its saved estate and data without internet, including after a process restart. Offline content does not refresh. Account/session revocation can only be discovered when the phone reconnects; once discovered, the app clears the saved account content and requires sign-in. Sign-out clears the session, private estate files, query cache and WebView storage, including saved location. Unchecked Keep me logged in does not retain a session across process death.

Files are downloaded directly from the API to private application storage, checked against server SHA-256 values, and reused when unchanged. A complete private snapshot is activated with Android AtomicFile; failed updates retain the previous snapshot. Conditional ETag requests avoid retransferring unchanged API responses. Foreground/returning connectivity checks and a three-minute foreground interval refresh changed content. No automatic updates run offline.

Android cloud backup and device transfer are excluded. WebView file/content access and mixed content are disabled; only bundled app pages can access the narrow native bridge. Screenshots are protected. The app has no data-edit or upload endpoint.

## Maps and GPS

Saved maps include the latest permitted satellite image, estate mosaic overview, terrain overview and supplied GIS vectors/boundaries. Full-resolution online mosaic tiles and external road tiles are not downloaded. Large source pyramids are not embedded in the APK.

Show location requests foreground location only; no background permission is declared. GPS can obtain a fix without mobile data. The icon centres the map on a fresh current fix without opening a notes panel. Stale saved positions are not drawn as current GPS. Tracking stops when the app leaves the foreground. No simulated position is exposed in the installed app.

When online and a current fix is available, a bounded area around it can be saved from OpenStreetMap Overpass as roads/buildings/water vectors, with OpenStreetMap attribution. This request sends a surrounding bounding box, not an account/session or business data. The stored area is approximately 1 km across and is not an offline navigation/routing product. Provider/network errors retain any earlier saved area. The device test verified real GPS both online and offline; completing an external nearby-area download still needs a working phone network. See [Overpass service guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) before scaling this integration beyond the test rollout.

## Validation and production change

See [VALIDATION.md](VALIDATION.md). The only server change for this rollout is the explicitly approved remembered-session addition in `apps/api/src/service/session-auth.js`, published to Malaysia on 17 November 2026. No estate/business records, users, permissions, environment or database restore were changed. Existing browser sessions remain in the same MongoDB registry.

## Mobile analytics and layout

The compact header maximizes map height. Analytics offers Production per hectare and Annual block fertiliser. Fertiliser uses the webapp calculation helpers in `ui/shared`, with year, division, block, product and measure filters. Show on map applies the matching webapp kg-per-palm bands for solids and selected measure for liquids. Missing values remain unavailable. The authenticated `/hts-analysis` response is projected to fertiliser fields only and saved atomically with the estate snapshot; existing installations need one online update to obtain it. No wage records are exposed in the mobile snapshot. Unsupported operational-only responses show an unavailable state.

Loading keeps the gold a stationary with an animated hollow gold ring and “Please wait while loading”. Fertiliser analysis deliberately excludes charts; it includes the webapp quantity/bag/kg-per-palm/MT-per-ha/area cards and mapped block table.

Selection controls use compact in-app lists rather than Android popup dialogs. Production exposes the two latest available annual reporting years (currently 2025 and 2026); fertiliser uses its own dataset years. Keyboard dismissal blurs only text-edit controls and does not clear WebView focus.

In fertiliser map view, a compact floating fertiliser key replaces the usual estate/POI key without consuming map height, and the Layers button is hidden. Returning from Production to its map restores the normal legend and Layers button. A selected map block shows fertiliser quantity/rate and opens the matching fertiliser detail filters; blocks without records retain their selected code and show unavailable values.

Fertiliser acceptance is now verified on-device: the downloaded webapp records/cards/shading survive a true offline cold restart. The floating key uses the original vertical range list, expanded by default, positioned clear of zoom/GPS controls. See VALIDATION.md for the direct source comparison and offline restart evidence.
