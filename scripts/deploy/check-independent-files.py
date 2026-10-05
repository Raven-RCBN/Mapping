"""Verify copied assets and render every QGIS project from Mapping-owned files."""
import hashlib, json, pathlib, subprocess, urllib.parse
from qgis.core import QgsApplication, QgsProject, QgsCoordinateReferenceSystem, QgsCoordinateTransform
root = pathlib.Path('/home/deploy_mapping/app')
data = root / 'data'
archive = pathlib.Path('/home/deploy_mapping/backups/metadata-20261006')
assets = json.loads((archive / 'estateatlasassets.json').read_text())
checked = 0
for asset in assets:
    if asset.get('storageState') == 'purged':
        continue
    relative = pathlib.Path(asset['file']['path'])
    if relative.is_absolute() or '..' in relative.parts:
        raise RuntimeError('Unsafe asset path')
    file = data / relative
    if file.is_symlink() or not file.is_file():
        raise RuntimeError('Missing/unsafe asset: ' + str(relative))
    if hashlib.sha256(file.read_bytes()).hexdigest() != asset['file']['sha256']:
        raise RuntimeError('Asset checksum mismatch: ' + str(relative))
    checked += 1
app = QgsApplication([], False)
app.initQgis()
reports = []
for file in sorted(data.glob('estates/*/qgis/published.qgz')):
    project = QgsProject()
    assert project.read(str(file)), str(file)
    layers = list(project.mapLayers().values())
    assert layers and all(layer.isValid() for layer in layers), str(file)
    assert all('/opt/digitalpalm/agrinexus' not in layer.source() for layer in layers)
    terrain = next(layer for layer in layers if layer.shortName() == 'terrain')
    extent = QgsCoordinateTransform(terrain.crs(), QgsCoordinateReferenceSystem('EPSG:3857'), project).transformBoundingBox(terrain.extent())
    query = urllib.parse.urlencode({'MAP': str(file), 'LAYERS': 'terrain', 'WIDTH': 256, 'HEIGHT': 256, 'BBOX': ','.join(map(str, [extent.xMinimum(), extent.yMinimum(), extent.xMaximum(), extent.yMaximum()]))})
    output = subprocess.check_output([str(root / 'tools/render-qgis')], env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'QUERY_STRING': query}, timeout=30)
    assert b'\r\n\r\n\x89PNG' in output, str(file)
    reports.append({'estate': file.parents[1].name, 'layers': len(layers), 'renderBytes': len(output)})
    project.clear()
print(json.dumps({'verifiedAssets': checked, 'qgisProjects': reports}))
app.exitQgis()
