# DAFA zoomable TIFF mosaic — 21 October 2026

Updated the existing Estate mosaic asset (`dafa-current-block-map-20261015`) from the supplied `Dafa Image.tif`. Keeping the asset ID preserves existing links; its name and display files now describe the supplied GeoTIFF.

- Original: 2,356,791,022 bytes, 18,893 × 15,509 pixels, four UInt16 bands, EPSG:32649.
- Original SHA256: `d129a8f0b5ed071f7ce22ed415f0f1a5daa42b466a58e4102dd3ce5ee075d790`, verified after compressed resumable transfer directly from the user-supplied Mac file to Malaysia.
- Native pixel spacing: 0.550547 × 0.550812 m (approximately 0.55 m).
- Eight zoom levels, 6,074 tiles of 256 × 256 pixels. Tile pack: 108,162,856 bytes.
- Initial 2048px Web Mercator overview: WebP, 568,782 bytes.
- Actual capture date is unknown. Upload date is not used as an acquisition date.

Rendering uses RGB bands 1–3 without a contrast stretch; these contain 8-bit-range RGB values in UInt16 storage. The undefined fourth band remains in the original source. Common RGB background 1/1/1 becomes transparent. Lower zoom levels use average resampling; detailed tiles use WebP quality 90. The overview uses quality 85. The source TIFF is retained unchanged.

The geographic tile grid uses EPSG:4326. Bottom-up index rows and stored pixels follow the existing Mapping mosaic reader contract; decoded browser tiles are north-up. A synthetic red-north/blue-south test passed through the new writer and existing API reader. The completed real pack passed checksum validation, all tile index entries, sample tiles at coarse/intermediate/native levels, and mapped-estate extent coverage. The browser overview and zoomed imagery align with the supplied block boundaries.

Only the existing reference asset and a new source documentation record were updated. Hashes verified preservation of all other records across 32 Mapping collections, including block geometry, metric references, operational data and Sentinel-2 imagery. Previous mosaic files and its complete asset snapshot remain available for recovery.

Private Malaysia directory: estate `673eebaf-1532-4590-9957-537373f1928d`, `reference/tiff-20261021/`. It contains original TIFF, RGB VRT, aligned display raster/overviews, tile pack, browser overview, `mosaic.json`, `before-mosaic-update.json`, update receipt and preparation/application scripts. Source methods are also saved in the webapp Sources menu.

Reusable code: `scripts/mosaic/prepare-geotiff-mosaic.py`, `scripts/mosaic/apply-geotiff-mosaic.mjs`. This application script deliberately guards DAFA identity, source checksum and expected source metadata; review these before adapting it to another estate. No backend service restart or geometry/calculation migration was needed.
