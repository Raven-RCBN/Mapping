import ScrollSelect from './ScrollSelect';
import {useEstateCurrency} from '../useEstateCurrency';
import {useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../api';
import {money} from './WagesTables';
import {displayNumber} from './ProductionTables';
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export default function ActivityTimeline({estateId,boundary,enabled,offline,selection,onBlockChange}) {
  const [year,setYear]=useState('2025'),[years,setYears]=useState([]),[task,setTask]=useState(''),[rows,setRows]=useState([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[metaError,setMetaError]=useState(''),[selected,setSelected]=useState(null),[refresh,setRefresh]=useState(0);
  const {label:currency}=useEstateCurrency(estateId);
  const detail=useRef(null),lastBubble=useRef(null);
  const block=selection?.startsWith(estateId+'::')?selection.slice(estateId.length+2):'';
  const blocks=useMemo(()=>[...new Set((boundary?.features||[]).map(f=>f.properties?.blockName||f.properties?.Block_No).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[boundary]);
  useEffect(()=>{
    if(!enabled||offline)return;const c=new AbortController();setMetaError('');
    api.get('/wages/meta',{params:{estateId},signal:c.signal}).then(({data})=>{setYears(data.years);if(data.years.length&&!data.years.includes(year))setYear(data.years[0]);}).catch(e=>{if(e.code!=='ERR_CANCELED')setMetaError(e.response?.data?.error||e.message);});
    return()=>c.abort();
  },[estateId,enabled,offline,refresh]);
  useEffect(()=>{
    setRows([]);setSelected(null);setTask('');setError('');setBusy(false);
    if(!enabled||offline||!block)return;const c=new AbortController();setBusy(true);
    api.get('/wages/timeline',{params:{estateId,year,mapBlockCode:block},signal:c.signal}).then(({data})=>{setRows(data.items);setBusy(false);}).catch(e=>{if(e.code!=='ERR_CANCELED'){setError(e.response?.data?.error||e.message);setBusy(false);}});
    return()=>c.abort();
  },[estateId,year,block,enabled,offline,refresh]);
  useEffect(()=>{if(selected){detail.current?.focus({preventScroll:true});detail.current?.scrollIntoView({block:'nearest'});}},[selected]);
  const tasks=[...new Set(rows.map(r=>r.task))],visible=rows.filter(r=>!task||r.task===task);
  const close=()=>{setSelected(null);lastBubble.current?.focus();};
  return <section className="production-dashboard activity-timeline" aria-label="Activity timeline">
    <div className="production-heading"><h2>Activity timeline{block?` · ${block}`:''}</h2><button className="button" disabled={offline||busy} onClick={()=>setRefresh(v=>v+1)}>Refresh data</button></div>
    <div className="production-controls">
      <label>Timeline year<select value={year} onChange={e=>setYear(e.target.value)}>{!years.includes(year)&&<option>{year}</option>}{years.map(y=><option key={y}>{y}</option>)}</select></label>
      <label>Timeline block<ScrollSelect value={block} onChange={e=>onBlockChange(e.target.value)}><option value="">Select a block</option>{blocks.map(b=><option key={b}>{b}</option>)}</ScrollSelect></label>
      <label>Timeline task<select value={task} onChange={e=>{setTask(e.target.value);setSelected(null);}}><option value="">All tasks</option>{tasks.map(t=><option key={t}>{t}</option>)}</select></label>
    </div>
    {offline?<p>Connect to load the activity timeline.</p>:error||metaError?<p role="alert">{error||metaError}</p>:busy?<p role="status">Loading activity timeline…</p>:!block?<p>Select a block on the map or above.</p>:<>
      {selected&&<div className="activity-timeline-detail" ref={detail} tabIndex={-1} role="region" aria-label="Activity details" onKeyDown={e=>{if(e.key==='Escape')close();}}>
        <div className="production-heading"><div><h3>{selected.row.activity}</h3><p>{selected.row.task} · {months[Number(selected.month.period.slice(5))-1]} {year} · {block}</p></div><button className="button" onClick={close}>Close details</button></div>
        <dl className="activity-timeline-metrics">
          <div><dt>Allocated cost · {selected.month.period}</dt><dd>{currency} {money(selected.month.amountMinor)}</dd></div>
          <div><dt>Allocated cost · {year}</dt><dd>{currency} {money(selected.row.amountMinor)}</dd></div>
          <div><dt>Allocated mandays · {year}</dt><dd>{displayNumber(selected.row.mandays)}</dd></div>
          <div><dt>Cost / manday · {year}</dt><dd>{selected.row.costPerMandayMinor==null?'—':`${currency} ${money(selected.row.costPerMandayMinor)}`}</dd></div>
          <div><dt>Map hectares</dt><dd>{displayNumber(selected.row.mapHa)}</dd></div>
          <div><dt>Cost / ha · {selected.month.period}</dt><dd>{selected.row.mapHa>0?`${currency} ${money(selected.month.amountMinor/selected.row.mapHa)}`:'—'}</dd></div>
          <div><dt>Task no.</dt><dd>{selected.month.taskNumbers.join(', ')||'—'}</dd></div>
          <div><dt>Division</dt><dd>{selected.row.division}</dd></div>
        </dl>
      </div>}
      {visible.length?<div className="activity-timeline-scroll" tabIndex={0} role="region" aria-label="Monthly activity bubbles">
        <table className="activity-timeline-grid"><caption>{block} · {year} · {visible.length} activities</caption>
          <thead><tr><th scope="col">Task / activity</th>{months.map(m=><th scope="col" key={m}>{m}</th>)}</tr></thead>
          <tbody>{visible.map(row=><tr key={row.id}><th scope="row"><span>{row.task}</span>{row.activity}</th>{months.map((m,i)=>{
            const month=row.months.find(r=>r.period===`${year}-${String(i+1).padStart(2,'0')}`);
            return <td key={m}>{month?<button className="activity-timeline-bubble" aria-pressed={selected?.row.id===row.id&&selected?.month.period===month.period} aria-label={`${row.task}, ${row.activity}, ${m} ${year}, allocated cost ${currency} ${money(month.amountMinor)}`} title={`${m}: ${currency} ${money(month.amountMinor)}`} onClick={e=>{lastBubble.current=e.currentTarget;setSelected({row,month});}}><span aria-hidden="true">●</span></button>:<span aria-label="No cost record">—</span>}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>:<p>No activity costs available for this block and year.</p>}
    </>}
  </section>;
}
