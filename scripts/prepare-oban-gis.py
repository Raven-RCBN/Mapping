"""Prepare supplied Oban GeoJSON without changing originals or inventing activities."""
import json,sys,hashlib,re
from pathlib import Path
from collections import defaultdict
from osgeo import ogr,gdal,osr
root=Path(sys.argv[1]).resolve(); estate=sys.argv[2]
out=root/'vectors';out.mkdir(exist_ok=True)
gdal.UseExceptions();gdal.PushErrorHandler('CPLQuietErrorHandler')
source=root/'source/Oban_All_Blocking.geojson'
raw=json.loads(source.read_text());groups=defaultdict(list);land=[];repairs=[]
for i,f in enumerate(raw['features']):
 p=f['properties'];g=ogr.CreateGeometryFromJson(json.dumps(f['geometry']))
 if not g.IsValid():
  g=g.MakeValid();repairs.append({'file':source.name,'feature':i+1})
 if g.IsEmpty():raise ValueError('Empty geometry')
 f['geometry']=json.loads(g.ExportToJson());f['properties']['sourceFeature']=i+1
 planting=bool(re.fullmatch(r'\d{4}',str(p.get('Plant_Year','')))) or p['Block_Name']=='RO Planting'
 (groups[str(p['Block_No']).strip()] if planting else land).append(f)
boundaries=[];blocks=[]
for code,fs in sorted(groups.items()):
 geometry=ogr.CreateGeometryFromJson(json.dumps(fs[0]['geometry']))
 for f in fs[1:]:geometry=geometry.Union(ogr.CreateGeometryFromJson(json.dumps(f['geometry'])))
 geometry=ogr.ForceToMultiPolygon(geometry)
 if not geometry.IsValid():geometry=geometry.MakeValid()
 p=fs[0]['properties']; area=sum(f['properties'].get('Area_GIS') or 0 for f in fs)
 props={**p,'blockName':code,'areaHa':area,'sourceFeatures':[f['properties']['sourceFeature'] for f in fs]}
 boundaries.append({'type':'Feature','properties':props,'geometry':json.loads(geometry.ExportToJson())})
 number=lambda key: p.get(key) if isinstance(p.get(key),(int,float)) else None
 blocks.append({'_id':estate+'-block-'+hashlib.sha256(code.encode()).hexdigest()[:16], 'estateId':estate,
 'blockCode':code,'plantingYear':str(p['Plant_Year']) if re.fullmatch(r'\d{4}',str(p['Plant_Year'])) else '',
 'plantingYearDescription':str(p['Plant_Year']),'blockStatus':p['Block_Name'],
 'plantedHectares':area,'gisAreaHa':area,'plantingMaterial':p.get('Material') or '',
 'totalPalms':number('Total Palm') if len(fs)==1 else None,'palmsPerHectare':number('SPH'),
 'surveyDate':p.get('LDateSurve'),'division':p.get('Division'),
 'mapBlockNames':[code],'mapLinkMethod':'source-block-id','sourceFile':source.name,'sourceRow':fs[0]['properties']['sourceFeature']})
fc=lambda fs:{'type':'FeatureCollection','features':fs}
(root/'boundaries.geojson').write_text(json.dumps(fc(boundaries),separators=(',',':')))
(out/'land-use.geojson').write_text(json.dumps(fc(land),separators=(',',':')))
assets=[('land-use','Land use',out/'land-use.geojson')]
for file,role,name in [('Oban_River_Polygon.geojson','rivers','Rivers · areas'),('Oban_River_Polyline.geojson','river-lines','Rivers · waterways'),('Oban_Road_Polygon.geojson','roads','Roads · areas'),('Oban_Road_Polyline.geojson','road-lines','Roads · routes'),('Oban_Building.geojson','buildings','Buildings'),('Oban_POI.geojson','poi','Points of interest')]:
 d=json.loads((root/'source'/file).read_text())
 for i,f in enumerate(d['features']):
  g=ogr.CreateGeometryFromJson(json.dumps(f['geometry']))
  if not g.IsValid():g=g.MakeValid();repairs.append({'file':file,'feature':i+1})
  if g.IsEmpty():raise ValueError('Empty geometry: '+file)
  f['geometry']=json.loads(g.ExportToJson())
 target=out/(role+'.geojson');target.write_text(json.dumps(fc(d['features']),separators=(',',':')))
 assets.append((role,name,target))
manifest=[]
for role,name,p in assets:
 b=p.read_bytes();count=len(json.loads(b)['features'])
 manifest.append({'_id':estate+'-'+role,'estateId':estate,'name':name,'kind':'vector','layerType':role,'featureCount':count,'importedAt':'2026-10-05','attribution':'Oban estate GIS · supplied survey data','file':{'path':'estates/'+estate+'/vectors/'+p.name,'mime':'application/json','bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}})
report={'plantingPolygons':sum(map(len,groups.values())),'plantingBlocks':len(groups),'landUsePolygons':len(land),'duplicateParts':{c:len(fs) for c,fs in groups.items() if len(fs)>1},'sourceGISAreaHa':sum(f['properties'].get('Area_GIS')or 0 for f in raw['features']),'plantingGISAreaHa':sum(b['gisAreaHa'] for b in blocks),'repairs':repairs,'note':'Area_GIS is retained from the supplied file. Import date is not a survey or imagery capture date. Estate configured area is preserved.'}
payload={'version':1,'estateId':estate,'estateName':'Oban Nigeria','source':source.name,'boundary':fc(boundaries),'blocks':blocks,'assets':manifest,'report':report}
(root/'gis-import.json').write_text(json.dumps(payload,separators=(',',':')))
(root/'gis-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({**report,'layerCounts':{a['name']:a['featureCount'] for a in manifest}},indent=2))
