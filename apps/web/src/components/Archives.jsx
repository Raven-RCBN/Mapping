import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { api } from '../api';
export const formatBytes = (value = 0) => {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** i).toFixed(i > 1 ? 2 : 0)} ${units[i]}`;
};
const names = { Activity: 'Map activities', Block: 'Block boundaries & parameters', HarvestingActivity: 'Harvesting',
  FieldActivity: 'Field operations', ProductionName: 'Production block links', ProductionComment: 'Production notes',
  MonthlyProduction: 'Monthly production', YearlyProduction: 'Yearly production', Wage: 'Wages', WageArea: 'Wage areas',
  BlockManday: 'Block mandays', AnnualRainfall: 'Rainfall' };
const dated = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export default function Archives({ onReload, onRetention }) {
  const s = useSelector(x => x), choices = s.data.estates.filter(e => s.selected.includes(e.id));
  const [estate, setEstate] = useState(choices.length === 1 ? choices[0].id : '');
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [before, setBefore] = useState(''), [recover, setRecover] = useState(null);
  const offline = s.data.offline, admin = s.data.access.role === 'admin' && !offline;
  const selected = estate || s.selected.join(',');
  const load = useCallback(async signal => {
    const result = await api.get('/archives', { params: { estates: selected, ...(before ? { before } : {}) }, signal });
    if (!signal?.aborted) setData(result.data);
  }, [selected, before]);
  useEffect(() => {
    if (offline) return;
    const controller = new AbortController(); setData(null); setError('');
    load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.error || e.message); });
    return () => controller.abort();
  }, [load, offline]);
  const inProgress = data?.archives.some(a => a.active);
  useEffect(() => {
    if (!inProgress) return;
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal).catch(e => {
      if (!controller.signal.aborted) setError(e.response?.data?.error || e.message);
    }), 2500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [data, inProgress, load]);
  const run = async action => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  };
  const download = async row => {
    const { data: ticket } = await api.post(`/archives/${row._id}/download`);
    const a = document.createElement('a'); a.href = ticket.url; a.referrerPolicy = 'no-referrer'; a.click();
    setNotice('Download requested. Keep a copy on separate storage and retain manifest.json for checksum checks.');
  };
  const downloadManifest = async row => {
    const { data: manifest } = await api.get(`/archives/${row._id}/manifest`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `mapping-${row.estateId}-${row._id}-manifest.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (offline) return <section className="data-workspace"><h2>Data Storage & Archive</h2><p>Connect to view server usage, create archives or recover imagery. Downloaded offline maps are managed in Offline maps.</p></section>;
  const active = data?.groups.filter(g => !['retired', 'purged', 'purging', 'restoring'].includes(g._id.state)) || [];
  const retired = data?.groups.filter(g => ['retired', 'purging'].includes(g._id.state)) || [];
  const sum = groups => groups.reduce((n, g) => n + g.bytes, 0);
  const estateName = id => s.data.estates.find(e => e.id === id)?.name || id;
  return <section className="data-workspace archive-workspace">
    <div className="archive-heading"><div><div className="eyebrow">ESTATE DATA MANAGEMENT</div><h2>Data Storage & Archive</h2><p>A complete estate snapshot, with a verified recovery copy for older imagery.</p></div>
      <button className="button" disabled={busy} onClick={() => run(async () => {})}>↻ Refresh</button></div>
    <div className="archive-toolbar"><label>Estate<select aria-label="Archive estate" value={estate} disabled={busy} onChange={e => { setEstate(e.target.value); setBefore(''); setRecover(null); setNotice(''); }}>
      <option value="">Selected estates · summary only</option>{choices.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <div><strong>All dates included</strong><span>Keep historical maps and their supporting records together.</span></div></div>
    {error && <p className="callout" role="alert">{error}</p>}{notice && <p className="callout" role="status">{notice}</p>}
    {!data ? <p role="status">Loading storage inventory…</p> : <>
      <div className="stats archive-stats">
        <article><div><span>Active map files</span><strong>{formatBytes(sum(active))}</strong><p>{active.reduce((n, g) => n + g.files, 0).toLocaleString()} assets · includes image pyramids</p></div></article>
        <article><div><span>Retired imagery</span><strong>{formatBytes(sum(retired))}</strong><p>Still on disk until verified purge</p></div></article>
        <article><div><span>Mapping records</span><strong>{data.records.reduce((n, r) => n + r.count, 0).toLocaleString()}</strong><p>Production, activities & estate history</p></div></article>
        <article><div><span>Archive copies</span><strong>{formatBytes(data.archiveBytes)}</strong><p>{data.verifiedCount} verified snapshots</p></div></article>
      </div>
      <div className="archive-columns"><div className="archive-panel"><h3>Storage inventory</h3><p className="table-note">All dates. File totals use the asset inventory; a shared file may be counted more than once. Record counts exclude credentials and login sessions.</p>
        <div className="data-table-scroll"><table><thead><tr><th>Estate / file type</th><th>Status</th><th>Assets</th><th>Size</th></tr></thead><tbody>
          {data.groups.map(g => <tr key={JSON.stringify(g._id)}><td><strong>{estateName(g._id.estate)}</strong><small className="archive-subtext">{g._id.kind}</small></td><td>{g._id.state}</td><td>{g.files}</td><td>{g._id.state === 'purged' ? 'Removed' : formatBytes(g.bytes)}</td></tr>)}
          {!data.groups.length && <tr><td colSpan="4">No map assets in this selection.</td></tr>}
        </tbody></table></div>
        <details className="archive-records"><summary>Mapping record breakdown</summary><div className="data-table-scroll"><table><thead><tr><th>Module</th><th>Records</th></tr></thead><tbody>{data.records.map(r => <tr key={r.name}><td>{names[r.name] || r.name}</td><td>{r.count.toLocaleString()}</td></tr>)}</tbody></table></div></details>
      </div><div className="archive-panel archive-action-panel"><h3>Create an estate archive</h3><p>Includes images, CarryMap pyramids, terrain, GIS and QGIS files, estate boundaries and all Mapping database records for one estate.</p>
        <ol className="archive-steps"><li><strong>Create</strong><span>Copy files and export records in the background.</span></li><li><strong>Verify</strong><span>Check every file against its SHA-256 checksum.</span></li><li><strong>Download & retain</strong><span>Save the package to separate storage.</span></li></ol>
        {!estate && <p className="callout">Select one estate to create an archive. Combined estates are for summary viewing.</p>}
        <button className="button primary" disabled={!admin || !estate || busy || inProgress} onClick={() => run(async () => {
          await api.post('/archives', { estateId: estate }); setBefore(''); setNotice('Archive started. Progress is saved on the server; keep imports and edits paused until it finishes.');
        })}>{inProgress ? 'Archive job in progress…' : '＋ Create full estate archive'}</button>
        {!admin && <p className="table-note">An administrator can create, verify, download and restore archives.</p>}
        <dl className="archive-capacity"><div><dt>Active storage available</dt><dd>{formatBytes(data.freeDiskBytes)}</dd></div><div><dt>Archive storage available</dt><dd>{formatBytes(data.archiveFreeBytes)}</dd></div></dl>
        <p className="callout">{data.sameVolume ? 'Archives currently share the active disk. Creating an archive uses additional space; it does not reduce total disk usage.' : 'Archives use a separate disk from active estate files.'}</p>
        <p className="table-note">No automatic deletion. A separate archive volume can be configured for long-term storage. Existing offline downloads are managed separately.</p>
        <button className="button" onClick={onRetention}>Manage image retention →</button>
      </div></div>
      <div className="archive-panel archive-history"><h3>Archive history</h3><p className="table-note">Snapshots include all dates. The date below is when the archive was created. Creating another snapshot preserves earlier copies.</p>
        <div className="data-table-scroll"><table><thead><tr><th>Estate / created</th><th>Status</th><th>Contents</th><th>Actions</th></tr></thead><tbody>{data.archives.map(a => <tr key={a._id}>
          <td><strong>{estateName(a.estateId)}</strong><small className="archive-subtext">{dated(a.createdAt)}</small><small className="archive-subtext">{a._id.slice(0, 8)}</small></td>
          <td><span className={`archive-badge ${a.status}`}>{a.status === 'ready' ? 'Awaiting verification' : a.status}</span>{a.error && <small className="archive-subtext archive-error">{a.error}</small>}{a.verifiedAt && <small className="archive-subtext">Verified {dated(a.verifiedAt)}</small>}</td>
          <td>{formatBytes(a.bytes)}<small className="archive-subtext">{a.files ?? '—'} files · {a.records ?? '—'} records</small></td>
          <td><div className="archive-row-actions"><button className="button" disabled={!admin || busy || inProgress || !a.manifestHash} onClick={() => run(async () => { await api.post(`/archives/${a._id}/verify`); setNotice('Verification started. Every archived file and record export will be checked.'); })}>Verify</button>
            <button className="button" disabled={!admin || busy || a.status !== 'verified'} onClick={() => run(() => download(a))}>Download .tar.gz</button>
            <button className="text-button" disabled={!admin || busy || !a.manifestHash} onClick={() => run(() => downloadManifest(a))}>Manifest</button></div></td>
        </tr>)}{!data.archives.length && <tr><td colSpan="4">No archives yet. Select an estate and create its first snapshot.</td></tr>}</tbody></table></div>
        <div className="table-pagination"><button className="button" disabled={!before || busy} onClick={() => setBefore('')}>Latest archives</button><span>Up to 50 snapshots per page</span><button className="button" disabled={!data.nextBefore || busy} onClick={() => setBefore(data.nextBefore)}>Older archives</button></div>
      </div>
      <div className="archive-panel archive-history"><h3>Recover purged imagery</h3><p>Restore original image files from their verified archive. Recovery restores map visibility and uses active disk space. Boundaries, terrain and historical records are retained by the image-retention workflow.</p>
        {!data.purged.length ? <p className="table-note">No purged images in this selection.</p> : <div className="data-table-scroll"><table><thead><tr><th>Image</th><th>Estate</th><th>Size</th><th>Recovery</th></tr></thead><tbody>{data.purged.map(a => <tr key={a._id}><td>{a.name}</td><td>{estateName(a.estateId)}</td><td>{formatBytes(a.file?.bytes)}</td><td><button className="button" disabled={!admin || busy || !a.archiveId} onClick={() => setRecover(a)}>Restore image</button>{!a.archiveId && <small className="archive-subtext">No verified archive linked</small>}</td></tr>)}</tbody></table></div>}
        {data.morePurged && <p className="table-note">First 100 images shown. Restored images leave this list; refresh to see the next images.</p>}
        {recover && <div className="callout" role="group" aria-label="Confirm image recovery"><p>Restore <strong>{recover.name}</strong> to {estateName(recover.estateId)}? This uses {formatBytes(recover.file?.bytes)} of active storage.</p><div className="archive-row-actions"><button className="button primary" disabled={busy} onClick={() => run(async () => { await api.post(`/storage/${encodeURIComponent(recover._id)}/restore`); setRecover(null); await onReload(); setNotice('Image restored from its verified archive.'); })}>Confirm restore</button><button className="button" disabled={busy} onClick={() => setRecover(null)}>Cancel</button></div></div>}
        <p className="table-note">The package also contains database exports for administrator-led disaster recovery. It excludes credentials, application configuration and source files outside estate folders; keep the system backup separately.</p>
      </div>
    </>}
  </section>;
}
