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
