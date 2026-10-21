# DAFA satellite reference history — 21 October 2026

Added 33 active dated Sentinel-2 images to the existing Time machine and comparison views, covering 23 October 2023 through 2 October 2026. The requested search interval was 21 October 2023–21 October 2026.

Source: Copernicus Sentinel-2 Collection 1 Level-2A, public Element 84 Earth Search STAC / AWS COG archive. No paid service or account was used. Native RGB spacing is 10 m; this is reference imagery, not palm-level or survey imagery.

The catalog returned 492 scene records. 198 estate-footprint candidates were assessed using the supplied 36 MapInfo polygons, including the combined context areas. For each month, candidates were evaluated by tile cloud cover and then ranked by valid estate coverage and estate cloud/shadow/snow from SCL classes 3,8,9,10,11. Processing stops when an acquisition has <=2% obscuration and >=99% valid coverage. Captures retain their actual dates; these are individual acquisitions, not composites.

Following the user's request to omit very cloudy images and avoid further extensive searching, the display cutoff is <=50% estimated estate cloud/shadow. Four dates are excluded from active timeline queries:

| Month | Capture | Estimated cloud/shadow |
| --- | --- | ---: |
| February 2024 | 2024-02-20 | 54.64% |
| August 2024 | 2024-08-23 | 92.19% |
| December 2024 | 2024-12-16 | 55.25% |
| February 2025 | 2025-02-09 | 98.98% |

Their original files remain private audit evidence; no substitute date or invented capture fills those months. Active image counts: 2023 = 3; 2024 = 9; 2025 = 11; 2026 = 10. Remaining cloud, haze, shadow and seasonal effects can still affect appearances.

All acquisition and processing took place directly on Malaysia. Private files: estate imports/sentinel-20261021, containing config, boundary, STAC search, source SCL crops, native GeoTIFF crops, per-image metadata/checksums, display PNG/WebP copies, history, import and cloud-filter receipts, preservation hashes and verification. The source profile is saved in Mapping Sources.

Display: WebP quality 85 at original pixel dimensions, georeferenced in EPSG:3857 with explicit WGS84 bounds. This reduces the active display files from 35,750,941 bytes to 2,838,970 bytes. Native GeoTIFF and PNG originals are retained. The map caption and image cards show the actual acquisition date, source, resolution and cloud/shadow estimate. Time machine uses only images captured on or before the selected date, unless the user explicitly selects an image.

Existing reference mosaic, block geometry, hectares, palm counts and all operational data remain unchanged. The user's forthcoming TIFF will be handled as the estate mosaic separately.

Reusable scripts:

- scripts/acquire-estate-imagery-catalog.py — public STAC catalog search from configured bounds/dates.
- scripts/acquire-monthly-imagery.py — ranged COG crop, SCL quality ranking, metadata and original image preparation.
- scripts/import-estate-imagery.mjs — checksum/schema preflight and additive imagery/source import with preservation evidence.
- scripts/prepare-estate-imagery-display.mjs — WebP reference copies; preserve native dimensions and originals.
- scripts/verify-estate-imagery.mjs — every active image's checksum and map query, annual timeline queries and existing-data preservation.

For another estate, verify its identity, supplied polygons, coordinate system, search dates and display cloud threshold first. Do not reuse DAFA's extent automatically. No automatic or scheduled search is configured.
