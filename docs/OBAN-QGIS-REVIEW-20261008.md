# Oban supplied QGIS archive review — 8 October 2026

Reviewed `OBAN QGIS.zip` against the existing Oban estate import. Archive modification dates are not survey or image acquisition dates. Private source data and generated imagery remain outside Git.

## Confirmed differences

- Existing 239 planting block geometries are unchanged. Geometry comparisons ignore equivalent ring orientation and multipart encoding. Existing buildings (878), POIs (162), river areas (6), waterways (282), road areas (211), and routes (501) have zero Hausdorff geometry distance from the archive versions.
- `Oban_Road_Polyline2` is an exact duplicate of an existing government-road feature. Do not add another copy.
- G13B, G15B and H4B add three block-detail records, but their shapefile geometries are null. Their map links remain empty; do not invent polygons or activity locations. There are 242 block-table records and 239 mapped blocks.
- G8+G7A has planting year 1981 in this archive, replacing the prior value 1988.
- Source GPS area and the raw `LYr_Yield` / `2Yr_Yield` values are available. The archive does not define their units or reporting periods; the UI labels this explicitly. They do not contribute to current harvesting or activity totals. Duplicate polygon-part rows are not summed into yield values.

## Reference mosaic

`Oban_Merge_jp2_v1.jp2` contains a 73,159 × 66,296, four-band georeferenced image in WGS84. Its pixel spacing is 0.0000015 degrees (roughly 0.17 m here), which describes the raster grid, not independently verified survey accuracy or optical resolution. Neither a capture date nor a provider is present in the raster metadata.

A 4096 × 3712 WebP overview (approximately 3 m pixels, 3.3 MB) is available through the authenticated asset endpoint and browser offline package. Select **Estate mosaic** in Map layers. It is a `reference-image`, independent of timeline dates, and does not replace dated Sentinel-2 imagery. Road map remains the initial view. Switching estates clears the mosaic selection.

The original 2.1 GB JP2 and the supplied 1.48 GB CarryMap package remain in the user's original archive. The web overview is a derivative, not a full-resolution copy. The archive's Google XYZ connection is not enabled or downloaded by this import. No new elevation survey was found.

## Apply and recovery

The private reviewed payload contains an exact pre-update block snapshot and new file hashes. `scripts/deploy/apply-reviewed-block-update.mjs` defaults to dry-run and requires the private service environment. It checks estate identity, unchanged live records, allowed fields, new record identities and image checksum before any database writes. `--apply` stores a mode-0600 backup in the private data folder and uses conditional updates. It never changes estate geometry or activity records. This is a one-time reviewed import; rerunning after success refuses the now-changed snapshot. If interrupted, review the backup and partial progress before proceeding.

Keep the new reference file under the estate's private `reference/20261008` directory. Existing dated-image retention rules do not automatically purge reference imagery.
