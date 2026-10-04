# Activity display selection

The Estate timeline's All activities list replaces the single field-description dropdown. Each harvesting/field description has a Display in map checkbox. Search is literal and case-insensitive, with 50 field descriptions per page. Select all and Clear all apply across pages/search results. Choices persist locally per signed-in user and selected estate combination.

Selection affects map summaries, their bubble detail pages, the timeline and operation totals. Source Data tables remain unfiltered by these display choices. The activity type, block, date and review filters still intersect with the selection. Changing a checkbox returns the activity type to All types and enables the activity layer. Map and imagery layers are unaffected.

The same selection helper filters saved browser offline records. Existing offline packages need no data migration. First use shows all activities, preserving the existing map; Clear all followed by individual checks selects a subset.

## API

GET /activity-options returns an authorised, searchable activity-description catalogue with `items`, `total` and `next`. It accepts `estates`, `q` and `after`. Pages contain at most 50 descriptions; queries use the existing per-process concurrency limit, 10-second timeout and access-scoped bounded cache.

Dashboard, timeline and /records/:kind accept read-only POST requests as well as the existing GET form. POST sends long selections in a JSON body to avoid proxy URL limits. It requires the usual authentication and X-Mapping-Client header and does not invalidate summary caches as a write would.

`mapVisibility` is `{mode: "include" | "exclude", fields: string[], harvesting: boolean}`. Include lists selected descriptions; exclude lists hidden descriptions. Empty include + harvesting=false hides all; empty exclude + harvesting=true shows all. Up to 500 descriptions of 500 characters each are accepted. No raw query operators are accepted. Selection intersects with estate access, dates, block and other filters before aggregation and pagination. Old GET clients retain their existing behaviour.

Validation: integration tests cover union selection, all/none/exclusion, estate access, bounded catalogue search/pages, popup pagination, timeline totals, input validation and unfiltered Data menu queries. Shared tests cover offline filtering and unchanged source records.
