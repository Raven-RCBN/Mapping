# OBAN vehicle details — 2025

Open Data tables → Vehicle details with **Oban Nigeria** selected. Views: Vehicles, Transactions, Parts & materials and Activity usage. Filters: year, vehicle, month, category and text. Totals cover every matching row, not just the current page. Vehicle names open their transactions; Details preserves employee, original expense type, description, quantity, quoted unit price and source notes.

## Scope and controls

- Estate: `f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae` (OBAN only).
- HTS company: JB FARMS OBAN; branch: PLANTATION; period: 2025-01-01–2025-12-31.
- 77 vehicle/equipment groups, 1,038 transaction lines, NGN 23,001,086.50.
- All 77 transaction subtotals reconcile to copied report headers. Screenshots independently confirm 73 headers; groups 18 and 38–40 were absent from supplied screenshots.
- 334 zero-amount lines remain zero. Two source vehicle IDs are truncated and flagged. Identifiers, including placeholder numbers with leading zeros, remain strings.
- Raw report SHA-256: `aadbdea6305222db97f572e9329c265ffddbbf08b1693ec80f4def04809bb869`.

Categories are derived from descriptions: Fuel (Diesel and Petrol), Parts, Lubricants and fluids, Consumables and supplies, and Repairs and maintenance. Original descriptions remain authoritative. Quantities are only those stated in descriptions; units are separate and no can/tin/set-to-litre conversion is inferred. Costs are integer kobo.

## Database and future usage

- `MappingVehicle`: one estate-scoped vehicle identity with its source label and identifier.
- `MappingVehicleImport`: report scope, checksum, status and per-vehicle controls. Only completed imports appear in the UI.
- `MappingVehicleTransaction`: one source transaction line with vehicle, date, reference, classification, quantity and amount. References may repeat and are not used alone for deduplication.
- `MappingVehicleUsage`: separate ledger for a vehicle, date and activity. Fields include task, activity code/description/link, block code, running hours, kilometres, start/end hour-meter and odometer readings, source reference and note. At least hours or kilometres must be supplied; missing values are null. This ledger starts empty.

Usage is not repeated onto costs. No fuel-to-hours conversion, block allocation, GPS placement, cost-per-hour or cost-per-km calculation is added. Later usage imports must validate vehicle and activity estate membership. The current API provides reads only; usage entry/import and map analysis rules will follow when supplied.

## Import and access

`scripts/deploy/import-oban-vehicles.mjs <organized-json>` is a dry run; `--apply` applies the validated import. It requires the sibling `vehicle-report-clipboard.txt` to match the checksum. The adapter rejects other estates, companies, branches, periods, counts or totals. Existing rows must match before writing. Re-running the same import adds no duplicates; a changed report requires explicit reconciliation.

Authenticated routes: `GET /api/EstateAtlas/vehicles/meta` and `GET /api/EstateAtlas/vehicles`, with an authorized `estateId`. The latter supports `view=vehicles|transactions|items|usage`, `year`, `vehicleId`, `month`, `category`, `subcategory`, `q` and zero-based `page`. Access uses existing Mapping permissions. Offline and combined-estate selections require choosing one estate online.

Sources are private under `DATA_DIR/estates/<OBAN estate ID>/vehicle-imports/2025-20261017/`, never frontend assets. All four collections and estate-folder sources are included in future full estate archives.

## Verification

The API suite passes 74 tests and the shared suite passes 78 tests. Vehicle coverage includes reconciliation, OBAN isolation, idempotency, conflicting imports, incomplete-import visibility, filtering, pagination, parts/units and usage validation. The production frontend build passes. Browser acceptance uses a disposable local database loaded from the same source, including vehicle drill-down and switching views.

## Live release — 17 October 2026

- Published: `https://mapintel.agrinexus.ai/?view=data&tab=vehicles`.
- API release: `/home/deploy_mapping/app/releases/20261017-oban-vehicles-2025`.
- Previous release: `/home/deploy_mapping/app/releases/20261017-oban-ai-schema-fix`. Its server-specific origins and AI implementation were preserved.
- Backup: `/home/deploy_mapping/backups/20261017-oban-vehicles-2025` (OBAN metadata, estate files, frontend entry points and prior API pointer; approximately 1.7 GB).
- Import ID: `vi-aa20ea80f973eea8d2c862b42bd4c595bbfb81b3`.
- Release archive SHA-256: `2c5e0447680ea20f769f10f2b79c9af092ebb5ee04f6cd0d1428d0abd726582b`.
- Published HTML SHA-256: `27b3b29b51c050221837d27c16c1a6d0ebbbb540335aebc7db22b168c7862973`.

Live database verification confirmed all 77 per-vehicle controls, 1,038 lines and the exact NGN total. Reapplying added zero rows. No vehicle records were added to other estates; all prior OBAN collection digests and other-estate counts remained unchanged. The activity usage collection has zero records. Read-only route checks against production data confirmed vehicle totals, ten Diesel lines totalling NGN 301,000 and null hours/km. These checks used a temporary loopback listener and did not change production authentication.

Public health and frontend hashes passed; unauthenticated vehicle reads return 401. The published page renders its existing sign-in screen. Authenticated interaction was verified in the separate local preview, which was stopped and its test database removed afterwards. The seven API hashes are recorded in `vehicle-source-manifest-20261017.json`.

Rollback must retain the imported records and newer edits: switch the API pointer to the prior release and restore only the saved frontend entry points if required. Do not restore the pre-import database snapshot over later work. Old hashed frontend assets remain available.
