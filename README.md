# DigitalPalm Estate Atlas

A React mapping workspace with QGIS terrain publishing, dated imagery, multi-estate activity timelines, permanent image uploads and a React Native offline map viewer. This repository contains application source only; estate imagery, GIS packages and credentials stay outside Git.

## Stack

Matches the neighbouring DigitalPalm projects: React 19 / Vite / Redux Toolkit / React Router / Axios; Node.js / Express 5 / Mongoose 8 / MongoDB; React Native 0.83 with TypeScript, native filesystem storage and network status. QGIS 3.44 LTR prepares and publishes terrain. OpenLayers renders QGIS WMS and saved image exports in the browser and mobile viewer. There is no Leaflet dependency.

## Local setup

Use Node 22 or 24 and pnpm 11.7.0.

```sh
pnpm install
cp .env.example .env
# Set MONGODB_URI to a dedicated mapping database.
pnpm build
pnpm start
# http://127.0.0.1:4180
```

For hot reload, use `pnpm dev` (Vite on 5177, API on 4180). Development authentication permits loopback requests only. It must not be used for hosted access.

### Existing Estate Atlas data

From the repository root, with the original `estate-atlas` folder alongside this checkout:

```sh
scripts/qgis/run-python.sh scripts/qgis/prepare.py ../estate-atlas/gis/sg-gumut data/estates/sg-gumut/qgis
pnpm import:atlas ../estate-atlas/dist
```

`run-python.sh` uses the installed macOS QGIS Python; on Linux run `prepare.py` using your QGIS Python environment. Import preserves the original files and copies assets into this application's `data/` folder. It imports existing activity records as provided; it does not connect to AgriNexus automatically.

### QGIS service

`docker compose up -d qgis` starts QGIS Server on loopback port **4191**. Set `QGIS_SERVER_URL=http://127.0.0.1:4191/ows/` and restart the API. In the dashboard choose **Topography**, then Elevation, Hillshade or Slope. The API authorises the estate and permits only bounded GetMap requests; the raw QGIS service should remain private. The saved raster exports remain available when disconnected.

The local QGIS service uses an offscreen entry point because the upstream image's Xvfb process detection stalls under this Mac's Intel emulation. The published project has relative paths and the map-service data mount is read-only.

### Permanent imports

**Import a map or image → choose estate → image, acquisition date and bounds → Save to estate folder.** PNG, JPEG and WebP are decoded and saved as PNG files under:

```
data/estates/<estate-id>/images/<asset-id>.png
```

MongoDB holds the path, checksum, bounds and dates, not image bytes. Reopening the app reloads these records and files. Uploaded images appear in the timeline and future offline packages. Keep a persistent disk mounted at `DATA_DIR`, and back up both that directory and MongoDB. Uploaded overlays need accurate geographic bounds; ordinary field photos are not automatically georeferenced.

## Offline mobile

```sh
pnpm mobile:viewer
pnpm --filter @mapping/mobile exec tsc --noEmit
pnpm --filter @mapping/mobile start
pnpm --filter @mapping/mobile android
```

See [mobile setup](docs/MOBILE.md). The native app downloads selected estates, verifies every file's SHA-256, writes the bundled viewer and map files into its documents folder, and switches to the new package only after all downloads succeed. Reopen **Saved estates → Open offline maps** without a network. Imagery dates, estate and activity filters, elevation, slope, hillshade and boundaries work locally. This app provides map viewing; QField packages remain available for field data collection.

The web dashboard also offers **Offline maps → Download selected estates** using a service worker and browser Cache Storage. Use HTTPS in production. Browser-managed copies can be evicted, especially in private mode; the native filesystem package is the preferred field option.

## Checks

```sh
# Requires an isolated MongoDB test database; test DB name must start MappingTest_.
MONGODB_TEST_URI=mongodb://127.0.0.1:27018/MappingTest_CI pnpm test
pnpm build
pnpm mobile:viewer
pnpm --filter @mapping/mobile exec tsc --noEmit
```

Tests cover image persistence, checksum retrieval after a fresh app instance, offline manifest inclusion, invalid upload cleanup, estate isolation, role enforcement and date filtering. Test fixtures and databases are isolated from the estate database.

## Hosting and DigitalPalm integration

Hosting has not been deployed. See [deployment](docs/DEPLOYMENT.md) for persistent volumes, QGIS, HTTPS and DigitalPalm JWT access. Scheduled acquisition and AgriNexus activity synchronisation are not running; source configuration is stored for that integration. No production credentials are included.

Terrain is Copernicus GLO-30 surface elevation, including vegetation, at approximately 30 m spacing. Ten-metre contours do not imply ten-metre survey accuracy. Retain the source attribution and obtain surveyed ground data for engineering work.


## Hosted Estate Atlas

Open [EstateAtlas](https://agrinexus.digitalpalm.ai/EstateAtlas/) using your AgriNexus sign-in. The existing `/mapping` page is preserved. Hosted assets and offline caches are scoped to `/EstateAtlas/`, and the isolated API is `/api/EstateAtlas`. See [deployment details](docs/DEPLOYMENT.md) for release, storage, QGIS and rollback information.
