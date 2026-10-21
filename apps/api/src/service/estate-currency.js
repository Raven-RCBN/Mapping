import {resolveCurrency} from '../../../../packages/shared/currency.js';
import {QueryError} from './performance.js';
export async function estateCurrency(Estate,estateId,sources=[]){
 const estate=await Estate.findById(estateId).select('currency').lean();
 if(!estate)throw new QueryError('Estate not found',404);
 const values=(await Promise.all(sources.filter(Boolean).map(m=>m.distinct('currency',{estateId})))).flat();
 try{return resolveCurrency(estate.currency,values);}catch(e){throw new QueryError(e.message,409);}
}
