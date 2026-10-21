# DAFA migration and view verification — 21 October 2026

Live Malaysia release: `20261021-dafa-polish` at https://mapintel.agrinexus.ai.

The accepted scope is 35 SQL blocks (23 punctuation matches and 12 user-approved historical aliases). The 29 unmatched blocks are excluded. Existing map identities and geometry remain intact; points are temporary until the user supplies polygons.

Imported: 604 monthly and 72 annual production rows; 5,470 crop receipts; 17,619 harvesting rows; 1,328 field activities; 5,081 stock issue details; 56,164 block ledger lines; 10,964 payroll summaries; 140 reference-area rows; 55 vehicle masters and 12,065 allocated usage rows. Private source manifests and migration receipts are in the Malaysia estate import folder documented in the source profile.

Reference policy: PDF palms and hectares when a PDF palm count exists; highlighted iPlant fallback otherwise. The fallback source has no usable positive palm counts, so per-palm remains unavailable. The combined 20,303 replanting palms remain unsplit. Net material issues deduct approved returns once against the original issue month, with product/source units kept separate. Currency is estate-configured MYR/RM.

Automated verification completed: 43 API integration tests and 21 shared calculation/map-focus tests passed; production source totals reconcile to monthly, yearly and map APIs for 2023–2026. Non-DAFA records in 31 checked collections retained identical checksums. Production build and diff whitespace checks passed.

Live browser checks completed: new data-menu tabs; monthly material block filtering and PDF reference/per-palm values; block detail reference sources; production charts and block links; wages dashboard (2025 RM 791,015.60); yield analysis matching (2026 above 1 tonne/ha returns 18 blocks); geospatial density colours; selected 04-B1 point ring; View analysis on map scrolling/refitting; and the 2025 palm-growth-over-imagery overlay rendering with analysis points.

The map action now explicitly updates map size and fits analysis/raster bounds, even when the same analysis is already selected. Selection fits also support future polygon geometries. Compact block pickers and dashboard spacing/type styles are included in the live release.

Limits: browser checks above are representative, not every filter permutation. Vehicle block costs lacking a valid master vehicle ID remain in the ledger. No verified trial balance, missing palm counts, historical monthly palm census, or field-application quantities were invented.

## Overlay loading follow-up

Release `20261021-dafa-overlay-loading` replaces full-resolution map downloads with authenticated `.preview.webp` display derivatives when available. The original PNG/PDF remains unchanged for download. Previews are generated on Malaysia with the existing sharp runtime: resize inside 3072 × 3072 without enlargement, WebP quality 84. Ortho-growth is 2,411,646 bytes versus 19,207,604 bytes originally; other map previews are 418,300–653,034 bytes. Regenerate previews when replacing source images. Missing previews safely fall back to the original with estate access checks unchanged.

The map uses a bounded memory-only download cache keyed by authenticated resource URL, stable URL/bounds dependencies, visible loading status and a retry button on failure. Changing the analysis section no longer restarts a download of the same overlay. Four geospatial API tests passed, including preview/fallback/original and estate access checks. Production build passed (415 modules).


## Loading and pagination update

IoT metadata/boundaries, period geometry and paginated table rows now have separate
request sections. A block or table-page change does not download the footprint or
estate boundaries again. Movement rows are limited to 50 per page (API maximum
100); coverage and bunch comparisons retain the complete selected-period totals.
SVG paths are memoized and bounded browser/API caches reuse recent requests.
Requests for hidden production/activity views are paused while IoT is active.
Workspace responses omit revision history; history remains available separately.

The private `scripts/prepare-iot-pages.mjs` utility derives work/month partitions
from the original IoT index on the data host. An atomic generation manifest selects
the complete partition set. Requests read one work/month, rather than every year of
movement history. Original CSVs, the full index and geometry layers are retained.
Regenerate these partitions after replacing the source index; restart/reload or
allow up to 60 seconds for the process cache to refresh. Cache entries and total
bytes are bounded. Estates without a dataset remain empty.

