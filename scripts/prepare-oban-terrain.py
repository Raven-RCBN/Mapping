"""Create reproducible local terrain products from the public Copernicus tile."""
from pathlib import Path
import json, hashlib
import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
import sys
ROOT=Path(sys.argv[1]).resolve(); config=json.loads((ROOT/'import-config.json').read_text())
ESTATE=sys.argv[2]
OUT=ROOT/'qgis';OUT.mkdir(exist_ok=True)
WEB=ROOT/'terrain';WEB.mkdir(exist_ok=True)
SOURCE=ROOT/'source'/'copernicus-n05-e008.tif'
existing=OUT/'estate.gpkg'
if existing.exists():
 check=ogr.Open(str(existing))
 field=check.GetLayerByName('field_activities') if check else None
 if field is not None and field.GetFeatureCount()>0:
  raise RuntimeError('Field activities exist. Preserve/export field edits before rebuilding this package.')
 check=None

boundary=json.loads((ROOT/'boundaries.geojson').read_text())
(OUT/'boundaries.geojson').write_text(json.dumps(boundary))
bounds=config['bounds']
ll=osr.SpatialReference();ll.ImportFromEPSG(4326);ll.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
utm=osr.SpatialReference();utm.ImportFromEPSG(32632);utm.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
ct=osr.CoordinateTransformation(ll,utm)
a=ct.TransformPoint(bounds[0],bounds[1]);b=ct.TransformPoint(bounds[2],bounds[3])
area=[a[0],a[1],b[0],b[1]]
co=['COMPRESS=DEFLATE','TILED=YES']
gdal.Warp(str(OUT/'elevation-30m.tif'),str(SOURCE),dstSRS='EPSG:32632',outputBounds=area,xRes=30,yRes=30,resampleAlg='bilinear',dstNodata=-9999,creationOptions=co).FlushCache()
gdal.DEMProcessing(str(OUT/'hillshade.tif'),str(OUT/'elevation-30m.tif'),'hillshade',computeEdges=True,multiDirectional=True,creationOptions=co).FlushCache()
gdal.DEMProcessing(str(OUT/'slope-degrees.tif'),str(OUT/'elevation-30m.tif'),'slope',computeEdges=True,creationOptions=co).FlushCache()
# Derived contours use 10 m intervals; this does not imply 10 m positional accuracy.
contour_path=OUT/'contours.gpkg'
if contour_path.exists():contour_path.unlink()
ds=ogr.GetDriverByName('GPKG').CreateDataSource(str(contour_path));layer=ds.CreateLayer('contours_10m',srs=utm,geom_type=ogr.wkbLineString)
layer.CreateField(ogr.FieldDefn('id',ogr.OFTInteger));layer.CreateField(ogr.FieldDefn('elevation_m',ogr.OFTReal))
raster=gdal.Open(str(OUT/'elevation-30m.tif'));gdal.ContourGenerate(raster.GetRasterBand(1),10,0,[],1,-9999,layer,0,1)
contour_count=layer.GetFeatureCount();ds=None
web_opts=gdal.VectorTranslateOptions(format='GeoJSON',dstSRS='EPSG:4326')
gdal.VectorTranslate(str(WEB/'contours.geojson'),str(contour_path),options=web_opts)
# Web Mercator image aligns with the web and offline OpenLayers viewers.
merc=gdal.Warp('',str(OUT/'elevation-30m.tif'),format='MEM',dstSRS='EPSG:3857',xRes=30,yRes=30,resampleAlg='bilinear',dstNodata=-9999)
a=merc.ReadAsArray();valid=a>-9000;v=a[valid];lo,hi=float(v.min()),float(v.max())
shade=gdal.DEMProcessing('',merc,'hillshade',format='MEM',computeEdges=True,multiDirectional=True).ReadAsArray()/255.0
stops=np.array([0,.2,.4,.6,.8,1]);colors=np.array([[31,86,65],[75,126,75],[132,158,90],[196,190,116],[204,159,98],[241,230,201]])
t=np.clip((a-lo)/(hi-lo),0,1)
rgb=np.stack([np.interp(t,stops,colors[:,i]) for i in range(3)],axis=0)
rgb=np.clip(rgb*(.58+.42*shade)[None,:,:],0,255).astype('uint8')
image=gdal.GetDriverByName('MEM').Create('',merc.RasterXSize,merc.RasterYSize,4,gdal.GDT_Byte)
for i in range(3):image.GetRasterBand(i+1).WriteArray(rgb[i]);image.GetRasterBand(i+1).SetColorInterpretation([gdal.GCI_RedBand,gdal.GCI_GreenBand,gdal.GCI_BlueBand][i])
image.GetRasterBand(4).WriteArray(valid.astype('uint8')*255);image.GetRasterBand(4).SetColorInterpretation(gdal.GCI_AlphaBand)
gdal.GetDriverByName('PNG').CreateCopy(str(WEB/'terrain.png'),image)
# Additional scientific views use the same Web Mercator extent and dimensions.
for mode in ['hillshade','slope']:
 if mode=='hillshade':
  channels=np.stack([np.clip(shade*255,0,255)]*3).astype('uint8')
 else:
  slope_web=gdal.Warp('',str(OUT/'slope-degrees.tif'),format='MEM',dstSRS='EPSG:3857',outputBounds=[merc.GetGeoTransform()[0],merc.GetGeoTransform()[3]+merc.RasterYSize*merc.GetGeoTransform()[5],merc.GetGeoTransform()[0]+merc.RasterXSize*merc.GetGeoTransform()[1],merc.GetGeoTransform()[3]],width=merc.RasterXSize,height=merc.RasterYSize,resampleAlg='bilinear').ReadAsArray()
  slope_stops=[0,10,20,30,45,70];slope_colors=np.array([[217,239,203],[145,191,100],[234,211,101],[216,151,69],[169,75,55],[107,35,48]])
  channels=np.stack([np.interp(slope_web,slope_stops,slope_colors[:,i]) for i in range(3)]).astype('uint8')
 for i in range(3):image.GetRasterBand(i+1).WriteArray(channels[i])
 gdal.GetDriverByName('PNG').CreateCopy(str(WEB/(mode+'.png')),image)

