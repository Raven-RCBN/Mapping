# Compact map activity popup

Clicking an activity bubble opens an anchored popup on the map with two columns: Activity and Mandays. Selecting a mapped activity from the side panel opens the same popup. Ordinary map clicks do not open activity details.

Repeated activity descriptions at the selected location are combined and their mandays summed for the current date, estate, block and activity selection. Harvesting records have no mandays field in the source, so they show a dash. Full record details remain in the separate Data view.

Online summaries use the authenticated `/map-popup` query, scoped to the selected block and GPS or block-placement location. Results contain only activity and mandays, use bounded cursor pagination and the existing access-scoped cache and query limits. Offline records use the same compact presentation and local aggregation. The popup closes when map filters or the displayed data change.

Validation: API coverage checks aggregation, filtering, estate access, location separation, cursor scoping and bounded responses; shared tests cover offline aggregation and missing mandays. Browser checks confirm both map-bubble and side-panel entry points, the two requested columns, and dismissing the popup without opening a full-screen dialog.
