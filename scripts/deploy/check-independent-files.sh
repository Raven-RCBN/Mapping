#!/bin/sh
set -eu
prefix=/home/deploy_mapping/app/tools/qgis
export PYTHONPATH="$prefix/share/qgis/python:$prefix/share/qgis/python/plugins"
export QGIS_PREFIX_PATH="$prefix"
export QT_PLUGIN_PATH="$prefix/plugins"
export QT_QPA_PLATFORM=offscreen
export PROJ_DATA="$prefix/share/proj"
export GDAL_DATA="$prefix/share/gdal"
export QGIS_CUSTOM_CONFIG_PATH=/home/deploy_mapping/app/data/.qgis-runtime
exec "$prefix/bin/python" /home/deploy_mapping/app/current/scripts/deploy/check-independent-files.py
