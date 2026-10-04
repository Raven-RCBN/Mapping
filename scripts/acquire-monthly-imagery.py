"""Download monthly estate crops from public Sentinel-2 COGs, not whole scenes.

Select among the six least scene-cloudy full-footprint candidates per month,
ranked by estate-local SCL cloud/shadow/snow and invalid coverage. Preserve
actual dates and quality scores. No optical image is used as elevation.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import json, urllib.request, re, time, math, hashlib, shutil
from collections import defaultdict
import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()
import sys
ROOT = Path(sys.argv[1]).resolve()
SOURCE = ROOT / 'source/history'
OUT = ROOT / 'imagery'
WEB = ROOT / 'images'
for d in [SOURCE, OUT, WEB]: d.mkdir(parents=True, exist_ok=True)
cfg = json.loads((ROOT / 'import-config.json').read_text())
EPSG = cfg['epsg']
ll=osr.SpatialReference(); ll.ImportFromEPSG(4326)
utm=osr.SpatialReference(); utm.ImportFromEPSG(EPSG)
for sr in [ll,utm]: sr.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
tx=osr.CoordinateTransformation(ll,utm)
w,s,e,n=cfg['bounds']
points=[tx.TransformPoint(x,y) for x in [w,e] for y in [s,n]]
BOUNDS=[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
CO = ['COMPRESS=DEFLATE','TILED=YES']

def get_range(url, start, end):
    for attempt in range(4):
        try:
            # Unique range query prevents intermediary caches mixing byte ranges.
            req=urllib.request.Request(url+f'?estate-range={start}-{end}', headers={'Range':f'bytes={start}-{end}'})
            with urllib.request.urlopen(req, timeout=35) as r:
                data=r.read(); cr=r.headers.get('Content-Range','')
                m=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',cr)
                if r.status != 206 or not m or int(m[1])!=start or int(m[2])!=end or len(data)!=end-start+1:
                    raise ValueError('Unverified byte range: '+cr)
                return start,data,int(m[3])
        except Exception:
            if attempt==3: raise
            time.sleep(.5*(attempt+1))

def crop_cog(url, path, spacing):
    if path.exists(): return path
    sparse=SOURCE/(path.stem+'-partial-source.tif')
    start,header,total=get_range(url,0,65535)
    with sparse.open('wb') as f: f.truncate(total); f.seek(0); f.write(header)
    ds=gdal.Open(str(sparse)); t=ds.GetGeoTransform()
    sr=osr.SpatialReference(wkt=ds.GetProjection()); assert sr.GetAuthorityCode(None)==str(EPSG)
    xmin=math.floor((BOUNDS[0]-t[0])/t[1]); xmax=math.ceil((BOUNDS[2]-t[0])/t[1])
    ymin=math.floor((BOUNDS[3]-t[3])/t[5]); ymax=math.ceil((BOUNDS[1]-t[3])/t[5])
    assert 0<=xmin<xmax<=ds.RasterXSize and 0<=ymin<ymax<=ds.RasterYSize
    ranges=set()
    for b in range(1,ds.RasterCount+1):
        band=ds.GetRasterBand(b); bw,bh=band.GetBlockSize()
        for y in range(ymin//bh,(ymax-1)//bh+1):
            for x in range(xmin//bw,(xmax-1)//bw+1):
                offset=int(band.GetMetadataItem(f'BLOCK_OFFSET_{x}_{y}','TIFF'))
                count=int(band.GetMetadataItem(f'BLOCK_SIZE_{x}_{y}','TIFF'))
                ranges.add((offset,count))
    ds=None
    jobs=[(pos,min(pos+65535,start+size-1)) for start,size in ranges for pos in range(start,start+size,65536)]
    with ThreadPoolExecutor(max_workers=8) as pool, sparse.open('r+b') as f:
        for offset,data,length in pool.map(lambda p:get_range(url,*p),jobs):
            assert length==total; f.seek(offset); f.write(data)
    gdal.Warp(str(path),str(sparse),dstSRS=f'EPSG:{EPSG}',outputBounds=BOUNDS,
              xRes=spacing,yRes=spacing,resampleAlg='near',dstNodata=0,creationOptions=CO).FlushCache()
    ds=gdal.Open(str(path)); assert ds.ReadAsArray().size>0; ds=None
    # Only the complete estate crop is retained; sparse file is not a full scene.
    sparse.unlink()
    return path

def quality(item):
    path=crop_cog(item['assets']['scl']['href'], SOURCE/(item['id']+'-scl.tif'),20)
    ds=gdal.Open(str(path)); a=ds.ReadAsArray()
    mask=gdal.GetDriverByName('MEM').Create('',ds.RasterXSize,ds.RasterYSize,1,gdal.GDT_Byte)
    mask.SetGeoTransform(ds.GetGeoTransform()); mask.SetProjection(ds.GetProjection())
    gdal.Rasterize(mask,str(ROOT/cfg['boundaryFile']),burnValues=[1])
    vals=a[mask.ReadAsArray()==1]; classes,counts=np.unique(vals,return_counts=True)
    return {'estate_valid_percent':round(float(np.mean(~np.isin(vals,[0,1]))*100),2),
            'estate_cloud_shadow_snow_percent':round(float(np.mean(np.isin(vals,[3,8,9,10,11]))*100),2),
            'estate_scl_counts':dict(zip(map(lambda x:str(int(x)),classes),map(int,counts)))},path

def export(item,q,scl):
    date=item['properties']['datetime'][:10]
    tif=OUT/f'{date}-10m.tif'; png=WEB/f'{date}.png'
    crop_cog(item['assets']['visual']['href'],tif,10)
    ds=gdal.Open(str(tif)); a=ds.ReadAsArray(); assert ds.RasterCount==3 and np.any(a)
    shutil.copy2(scl,OUT/f'{date}-scl-20m.tif')
    merc=gdal.Warp('',str(tif),format='MEM',dstSRS='EPSG:3857',xRes=10,yRes=10,resampleAlg='bilinear',dstAlpha=True)
    gdal.GetDriverByName('PNG').CreateCopy(str(png),merc)
    t=merc.GetGeoTransform(); src=osr.SpatialReference();src.ImportFromEPSG(3857)
    dst=osr.SpatialReference();dst.ImportFromEPSG(4326)
    for sr in [src,dst]:sr.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tx=osr.CoordinateTransformation(src,dst)
    nw=tx.TransformPoint(t[0],t[3]); se=tx.TransformPoint(t[0]+t[1]*merc.RasterXSize,t[3]+t[5]*merc.RasterYSize)
    row={'id':item['id'],'acquired_at':item['properties']['datetime'],'date':date,'month':date[:7],
         'scene_cloud_percent':item['properties'].get('eo:cloud_cover'),**q,'pixel_spacing_m':10,
         'image_url':f'images/{date}.png','geotiff_url':f'imagery/{date}-10m.tif',
         'image_bounds':[[se[1],nw[0]],[nw[1],se[0]]],
         'source_url':item['assets']['visual']['href'],
         'catalog_url':f"https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/{item['id']}",
         'sha256':hashlib.sha256(tif.read_bytes()).hexdigest(),
         'attribution':f'Contains modified Copernicus Sentinel data {date[:4]} · acquired {date}',
         'quality_note':'Automated cloud/shadow estimate; thin cloud and haze can remain. Optical appearance varies with atmosphere and season.'}
    (OUT/f'{date}.json').write_text(json.dumps(row,indent=2))
    return row

def main():
    raw=json.loads((ROOT/'source/sentinel-history-search.json').read_text())['features']
    groups=defaultdict(list)
    for f in {f['id']:f for f in raw}.values():
        b=f['bbox']
        if b[0]<=w and b[1]<=s and b[2]>=e and b[3]>=n:
            groups[f['properties']['datetime'][:7]].append(f)
    records=[]; evaluations=[]; failures=[]
    def process_month(month,items):
        best=None
        for item in sorted(items,key=lambda x:x['properties'].get('eo:cloud_cover',100))[:6]:
            try:
                q,path=quality(item); evaluations.append({'id':item['id'],**q})
                rank=(100-q['estate_valid_percent'],q['estate_cloud_shadow_snow_percent'])
                if best is None or rank<best[0]: best=(rank,item,q,path)
                if rank[0]<=1 and rank[1]<=2: break
            except Exception as e:
                failures.append({'id':item['id'],'stage':'classification','error':str(e)})
                print('SCL failed',item['id'],str(e),flush=True)
        if best is None or best[2]['estate_valid_percent']<99:
            print('No full-coverage selection',month,flush=True);return None
        try:
            row=export(best[1],best[2],best[3])
            print('Downloaded',month,row['date'],'cloud/shadow',row['estate_cloud_shadow_snow_percent'],flush=True)
            return row
        except Exception as e:
            failures.append({'id':best[1]['id'],'stage':'image','error':str(e)});print('Image failed',month,str(e),flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks=[pool.submit(process_month,month,items) for month,items in sorted(groups.items())]
        for future in as_completed(tasks):
            row=future.result()
            if row:records.append(row)
            manifest={'requested_start':'2024-10-05','requested_end':'2026-10-04','downloaded':'2026-10-05',
                      'dataset':'Copernicus Sentinel-2 Collection 1 Level-2A','provider':'ESA / Copernicus via Element 84 Earth Search',
                      'selection':'Monthly selection: evaluate up to six least scene-cloudy full-footprint candidates, stop at <=2% estate cloud/shadow; otherwise keep least obscured evaluated candidate with >=99% valid estate coverage.',
                      'records':sorted(records,key=lambda r:r['acquired_at']),'catalog_months':sorted(groups),'evaluations':evaluations,'failures':failures,
                      'caveat':'Individual optical acquisitions, not monthly composites. Clouds, haze, sun angle and seasonal effects can resemble land-cover change. No ground-height changes are measured.'}
            (ROOT/'history.json').write_text(json.dumps(manifest,indent=2))
            (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print('History complete',len(records),'months; failures',len(failures),flush=True)

if __name__=='__main__':main()
