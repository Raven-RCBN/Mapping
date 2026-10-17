// Imported snapshot fields remain available verbatim through lean reads and full estate archives.
export function createTrialBalanceModels(model,Schema,ensureIndex){
 const common={_id:String,estateId:{type:String,required:true},year:{type:Number,required:true},accountKey:String,accountCode:{type:String,default:null},accountName:String,sourceSequence:Number,importState:String,datasetHash:String,contentHash:String};
 const summaryShape={...common};
 for(const name of ['estateName','currency','sourceSystem','reportId','schemaVersion','level1','level2','level3','level4','hierarchyPath','hierarchy','hierarchyDepth','parentNodeId','debitMinor','creditMinor','netMinor','detailsStatus','detailRowCount','transactionCount','detailNetMinor','reconciliationDifferenceMinor','beigeDetailCount','blockReviewDetailCount','beigeFlag','highlightColor','reportIntegrity','sourceFile','sourceHash','completedAt'])summaryShape[name]=Schema.Types.Mixed;
 const detailShape={...common};
 for(const name of ['estateName','currency','sourceSystem','reportId','schemaVersion','summaryId','rowKind','date','month','reference','entity','description','debitMinor','creditMinor','netMinor','runningBalanceMinor','item','quantity','unit','purpose','activity','beneficiary','employeeId','bank','documentReference','periodText','workStart','workEnd','rateMinor','rateBasis','days','mandays','location','blockReference','blockMapping','mappedBlockIds','blockReviewRequired','vehicleIdentifier','mappedVehicleId','equipment','paymentStage','category','asset','specification','otherAmountMinor','otherDescription','componentTotalMinor','componentVarianceMinor','rateVarianceMinor','note','components','sourceExtraction','reviewIssues','beigeFlag','highlightColor','highlightName','reviewStatus','allocationStatus','sourceFile','sourceHash','completedAt'])detailShape[name]=Schema.Types.Mixed;
 const TrialBalanceSummary=model('MappingTrialBalanceSummary',summaryShape),TrialBalanceDetail=model('MappingTrialBalanceDetail',detailShape);
 ensureIndex(TrialBalanceSummary,{estateId:1,year:1,accountKey:1},{unique:true});
 ensureIndex(TrialBalanceSummary,{estateId:1,year:1,importState:1,sourceSequence:1});
 ensureIndex(TrialBalanceDetail,{estateId:1,year:1,accountKey:1,sourceSequence:1},{unique:true});
 for(const flag of [null,'beigeFlag','blockReviewRequired'])for(const account of [false,true])ensureIndex(TrialBalanceDetail,{estateId:1,year:1,importState:1,rowKind:1,...(flag?{[flag]:1}:{}),...(account?{accountCode:1}:{}),date:1,accountCode:1,sourceSequence:1,_id:1});
 return {TrialBalanceSummary,TrialBalanceDetail};
}
