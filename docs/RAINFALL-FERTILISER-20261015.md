# Rainfall and fertiliser wage charts — 15 October 2026

Deployed to https://mapping.digitalpalm.ai/ after local preview and user approval. API release: `/home/deploy_mapping/app/releases/20261015-fertiliser-rainfall`. Previous release: `20261014-rainfall-bd0318e`. Frontend backup: `/home/deploy_mapping/backups/20261015-before-fertiliser-rainfall/public`.

Annual block fertiliser now shows the selected year's monthly UPKEEP / FERTILIZER APPLICATION wages alongside the block's annual quantity history. Both charts share pale-green full-height bars, row dimensions and labels inside each bar. Selection follows the mapped block and year. Wages reuse the existing monthly division payroll allocation endpoint; amounts are still allocated estimates. The requested explanatory paragraph was removed; the allocated-total label and allocation details remain. Product filters affect fertiliser quantities; activity wages cover all products. Missing months/years remain missing. Available block allocation areas currently cover 2025.

Rainfall source: user-supplied `Screenshot 2026-10-15 at 3.34.59 AM.png`. The 2017–2026 comparison replaces overlapping values from the earlier JB Farms screenshot. Legacy 2015–2016 values remain with their original source attribution. Annual and monthly rainfall fields retain source identity, rain days, coverage and unknown values. Jan–Sep 2026 totals 3,392 mm and 148 rain days; Oct–Dec remains null and 2026 is explicitly YTD. NR stays unknown. Screenshot annual totals differ from monthly sums by 1 mm in 2022, 2023 and 2024; the UI flags this and preserves the reported annual totals.

`scripts/prepare-oban-rainfall.py` reproduces the screenshot transcription and checks monthly sums. Private payloads remain under ignored `data/rainfall/`. `scripts/deploy/update-rainfall.mjs` dry-runs by default; `--apply` saves a private record snapshot, retires overlapping older-source records and inserts the new source. Original records are retained. Production rainfall backup: `/home/deploy_mapping/app/data/rainfall-imports/20261015-before-20361823c4400efd.json`.

The local preview runs with `node scripts/preview-fertiliser-rainfall.mjs`, using supplied private fixtures and an isolated `MappingTest_` database. It opens at http://127.0.0.1:4198/fertiliser-preview.html and supports block/year selection.

Validation: 11 shared allocation/fertiliser tests and the HTS API scope test passed. Production build and root-path/service-worker checks passed. Local browser checks verified matching bar styles, G14's six monthly amounts totalling NGN 50,238.36, F13 block switching, missing 2024 wage records, responsive stacking and September rainfall. Live verification confirmed all 12 active rainfall years, 2026's nine supplied months, preserved 2015–2016 values, unchanged G14 allocation and all three estates. HTTPS health reports Mapping sessions; protected reads return 401 without a session. Published HTML and entry asset checksums match the staged build, and the requested paragraph is absent. The live browser reached sign-in; authenticated chart appearance was verified in the local preview.

Rollback: restore the previous API link and backed-up frontend entry files, restart only the Mapping service, and restore rainfall active flags from the private before snapshot if needed. Preserve any post-deployment edits; do not restore a whole database over newer records.

## Compact comparison chart follow-up

The yearly comparison card is capped at 1,120 px, with shorter aligned plots, DM Sans labels, lighter gridlines, smaller markers, clean axis intervals and a concise summary. Partial-year markers and source values are preserved, including decimal precision in the older rainfall records. Longer source checks remain available in the details disclosure. This is a frontend-only update; payroll allocations and rainfall records are unchanged. Frontend rollback files are under `/home/deploy_mapping/backups/20261015-before-compact-charts`.

## Monthly rainfall chart follow-up

Monthly rainfall now uses the same compact 1,120 px card and DM Sans typography as the yearly comparison. Slimmer muted-blue bars, lighter gridlines, clean 250 mm ticks for 2026 and smaller numeric labels reduce visual weight. The YTD badge, missing-month markers, year selector, monthly table and source discrepancy notices are retained. The source data is unchanged. Frontend rollback files are under `/home/deploy_mapping/backups/20261015-before-monthly-rainfall-style`.

## Chart arrangement follow-up

