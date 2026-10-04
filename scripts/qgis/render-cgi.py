#!/usr/bin/env python3
"""Render a server-selected estate project with QGIS, without a public GIS port."""
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs
from qgis.core import (
    QgsApplication, QgsProject, QgsMapSettings, QgsRectangle,
    QgsCoordinateReferenceSystem, QgsMapRendererParallelJob,
)
from qgis.PyQt.QtCore import QSize, QByteArray, QBuffer, QIODevice
from qgis.PyQt.QtGui import QColor

params = {k: v[0] for k, v in parse_qs(os.environ['QUERY_STRING']).items()}
root = Path(os.environ['ESTATE_ATLAS_DATA']).resolve() / 'estates'
project_file = Path(params['MAP']).resolve()
if root not in project_file.parents or project_file.name != 'published.qgz':
    raise ValueError('Project outside estate storage')
layer_name = params['LAYERS']
if layer_name not in ('terrain', 'hillshade', 'slope'):
    raise ValueError('Invalid layer')
width, height = int(params['WIDTH']), int(params['HEIGHT'])
if not (1 <= width <= 2048 and 1 <= height <= 2048):
    raise ValueError('Invalid dimensions')
app = QgsApplication([], False)
app.initQgis()
project = QgsProject.instance()
if not project.read(str(project_file)):
    raise ValueError('Project unavailable')
layers = [layer for layer in project.mapLayers().values() if layer.shortName() == layer_name]
if not layers or any(not layer.isValid() for layer in layers):
    raise ValueError('Project layer unavailable')
settings = QgsMapSettings()
settings.setLayers(layers)
settings.setTransformContext(project.transformContext())
settings.setDestinationCrs(QgsCoordinateReferenceSystem('EPSG:3857'))
settings.setExtent(QgsRectangle(*map(float, params['BBOX'].split(','))))
settings.setOutputSize(QSize(width, height))
settings.setBackgroundColor(QColor(0, 0, 0, 0))
job = QgsMapRendererParallelJob(settings)
job.start()
job.waitForFinished()
if job.errors():
    raise ValueError('QGIS rendering failed')
output = QByteArray()
buffer = QBuffer(output)
buffer.open(QIODevice.WriteOnly)
if not job.renderedImage().save(buffer, 'PNG'):
    raise ValueError('PNG encoding failed')
sys.stdout.buffer.write(b'Content-Type: image/png\r\n\r\n' + bytes(output))
sys.stdout.buffer.flush()
project.clear()
app.exitQgis()
