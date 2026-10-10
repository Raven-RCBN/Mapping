"""Inspect the supplied Oban CMF2 raster pyramid; emit private, reviewed metadata.

This reader supports this unencrypted CMF2 variant only. It fails closed on
unknown headers and verifies every tile index and WebP signature. It does not
modify the source or infer an acquisition date from the filename.
Usage: python prepare-carrymap-mosaic.py INPUT.cmf2 OUTPUT.json STORAGE_PATH
"""
import hashlib,json,mmap,struct,sys
from pathlib import Path


def decompress(src):
    out=bytearray();i=0
    while i<len(src):
        t=src[i];i+=1;n=t>>4
        if n==15:
            while True:
                b=src[i];i+=1;n+=b
                if b<255:break
        out.extend(src[i:i+n]);i+=n
        if i==len(src):break
        offset=int.from_bytes(src[i:i+2],'little');i+=2;n=(t&15)+4
        if t&15==15:
            while True:
                b=src[i];i+=1;n+=b
                if b<255:break
        if not 0<offset<=len(out) or len(out)+n>100000:raise ValueError('Unsupported header')
        for _ in range(n):out.append(out[-offset])
    return out


def inspect(source, storage_path):
    with open(source,'rb') as f:
        m=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ)
        def vint(pos):
            value=0
            for shift in range(0,35,7):
                b=m[pos];pos+=1;value|=(b&127)<<shift
                if b<128:return value,pos
            raise ValueError('Invalid integer')
        assert m[:4]==b'CMF2' and m[20:24]==bytes([5,0,2,21]),'Unsupported CMF2 variant'
        data_offset=struct.unpack_from('<Q',m,27)[0]
        assert data_offset==15656,'Unsupported CMF2 layout'
        levels=[];pos=40;count=0
        for k in range(9):
            length,p=vint(pos);expected,p=vint(p);d=decompress(m[p:p+length]);pos=p+length+6
            assert len(d)==expected==1088 and f'_level{k}'.encode() in d
            assert b'Oban_Merge_ecw_v4' in d and b'+proj=longlat +datum=WGS84' in d
            integer=lambda code:struct.unpack_from('<I',d,d.index(struct.pack('<I',code))+6)[0]
            offset_pos=d.index(struct.pack('<I',173))+6
            level=dict(cols=integer(167),rows=integer(168),indexOffset=data_offset+int.from_bytes(d[offset_pos:offset_pos+7],'little'))
            level.update({key:struct.unpack_from('<d',d,d.index(key.encode())+5)[0] for key in ['xmin','ymin','xmax','ymax']})
            assert 1<=level['cols']<=500 and 1<=level['rows']<=500
            for index in range(level['cols']*level['rows']):
                start=level['indexOffset']+index*8;entry=m[start:start+8]
                assert len(entry)==8 and entry[6:]==b'\0\x03'
                offset=data_offset+int.from_bytes(entry[:7],'little')
                assert m[offset]==3
                size,p=vint(offset+1)
                assert 12<=size<=1048576 and p+size<=len(m)
                assert m[p:p+4]==b'RIFF' and m[p+8:p+12]==b'WEBP'
                assert struct.unpack_from('<I',m,p+4)[0]+8==size
                count+=1
            levels.append(level)
        result=dict(path=storage_path,bytes=len(m),sha256=hashlib.sha256(m).hexdigest(),dataOffset=data_offset,levels=list(reversed(levels)))
        m.close()
        return result,count


if __name__=='__main__':
    source,output,storage_path=sys.argv[1:]
    result,count=inspect(source,storage_path)
    Path(output).write_text(json.dumps(result,indent=2))
    print(json.dumps(dict(verifiedTiles=count,levels=len(result['levels']),sha256=result['sha256'])))
