# Independent Mapping handover

Prepared 6 October 2026. The owner requested Mapping's files and backend be separated from AgriNexus, and confirmed their administrator will apply privileged server changes.

## Status

- Frontend is live at https://mapping.digitalpalm.ai/.
- Mapping-owned source: `/home/deploy_mapping/app/current`.
- Private imagery, uploads, boundaries and QGIS projects: `/home/deploy_mapping/app/data`.
- Independent Node and QGIS runtime: `/home/deploy_mapping/app/tools`. QGIS was recreated from the exact installed conda package inventory at its new prefix, not linked to the old runtime.
- Mapping-only metadata export: `/home/deploy_mapping/backups/metadata-20261006`. Eight collections: 2 estates, 67 assets, 42 legacy activities, 2 source configurations, 0 explicit access grants, 255 block records, 885 harvesting records and 4,441 field-activity records. AgriNexus users and credentials were not copied.
- Independent backend and login code are staged and tested, **not yet the active upstream**. The live frontend continues using port 8021 until the administrator activates the replacement.
- No old live files or database records have been deleted. They remain required by the current upstream.

All 67 stored assets passed SHA-256 verification in the new folder. Both copied QGIS projects loaded valid layers and rendered PNGs (Oban: 14 layers; Sungai Gumut: 32 layers), with no project layer paths pointing back to AgriNexus. The relocated runtime reports existing optional HDF/PDAL plugin warnings; the terrain rendering checks passed.

The data transfer copied 237 MB of active estate files. Two old, root-owned hidden GIS import journals (`.gis-before-7eb5ce38b31812559d58501c3f81363d1757e0cb2d800d13f1563792f48b1324.json` and `.gis-7eb5ce38b31812559d58501c3f81363d1757e0cb2d800d13f1563792f48b1324`) could not be read by the deployment account. They are not runtime inputs for the independent service; the administrator should archive them with the old tree before cleanup. The transfer command reported these two exclusions, so it must not be described as an exact complete archive of the old directory.

The export is a staging snapshot, not an atomic backup. Stop Mapping writes and repeat export/file synchronization at final cutover if any changes have occurred. Do not overwrite the live AgriNexus database or import into an existing destination database.

## Administrator activation

1. Provision a dedicated `DigitalPalmMapping` database and database user with access to that database only. Do not reuse AgriNexus database credentials. The MongoDB server may be shared infrastructure, but the Mapping database and account must be separate; use a dedicated MongoDB instance if full process isolation is required.
2. Assign an unused loopback API port. The supplied service binds only to `127.0.0.1`; no port has been invented or activated by deployment automation.
3. Copy `scripts/deploy/mapping.env.example` to `/home/deploy_mapping/app/mapping.env`, fill `PORT` and `MONGODB_URI`, and set owner `deploy_mapping:deploy_mapping`, mode `0600`. Preserve the other Mapping-only paths.
4. As `deploy_mapping`, import the verified metadata into the **empty** database and create its independent administrator. Enter the URI and temporary password interactively, not as literal shell history:

```bash
cd /home/deploy_mapping/app/current
read -rsp 'Dedicated Mapping database URI: ' MAPPING_TARGET_URI; echo
read -rsp 'Mapping Admin temporary password: ' MAPPING_ADMIN_PASSWORD; echo
export MAPPING_TARGET_URI MAPPING_ADMIN_PASSWORD
/home/deploy_mapping/app/tools/node-v24.19.0-linux-x64/bin/node \
  scripts/deploy/prepare-independent-db.mjs \
  /home/deploy_mapping/backups/metadata-20261006
unset MAPPING_TARGET_URI MAPPING_ADMIN_PASSWORD
```

The account name defaults to `Admin` (case-sensitive). The password is scrypt-hashed. The importer refuses a nonempty database or invalid archive checksum. An interrupted import leaves a partially populated destination; inspect it and restore/recreate only that new destination before retrying. Old access grants remain archived rather than being activated against unrelated identities.

