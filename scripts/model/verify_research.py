"""Check offline artifacts, source reconciliation and no published-model changes."""
import json,hashlib,math
from pathlib import Path
from train_yield import ROOT,shift
root=ROOT; folder=root/'research/yield-20261016'
e=json.loads((folder/'oban-division-totals-jul-sep2026.json').read_text())
c=json.loads((folder/'estate-candidate.json').read_text());o=c['estateOutlook']
assert o['status']=='research_only_not_deployed' and o['trainingThrough']=='2026-09'
assert len({(r['month'],r['division']) for r in e['records']})==27
for month,total in e['reportedTotals'].items():assert math.isclose(sum(r['mt'] for r in e['records'] if r['month']==month),total,abs_tol=.011)
for h in o['horizons']:
 for result in h['testCandidates'].values():
  rows=result['months'];assert all(r['month']<='2026-07' and shift(r['origin'],h['monthsAhead'])==r['month'] for r in rows)
  assert math.isclose(sum(abs(r['actual']-r['prediction']) for r in rows)/len(rows),result['maeTonnes'])
for f in o['forecasts']:
 assert shift(o['asOf'],f['horizon'])==f['month']
 assert all(math.isfinite(v) and v>=0 for v in f['candidateTonnes'].values())
published=root/'data/yield-models'/f"{e['estateId']}.json"
assert published.read_bytes()==(published.parent/'archive-before-age-20261016'/published.name).read_bytes()
old=json.loads(published.read_text())
for source in old['sources']:assert hashlib.sha256((root/'data'/source['path']).read_bytes()).hexdigest()==source['sha256']
age=json.loads((published.parent/'density-experiment'/published.name).read_text())
assert 'palms_per_effective_ha' in age['features']
assert not any('gps' in x for x in age['features'])
print('Verified 27 division observations, forecast dates, historical errors, effective-ha feature, unchanged original source files and unchanged published model.')
