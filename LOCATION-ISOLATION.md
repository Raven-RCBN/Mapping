# Location isolation and access rollout

Verified on Malaysia (`76.13.218.53`) on 20 October 2026. Active release at audit:
`/home/deploy_mapping/app/releases/20261018-sustainability-feed`.

## Access model

The existing `Admin` account is the protected superuser. It sees all current and
future locations without assignment and alone can create locations and manage users.
Other Mapping session accounts receive explicit per-location menu/action grants.
Unknown endpoints and full-estate offline/export bundles are denied to these accounts.
Passwords are hashed; grants are reread on each request; saving an account revokes
its existing sessions. Location creation provisions UUID-based folders, so names
never become filesystem paths. Renaming a display label will not move its data.

## Database and files

Database collections are shared, with estateId as the logical isolation key; these
are not separate MongoDB databases. Every nonempty estate-data collection checked
contained only registered estate IDs. OBAN and Sungai Gumut map assets all reside
inside `data/estates/<estateId>/` (38 and 30 respectively; no outside paths).
OPSL is registered with no estate data. Its missing empty root/images/boundaries/imports
folders were created on Malaysia, owned by deploy_mapping, mode 0750.

Selected OBAN counts: 22,788 monthly production; 1,880 yearly production;
18,085 trial-balance details; 185 trial-balance summaries; 3,831 wages;
1,038 vehicle transactions. Sungai Gumut: 885 harvesting and 4,441 field records.
No financial records or existing map files were changed by this audit.

## Migration inventory and legacy exceptions

- Archive export already streams each estate's database records and its estate folder.
- HTS and yield snapshots are separately keyed by estate ID under `hts-analysis/`
  and `yield-models/`. Include these estate-specific files when migrating an estate.
- Older OBAN import snapshots remain in global `production-imports/`,
  `wages-imports/`, `mandays-imports/`, and `rainfall-imports/`. They are historical
  recovery material, not the live database. Inspect their embedded estate scope
  before including them in a migration. They were not moved or deleted.
- Future import backups in the modified deployment scripts go to
  `estates/<estateId>/imports/<import-kind>/` and are included with that estate.
- Authentication sessions, shared credentials, AI budget ledger and shared runtime
  tools are application-wide. Never copy or roll back these with one estate.
- Future transfers must go directly server-to-server, with counts and hashes
  checked on both sides; never route application/database backups through the Mac.

The live app has newer sustainability-feed work than local HEAD. Deploy the access
change as a reviewed patch over the current release, preserving that work and all
live data. A local build or Git push does not constitute deployment.
