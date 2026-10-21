import {Children,isValidElement,useEffect,useId,useRef,useState} from 'react';
import './scroll-select.css';
const optionText=node=>Children.toArray(node).map(x=>isValidElement(x)?optionText(x.props.children):String(x)).join('');
const normalize=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export default function SearchSelect({children,value,defaultValue,disabled,onChange,...props}){
 const root=useRef(null),trigger=useRef(null),input=useRef(null),list=useRef(null),id=useId();
 const [local,setLocal]=useState(defaultValue??''),[query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[limit,setLimit]=useState(100);
 const current=value??local,options=Children.toArray(children).filter(isValidElement).map(o=>({value:String(o.props.value??optionText(o.props.children)),label:optionText(o.props.children),disabled:o.props.disabled}));
 const chosen=options.find(o=>o.value===String(current))||options[0],terms=normalize(query).trim().split(/\s+/).filter(Boolean);
 const matches=options.filter(o=>terms.every(t=>normalize(o.label+' '+o.value).includes(t))),visible=matches.slice(0,limit),name=props['aria-label']||'Selection';
 const close=focus=>{if(root.current)root.current.open=false;setOpen(false);if(focus)trigger.current?.focus();};
 const choose=o=>{if(!o||o.disabled)return;setLocal(o.value);onChange?.({target:{value:o.value},currentTarget:{value:o.value}});close(true);};
 useEffect(()=>{const outside=e=>{if(!root.current?.contains(e.target))close(false)};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[]);
 useEffect(()=>{if(active>=0)list.current?.children[active]?.scrollIntoView({block:'nearest'});},[active]);
 return <details ref={root} className="scroll-select search-select" onToggle={e=>{const opened=e.currentTarget.open;setOpen(opened);if(opened){if(disabled){close(false);return;}setQuery('');setLimit(100);setActive(-1);input.current?.focus();}}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))close(false)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close(true);}}}>
 <summary ref={trigger} aria-label={name} aria-controls={id} aria-expanded={open} aria-disabled={disabled||undefined} tabIndex={disabled?-1:0} onClick={e=>{if(disabled)e.preventDefault()}}><span title={chosen?.label}>{chosen?.label||'Choose an option'}</span><span aria-hidden="true">⌄</span></summary>
 <div className="scroll-select-menu search-select-menu"><input ref={input} type="search" role="combobox" aria-label={'Search '+name.toLowerCase()} aria-controls={id} aria-expanded={open} aria-autocomplete="list" aria-activedescendant={active>=0?`${id}-${active}`:undefined} placeholder="Type a description, code or rate…" autoComplete="off" value={query} onChange={e=>{setQuery(e.target.value);setLimit(100);setActive(-1);if(list.current)list.current.scrollTop=0;}} onKeyDown={e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=e.key==='ArrowDown'?Math.min(active+1,matches.length-1):Math.max(0,active-1);if(next>=limit)setLimit(n=>n+100);setActive(next);}
  if(e.key==='Enter'){e.preventDefault();choose(visible[active<0?0:active]);}
 }}/><div className="search-select-options" id={id} role="listbox" aria-label={name+' choices'} ref={list}>{visible.map((o,i)=><button type="button" role="option" id={`${id}-${i}`} key={o.value} tabIndex={-1} aria-selected={o.value===String(current)} disabled={o.disabled} className={i===active?'search-option-active':''} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(o)}><span>{o.label}</span>{o.value===String(current)&&<span aria-hidden="true">✓</span>}</button>)}</div>
 {!matches.length&&<p className="search-select-count" role="status">No matching options</p>}
 {matches.length>limit?<button className="search-select-more" type="button" onClick={()=>setLimit(n=>n+100)}>Show more · {visible.length} of {matches.length} matches</button>:<span className="search-select-count" role="status">{matches.length} {matches.length===1?'option':'options'}</span>}
 </div></details>;
}
