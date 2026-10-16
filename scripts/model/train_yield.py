"""Reproducible, offline, source-level FFB pilot. No random temporal split."""
import argparse, collections, csv, hashlib, json, math
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
import joblib

ROOT=Path(__file__).resolve().parents[2]
def shift(month,n):
 y,m=map(int,month.split('-')); i=y*12+m-1+n;return f'{i//12:04d}-{i%12+1:02d}'
def valid(v):return isinstance(v,(int,float)) and math.isfinite(v) and v>=0
def metrics(y,p):
 y,p=np.asarray(y),np.asarray(p);return {'maeTonnes':float(np.mean(abs(y-p))),'wapePercent':float(100*np.sum(abs(y-p))/np.sum(y)) if sum(y)>0 else None,'rows':len(y)}
def estimator(kind):
 if kind=='ridge':return make_pipeline(SimpleImputer(strategy='median',add_indicator=True,keep_empty_features=True),StandardScaler(),Ridge(alpha=100))
 return HistGradientBoostingRegressor(max_iter=160,max_leaf_nodes=15,l2_regularization=10,learning_rate=.06,random_state=42)
def run(root=ROOT):
 paths=['production/oban-production.json','rainfall/oban-rainfall-through-sep2026.json','hts-analysis/oban.json']
 production,rain,hts=[json.loads((root/'data'/p).read_text()) for p in paths]
 names={n['_id']:n for n in production['names']}
 counts=collections.Counter((r['sourceBlockId'],r['month']) for r in production['monthly'])
 rows=[r for r in production['monthly'] if r['month']>='2018-01' and r['receiptStatus']=='received' and valid(r.get('mt')) and counts[r['sourceBlockId'],r['month']]==1 and not 'combined tonnage' in r.get('note','').lower()]
 index={(r['sourceBlockId'],r['month']):r for r in rows}
 latest=max(r['month'] for r in rows)
 rainfall={f"{y['year']}-{m['month']:02d}":m['mm'] for y in rain['records'] for m in y.get('monthly',[]) if m.get('status')=='recorded' and valid(m.get('mm'))}
 fertiliser=collections.defaultdict(list)
 for f in hts['fertiliser']:fertiliser[(f['mapBlockCode'],f['year'])].append(f)
 features=['season_sin','season_cos','recent_mt','mt_lag1','mt_lag2','mt_lag5','mt_lag11','same_month_last_year_mt','recent_3month_mean','rain_recent','rain_lag3','rain_lag6','rain_lag12','rain_lag24','historical_fertiliser_kg']
 def make_features(source,origin,horizon):
  target=shift(origin,horizon);r=index.get((source,origin))
  if not r:return None
  vals=[index.get((source,shift(origin,-lag)),{}).get('mt') for lag in [0,1,2,5,11]]
  past=index.get((source,shift(target,-12)),{}).get('mt')
  if any(v is None for v in vals[:3]) or past is None:return None
  month=int(target[-2:]);code=names.get(source,{}).get('mapBlockCode')
  # Two calendar years earlier ensures annual total was complete before origin.
  fs=fertiliser.get((code,int(origin[:4])-2),[]);fert=None
  # Shared source/polygon quantities cannot be assigned to individual sources.
  if len(fs)==1 and sum(n.get('mapBlockCode')==code for n in names.values())==1:
   q=[v for v,p in zip(fs[0]['quantities'],hts['products']) if p['unit']=='kg']
   if q and all(valid(v) for v in q):fert=sum(q)
  x=[math.sin(month*math.tau/12),math.cos(month*math.tau/12),*vals,past,sum(vals[:3])/3,*[rainfall.get(shift(origin,-lag)) for lag in [0,3,6,12,24]],fert]
  return [np.nan if v is None else v for v in x]
 output={'version':1,'estateId':hts['estateId'],'generatedAt':datetime.now(timezone.utc).isoformat(),'asOf':latest,'status':'pilot','target':'Monthly recorded FFB tonnes per source block','features':features,'horizons':[],'forecasts':[],'sources':[{'path':p,'sha256':hashlib.sha256((root/'data'/p).read_bytes()).hexdigest()} for p in paths], 'limitations':['Historical snapshot: retraining is required after importing new records.','Backtests assume historical records were available at month-end. Actual publication dates and revision history are unavailable.','Annual fertiliser totals are lagged two calendar years; they are not application schedules or causal dosage evidence.','Source-block identities use the current crosswalk; historical mapping changes could not be verified.','Rainfall is estate-level. No future weather observations enter the features.','Ranges are empirical source-level error bands, not guarantees or estate-total confidence intervals.']}
 outdir=root/'data'/'yield-models';outdir.mkdir(exist_ok=True)
 all_predictions=[];models={}
 for h in [1,2,3]:
  samples=[]
  for r in rows:
   origin=shift(r['month'],-h);x=make_features(r['sourceBlockId'],origin,h)
   if x is not None:samples.append({'target':r['month'],'origin':origin,'source':r['sourceBlockId'],'x':x,'y':r['mt'],'baseline':x[7]})
  train=[r for r in samples if r['target']<='2023-12'];validation=[r for r in samples if '2024-01'<=r['target']<='2024-12' and r['origin']>='2023-12'];test=[r for r in samples if r['target']>='2025-01' and r['origin']>='2024-12']
  assert train and validation and test
  X=lambda a:np.array([r['x'] for r in a]);Y=lambda a:np.array([r['y'] for r in a])
  candidates={};trained={}
  for kind in ['ridge','gradient_boosting']:
   m=estimator(kind).fit(X(train),Y(train));p=np.maximum(0,m.predict(X(validation)));candidates[kind]=metrics(Y(validation),p);trained[kind]=(m,p)
  best=min(candidates,key=lambda k:candidates[k]['maeTonnes'])
  calibration=np.abs(Y(validation)-trained[best][1]);radius=float(np.quantile(calibration,.8,method='higher'))
  fitrows=[r for r in samples if r['target']<='2024-12'];m=estimator(best).fit(X(fitrows),Y(fitrows));pred=np.maximum(0,m.predict(X(test)))
  measured=metrics(Y(test),pred);baseline=metrics(Y(test),[r['baseline'] for r in test]);improvement=100*(1-measured['maeTonnes']/baseline['maeTonnes']);coverage=float(np.mean(abs(Y(test)-pred)<=radius)*100)
  approved=improvement>=5 and len(set(r['target'] for r in test))>=12
  summary={'monthsAhead':h,'model':best,'validationCandidates':candidates,'trainingRows':len(train),'validationRows':len(validation),'testStart':min(r['target'] for r in test),'testEnd':max(r['target'] for r in test),'testMonths':len(set(r['target'] for r in test)),'modelMetrics':measured,'baselineMetrics':baseline,'improvementPercent':improvement,'empirical80RangeRadiusTonnes':radius,'testRangeCoveragePercent':coverage,'beatsBaseline':approved,'recommendedMethod':best if approved else 'seasonal_baseline'}
  output['horizons'].append(summary)
  for r,p in zip(test,pred):all_predictions.append({'horizon':h,'sourceBlockId':r['source'],'origin':r['origin'],'month':r['target'],'actual':r['y'],'prediction':float(p),'baseline':r['baseline']})
  final=estimator(best).fit(X(samples),Y(samples));models[h]=final
  for r in rows:
   if r['month']!=latest:continue
   x=make_features(r['sourceBlockId'],latest,h)
   if x is None:continue
   p=float(max(0,final.predict(np.array([x]))[0]));name=names.get(r['sourceBlockId'],{})
   output['forecasts'].append({'sourceBlockId':r['sourceBlockId'],'sourceBlockCode':name.get('sourceBlockCode'),'mapBlockCode':name.get('mapBlockCode'),'month':shift(latest,h),'horizon':h,'predictionTonnes':p,'lowerTonnes':max(0,p-radius),'upperTonnes':p+radius,'baselineTonnes':x[7],'effectiveHa':r.get('effectiveHa') if valid(r.get('effectiveHa')) and r['effectiveHa']>0 else None,'recentTonnes':r['mt']})
  print(json.dumps(summary),flush=True)
 output['audit']={'inputMonthlyRows':len(production['monthly']),'usableMonthlyRows':len(rows),'latestObservedMonth':latest,'latestSources':sum(r['month']==latest for r in rows),'forecastSources':len({r['sourceBlockId'] for r in output['forecasts']}),'excludedDuplicateRows':sum(c for c in counts.values() if c>1),'rainfallObservedMonths':len(rainfall)}
 (outdir/(hts['estateId']+'.json')).write_text(json.dumps(output,indent=2,allow_nan=False))
 with (outdir/'heldout-predictions.csv').open('w') as f:
  writer=csv.DictWriter(f,fieldnames=list(all_predictions[0]));writer.writeheader();writer.writerows(all_predictions)
 joblib.dump({'models':models,'features':features,'asOf':latest},outdir/'oban-models.joblib')
 return output
if __name__=='__main__':run()
