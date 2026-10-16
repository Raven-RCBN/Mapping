# Offline yield experiments

The production model is trained by `train_yield.py`. Experimental changes do not replace that model.

`train_residual_candidates.py` compares seasonal naive, expanding seasonal means, recency-weighted means, a bounded growth blend, and ridge/Extra Trees corrections to seasonal yield. Training uses all eligible prior target months at each one-month forecast origin. Selection uses 2024 validation with a 5% improvement requirement. January 2025 onward is retrospective evaluation, not a fresh holdout after repeated development. Missing area falls back to tonnes-based seasonal forecasts. Block forecasts sum to division and matched-estate totals.

Run with Python, numpy, scikit-learn and joblib installed:

```sh
python scripts/model/train_residual_candidates.py
python scripts/model/validate_residual_experiment.py
python scripts/model/export_experimental_snapshot.py
```

Private source files live under ignored `data/`; results live under ignored `research/`. Export creates a small `data/yield-models/<estateId>.experimental.json` snapshot for the authenticated API. Deployment copies this snapshot privately; source data and research artifacts must not be committed.

Optional monthly reanalysis weather requires a licensed export and provenance. CSV columns are `month`, `temperature_c` (C), `soil_moisture` (m3/m3), `solar_radiation` (monthly mean W/m2). Blank measurements remain missing. The model uses a conservative two-month lag; historical data revisions cannot be reconstructed.

```sh
python scripts/model/prepare_monthly_weather.py input.csv validated.csv
python scripts/model/train_residual_candidates.py --weather-csv validated.csv
```

Copernicus/CHIRPS downloads are not included. The initial experiment uses estate rainfall only. Annual fertiliser uses origin calendar year minus two; it is not an exact application-date lag or causal dosage model. Density is recorded palms divided by effective hectares.

Other experiments: `train_age_candidates.py --planting-year 2017 --window-months 60` fits cohort models; `train_estate_candidate.py` uses private division totals for an offline aggregate experiment only. Those supplied totals are never imported as block actuals.