5. Run `sh scripts/deploy/check-independent-files.sh`. It checks every stored asset hash, validates project layers and renders both estates using only new QGIS paths.
6. Install `scripts/deploy/mapping.service.example` as `/etc/systemd/system/digitalpalm-mapping.service`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now digitalpalm-mapping
sudo systemctl status digitalpalm-mapping --no-pager
```

The unit blocks filesystem access to `/opt/digitalpalm/agrinexus`, writes only to Mapping's data directory and starts as `deploy_mapping`. Confirm the local health endpoint using the assigned port. Its `auth` value must be `mapping-session`.

7. Back up `/etc/nginx/sites-available/mapping.digitalpalm.ai`. Change the existing `/api/` upstream from port 8021 to the assigned Mapping port, preserving the URI:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:ASSIGNED_MAPPING_PORT/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 50m;
    proxy_read_timeout 180s;
}
```

`ASSIGNED_MAPPING_PORT` is a required placeholder. Run `sudo nginx -t` before reloading. Keep API responses private. Never expose the data folder, database or QGIS as a static/public directory.

8. Test the **new independent** Admin sign-in/logout, session expiry, viewer estate restrictions, estate counts, table queries, uploads, harvesting/field-activity writes, file downloads, terrain rendering and offline download. Verify new writes land in `DigitalPalmMapping` and `/home/deploy_mapping/app/data`. Test while the service's inaccessible-path rule blocks all old files.

## Authentication and clients

The independent browser session uses a random 256-bit token in a host-only Secure/HttpOnly/SameSite=Strict cookie. Only its SHA-256 hash is stored in Mapping's database; sessions expire after eight hours and are revoked on logout. Each request reads the active user and its current role/estate scope. Login requests require the exact HTTPS origin and client header and are rate-limited. No AgriNexus signing key, password hash or cookie is reused.

The existing published frontend supports both the transitional login response and the independent one. A new independent login is required after the upstream switch. Browser offline packs belong to the prior identity and will be cleared on the first successful bootstrap of the new identity; download them again. Native binaries still require an independent native sign-in/token provisioning flow and rebuilding before acceptance; legacy AgriNexus tokens will not work with the independent session backend.

The minor logo is now a Mapping-owned static asset; this is a snapshot of the configured AgriNexus branding. Future branding changes need publishing to Mapping separately.

## Final removal of old Mapping files

Only after step 8 passes, freeze writes briefly for any final reconciliation and retain a coordinated metadata/files backup under `/home/deploy_mapping/backups`.

- Remove the EstateAtlas registration from AgriNexus's API entry and restart using its documented `agrinexus-service` wrapper. Keep unrelated AgriNexus routes, users, roles and `/mapping` intact.
- Add the case-sensitive old-host 410 routes described in `MAPPING-CUTOVER.md`, including `/api/EstateAtlas` after it is no longer the upstream.
- Archive then remove only the old `dist/EstateAtlas` link and `/opt/digitalpalm/agrinexus/estate-atlas` tree. The new runtime, source and assets must first pass the checks with that tree inaccessible.
- Remove only the eight `estateatlas*` collections after a checked backup, validation of the destination and the agreed recovery period. This is a separate deliberate administrator cleanup, not part of the import script.
- Remove the temporary export script/archive under `/home/deploy_agrinexus/releases` once the Mapping-owned copy is verified. Preserve the shared SSH accounts/keys.
- Remove only the migration-specific Mapping origin allowance from AgriNexus after there are no cross-origin clients depending on it.

Rollback before independent writes: restore the saved Mapping Nginx upstream to 8021 and sign in again. After independent writes, first reconcile/restore metadata and files; do not blindly switch back and lose new records. Keep the old tree until rollback and acceptance are complete. Source cleanup must not happen while the active upstream is shared.

## Validation

32 API tests (including four independent-session tests), 25 shared/store tests, the root-path build check and production build passed. The independent service has not been activated against its production database; that acceptance remains with the administrator.
