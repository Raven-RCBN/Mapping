# iPlant SQL block extraction profile

System: iPlant EXE / Microsoft SQL Server 2019
Server: 103.235.106.114,1433
Recorded instance (schema inventory): WIN-0OJNK375KP4\MSSQLSERVER2019
Database reviewed: ONG_SLD_TEST
DAFA source estate: OP3 / SYARIKAT LADANG DAFA SDN BHD
Mapping estate: 673eebaf-1532-4590-9957-537373f1928d
Estate currency: MYR, displayed RM; confirmed and saved in Mapping estate setup on 20 October 2026.
Verified route: existing iPlant application on the India host (deploy_iplant2 account). This is a SQL read route only. Mapping remains hosted exclusively in Malaysia.
Credential reference: protected iPlant application environment /home/deploy_iplant2/app.env, IPLANT_SQL_* variables. Secret values are never saved in Mapping source details.
Direct access from the Mac and Malaysia timed out during this inspection; the iPlant-host route succeeded. Recheck reachability before the next extraction.
Driver: existing iPlant mssql package; encrypt=false and trustServerCertificate=true match the verified legacy route. ReadOnlyIntent is a routing hint, not a permissions boundary; run only the fixed SELECT templates and use a read-only SQL login when provisioned.

## Method

Purpose: repeatable historical block-level extraction for DAFA and the next two estates on the same SQL server. This profile documents extraction only; no scheduler or automatic import is enabled.

REUSE PARAMETERS
Choose the database and source EstateID explicitly for each estate. First query General.Estate and verify its code/name against the requested estate; never assume the database name or OP3 applies to another estate. Mapping estate ID and currency come from that estate's setup. Do not reuse DAFA's block aliases, GIS areas or currency automatically.

VERSIONED QUERY CATALOG
Repository docs/iplant/sql/: initial.sql (database/estate/table discovery); coverage.sql (years, periods, counts, block master and stock categories); summaries.sql (production, harvesting, store, payroll and vehicle summaries); validation.sql (returns, dates, currencies, report text); linkage.sql (transaction block IDs, historical names and rainfall linkage).
Bind @EstateID to the verified source estate ID. @FromDate and @ToDate are the selected sample interval (exclusive end); @Year is its reporting year. Coverage and annual summaries deliberately inspect all historical years for that estate, while date parameters bound the sample queries. Only SELECT statements are executed. Report procedure definitions are read as text, never executed.

JOIN AND MEASURE RULES
1. Production: Checkroll.CropStatement joined to CropYield and BlockMaster. MilWeight / 1000 = tonnes. Keep FFB, Loose Fruits and OWN/CONTRACTOR separate before any combined total. Do not invent zero production for missing months.
2. Reception: DailyReceiption -> DailyAttendance by DailyReceiptionID AND EstateID; attendance -> CREmployee. Pre-aggregate DailyReceptionWithTeam by DailyReceiptionDetID, using harvested normal + borongan. Fall back to header quantities only when no team detail exists. Keep orphan reception rows as separate review evidence.
3. Checkroll: dbo.CheckrollTemp joined to General.ActiveMonthYear by source period ID AND estate/location. Preserve source TransDate but report accounting period; retain debit, credit, COA, activity and block. Full debits are not take-home wages.
4. All-module ledger: Accounts.LedgerAllModule -> JournalDetail by LedgerID AND EstateID; join COA. Modules: 1 Checkroll, 2 Store, 3 Vehicle, 6 Accounts. The legacy AllLedgerCOAReport sources checkroll separately; do not execute it to extract data because it deletes/rebuilds report rows and adjusts rounding.
5. Store: STIssue -> STIssueDetails -> STMaster -> STCategory / General.UOM. Approved issues are distinct from OPEN records. ST12 = fertilizer, ST04 = chemicals/weedicides in the reviewed DB; verify category codes in the next DB. Retain original quantity/unit/price/value and product label. Approved STReturnGoodsNote/Details provide returns linked to original issue detail. An issue is not proof of application.
6. Vehicles: VHRunningLog provides vehicle totals but has no populated block IDs in the reviewed dataset. VHDistribution provides allocated block hours; JournalDetail provides cost allocations. Keep actual running logs and allocated hours distinct to avoid doubling usage.
7. Context: BlockMaster holds SQL planted hectares, division, planting year, soil and planting material. BlockMasterHistory provides limited historical context. Never replace map GIS area or survey palms with SQL values without dated reconciliation.

DESTINATION PLAN
Reuse monthly/yearly production, block-name history, harvesting, wages summaries, vehicle master/usage and validated field activities. Add stock movement and full ledger entry tables; crop receipt detail is recommended for audit. Adapt the wage direct-cost view, currency handling and unmatched-row storage before importing.

