import {useSelector} from 'react-redux';
import {currencyLabel} from '../../../packages/shared/currency.js';
export function useEstateCurrency(estateId,sourceCurrency){
 const configured=useSelector(s=>s.data?.estates?.find(e=>e.id===estateId)?.currency);
 const code=configured||sourceCurrency||null;
 return {code,label:currencyLabel(code)};
}
