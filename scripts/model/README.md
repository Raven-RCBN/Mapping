# Local estate yield pilot

Uses scikit-learn (BSD-3-Clause), without a model API subscription. Run from a
Python 3.12 environment with `pip install -r scripts/model/requirements.txt`, then:

```
python scripts/model/train_yield.py
python scripts/model/verify_yield.py
```

Inputs are the existing Oban JSON extracts under `data/production`, `data/rainfall`
and `data/hts-analysis`. Training reads these files only. It overwrites generated
artifacts in `data/yield-models`: a scoped JSON snapshot for the app, held-out
predictions for reconciliation, and locally trained joblib models. Load joblib
files only from trusted training runs. Production serves JSON, never deserializes
joblib files, and enforces estate access.

Target: monthly recorded FFB tonnes per source block. Do not replace missing
values or not-received placeholders with zero. Separate sources sharing a mapped
polygon remain separate. Monthly hectares are optional; they are used only for
displaying tonnes/ha, not inferred from GIS polygon area.

Three direct forecast horizons are fitted separately. Candidates: regularised
regression and histogram gradient boosting. Features use records at or before
origin: season, production lags and recent mean, same month last year, rainfall
lags, and annual solid fertiliser quantities two calendar years earlier. Shared
polygon fertiliser quantities remain missing where attribution is ambiguous.
Palm age, nutrient doses, soil and leaf tests are not modelled due to unavailable
or unverified longitudinal inputs. No future rainfall forecast is required.

Training targets end December 2023. Candidate selection and error-band calibration
use 2024; held-out tests start 2025 with forecast origins no earlier than December
2024. This embargo prevents training on labels beyond a test forecast origin.
The final chosen candidate is refitted to all usable history only after evaluation.
The 5% MAE improvement gate is a pilot comparison, not proof of deployment fitness.
Month-end availability is assumed; source publication/revision dates are unknown.
Current crosswalks are used, so unrecorded historical mapping changes are a risk.

Empirical 80% source-level ranges are absolute-error quantiles from 2024; held-out
coverage is reported. Ranges are not summed to claim estate-level confidence.
Forecast recommendations require both freshness and a passing horizon. Dose
changes are never generated. A stale snapshot requests updated observations first.

The initial run ends at July 2026, giving August–October 2026 outlooks. It is stale
for current operations. Import new source exports and retrain to update it; pressing
Refresh in the app reloads the saved snapshot and does not run training.
