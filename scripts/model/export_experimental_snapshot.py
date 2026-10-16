"""Export the small experimental snapshot consumed by the authenticated webapp.
Raw training records and supplied aggregate actuals are not included.
"""
import hashlib,json
from pathlib import Path
from train_yield import ROOT
p=ROOT/'research/yield-20261016/residual-experiment/results.json';r=json.loads(p.read_text())
production=json.loads((ROOT/'data/production/oban-production.json').read_text());names={n['_id']:n for n in production['names']}
hts=json.loads((ROOT/'data/hts-analysis/oban.json').read_text())
forecasts=[]
for f in r['forecasts']:
 n=names[f['source']]
 forecasts.append({'sourceBlockId':f['source'],'sourceBlockCode':n.get('sourceBlockCode'),'mapBlockCode':n.get('mapBlockCode'),'plantingYear':f['plantingYear'],'division':f['division'],'month':f['month'],'effectiveHa':f['area'],'predictionTonnes':f['selected'],'baselineTonnes':f['seasonal'],'method':r['divisionResults'].get(f['division'],{}).get('selectedOn2024','seasonal')})
snapshot={'version':1,'estateId':hts['estateId'],'status':'experimental','asOf':r['asOf'],'horizonMonths':1,'history':r['history'],'weatherImported':r['weatherImported'],'evaluation':r['estateEligibleCohortTest'],'cohortEvaluation':r['cohortTests'],'forecasts':forecasts,'sourceSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'limitations':['Historical development scores are not a fresh independent accuracy test.','The August comparison was weaker; the existing three-month forecast remains the operational reference.','Totals cover matched sources only. Forecasts require actual block records through the preceding month.','Missing effective hectares withhold yield; those sources retain a tonnes-based seasonal baseline.','Soil-moisture, temperature and radiation data have not been imported.','Age, density and fertiliser associations do not establish causal effects.']}
out=ROOT/'data/yield-models'/f"{hts['estateId']}.experimental.json";out.write_text(json.dumps(snapshot,indent=2,allow_nan=False));print(out)
