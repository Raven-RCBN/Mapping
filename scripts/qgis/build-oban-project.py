"""Build styled QGIS/QField projects using QGIS's installed Python API."""
import os,sys,json,zipfile
from pathlib import Path
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
from qgis.core import *
from qgis.PyQt.QtGui import QColor
from qgis.PyQt.QtCore import QVariant
ROOT=Path(sys.argv[1]).resolve();DIR=ROOT/'qgis';ESTATE=sys.argv[2]
app=QgsApplication([],False);app.initQgis()
project=QgsProject.instance();project.setFileName(str(DIR/'Oban-Desktop.qgz'));project.setTitle('DigitalPalm · Oban Nigeria Terrain & Field Operations');project.setCrs(QgsCoordinateReferenceSystem('EPSG:32632'));project.setFilePathStorage(Qgis.FilePathType.Relative)
meta=json.loads((DIR/'provenance.json').read_text())
# Independent groups keep scientific raster layers available for analysis.
analysis=project.layerTreeRoot().addGroup('Terrain analysis · 30 m surface model')
def raster(filename,name,group=None):
 l=QgsRasterLayer(str(DIR/filename),name)
 assert l.isValid(),name
 project.addMapLayer(l,False)
 (group or project.layerTreeRoot()).addLayer(l)
 return l
