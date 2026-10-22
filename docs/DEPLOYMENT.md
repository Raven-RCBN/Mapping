# Mapping / MapIntel production deployment

Updated 23 October 2026 (Asia/Kuala_Lumpur).

Production application deployments target **Malaysia: 76.13.218.53**, Hostinger
KVM 8, `srv2071562.hstgr.cloud`. India `187.127.167.149` / `srv1670614`
is not an application deployment target for this app. Its retired deployment
accounts/services must not be reactivated. Never select the SSH destination by
resolving a public digitalpalm.ai hostname: those names can still point to India.

Preserve live users, sessions, environment, uploads, database and application
settings. Review Git status and the intended revision; preserve unrelated work.
A Git push does not deploy production. Back up current Malaysia state before
publication, retain a previous code release, and restart only this application's
service when required. Never initialize or restore old India data over live data.
Transfer migration/backup data directly server-to-server; the Mac only orchestrates
and verifies. Binary Docker transfer helpers require `--log-driver none`.
Do not commit credentials, environment values, databases, backups or SSH keys.

Use existing protected SSH credentials with strict host verification. Malaysia's
ED25519 fingerprint is `SHA256:snKgdDjK7Dvuca8i2zpGA8KQkFwyqQaOyL0+Vy8nUeE`.
The existing local pinned host file is
`/Users/admin/Documents/ChatGPT/Server Check/new-kvm8-setup/known_hosts`;
the protected deployment key reference is
`/Users/admin/.ssh/digitalpalm_deploy_ed25519`. Never copy key material.

- Canonical URL: https://mapintel.agrinexus.ai, DNS directly to Malaysia.
- `mapping.digitalpalm.ai` is retired and returns 410 Gone on India. Do not
  restore or forward it. A directory retaining that hostname is still valid.
- Backend: `digitalpalm-mapping.service`, user `deploy_mapping`, localhost 8031,
  entry `apps/api/src/independent-server.js` in `/home/deploy_mapping/app/current`.
- Releases: `/home/deploy_mapping/app/releases`; resolve `current` before work.
  On 23 October it points to `20261021-material-pack-totals`.
- Node 24.22.1:
  `/home/deploy_mapping/app/tools/node-v24.22.1-linux-x64/bin/node`.
- Native `mongod-mapping.service`, MongoDB 7.0.45, localhost 27031,
  database `DigitalPalmMapping`.
- Private environment `/home/deploy_mapping/app/mapping.env`; persistent data
  `/home/deploy_mapping/app/data`; Node/QGIS tools `/home/deploy_mapping/app/tools`.
- Static frontend `/var/www/mapping.digitalpalm.ai/public` is intentional.
- Verified administrative SSH route: `root@76.13.218.53`. A dedicated
  `mapping-service` sudo helper does **not** exist on Malaysia as of this check.
  Do not assume the former India helper/access was migrated. Inspect and use
  established permissions before publication; administrators manage systemd.
- Verify `/api/EstateAtlas/health`, login, estate navigation, files and QGIS.

Build frontend using the repository's locked dependencies and:
```sh
VITE_BASE_PATH=/ VITE_API_BASE=/api/EstateAtlas \
VITE_AGRINEXUS_SESSION=true VITE_LOCAL_SIGN_IN=true \
VITE_STATIC_BRANDING_LOGO=/branding/minor-logo.png pnpm build
node scripts/deploy/check-root.mjs
```
Publish only `apps/web/dist`: assets before HTML, retain older hashed assets for
open tabs. Static publication needs no backend restart. Backend releases go under
the releases path above; preserve external data/environment, validate QGIS/file
access, update only `current`, then restart only `digitalpalm-mapping.service`.
Never rerun `prepare-independent-db.mjs` against production.

Historical India recovery archive, on Malaysia:
`/srv/backups/mapintel/india-retirement-20261018.tar.gz`. Restore into isolation
and reconcile subsequent Malaysia writes before any production recovery.
