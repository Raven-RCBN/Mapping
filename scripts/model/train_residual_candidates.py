"""Offline one-month experiments. Expanding history; validation precedes test.
Optional weather CSV: month,temperature_c,soil_moisture,solar_radiation.
Values are monthly means, available only with a conservative two-month lag.
Never writes to production or deployed model paths.
"""
import argparse, collections, csv, hashlib, json, math
from pathlib import Path
import numpy as np
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from train_yield import ROOT, shift, valid

KINDS=['seasonal','seasonal_mean','recent_seasonal','growth_blend','ridge_residual','extra_trees_residual']
def score(rs,key):
 g=collections.defaultdict(lambda:[0.,0.])
 for r in rs:g[r['month']][0]+=r['actual'];g[r['month']][1]+=r[key]
 if not g:return None
 actual=sum(v[0] for v in g.values());err=sum(abs(a-p) for a,p in g.values())
 return {'months':len(g),'wapePercent':100*err/actual if actual else None,'maeTonnes':err/len(g),'biasPercent':100*sum(p-a for a,p in g.values())/actual if actual else None,'withinTwoPercent':int(sum(abs(p-a)<=.02*a for a,p in g.values() if a>0))}
def run(weather_csv=None):
 out=ROOT/'research/yield-20261016/residual-experiment';out.mkdir(parents=True,exist_ok=True)
 paths=[ROOT/'data/production/oban-production.json',ROOT/'data/rainfall/oban-rainfall-through-sep2026.json',ROOT/'data/hts-analysis/oban.json']
 hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
 prod,rain,hts=[json.loads(p.read_text()) for p in paths];names={n['_id']:n for n in prod['names']}
 counts=collections.Counter((r['sourceBlockId'],r['month']) for r in prod['monthly'])
 rows=[r for r in prod['monthly'] if r['receiptStatus']=='received' and valid(r.get('mt')) and counts[r['sourceBlockId'],r['month']]==1 and 'combined tonnage' not in r.get('note','').lower()]
 idx={(r['sourceBlockId'],r['month']):r for r in rows};latest=max(r['month'] for r in rows);earliest=min(r['month'] for r in rows)
 rainidx={f"{y['year']}-{m['month']:02d}":m['mm'] for y in rain['records'] for m in y.get('monthly',[]) if m.get('status')=='recorded' and valid(m.get('mm'))}
 fert=collections.defaultdict(list)
 for r in hts['fertiliser']:fert[r['mapBlockCode'],r['year']].append(r)
 multiplicity=collections.Counter(n.get('mapBlockCode') for n in names.values())
 weather={}
 if weather_csv:
  for r in csv.DictReader(Path(weather_csv).open()):
   assert r['month'] not in weather,'Duplicate weather month'
   weather[r['month']]=[float(r[k]) if r[k] else np.nan for k in ['temperature_c','soil_moisture','solar_radiation']]
  hashes['weatherCsv']=hashlib.sha256(Path(weather_csv).read_bytes()).hexdigest()
 feature_names=['season_sin','season_cos','baseline_yield','recent_yield','growth_ratio','palm_age','age_squared','effective_ha','palms_per_effective_ha','fert_kg_per_ha_lag2years','rain_0_2','rain_3_5','rain_8_10','rain_20_22','rain_0_2_minus_prior_year']
 if weather:feature_names+=['temperature_lag2','soil_moisture_lag2','radiation_lag2']
 def features(s,t):
  origin=shift(t,-1);r=idx.get((s,origin));b=idx.get((s,shift(t,-12)))
  if not r or not b:return None
  area=r.get('effectiveHa');ba=b.get('effectiveHa')
  if not valid(area) or area<=0 or not valid(ba) or ba<=0:return None
  past=[idx.get((s,shift(t,-12*k))) for k in range(1,30) if shift(t,-12*k)>=earliest]
  past=[z['mt'] for z in past if z is not None]
  rec=[idx.get((s,shift(origin,-k)),{}).get('mt') for k in range(3)];prev=[idx.get((s,shift(origin,-12-k)),{}).get('mt') for k in range(3)]
  growth=sum(rec)/sum(prev) if all(valid(v) for v in rec+prev) and sum(prev)>0 else 1.
  age=int(t[:4])-int(r['plantingYear']) if str(r.get('plantingYear','')).isdigit() else np.nan
  code=names[s].get('mapBlockCode');fs=fert.get((code,int(origin[:4])-2),[]);f=np.nan
  if len(fs)==1 and multiplicity[code]==1:
   qs=[q for q,p in zip(fs[0]['quantities'],hts['products']) if p['unit']=='kg']
   if qs and all(valid(q) for q in qs):f=sum(qs)/area
  def rainfall(a,b):
   vals=[rainidx.get(shift(origin,-k)) for k in range(a,b+1)]
   return sum(vals) if all(valid(v) for v in vals) else np.nan
  palms=r.get('workbookPalms');month=int(t[-2:]);base=b['mt']
  x=[math.sin(month*math.tau/12),math.cos(month*math.tau/12),base/ba,r['mt']/area,growth,age,age*age,area,palms/area if valid(palms) and palms>0 else np.nan,f,rainfall(0,2),rainfall(3,5),rainfall(8,10),rainfall(20,22),rainfall(0,2)-rainfall(12,14)]
  if weather:x+=weather.get(shift(origin,-2),[np.nan]*3)
  return {'source':s,'division':str(names[s].get('division','unknown')),'plantingYear':str(r.get('plantingYear','unknown')),'month':t,'origin':origin,'area':area,'x':x,'seasonal':base,'seasonal_mean':float(np.mean(past)),'recent_seasonal':float(np.average(past,weights=[.7**k for k in range(len(past))])),'growth_blend':base*(1+np.clip(growth,.5,1.5))/2}
 samples=[]
 for r in rows:
  f=features(r['sourceBlockId'],r['month'])
  if f is not None:samples.append({**f,'actual':r['mt'],'residual':(r['mt']-f['seasonal'])/f['area']})
 X=lambda rs:np.array([r['x'] for r in rs]);Y=lambda rs:np.array([r['residual'] for r in rs])
 predictions=[];origins=sorted({r['origin'] for r in samples if r['month']>='2024-01'})+[latest]
 for origin in sorted(set(origins)):
  train=[r for r in samples if r['month']<=origin]
  batch=[r for r in samples if r['origin']==origin] if origin<latest else [f for r in rows if r['month']==latest and (f:=features(r['sourceBlockId'],shift(latest,1))) is not None]
  assert train and all(r['month']<=origin for r in train)
  models={'ridge_residual':make_pipeline(SimpleImputer(keep_empty_features=True,add_indicator=True),StandardScaler(),Ridge(alpha=100)), 'extra_trees_residual':make_pipeline(SimpleImputer(keep_empty_features=True,add_indicator=True),ExtraTreesRegressor(n_estimators=100,min_samples_leaf=15,max_features=.8,random_state=42,n_jobs=1))}
  for k,model in models.items():
   model.fit(X(train),Y(train));values=model.predict(X(batch))
   for r,v in zip(batch,values):r[k]=float(max(0,r['seasonal']+r['area']*v))
  for r in batch:predictions.append({k:v for k,v in r.items() if k not in ['x','residual']}|{'trainingStart':min(r['month'] for r in train),'trainingEnd':origin})
  print(origin, len(train),len(batch),flush=True)
 # Sources lacking effective area keep a tonnes baseline, never vanish from totals.
 represented={(r['source'],r['month']) for r in predictions}
 targets=[(r['sourceBlockId'],r['month']) for r in rows if r['month']>='2024-01']+[(r['sourceBlockId'],shift(latest,1)) for r in rows if r['month']==latest]
 for source,target in targets:
  if (source,target) in represented:continue
  b=idx.get((source,shift(target,-12)));o=idx.get((source,shift(target,-1)))
  if not b or not o:continue
  r={'source':source,'division':str(names[source].get('division','unknown')),'plantingYear':str(o.get('plantingYear','unknown')),'month':target,'origin':shift(target,-1),'area':o.get('effectiveHa'),'trainingStart':earliest,'trainingEnd':shift(target,-1),'fallbackReason':'Missing effective area: seasonal tonnes baseline'}
  if (source,target) in idx:r['actual']=idx[source,target]['mt']
  r.update({k:b['mt'] for k in KINDS});predictions.append(r);represented.add((source,target))
 divisions=sorted({r['division'] for r in predictions});chosen={};evaluation={}
 for div in divisions:
  val=[r for r in predictions if r['division']==div and '2024-01'<=r['month']<='2024-12']
  if not val:chosen[div]='seasonal';continue
  metrics={k:score(val,k) for k in KINDS};best=min(KINDS,key=lambda k:metrics[k]['maeTonnes'])
  # Select exclusively on validation; test is reported, not used to tune selection.
  chosen[div]=best if metrics[best]['maeTonnes']<.95*metrics['seasonal']['maeTonnes'] else 'seasonal'
  evaluation[div]={'selectedOn2024':chosen[div],'validation':metrics}
 for r in predictions:r['selected']=r[chosen[r['division']]]
 # Hierarchy is bottom-up coherent: block sums define divisions and estate.
 tests=[r for r in predictions if '2025-01'<=r['month']<=latest]
 for div in evaluation:
  rs=[r for r in tests if r['division']==div];evaluation[div]['test']={k:score(rs,k) for k in ['seasonal','selected']}
 final=[r for r in predictions if r['month']>latest]
 summaries={}
 for t in sorted({r['month'] for r in predictions}):
  rs=[r for r in predictions if r['month']==t];ds={d:sum(r['selected'] for r in rs if r['division']==d) for d in divisions}
  total=sum(r['selected'] for r in rs);assert math.isclose(sum(ds.values()),total,abs_tol=1e-7)
  summaries[t]={'estateTonnes':total,'divisionTonnes':ds,'sourceCount':len(rs),'coverage':'Prior-year and prior-month matched sources; missing-area sources retain seasonal tonnes baseline.'}
 report={'status':'offline_not_deployed','asOf':latest,'horizonMonths':1,'history':'Expanding: all eligible months before each origin','featureNames':feature_names,'weatherImported':bool(weather),'sources':hashes,'divisionResults':evaluation,'estateEligibleCohortTest':{k:score(tests,k) for k in ['seasonal','selected']},'cohortTests':{y:{k:score([r for r in tests if r['plantingYear']==y],k) for k in ['seasonal','selected']} for y in ['2017','2018']},'hierarchy':summaries,'forecasts':final,'limitations':['Earlier results have already been inspected; these are retrospective development scores, not a fresh independent holdout.','No August/September block actuals have been fabricated.','Age within a planting cohort is confounded with calendar time.','Optional reanalysis uses a two-month lag but historical revisions cannot be reconstructed.','Annual fertiliser uses origin year minus two; this is a calendar-year proxy, not an exact application lag.']}
 (out/'results.json').write_text(json.dumps(report,indent=2,allow_nan=False))
 with (out/'predictions.csv').open('w') as f:
  keys=['source','division','plantingYear','month','origin','actual','area','trainingStart','trainingEnd',*KINDS,'selected'];w=csv.DictWriter(f,fieldnames=keys,extrasaction='ignore');w.writeheader();w.writerows(predictions)
 for p in paths:assert hashes[str(p.relative_to(ROOT))]==hashlib.sha256(p.read_bytes()).hexdigest()
 print(json.dumps(report['cohortTests'],indent=2));return report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--weather-csv');args=p.parse_args();run(args.weather_csv)