The selected block detail table and its source/coverage disclosure now sit above all charts. Desktop layout has annual history and the fertiliser/production/rainfall comparison in the first row, then monthly application wages and monthly rainfall in the second row. Both pairs align at the top of their grid rows. Narrow screens stack the panels for readable viewing. This frontend-only layout update preserves all data, selections and calculations. All four charts now use matching white cards, borders and padding. Local preview verified the desktop pairs and phone stacking without page overflow. Published after explicit user approval on 15 October 2026. Frontend release: `/home/deploy_mapping/releases/20261015-chart-layout`; rollback files: `/home/deploy_mapping/backups/20261015-before-chart-layout`. HTTPS HTML, JS and CSS hashes match the staged build and the Mapping API is healthy.

The monthly application wages card also has its own Wage year selector. It uses available payroll years plus the displayed history years; years without payroll records are labelled and remain empty. Selecting a wage year does not change the annual-history or rainfall year. Changes to the main annual-history year reset the wage chart to that year. Browser checks verified 2024 missing data, 2025 F5 total NGN 131,939.72, and matching white backgrounds on all four cards.

## Yield analytics planting-year filter

Yield analytics has a Year of planting dropdown with All planting years and the recorded years of mapped blocks. It uses the block inventory's `plantingYear`, exposed as a small estate-scoped inventory alongside recorded production; it never infers planting year from division names or a production row. The existing analytics year remains the production year. Planting cohorts scope matches, coverage counts, missing-data counts, the results table and map highlights. All includes unknown planting years; a specific year excludes unknowns. Separate source records on a shared map polygon remain separate.

Validation: 15 API/shared tests passed, including inventory metadata, estate isolation, unknown years, shared polygons, missing yield and strict thresholds. The local browser returned 17 matching blocks for 2025 / planted 2017 / above 20 Ton/Ha, compared with 27 across all planting years. The source values and yield calculations are unchanged. API release: `/home/deploy_mapping/app/releases/20261015-planting-year`; rollback: `/home/deploy_mapping/backups/20261015-before-planting-year`.

Published on 15 October 2026 with the Mapping API healthy. Both public domains serve HTML, JavaScript and CSS matching the tested build. Authenticated filter behavior was verified in the local preview. No production data was changed.

## Fertiliser map range legend

Solid fertiliser map shading now uses selected-year kg per palm from summed block quantities divided by block inventory palms. The right-side legend uses 0–1.5, then 0.5 kg/palm ranges. Boundaries are lower-inclusive and upper-exclusive. Colours stay consistent across years; the displayed scale extends to cover the selected year. Missing quantities or palm counts share the lightest range without changing underlying null values. Zero uses that range too. Liquid product maps retain their selected units. The compact scrollable legend clears zoom controls on desktop and phone. Per user preference, it shows ranges without a missing-record note.

Validation: 12 shared analytics tests, production build and root/service-worker checks passed. Local map preview verified 2024/2025 year changes and responsive placement. Frontend release: `/home/deploy_mapping/releases/20261015-fertiliser-legend`; rollback: `/home/deploy_mapping/backups/20261015-before-fertiliser-legend`.

## Larger map and block popup

The map is taller (78% of the viewport, with desktop and phone minimum heights). Selecting a polygon or a block filter opens the existing block inventory details inside a compact map-anchored popup, replacing the separate block information panel above the map. The popup pans into view, remains within the map when resized, supports Close/Escape to hide details while preserving the selected block and uses two columns with internal scrolling for long details. Block comments remain available in a disclosure. Activity bubbles retain their existing popup; the block popup appears when an activity is not being inspected. Displayed numeric facts are rounded to two decimal places; source values are unchanged. The fertiliser legend is half-width at the right edge, with kg/palm shown once in its heading.

Validation: 15 existing store, activity/harvest popup and fertiliser tests passed; production build and root/service-worker checks passed. Local browser checks verified an F3 polygon click, filter selection, F5 switching, Close/Escape, and phone popup containment with no horizontal page overflow. Frontend release: `/home/deploy_mapping/releases/20261015-block-popup`; rollback: `/home/deploy_mapping/backups/20261015-before-block-popup`.

The popup close button hides only the details. The block highlight, selected block filter and analysis scope stay active. Clicking the same polygon again or selecting another block reopens details.
