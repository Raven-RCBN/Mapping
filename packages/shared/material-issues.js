// No unit conversion is inferred from product labels. A current survey denominator
// is explicitly a comparison basis, not a claim about historical palm population.
export function materialPerPalm(rows,blocks){
 const groups=new Map();
 for(const r of rows){if(!r.approved)continue;const key=JSON.stringify([r.month,r.mapBlockCode,r.productId,r.unit]);if(!groups.has(key))groups.set(key,{id:key,month:r.month,mapBlockCode:r.mapBlockCode,productId:r.productId,productCode:r.productCode,product:r.product,category:r.category,categoryCode:r.categoryCode,unit:r.unit,netQuantity:0,issues:[],lines:0});let g=groups.get(key);g.netQuantity+=r.netQuantity;g.lines++;for(let i of r.issues||[])if(!g.issues.includes(i))g.issues.push(i);}
 return materialSummaryBasis([...groups.values()],blocks);
}
export function materialSummaryBasis(groups,blocks){
 const bm=new Map(blocks.map(b=>[b.blockCode,b]));
 return groups.map(g=>{const b=bm.get(g.mapBlockCode),palms=b?.totalPalms>0?b.totalPalms:null;return {...g,palms,palmCountDate:b?.surveyDate||null,metricSource:b?.metricSource||'PDF',referenceHa:b?.referenceHa??null,palmBasis:b?.palmCountSource||(palms?'PDF survey palm count (dated reference, not historical monthly census)':'Palm count not supplied in PDF'),netPerPalm:palms?g.netQuantity/palms:null};}).sort((a,b)=>b.month.localeCompare(a.month)||a.mapBlockCode.localeCompare(b.mapBlockCode)||a.product.localeCompare(b.product));
}
