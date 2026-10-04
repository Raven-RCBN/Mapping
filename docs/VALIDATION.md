# Verified locally · 4 October 2026

- Web: normal `pnpm build` completed successfully.
- API/shared logic: 9 tests passed, including persistent upload retrieval after creating a fresh API instance, file checksums, offline inclusion, invalid-file cleanup, estate isolation and calendar filtering.
- Mobile: TypeScript passed; 3 offline-package tests passed (checksum failure preserves the last package, successful replacement, hosting URL validation).
- Android: `assembleDebug` and `assembleFieldPreview -PreactNativeArchitectures=arm64-v8a` passed. The standalone preview contains a Hermes application bundle and offline map viewer. Preview APK is a local output, excluded from Git.
- QGIS Server 3.44.15: the authorised API returned a rendered 400 × 600 PNG from the saved estate project. Elevation, contours and activity markers were checked in the dashboard.
- Browser offline: downloaded 29 map files, stopped the Express API completely, reloaded the page and confirmed the full dashboard, imagery, timeline and terrain rendered from the saved package. Fixed a `Vary: Origin` cache mismatch discovered in this test.
- Activity marker clicks open the corresponding record. Ordinary terrain clicks inspect elevation without an activity dialog.
- Mobile viewer: inspected the identical bundled viewer with downloaded local image files at 390 × 844, including terrain and timeline controls.
- Docker Compose configuration validated. The standalone Compose configuration is available; the AgriNexus deployment uses the host integration below.

Physical Android device testing and iOS compilation remain outstanding. This Mac has no Xcode installation. AgriNexus activity synchronization, acquisition scheduling and QField synchronization still require their API contracts.


## AgriNexus deployment · 4 October 2026

- `/EstateAtlas` redirects to `/EstateAtlas/` with capitalization preserved; HTML, hashed assets, manifest and service worker return successfully over HTTPS.
- Existing frontend files were checksum-verified unchanged, including the HTML served by `/mapping`. The existing `/api/health` remains healthy.
- API/shared tests: 11 passed, including hosted namespaces and host-verified authentication with non-root estate grants.
- Production subpath build and asset/manifest/worker scope assertions passed. Native TypeScript and offline-package tests passed.
- Approved initial import: 1 estate, 30 file-backed map assets (24 imagery dates, 5 terrain assets, 1 QGIS package), 42 activities. Every stored asset checksum was verified before insertion.
- QGIS 3.44.14 Python engine rendered a 400 × 480 PNG on the host from the estate project. The application limits rendering concurrency and retains offline terrain exports.
- Anonymous `/api/EstateAtlas/snapshot` returns HTTP 401. Existing AgriNexus signed sessions are required.

- Live signed-in browser verification passed using the user's existing AgriNexus session: Sungai Gumut boundaries, imagery, timeline and activities loaded. QGIS topography rendered without a fallback error. Offline download completed with all 29 files checksum-verified.
