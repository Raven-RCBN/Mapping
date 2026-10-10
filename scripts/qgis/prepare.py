"""Copy a QGIS/QField estate package and publish a read-only QGIS Server project."""
import os,sys,shutil
from pathlib import Path
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
from qgis.core import QgsApplication,QgsProject,Qgis
source=Path(sys.argv[1]).resolve();target=Path(sys.argv[2]).resolve()
if source==target: raise ValueError('Use a separate publishing folder')
shutil.copytree(source,target,dirs_exist_ok=True)
app=QgsApplication([],False);app.initQgis()
p=QgsProject.instance();assert p.read(str(target/'Sg-Gumut-Desktop.qgz'))
names={}
for layer in p.mapLayers().values():
    assert layer.isValid(),layer.name()
    filename=Path(layer.source().split('|')[0]).name
    short={'elevation-30m.tif':'terrain','hillshade.tif':'hillshade','slope-degrees.tif':'slope','contours.gpkg':'contours'}.get(filename)
    if short:
        layer.setShortName(short);names[short]=layer.id()
        if short=='hillshade': layer.renderer().setOpacity(1)
    if 'Field activities' in layer.name(): p.removeMapLayer(layer.id())
assert all(k in names for k in ['terrain','hillshade','slope'])
p.setFilePathStorage(Qgis.FilePathType.Relative)
p.setFileName(str(target/'published.qgz'))
p.writeEntry('WMSServiceCapabilities','/',True)
p.writeEntry('WMSServiceTitle','/','MapIntel')
p.writeEntry('WMSMaxWidth','/',2048);p.writeEntry('WMSMaxHeight','/',2048)
assert p.write()
print('Published QGIS project:',p.fileName());print('Terrain layers:',names)
# QGIS macOS teardown can crash; files have been flushed by project.write().
os._exit(0)
