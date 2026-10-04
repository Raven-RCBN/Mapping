# Estate workbook data

The SGE workbook is stored in three dedicated MongoDB collections: `EstateAtlasBlock`, `EstateAtlasHarvestingActivity`, and `EstateAtlasFieldActivity` models. Images and GIS files remain in the estate filesystem folder.

The Data tables sidebar menu opens `/EstateAtlas/?view=data`. It contains searchable, paginated grids for block details, harvesting and field activity. It is separate from map imagery/source management. Block information appears above the map; map bubbles open only records for their block/location and selected time/filter, with harvesting and field details kept separate.

## Import and cleaning

Run `scripts/import-sge-workbook.py <workbook.xlsx> .deploy/sge-import.json` using Python with openpyxl. It reads values without modifying the source workbook. Header names and dates are checked. Each imported row retains source filename, sheet, row and workbook SHA-256. The payload is private data and must not be committed.

At the user's request, rows with no block and exact duplicates across all worksheet data columns are excluded. The first occurrence of a duplicate is retained. Source-row references for removed records are preserved in the private import audit, not displayed as activity records.

For the provided workbook: 16 blocks, 885 harvesting records (136,439 bunches), 4,441 field records (11,297 mandays). Removed: one blank-block field record and 12 duplicate field rows. Harvest dates: 2024-10-04 through 2025-12-12; field dates: 2024-10-04 through 2026-09-30. Field-table entries called “Harvesters” remain field records measured in mandays.

`importWorkbook()` validates all rows before writing. Deterministic IDs and `$setOnInsert` make retries idempotent and preserve subsequent GPS/review edits. The deployment records a private checksum marker after counts are verified. Existing sample activities are retained in their original collection and excluded from the snapshot for an estate with an activated workbook import.

## Map links and GPS

Only unambiguous matches after ignoring spaces/underscores are linked automatically. Suffixes and hyphens are preserved. Seven block records match existing polygons. At the user's direction the nine unmatched IDs, including OP2016 and OP2018, remain unlocated pending confirmed matches; no group matching is inferred.

Both activity collections have nullable GeoJSON `geolocation`: `{"type":"Point","coordinates":[longitude,latitude],"accuracyMetres":5}` (accuracy optional). Imported GPS values are null. Map display uses a polygon interior point for a linked block, never writes that derived position as measured GPS, and leaves unmatched records visible in grids/history without inventing points. Valid GPS takes precedence over a block position.

Estate-scoped endpoints under `/api/EstateAtlas`:
- `GET /blocks`, `/harvesting`, `/field-activities`
- `POST /harvesting`, `/field-activities` for future dated records with optional GPS
- `PATCH /harvesting/:id/geolocation`, `/field-activities/:id/geolocation`
- `PATCH /blocks/:id/map-links` with confirmed `mapBlockNames` from that estate

Writes require manager/admin access and the existing mapping client header. Snapshot/offline packages include block details plus a read-only combined activity projection; the stored tables stay separate. Download a fresh offline package to include newly imported records. The web offline view includes the same grids. The native viewer source also supports the new records and GPS/block placement; releasing a rebuilt native app remains a separate distribution step.
