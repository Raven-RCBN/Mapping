# Estate GIS imports

The web and native selectors choose one estate. Switching estates resets map filters, block selection, popups, comparison imagery and pending map results. Data, storage, sources and offline packages use that same estate ID. Saved older multi-estate selections migrate to the first authorised estate.

Oban preparation uses the supplied `Oban_All_Blocking_Old_2/Oban_All_Blocking.geojson`. It identifies planting areas by a four-digit planting year or `RO Planting`, and groups only identical block IDs. The two F8+F9A polygon parts become one multipart block; forest and other land uses remain separate. It preserves the estate ID and its configured area. GIS polygon area is stored per block and is not a replacement for the estate's configured area. No harvesting or activity records are generated.

Run the preparation scripts with QGIS's Python using `scripts/qgis/run-python.sh`:

1. `scripts/prepare-oban-gis.py PRIVATE_ESTATE_FOLDER EXISTING_ESTATE_ID`
2. `scripts/acquire-monthly-imagery.py PRIVATE_ESTATE_FOLDER`
3. `scripts/prepare-oban-terrain.py PRIVATE_ESTATE_FOLDER EXISTING_ESTATE_ID`
4. `scripts/qgis/build-oban-project.py PRIVATE_ESTATE_FOLDER EXISTING_ESTATE_ID`
5. `python3 scripts/package-estate-gis.py PRIVATE_ESTATE_FOLDER`

The preparation folder needs the original files under `source/`, a saved Earth Search catalogue response, and `import-config.json` containing the WGS84 crop bounds, processing EPSG and relative boundary filename. The archive script retains real acquisition dates and selects among up to six candidate scenes per month using local Sentinel-2 scene-classification pixels. Some monthly images are cloudy; cloud and shadow percentages are estimates, not guarantees of visual clarity. Terrain is the Copernicus GLO-30 surface model in EGM2008 heights, not a surveyed bare-earth DTM.

Deploy the private payload as `current/gis-import.json`, and its files under `data/estates/<estateId>/`. The startup importer validates all record scopes and file hashes before writes, backs up the original estate metadata, and is idempotent. It refuses replacement of an existing unrelated boundary/block import. The source GeoJSON, raster files and import payload stay outside Git. Asset endpoints enforce estate access; no public filesystem alias is used. Retention controls cover registered imagery assets; originals, scientific rasters, source catalogues and QGIS packages are retained separately and are not automatically purged.

Vector assets expose a `layerType` and feature count. River areas/waterways, road areas/routes, buildings, points of interest and non-planting land use have separate switches. Browser and native offline manifests include the vector JSON. The portable QGIS/QField project contains local terrain, GIS layers, the latest satellite crop and an empty field collection layer; web/native archives retain the dated imagery history. Import dates are not represented as survey or satellite capture dates.
