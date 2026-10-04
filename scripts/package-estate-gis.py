"""Create a private deployment manifest for prepared Oban maps and local QGIS files."""
import hashlib,json,sys,zipfile
from pathlib import Path
root=Path(sys.argv[1]).resolve()
payload=json.loads((root/'gis-import.json').read_text());estate=payload['estateId']
history=json.loads((root/'history.json').read_text());terrain=json.loads((root/'terrain/metadata.json').read_text())
# Start with the source vectors; rerunning does not duplicate generated entries.
payload['assets']=[a for a in payload['assets'] if a['kind']=='vector']
def asset(key,name,kind,file,mime,**metadata):
 p=root/file
 payload['assets'].append({'_id':estate+'-'+key,'estateId':estate,'name':name,'kind':kind,'importedAt':history['downloaded'],**metadata,'file':{'path':'estates/'+estate+'/'+file,'mime':mime,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}})
for row in history['records']:
 asset('sentinel-'+row['date'],'Sentinel-2 · '+row['date'],'imagery',row['image_url'],'image/png',acquiredAt=row['date'],bounds=row['image_bounds'],cloudPercent=row['estate_cloud_shadow_snow_percent'],resolution=10,attribution=row['attribution'],sourceUrl=row['catalog_url'])
for kind in ['terrain','hillshade','slope','contours','elevation-grid']:
 suffix='.geojson' if kind=='contours' else '.json' if kind=='elevation-grid' else '.png'
 asset(kind,'Copernicus · '+kind,kind,'terrain/'+kind+suffix,'image/png' if suffix=='.png' else 'application/json',bounds=terrain['image_bounds'],resolution=30,attribution=terrain['attribution'],sourceUrl=terrain['source_url'])
with zipfile.ZipFile(root/'Oban-QGIS-QField.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted((root/'qgis').rglob('*')):
  if p.is_file():z.write(p,'Oban-QGIS-QField/'+str(p.relative_to(root/'qgis')))
asset('qgis-package','Oban · QGIS / QField offline project','qgis','Oban-QGIS-QField.zip','application/zip',attribution='Oban supplied GIS; Copernicus Sentinel-2 and GLO-30')
payload['sources']=[{'_id':estate+'-supplied-gis','estateId':estate,'name':'Oban supplied planting blocks and infrastructure','type':'Folder','path':'Private estate folder · original GeoJSON retained','schedule':'Manual import','retention':'Keep original survey files'}, {'_id':estate+'-sentinel-catalog','estateId':estate,'name':'Sentinel-2 monthly archive · Oct 2024–Sep 2026','type':'Satellite catalog','path':'https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a','schedule':'Manual download completed 5 Oct 2026','retention':'Dated images; administrator retention controls'}]
payload.pop('importId',None)
payload['importId']=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
(root/'gis-import.json').write_text(json.dumps(payload,separators=(',',':')))
print(json.dumps({'importId':payload['importId'],'blocks':len(payload['blocks']),'assets':len(payload['assets']),'imagery':len(history['records']),'assetBytes':sum(a['file']['bytes'] for a in payload['assets'])}))
