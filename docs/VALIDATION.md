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

## SGE workbook and separate data workspace — 4 October 2026

- Read source workbook without changing it. Cleaned import: 16 blocks, 885 harvesting rows, 4,441 field rows. Excluded one blank block and 12 exact duplicate field rows at the user's request. Totals verified: 136,439 bunches and 11,297 mandays.
- Seven unambiguous block links; nine remain pending, including the split OP2016/OP2018 identifiers. No GPS invented. The original workbook, employee data and private payload are excluded from Git.
- 17 API/shared tests pass: independent tables, idempotent imports, GPS validation and precedence, polygon interior placement, estate permissions, offline inclusion and date/description filters. Three native offline tests pass. Production Vite build, EstateAtlas subpath checks and native offline-viewer bundle pass.
- Browser checks: separate left-sidebar Data tables page; three grids; search and pagination; source columns and units; grid-to-block/history navigation; selected block details above map; click on DR2023 bubble shows only its three field records. Local desktop and live narrow-layout inspection completed.
- Published release: `/opt/digitalpalm/agrinexus/estate-atlas/releases/20261004T-SGE-data`. Backups: `/home/deploy_agrinexus/releases/EstateAtlas-before-SGE-data`. Import audit stored privately beside estate data.
- Live workbook import counts confirmed; authenticated Data tables and pagination checked. Parent frontend and host API entry checksums unchanged. `/mapping` HTML still hashes to `6ab26dae765e3029ef1bdefcb9da23cd6b0ddc9667a40c86611d86481f6de4fe`.
