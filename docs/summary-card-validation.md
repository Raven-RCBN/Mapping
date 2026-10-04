# Summary-card validation — 4 October 2026

The four cards aggregate the selected estates, dates, blocks, activity type and activity-display choices. Activity count is the number of source records, harvesting sums bunches, and field work sums mandays. Pending review equals record count minus verified record count. Records awaiting map matches remain included in these record totals.

Fixed two issues:
- Missing, loading or failed responses previously fell back to zero. Cards now show dashes and a loading/unavailable message until the response for the current selection arrives. Stale requests cannot replace a newer selection.
- Review-only mode previously removed verified records before calculating the card denominator. The API now returns `selectionSummary` for all selected records and retains `summary` for the review-filtered map/list. Online and offline card semantics match.

A scope line identifies the estate, dates and filters. A zero-result note explains when no records match. Empty selections do not claim a 0% verification rate. The review button is disabled when totals are unavailable or nothing needs review.

Read-only validation independently scanned the local imported source rows, summed their numeric fields in JavaScript, and compared against the dashboard API:

| Selection | Records | Verified | Bunches | Mandays | To review |
| --- | ---: | ---: | ---: | ---: | ---: |
| All recorded dates | 5,326 | 0 | 136,439 | 11,297 | 5,326 |
| 30 September 2026 | 11 | 0 | 0 | 29 | 11 |
| 12 December 2025 | 10 | 0 | 363 | 19 | 10 |
| Circle Spraying — Manual + Mechanical, all dates | 256 | 0 | 0 | 1,004 | 256 |

Automated integration tests use isolated mixed verified/unverified records to check review mode, verification writes/cache invalidation, date/block/activity filters, genuine empty results and fractional mandays. Shared tests cover saved offline totals and stale/loading/error states. No production activity status was changed during validation.
