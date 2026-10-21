# DAFA IOT Movement — 21 October 2026

The separate IOT Movement tab beside Estate map and Time machine displays the four
supplied January–June 2026 CSV exports and read-only iPlant reception/crop summaries.
It uses an independent SVG coverage map and component-local work/month/date/block
filters. MapView.jsx is unchanged; the existing map remains mounted and hidden while
this tab is active. No Redux map-selection, production or activity state is changed
by IoT block selection. Other estates receive an empty response/view until their
private dataset is supplied.

Data is under the DAFA estate's private `iot-movement` directory inside DATA_DIR.
629 checksummed source, method and derived files are retained. Original CSVs,
source hashes, SQL summaries, exact SQL, analysis Python/notebook and review flags
remain private. No raw CSV or data JSON is placed in public frontend assets.
The authenticated GET `/iot-movement` route checks estate access and map permissions.
Its validated work/month/date/block filters return one period footprint and scoped
records. Dataset availability is determined by the estate directory, not a frontend
estate-name comparison. Another estate cannot fetch DAFA data through its own ID.
The largest tested response is 1,291,706 bytes; the static preview was 34 MB.

Work, month and block pickers reuse the compact searchable SearchSelect component.
Date supports daily selection plus previous/next available work date and whole-month
reset. Coverage, harvesting comparison and movement grids scroll independently with
sticky headers. The map supports block selection, fit estate and zoom controls.

## Definitions and limits

3,999 source rows; no exact duplicate rows or geometry parsing/validity failures.
Coordinates are flattened closed rings; containment reconstructs polygon nesting.
EPSG:32649 supplies hectare measurements. Full geometries determine all areas; 8 m
simplification is used for display only. Unique area unions footprints inside the
selected period; current-block coverage clips to the named polygon. Coverage % uses
the geometric polygon denominator; existing PDF production hectare/palm references
are untouched. Do not add unique hectares across dates/months or work types.
Movement polygons are not raw second-by-second tracks or proof of field application.
Reported ha sums materially differ from geometric footprints; buffer and treatment
logic is absent. Zero worker counts and absent device/person IDs prevent individual
productivity calculations. Source times are displayed without assumed timezone or
cross-block summation. Grabber collection bunches are separate from harvester counts.

28 current names occur; five old names and OUTSIDE PLANTATION remain flagged. No
bunches are reassigned spatially. Current boundaries postdate the movement period.
The matched-name bunch comparison is 335,997 IoT versus 394,170 iPlant reception;
missing source rows remain unavailable rather than confirmed zero production.
Daily reception sums team harvested normal + borongan where present, otherwise
header actual bunches. FFB crop statement bunches are a separate comparison measure.
Every daily bunch total reconciles to its monthly aggregate.

## Validation

- API tests: date/work/block scoping, rejected access, private cache policy, empty
  other-estate response, invalid date and path-like input rejection.
- Live preflight and post-publication: 27 API checks, including all 24 work/month
  combinations, a daily block sample, an empty other estate and denied access.
- SHA-256/count preservation checks passed for 12 existing DAFA collections.
- JSX component checks cover loading, populated numeric grids and other-estate
  empty state; frontend build succeeds.
- Browser checks include the new DAFA tab, searchable block selection, daily
  navigation, selected block coverage, independent coverage-grid scrolling, a live
  empty state for Sungai Gumut, switching back to DAFA, and return to the original
  estate map.

Deployment is Malaysia only at https://mapintel.agrinexus.ai. Earlier releases,
static entry point snapshots and original data remain available for recovery.

Final frontend release: `20261021-iot-movement-ready`.
MapView.jsx SHA-256 remains `c423b80e299e176b8b263d8e82655ecf1494ff7a9b3d42f1adf12cdd5dda2484`, matching the pre-IoT release.
