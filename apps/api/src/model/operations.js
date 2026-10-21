// Source detail retained separately from derived production/cost summaries.
export function createOperationModels(model,Schema,index){
 const common={_id:String,estateId:{type:String,required:true},mapBlockCode:String,sourceBlockCode:String,sourceBlockId:String,date:String,month:String,sourceSystem:String,sourceKey:String,sourceHash:String,importId:String,raw:Schema.Types.Mixed,issues:[String]};
 const StockIssue=model('MappingStockIssue',{...common,productId:String,productCode:String,product:String,category:String,categoryCode:String,unit:String,netQuantity:Number,netValueMinor:Number,currency:String,documentNo:String,approved:Boolean});
 const LedgerEntry=model('MappingLedgerEntry',{...common,module:String,accountCode:String,account:String,description:String,debitMinor:Number,creditMinor:Number,currency:String,documentNo:String,vehicleId:String});
 const CropReceipt=model('MappingCropReceipt',{...common,product:String,ownership:String,tonnes:Number,bunches:Number,documentNo:String});
 for(const m of [StockIssue,LedgerEntry,CropReceipt]){index(m,{estateId:1,sourceSystem:1,sourceKey:1},{unique:true});index(m,{estateId:1,month:1,mapBlockCode:1,_id:1});}
 for(const m of [LedgerEntry,CropReceipt])index(m,{estateId:1,month:-1,date:-1,_id:1});
 index(StockIssue,{estateId:1,approved:1,month:1,productId:1,mapBlockCode:1});
 return {StockIssue,LedgerEntry,CropReceipt};
}
