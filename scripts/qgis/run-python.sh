#!/bin/zsh
set -eu
export QT_QPA_PLATFORM=offscreen
export PROJ_DATA=/Applications/QGIS.app/Contents/Resources/qgis/proj
export GDAL_DATA=/Applications/QGIS.app/Contents/Resources/qgis/gdal
export QGIS_PREFIX_PATH=/Applications/QGIS.app/Contents/MacOS
export QT_PLUGIN_PATH=/Applications/QGIS.app/Contents/PlugIns
exec /Applications/QGIS.app/Contents/MacOS/python "$@"
