"""Local planting-material ablation experiment; no source-system writes.
Selection: 2024. Retrospective test: 2025 through latest block actuals.
Survey-aware material is primary; fixed-since-planting assumption is separate.
Requires catboost 1.2.8 and existing estate-model dependencies.
"""
import collections,csv,hashlib,json,math
from datetime import datetime, timezone
import joblib
import numpy as np
from catboost import CatBoostRegressor
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import make_pipeline
from train_residual_candidates import run as prepare,score
from train_yield import ROOT,shift

KINDS=['seasonal','previous','catboost_numeric','catboost_material_survey','catboost_material_assumed','extra_trees_material_survey']
def material_record(source,planting_year,names,blocks):
 matches=blocks.get(names[source].get('mapBlockCode'),[])
 if len(matches)!=1:return {'material':'unknown','reason':'No unique mapped block','availableFrom':None}
 b=matches[0];raw=b.get('plantingMaterial','').strip()
 if not raw:return {'material':'unknown','reason':'Missing material','availableFrom':None}
 if raw=='CIRADDeli x Lame':return {'material':'unknown','reason':'Ambiguous combined material label','availableFrom':None}
 if not str(planting_year).isdigit() or str(planting_year)!=str(b.get('plantingYear','')):
  return {'material':'unknown','reason':'Planting cohort missing or does not match mapped block','availableFrom':None}
 date=b.get('surveyDate','')
 return {'material':raw,'reason':None,'availableFrom':date[:7] if len(date)>=7 else None}
def effective_material(info,origin,assumed=False):
 if assumed:return info['material']
 return info['material'] if info['availableFrom'] and info['availableFrom']<=origin else 'unknown'
