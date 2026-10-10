# Oban wages and map-area allocation

## Source and reconciliation

The authorised source is `Yearly Wages Activities 2025_FINAL.xlsx`: the last sheet `Wages 2025` plus Jan–Dec classification sheets, inspected with owner approval. Currency is NGN, confirmed by the owner. The source contains division/planting-group costs, not individual block numbers. The monthly `S/N` is a source row serial, not a stable task code; keep the task name and activity alongside it.

The importer retains 3,844 monthly source rows and 2,669 annual division/task/activity cells (157 activities × 17 divisions, including explicit zero cells). Subtotals and grand totals are reconciliation controls, never imported as additional costs. All monthly totals, annual row/column totals, and all 2,669 annual cells reconcile at kobo precision. Both source bases reconcile to the workbook grand total. They must never be added together.

## Allocation rule approved by the owner

Use **map GIS hectares for every block**, replacing the earlier proposed effective/GPS-area basis.

1. For the selected period, task/S/N and activity, divide division wages by the sum of the division's mapped polygon hectares.
2. Multiply that activity rate by the selected block's map hectares.
3. Label results as **area-allocated estimates**, separate from explicitly recorded block wages.

Each polygon occurs once, including shared `F8+F9A` and `G8+G7A` polygons. Production source histories remain unchanged. Wages and allocation areas are separate collections; calculated block estimates are not persisted as actual wage records. Integer kobo and deterministic largest-remainder rounding ensure that every allocated source record reconciles exactly to its division cost. Area weights use ten decimal places of hectares. Rates displayed to four decimals are presentation values, not the calculation inputs.

The initial 2025 snapshot uses current map `gisAreaHa` (not workbook GPS/effective area). It does not claim that current GIS boundaries are historical 2025 boundaries. Map division is used; B12's missing division is supplied by its unambiguous 2025 production group, 2017. H11, M6 and N6 have no confirmed division and remain flagged `DIVISION NOT SET`. Their areas are excluded until assigned. Unmapped production blocks have no polygon area and are excluded from this explicitly map-based denominator; this allocates the full applicable division cost among its mapped blocks, not measured actual block costs.

Initial allocation covers 236 mapped polygons with assigned divisions. Other costs remain unallocated across 2025 planting, MAIN-NURSERY, PRE-NURSERY, MILL, ADMIN, OLD and UNASSIGNED groups. DMC has zero cost and no mapped allocation. Do not invent division links for these groups.

## Persistent tables and editing

- `mappingwages`: estate, basis (`monthly` or `annual_summary`), period, division, task, activity, source serial, optional original/map block numbers, currency, `amountMinor` (integer kobo), immutable source system/key, file/hash/sheet/row/cell provenance, revision and previous-value history.
- `mappingwageareas`: estate, reporting year, unique map block, division, GIS hectares snapshot, GIS source/survey metadata, revision and history. One row per estate/year/polygon prevents shared-polygon duplication. Saving an area assignment refreshes its hectares from the map block table. It never edits map geometry or production records.

Data → Wages has monthly wages, annual summaries and allocation-area views. Admins/managers can add and edit records; viewers cannot write. Original wage identities are immutable after creation; amount, notes and explicit map links may be corrected with optimistic revision checks and audit history. Annual summaries stay independent of monthly corrections. New annual area snapshots can be added using existing map blocks. Correct the source map inventory first if a GIS area is wrong.

## Integration contract

All routes are under `/api/EstateAtlas`, use existing authentication, estate permissions and `X-Mapping-Client: 1` for writes. Currency currently supports NGN only. Monetary values use integer kobo: NGN 2,700 = `270000`.

- `GET /wages?estateId=…&year=2025&basis=monthly`: paged source rows, filtered totals, task/month summaries. `basis=annual_summary` selects independent annual data. Optional division/task/mapBlockCode/search/match filters. No combined-basis total.
- `GET /wages/meta?estateId=…&year=2025`: available years, groups, tasks and map blocks.
- `POST /wages`: `{estateId, record}` creates a source record.
- `PATCH /wages/:id`: `{estateId, revision, record}` corrects a record; stale revision returns 409.
- `GET /wages/:id/history?estateId=…`: previous versions.
- `POST /wages/import`: `{estateId, records, preview:true}` validates up to 5,000 rows and reports new/existing counts. `preview:false` inserts only new keys. Re-imports preserve manual corrections. An integration updates existing records through revision-controlled PATCH, not blind replacement. A source must keep its `(sourceSystem, sourceKey)` stable across uploads; use upstream record IDs. The initial workbook uses sheet/cell identifiers for its fixed source snapshot.
- `GET /wages/areas?estateId=…&year=2025`: allocation snapshots.
- `POST /wages/areas`: `{estateId, record:{year,mapBlockCode,division,note}}` loads map GIS area and creates a unique annual snapshot.
- `PATCH /wages/areas/:id`: `{estateId,revision,record:{division,note}}` updates assignment and refreshes current GIS hectares, with history.
- `GET /wages/allocation?estateId=…&year=2025&basis=monthly&mapBlockCode=G4`: computed costs, source S/N, task, activity, `rateMinorPerHa`, block/division hectares, coverage warnings, monthly/task summaries and paged activity rows. Omit block for estate coverage. Actual block-linked costs are excluded from estimates and accessed through `/wages?match=mapped`.

Example monthly integration record:

```json
{"basis":"monthly","period":"2025-01","division":"RO","task":"UPKEEP","activity":"PRUNING","sourceSerial":"7","sourceBlockCode":null,"mapBlockCode":null,"amountMinor":270000,"currency":"NGN","sourceSystem":"payroll","sourceKey":"unique-upstream-record-id","note":""}
```

For actual block wages, supply both the original block code and a verified map block. Keep their source keys distinct from division summary records. Do not submit an allocation as actual block wages.

## Import and checks

`scripts/prepare-oban-wages.py` reads the workbook, validates totals and writes a private ignored JSON payload. `scripts/deploy/import-oban-wages.mjs` supports `--validate`, default dry-run and `--apply`; apply backs up the existing wage tables and source payload in the private data directory, inserts only new records, and asserts unchanged map geometry/block counts. It verifies that the initial area snapshots equal the live map inventory before importing.

Tests cover task/activity rates, exact kobo reconciliation, negative adjustments, separate periods/serials, missing-area handling, actual/estimated separation, annual/monthly separation, idempotent imports, audit/revision checks, polygon uniqueness, map-area refresh and estate/write access controls.
