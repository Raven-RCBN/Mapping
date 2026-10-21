import {forecastYield} from '../../../../packages/shared/production-tonnage.js';
import {useState} from 'react';
const n=(v,d=1)=>Number.isFinite(v)?v.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
export default function ExperimentalYield({report,block}){
 const [perHa,setPerHa]=useState(false);
 if(!report)return null;
 const rows=report.forecasts.filter(r=>!block||r.mapBlockCode===block);
 const model=rows.reduce((s,r)=>s+r.predictionTonnes,0),baseline=rows.reduce((s,r)=>s+r.baselineTonnes,0);
 const area=rows.length&&rows.every(r=>Number.isFinite(r.effectiveHa)&&r.effectiveHa>0)?rows.reduce((s,r)=>s+r.effectiveHa,0):null;
 const unit=perHa?'tonnes/ha/month':'tonnes/month',values=[model,baseline].map(v=>perHa?(forecastYield(v,area,report.productionBasis)):v);
 const max=Math.max(1,...values.filter(Number.isFinite))*1.15;
 return <section className="ds-card" aria-label="Experimental one-month model comparison">
 <h3>One-month model comparison <span className="ds-tag">Experimental</span></h3>
 <p>{rows[0]?.month||'Next month'} · based on production through {report.asOf} · {rows.length} matched source records · all usable training history.</p>
 <p>Seasonal corrections use age, palms per effective hectare, rainfall windows and fertiliser lagged two calendar years. Historical soil moisture, temperature and radiation are pending.</p>
 {!rows.length?<p>No experimental forecast is available for this block.</p>:<>
 <div className="ds-metrics"><article><span>New candidate</span><strong>{n(model)} <small>tonnes/month</small></strong><span>{n(forecastYield(model,area,report.productionBasis),3)} tonnes/ha/month</span></article><article><span>Seasonal baseline</span><strong>{n(baseline)} <small>tonnes/month</small></strong><span>{n(forecastYield(baseline,area,report.productionBasis),3)} tonnes/ha/month</span></article></div>
 <label className="ds-inline">Comparison units<select value={perHa?'yield':'tonnes'} onChange={e=>setPerHa(e.target.value==='yield')}><option value="tonnes">Production · tonnes/month</option><option value="yield">Yield · tonnes/ha/month</option></select></label>
 {perHa&&(!area||report.productionBasis!=='ffb_plus_loose_fruit')?<p>Combined yield unavailable: this forecast needs both total crop tonnes and effective hectares.</p>:<svg viewBox="0 0 640 165" role="img" aria-label={`One-month comparison: candidate ${n(values[0],perHa?3:1)}, seasonal baseline ${n(values[1],perHa?3:1)} ${unit}`} style={{width:'100%',maxWidth:800}}>{values.map((v,i)=><g key={i}><text x="0" y={40+i*70} fontSize="15">{i?'Seasonal baseline':'New candidate'}</text><rect x="155" y={20+i*70} width={v/max*330} height="30" fill={i?'#c48a20':'#3678c9'}/><text x={165+v/max*330} y={40+i*70} fontSize="14">{n(v,perHa?3:1)}</text></g>)}<text x="155" y="155" fontSize="13">{unit}</text></svg>}
 </>}
 <details><summary>Historical comparison and limitations</summary><p>January 2025–July 2026, 19 months. Methods selected using 2024 only. WAPE is total absolute monthly error divided by total actual production. These aggregate scores do not establish accuracy for individual blocks.</p><div className="data-table-scroll"><table><thead><tr><th>Scope</th><th>Seasonal error</th><th>Candidate error</th></tr></thead><tbody>{[['Matched estate sources',report.evaluation],...Object.entries(report.cohortEvaluation).map(([y,v])=>[`${y} planting`,v])].map(([label,v])=><tr key={label}><td>{label}</td><td>{n(v.seasonal.wapePercent,2)}%</td><td>{n(v.selected.wapePercent,2)}%</td></tr>)}</tbody></table></div><ul>{report.limitations.map(x=><li key={x}>{x}</li>)}</ul></details>
 </section>;
}
