"""Offline estate candidate. Writes research artifacts only; never deploys or imports records."""
import collections, json, math, hashlib
from functools import lru_cache
from pathlib import Path
import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from train_yield import ROOT, shift, valid, metrics

KINDS=['seasonal','seasonal_growth','ridge','age_ridge','growth_blend','age_blend','adaptive']
def run(root=ROOT):
 p=json.loads((root/'data/production/oban-production.json').read_text())
 evidence_path=root/'research/yield-20261016/oban-division-totals-jul-sep2026.json'
 evidence=json.loads(evidence_path.read_text())
 report_path=root/'data/yield-models'/f"{evidence['estateId']}.json"
 report=json.loads(report_path.read_text())
 rain=json.loads((root/'data/rainfall/oban-rainfall-through-sep2026.json').read_text())
 hts=json.loads((root/'data/hts-analysis/oban.json').read_text())
 grouped=collections.defaultdict(list)
 for r in p['monthly']:
  if r['receiptStatus']=='received' and valid(r.get('mt')):grouped[r['month']].append(r)
 totals={m:sum(r['mt'] for r in rs) for m,rs in grouped.items()}
 original_latest=max(totals)
 for m,total in evidence['reportedTotals'].items():
  assert abs(sum(r['mt'] for r in evidence['records'] if r['month']==m)-total)<.011
  if m in totals:assert abs(totals[m]-total)<.011
  totals[m]=total
 rain_index={f"{r['year']}-{v['month']:02d}":v['mm'] for r in rain['records'] for v in r.get('monthly',[]) if v.get('status')=='recorded' and valid(v.get('mm'))}
 fert=collections.defaultdict(float)
 for r in hts['fertiliser']:
  for q,product in zip(r['quantities'],hts['products']):
   if product['unit']=='kg' and valid(q):fert[r['year']]+=q
 def feature(origin,h):
  target=shift(origin,h)
  recent=[totals.get(shift(origin,-i)) for i in range(3)]
  baseline=totals.get(shift(target,-12))
  if any(v is None for v in recent) or baseline is None:return None
  past=[totals.get(shift(origin,-12-i)) for i in range(3)]
  growth=sum(recent)/sum(past) if all(v is not None for v in past) and sum(past)>0 else 1
  seasonal=[totals.get(shift(target,-12*i)) for i in range(1,6)]
  seasonal=[v for v in seasonal if v is not None]
  mm=int(target[-2:]);fy=int(origin[:4])-2
  base=[math.sin(mm*math.tau/12),math.cos(mm*math.tau/12),baseline,*recent,np.mean(seasonal),len(seasonal),growth,*[rain_index.get(shift(origin,-lag),np.nan) for lag in [0,3,6,12,24]],fert.get(fy,np.nan)]
  # Only planting records observed at/before the forecast origin; no backward GIS fill.
  last=max((m for m in grouped if m<=origin),default=None);rs=grouped.get(last,[])
  cohorts=[0.,0.,0.,0.,0.];known=0.;total_area=0.;weighted_age=0.;density_area=0.;palms_total=0.
  for r in rs:
   area=r.get('effectiveHa');year=str(r.get('plantingYear',''))
   if not valid(area) or area<=0:continue
   total_area+=area
   palms=r.get('workbookPalms')
   if valid(palms) and palms>0:density_area+=area;palms_total+=palms
   if not(year.isdigit() and len(year)==4):continue
   age=int(target[:4])-int(year)
   if not 0<=age<=80:continue
   known+=area;weighted_age+=area*age
   band=0 if age<4 else 1 if age<9 else 2 if age<19 else 3 if age<24 else 4
   cohorts[band]+=area
  ages=[weighted_age/known if known else np.nan,known/total_area if total_area else np.nan,*[v/known if known else np.nan for v in cohorts]]
  ages += [palms_total/density_area if density_area else np.nan,density_area/total_area if total_area else np.nan,fert.get(fy,0)/palms_total if fy in fert and palms_total else np.nan]
  return {'x':base+ages,'baseline':baseline,'growth':baseline*min(1.5,max(.5,growth))}
 def samples(h,cutoff):
  return [{'target':t,'y':totals[t],**f} for t in sorted(totals) if t<=cutoff and (f:=feature(shift(t,-h),h)) is not None]
 @lru_cache(maxsize=None)
 def predict(kind,origin,h):
  f=feature(origin,h)
  if not f:return None
  if kind=='adaptive':
   errors={}
   for candidate in KINDS[:-1]:
    checks=[(totals[t],predict(candidate,shift(t,-h),h)) for t in sorted(totals) if shift(origin,-11)<=t<=origin]
    checks=[(a,p) for a,p in checks if p is not None]
    if len(checks)>=9:errors[candidate]=sum(abs(a-p) for a,p in checks)/len(checks)
   selected=min(errors,key=errors.get) if errors else 'seasonal'
   return predict(selected,origin,h)
  if kind=='growth_blend':return .5*(f['baseline']+f['growth'])
  if kind=='age_blend':return .5*(f['baseline']+predict('age_ridge',origin,h))
  if kind=='seasonal':return f['baseline']
  if kind=='seasonal_growth':return f['growth']
  rows=samples(h,origin)
  if len(rows)<18:return f['baseline']
  size=len(f['x']) if kind=='age_ridge' else len(f['x'])-10
  model=make_pipeline(SimpleImputer(strategy='median',add_indicator=True,keep_empty_features=True),StandardScaler(),Ridge(alpha=100))
  model.fit(np.array([r['x'][:size] for r in rows]),np.array([r['y'] for r in rows]))
  return float(max(0,model.predict(np.array([f['x'][:size]]))[0]))
 def evaluate(kind,h,start,end):
  result=[]
  for target in sorted(totals):
   if not start<=target<=end:continue
   origin=shift(target,-h);value=predict(kind,origin,h)
   if value is not None:result.append({'origin':origin,'month':target,'actual':totals[target],'prediction':value})
  return {**metrics([r['actual'] for r in result],[r['prediction'] for r in result]),'months':result,'withinTwoPercent':sum(abs(r['prediction']/r['actual']-1)<=.02 for r in result if r['actual']>0)}
 latest=max(totals);horizons=[];forecasts=[]
 for h in [1,2,3]:
  validation={k:evaluate(k,h,'2024-01','2024-12') for k in KINDS}
  chosen=min(KINDS,key=lambda k:validation[k]['maeTonnes'])
  test_candidates={k:evaluate(k,h,'2025-01',original_latest) for k in KINDS}
  tested=test_candidates[chosen];baseline=test_candidates['seasonal']
  passed=tested['maeTonnes']<=.95*baseline['maeTonnes'];deployed=chosen if passed else 'seasonal'
  used=tested if passed else baseline
  # New Aug/Sep totals are external evaluation, never used to choose the method.
  external=[]
  for target in ['2026-08','2026-09']:
   origin=shift(target,-h)
   if origin<=original_latest:external.append({'month':target,'origin':origin,'actual':totals[target],'prediction':predict(deployed,origin,h)})
  horizons.append({'monthsAhead':h,'candidate':chosen,'method':deployed,'beatsBaseline':passed,'validation':{k:{a:v for a,v in d.items() if a!='months'} for k,d in validation.items()},'testCandidates':test_candidates,'candidateTest':tested,'baselineTest':baseline,'deployedTest':used,'externalCheck':external})
  candidate_values={kind:predict(kind,latest,h) for kind in KINDS}
  value=candidate_values[deployed];baseline_value=predict('seasonal',latest,h)
  forecasts.append({'horizon':h,'month':shift(latest,h),'predictionTonnes':value,'baselineTonnes':baseline_value,'effectiveHa':evidence['reportedHarvestedHa'],'method':deployed,'candidateTonnes':candidate_values})
 previous=[]
 for h in [1,2]:
  month=shift(report['asOf'],h);hs=next(x for x in report['horizons'] if x['monthsAhead']==h)
  fs=[f for f in report['forecasts'] if f['horizon']==h]
  prediction=sum(f['predictionTonnes'] if hs['beatsBaseline'] else f['baselineTonnes'] for f in fs)
  previous.append({'month':month,'forecast':prediction,'actual':totals[month],'errorPercent':100*(prediction/totals[month]-1),'method':'model' if hs['beatsBaseline'] else 'seasonal baseline','sourceCount':len(fs)})
 age_path=root/'data/yield-models/age-experiment'/report_path.name
 age=json.loads(age_path.read_text()) if age_path.exists() else None
 report['estateOutlook']={'asOf':latest,'target':'Whole-estate monthly FFB tonnes','trainingThrough':latest,'status':'research_only_not_deployed','areaBasis':'3,622.66 harvested hectares from the September division statement, held constant for forecast yield; not GIS area.','source':evidence['source'],'sourceSha256':hashlib.sha256(evidence_path.read_bytes()).hexdigest(),'forecasts':forecasts,'horizons':horizons,'history':[{'month':m,'mt':totals[m],'effectiveHa':evidence['reportedHarvestedHa']} for m in ['2026-07','2026-08','2026-09']],'previousForecastCheck':previous,'divisionActuals':evidence['records'],'limitations':['Only division totals are available after July. Block forecasts remain July-based and are not allocated from new totals.','Historic estate totals sum received workbook source records; unavailable source records are not imputed.','Methods chosen on 2024 rolling-origin results and gated on January 2025–July 2026. August/September checks are separate.','About 2% error is a target, not an accuracy guarantee.','Age and density candidates use origin-time planting years, total recorded palms/effective hectares (user-defined), coverage fractions and fertiliser per recorded palm. Missing counts are not replaced with zero. No universal Nigerian yield curve is imposed.'],'ageExperiment':[{'horizon':h['monthsAhead'],'model':h['model'],'blockMAE':h['modelMetrics']['maeTonnes'],'estateMAE':h['estateMetrics']['maeTonnes']} for h in age['horizons']] if age else []}
 candidate_path=root/'research/yield-20261016/estate-candidate.json'
 candidate_path.write_text(json.dumps(report,indent=2,allow_nan=False))
 print(json.dumps({'asOf':latest,'forecasts':forecasts,'horizons':[{k:h[k] for k in ['monthsAhead','candidate','method']}|{'mae':h['deployedTest']['maeTonnes'],'wape':h['deployedTest']['wapePercent'],'within2':h['deployedTest']['withinTwoPercent'],'months':h['deployedTest']['rows']} for h in horizons],'previous':previous},indent=2))
if __name__=='__main__':run()
