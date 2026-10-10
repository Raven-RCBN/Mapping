# Oban production data and future integrations

The workbook is imported into persistent MongoDB collections. The dashboard reads the API; it does not read a bundled spreadsheet or browser-only data. Only the monthly summaries and `Yearly 2026` source history are imported. Daily sheets are excluded.

## Tables and identities

| Data menu view | Stored collection/model | Grain and protection |
| --- | --- | --- |
| Block-name history | MappingProductionName | One source name + planting group per estate. Stable ID; original name/group immutable. Current map link can be reviewed with revision history. |
| Monthly production | MappingMonthlyProduction | One estate + source-block ID + YYYY-MM, enforced by a unique database index. |
| Monthly parameters | MappingMonthlyProduction | A second view of the same monthly row, so palm counts, area and production cannot become detached or duplicated. |
| Yearly source totals | MappingYearlyProduction | One estate + source-block ID + year, enforced by a unique index. Independent of monthly records. |

Monthly rows store MT, bunches, palms, GPS/effective hectares, the actual yield-area denominator, source ABW/yield, optional source bunches per hectare/palm, harvesting days, planting year, receipt status and notes. Null means unavailable; zero is retained as zero. Computed ratios are returned separately from workbook-supplied ratios. GIS parameters remain in the existing Block collection, never overwritten by workbook counts.

Source provenance includes system/key, workbook filename and SHA-256, sheet, row and cell references. Records also retain revision, editor, timestamps and previous saved values. Dashboard/API queries omit audit payloads; a history endpoint returns monthly edits.

## Data entry and imports

Admin/manager users can add or edit monthly and annual rows in Data. Monthly parameters use the same form and validation. A new source name can be added before entering its production. Renaming an existing source identity is rejected to protect historical reporting; create another identity and link it to the same map polygon instead.

The monthly JSON upload has a preview, downloadable template, validation and explicit apply. It is insert-only: repeating an upload does not duplicate rows or overwrite a user's corrections. Corrections to an existing period use Edit/PATCH with its current revision. Concurrent stale edits return HTTP 409. New periods require no schema changes.

An external source can transform its columns into the same JSON contract, using the existing authenticated Mapping API and estate permissions. An adapter/scheduled connector for a particular external system still needs configuration; the storage and write endpoints already exist.

Base path: `/api/EstateAtlas`. Writes require `Content-Type: application/json` and `X-Mapping-Client: 1`. The existing Mapping login/session and write-role requirements apply; integrations must not write directly to MongoDB or bypass estate access checks.

| Method / endpoint | Purpose |
| --- | --- |
| GET `/production/meta?estateId=…` | Source IDs/map links and available monthly periods |
| GET `/production/monthly?estateId=…&month=2026-07` | Paginated monthly rows; also supports year, sourceBlockId, mapBlockCode, search and mapped/unmapped/differences filters |
| POST `/production/monthly` | Add one validated monthly record |
| PATCH `/production/monthly/:id` | Edit with optimistic revision check and saved history |
| GET `/production/monthly/:id/history?estateId=…` | Previous saved values |
| POST `/production/import` | Preview/apply up to 5,000 monthly rows; repeatable insert-only operation |
| POST/PATCH `/production/names[/:id]` | Add original identity or revise current map link |
| GET/POST/PATCH `/production/yearly[/:id]` | Read/add/edit independent annual source records |

Example monthly upload body (use a real sourceBlockId returned by meta):

```json
{
  "estateId": "f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae",
  "preview": true,
  "records": [{
    "sourceBlockId": "source-id-from-meta",
    "month": "2026-08",
    "receiptStatus": "received",
    "mt": 12.5,
    "bunches": 1000,
    "workbookPalms": 1500,
    "gpsHa": 11.2,
    "effectiveHa": 10.5,
    "yieldAreaHa": 10.5,
    "sourceSystem": "external-system",
    "sourceKey": "external-row-id"
  }]
}
```

For a single POST/PATCH use `record` rather than `records`; PATCH also requires `revision`. Annual records additionally require numeric `year` and `periodLabel`, with `month` indicating the reporting-through month in that year. Missing optional numerics remain null. `receiptStatus: not_received` permits only null/zero production.

## Mapping and reporting rules

- F08 and F09A link separately to F8+F9A; G08 and G07A link separately to G8+G7A. No sums or merged source records. Shared-polygon palm counts are labelled non-comparable.
- Confirmed RO G01/G02 links use G1A/G2A. 2022 D1A–D5A use D-1–D-5; 2022 E4/E5 use E-4/E-5. 2017 E04/E05 use E4/E5.
- Unmapped identities remain available in the Unmapped filter and are excluded from map-block production. Matching uses source planting group as well as the name.
- Observed first/last periods are source coverage, not claimed dates of renaming. A20's source group changes remain distinct.
- August–December 2026 retain source zeros with `not_received`; charts show gaps, not zero production. Annual 2026 is Jan–Jul YTD.
- 2017 OP Jan–Apr MT is only supplied as one combined amount. Individual monthly MT stays null and the combined amount is retained in notes; annual source totals preserve the supplied total.
- Different palm counts are highlighted, not reconciled by overwriting. Effective-area changes and missing denominators are flagged; derived ratios require a usable denominator.
- Updating monthly production does not silently rewrite annual source totals.

## Import validation

Initial extraction: 293 source identities, 22,788 monthly rows and 1,880 annual source rows. For July 2026, 236 source records link to 234 mapped polygons and 18 remain unmapped. 2026 workbook MT reconciles to 28,871.27, including 28,550.21 on confirmed mapped blocks.

All 3,796 numeric row totals available in the monthly summaries (MT and bunches across 2017–2026) reconcile with extracted monthly values; 2017 combined OP MT is checked as supplied, without allocating it. Tests cover persistent edits, stale revision rejection, permissions, repeat imports, historical-name protection, annual/monthly independence, separate shared-polygon series and missing-versus-zero chart values.

The initial importer validates source rows before writing, makes a private backup of existing estate/blocks/production collections, writes only missing records and verifies map boundaries/block counts are unchanged. Workbook payloads and backups stay outside the public web root and Git.

## Live verification — 10 October 2026

Deployed release: `20261010-oban-production-v1` on the independent Mapping service. The three production collections contain 293 / 22,788 / 1,880 rows respectively, and every imported field was read back and compared with the validated payload. All three unique identity indexes exist. Map boundaries and GIS block counts are unchanged. The private import backup is under Mapping's `data/production-imports`; the prior app and web build are retained for rollback.

July 2026 returns 236 mapped source records, 18 unmapped records and 83 palm discrepancies against the saved GIS block counts. The 1,270 August–December rows are all not received: 1,235 preserve source zeros and 35 preserve source blanks. Both are excluded from received-production chart points.

Verification: 68 automated tests passed; annual reporting-through updates were additionally checked. The final production frontend build was browser-tested against an isolated local preview, including clicking F7 on the map, independent shared-block series, historical labels, table navigation and entry controls. The live public health endpoint is healthy and the production API rejects unauthenticated reads. An authenticated live UI session was not available in the testing browser; it correctly shows the existing sign-in screen.

The subsequent frontend release `20261010-dashboard-tabs-v1` separates the area below the map into Production and Operations tabs. Production opens by default and retains its selections while Operations displays the estate timeline. Time machine/history links activate Operations. The build, keyboard switching, selected-block data, preserved chart selections and history navigation were verified in the browser; the published index/assets and live API health were checked after deployment.