gt=merc.GetGeoTransform();ms=osr.SpatialReference();ms.ImportFromEPSG(3857);ms.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER);back=osr.CoordinateTransformation(ms,ll)
nw=back.TransformPoint(gt[0],gt[3]);se=back.TransformPoint(gt[0]+merc.RasterXSize*gt[1],gt[3]+merc.RasterYSize*gt[5])
# Small WGS84 sample grid for local readouts, not a remote elevation API.
grid=gdal.Warp('',str(OUT/'elevation-30m.tif'),format='MEM',dstSRS='EPSG:4326',xRes=1/3600,yRes=1/3600,resampleAlg='bilinear',dstNodata=-9999)
values=grid.ReadAsArray();grid_gt=grid.GetGeoTransform()
(WEB/'elevation-grid.json').write_text(json.dumps({'width':grid.RasterXSize,'height':grid.RasterYSize,'transform':grid_gt,'values':np.round(values,1).tolist(),'nodata':-9999},separators=(',',':')))
# GeoPackage for shared boundaries and an empty real field collection layer.
pkg=OUT/'estate.gpkg'
if pkg.exists():pkg.unlink()
gdal.VectorTranslate(str(pkg),str(OUT/'boundaries.geojson'),format='GPKG',layerName='blocks',dstSRS='EPSG:4326')
gpkg=ogr.Open(str(pkg),1);blocks=gpkg.GetLayerByName('blocks')
for name in ['estate_id','block_id','survey_date']:blocks.CreateField(ogr.FieldDefn(name,ogr.OFTString))
for f in blocks:
 f.SetField('estate_id',ESTATE);f.SetField('block_id',f.GetField('blockName'));blocks.SetFeature(f)
activities=gpkg.CreateLayer('field_activities',srs=ll,geom_type=ogr.wkbPoint)
for name,typ in [('record_id',ogr.OFTString),('estate_id',ogr.OFTString),('block_id',ogr.OFTString),('activity_type',ogr.OFTString),('observed_at',ogr.OFTDateTime),('status',ogr.OFTString),('quantity',ogr.OFTReal),('unit',ogr.OFTString),('notes',ogr.OFTString),('photo_path',ogr.OFTString)]:activities.CreateField(ogr.FieldDefn(name,typ))
gpkg=None
(OUT/'attachments').mkdir(exist_ok=True)
metadata={'dataset':'Copernicus DEM GLO-30 Public, 2021 release','downloaded':'2026-10-05','source_url':'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N05_00_E008_00_DEM/Copernicus_DSM_COG_10_N05_00_E008_00_DEM.tif','source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'processing_crs':'EPSG:32632','pixel_spacing_m':30,'contour_interval_m':10,'contour_count':contour_count,'minimum_m':round(lo,1),'maximum_m':round(hi,1),'image_bounds':[[se[1],nw[0]],[nw[1],se[0]]],'boundary_count':len(boundary['features']),'vertical_reference':'EGM2008 orthometric height (metres)','warning':'Surface model includes vegetation and structures. Regional terrain overview; not a surveyed bare-earth model. Contour interval does not indicate accuracy.','attribution':'Copernicus DEM GLO-30, accessed 5 Oct 2026 via AWS Open Data. Contains modified Copernicus DEM data.'}
(WEB/'metadata.json').write_text(json.dumps(metadata,indent=2));(OUT/'provenance.json').write_text(json.dumps(metadata,indent=2))
print(json.dumps(metadata,indent=2))
