# Hosting handover

The user's hosting provider is still to be supplied. No DNS, production deployment or production database connection has been made.

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

Provide the hosting address, persistent disk/object-storage arrangement, DigitalPalm issuer/public key details and authorised activity API contract. Add the actual identity login flow, acquisition scheduler and reviewed QField synchronisation using those contracts. The current source settings persist configuration only; no background acquisition jobs are claimed to run.

## QGIS updates

For a new estate publish `data/estates/<id>/qgis/published.qgz` with layer short names `terrain`, `hillshade`, `slope` and relative local paths. Mark the estate metadata `qgis: true` after validating all project layers. Upload georeferenced image exports with capture dates for browser/mobile history. Native QGIS projects and GeoTIFFs remain files, outside MongoDB and source control.
