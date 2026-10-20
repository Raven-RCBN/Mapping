# User Access publication — 20 October 2026

Published to Malaysia only: `https://mapintel.agrinexus.ai` (`76.13.218.53`).

- Runtime Git revision: `b46b8528500873f7547260fa1d486f8e6e3c948b` on `codex/digitalpalm-stack`.
- Release: `/home/deploy_mapping/app/releases/20261020-user-access-b46b852`.
- Previous release: `/home/deploy_mapping/app/releases/20261018-sustainability-feed`.
- Frontend: `/var/www/mapping.digitalpalm.ai/public` now links to `public-20261020-b46b852` in that directory.
- Rollback material remains on Malaysia at `/srv/backups/mapintel/user-access-20261020-b46b852`; includes database archive, original static files, collection-count/user-session receipts and prior release path.
- Previous static directory is also retained as `/var/www/mapping.digitalpalm.ai/public-before-20261020`.

## Reconciliation

Fetched and incorporated sustainability feed commit `8a07609`. Compared live source against that Git revision; older frontend source files on the server lacked the already-committed trial-balance/pagination features, so built the intended Git source rather than those stale files. Preserved the live multiple-HTTPS-origin authentication support in source and added regression coverage. No private environment, data or AI state was copied from another deployment. Database backups stayed on Malaysia.

## Verification

- 166 automated tests passed, zero failures.
- Production frontend built successfully. Existing large-chunk advisory remains.
- Uploaded source and frontend SHA256 checksums matched.
- Canonical HTTPS frontend returned the exact staged index; new hashed JavaScript bundle returned successfully.
- API health: OK, MongoDB metadata, filesystem storage, paged queries, Mapping-session authentication.
- Unauthenticated User Access API: 401; sustainability feed: 401.
- Mapping service active/running as `deploy_mapping`; MongoDB active. Only Mapping restarted.
- All 25 collection counts unchanged, including 3 estates, 68 assets, 18,085 trial-balance details, 185 summary rows, 1 user and 1 session. User and session documents had identical before/after digests.
- Browser-rendered live URL showed the expected sign-in screen. This browser did not hold a live session; authenticated UI behavior was verified in the isolated local preview and automated tests, not by entering production credentials.

## Operational limits

The estate selector now scrolls and filters, but bootstrap/per-user assignment limits remain 100 estates. Server-paginated estate loading is needed before exceeding that scale. This release does not claim unlimited estate loading.

A rollback must preserve subsequent database writes. Restore code/static pointers only unless separately planning a reconciled data recovery; do not blindly restore the database archive.
