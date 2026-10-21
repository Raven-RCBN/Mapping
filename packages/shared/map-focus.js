// Geometry-independent WGS84 fit bounds, for temporary points and future polygons.
export function mapFocusBounds(estates,selected,{analysis=false,highlight,selection}={}){
 if(analysis&&highlight?.raster?.bounds){const b=highlight.raster.bounds;if(Array.isArray(b)&&b.flat().length===4&&b.flat().every(Number.isFinite))return[b[0][1],b[0][0],b[1][1],b[1][0]];}
 const allowed=new Set(selected),codes=analysis&&highlight?.blockCodes?.length?new Set(highlight.blockCodes):null;
 let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
 const visit=c=>{if(!Array.isArray(c))return;if(c.length>=2&&Number.isFinite(c[0])&&Number.isFinite(c[1])){west=Math.min(west,c[0]);east=Math.max(east,c[0]);south=Math.min(south,c[1]);north=Math.max(north,c[1]);}else for(const x of c)visit(x)};
 for(const e of estates){if(!allowed.has(e.id))continue;if(analysis&&highlight?.estateId&&e.id!==highlight.estateId)continue;for(const f of e.boundary?.features||[]){const code=f.properties?.blockName||f.properties?.Block_No;if(!analysis&&selection&&`${e.id}::${code}`!==selection)continue;if(codes&&!codes.has(code))continue;visit(f.geometry?.coordinates);}}
 return Number.isFinite(west)?[west,south,east,north]:null;
}
