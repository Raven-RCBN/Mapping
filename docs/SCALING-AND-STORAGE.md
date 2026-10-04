# Estate Atlas: bounded queries and image retention

## Online data flow

The web dashboard and mobile estate picker use `/bootstrap`, which contains no activity records or image bytes. `/workspace` loads boundaries and block metadata for the selected estates. Maps use `/dashboard` aggregation results; opening a bubble requests that block/location's records from `/records/:kind`.

| Resource | Bound / behaviour |
| --- | --- |
| Data grids and bubble details | 25 rows per UI page; API maximum 100. Keyset cursor uses date plus unique ID, tied to filters and page size. No deep `skip` queries. |
| Map | Up to 500 locations per activity type. A visible notice asks for narrower dates or a block if exceeded. Totals still cover all matching records. |
| Timeline | Seven calendar buckets, or a 12-month history window. Earlier/later controls cover older data. Activity history is paged in groups of 40 dates. |
| Image events | At most 200 per timeline window, with a visible narrowing notice if exceeded. |
| Map images | Nearest acquisition on/before the selected date, its predecessor, and explicit comparison choices. Preview cards request small WebP thumbnails. |
| Workspace | At most 100 authorised estates, 5,000 blocks and 1,000 configured sources. Oversized workspaces are rejected explicitly. |
| Offline | Selected estates and optional date interval; maximum 25,000 records, 200 assets, 512 MiB. No silent partial export. The latest image before the start date is included for context. |

Query dates are `from` inclusive, `to` exclusive. The table search is a literal prefix of block, employee, gang, activity code or description; it is not an arbitrary regular expression. Date inputs narrow large searches. Search across several text fields may examine many matching estate records; the general indexes do not make arbitrary text search constant-time. Introduce a dedicated search index if this becomes a common workload at much larger scale.

## Database and cache

Activity indexes combine estate with work date/ID, block/date/ID or verification status/date/ID. Field activity adds estate/description/date/ID. Imagery adds estate/kind/acquisition/ID and estate/storage-state/retirement time. Shared file paths have an index for purge protection. Startup calls `createIndexes()` for declared indexes; it never drops existing indexes or rewrites estate records.

Server totals use MongoDB aggregations, not client-side sums over downloaded records. Aggregations and long reads have a 10-second database deadline. At most 16 expensive read requests and two image conversions/uploads run concurrently per process. Excess requests return `429` with `Retry-After`.

Aggregation results are cached in memory for 20 seconds, with an 8 MiB/100-entry LRU limit. Keys include the verified subject, role, estate grants and filters. Successful API writes invalidate this process's cache; other processes or out-of-band imports converge within 20 seconds. There is no Redis dependency or shared multi-instance invalidation.

JSON responses over 2 KiB use negotiated gzip. Record responses remain `no-store`. Images and thumbnails use authenticated, private revalidation with checksum ETags; retirement is checked before returning `304`. QGIS rendering uses private ETags tied to request parameters and project modification time. Republish/touch the project when replacing its underlying terrain data. Compressed imagery is not gzip-compressed again. The map viewer JavaScript is lazy-loaded, so opening Data tables does not execute the map library. Build-hashed public JavaScript/CSS uses the service-worker cache; API data is excluded.

## Storage security and lifecycle

Image bytes stay under `data/estates/<estate-id>/images/` for manual uploads, and `imagery/` for acquired imagery. MongoDB stores file paths, checksums, byte counts and lifecycle metadata. The data root is outside the public frontend and has no static image route. Reads require authentication and estate grants. Path traversal and symlinks are rejected. Uploads are decoded and normalised to PNG on disk, with a 50 MiB input limit and a 100-million-pixel decode limit. Uploads stop when available server disk is below 512 MiB.

Production's data directory ACL should allow only the deployment account and `digitalpalm` runtime, including defaults for future files. The runtime identity is shared with other DigitalPalm apps: this is **not** isolation from another process running as `digitalpalm`, or from root. Separate service accounts/containers would be needed for that boundary.

The **Storage** menu reports registered file sizes by estate/type/state and shared-volume free space. These are catalogued bytes, not a recursive disk inventory: original GIS rasters, raw acquisition sources, staging files and backups can use additional disk. There is no automated retention or deletion job.

1. An administrator chooses an estate, acquisition cutoff and how many newest active images to retain (minimum one; default two).
2. **Preview files** returns at most 100 exact candidates and a five-minute, single-use token bound to that administrator.
3. Typing `RETIRE` hides those images from the map and new offline downloads. Files remain on disk. **Restore** makes them available again.
4. After 30 days, a separate purge preview and typed `PURGE` confirmation can remove retired files. Nothing is purged automatically.
5. The API rechecks eligibility and protects shared paths, boundaries, QGIS packages, terrain and activities. It checks the checksum before unlinking. A `purging` state makes retries recover from interruption between unlink and metadata update; changed or protected files are skipped. Purged metadata retains who/when and its original file identity.

Server purge does not erase backups, duplicate source files or previously downloaded mobile/browser packs. Replace or remove offline packs separately. Online browser views always revalidate images through the API rather than using saved offline bytes; changing signed-in identity removes the old browser pack on successful bootstrap.

## Verification

`node --test apps/api/test/*.test.js packages/shared/*.test.js` checks pagination with tied dates, scope isolation, summary correctness, index plans, gzip/ETags, offline limits, symlink rejection and retirement/restore/purge using temporary files and databases. Mobile tests check atomic replacement, preservation after failed or oversized downloads, and checksum-verified reuse of unchanged imagery. Browser and native downloads reuse unchanged files only when the fresh authorised manifest and previous package subject match.

`node scripts/benchmark-scale.mjs` creates 100,000 synthetic records in a new `MappingTest_benchmark_*` local database at port 27018, measures endpoints and removes that database afterward. It never targets the application database. On the development Mac on 4 October 2026: bootstrap 28 ms / 326 B JSON; a 25-row page plus totals 53 ms / 11.8 kB; 100,000-record map aggregation 91 ms / 84 kB; cached map response 2 ms; seven-month timeline 74 ms / 2.4 kB. The indexed 26-row probe examined 26 documents and 26 keys. These are single-client local results, not a production throughput guarantee.

For multi-instance deployments or millions of frequent historical queries, use precomputed daily rollups, shared cache invalidation, tiled imagery/object storage, storage quotas and a production concurrency/load test. The current limits prevent unbounded responses; they do not promise unlimited capacity.
