// mt remains the recorded FFB quantity for compatibility and average bunch weight.
// Only loose fruit explicitly attributed to this record/block is added to yield.
export function productionTonnes(row){
 const ffbMt=Number.isFinite(row.mt)?row.mt:Number.isFinite(row.ffbMt)?row.ffbMt:null;
 const looseFruitMt=Number.isFinite(row.looseFruitMt)?row.looseFruitMt:null;
 return {ffbMt,looseFruitMt,totalCropMt:ffbMt===null?null:ffbMt+(looseFruitMt??0)};
}
export function productionYield(row,ha=row.effectiveHa){
 const {totalCropMt}=productionTonnes(row);
 return row.receiptStatus==='received'&&Number.isFinite(ha)&&ha>0&&totalCropMt!==null?totalCropMt/ha:null;
}
// A historical FFB-only forecast cannot supply an unobserved loose-fruit estimate.
export function forecastYield(tonnes,ha,basis){
 return basis==='ffb_plus_loose_fruit'&&Number.isFinite(tonnes)&&Number.isFinite(ha)&&ha>0?tonnes/ha:null;
}
