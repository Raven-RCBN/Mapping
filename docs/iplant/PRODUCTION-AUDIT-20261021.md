# DAFA production reconciliation — 21 October 2026

Read-only audit of ONG_SLD_TEST / OP3 against Mapping: PASS.

- 6,851 source crop statement rows; 5,470 accepted rows across 35 matched blocks.
- All 604 monthly totals and 72 annual totals reconcile for FFB tonnes, loose fruit, bunches, own and contractor crop.
- 575 block-month groups contain multiple source rows. Each is already summed; repeated ticket numbers are valid detail lines and must not be deduplicated.
- Recorded and allocated production API histories reconcile, including average bunch weight and production per hectare.
- No calendar versus active-period differences or unknown active periods.
- A fresh read-only SQL extraction matched the stored export digest: `5dfd6545214532d100fa0d854a9df24ae0261b8558cf3f5a73bc0cccd288e3b9`.

Example: source 01L1 / mapped 01-1, September 2026: 15 FFB rows total 53.270 MT and 3,657 bunches. At 74.1 reference hectares this is 0.719 MT/ha, with average bunch weight 14.567 kg. No reimport or value correction was needed.

Reproduce with `scripts/iplant/audit-production.mjs` on Malaysia using the current release and private runtime environment. Detailed evidence remains in the private estate import directory as `production-block-month-audit-20261021.json`; do not publish transaction details.

Display correction: the year dropdown incorrectly treated any period label other than the literal “Full year” as partial. Per the user’s instruction, year selectors and annual chart axes now show plain years, and reporting dates omit partial/YTD annotations. Missing months remain null chart gaps, recorded zero remains zero, and source coverage metadata remains available for audit. Annual totals are not extrapolated.

## Full source estate versus Mapping

FFB tonnes only; loose fruit remains separate. Every available DAFA crop statement is included on the source side.

| Year | iPlant FFB MT | Mapping FFB MT | Excluded FFB MT |
| --- | ---: | ---: | ---: |
| 2023 | 5,865.71 | 3,673.40 | 2,192.31 |
| 2024 | 14,608.48 | 11,077.58 | 3,530.90 |
| 2025 | 10,656.50 | 9,085.68 | 1,570.82 |
| 2026 | 7,691.99 | 7,114.26 | 577.73 |
| Total | 38,822.68 | 30,950.92 | 7,871.76 |

The difference is 20.28% of source FFB. It consists of eight excluded source blocks: 11L1 (2,706.96 MT), 00LB1 (1,807.88), 05LA1 (1,074.09), 98L2 (649.37), 98L3 (507.13), 98L1 (421.45), 04LA1 (351.60), and 00LC1 (341.34); plus two statements with blank BlockID (11.94 MT). The other 21 excluded block-master entries have no crop statements in the available extraction.

Loose fruit: source 849.70 MT, Mapping 602.85 MT, excluded 246.85 MT. Combined FFB and loose fruit: source 39,672.38 MT, Mapping 31,553.77 MT, difference 8,118.61 MT. Do not compare that combined measure with an FFB-only chart.

All 35 linked source blocks reconcile exactly; no duplicate map targets or missing registry targets were found. Monthly totals equal yearly totals. The twelve historical L aliases remain user-approved assumptions, rather than independently established historical boundary identities. No new alias was inferred or imported during this audit.

Reproduce the whole-estate comparison using `scripts/iplant/reconcile-estate-production.mjs` on Malaysia; detailed by-month and by-block evidence is private in `estate-production-reconciliation-20261021.json`. A fresh read-only SQL yearly aggregate and full normalized digest verified the source again on 21 October 2026.
