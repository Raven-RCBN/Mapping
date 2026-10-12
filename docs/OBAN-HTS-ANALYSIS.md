# Oban HTS fertiliser and activity wages

This read-only snapshot analysis is separate from existing division wage tables and area-allocated block costs. No source workbooks, geometry, production records, or wage allocations are changed.

## Inputs and reproduction

Run from the repository root with Python/openpyxl:

```
python scripts/prepare-hts-analysis.py /Users/admin/Downloads data/hts-analysis/oban.json
```

Inputs: `2017-2025_Oban Fertiliser Summary by Divisions.xlsx` and `Monthly Wages Activity {2021..2025}_FINAL.xlsx`. The private JSON preserves file SHA-256, sheet/row lineage, period labels, reconciliation controls, original fertiliser units/weights and block links. Do not commit the JSON or workbooks. Regeneration reads sources without changing them and replaces only this analytical snapshot. Review changes before installing a new snapshot.

Install the snapshot at `<dataDir>/hts-analysis/f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae.json`. The API `GET /hts-analysis?estateId=…` uses existing authentication/estate permissions, checks the embedded estate ID, and returns private/no-store data. A missing snapshot produces an explicit unavailable response. No import/write route is added. The local preview uses `/private/tmp/oban-preview-assets/hts-analysis/`.

## Analysis views

Analytics → Annual block fertiliser: year 2017–2025, division, map block, product and quantity/bag-equivalent/quantity-per-mapped-ha controls. Fertiliser colours and the quantitative legend appear on the main estate map only. Click its polygons or a table block to inspect annual history; the block dropdown and main map share selection. Click a year bar to change year. The map remains the selected year/division overview; the block selection controls detail and annual history. Changing the measure does not reset the map extent. Leaving fertiliser analysis removes the thematic layer; existing yield/cost highlights and production palm warnings retain their own views. Shared polygon quantities are combined, its GIS area counted once. The legend rescales per selected year. Grey means no record, white means recorded zero. Missing/partial source quantities remain unknown.

The 1,165 source block-year records contain 9 products across 9 divisions; 1,044 records link through the existing division/block production crosswalk or exact map code plus matching division. 24 distinct division/block names remain unmatched. They are retained for source review/export but excluded from map totals. No guessed aliases were introduced. Historical quantities use current polygon areas, not reconstructed historic boundaries or treated hectares.

Unit basis is provisional: the workbook explicitly says quantities were converted to kg/L, but most sheets retain Bag labels and weight metadata lists 25 and 1 for two products. Numeric solids are provisionally taken as already-kg; no second multiplication is performed. User's 50 kg rule is shown as kg/50 bag equivalents, not original packages. Liquids stay in L. All-solid quantities exclude liquids; the source's mixed-unit Total/All-Years summaries are never imported. This status appears beside quantities and in source details.

Analytics → Monthly activity wages: 5,488 observed activity rows, 60 payroll periods (2021–2025), task/activity/month controls, cost/man-day charts, comparable annual totals (same month when selected), ranked activity breakdown and source detail/CSV. Selecting a monthly bar filters the breakdown; monthly overview remains a full-year context chart. Wages use integer kobo. Spend per reported man-day is a derived spending ratio, not the contractual rate. Rates and Points are preserved but never added across unlike activities. Source rows lack block IDs and covered hectares; this view does not allocate wages or imply block work completion. It includes all source tasks, including non-field work, and must not be added to existing allocated division costs.

## Validation

The preparer asserts 12 distinct periods per year, 5,488 wage detail rows, 1,165 unique fertiliser division/year/block rows, all 58 nonempty fertiliser section product totals, wage-rate × points checks and all fully specified wage component splits. September 2023 FFB LOADING has blank Maintenance; source blank is preserved. Duplicated historical schedules/carryover December sheets are not selected.

59 monthly wage category totals reconcile. October 2022 detail is NGN40,684,437.81 versus category summary NGN40,685,537.81. Analysis uses detail and exposes the NGN1,100 discrepancy. Summary-sheet dates are not used; actual monthly sheet identity/title is retained.

`node --test packages/shared/hts-analysis.test.js apps/api/test/hts-analysis.test.js` checks shared-polygon area/quantities, mixed unit exclusion, null history, wage filters/comparison grain and API estate/path isolation. Source workbook arithmetic is verified using stored Excel values, not an Excel recalculation or live HTS reconciliation.
