# Trial balance and Data tables

## OBAN 2025 source snapshot

The OBAN import contains 185 summary accounts and 18,085 detail records (18,072 transactions and 13 opening balances). All 13 supplied account ledgers reconcile with their summary account; the remaining 172 accounts await detail sources. Debit is NGN 39,535,702,521.24 and credit NGN 39,535,702,521.28. The original NGN 0.04 report difference is retained in `reportIntegrity`, not allocated to an account.

`mappingtrialbalancesummaries` retains level1–level4, hierarchy paths and node identifiers, source account codes, balances in integer kobo, detail coverage and reconciliation controls. `mappingtrialbalancedetails` retains account-specific optional fields, raw source extraction, separate components, quantity/unit/item, employee/bank, wages/activity/rate/mandays/dates, location/block, vehicle identifier and review evidence. Unavailable fields are null. Components are explanations of parent transactions, not additional postings. No inferred vehicle identifier was added to the diesel or petrol records.

125 transactions have `beigeFlag`, displayed as **Highlight**. 71 require block review and are also included in Highlight. `reviewIssues`, `highlightColor`, `reviewStatus` and block-match evidence remain available to future reporting. Original block references remain separate from matched master IDs. Matches require an unambiguous OBAN master and existing map polygon; missing, ambiguous and non-plantation references stay unresolved. No master blocks or cost allocations were invented. Cost reporting links remain a future step.

Sources and import backups are private estate files. The repeatable importer verifies source hashes, running balances and account totals, refuses conflicts and reads back persisted fields. Full estate archives include both trial balance collections.

## Data page behavior

All Data list views use bounded server pages (normally 25 rows), with estate scope, stable ordering and filter-specific cursors. Filters are applied before paging. Changing estate, period, account, search or view resets page history; obsolete requests are cancelled and late responses ignored. Loading, empty, failure/retry and disabled navigation states prevent stale results being presented as current data.

- Trial balance: `/trial-balance` and `/trial-balance/meta`, selected estate/year/account, Highlight and Block mismatches filters; tree uses bounded account metadata.
- Production names, source monthly/yearly reports, recorded production, comments and wage source/area rows: `/data-tables/:kind`. Production and comments default to the latest relevant period. CSV is fetched in bounded batches only on export and stops with a clear limit at 5,000 selected rows.
- Vehicle summaries, transactions, items and usage: `/vehicles/page`. Monetary and item totals are database aggregations; vehicle metadata and usage decoration are limited to the returned page.
- Allocated wages: `/wages/allocation` uses cursor pages and preserves per-source integer rounding. Allocation inputs are bounded to estate/year and explicit limits: 50,000 source/manday rows, 5,000 area rows and 250,000 potential allocations. Larger selections require narrower division/block filters.
- Block, field and harvesting Data lists retain their existing server cursor APIs, with stale-response protection.

Compound indexes cover estate/period and stable pagination keys, with separate trial balance Highlight/block-review/account indexes. Query timeouts and caps return errors rather than silently truncating lists. Legacy analytical endpoints remain available for existing map/report consumers; Data lists no longer download complete transaction histories. Group totals and literal substring searches still depend on the size of the selected period; bounded timeouts protect the service. Trial balance aggregate counts have a short 20-second cache.

## Verification

The full regression suite passed 161 checks. Additional tests seeded 20,000 wage rows and verified a deep indexed page reads 26 documents or fewer than 30 examined. Route tests cover multi-page traversal without duplicate rows, estate/year isolation, filter-invalidated cursors, literal search, summary totals, missing quantities and unknown vehicle usage. Browser checks cover Highlight/Block mismatches, separate block reasons, next/previous navigation and the summary hierarchy. The prepared deployment verification builds additive indexes (never drops indexes), checks read-only endpoints against production data and verifies unchanged source data hashes.

The deployment bundle includes source-hash guards, private database snapshots, additive index creation, authenticated-scope API checks and automatic release rollback if health checks fail.
