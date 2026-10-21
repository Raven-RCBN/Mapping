"""Prepare a zoomable EPSG:4326 tile pack for Mapping's existing private mosaic API.

Tiles and index rows are stored bottom-up to match readMosaicTile. Original TIFF
is retained. Never infer capture date from file metadata or upload time.
"""
import sys,json,math,hashlib,struct,os
from pathlib import Path
import numpy as np
from osgeo import gdal,osr
gdal.UseExceptions();gdal.SetCacheMax(256*1024*1024);gdal.SetConfigOption('GDAL_NUM_THREADS','2')
root=Path(sys.argv[1]).resolve();source=root/'source.tif';expected=sys.argv[2];eid=sys.argv[3]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 return h.hexdigest()
assert sha(source)==expected,'Transferred TIFF checksum mismatch'
ds=gdal.Open(str(source));assert ds.RasterCount>=3 and ds.GetSpatialRef().GetAuthorityCode(None)=='32649'
t=ds.GetGeoTransform();native=[abs(t[1]),abs(t[5])];assert all(.5<x<.6 for x in native)
sample=ds.ReadAsArray(buf_xsize=1024,buf_ysize=round(ds.RasterYSize*1024/ds.RasterXSize))[:3];assert sample.max()<=255,'Unexpected source RGB range; review scaling before use'
print(json.dumps({'stage':'source-verified','dimensions':[ds.RasterXSize,ds.RasterYSize],'nativePixelMetres':native,'sampleRange':[int(sample.min()),int(sample.max())]}),flush=True)
rgb=gdal.Translate(str(root/'rgb.vrt'),ds,format='VRT',bandList=[1,2,3],outputType=gdal.GDT_Byte)
for i,c in enumerate([gdal.GCI_RedBand,gdal.GCI_GreenBand,gdal.GCI_BlueBand],1):rgb.GetRasterBand(i).SetColorInterpretation(c)
rgb.FlushCache();rgb=None
vrt=gdal.AutoCreateWarpedVRT(ds,None,'EPSG:4326',gdal.GRA_Bilinear);gt=vrt.GetGeoTransform();west,north=gt[0],gt[3];east=west+gt[1]*vrt.RasterXSize;south=north+gt[5]*vrt.RasterYSize;resolution=min(abs(gt[1]),abs(gt[5]));vrt=None;ds=None
cols=math.ceil((east-west)/resolution/256);rows=math.ceil((north-south)/resolution/256)
east=west+cols*256*resolution;south=north-rows*256*resolution
warp=root/'display-rgba.tif'
if not warp.exists():
 tempWarp=root/'display-rgba.partial.tif'
 gdal.Warp(str(tempWarp),str(root/'rgb.vrt'),dstSRS='EPSG:4326',outputBounds=[west,south,east,north],width=cols*256,height=rows*256,resampleAlg='bilinear',srcNodata="1 1 1",dstNodata=0,dstAlpha=True,warpOptions=['UNIFIED_SRC_NODATA=YES','NUM_THREADS=2'],creationOptions=['TILED=YES','COMPRESS=DEFLATE','PREDICTOR=2','BIGTIFF=IF_SAFER']).FlushCache()
 os.replace(tempWarp,warp)
ds=gdal.Open(str(warp),gdal.GA_Update);ds.BuildOverviews('AVERAGE',[2,4,8,16,32,64,128]);ds=None
ds=gdal.Open(str(warp));assert ds.RasterCount==4 and np.any(ds.GetRasterBand(4).ReadAsArray(buf_xsize=128,buf_ysize=128)), 'Empty warped mosaic'
maxLevel=math.ceil(math.log2(max(cols,rows)));levels=[]
for z in range(maxLevel+1):
 factor=2**(maxLevel-z);c=math.ceil(cols/factor);r=math.ceil(rows/factor);levels.append({'cols':c,'rows':r,'factor':factor,'xmin':west,'ymin':north-r*256*resolution*factor,'xmax':west+c*256*resolution*factor,'ymax':north})
