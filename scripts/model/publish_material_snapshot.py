"""Prepare the selected one-month material model for webapp deployment.
Only the saved model snapshot is updated; production source records are untouched.
Run train_material_candidates.py and validate_material_experiment.py first.
Two/three-month forecasts are retained from the original saved model.
"""
import collections,csv,hashlib,json,math
from datetime import datetime,timezone
from pathlib import Path
import joblib
import numpy as np
from train_yield import ROOT

ESTATE='f7b09538-fd0c-4ac3-b3ba-b6bf90e400ae'
KIND='extra_trees_material_survey'
def metrics(rows,key):
 a=np.array([float(r['actual']) for r in rows]);p=np.array([float(r[key]) for r in rows])
 return {'maeTonnes':float(np.mean(abs(a-p))),'wapePercent':float(100*sum(abs(a-p))/sum(a)),'rows':len(rows)}
def run():
 root=ROOT/'research/20261017-material-experiment';result=json.loads((root/'results.json').read_text());rows=list(csv.DictReader((root/'predictions.csv').open()))
 base_path=ROOT/'data/yield-models/archive-before-age-20261016'/f'{ESTATE}.json';report=json.loads(base_path.read_text());assert report['asOf']==result['asOf']
 validation=[r for r in rows if '2024-01'<=r['month']<='2024-12'];test=[r for r in rows if '2025-01'<=r['month']<=result['asOf']]
 radius=float(np.quantile([abs(float(r['actual'])-float(r[KIND])) for r in validation],.8,method='higher'))
 measured=metrics(test,KIND);baseline=metrics(test,'seasonal');improvement=100*(1-measured['maeTonnes']/baseline['maeTonnes'])
 old_ids={r['sourceBlockId'] for r in report['forecasts'] if r['horizon']==1};new={r['source']:r for r in result['forecasts']};assert old_ids==set(new)
 for f in report['forecasts']:
  if f['horizon']!=1:continue
  r=new[f['sourceBlockId']];value=r[KIND];assert math.isfinite(value) and value>=0 and math.isclose(f['baselineTonnes'],r['seasonal'])
  f.update({'predictionTonnes':value,'lowerTonnes':max(0,value-radius),'upperTonnes':value+radius,'effectiveHa':r['area'],'plantingYear':r['plantingYear'],'plantingMaterial':r['materialInfo']['material'],'materialAvailableFrom':r['materialInfo']['availableFrom'],'method':KIND})
 h=report['horizons'][0]
 h.update({'model':KIND,'features':result['features']+['planting_material_one_hot'],'validationCandidates':{KIND:metrics(validation,KIND)},'trainingRows':result['trainingAudit'][-1]['trainingRows'],'validationRows':len(validation),'testStart':'2025-01','testEnd':result['asOf'],'testMonths':len({r['month'] for r in test}),'modelMetrics':measured,'baselineMetrics':baseline,'improvementPercent':improvement,'empirical80RangeRadiusTonnes':radius,'testRangeCoveragePercent':100*sum(abs(float(r['actual'])-float(r[KIND]))<=radius for r in test)/len(test),'beatsBaseline':improvement>=5,'recommendedMethod':KIND,'estateMetrics':result['test2025Onward'][KIND],'trainingDescription':'All eligible prior months at each one-month origin; material labels gated by survey date and matching planting year.','selection':'User selected after the August aggregate comparison; historical development scores remain retrospective.'})
 assert h['beatsBaseline'],'Do not silently select baseline when publishing requested model'
 report['generatedAt']=datetime.now(timezone.utc).isoformat();report['modelRevision']='planting-material-one-month-20261017'
 report['materialModel']={'method':KIND,'horizonMonths':1,'estateMetrics':result['test2025Onward'][KIND],'previousCandidateEstateMetrics':result['test2025Onward']['previous'],'augustComparison':result['augustChecks'][KIND],'cohortMetrics':{k:v[KIND] for k,v in result['cohortTests'].items()},'selectionReason':'Selected by user based on improved August aggregate comparison.','history':'All usable prior months','weatherImported':False,'limitations':result['limitations']}
 report['sources']+=[{'path':p,'sha256':digest} for p,digest in result['sourceHashes'].items() if p.startswith('data/estates/')]
 report['limitations']+=['One-month forecast uses planting-material Extra Trees; two/three-month methods are unchanged.','Planting material uses survey-aware labels and matching planting cohorts. Unknown labels are not inferred from yield.','The August aggregate comparison is indicative because exact August block coverage is unavailable. Consistent 2% accuracy is not established.','One-month validation scores are retrospective development results on already-inspected periods.']
 out=ROOT/'data/yield-models'/f'{ESTATE}.json';out.write_text(json.dumps(report,indent=2,allow_nan=False))
 fitted=joblib.load(root/'material-models.joblib') # Trusted locally trained model.
 joblib.dump({'model':fitted['models'][KIND],'method':KIND,'features':fitted['features'],'materialCategories':fitted['materialCategories'],'asOf':fitted['asOf'],'horizonMonths':1},ROOT/'data/yield-models'/f'{ESTATE}.material-one-month.joblib')
 assert math.isclose(sum(r['predictionTonnes'] for r in report['forecasts'] if r['horizon']==1),sum(r[KIND] for r in result['forecasts']),abs_tol=1e-8)
 original=json.loads(base_path.read_text())
 assert [r for r in original['forecasts'] if r['horizon']>1]==[r for r in report['forecasts'] if r['horizon']>1]
 print(json.dumps({'asOf':report['asOf'],'oneMonthTonnes':sum(r['predictionTonnes'] for r in report['forecasts'] if r['horizon']==1),'sourceMetrics':measured,'estateMetrics':h['estateMetrics'],'modelRevision':report['modelRevision']},indent=2))
if __name__=='__main__':run()
