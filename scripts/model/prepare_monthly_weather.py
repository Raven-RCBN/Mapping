"""Validate a monthly weather export for the optional forecasting adapter.
CSV: month (YYYY-MM), temperature_c (C), soil_moisture (m3/m3),
solar_radiation (monthly mean W/m2). Do not mix accumulated energy and flux.
Missing measurements remain blank; values are never silently filled.
"""
import argparse,csv,datetime,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');args=p.parse_args()
fields=['month','temperature_c','soil_moisture','solar_radiation'];rows=list(csv.DictReader(Path(args.input).open()));seen=set()
assert rows,'No weather records'
for r in rows:
 assert all(k in r for k in fields),'Missing columns'
 assert datetime.datetime.strptime(r['month'],'%Y-%m').strftime('%Y-%m')==r['month']
 assert r['month'] not in seen,'Duplicate month';seen.add(r['month'])
 for k in fields[1:]:
  if not r[k]:continue
  v=float(r[k]);assert math.isfinite(v)
  assert (-90<=v<=65 if k=='temperature_c' else 0<=v<=1 if k=='soil_moisture' else 0<=v<=1500),f'Invalid {k} units/value'
with Path(args.output).open('w') as f:
 w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(sorted(rows,key=lambda r:r['month']))
print(f'Validated {len(rows)} monthly weather rows')