pack=root/'tiles.mosaic';indexEnd=32
for l in levels:l['indexOffset']=indexEnd;indexEnd+=l['cols']*l['rows']*8
indexes=[bytearray(l['cols']*l['rows']*8)for l in levels]
memDriver=gdal.GetDriverByName('MEM');webpDriver=gdal.GetDriverByName('WEBP');count=0;nonempty=0
with pack.open('wb') as f:
 f.write(b'MAPPING-MOSAIC-V1\0'.ljust(32,b'\0'));f.write(bytes(indexEnd-32))
 for z,l in enumerate(levels):
  factor=l['factor']
  for y in range(l['rows']):
   for x in range(l['cols']):
    sx=x*256*factor;sy=y*256*factor;sw=min(256*factor,ds.RasterXSize-sx);sh=min(256*factor,ds.RasterYSize-sy);bw=math.ceil(sw/factor);bh=math.ceil(sh/factor)
    a=np.zeros((4,256,256),dtype=np.uint8);a[:,:bh,:bw]=ds.ReadAsArray(sx,sy,sw,sh,buf_xsize=bw,buf_ysize=bh,resample_alg=gdal.GRIORA_Average)
    nonempty+=bool(np.any(a[3]));tile=memDriver.Create('',256,256,4,gdal.GDT_Byte)
    for b in range(4):tile.GetRasterBand(b+1).WriteArray(a[b,::-1,:])
    for i,c in enumerate([gdal.GCI_RedBand,gdal.GCI_GreenBand,gdal.GCI_BlueBand,gdal.GCI_AlphaBand],1):tile.GetRasterBand(i).SetColorInterpretation(c)
    temp='/vsimem/mapping-tile.webp';out=webpDriver.CreateCopy(temp,tile,options=['QUALITY=90']);out=None;raw=bytes(gdal.VSIGetMemFileBuffer_unsafe(temp));gdal.Unlink(temp);tile=None
    assert raw[:4]==b'RIFF' and raw[8:12]==b'WEBP' and 12<len(raw)<1048576
    idx=((l['rows']-1-y)*l['cols']+x)*8;offset=f.tell();indexes[z][idx:idx+6]=offset.to_bytes(6,'little');indexes[z][idx+7]=3
    n=len(raw);prefix=bytearray([3])
    while True:
     prefix.append((n&127)|(128 if n>127 else 0));n>>=7
     if not n:break
    f.write(prefix);f.write(raw);count+=1
  print(json.dumps({'stage':'tiles','level':z,'cols':l['cols'],'rows':l['rows'],'tilesDone':count}),flush=True)
 for l,index in zip(levels,indexes):f.seek(l['indexOffset']);f.write(index)
assert nonempty>0,'Tile pack contains no visible pixels'
# Browser overview is Web Mercator; zoom tiles retain their declared geographic grid.
overview=gdal.Warp('',ds,format='MEM',dstSRS='EPSG:3857',width=2048,resampleAlg='average',dstAlpha=True)
assert overview.RasterCount==4
out=webpDriver.CreateCopy(str(root/'overview.webp'),overview,options=['QUALITY=85']);out=None
og=overview.GetGeoTransform();ll=osr.SpatialReference();ll.ImportFromEPSG(4326);merc=osr.SpatialReference();merc.ImportFromEPSG(3857)
for sr in [ll,merc]:sr.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
tx=osr.CoordinateTransformation(merc,ll);nw=tx.TransformPoint(og[0],og[3]);se=tx.TransformPoint(og[0]+og[1]*overview.RasterXSize,og[3]+og[5]*overview.RasterYSize)
rel=f'estates/{eid}/reference/tiff-20261021/'
meta={'sourceSha256':expected,'sourceBytes':source.stat().st_size,'sourceCrs':'EPSG:32649','nativePixelMetres':native,'bounds':[[se[1],nw[0]],[nw[1],se[0]]],'file':{'path':rel+'overview.webp','mime':'image/webp','bytes':(root/'overview.webp').stat().st_size,'sha256':sha(root/'overview.webp')},'mosaic':{'path':rel+'tiles.mosaic','bytes':pack.stat().st_size,'sha256':sha(pack),'dataOffset':0,'levels':[{k:v for k,v in l.items() if k!='factor'}for l in levels]},'tileCount':count,'nonemptyTiles':nonempty,'gridCrs':'EPSG:4326','tileQuality':90,'overviewQuality':85,'captureDate':None,'displayBasis':'RGB bands 1–3 without stretch; source RGB values 0–255 in UInt16 storage. Common background RGB=1 treated as transparent. Fourth undefined band retained only in source.'}
(root/'mosaic.json').write_text(json.dumps(meta,indent=2));print(json.dumps({'stage':'complete','levels':len(levels),'tiles':count,'tileBytes':pack.stat().st_size,'overviewBytes':meta['file']['bytes'],'bounds':meta['bounds']}),flush=True)
