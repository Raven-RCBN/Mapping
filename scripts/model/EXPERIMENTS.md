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

## Planting-material comparison

`train_material_candidates.py` compares CatBoost without material, CatBoost with survey-aware material, Extra Trees with survey-aware material, and a separately labelled retrospective material assumption. The fixed-since-planting assumption is excluded from primary method selection. Existing seasonal and previous selected forecasts remain controls, with exactly matched source-month coverage. Labels require a unique mapped block and matching planting cohort; ambiguous or missing labels remain unknown. This does not implement verified clone-potential curves.

Install `catboost==1.2.8` in the local Python environment, then run:

```sh
python scripts/model/train_material_candidates.py
python scripts/model/validate_material_experiment.py
```

The experiment uses all eligible prior months and writes only private research artifacts under `research/20261017-material-experiment/`, including fitted local model objects. 2024 selects methods; 2025 onward is retrospective development evaluation. August division totals provide an indicative comparison and are not imported or used as block-level training labels. Models, data and forecasts are not deployed by these scripts. Two percent error must be demonstrated on new unseen months; scaling an estimate to a known total does not demonstrate accuracy.

## Selected planting-material snapshot

After local validation, `python scripts/model/publish_material_snapshot.py` prepares the user-selected survey-aware Extra Trees model as the active one-month snapshot. It retains the original two/three-month forecasts and writes only private model artifacts, never production records. The snapshot includes source-level and aggregate historical errors, an indicative August comparison, and explicit selection provenance. The webapp exposes those limitations without reopening the hidden experimental-comparison panel.

To refresh after actual block imports: rerun material training, validate the experiment, then publish the snapshot. The current exporter expects the saved base snapshot and source coverage to align; changed production coverage requires reviewing the two/three-month base forecasts first. Do not substitute a new month’s division totals for missing block actuals.
