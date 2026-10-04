# Individual map activities

Each displayed source record has one numbered bubble and one sidebar entry. Twenty records in a matched block therefore produce twenty bubbles. The sidebar shows the actual activity description, block, work date and quantity, with the imagery context above the list. The bubble and sidebar entry share the same number.

Clicking either opens an anchored popup showing only that record's Activity and Mandays. Values are not summed across records. Harvesting uses its source activity name when present; its mandays are not supplied, so the popup shows a dash. Full record details remain in Data.

The map, sidebar, timeline and summary cards are restricted to confirmed block links that still resolve to polygons in the estate boundary. Unmatched records remain in Data and offline packages; they are not displayed on the map. A GPS coordinate does not bypass this block requirement. No ambiguous block matches are inferred.

For imported rows without GPS, deterministic display points are spread inside the matched polygons, respecting holes and separate islands. These display points are never persisted as exact geolocation. Supplied GPS coordinates are retained. Selecting a block fits its boundary to the map for easier inspection.

The authenticated `/dashboard` query accepts `mapMode=records` and `mappedOnly=true`. Cursor pages return up to 100 individual records with a limited projection; the sidebar's Previous/Next controls update both the map and list. Compound indexes support estate/block/date queries. Summaries stay server-aggregated, access-scoped and cached across pages. Existing grouped responses and `/map-popup` remain compatible with older clients. Offline records use the same matched-block filtering and individual popups.

Validation covers 20 distinct records and their own values, stable pagination across both activity collections including identical IDs, permissions, filters, unchanged Data counts, stale boundary links, and point placement inside concave/multipart polygons and holes. Browser verification uses OP2023 B in July 2026: 20 bubbles and sidebar entries, 94 total mandays, with separate 11-manday spraying and 1-manday wage popups.
