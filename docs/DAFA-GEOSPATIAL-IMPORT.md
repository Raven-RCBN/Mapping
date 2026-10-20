# DAFA geospatial sources and report workspace

The Geospatial Analysis tab follows Decision Support. It is gated by the estate's Map and Geospatial Analysis view permissions. Admin retains access automatically. Report queries and files are estate scoped; table pages are bounded at 25/50/100 rows with stable ordering. Survey reports and rows are included in estate archives.

## Source separation

The supplied October 2026 boundary table defines 39 current block/land-use records totalling 2,378.15 ha. The replanting table contains 47 source rows, retained as structured `Block.replantingPlans`, including duplicate labels and future plans. GIS area is not automatically treated as planted area.

The report dated October 2026 uses imagery from 24 August 2025. Its 36 area records, 14 mature-field inventories and six growth classes are stored in `MappingGeospatialReport` / `MappingGeospatialRow`. Historical survey areas remain separate from the current block master. Unassessed palm counts are null. The combined “00, 01 & 04” record remains unallocated; no palm counts were divided among new blocks.

Original PDFs, source checksums, extracted linework and compressed palm-symbol coordinates are stored under DAFA's private estate import folder, not Git or public static assets. The source report can be downloaded through an authenticated estate-scoped endpoint.

## Map interpretation

The October 2026 raster provides current drawn boundaries. Its 39 label centres provide approximate selectable map positions, explicitly marked as such; these are not surveyed polygons. Current-map export consequently contains points. Historical source-map linework is retained separately and is not substituted for current geometry.

Georeferenced report overlays show palm growth, palm growth over imagery, current block map and replanting plan. Current block links retain the source name and alias review notes. Density markers use report categories. Growth markers use the computed Poor + Very Poor percentage with display bands below 15%, 15–below 30%, and 30% or more; these bands are display choices, not report diagnoses. Only the current results page is highlighted. Source overlay palm colours retain their original meaning.

## Reconciliation flags

- Source report inventory: 107,507 palms. Standalone PDF circular symbols: 106,509; source colour counts differ slightly from report classes. The report totals are retained, and the map is not presented as a reconciled census.
- Survey and current areas differ; dates and both values are retained.
- Historical `-L` names are linked to corresponding current names provisionally, with review flags.
- Report prose refers once to Abadi Estate despite DAFA title/tables.
- Current 19-C1 is Pandan coconut; report groups it with young mature fields.
- Future plan totals differ by 0.01 ha for 05-B1 and Forest; duplicate plan labels, clipped material type, and Reserved/DxP differences are preserved.

## Import safety

`scripts/import-dafa-survey.mjs` validates the existing DAFA identity, empty target collections, all model records and source checksums before writing. It saves the previous estate document on the data host, scopes every write to DAFA, rolls back inserted IDs on failure, and writes a checksum receipt. Repeating a completed identical import is a no-op. A nonempty target requires reconciliation rather than replacement.

## Annual mapping history

The timeline includes reference-map capture and upload events separately. A survey-history section lists imagery date, report month, current block-map date, upload date, source documents and a suggested annual survey target. The target is based on the imagery date (24 August 2025 → 24 August 2026), not a claim that another survey was booked or completed. Each future survey has a distinct report ID; old report files and survey rows remain available in the dropdown.
