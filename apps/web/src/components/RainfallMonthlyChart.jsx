import {useState} from 'react';
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export default function RainfallMonthlyChart({records=[]}){
 const available=records.filter(r=>r.monthly?.length).sort((a,b)=>b.year-a.year);
 const [chosen,setChosen]=useState(null);
 const r=available.find(r=>r.year===Number(chosen))||available[0];
 if(!r)return null;
 const max=Math.max(1,...r.monthly.map(m=>m.mm??0))*1.18,w=860,h=250,left=55,right=20,top=25,bottom=45;
 const step=(w-left-right)/12,y=v=>h-bottom-v/max*(h-top-bottom);
 const discrepancy=r.monthlySumMm!=null&&r.monthlySumMm!==r.mm;
 return <section className="rainfall-monthly" aria-label="Monthly rainfall">
  <div className="rainfall-heading"><div><h3>Monthly rainfall · {r.year}{r.partial?' · through September':''}</h3><p>{r.mm.toLocaleString()} mm reported · {r.rainDays} rain days{r.partial?' · Jan–Sep YTD':''}</p></div><label>Rainfall year<select value={r.year} onChange={e=>setChosen(e.target.value)}>{available.map(r=><option key={r.year}>{r.year}</option>)}</select></label></div>
  <div className="fertiliser-yield-scroll" tabIndex="0" aria-label="Monthly rainfall chart; scroll horizontally on small screens"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${r.year} monthly rainfall in millimetres`} style={{minWidth:620,width:'100%'}}>
   {[0,1,2,3].map(t=><g key={t}><line x1={left} x2={w-right} y1={y(max*t/3)} y2={y(max*t/3)} stroke="#dce5e9"/><text x={left-8} y={y(max*t/3)+4} textAnchor="end" fill="#52645b" fontSize="12">{Math.round(max*t/3)}</text></g>)}<text x="12" y="15" fill="#286fa1" fontSize="12">mm</text>
   {months.map((name,i)=>{const m=r.monthly.find(m=>m.month===i+1),x=left+step*(i+.5);return <g key={name}><text x={x} y={h-20} textAnchor="middle" fontSize="12" fill="#40554a">{name}</text>{m?.mm!=null?<><rect x={x-step*.31} y={y(m.mm)} width={step*.62} height={y(0)-y(m.mm)} rx="3" fill="#286fa1"/><text x={x} y={y(m.mm)-8} textAnchor="middle" fontSize="12" fill="#205879">{m.mm}</text></>:<text x={x} y={y(0)-10} textAnchor="middle" fontSize="11" fill="#63756a">{m?.status==='NR'?'NR':'—'}</text>}</g>;})}
  </svg></div>
  <p className="fertiliser-wage-note">NR means not recorded; — means not supplied. {r.partial?'October–December 2026 are not supplied. ':''}Rainfall is estate-level context shared by all blocks.</p>
  {discrepancy&&<p className="production-warning">Source check: {r.year} monthly entries sum to {r.monthlySumMm.toLocaleString()} mm; the screenshot reports {r.mm.toLocaleString()} mm. Reported total retained.</p>}
  <details><summary>View monthly rainfall and rain days</summary><div className="data-table-scroll"><table><thead><tr><th>Month</th><th>Rainfall (mm)</th><th>Rain days</th></tr></thead><tbody>{r.monthly.map(m=><tr key={m.month}><td>{months[m.month-1]}</td><td>{m.mm??(m.status==='NR'?'NR':'—')}</td><td>{m.rainDays??'—'}</td></tr>)}</tbody></table></div><p>Source: {r.sourceFile||'Supplied comparative rainfall screenshot, 15 October 2026'}.</p></details>
 </section>;
}
