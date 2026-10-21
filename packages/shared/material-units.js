// User-confirmed policy: every source net quantity is a count of the stated pack.
// A measured-looking legacy UOM never overrides an explicit product pack size.
export const materialUnitPolicy='product-pack-count-source-fallback-v2';
const packPattern=/\b(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(KILOGRAMS?|KGS?|GMS?|GRAMS?|MILLILIT(?:RE|ER)S?|ML|LIT(?:RE|ER)S?|LTRS?|LIT|L|METRIC\s*TONNES?|TONNES?|MT)\b/gi;
export function materialPackSize({product='',unitDescription=''}={}){
 const packs=[];
 for(const [source,text]of [['unit description',unitDescription],['product description',product]])for(const m of String(text).matchAll(packPattern)){
  const count=Number(m[1]||1),size=Number(m[2]),u=m[3].toUpperCase().replace(/\s/g,''),liquid=/^(ML|MILLI|L|LIT|LTR)/.test(u),small=/^(GM|GRAM|ML|MILLI)/.test(u),tonne=/^(MT|METRIC|TONNE)/.test(u);
  const factor=count*size*(small?.001:tonne?1000:1);if(factor>0&&Number.isFinite(factor))packs.push({conversionFactor:factor,normalizedUnit:liquid?'L':'KG',conversionBasis:`${m[0]} in ${source}`});
 }
 const unique=[...new Map(packs.map(p=>[JSON.stringify([p.conversionFactor,p.normalizedUnit]),p])).values()];
 if(unique.length!==1)return {normalizationStatus:unique.length?'conflicting_pack_size':'needs_pack_size',normalizedUnit:null,conversionFactor:null,conversionBasis:unique.length?'Conflicting pack sizes; review required':'No explicit pack size in the product or unit description'};
 return {...unique[0],normalizationStatus:'converted'};
}
export function normalizeMaterialIssue(row,{unitDescription=row.sourceUnitDescription||''}={}){
 let pack=materialPackSize({product:row.product,unitDescription});
 if(pack.normalizationStatus==='needs_pack_size'){
  const key=String(row.unit||'').trim().toUpperCase().replace(/[ .]/g,'');
  const base={KG:[1,'KG'],KGS:[1,'KG'],KILOGRAM:[1,'KG'],GM:[.001,'KG'],GMS:[.001,'KG'],G:[.001,'KG'],GRAM:[.001,'KG'],ML:[.001,'L'],LIT:[1,'L'],L:[1,'L'],LTR:[1,'L'],LITRE:[1,'L'],LITER:[1,'L'],MT:[1000,'KG'],TONNE:[1000,'KG']}[key];
  pack=base?{normalizationStatus:'converted',conversionFactor:base[0],normalizedUnit:base[1],conversionBasis:`No pack size: issued ${row.unit} retained as measured quantity, converted to ${base[1]} ×${base[0]}`}:{normalizationStatus:'source_quantity',conversionFactor:null,normalizedUnit:null,conversionBasis:`No pack size: original ${row.unit||'unspecified unit'} quantity retained as issued`};
 }
 const valid=pack.normalizationStatus==='converted'&&Number.isFinite(row.netQuantity);
 return {...pack,normalizationPolicy:materialUnitPolicy,sourceUnitDescription:unitDescription,normalizedQuantity:valid?Number((row.netQuantity*pack.conversionFactor).toFixed(12)):null,...(!Number.isFinite(row.netQuantity)?{normalizationStatus:'invalid_quantity'}:{})};
}
