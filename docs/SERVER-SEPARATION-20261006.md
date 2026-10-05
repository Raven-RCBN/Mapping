# Independent Mapping deployment — 6 October 2026

## Dedicated deployment

- Website: https://mapping.digitalpalm.ai/
- API service: `digitalpalm-mapping.service`, running as `deploy_mapping` on `127.0.0.1:8031`.
- Database service: `mongod-mapping.service`, running as `mongodb-mapping` on `127.0.0.1:27031`.
- Database: `DigitalPalmMapping`; its application account has only `readWrite` on this database. AgriNexus credentials and users were not copied.
- Application: `/home/deploy_mapping/app/current` → `releases/5336eff`.
- Environment: `/home/deploy_mapping/app/mapping.env`, owner `deploy_mapping`, mode `0600`. Contains private database connection information; do not publish it.
- Private data: `/home/deploy_mapping/app/data`.
- Independent Node/QGIS runtime: `/home/deploy_mapping/app/tools`.
- Public frontend: `/var/www/mapping.digitalpalm.ai/public`.
- Nginx: `/etc/nginx/sites-available/mapping.digitalpalm.ai`; `/api/` now proxies to port 8031.
- Existing valid HTTPS certificate preserved.

The API service cannot access `/opt/digitalpalm/agrinexus`. It writes only to its Mapping data directory (plus private temporary storage). Both services are enabled at boot.

## SSH and restart

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -i /Users/admin/.ssh/digitalpalm_deploy_ed25519 deploy_mapping@187.127.167.149
sudo -n /usr/local/sbin/mapping-service status
sudo -n /usr/local/sbin/mapping-service restart
sudo -n /usr/local/sbin/mapping-service logs
```

The wrapper is root-owned and limited to this API service. The shared SSH key and unrelated deployment accounts remain unchanged. Database administration and Nginx changes remain administrator tasks.

## Data and acceptance

EstateAtlas was frozen at the application layer before export, including direct port-8021 requests. Its startup integration was disabled before restarting AgriNexus, preventing startup imports during the snapshot.

Final private export: `/home/deploy_mapping/backups/metadata-final-20261006`. It matches the staging export: 2 estates, 67 assets, 42 legacy activities, 2 sources, 0 access grants, 255 blocks, 885 harvesting records, and 4,441 field activities. The importer verified checksums and imported into an empty dedicated database. Independent `Admin` was created with the user-authorized temporary password; no password is recorded here.

All 459 copied data files matched their original SHA-256 hashes. Two root-owned import journals were excluded from active data but included in the complete old-tree archive. All 67 stored assets verified. Both QGIS projects rendered (14 and 32 layers) with the entire AgriNexus path inaccessible.

Production acceptance passed 198 checks, including independent authentication, secure cookies, unauthorized access denial, estate isolation, pagination, all offline file hashes, terrain rendering, synthetic harvesting/field writes and image upload, viewer restrictions, logout and session expiry. All UUID-scoped fixtures were removed; original metadata digests were unchanged.

Private acceptance report: `/home/deploy_mapping/backups/acceptance-20261006.json`.
Acceptance script SHA-256: `2a99d1ec60668b53a6a365f0661e4b97f0c52f64ac9eb0bf83e91962b9e1661c` (source commit `a7508b03aca14441d7b4a2422bc9ef1e4fbaafc2`).

## Recovery

Administrator configuration backups: `/root/mapping-separation-20261006`, including both Nginx configurations, original AgriNexus entry point, old frontend link target and private database recovery URI.

Complete old-tree archive: `/home/deploy_mapping/backups/estate-atlas-before-separation-20261006.tar`.
SHA-256: `8dce8f2b437e6ce031f58f43631d224de1818e501bf48f066d1dda80b5840663`.
The archive was read and verified, including the two formerly unreadable journals.

After independent writes begin, rollback must reconcile new Mapping data before restoring an old upstream. Never blindly switch back to AgriNexus or restore the pre-cutover snapshot over current Mapping data.

## Final retirement status

Browser acceptance passed fresh Admin login/logout, estate switching, table deep-link refresh, 885 harvesting records, 25-block Google Earth export, dated imagery and live terrain/contours. No business records were changed by browser checks.

Final retirement is complete:

- Removed `/opt/digitalpalm/agrinexus/estate-atlas` and the old `digitalpalm-UI/dist/EstateAtlas` symlink after archive verification.
- Moved 62 verified EstateAtlas-specific staging artifacts from `/home/deploy_agrinexus/releases` into `/home/deploy_mapping/backups/agrinexus-staging-retired-20261006`. Its `retired-artifacts.json` records the exact scope.
- Removed EstateAtlas startup registration and the temporary Mapping CORS allowance from AgriNexus. Retained an explicit direct-port API tombstone.
- Old-host `/EstateAtlas`, `/EstateAtlas/`, `/api/EstateAtlas` and descendants return 410. Direct port-8021 EstateAtlas requests also return 410.
- Preserved unrelated AgriNexus `/mapping`, `/api/mapping`, mobile mapping, shared accounts and other data. Shared health and `/mapping` returned 200 after retirement.
- The effective AgriNexus Nginx file is a regular file at `/etc/nginx/sites-enabled/agrinexus.digitalpalm.ai`, not a symlink. Both enabled and available copies were updated, validated and backed up; the enabled-file original is `agrinexus.enabled.before` in the root backup directory.
- Tested restart as `deploy_mapping` through its limited sudo wrapper after old-tree deletion; Mapping returned healthy independent-session status.

Final AgriNexus entry-point SHA-256: `be4fffb2aa6e7a13037a756df95dddc2c6b0d87d4253d2f973d439df99a76e0f`.
Final `HttpSecurity.js` SHA-256: `5a40de2bf79f6558fe5f5be8dc2043c7b8f751773403c09c232b87f6508ae37f`.

The eight inactive old EstateAtlas collections are retained for recovery; the shared AgriNexus database is not dropped. Database collection deletion is a separate cleanup after a chosen recovery period. No automatic deletion has been scheduled.

Native binaries still need their independent sign-in flow and rebuild in the Mapping project. Existing offline content on disconnected old-host devices cannot be remotely erased; users must remove old saved content and download Mapping packs on the new domain.

## Final independent confirmations

The scoped `deploy_mapping` restart passed after old-tree deletion at **6 October 2026, 04:12:38 MYT**; Mapping returned healthy `mapping-session` status.

The AgriNexus project independently reported 24 HTTPS retirement checks, 21 direct-port checks and 99 live source hashes passing. Its login, mobile mapping, access controls and dashboard baseline were preserved. AgriNexus source/evidence was pushed to `main` at `922558f43d6c1e297c3b884976e6e20bf37213f9`.

Mapping browser acceptance and tooling are recorded above. All server work is complete; the administrator's root session is closed. Native independent login and rebuilt binaries remain separate work.
