# Mapping domain cutover — complete 6 October 2026

**Current URL: https://mapping.digitalpalm.ai/**

The frontend, API, authentication, database process, imagery and QGIS runtime now belong to Mapping. The live API uses independent port 8031 and MongoDB uses 27031. The former AgriNexus upstream is retired.

- [Current independent deployment](INDEPENDENT-MAPPING.md)
- [Final server cutover and cleanup evidence](SERVER-SEPARATION-20261006.md)
- [Future deployment instructions](DEPLOYMENT.md)

The old `/EstateAtlas` frontend and `/api/EstateAtlas` API paths return 410 on AgriNexus. Its unrelated `/mapping` page remains available. Old Mapping files were archived under Mapping's account before removal; inactive old metadata collections are retained only for recovery.

Frontend release: `/home/deploy_mapping/releases/20261006T-independent-ready`. Application release: `/home/deploy_mapping/app/releases/5336eff`. Root assets, router, manifest and service worker use `/`. Browser-safe branding is copied into `/branding/minor-logo.png`.

Build configuration:

```sh
VITE_BASE_PATH=/ VITE_API_BASE=/api/EstateAtlas \
VITE_AGRINEXUS_SESSION=true VITE_LOCAL_SIGN_IN=true \
VITE_STATIC_BRANDING_LOGO=/branding/minor-logo.png pnpm build
node scripts/deploy/check-root.mjs
```

`VITE_LOCAL_SIGN_IN=true` disables legacy AgriNexus local-storage token reuse; the independent host-only cookie authenticates the web app. The compatibility-named build flag does not connect to AgriNexus.

Browser login/logout, estate switching, data-table refresh, terrain, imagery and Google Earth export passed. Production acceptance passed 198 checks with original metadata unchanged after fixture cleanup. Native independent sign-in and rebuilt binaries remain separate work; existing old-host offline copies cannot be remotely erased.

Earlier staged/shared-upstream instructions are superseded. Do not point the live domain back to port 8021 or rerun the initial database import.