slope=raster('slope-degrees.tif','Slope (degrees)',analysis)
shader=QgsColorRampShader();shader.setColorRampType(QgsColorRampShader.Interpolated);shader.setColorRampItemList([QgsColorRampShader.ColorRampItem(v,QColor(c),f'{v}°') for v,c in [(0,'#d9efcb'),(10,'#91bf64'),(20,'#ead365'),(30,'#d89745'),(45,'#a94b37'),(70,'#6b2330')]])
rs=QgsRasterShader();rs.setRasterShaderFunction(shader);slope.setRenderer(QgsSingleBandPseudoColorRenderer(slope.dataProvider(),1,rs));analysis.findLayer(slope.id()).setItemVisibilityChecked(False)
elevation=raster('elevation-30m.tif','Elevation (m · EGM2008)',analysis)
shader=QgsColorRampShader();shader.setColorRampType(QgsColorRampShader.Interpolated);lo=meta['minimum_m'];hi=meta['maximum_m'];palette=['#1f5641','#4b7e4b','#849e5a','#c4be74','#cc9f62','#f1e6c9']
shader.setColorRampItemList([QgsColorRampShader.ColorRampItem(lo+(hi-lo)*i/5,QColor(c),f'{lo+(hi-lo)*i/5:.0f} m') for i,c in enumerate(palette)])
rs=QgsRasterShader();rs.setRasterShaderFunction(shader);elevation.setRenderer(QgsSingleBandPseudoColorRenderer(elevation.dataProvider(),1,rs))
hill=raster('hillshade.tif','Hillshade',analysis);hill.renderer().setOpacity(.32)
# Order rendering: hillshade above elevation.
analysis.findLayer(hill.id()).setItemVisibilityChecked(True)
contours=QgsVectorLayer(str(DIR/'contours.gpkg')+'|layername=contours_10m','Contours · 10 m interval','ogr');assert contours.isValid();contours.setReadOnly(True)
contours.renderer().setSymbol(QgsLineSymbol.createSimple({'line_color':'115,93,55,180','line_width':'.18'}))
settings=QgsPalLayerSettings();settings.fieldName='elevation_m';settings.isExpression=False
fmt=QgsTextFormat();fmt.setSize(7);fmt.setColor(QColor('#624b2a'));buf=QgsTextBufferSettings();buf.setEnabled(True);buf.setSize(.5);buf.setColor(QColor('#f9f4dd'));fmt.setBuffer(buf);settings.setFormat(fmt);settings.placement=Qgis.LabelPlacement.Line
contours.setLabeling(QgsVectorLayerSimpleLabeling(settings));contours.setLabelsEnabled(True);project.addMapLayer(contours)
blocks=QgsVectorLayer(str(DIR/'estate.gpkg')+'|layername=blocks','Oban Nigeria · 239 planting blocks','ogr');assert blocks.isValid();blocks.setReadOnly(True)
blocks.renderer().setSymbol(QgsFillSymbol.createSimple({'color':'0,0,0,0','outline_color':'17,68,42,255','outline_width':'.65'}))
settings=QgsPalLayerSettings();settings.fieldName='blockName';fmt=QgsTextFormat();fmt.setSize(9);fmt.setColor(QColor('#133c27'));buf=QgsTextBufferSettings();buf.setEnabled(True);buf.setSize(.9);buf.setColor(QColor('#fff8df'));fmt.setBuffer(buf);settings.setFormat(fmt);blocks.setLabeling(QgsVectorLayerSimpleLabeling(settings));blocks.setLabelsEnabled(True);project.addMapLayer(blocks)
activity=QgsVectorLayer(str(DIR/'estate.gpkg')+'|layername=field_activities','Field activities · offline capture','ogr');assert activity.isValid();activity.renderer().setSymbol(QgsMarkerSymbol.createSimple({'name':'circle','color':'237,182,64,255','outline_color':'18,63,43,255','size':'3.5'}))
project.addMapLayer(activity)
fields=activity.fields()
for field,expression in [('record_id','uuid()'),('estate_id',"'"+ESTATE+"'"),('observed_at','now()'),('status',"'Pending verification'")]:activity.setDefaultValueDefinition(fields.indexOf(field),QgsDefaultValue(expression))
for name,values in [('activity_type',['Harvesting','Weeding','Road maintenance','Inspection']),('status',['Pending verification','Verified','Needs attention']),('unit',['t','ha','km','count'])]:activity.setEditorWidgetSetup(fields.indexOf(name),QgsEditorWidgetSetup('ValueMap',{'map':[{v:v} for v in values]}))
activity.setEditorWidgetSetup(fields.indexOf('block_id'),QgsEditorWidgetSetup('ValueRelation',{'Layer':blocks.id(),'Key':'block_id','Value':'blockName','AllowNull':False,'OrderByValue':True}))
activity.setEditorWidgetSetup(fields.indexOf('notes'),QgsEditorWidgetSetup('TextEdit',{'IsMultiline':True}))
activity.setEditorWidgetSetup(fields.indexOf('photo_path'),QgsEditorWidgetSetup('ExternalResource',{'RelativeStorage':1,'DocumentViewer':1,'StorageMode':0,'DefaultRoot':'./attachments','FileWidget':True,'FileWidgetButton':True}))
for name in ['record_id','estate_id','block_id','activity_type','observed_at']:activity.setFieldConstraint(fields.indexOf(name),QgsFieldConstraints.ConstraintNotNull)
activity.setFieldConstraint(fields.indexOf('record_id'),QgsFieldConstraints.ConstraintUnique)
for field in fields:activity.setFieldAlias(fields.indexOf(field.name()),field.name().replace('_',' ').title())
# Read-only survey / terrain, editable activity layer. Copies are usable without cloud accounts.
for l in [blocks,contours,elevation,hill,slope]:l.setCustomProperty('QFieldSync/action','copy')
activity.setCustomProperty('QFieldSync/action','copy')
project.setCustomVariables({'estate_id':ESTATE,'terrain_source':'Copernicus DEM GLO-30 Public','data_warning':meta['warning']})
project.viewSettings().setDefaultViewExtent(QgsReferencedRectangle(QgsRectangle(elevation.extent()),project.crs()))
# Keep map drawing order explicit.
root=project.layerTreeRoot();root.setHasCustomLayerOrder(True);root.setCustomLayerOrder([activity,blocks,contours,hill,elevation,slope])
project.setBackgroundColor(QColor('#f2f5e9'))
# Supporting GIS layers are local and bundled for offline QField use.
import shutil
shutil.copytree(ROOT/'vectors',DIR/'vectors',dirs_exist_ok=True)
context=[]
for name,title,color in [('land-use','Land use','#527353'),('rivers','Rivers · areas','#44b7d7'),('river-lines','Rivers · waterways','#44b7d7'),('roads','Roads · areas','#e6b946'),('road-lines','Roads · routes','#e6b946'),('buildings','Buildings','#d98345'),('poi','Points of interest','#9665bc')]:
 l=QgsVectorLayer(str(DIR/'vectors'/(name+'.geojson')),title,'ogr');assert l.isValid(),title
 l.setReadOnly(True);l.setCustomProperty('QFieldSync/action','copy')
 if l.geometryType()==Qgis.GeometryType.Point:symbol=QgsMarkerSymbol.createSimple({'color':color,'size':'2','outline_color':'#ffffff'})
 elif l.geometryType()==Qgis.GeometryType.Line:symbol=QgsLineSymbol.createSimple({'line_color':color,'line_width':'.45'})
 else:symbol=QgsFillSymbol.createSimple({'color':color+'55','outline_color':color,'outline_width':'.25'})
 l.renderer().setSymbol(symbol);project.addMapLayer(l);context.append(l)
latest=sorted((ROOT/'imagery').glob('*-10m.tif'))
sat=[]
if latest:
 shutil.copy2(latest[-1],DIR/'satellite-10m.tif')
 satellite=raster('satellite-10m.tif','Sentinel-2 · '+latest[-1].name[:10]);sat=[satellite]
root.setCustomLayerOrder([activity,blocks,*reversed(context),contours,*sat,hill,elevation,slope])
elevation.setShortName('terrain');hill.setShortName('hillshade');slope.setShortName('slope')
assert project.write(),'Project write failed'
project.setFileName(str(DIR/'Oban-QField.qgz'));assert project.write()
project.setFileName(str(DIR/'published.qgz'));hill.renderer().setOpacity(1);assert project.write()
# Re-open saved projects and confirm every layer resolves from local data.
project.clear();assert project.read(str(DIR/'Oban-Desktop.qgz'))
assert len(project.mapLayers())>=13
for layer in project.mapLayers().values():assert layer.isValid(),layer.name()
assert project.mapLayersByName('Field activities · offline capture')[0].featureCount()==0
print('QGIS version:',Qgis.QGIS_VERSION)
print('Projects written and re-opened; all local layers valid; field capture layer is empty.')
sys.stdout.flush();os._exit(0)
