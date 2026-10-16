"""Independent artifact checks, including source labels, temporal cutoffs and sums."""
import collections,csv,hashlib,json,math
from pathlib import Path
from train_yield import ROOT
p=ROOT/'research/yield-20261016/residual-experiment';report=json.loads((p/'results.json').read_text())
source=json.loads((ROOT/'data/production/oban-production.json').read_text());idx={(r['sourceBlockId'],r['month']):r for r in source['monthly']}
rows=list(csv.DictReader((p/'predictions.csv').open()));seen=set();monthly=collections.defaultdict(float)
for r in rows:
 key=r['source'],r['month'];assert key not in seen;seen.add(key)
 assert r['trainingEnd']==r['origin']<r['month'] and r['trainingStart']<=r['trainingEnd']
 for k in ['seasonal','seasonal_mean','recent_seasonal','growth_blend','ridge_residual','extra_trees_residual','selected']:
  assert math.isfinite(float(r[k])) and float(r[k])>=0
 if r['actual']:
  assert math.isclose(float(r['actual']),idx[key]['mt'])
  assert r['plantingYear']==str(idx[key]['plantingYear'])
 monthly[r['month']]+=float(r['selected'])
for m,total in monthly.items():
 assert math.isclose(total,report['hierarchy'][m]['estateTonnes'])
 assert math.isclose(total,sum(report['hierarchy'][m]['divisionTonnes'].values()))
for y in ['2017','2018']:
 g=collections.defaultdict(lambda:[0.,0.])
 for r in rows:
  if r['plantingYear']==y and '2025-01'<=r['month']<=report['asOf']:
   g[r['month']][0]+=float(r['actual']);g[r['month']][1]+=float(r['selected'])
 wape=100*sum(abs(a-b) for a,b in g.values())/sum(a for a,b in g.values())
 assert math.isclose(wape,report['cohortTests'][y]['selected']['wapePercent'])
for path,digest in report['sources'].items():
 if path!='weatherCsv':assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==digest
live=ROOT/'data/yield-models/f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae.json'
assert live.read_bytes()==(live.parent/'archive-before-age-20261016'/live.name).read_bytes()
print(f'PASS: {len(rows)} predictions, source actuals, chronology, cohort metrics, hierarchy, source hashes and unchanged live model')
