import RecordActions from './RecordActions';
import {useEstateCurrency} from '../useEstateCurrency';
import {Fragment,useEffect,useState} from 'react';
import {api} from '../api';
import {usePagedTable} from '../usePagedTable';
import './trial-balance.css';
const money=n=>n==null?'—':(n/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const filters=[['all','All transactions'],['highlight','Highlight'],['block_mismatch','Block mismatches']];
const errorText=e=>e.response?.data?.error||e.message;
function BlockMatches({mapping}){
 if(!mapping?.raw)return <span>Not supplied</span>;
 return <div><strong>{mapping.raw}</strong>{mapping.references.map((b,i)=><div key={i}>{b.sourceReference} → {b.blockCode||'Unresolved'} · {b.status.replaceAll('_',' ')}{b.candidates.length>0&&<small>Possible master blocks: {b.candidates.map(c=>c.blockCode).join(', ')}</small>}</div>)}{mapping.unparsed&&<div>Needs review: {mapping.unparsed}{mapping.status==='non_plantation_reference'?' (building reference)':''}</div>}</div>;
}
function TransactionDetail({row:r,currency}){
 return <div className="tb-detail" aria-label="Trial balance transaction details"><h3>{r.accountCode} · {r.accountName} · S/N {r.sourceSequence}</h3><p>{r.description}</p>
  {r.reviewIssues.length>0&&<section className="tb-highlight"><h4>Highlight reasons</h4><ul>{r.reviewIssues.map((issue,i)=><li key={i}><strong>{issue.type}:</strong> {issue.reason}{issue.expectedMinor!=null&&<div>Expected {currency} {money(issue.expectedMinor)} · Actual {currency} {money(issue.actualMinor)} · Difference {currency} {money(issue.differenceMinor)}</div>}</li>)}</ul></section>}
  <h4>Block matching</h4><BlockMatches mapping={r.blockMapping}/>
  <dl>{[['Reference',r.reference],['Entity',r.entity],['Item',r.item],['Quantity',r.quantity],['Unit',r.unit],['Purpose',r.purpose],['Activity',r.activity],['Employee / beneficiary',r.beneficiary],['Employee ID',r.employeeId],['Bank',r.bank],['Document reference',r.documentReference],['Work period',r.periodText],['Start date',r.workStart],['End date',r.workEnd],[`Rate (${currency})`,money(r.rateMinor)],['Rate basis',r.rateBasis],['Days',r.days],['Mandays',r.mandays],['Location',r.location],['Vehicle ID',r.vehicleIdentifier],['Equipment',r.equipment],['Payment stage',r.paymentStage],['Asset',r.asset],['Specification',r.specification],[`Other amount (${currency})`,money(r.otherAmountMinor)],['Other description',r.otherDescription],['Note',r.note],['Source',r.sourceFile]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??'—'}</dd></div>)}</dl>
  {r.components.length>0&&<><h4>Transaction breakdown</h4><p>These components describe the parent transaction. Their amounts are not added again to totals.</p><div className="data-table-scroll"><table><thead><tr>{['Description / activity','Employee / ID','Item / quantity',`Rate (${currency})`,`Amount (${currency})`,'Location','Block reference / match'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{r.components.map((c,i)=><tr key={i}><td>{c.description||c.activity||'—'}</td><td>{c.beneficiary||'—'}<small>{c.employeeId}</small></td><td>{c.item||'—'}<small>{c.quantity==null?'':`${c.quantity} ${c.unit||''}`}</small></td><td>{money(c.rateMinor)}</td><td>{money(c.amountMinor)}<small>{c.amountBasis}</small></td><td>{c.location||'—'}</td><td><BlockMatches mapping={c.blockMapping}/></td></tr>)}</tbody></table></div></>}
 </div>;
}
function SummaryTree({accounts,onAccount,estateId}){
 const root={children:new Map()};
 for(const a of accounts){let node=root;for(const [i,label]of a.hierarchyPath.entries()){
  if(!node.children.has(label))node.children.set(label,{label,depth:i+1,children:new Map(),debitMinor:0,creditMinor:0});
  node=node.children.get(label);node.debitMinor+=a.debitMinor;node.creditMinor+=a.creditMinor;
 }node.account=a;}
 const render=node=>[...node.children.values()].map(n=>n.account?<div className={`tb-tree-leaf ${n.account.beigeFlag?'tb-highlight':''}`} key={n.label}>
  <button className="text-button" onClick={()=>onAccount(n.account)} disabled={!n.account.accountCode||!n.account.transactionCount}>{n.account.accountCode||'—'} · {n.label}</button><span>Dr {money(n.debitMinor)} · Cr {money(n.creditMinor)}</span><small>{n.account.detailsStatus==='reconciled'?`${n.account.transactionCount.toLocaleString()} transactions · ${n.account.beigeDetailCount} highlights · ${n.account.blockReviewDetailCount} block mismatches`:'Details not yet supplied'}</small><RecordActions kind="trial-balance" estateId={estateId} id={n.account.id}/>
 </div>:<details key={n.label} open className="tb-tree-branch"><summary><strong>{n.label}</strong><span>Dr {money(n.debitMinor)} · Cr {money(n.creditMinor)}</span></summary>{render(n)}</details>);
 return <div className="tb-tree" aria-label="Trial balance hierarchy">{render(root)}</div>;
}
export default function TrialBalanceTables({estateId}){
 const [year,setYear]=useState('2025'),[view,setView]=useState('transactions'),[filter,setFilter]=useState('all'),[accountCode,setAccount]=useState(''),[q,setQuery]=useState(''),[retry,setRetry]=useState(0),[detail,setDetail]=useState(null);
 const [meta,setMeta]=useState(null),[error,setError]=useState('');
 const paged=usePagedTable('/trial-balance',{estateId,year,accountCode:accountCode||undefined,filter,q},{enabled:!!estateId&&view==='transactions'});
 const {data:current,page}=paged;
 const metadata=meta?.scope===`${estateId}:${year}`?meta:null;
 const {label:currency}=useEstateCurrency(estateId,metadata?.currency||current?.currency);
 const setPage=()=>paged.reset();
 const change=(fn,value)=>{fn(value);paged.reset();setDetail(null)};
 useEffect(()=>{if(!estateId)return;const c=new AbortController();setMeta(null);setError('');api.get('/trial-balance/meta',{params:{estateId,year},signal:c.signal}).then(({data})=>setMeta({...data,scope:`${estateId}:${year}`})).catch(e=>{if(e.code!=='ERR_CANCELED')setError(errorText(e))});return()=>c.abort()},[estateId,year,retry]);
 if(!estateId)return <section><h2>Trial balance</h2><p>Select one estate while online to view its trial balance.</p></section>;
 const accounts=metadata?.accounts||[],visibleAccounts=accounts.filter(a=>(!accountCode||a.accountCode===accountCode)&&(filter==='all'||filter==='highlight'&&a.beigeDetailCount>0||filter==='block_mismatch'&&a.blockReviewDetailCount>0)&&(!q||[a.accountCode,...a.hierarchyPath].join(' ').toLowerCase().includes(q.toLowerCase())));
 return <section className="production-tables tb-tables" aria-label="Trial balance" aria-busy={!error&&!paged.error&&(view==='transactions'?!current:!metadata)}>
  <h2>Trial balance · {year}</h2><p>Account hierarchy, source transactions and review highlights.</p>
  <div className="tb-views" role="group" aria-label="Trial balance view">{[['transactions','Transactions'],['summary','Summary tree']].map(([v,label])=><button className={`button ${view===v?'primary':''}`} key={v} aria-pressed={view===v} onClick={()=>change(setView,v)}>{label}</button>)}</div>
  <div className="table-toolbar production-toolbar">
   <label>Year<select value={year} onChange={e=>{change(setYear,e.target.value);setAccount('')}}>{[...new Set([year,...(metadata?.years||[]).map(String)])].sort().reverse().map(y=><option key={y}>{y}</option>)}</select></label>
   <label>Account<select value={accountCode} onChange={e=>change(setAccount,e.target.value)}><option value="">All accounts</option>{accounts.filter(a=>a.accountCode).map(a=><option key={a.id} value={a.accountCode}>{a.accountCode} · {a.accountName}</option>)}</select></label>
   <label>Review filter<select value={filter} onChange={e=>change(setFilter,e.target.value)}>{filters.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Search<input type="search" maxLength={160} value={q} onChange={e=>change(setQuery,e.target.value)} placeholder={view==='summary'?'Account or hierarchy':'Description, block, employee or issue'}/></label>
   <button className="button" onClick={()=>{setFilter('all');setAccount('');setQuery('');setPage(0);setDetail(null)}}>Clear filters</button>
  </div>
  {metadata&&<div className="tb-counts"><span>{metadata.summary.accounts} accounts · {metadata.summary.accountsWithDetails} with details supplied</span><button className="text-button" onClick={()=>{setView('transactions');change(setFilter,'highlight')}}>Highlight: {metadata.summary.highlightCount}</button><button className="text-button" onClick={()=>{setView('transactions');change(setFilter,'block_mismatch')}}>Block mismatches: {metadata.summary.blockMismatchCount}</button></div>}
  {metadata?.reportIntegrity?.differenceMinor!==0&&metadata?.reportIntegrity&&<p className="tb-highlight tb-report-note">Report check: credits exceed debits by {currency} {money(Math.abs(metadata.reportIntegrity.differenceMinor))}. This source difference is retained separately from transaction highlights.</p>}
  {(error||(view==='transactions'&&paged.error))&&<div role="alert" className="production-warning">{error||paged.error} <button className="button" onClick={()=>{setRetry(n=>n+1);paged.retry()}}>Retry</button></div>}
  {view==='summary'?metadata?<><p>Amounts in {currency}. Expand or collapse each level; select an account to view its transactions.</p><SummaryTree estateId={estateId} accounts={visibleAccounts} onAccount={a=>{setAccount(a.accountCode);setView('transactions');setQuery('');setPage(0);}}/>{!visibleAccounts.length&&<p>No accounts match these filters.</p>}</>:!error&&<p role="status">Loading account hierarchy…</p>:<>
   {current&&<div className="tb-counts" aria-live="polite"><strong>{current.count.toLocaleString()} matching transactions</strong><span>Dr {currency} {money(current.summary.debitMinor)}</span><span>Cr {currency} {money(current.summary.creditMinor)}</span><span>Net {currency} {money(current.summary.netMinor)}</span><span>{current.summary.highlightCount} highlights · {current.summary.blockMismatchCount} block mismatches</span></div>}
   {paged.loading&&!error&&<p role="status">Loading transactions…</p>}
   {current&&<div className="data-table-scroll" tabIndex="0"><table><thead><tr>{['Date / reference','Account','Description','Block reference',`Debit (${currency})`,`Credit (${currency})`,'Review','Details'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{current.items.map(r=><Fragment key={r.id}><tr className={r.beigeFlag?'tb-highlight':''}><td>{r.date}<small>{r.reference||'—'} · S/N {r.sourceSequence}</small></td><td>{r.accountCode}<small>{r.accountName}</small></td><td className="tb-description">{r.description}</td><td>{r.blockReference||'—'}<small>{r.blockMapping.status.replaceAll('_',' ')}</small></td><td className="tb-number">{money(r.debitMinor)}</td><td className="tb-number">{money(r.creditMinor)}</td><td>{r.beigeFlag?<><strong>Highlight</strong><small>{r.blockReviewRequired?'Block mismatch':''}</small><small>{[...new Set(r.reviewIssues.filter(i=>i.category!=='block_mapping').map(i=>i.type))].join('; ')}</small></>:'Clear'}</td><td><RecordActions kind="trial-details" estateId={estateId} id={r.id}/><button className="text-button" aria-expanded={detail===r.id} onClick={()=>setDetail(detail===r.id?null:r.id)}>{detail===r.id?'Close':'Details'}</button></td></tr>{detail===r.id&&<tr><td colSpan="8"><TransactionDetail row={r} currency={currency}/></td></tr>}</Fragment>)}{!current.items.length&&<tr><td colSpan="8">No transactions match these filters.</td></tr>}</tbody></table></div>}
   {current&&current.count>0&&<nav className="table-pagination" aria-label="Trial balance pagination"><button className="button" disabled={page===0} onClick={()=>{paged.previous();setDetail(null)}}>Previous</button><span>{page*25+1}–{Math.min((page+1)*25,current.count)} of {current.count.toLocaleString()}</span><button className="button" disabled={!current.nextCursor} onClick={()=>{paged.next();setDetail(null)}}>Next</button></nav>}
  </>}
  <p className="table-note">Original block references are retained. Missing, ambiguous and unmapped references appear in Highlight and Block mismatches. Block links do not allocate costs. Opening balances are retained in the database and excluded from transaction counts.</p>
 </section>;
}
