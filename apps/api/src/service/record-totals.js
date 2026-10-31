export async function refreshTrialReport(models,estateId,year){
 const where={estateId,year,importState:'complete'};
 const [totals]=await models.TrialBalanceSummary.aggregate([{$match:where},{$group:{_id:null,debitMinor:{$sum:'$debitMinor'},creditMinor:{$sum:'$creditMinor'}}}]);
 const debitMinor=totals?.debitMinor||0,creditMinor=totals?.creditMinor||0;
 await models.TrialBalanceSummary.updateMany(where,{$set:{reportIntegrity:{debitMinor,creditMinor,differenceMinor:creditMinor-debitMinor,basis:'Current saved balances'}}});
}
