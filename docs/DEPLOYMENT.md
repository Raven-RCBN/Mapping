# Mapping production deployment

Mapping is independent at **https://mapping.digitalpalm.ai/**. Read [the final server report](SERVER-SEPARATION-20261006.md) and [current architecture](INDEPENDENT-MAPPING.md) before changing production.

## SSH and API restart

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes \
  -i /Users/admin/.ssh/digitalpalm_deploy_ed25519 deploy_mapping@187.127.167.149
sudo -n /usr/local/sbin/mapping-service status
sudo -n /usr/local/sbin/mapping-service restart
sudo -n /usr/local/sbin/mapping-service logs
```

The helper manages only `digitalpalm-mapping.service`. Nginx and database administration require administrator access. Preserve the shared SSH key and unrelated deployment accounts.

## Runtime and persistence

- API: own Node runtime and `apps/api/src/independent-server.js`, bound to `127.0.0.1:8031`.
- MongoDB: dedicated `mongod-mapping.service` on `127.0.0.1:27031`, restricted user for `DigitalPalmMapping` only.
- API source: `/home/deploy_mapping/app/current`.
- Private environment: `/home/deploy_mapping/app/mapping.env`, mode 0600. Never copy its values into source or logs.
- Estate files: `/home/deploy_mapping/app/data`. Images remain files; MongoDB holds metadata, records and sessions.
- Node/QGIS: `/home/deploy_mapping/app/tools`. QGIS uses private CGI rendering with validated layers, two-render concurrency and a 25-second timeout. It has no public port.
- Frontend: `/var/www/mapping.digitalpalm.ai/public`; Nginx proxies `/api/` to 8031.

Keep private files, backups and source outside the public directory. Back up database metadata and files together. Both services start at boot. The API service cannot access the old AgriNexus path and may write only its data directory plus private temporary storage.

## Frontend publication

Build from the repository with:

```sh
VITE_BASE_PATH=/ VITE_API_BASE=/api/EstateAtlas \
VITE_AGRINEXUS_SESSION=true VITE_LOCAL_SIGN_IN=true \
VITE_STATIC_BRANDING_LOGO=/branding/minor-logo.png pnpm build
node scripts/deploy/check-root.mjs
```

Publish only `apps/web/dist`. Preserve a recoverable backup outside the public directory. Copy new hashed assets and branding before the HTML entry point, retaining older hashed assets for existing tabs. Verify root/deep-link refresh, asset 404 behavior, login/logout and estate navigation. Static publication requires no API restart.

The minor logo is a Mapping-owned branding snapshot. Publish updates directly to Mapping when the brand changes.

## Backend publication

Stage a new release under `/home/deploy_mapping/app/releases`, install dependencies from the lockfile using its Node runtime, run applicable tests, and validate QGIS/file access. Change only Mapping's `current` link, then restart using the scoped helper. Preserve the external environment and data directories.

The service entry point is `independent-server.js`, not the legacy AgriNexus registration module or the generic JWT server. The repository's original Docker/JWT examples are development or alternative-deployment references, not the current production configuration.

Never rerun `prepare-independent-db.mjs` against production. It was a one-time import into an empty database. Native clients require independent authentication integration and rebuilding before deployment.

## Validation and rollback

Production cutover passed 198 API/storage/auth checks and browser acceptance. Tooling `scripts/deploy/accept-independent.mjs` creates UUID-scoped synthetic fixtures, removes only them, and verifies original metadata digests. Coordinate a write-free window and pass its secrets privately when rerunning it.

Use the final export to validate copied assets and QGIS:

```sh
cd /home/deploy_mapping/app/current
sh scripts/deploy/check-independent-files.sh \
  /home/deploy_mapping/backups/metadata-final-20261006
```

Current-data backups must precede rollback. Do not restore the old snapshot over post-cutover writes. The old EstateAtlas files are archived and its routes return 410; AgriNexus `/mapping` is separate and must not be modified by a Mapping deployment.
