# Verified locally · 4 October 2026

- Web: normal `pnpm build` completed successfully.
- API/shared logic: 9 tests passed, including persistent upload retrieval after creating a fresh API instance, file checksums, offline inclusion, invalid-file cleanup, estate isolation and calendar filtering.
- Mobile: TypeScript passed; 3 offline-package tests passed (checksum failure preserves the last package, successful replacement, hosting URL validation).
- Android: `assembleDebug` and `assembleFieldPreview -PreactNativeArchitectures=arm64-v8a` passed. The standalone preview contains a Hermes application bundle and offline map viewer. Preview APK is a local output, excluded from Git.
- QGIS Server 3.44.15: the authorised API returned a rendered 400 × 600 PNG from the saved estate project. Elevation, contours and activity markers were checked in the dashboard.
- Browser offline: downloaded 29 map files, stopped the Express API completely, reloaded the page and confirmed the full dashboard, imagery, timeline and terrain rendered from the saved package. Fixed a `Vary: Origin` cache mismatch discovered in this test.
- Activity marker clicks open the corresponding record. Ordinary terrain clicks inspect elevation without an activity dialog.
- Mobile viewer: inspected the identical bundled viewer with downloaded local image files at 390 × 844, including terrain and timeline controls.
- Docker Compose configuration validated. Production hosting has not been deployed.

Physical Android device testing and iOS compilation remain outstanding. This Mac has no Xcode installation. Production DigitalPalm login, AgriNexus synchronization, acquisition scheduling and QField synchronization require their hosting/identity/API contracts; none are represented as live connections.
