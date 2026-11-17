# MapIntel 36.82.101 verification — 17 November 2026

- Android debug assembly and lint passed. Fourteen Node regression tests passed, covering exact map geometries, shared-polygon aggregation, null/zero handling, kg/palm bands and matched production-yield cohorts.
- Installed over the existing app without clearing its session or private saved estate.
- Offline cold start rendered the saved map: imageStatus ready, canvas present, both branding images loaded, Map/Production/Analytics navigation available.
- Compact chrome measured 111 CSS px, compared with the prior 215 CSS px; content starts at the header boundary without overlap.
- GPS button text is empty, sits below the map icon, and opens no notes/status panel.
- Separate native instrumentation confirmed loadingMessage=true, logoStationary=true and ringAnimates=true. The hollow gold ring rotates while the a remains fixed.
- Analytics query exposes Production per hectare and Annual block fertiliser. The fertiliser screen contains filters, cards, block data and map shades only; no charts.
- The phone has a Wi-Fi captive portal without validated internet. At the user's request, testing finished offline. The old saved package does not yet contain fertiliser data. Live download, real fertiliser cards/map shading and reopening that new dataset offline remain device acceptance checks after a successful online update. Calculations were verified against the copied webapp regression tests with synthetic fixtures.
- No server publication or phone network-setting change was made for this revision. Existing Malaysia deployment and permissions are unchanged.

Final APK: `outputs/mapintel-android-20261117/MapIntel-36.82.101.apk`. SHA-256: `473b215f522f69bac6294f4396b801a1ac15524390a99107901d6884d7917e05`. APK signature verification passed.

The APK is a debug-signed review build. A private distribution signing setup is not included in Git.

---

# MapIntel 36.82.100 validation — 17 November 2026

Device: connected Samsung SM-A076B, Android 16. Application: ai.agrinexus.mapintel, versionCode 3682100. Testing used the user-created Test account; its password was not written into source, configuration, saved test fixtures or application storage.

## Passed

- Debug APK assembled and signature-verified; Android lint completed with no errors.
- Existing Mapping login authenticated Test and returned only its authorized Oban estate. All checked grants were view-only.
- Direct device downloads loaded the real Oban map and production API responses. The native map rendered and both branding images loaded.
- Map, Production and Analytics navigation appeared; Time machine, IoT Movement and the Offline bottom tab were absent.
- Production and Analytics opened after restarting the app offline under the remembered Test session.
- With airplane mode left on and Wi-Fi disabled, the active default network was none; the saved estate mosaic reported imageStatus=ready after a cold start. No login prompt was required.
- GPS returned a real current fix online at approximately 100 m reported accuracy, and subsequently an offline fix at approximately 2 m. Coordinates were not printed in test reports. These are device-reported accuracy estimates, not survey accuracy.
- Header/content bounds were separate: native header bottom 215.266674 CSS px and content top 215.266678 CSS px. The corrected content no longer overlaps the branding/status area.
- Browser mockup runtime integrity, TypeScript and production/offline build passed. Browser keypad closed after Enter/actions; screen scroll reset fixed the earlier shifted-keypad rendering. Local preview reload with its server stopped succeeded.
- Six isolated MongoDB authentication tests passed: origin protection; alternate configured origin; hashed private cookies/logout/expiry; disabled-account/current scope; throttling; optional remembered sessions including 30-day renewal and rejection after expiry, disablement or revocation.
- The canonical-host routing smoke check passed for the older React Native scaffold. Its Jest runner was unavailable locally; this does not affect the self-contained installed Android app.

## Limitations / pending acceptance

The external nearby-location map download could not be confirmed complete because the phone had no active network during the final location test. The current fix and saved Oban map worked offline. The app contains the bounded online downloader, attribution, local persistence and explicit failure handling, but this download should be checked with a stable network before treating it as accepted.

Screenshots of the actual application are intentionally protected. Device verification used a separate instrumentation APK and DOM/layout measurements; the local browser preview contains review imagery and is not presented as a capture of the authenticated phone screen.

## Server publication

Approved by the user in this chat. Target: Malaysia 76.13.218.53 only. Current release link was verified as /home/deploy_mapping/app/releases/20261101-estate-excel. The live auth file matched the repository baseline before the additive update.

Before SHA-256: 0eb9004f4640ba64fad11a2b5ae3f1126daa993b3792fed6ea952232464d3bf8.
After SHA-256: 2e47107b9d3f29b33e867ccd39588c1953be4237fd611124652eea51fc4aa224.
Rollback source: /home/deploy_mapping/backups/20261117-mapintel-remembered-session/session-auth.before.js.

Only digitalpalm-mapping.service was restarted. Canonical HTTPS /api/EstateAtlas/health returned status ok and mapping-session authentication afterward. MongoDB, private environment, persistent data and existing session records were preserved. India was not contacted or changed.

## Shared package

File: outputs/mapintel-android-20261117/MapIntel-36.82.100.apk. SHA-256: 9f79ce34ff534232d7f48600ba87782d0cf31e62dfd1055905aa472fc2b0bd05. Signature verification passed. The phone disconnected after the successful final installation and offline Production/Analytics checks; no later installed-file hash comparison was possible.