REPEATABILITY
Use estate + source database + source table + primary key as the import identity; include profile version, extraction timestamp, query hashes, source content hashes, row counts and period coverage. Refresh in staging, compare existing rows, retain corrections/history and promote only reconciled results. Never add raw detail costs again to summary costs. Source queries contain no SQL writes; data imports require their own review.

RUNNER
scripts/extract-iplant-sql.mjs runs on the approved SQL-access host with its existing mssql package and protected environment loaded. It writes a new protected extraction folder and a manifest. Review the README before use. No credentials are accepted in source notes or query files.

## DAFA findings and next-estate checks

DAFA baseline, 20 October 2026: 64 SQL blocks vs 39 current Mapping blocks; 23 punctuation-only matches, 12 historical-L candidates requiring review, 29 unmatched SQL names, and four map-only names (25-D5, 26-D4, Forest, Napier Planting). No aliases applied.
2023 data is partial; 2026 production/reception reaches September. 2024 reception lacks January/February. 674 reception rows have no attendance link. Missing block references remain in legitimate non-block/control-account records as well as review records.
UOM flag: GANO EF-1 (20KG) is configured MT, conversion 0; SIV1010 records 250 MT for 19D1. Preserve the source unit and flag it rather than converting it as verified tonnes.
RainFall.BlockID may contain a block name or OFFICE rather than relational ID; some 2026 named-block rainfall values are implausible. Withhold these from validated block metrics.
SQL currency tables were empty, but the user confirmed DAFA currency MYR/RM. Use estate setup for display/validation; do not relabel existing NGN source data or perform implicit FX conversion.
Checked totals: annual crop sums reconcile to coverage; store category totals reconcile to approved issue totals; reception monthly/block totals agree. No SQL/data imports were performed.
For another estate, repeat identity/schema/years/category/UOM/currency/block checks. The two further estate names, database names and EstateIDs have not yet been supplied; do not guess them.

## Example command on the approved iPlant host

Run with the existing protected environment loaded by Node. The output folder must be new. Keep output private on the data host; this is not a deployment command.

```sh
node --env-file=/home/deploy_iplant2/app.env --openssl-legacy-provider scripts/extract-iplant-sql.mjs --database ONG_SLD_TEST --estate OP3 --expected-name 'SYARIKAT LADANG DAFA SDN BHD' --from 2025-01-01 --to 2026-01-01 --output /home/deploy_iplant2/reports/dafa-2025-review
```

`--from` / `--to` bound samples; coverage and annual summaries inspect all estate history. `--to` must be 1 January of the following year for the current annual sample templates. Before another estate, select its database and source estate ID after identity discovery and explicitly provide the expected name using `--expected-name`. This runner never imports into Mapping.


## Block crosswalk and metadata status

Read the current Mapping estate block list separately from SQL. Compare uppercase names after removing punctuation. Mark these as formatting matches only. If no match exists, remove a single historical L immediately after the first two year digits and mark a resulting match as a review candidate, never an accepted alias. Preserve unmatched names and map-only names. Retain source SQL IDs, raw names and dated validity; do not merge or distribute historical blocks automatically. RainFall.BlockID sometimes contains names rather than IDs, so validate that field separately.


 DAFA estate currency MYR and this source guide were saved on Malaysia. No SQL financial transactions, block links or operational tables were imported. Currency/source-details UI changes are prepared locally and remain undeployed.
## DAFA migration, 21 October 2026

The current source profile is `dafa-source-profile.json` (`iplant-block-import-v2`).
It records the accepted 35-block crosswalk, 29-block exclusion, net-only monthly
material view, PDF-first reference policy and highlighted iPlant fallback rule.

The private migration archive and receipts remain on Malaysia under the DAFA
estate's `imports/iplant-20261021/` directory. No raw operational archive passes
through the Mac. `scripts/iplant/export.cjs`, `import.mjs`, and `verify.mjs` form the
reviewable extraction, staging/import, and independent reconciliation chain.
These adapters deliberately assert DAFA/OP3; use the generic parameterized runner
for discovery of the next estate before adapting an import.

Use the private Mapping environment only on Malaysia. Run `import.mjs <folder>
--stage --apply` first; `verify.mjs <folder> --stage` must pass. A normal invocation
without `--apply` validates/plans without operational writes. Live imports require
`--apply`; deterministic IDs prevent duplicates, and manual revisions block a
refresh so corrections are not silently overwritten. Reconcile refreshes against
the prior receipt and keep source snapshots and hashes. No stored procedures run.

PDF palm counts are fixed dated references, not monthly historical censuses.
The 20,303 palms grouped as a replanting area must not be split over current blocks.
Only where no PDF count exists may iPlant details supply the highlighted fallback.
Zero/blank source count and density fields do not permit per-palm division.
Net material is attributed to the original issue month after deducting approved
linked returns once. Product/source units stay separate; no bag conversion is inferred.
