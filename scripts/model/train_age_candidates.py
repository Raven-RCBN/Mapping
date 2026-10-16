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
def run(root=ROOT,planting_year=None,window_months=None):
 paths=['production/oban-production.json','rainfall/oban-rainfall-through-sep2026.json','hts-analysis/oban.json']
 production,rain,hts=[json.loads((root/'data'/p).read_text()) for p in paths]
 names={n['_id']:n for n in production['names']}
 counts=collections.Counter((r['sourceBlockId'],r['month']) for r in production['monthly'])
 rows=[r for r in production['monthly'] if (planting_year is None or str(r.get('plantingYear',''))==str(planting_year)) and r['month']>='2018-01' and r['receiptStatus']=='received' and valid(r.get('mt')) and counts[r['sourceBlockId'],r['month']]==1 and not 'combined tonnage' in r.get('note','').lower()]
 index={(r['sourceBlockId'],r['month']):r for r in rows}
 latest=max(r['month'] for r in rows)
 rainfall={f"{y['year']}-{m['month']:02d}":m['mm'] for y in rain['records'] for m in y.get('monthly',[]) if m.get('status')=='recorded' and valid(m.get('mm'))}
 fertiliser=collections.defaultdict(list)
 for f in hts['fertiliser']:fertiliser[(f['mapBlockCode'],f['year'])].append(f)
 features=['season_sin','season_cos','recent_mt','mt_lag1','mt_lag2','mt_lag5','mt_lag11','same_month_last_year_mt','recent_3month_mean','rain_recent','rain_lag3','rain_lag6','rain_lag12','rain_lag24','historical_fertiliser_kg']
 base_feature_count=len(features)
 features+=['palm_age_years','effective_hectares','fertiliser_kg_per_ha','seasonal_5year_mean_mt','seasonal_5year_observations','palms_per_effective_ha','recorded_palms','fertiliser_kg_per_palm']
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
  planting=str(r.get('plantingYear',''))
  age=int(target[:4])-int(planting) if planting.isdigit() and len(planting)==4 and 0<=int(target[:4])-int(planting)<=80 else None
  area=r.get('effectiveHa')
  seasonal=[index.get((source,shift(target,-12*k)),{}).get('mt') for k in range(1,6)]
  seasonal=[v for v in seasonal if valid(v)]
  x += [age,area if valid(area) and area>0 else None,fert/area if fert is not None and valid(area) and area>0 else None,sum(seasonal)/len(seasonal) if seasonal else None,len(seasonal)]
  palms=r.get('workbookPalms')
  x += [palms/area if valid(palms) and palms>0 and valid(area) and area>0 else None,palms if valid(palms) and palms>0 else None,fert/palms if fert is not None and valid(palms) and palms>0 else None]
  return [np.nan if v is None else v for v in x]
 output={'version':1,'estateId':hts['estateId'],'generatedAt':datetime.now(timezone.utc).isoformat(),'asOf':latest,'status':'pilot','target':'Monthly recorded FFB tonnes per source block','features':features,'horizons':[],'forecasts':[],'sources':[{'path':p,'sha256':hashlib.sha256((root/'data'/p).read_bytes()).hexdigest()} for p in paths], 'limitations':['Historical snapshot: retraining is required after importing new records.','Backtests assume historical records were available at month-end. Actual publication dates and revision history are unavailable.','Annual fertiliser totals are lagged two calendar years; they are not application schedules or causal dosage evidence.','Source-block identities use the current crosswalk; historical mapping changes could not be verified.','Rainfall is estate-level. No future weather observations enter the features.','Ranges are empirical source-level error bands, not guarantees or estate-total confidence intervals.']}
 outdir=root/'data'/'yield-models'/('density-experiment' if planting_year is None else f'density-planting-{planting_year}');outdir=outdir/(f'rolling-{window_months}' if window_months else 'all-history');outdir.mkdir(parents=True,exist_ok=True)
 all_predictions=[];models={}
 def estate_metrics(rs,p):
  totals=collections.defaultdict(lambda:[0.,0.])
  for r,v in zip(rs,p):totals[r['target']][0]+=r['y'];totals[r['target']][1]+=float(v)
  return metrics([v[0] for v in totals.values()],[v[1] for v in totals.values()])
 for h in [1,2,3]:
  samples=[]
  for r in rows:
   origin=shift(r['month'],-h);x=make_features(r['sourceBlockId'],origin,h)
   if x is not None:samples.append({'target':r['month'],'origin':origin,'source':r['sourceBlockId'],'x':x,'y':r['mt'],'baseline':x[7]})
  train=[r for r in samples if r['target']<='2023-12'];validation=[r for r in samples if '2024-01'<=r['target']<='2024-12' and r['origin']>='2023-12'];test=[r for r in samples if r['target']>='2025-01' and r['origin']>='2024-12']
  assert train and validation and test
  X=lambda a:np.array([r['x'] for r in a]);Y=lambda a:np.array([r['y'] for r in a])
  def rolling_predict(kind,records,count):
   predictions={}
   for origin in sorted({r['origin'] for r in records}):
    available=[r for r in samples if shift(origin,-window_months+1)<=r['target']<=origin]
    assert available and all(r['target']<=origin for r in available)
    model=estimator(kind.removeprefix('age_')).fit(X(available)[:,:count],Y(available))
    batch=[r for r in records if r['origin']==origin]
    values=np.maximum(0,model.predict(X(batch)[:,:count]))
    for r,v in zip(batch,values):predictions[r['source'],r['target']]=v
   return np.array([predictions[r['source'],r['target']] for r in records])
  candidates={};trained={}
  for kind in ['ridge','gradient_boosting','age_ridge','age_gradient_boosting']:
   count=len(features) if kind.startswith('age_') else base_feature_count
   m=None
   if window_months:p=rolling_predict(kind,validation,count)
   else:
    m=estimator(kind.removeprefix('age_')).fit(X(train)[:,:count],Y(train));p=np.maximum(0,m.predict(X(validation)[:,:count]))
   candidates[kind]={**metrics(Y(validation),p),'estateMetrics':estate_metrics(validation,p)};trained[kind]=(m,p,count)
  legacy=min(['ridge','gradient_boosting'],key=lambda k:candidates[k]['maeTonnes'])
  eligible=[k for k in candidates if candidates[k]['maeTonnes']<=candidates[legacy]['maeTonnes']*1.05]
  best=min(eligible,key=lambda k:candidates[k]['estateMetrics']['maeTonnes'])
  count=trained[best][2]
  calibration=np.abs(Y(validation)-trained[best][1]);radius=float(np.quantile(calibration,.8,method='higher'))
  if window_months:pred=rolling_predict(best,test,count)
  else:
   fitrows=[r for r in samples if r['target']<='2024-12'];m=estimator(best.removeprefix('age_')).fit(X(fitrows)[:,:count],Y(fitrows));pred=np.maximum(0,m.predict(X(test)[:,:count]))
  measured=metrics(Y(test),pred);baseline=metrics(Y(test),[r['baseline'] for r in test]);improvement=100*(1-measured['maeTonnes']/baseline['maeTonnes']);coverage=float(np.mean(abs(Y(test)-pred)<=radius)*100)
  approved=improvement>=5 and len(set(r['target'] for r in test))>=12
  summary={'monthsAhead':h,'model':best,'features':features[:count],'estateMetrics':estate_metrics(test,pred),'baselineEstateMetrics':estate_metrics(test,[r['baseline'] for r in test]),'selection':'2024 estate-total MAE with a 5% block-MAE guardrail','validationCandidates':candidates,'trainingRows':len(train),'validationRows':len(validation),'testStart':min(r['target'] for r in test),'testEnd':max(r['target'] for r in test),'testMonths':len(set(r['target'] for r in test)),'modelMetrics':measured,'baselineMetrics':baseline,'improvementPercent':improvement,'empirical80RangeRadiusTonnes':radius,'testRangeCoveragePercent':coverage,'beatsBaseline':approved,'recommendedMethod':best if approved else 'seasonal_baseline'}
  output['horizons'].append(summary)
  for r,p in zip(test,pred):all_predictions.append({'horizon':h,'sourceBlockId':r['source'],'origin':r['origin'],'month':r['target'],'actual':r['y'],'prediction':float(p),'baseline':r['baseline'],'trainingStart':shift(r['origin'],-window_months+1) if window_months else '2018-01','trainingEnd':r['origin'] if window_months else '2024-12'})
  finalrows=[r for r in samples if not window_months or shift(latest,-window_months+1)<=r['target']<=latest]
  final=estimator(best.removeprefix('age_')).fit(X(finalrows)[:,:count],Y(finalrows));models[h]=final
  summary['trainingWindowMonths']=window_months;summary['finalTrainingStart']=min(r['target'] for r in finalrows);summary['finalTrainingEnd']=max(r['target'] for r in finalrows)
  for r in rows:
   if r['month']!=latest:continue
   x=make_features(r['sourceBlockId'],latest,h)
   if x is None:continue
   p=float(max(0,final.predict(np.array([x[:count]]))[0]));name=names.get(r['sourceBlockId'],{})
   output['forecasts'].append({'sourceBlockId':r['sourceBlockId'],'sourceBlockCode':name.get('sourceBlockCode'),'mapBlockCode':name.get('mapBlockCode'),'month':shift(latest,h),'horizon':h,'predictionTonnes':p,'lowerTonnes':max(0,p-radius),'upperTonnes':p+radius,'baselineTonnes':x[7],'effectiveHa':r.get('effectiveHa') if valid(r.get('effectiveHa')) and r['effectiveHa']>0 else None,'recentTonnes':r['mt'],'plantingYear':r.get('plantingYear') or None,'division':name.get('division')})
  print(json.dumps(summary),flush=True)
 output['audit']={'inputMonthlyRows':len(production['monthly']),'usableMonthlyRows':len(rows),'latestObservedMonth':latest,'latestSources':sum(r['month']==latest for r in rows),'forecastSources':len({r['sourceBlockId'] for r in output['forecasts']}),'excludedDuplicateRows':sum(c for c in counts.values() if c>1),'rainfallObservedMonths':len(rainfall)}
 (outdir/(hts['estateId']+'.json')).write_text(json.dumps(output,indent=2,allow_nan=False))
 with (outdir/'heldout-predictions.csv').open('w') as f:
  writer=csv.DictWriter(f,fieldnames=list(all_predictions[0]));writer.writeheader();writer.writerows(all_predictions)
 joblib.dump({'models':models,'features':features,'asOf':latest},outdir/'oban-models.joblib')
 return output
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--planting-year',type=int);parser.add_argument('--window-months',type=int,choices=[60]);args=parser.parse_args();run(planting_year=args.planting_year,window_months=args.window_months)
