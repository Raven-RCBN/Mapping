"""Independent reconciliation of saved held-out predictions and model metrics."""
import csv,json,math
from pathlib import Path
from train_yield import shift
root=Path(__file__).resolve().parents[2]
r=json.loads(next((root/'data/yield-models').glob('*.json')).read_text())
rows=list(csv.DictReader((root/'data/yield-models/heldout-predictions.csv').open()))
p=json.loads((root/'data/production/oban-production.json').read_text())
actual={(x['sourceBlockId'],x['month']):x for x in p['monthly']}
for h in r['horizons']:
 selected=[x for x in rows if int(x['horizon'])==h['monthsAhead']]
 assert len(selected)==h['modelMetrics']['rows']
 assert len({(x['sourceBlockId'],x['month']) for x in selected})==len(selected)
 for x in selected:
  assert x['origin']>='2024-12' and x['month']>='2025-01'
  assert shift(x['origin'],h['monthsAhead'])==x['month']
  assert actual[x['sourceBlockId'],x['month']]['receiptStatus']=='received'
  assert float(x['actual'])==actual[x['sourceBlockId'],x['month']]['mt']
  assert float(x['baseline'])==actual[x['sourceBlockId'],shift(x['month'],-12)]['mt']
 for key,metric in [('prediction','modelMetrics'),('baseline','baselineMetrics')]:
  mae=sum(abs(float(x['actual'])-float(x[key])) for x in selected)/len(selected)
  assert math.isclose(mae,h[metric]['maeTonnes'],rel_tol=1e-10)
 assert h['beatsBaseline']==(h['improvementPercent']>=5 and h['testMonths']>=12)
for f in r['forecasts']:
 assert shift(r['asOf'],f['horizon'])==f['month']
 assert 0<=f['lowerTonnes']<=f['predictionTonnes']<=f['upperTonnes']
assert len({(x['sourceBlockId'],x['horizon']) for x in r['forecasts']})==len(r['forecasts'])
print(f"Verified {len(rows)} held-out predictions and {len(r['forecasts'])} forecast rows against source records.")
