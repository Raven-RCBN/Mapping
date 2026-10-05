# Mapping domain cutover — 6 October 2026

## Published frontend

- New URL: https://mapping.digitalpalm.ai/
- Public files: `/var/www/mapping.digitalpalm.ai/public`.
- Release: `/home/deploy_mapping/releases/20261006T-root-login-v3`.
- Previous public contents: `/home/deploy_mapping/backups/20261006T-before-root`.
- Build: `VITE_BASE_PATH=/ VITE_API_BASE=/api/EstateAtlas VITE_AGRINEXUS_SESSION=true VITE_LOCAL_SIGN_IN=true VITE_BRANDING_ORIGIN=https://agrinexus.digitalpalm.ai pnpm build`.
- Run `node scripts/deploy/check-root.mjs` after building.
- Login: same-origin `/api/v1/users/login`, using the existing verified identity service and host-only signed HTTP-only secure cookie. No credential or token is embedded in browser builds. There is no automatic refresh endpoint in the current identity service: expired sessions prompt a fresh sign-in.
- Logout: same-origin `/api/v1/users/logout`; clear private offline package and Redux data after successful logout.
- Native source defaults to the new domain and `/api/EstateAtlas`; installed binaries need rebuilding.
- Offline packages are origin-specific. Users must download their estates again on the new domain.

## Verification and administrator handover

The owner confirmed on 6 October that their administrator will perform the server changes below. The frontend is published; backend separation and old-URL retirement are pending that work.

Verified on the new origin: existing `Admin` identity signs in and signs out correctly, estate switching, data-table deep-link refresh, Google Earth export, QGIS terrain rendering, and Oban's complete 36-file offline download. The API rejects unauthenticated estate requests with 401 and missing static assets return 404. Shared/store tests: 25 passed; API integration tests: 28 passed. Production records were not changed for testing. Offline download was verified; disconnected-device operation and rebuilt native binaries still require acceptance testing.

The login reuses the existing identity; no new account, password reset, or hard-coded password was introduced. Usernames are case-sensitive. Replace the temporary password through the identity administrator's normal process.

## Remaining dependencies — do not delete

The new domain still proxies `/api/` to the shared API on port 8021. Identity and EstateAtlas MongoDB collections remain in AgriNexus. Persistent imagery/files (237 MB at inspection) and QGIS (4.4 GB) remain under `/opt/digitalpalm/agrinexus/estate-atlas`. The current API release is `releases/20261005T-harvester-popup`.

The exact new origin was added to host CORS and EstateAtlas origin checks. Backups of the two affected files are in `/home/deploy_agrinexus/releases/Mapping-origin-before-20261006`. No cookie domain broadening or database migration was performed.

## Administrator work required for independent backend

Neither deployment account has permission to configure Nginx or a new managed service. Before removing old backend/data/tools:

1. Provision a managed Mapping service and private loopback upstream, a dedicated metadata database/user and independent verified authentication. Do not guess a port or expose MongoDB/QGIS.
2. Back up database metadata and files together; migrate dedicated EstateAtlas collections and access grants, imagery, QGIS projects and runtime. Copying the conda QGIS directory alone is not sufficient to prove relocation: validate runtime paths and render projects under the new path.
3. Configure Mapping `/api/` to the verified new service. Keep `/api/EstateAtlas` compatibility or migrate clients and offline file URLs together. Restrict proxy routes to Mapping and required identity endpoints.
4. Verify logins, expiry/logout, all grants, estate counts and hashes, QGIS rendering, uploads and writes against the new database, browser/native downloads and offline use.
5. Only then remove the AgriNexus API integration and old API routes, using its service wrapper; verify ordinary AgriNexus functionality.

## Retire old frontend URL

After new-origin acceptance, archive the exact old frontend symlink and obsolete web releases with recoverable backups. Preserve `/mapping` and the shared API/data/tools above. An administrator must add these directives **inside the HTTPS AgriNexus server block**, then run `nginx -t` and reload Nginx:

```nginx
location = /EstateAtlas { return 410; }
location ^~ /EstateAtlas/ { return 410; }
```

Do not apply a global `/mapping` block. Do not block Mapping's `/api/EstateAtlas` while it is the live upstream. At final API retirement, block the old host's exact `/api/EstateAtlas` and its descendants independently.

Existing installed old-host PWAs may show previously saved offline content; a server 410 cannot remotely erase a disconnected device. Users should remove old offline data and use the new domain.

## Change order, acceptance and rollback

1. The administrator can retire the old frontend separately, after confirming the new URL with users. Save the AgriNexus Nginx file and exact old `dist/EstateAtlas` symlink target before editing. Apply only the two case-sensitive location rules above. Run `sudo nginx -t` before reloading.
2. Confirm `/EstateAtlas` and `/EstateAtlas/` return 410, `/mapping` remains available, Mapping's root and assets return 200, and Mapping sign-in plus estate data still work. If any check fails, restore the saved Nginx file, validate and reload.
3. Archive obsolete frontend files outside the served directory only after these checks. Keep a recoverable archive; no backend, data or QGIS cleanup is authorized by this frontend step.
4. Treat independent authentication/database/service migration as a separate cutover. Record the administrator-selected service name, loopback port, database credentials reference, data root and QGIS runtime before configuring them. Those values have not been provisioned and this document is not a ready-to-run backend migration script.
5. Keep the existing upstream until all independent-backend acceptance checks pass. Roll back Mapping's upstream if needed; avoid writes to two databases during rollback. Remove shared dependencies only after a verified backup and the agreed retention period.

Frontend rollback: `/home/deploy_mapping/backups/20261006T-before-root-v3` contains the previous public files. Restore its entry point and service worker together with its assets if necessary; preserve current assets for clients with an open tab. The original pre-cutover public directory is retained in the earlier backup listed above.
