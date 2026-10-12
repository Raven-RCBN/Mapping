"""Read six HTS workbooks; produce a private, auditable analysis snapshot.
Run from repo root: python scripts/prepare-hts-analysis.py [Downloads folder] [output JSON]
No source or production database is modified. Quantities follow the workbook's converted-kg note provisionally.
"""
import json, re, sys, hashlib
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict
import openpyxl
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path.home()/'Downloads'
out=Path(sys.argv[2]) if len(sys.argv)>2 else Path('data/hts-analysis/oban.json')
gis=json.loads(Path('data/estates/oban-nigeria/gis-import.json').read_text())
prod=json.loads(Path('data/production/oban-production.json').read_text())
polygons={f['properties']['blockName'] for f in gis['boundary']['features']}
blocks={b['blockCode']:b for b in gis['blocks'] if b['blockCode'] in polygons}
norm=lambda s:re.sub(r'([A-Z])0+(\d)',r'\1\2',str(s).strip().upper())
links=defaultdict(set)
for n in prod['names']:
 if n.get('mapBlockCode') in blocks:links[(n['division'],norm(n['sourceBlockCode']))].add(n['mapBlockCode'])
def link(division,code):
 candidates=links[(division,norm(code))]
 if len(candidates)==1:return next(iter(candidates)),'existing_crosswalk'
 b=blocks.get(norm(code))
 if b and b.get('division')==division:return norm(code),'code_and_division'
 return None,'unmapped'
def minor(x):return None if x is None else int((Decimal(str(x))*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
def number(x):return isinstance(x,(int,float)) and not isinstance(x,bool)
sources=[]
def source(p):
 sources.append(dict(file=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
 return openpyxl.load_workbook(p,read_only=True,data_only=True)
fert=[];products=[];sections=[];fertchecks=[]
w=source(root/'2017-2025_Oban Fertiliser Summary by Divisions.xlsx')
for sheet in w:
 year=None;current=[]
 for rn,row in enumerate(sheet.values,1):
  key=str(row[0] or '').strip()
  if key.startswith('All-Years'):break
  if key.startswith('Year:'):
   year=int(key.split(':')[1]);current=[];sections.append(dict(division=sheet.title,year=year))
  elif key=='Block':
   products=list(row[1:10])
  elif key=='Unit':units=list(row[1:10])
  elif key=='Wt/unit':weights=list(row[1:10])
  elif key=='Grand Total':
   for c in range(9):assert abs(sum(r['quantities'][c] or 0 for r in current)-(row[c+1] or 0))<.00001,(sheet.title,year,c)
   fertchecks.append([sheet.title,year,len(current)])
  elif year and key and not key.startswith('No fertiliser usage recorded') and any(number(v) for v in row[1:10]):
   mapped,method=link(sheet.title,key)
   r=dict(year=year,division=sheet.title,sourceBlockCode=key,mapBlockCode=mapped,linkMethod=method,
    mapHa=blocks[mapped]['gisAreaHa'] if mapped else None,quantities=list(row[1:10]),sourceUnits=units,sourceWeights=weights,sourceSheet=sheet.title,sourceRow=rn)
   assert all(v is None or number(v) for v in r['quantities'])
   fert.append(r);current.append(r)
assert len(fert)==1165
assert len({(r['year'],r['division'],r['sourceBlockCode']) for r in fert})==len(fert)
wages=[];periods=[];checks=[]
months={m:i+1 for i,m in enumerate(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'])}
for year in range(2021,2026):
 p=root/f'Monthly Wages Activity {year}_FINAL.xlsx';w=source(p);yearmonths=[]
 for s in w:
  rows=list(s.values);m=None
  match=re.fullmatch(r"([A-Za-z]+)\s*'(\d{2})",s.title)
  title=' '.join(str(v) for row in rows[:2] for v in row if v is not None)
  if match and int(match[2])+2000==year:m=months[match[1][:3].upper()]
  elif year in [2021,2022] and re.match(r'^\d+\.',s.title):
   if year==2021 and '2020 WAGES' in title.upper():continue
   m=next((v for k,v in months.items() if re.search(r'\b'+k,title.upper())),int(s.title.split('.')[0]))
  if m is None:continue
  period=f'{year}-{m:02d}';yearmonths.append(m)
  hrow=next(i for i,r in enumerate(rows[:5]) if 'Man-Day(s)' in r and 'Total Amount' in r)
  h={str(v).strip():i for i,v in enumerate(rows[hrow]) if v is not None}
  periods.append(dict(period=period,sourceFile=p.name,sourceSheet=s.title,periodLabel=' '.join(str(v) for v in rows[0] if v is not None)))
  detail=[]
  for rn,row in enumerate(rows[hrow+1:],hrow+2):
   if not number(row[0]) or not row[h['Task']] or not row[h['Activity']]:continue
   r=dict(period=period,task=str(row[h['Task']]).strip(),activity=str(row[h['Activity']]).strip(),
    manDays=row[h['Man-Day(s)']],rate=row[h['Wage']],points=row[h['Points']],
    developmentMinor=minor(row[h['Development']]),maintenanceMinor=minor(row[h['Maintenance']]),amountMinor=minor(row[h['Total Amount']]),
    sourceFile=p.name,sourceSheet=s.title,sourceRow=rn,sourceSerial=row[0])
   assert all(number(r[k]) for k in ['manDays','rate','points','amountMinor'])
   assert abs(r['rate']*r['points']-r['amountMinor']/100)<.011
   if r['maintenanceMinor'] is not None:assert r['developmentMinor']+r['maintenanceMinor']==r['amountMinor']
   wages.append(r);detail.append(r)
  total=sum(r['amountMinor'] for r in detail)
  controls=[dict(row=rn,totalMinor=minor(row[c+1]),differenceMinor=total-minor(row[c+1])) for rn,row in enumerate(rows,1) for c,v in enumerate(row[:-1]) if str(v).strip().upper()=='TOTAL' and number(row[c+1])]
  assert len(controls)==1
  checks.append(dict(period=period,detailMinor=total,**controls[0]))
 assert sorted(yearmonths)==list(range(1,13)),(year,yearmonths)
assert len(wages)==5488
snapshot=dict(version=1,estateId=gis['estateId'],asOf='2026-10-12',sources=sources,
 unitBasis='Provisional: numeric solids treated as kg per workbook conversion note; conflicting Bag labels and 25/1 weight metadata await source confirmation. Bags are 50 kg equivalents, not original package counts.',
 products=[dict(name=p,unit='L' if i>=7 else 'kg') for i,p in enumerate(products)],fertiliser=fert,wages=wages,periods=periods,
 checks=dict(wageMonths=checks,fertiliserTotals=fertchecks),fertiliserSections=sections,
 mapAreas=[dict(mapBlockCode=b['blockCode'],division=b.get('division'),mapHa=b['gisAreaHa']) for b in blocks.values()])
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(snapshot,separators=(',',':')))
print(json.dumps(dict(path=str(out),wageRows=len(wages),fertiliserRows=len(fert),mappedRows=sum(bool(r['mapBlockCode']) for r in fert),unmappedBlocks=sorted({r['division']+':'+r['sourceBlockCode'] for r in fert if not r['mapBlockCode']}),wageDifferences=[c for c in checks if c['differenceMinor']]),indent=2))