Material net issues aggregate in MongoDB by month, block, product and source unit,
then use stable cursor pages. Issue dates are not displayed as individual material
rows. Product-specific annual map analysis receives all block summaries up to the
explicit safety bound, rather than silently using the first table page. Ledger and
crop-receipt pages also use indexed cursor navigation. Search requests debounce and
cancel obsolete requests. Existing production, wage and vehicle cursor-page tests,
including the deep wage-page index check, pass.

Live validation: all 3,999 IoT rows reconcile across 92 pages and all 652 monthly
material groups across 14 pages match the previous net-quantity and palm-basis
calculation. Counts/SHA-256 for 12 existing estate collections are unchanged. The
sample block-change response fell from 1,161,639 to 13,574 uncompressed bytes (98.8%
smaller); the period geometry is fetched separately. These are payload measurements,
not a promise about end-user internet latency. API checks measured 6–8 ms for the
sample warm block/view requests on the server. Browser checks confirm next-page
navigation, searchable block filtering/reset and expected selected-block coverage.


## Combined production yield — 21 October 2026

Ton/Ha = (recorded block FFB tonnes + block-attributed loose-fruit tonnes) divided
by the production record's effective hectares. The same definition applies to
monthly/yearly production APIs, cursor grids/CSV, charts, yield analytics and map
thresholds, decision-support comparisons, annual reference and fertiliser/yield
comparisons. FFB, loose fruit, total crop and bunches are displayed separately.
The stored `mt` remains FFB; average bunch weight remains FFB kg / bunches. Stored
`totalCropMt` is not added again: derived responses calculate it from the components.
Source-reported yield values retain their source meaning and are labelled as such.

Existing accepted iPlant block records already contain the loose-fruit component;
no duplicate import or redistribution of unmatched loose fruit is needed. The
source audit passes 604 monthly and 72 annual groups against 5,470 accepted source
rows and 35 approved block links. The existing exclusions and PDF hectare/palm basis
remain in force. Missing or zero hectares withhold yield; no block allocation is
inferred from estate-only loose-fruit quantities. Historical records lacking a
loose-fruit field retain FFB plus any explicitly recorded loose fruit, and their
missing loose-fruit value remains unavailable in the grid.

Existing FFB-only model snapshots cannot estimate combined crop yield. Their tonnes
remain visible; combined Ton/Ha is withheld unless a snapshot explicitly identifies
its target as `productionBasis: ffb_plus_loose_fruit`. Forecast inputs are not changed
by adding observed loose fruit to a future prediction. Observed chart yield and AI
production evidence use the combined recorded components.


## Material pack normalization and initial estate totals (21 October)

User confirmed that every net issued quantity is a count of its explicit product pack, including legacy GM/ML/KG/MT labels. For example, BM CERGAS (500 GMS) multiplies the issue count by 0.5 KG. When no pack size is stated, use the issued quantity: known source units convert to standard KG/L, while undefined BAG/BOTTLE counts retain their original quantity and unit. No pack size is inferred.

Policy `product-pack-count-source-fallback-v2` stores normalized quantities, units and conversion basis alongside original source quantities. Net returns are already deducted once. The migration checks a digest of every original StockIssue field before and after, takes a private server backup, and records the method in source details. Future imports apply the same policy.

- 5,081 approved material net issue records reconcile to 32 mapped blocks with zero missing map targets or source quantity differences.
- 4,873 records convert to KG/L; 208 retain BAG/BOTTLE source quantities.
- First analysis load shows estate totals by product and unit with cursor pagination. Selecting a product shows block totals, per-palm values and map colours. KG and L are kept separate.
- Source audit confirms 602.85 MT loose fruit is allocated to 35 approved source blocks. The remaining 246.85 MT stays excluded under the earlier unmatched-record instruction. No new block aliases were inferred.
- Validation: 11 material/shared/API tests passed, production frontend build passed; server verification covers all four years of estate pages, converted and source-unit per-palm values, other-estate isolation and preservation of ten unrelated collections.

Private migration receipts and originals remain on Malaysia; they are not committed or published.
