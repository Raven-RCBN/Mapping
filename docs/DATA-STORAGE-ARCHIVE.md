# Mapping Data Storage & Archive

The **Archive** item in Mapping's left menu opens **Data Storage & Archive** (`?view=archive`). **Storage** continues to manage image retirement. This implements the estate-scoped create → verify → download → controlled purge/recover pattern reviewed in the DigitalPalm DataStorageArchive service and its Management Console.

## What is stored

MongoDB stores estate boundaries, block parameters, map metadata, activity and production history, wages, rainfall, vehicle identities/costs/imports/activity usage and archive receipts. Image bytes and map dependencies remain private filesystem files. Inventory totals include the primary asset and its CarryMap pyramid; they are logical inventory totals and can count a shared path more than once. Available-space figures are physical free space for the whole mounted volume.

Archives are **full estate snapshots across all dates**, rather than monthly transaction slices. A dated image can depend on an older terrain, boundary or QGIS file, and production comparisons use multiple years. Copying a month in isolation would lose that context. The archive history records the time each snapshot was created.

Each archive contains:

- `manifest.json`: estate ID, creator, creation time and SHA-256/size for each entry. The database separately retains the manifest hash.
- `records/*.jsonl`: streaming exports of the explicitly allowed Mapping collections, scoped to one estate. Credentials, user sessions and access grants are excluded.
- `files/estates/<id>/...`: all regular files in that estate folder, including unregistered QGIS sidecars and CarryMap pyramids. Symlinks are rejected. Every non-purged registered asset must exist and match its checksum and size.

Source workbooks, HTS/model snapshots or other resources outside the estate directory, application configuration and credentials remain outside this archive. Continue the existing system/database backup for disaster recovery. Keep imports and edits paused during a snapshot: a second pass detects changed records, but the export is not a MongoDB transactional backup.

## Workflow

1. Select one estate and **Create full estate archive**. Combined estates provide summary only. The job runs server-side and is recorded in MongoDB. Refreshing the page does not cancel it.
2. **Verify** after creation finishes. All exported records and copied files are rehashed. Only a fully verified archive can authorize purge or download.
3. **Download .tar.gz** to a separate backup destination. The server streams the package, avoiding a whole-package browser Blob. The short-lived one-use download capability is issued only after administrator and estate authorization. Retain the manifest with the package.
4. Use **Manage image retention** to preview and retire older dated imagery. The existing newest-image protection and 30-day recovery period remain.
5. A permanent purge now requires an available, verified copy of each exact image, and rehashes that archive file immediately before unlinking the original. Boundaries, terrain, reference mosaics and mapping records are not purged by this workflow.
6. **Recover purged imagery** copies the original image from its verified archive and restores visibility. A different existing file is never overwritten. Recovery has a per-image lease and can retry after an interrupted worker's five-minute lease expires. Purged items created before this feature have no recovery receipt unless a usable archive was created before their purge.

Automatic database restoration and archive import from a downloaded package are not exposed in the UI. Database exports are for administrator-led recovery into an isolated database, followed by verification and reconciliation with newer records. The UI does not bulk overwrite live estate records or copy one month's operations into another month.

## Capacity and operations

Default storage is `DATA_DIR/archives/<archive-uuid>/`. Set **ARCHIVE_DIR** to an absolute, private path on a separate archive volume to release space on the active volume after verified purge. It must be outside `DATA_DIR/estates`; do not expose it through static hosting. The production systemd service must be granted write access to the chosen mount through its administrator-managed `ReadWritePaths`. Keep the mount available for verification, download and recovery.

A snapshot is an additional full copy. When archives and active data share a disk, creation increases total usage and subsequent purge only removes the original copy. There is no automatic deletion, remote cloud upload, scheduled archive, deduplication or automatic archive-volume provisioning. Set retention and backup policy before scheduling frequent full snapshots. Offline browser/native packages are separate copies and are not erased by server purge.

Jobs use bounded MongoDB cursors and streaming file hashes. One job runs per API process, a unique estate lease prevents concurrent jobs for one estate, and two simultaneous streaming downloads are allowed per process. Creation checks free archive disk space before copying files; failures do not authorize purge. File copy errors clean incomplete new snapshots. After a restart, stale jobs are marked failed after five minutes; incomplete directories may require operator cleanup after confirming no worker is running. Keep prior verified snapshots.

Runtime requires the standard `tar` executable (available on the current Linux host and macOS). Files and manifest receipts are immutable through the API. Archive history is paged; the recovery list shows 100 images at a time and advances as images are restored.

## Validation

The complete Mapping test suite and production frontend build pass. Archive integration coverage exercises:

- Estate and role isolation, invalid estate identifiers and credential exclusion.
- Inclusion of QGIS dependencies and scoped record exports.
- Verified archive → purge → recovery with original bytes preserved.
- Blocking purge without a verified copy, including corruption after successful verification.
- Missing files, symlink rejection, failed verification and one-use download links.
- Existing retirement grace period, newest-image protection, shared-path safeguards and bounded paging.

Browser acceptance on a synthetic local estate confirmed menu navigation, creation, live job progress and verification. No real estate images were retired or purged during validation.

## Live release — 17 October 2026

Published at `https://mapintel.agrinexus.ai/?view=archive` (Mapping).

- API release: `/home/deploy_mapping/app/releases/20261017-data-archive`.
- Previous API: `/home/deploy_mapping/app/releases/20261016-model-comparison-390019c`.
- Frontend rollback files: `/home/deploy_mapping/backups/20261017-data-archive` (`index.html`, `sw.js`, `manifest.webmanifest`). Prior hashed assets remain available.
- Source checksums: `data-archive-source-manifest-20261017.json`. The deployed entry point already supported both production origins; the staged patch preserved that server-specific configuration and added only `archiveDir`. The local entry point retains its existing single-origin setup.
- Release archive SHA-256: `3bc1c2ce75863455330f62b4bdb60ec3d31d4b3b12a7cc99ac55d6034996c608`.
- Published HTML SHA-256: `f2ecaef0b651d65a8df23032eaf702e47655fef87411b992cac492f96d8015a6`.

Post-publication checks passed: healthy Mapping API; unauthenticated archive listing rejected with 401; all eight deployed API files match their release hashes; both HTML-linked frontend assets match their public bytes; archive menu is in the published bundle. The live sign-in screen renders. A read-only inventory check found 68 assets, 1,573,766,895 referenced file bytes, and no missing paths or size mismatches. No production archive jobs were triggered, and production archive count remained zero. Functional archive/purge/restore validation used synthetic local test estates rather than production data.

At release the server volume was 86% used, with about 29 GB available. A separate archive volume has not been provisioned as part of this change.