def run():
 data=prepare(dataset_only=True);samples=data['samples'];latest=data['latest'];names=data['names']
 gis_path=ROOT/'data/estates/oban-nigeria/gis-import.json';gis=json.loads(gis_path.read_text());blocks=collections.defaultdict(list)
 for b in gis['blocks']:blocks[b['blockCode']].append(b)
 previous_path=ROOT/'research/yield-20261016/residual-experiment/predictions.csv';previous_rows=list(csv.DictReader(previous_path.open()));previous={(r['source'],r['month']):r for r in previous_rows}
 out=ROOT/'research/20261017-material-experiment';out.mkdir(parents=True,exist_ok=True)
 material=lambda r:material_record(r['source'],r['plantingYear'],names,blocks)
 for r in samples:r['materialInfo']=material(r)
 cats=sorted({material(r)['material'] for r in samples}|{'unknown'})
 def matrix(rs,kind):
  x=np.array([r['x'] for r in rs],dtype=float)
  if kind=='catboost_numeric':return x
  labels=[effective_material(r['materialInfo'],r['origin'],kind=='catboost_material_assumed') for r in rs]
  if kind=='extra_trees_material_survey':
   return np.column_stack([x,*[np.array([label==c for label in labels],dtype=float) for c in cats]])
  # CatBoost's category column remains text; numeric missingness uses NaN.
  return [[*r['x'],label] for r,label in zip(rs,labels)]
 predictions=[];final_models={};audit=[]
 for origin in sorted({r['origin'] for r in samples if r['month']>='2024-01'}|{latest}):
  train=[r for r in samples if r['month']<=origin]
  batch=[dict(r) for r in samples if r['origin']==origin] if origin<latest else [f for r in data['rows'] if r['month']==latest and (f:=data['features'](r['sourceBlockId'],shift(latest,1))) is not None]
  for r in batch:r['materialInfo']=material(r)
  assert train and all(r['month']<=origin for r in train)
  for kind in KINDS[2:]:
   if kind.startswith('catboost'):
    model=CatBoostRegressor(iterations=250,depth=5,learning_rate=.04,l2_leaf_reg=15,loss_function='RMSE',random_seed=42,thread_count=1,verbose=False,allow_writing_files=False,cat_features=[] if kind=='catboost_numeric' else [len(data['featureNames'])])
   else:model=make_pipeline(SimpleImputer(keep_empty_features=True,add_indicator=True),ExtraTreesRegressor(n_estimators=100,min_samples_leaf=15,max_features=.8,random_state=42,n_jobs=1))
   model.fit(matrix(train,kind),np.array([r['residual'] for r in train]))
   for r,v in zip(batch,model.predict(matrix(batch,kind))):r[kind]=float(max(0,r['seasonal']+r['area']*v))
   if origin==latest:final_models[kind]=model
  for r in batch:
   old=previous.get((r['source'],r['month']));assert old,'Old/new forecasts must use matched sources'
   assert math.isclose(float(old['seasonal']),r['seasonal'])
   r['previous']=float(old['selected']);r['trainingStart']=min(v['month'] for v in train);r['trainingEnd']=origin
   predictions.append({k:v for k,v in r.items() if k not in ['x','residual']})
  audit.append({'origin':origin,'trainingRows':len(train),'trainingStart':min(r['month'] for r in train),'trainingEnd':origin,'forecastRows':len(batch),'knownMaterialTrainingRows':sum(effective_material(r['materialInfo'],r['origin'])!='unknown' for r in train)})
  print(origin,len(train),len(batch),flush=True)
 # Preserve legacy missing-area fallbacks and their identical cohort coverage.
 represented={(r['source'],r['month']) for r in predictions}
 for old in previous_rows:
  key=old['source'],old['month']
  if key in represented:continue
  assert old['month']>='2024-01';base=float(old['seasonal'])
  r={k:old[k] for k in ['source','division','plantingYear','month','origin','trainingStart','trainingEnd']};r['area']=float(old['area']) if old['area'] else None
  if old['actual']:r['actual']=float(old['actual'])
  r['materialInfo']=material(r);r['previous']=float(old['selected']);r['fallbackReason']='No effective-area model inputs: seasonal tonnes baseline'
  for kind in KINDS:
   if kind!='previous':r[kind]=base
  predictions.append(r)
 assert {(r['source'],r['month']) for r in predictions}==set(previous),'Matched cohort changed'
 val=[r for r in predictions if '2024-01'<=r['month']<='2024-12'];test=[r for r in predictions if '2025-01'<=r['month']<=latest]
 # Assumed historical labels are excluded from the primary selection.
 primary=[k for k in KINDS if k!='catboost_material_assumed'];chosen={};division_results={}
 for d in sorted({r['division'] for r in predictions}):
  vr=[r for r in val if r['division']==d]
  if not vr:chosen[d]='seasonal';continue
  validation={k:score(vr,k) for k in KINDS};best=min(primary,key=lambda k:validation[k]['maeTonnes'])
  chosen[d]=best if validation[best]['maeTonnes']<.95*validation['seasonal']['maeTonnes'] else 'seasonal'
  division_results[d]={'selectedOn2024':chosen[d],'validation':validation}
 for r in predictions:r['selected']=r[chosen[r['division']]]
 all_kinds=[*KINDS,'selected']
 evaluation={k:score(test,k) for k in all_kinds};validation={k:score(val,k) for k in all_kinds}
 cohort={y:{k:score([r for r in test if r['plantingYear']==y],k) for k in all_kinds} for y in ['2017','2018']}
 material_tests={c:{k:score([r for r in test if r['materialInfo']['material']==c],k) for k in all_kinds} for c in cats}
 for d,v in division_results.items():v['test']={k:score([r for r in test if r['division']==d],k) for k in ['seasonal','previous','selected']}
 final=[r for r in predictions if r['month']>latest]
 final_totals={k:sum(r[k] for r in final) for k in all_kinds}
 evidence=json.loads((ROOT/'research/yield-20261016/oban-division-totals-jul-sep2026.json').read_text());aug_actual=evidence['reportedTotals']['2026-08']
 aug={k:{'predictionTonnes':v,'divisionStatementActualTonnes':aug_actual,'indicativeSignedErrorPercent':100*(v/aug_actual-1),'coverageCaveat':'246 forecast sources versus 247 July received sources; aggregate comparison is not exact block-level validation.'} for k,v in final_totals.items()}
 matched_aug={d:{'actualTonnes':a['mt'],'forecasts':{k:sum(r[k] for r in final if r['division']==d) for k in all_kinds}} for a in evidence['records'] if a['month']=='2026-08' and (d:=a['division']) in ['2017','2018']}
 report={'version':1,'status':'local_experiment_not_deployed','generatedAt':datetime.now(timezone.utc).isoformat(),'asOf':latest,'horizonMonths':1,'features':data['featureNames'],'materialCategories':cats,'validation2024':validation,'test2025Onward':evaluation,'cohortTests':cohort,'materialTests':material_tests,'divisionResults':division_results,'trainingAudit':audit,'forecasts':final,'augustChecks':aug,'augustCohortChecks':matched_aug,'sourceHashes':{**data['hashes'],str(gis_path.relative_to(ROOT)):hashlib.sha256(gis_path.read_bytes()).hexdigest(),'previousPredictions':hashlib.sha256(previous_path.read_bytes()).hexdigest()},'limitations':['Scores are retrospective development comparisons on already-inspected months, not a new untouched holdout.','Primary material labels are gated by survey date and matching planting cohort; historical data publication/revision timing remains unverified.','Fixed-since-planting material candidate is explicitly optimistic retrospective analysis and excluded from primary selection.','Material labels mix crosses and suppliers; no individual clone IDs or verified clone-potential curves were provided.','Age, division and material are confounded; prediction changes do not estimate a causal genetic effect.','No block actuals for August or September are invented; supplied division totals are comparison evidence only in this experiment.','No future soil moisture/weather or arbitrary genetic-yield multipliers are used.']}
 (out/'results.json').write_text(json.dumps(report,indent=2,allow_nan=False))
 with (out/'predictions.csv').open('w') as f:
  fields=['source','division','plantingYear','month','origin','area','actual','trainingStart','trainingEnd',*all_kinds];w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(predictions)
 joblib.dump({'models':final_models,'features':data['featureNames'],'materialCategories':cats,'divisionMethods':chosen,'asOf':latest},out/'material-models.joblib')
 for p,digest in data['hashes'].items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==digest
 print(json.dumps({'validation':validation,'test':evaluation,'cohortTests':cohort,'august':final_totals,'methods':chosen},indent=2));return report
if __name__=='__main__':run()
