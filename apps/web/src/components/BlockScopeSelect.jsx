import {useId,useMemo,useRef} from 'react';
const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
export default function BlockScopeSelect({blocks,value,onChange}){
 const id=useId(),root=useRef(null),trigger=useRef(null);
 const options=useMemo(()=>[...new Set([...blocks,value].filter(Boolean))].sort(collator.compare),[blocks,value]);
 const close=()=>{root.current.open=false;trigger.current.focus();};
 return <div className="ds-block-scope"><span id={id}>Block scope</span><details ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false;}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close();}}}>
  <summary ref={trigger} aria-labelledby={id}>{value||'All blocks'}</summary>
  <div className="ds-block-menu"><select size={8} aria-label="Choose block" value={value} onChange={e=>onChange(e.target.value)} onClick={e=>{if(e.target.tagName==='OPTION')close();}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();close();}}}>
   <option value="">All blocks</option>{options.map(code=><option key={code} value={code}>{code}</option>)}
  </select></div>
 </details></div>;
}
