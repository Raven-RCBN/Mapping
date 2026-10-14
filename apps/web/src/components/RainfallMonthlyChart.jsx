import {useState} from 'react';
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export default function RainfallMonthlyChart({records=[]}){
 const available=records.filter(r=>r.monthly?.length).sort((a,b)=>b.year-a.year);
 const [chosen,setChosen]=useState(null);
 const r=available.find(r=>r.year===Number(chosen))||available[0];
 if(!r)return null;
 const peak=Math.max(1,...r.monthly.map(m=>m.mm??0)),rawTick=peak*1.16/4,power=10**Math.floor(Math.log10(rawTick));
 const tick=([1,2,2.5,5,10].find(v=>v>=rawTick/power)||10)*power,max=tick*4;
 const w=1000,h=200,left=54,right=22,top=26,bottom=30;
 const step=(w-left-right)/12,y=v=>h-bottom-v/max*(h-top-bottom);
 const discrepancy=r.monthlySumMm!=null&&r.monthlySumMm!==r.mm;
 return <section className="rainfall-monthly" aria-label="Monthly rainfall">
  <div className="rainfall-heading"><div><h3>Monthly rainfall <span>· {r.year}</span>{r.partial&&<small>Jan–Sep YTD</small>}</h3><p><strong>{r.mm.toLocaleString()} mm</strong> reported <span>·</span> <strong>{r.rainDays}</strong> rain days</p></div><label>Rainfall year<select value={r.year} onChange={e=>setChosen(e.target.value)}>{available.map(r=><option key={r.year}>{r.year}</option>)}</select></label></div>
  <div className="fertiliser-yield-scroll" tabIndex="0" aria-label="Monthly rainfall chart; scroll horizontally on small screens"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${r.year} monthly rainfall in millimetres`} className="rainfall-monthly-plot">
   {[0,1,2,3,4].map(t=><g key={t}><line x1={left} x2={w-right} y1={y(max*t/4)} y2={y(max*t/4)} stroke="#e8edef"/><text x={left-8} y={y(max*t/4)+4} textAnchor="end" fill="#7a8981" fontSize="9.5">{(max*t/4).toLocaleString(undefined,{maximumFractionDigits:1})}</text></g>)}<text x="12" y="15" fill="#286fa1" fontSize="10.5">mm</text>
   {months.map((name,i)=>{const m=r.monthly.find(m=>m.month===i+1),x=left+step*(i+.5);return <g key={name}><text x={x} y={h-10} textAnchor="middle" fontSize="11" fill="#65776c">{name}</text>{m?.mm!=null?<><rect x={x-step*.22} y={y(m.mm)} width={step*.44} height={y(0)-y(m.mm)} rx="3" fill="#4c86a4"/><text x={x} y={y(m.mm)-8} textAnchor="middle" fontSize="10" fontWeight="450" fill="#2e6280">{m.mm}</text></>:<text x={x} y={y(0)-10} textAnchor="middle" fontSize="11" fill="#63756a">{m?.status==='NR'?'NR':'—'}</text>}</g>;})}
  </svg></div>
  <p className="rainfall-monthly-note">NR: not recorded · —: not supplied{r.partial?' · October–December not supplied':''}</p>
  {discrepancy&&<p className="production-warning">Source check: {r.year} monthly entries sum to {r.monthlySumMm.toLocaleString()} mm; the screenshot reports {r.mm.toLocaleString()} mm. Reported total retained.</p>}
  <details><summary>Monthly values & source</summary><p>Rainfall is estate-level context shared by all blocks.</p><div className="data-table-scroll"><table><thead><tr><th>Month</th><th>Rainfall (mm)</th><th>Rain days</th></tr></thead><tbody>{r.monthly.map(m=><tr key={m.month}><td>{months[m.month-1]}</td><td>{m.mm??(m.status==='NR'?'NR':'—')}</td><td>{m.rainDays??'—'}</td></tr>)}</tbody></table></div><p>Source: {r.sourceFile||'Supplied comparative rainfall screenshot, 15 October 2026'}.</p></details>
 </section>;
}
