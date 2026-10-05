# Independent Mapping — active

Completed 6 October 2026. Mapping now runs independently at **https://mapping.digitalpalm.ai/**. The old Mapping application files have been archived under Mapping's account and removed from AgriNexus.

## Current services and files

| Component | Location |
| --- | --- |
| API | `digitalpalm-mapping.service`, `127.0.0.1:8031`, user `deploy_mapping` |
| MongoDB | `mongod-mapping.service`, `127.0.0.1:27031`, database `DigitalPalmMapping` |
| API source | `/home/deploy_mapping/app/current` → `releases/5336eff` |
| Private imagery, uploads and QGIS projects | `/home/deploy_mapping/app/data` |
| Node and QGIS runtime | `/home/deploy_mapping/app/tools` |
| Private configuration | `/home/deploy_mapping/app/mapping.env`, mode `0600` |
| Frontend | `/var/www/mapping.digitalpalm.ai/public` |
| Backups | `/home/deploy_mapping/backups` |

Mapping has its own database process, restricted database account, login sessions and files. Its API service is blocked from accessing `/opt/digitalpalm/agrinexus`. The frontend uses its own copy of the minor logo. Neither AgriNexus credentials nor its session cookies authenticate Mapping.

See [the final server report](SERVER-SEPARATION-20261006.md) for service configuration, acceptance, archive hashes and exact cleanup scope. See [deployment instructions](DEPLOYMENT.md) for future updates.

## Verification

- All 459 copied data files matched original hashes; all 67 registered map assets verified.
- Both QGIS projects rendered with the entire AgriNexus tree inaccessible.
- 198 production acceptance checks passed: authentication, roles, estate isolation, pagination, all offline file hashes, terrain, synthetic harvesting/field writes and image upload, logout and expiry. Temporary fixtures were removed and original metadata digests remained unchanged.
- Browser checks passed fresh Admin login/logout, Oban 239 block rows, Sungai Gumut 25 map blocks / 16 workbook rows, table refresh, 885 harvesting records/136,439 bunches, Google Earth export and visible terrain.
- The limited Mapping restart helper was tested successfully after deleting the old tree.

## Old application retirement

The old EstateAtlas tree and frontend link were removed after a complete verified archive. Another 62 EstateAtlas-specific staging artifacts were moved into Mapping-owned private backups. Old-host `/EstateAtlas` and `/api/EstateAtlas` routes, including direct port 8021 API access, return 410. AgriNexus's unrelated `/mapping`, APIs, accounts and data remain intact.

Eight inactive old EstateAtlas database collections remain only for recovery. They are no longer used by Mapping. Dropping them requires a separate chosen recovery period; no automatic deletion is scheduled.

## Authentication and client limits

Independent username `Admin` is case-sensitive. No password is stored in the repository. Browser sessions use host-only Secure/HttpOnly/SameSite=Strict cookies, server-side hashed tokens, eight-hour expiry and revocation on logout. User activity/estate permissions are checked on each request.

Native binaries still need their independent sign-in flow and rebuild; old AgriNexus tokens will not work. Production acceptance verified offline packages and file contents, not a new disconnected native installation. Old disconnected devices may retain earlier offline content and should remove it before downloading new-origin packages.

## Recovery and future checks

The verified old-tree archive and final metadata snapshot are under Mapping's private backups; exact locations and hashes are in the server report. Do not restore a pre-cutover snapshot over new live records or switch back without reconciling post-cutover writes.

`prepare-independent-db.mjs` is a one-time, empty-database migration tool. **Do not rerun it against the active database.**

The acceptance script belongs to tooling commit `a7508b0`; application runtime is `5336eff`. Re-running acceptance creates tightly scoped synthetic fixtures and checks full before/after metadata digests, so coordinate a write-free window. Secrets must be passed privately by the administrator. The QGIS/file checker accepts the final snapshot:

```sh
cd /home/deploy_mapping/app/current
sh scripts/deploy/check-independent-files.sh \
  /home/deploy_mapping/backups/metadata-final-20261006
```
