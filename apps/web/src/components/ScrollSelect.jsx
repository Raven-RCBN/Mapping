import SearchSelect from './SearchSelect';
import {Children,isValidElement,useEffect,useId,useRef,useState} from 'react';
import './scroll-select.css';
const text=node=>Children.toArray(node).map(x=>isValidElement(x)?text(x.props.children):String(x)).join('');
function NativeScrollSelect({children,value,defaultValue,disabled,onChange,...props}){
 const root=useRef(null),trigger=useRef(null),list=useRef(null),id=useId(),[local,setLocal]=useState(defaultValue??'');
 const current=value??local,options=Children.toArray(children).filter(isValidElement),chosen=options.find(o=>String(o.props.value??text(o.props.children))===String(current))||options[0];
 const close=focus=>{if(root.current)root.current.open=false;if(focus)trigger.current?.focus();};
 useEffect(()=>{const outside=e=>{if(!root.current?.contains(e.target))close(false)};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[]);
 return <details className="scroll-select" ref={root} onToggle={e=>{if(e.currentTarget.open){if(disabled){close(false);return;}list.current?.focus();list.current?.selectedOptions[0]?.scrollIntoView({block:'nearest'});}}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))close(false)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close(true);}}}>
 <summary ref={trigger} tabIndex={disabled?-1:0} aria-disabled={disabled||undefined} aria-label={props['aria-label']||'Choose block'} aria-controls={id} onClick={e=>{if(disabled)e.preventDefault()}}><span>{chosen?text(chosen.props.children):'Choose block'}</span><span aria-hidden="true">⌄</span></summary>
 <div className="scroll-select-menu"><select {...props} ref={list} id={id} className="scroll-select-list" size={8} value={value===undefined?undefined:value} defaultValue={value===undefined?defaultValue:undefined} disabled={disabled} aria-label={props['aria-label']||'Choose block'} onInvalid={()=>{root.current.open=true;list.current?.focus()}} onChange={e=>{setLocal(e.target.value);onChange?.(e)}} onClick={e=>{if(e.target.tagName==='OPTION')close(true)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();close(true)}}}>{children}</select></div>
 </details>;
}

export default function ScrollSelect({searchable=false,...props}){return searchable?<SearchSelect {...props}/>:<NativeScrollSelect {...props}/>;}
