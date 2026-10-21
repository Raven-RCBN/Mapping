"""Fetch a public STAC history for a configured estate polygon extent; retain catalog evidence."""
import json,sys,urllib.request,datetime,time
from pathlib import Path
root=Path(sys.argv[1]).resolve();cfg=json.loads((root/'import-config.json').read_text());start=cfg['requestedStart'];end=cfg['requestedEnd']
url='https://earth-search.aws.element84.com/v1/search'
body={'collections':['sentinel-2-c1-l2a'],'bbox':cfg['bounds'],'datetime':start+'T00:00:00Z/'+end+'T23:59:59Z','limit':200}
features={};pages=0
while url:
 for attempt in range(4):
  try:
   req=urllib.request.Request(url,data=json.dumps(body).encode() if body else None,headers={'Content-Type':'application/json','User-Agent':'MapIntel-estate-imagery/1.0'})
   with urllib.request.urlopen(req,timeout=90) as response:page=json.load(response)
   break
  except Exception:
   if attempt==3:raise
   time.sleep(2*(attempt+1))
 pages+=1
 for item in page.get('features',[]):features[item['id']]=item
 nxt=next((l for l in page.get('links',[]) if l.get('rel')=='next'),None)
 if not nxt:break
 url=nxt['href'];body=nxt.get('body') if nxt.get('method','GET')=='POST' else None
 if pages>100:raise RuntimeError('Unexpected catalog pagination')
out=root/'source/sentinel-history-search.json';out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'type':'FeatureCollection','features':list(features.values()),'search':{'bounds':cfg['bounds'],'start':start,'end':end,'pages':pages,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}}))
months=sorted({i['properties']['datetime'][:7] for i in features.values()});print(json.dumps({'scenes':len(features),'months':months,'pages':pages}),flush=True)
