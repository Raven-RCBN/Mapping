import {useMemo} from 'react';
import ScrollSelect from './ScrollSelect';
const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
export default function BlockScopeSelect({blocks,value,onChange}){
 const options=useMemo(()=>[...new Set([...blocks,value].filter(Boolean))].sort(collator.compare),[blocks,value]);
 return <div className="ds-block-scope"><span>Block scope</span><ScrollSelect aria-label="Block scope" value={value} onChange={e=>onChange(e.target.value)}><option value="">All blocks</option>{options.map(code=><option key={code} value={code}>{code}</option>)}</ScrollSelect></div>;
}
