# Sustainability connection

Production source: https://mapintel.agrinexus.ai (Malaysia). Advisory destination:
https://agintel.agrinexus.ai. The feed exposes only OBAN estate
`f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae`, through GET requests to
`/api/EstateAtlas/integrations/sustainability/oban`, its dated images and mosaic tiles.

Mapping installs `sustainabilityFeed.js` and `sustainabilityFeedAuth.js` under
`apps/api/src/service/`. The independent server hook is installed by
`install-hook.py`. Retain this hook and its private runtime setting on future
Mapping releases. This connection credential is not accepted by Mapping's general
API or write routes. Existing browser sessions and Mapping access grants remain
independent.

`SUSTAINABILITY_FEED_TOKEN` (Mapping) and `LUCA_MAPINTEL_TOKEN` (Advisory) share a
private random 32-byte hex value. Advisory requires the explicit tenant binding
`LUCA_MAPINTEL_TENANT=agriintel`. Never put these values in Git, build output or
browser storage. The Advisory proxy uses only the canonical HTTPS origin and
rejects redirects. An upstream error is surfaced; it never falls back to the local
example. Images and tiles pass through the authenticated Advisory API.

The feed reads current Mapping DB records, active imagery assets and its current
HTS source. It declares mosaic PNG orientation to prevent a second flip. The UI
selects only block-years with complete boundary, production and fertiliser inputs.
A fresh source revision is computed from DB revisions/timestamps, asset hashes and
HTS source modification time. Advisory caches its manifest for 60 seconds and the
Refresh Mapping data button forces a fresh read. Images are fetched from Mapping
on demand; no production imagery is copied into the Advisory release.
