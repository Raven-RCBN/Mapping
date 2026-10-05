# Current domain

Estate Atlas now publishes its frontend at `https://mapping.digitalpalm.ai/`. See [the cutover status and remaining administrator work](MAPPING-CUTOVER.md). The backend, identity, database, files and QGIS are still shared with AgriNexus; do not delete them.

The following section describes the retained legacy integration and rollback procedure.

# Legacy AgriNexus deployment

The existing AgriNexus frontend stays intact. Nginx's existing directory handling serves a separate `dist/EstateAtlas` symlink and redirects `/EstateAtlas` to `/EstateAtlas/`. No Nginx configuration changes are needed for this single-page app.

Build with:

```sh
VITE_BASE_PATH=/EstateAtlas/ VITE_API_BASE=/api/EstateAtlas VITE_AGRINEXUS_SESSION=true pnpm build
node scripts/deploy/check-subpath.mjs
```

Vite assets, React Router basename, icons, manifest and service-worker scope use `/EstateAtlas/`. The worker and offline caches are namespaced and never control `/mapping`. The native app accepts `https://agrinexus.digitalpalm.ai/EstateAtlas` as its server address.

## Current host integration

- Persistent files: `/opt/digitalpalm/agrinexus/estate-atlas/data/estates/<id>/`.
- Versioned releases and `current` link: `/opt/digitalpalm/agrinexus/estate-atlas/`.
- API: `/api/EstateAtlas`, mounted before existing routes through `scripts/deploy/agrinexus-entry.mjs`.
- Uses the existing AgriNexus MongoDB connection with dedicated `EstateAtlas*` models/collections. No existing application records or schemas are modified. Images remain ordinary files.
- Reuses the host's `AuthHandler` to verify its existing signed session cookie or bearer token. Existing root administrators can manage EstateAtlas. Other users need an active `EstateAtlasAccessGrant` with a role and explicit estate IDs. Never use the browser's user/role JSON as proof of authorization.
- Initial estate import checks all file SHA-256 values and uses `$setOnInsert`; a persistent marker prevents repeated initial imports. It does not overwrite uploads or activities on later deploys.
- QGIS 3.44.14 is installed in an isolated conda-forge runtime under `tools/qgis`. On this host, the private CGI adapter invokes the QGIS Python rendering engine against `published.qgz`. It supports only the validated elevation/hillshade/slope requests, at most two simultaneous renders with a 25-second limit. No QGIS network port is exposed. A dedicated QGIS Server WMS deployment remains supported for larger installations.
- AgriNexus API remains managed by its existing service wrapper. The host Node runtime, its dependency tree, environment and credentials are unchanged; EstateAtlas has its own locked dependencies.

## Publish and rollback

Stage source, install production API dependencies with the repository lockfile and validate QGIS rendering before publishing. Re-resolve the AgriNexus `current` link, back up the API entry file and checksum the existing frontend. Mount the integration in the backend and restart only with the documented `agrinexus-service` wrapper. Publish only the new `EstateAtlas` symlink; never replace the parent frontend or `/mapping`.

The first deployment's backup is `/home/deploy_agrinexus/releases/EstateAtlas-before-20261004`, containing the previous API entry file and frontend checksums. To roll back, restore that entry file, restart the API, and remove only the new frontend symlink. Keep the persistent data directory. Subsequent releases can switch the EstateAtlas links after verification; retain older releases for rollback.

## Independent deployment

See [INDEPENDENT-MAPPING.md](INDEPENDENT-MAPPING.md) for Mapping-owned files, independent authentication/database provisioning, service activation and final old-site cleanup.

## Services and storage

- React build served by Express, or by a reverse proxy forwarding `/api` to Express.
- A dedicated MongoDB database for estate, activity, asset and access-grant metadata.
- A persistent `DATA_DIR` mounted by the API read/write and QGIS read-only. Back up files and metadata together. Never store the upload folder only inside an ephemeral container.
- QGIS Server LTR on a private network. The API chooses a fixed authorised project under `QGIS_PROJECT_ROOT/<estate-id>/qgis/published.qgz`; clients cannot pass arbitrary MAP paths or server URLs.
- Public HTTPS reverse proxy to the API only. QGIS and MongoDB must not be publicly exposed.

The supplied `compose.yaml` starts local MongoDB and QGIS. `compose.production.yaml` adds the app image and requires environment variables. Configure the JWT public key and persistent volume before starting it; it fails closed without JWT settings. Pin/update image versions under your operational release process. Production topology should use a supported 64-bit host; the pinned QGIS image is amd64.

## DigitalPalm identity

The API verifies RS256 JWT signatures, issuer and audience. Configure `JWT_PUBLIC_KEY_PATH`, `JWT_ISSUER`, and `JWT_AUDIENCE` using DigitalPalm's identity environment. An active `MappingAccessGrant` for the subject (`Id` or `sub`) is also required, specifying `viewer`, `manager` or `admin` and estate IDs. Issuer/audience configuration must agree with tokens issued by DigitalPalm; the neighbouring code's signing keys have not been copied. Integrate the existing login/token renewal flow when the production app location is provided.

Example metadata provisioned by an administrator in the mapping database:

```json
{"_id":"digitalpalm-user-id","role":"manager","estateIds":["sg-gumut"],"active":true}
```

Viewers cannot import, configure sources or verify activity. Managers are limited to their granted estates. Administrators can add estates. File downloads and offline packages use the same checks. Downloads on an already disconnected device cannot be revoked remotely.

## Next production connections

For standalone hosting, configure the persistent disk/object-storage arrangement and DigitalPalm issuer/public key. AgriNexus hosting already reuses its existing identity flow. Add activity synchronization, the acquisition scheduler and reviewed QField synchronisation using their authorised API contracts. The current source settings persist configuration only; no background acquisition jobs are claimed to run.

## QGIS updates

For a new estate publish `data/estates/<id>/qgis/published.qgz` with layer short names `terrain`, `hillshade`, `slope` and relative local paths. Mark the estate metadata `qgis: true` after validating all project layers. Upload georeferenced image exports with capture dates for browser/mobile history. Native QGIS projects and GeoTIFFs remain files, outside MongoDB and source control.
