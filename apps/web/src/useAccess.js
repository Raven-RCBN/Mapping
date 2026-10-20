import {useSelector} from 'react-redux';
import {permitted,isSuperuser} from '../../../packages/shared/access.js';
export function useAccess(estateId) {
  const access=useSelector(s=>s.data?.access), selected=useSelector(s=>s.selected?.[0]);
  return {superuser:isSuperuser(access),can:(menu,action='view')=>permitted(access,estateId||selected,menu,action)};
}
