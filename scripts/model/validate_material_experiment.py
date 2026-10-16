"""Independent local validation of material joins, temporal cutoffs and metrics."""
import csv,hashlib,json,math,collections
import joblib
import numpy as np
from train_residual_candidates import run as prepare
from train_yield import shift
from train_yield import ROOT
from train_material_candidates import material_record,effective_material

def check_material_rules():
 names={'s':{'mapBlockCode':'A'}};blocks={'A':[{'plantingMaterial':'Deli x Lame','plantingYear':'2018','surveyDate':'2023-10-31'}]}
 r=material_record('s','2018',names,blocks)
 assert effective_material(r,'2023-09')=='unknown'
 assert effective_material(r,'2023-11')=='Deli x Lame'
 assert effective_material(r,'2020-01',True)=='Deli x Lame'
 assert material_record('s','2017',names,blocks)['material']=='unknown'
 blocks['A'][0]['plantingMaterial']='CIRADDeli x Lame'
 assert material_record('s','2018',names,blocks)['material']=='unknown'
 blocks['A'].append(dict(blocks['A'][0]))
 assert material_record('s','2018',names,blocks)['material']=='unknown'
 print('PASS: material availability, cohort mismatch, ambiguous label and duplicate map rules')

def run():
 check_material_rules();out=ROOT/'research/20261017-material-experiment';report=json.loads((out/'results.json').read_text());rows=list(csv.DictReader((out/'predictions.csv').open()))
 prod=json.loads((ROOT/'data/production/oban-production.json').read_text());idx={(r['sourceBlockId'],r['month']):r for r in prod['monthly']};seen=set()
 kinds=list(report['test2025Onward'])
 for r in rows:
  key=r['source'],r['month'];assert key not in seen;seen.add(key)
  assert r['trainingEnd']==r['origin']<r['month'] and r['trainingStart']<=r['trainingEnd']
  if r['actual']:assert math.isclose(float(r['actual']),idx[key]['mt'])
  for k in kinds:assert math.isfinite(float(r[k])) and float(r[k])>=0
 previous=list(csv.DictReader((ROOT/'research/yield-20261016/residual-experiment/predictions.csv').open()))
 assert {(r['source'],r['month']) for r in previous}==seen
 for k in kinds:
  g=collections.defaultdict(lambda:[0.,0.])
  for r in rows:
   if '2025-01'<=r['month']<=report['asOf']:g[r['month']][0]+=float(r['actual']);g[r['month']][1]+=float(r[k])
  wape=100*sum(abs(a-p) for a,p in g.values())/sum(a for a,p in g.values())
  assert math.isclose(wape,report['test2025Onward'][k]['wapePercent'])
  assert len(g)==report['test2025Onward'][k]['months']
 for d,r in report['divisionResults'].items():assert r['selectedOn2024']!='catboost_material_assumed'
 for origin in report['trainingAudit']:assert origin['trainingEnd']<=origin['origin'] and origin['forecastRows']>0
 for key,digest in report['sourceHashes'].items():
  p=ROOT/('research/yield-20261016/residual-experiment/predictions.csv' if key=='previousPredictions' else key)
  assert hashlib.sha256(p.read_bytes()).hexdigest()==digest
 for forecast in report['forecasts']:
  info=forecast['materialInfo']
  if info['material']!='unknown':assert info['availableFrom'] and info['availableFrom']<=forecast['origin']
 fitted=joblib.load(out/'material-models.joblib') # Trusted artifact trained in this task.
 data=prepare(dataset_only=True)
 eligible=[r for r in report['forecasts'] if not r.get('fallbackReason')]
 feature_rows=[data['features'](r['source'],r['month'])['x'] for r in eligible]
 for kind,model in fitted['models'].items():
  labels=[effective_material(r['materialInfo'],r['origin'],kind=='catboost_material_assumed') for r in eligible]
  if kind=='catboost_numeric':matrix=np.array(feature_rows,dtype=float)
  elif kind=='extra_trees_material_survey':matrix=np.column_stack([np.array(feature_rows,dtype=float),*[np.array([label==c for label in labels],dtype=float) for c in fitted['materialCategories']]])
  else:matrix=[[*x,label] for x,label in zip(feature_rows,labels)]
  for r,v in zip(eligible,model.predict(matrix)):
   assert math.isclose(max(0,r['seasonal']+r['area']*v),r[kind],rel_tol=1e-9)
 print(f'PASS: persisted models reproduce {len(eligible)} eligible forecasts for all four candidates')
 live=ROOT/'data/yield-models/f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae.json'
 if live.read_bytes()!=(live.parent/'archive-before-age-20261016'/live.name).read_bytes():
  published=json.loads(live.read_text())
  assert published.get('modelRevision')=='planting-material-one-month-20261017'
  assert published['horizons'][0]['model']=='extra_trees_material_survey'
 print(f'PASS: {len(rows)} matched predictions, source actuals, chronology, metrics, labels, selection, input hashes and expected published model revision')
if __name__=='__main__':run()
