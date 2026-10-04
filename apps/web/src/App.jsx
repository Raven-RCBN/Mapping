import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { loaded, patch } from "./store";
import { getSnapshot, setToken, clearOffline, imageBlob } from "./api";
import {
  label,
  records,
  buckets,
  types,
  imagesAt,
} from "../../../packages/shared/timeline";
import EstatePicker from "./components/EstatePicker";
import MapView from "./components/MapView";
import Timeline from "./components/Timeline";
import Dialogs from "./components/Dialogs";
function Thumbnail({ asset }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true,
      obj;
    imageBlob(asset)
      .then((b) => {
        obj = URL.createObjectURL(b);
        if (alive) setUrl(obj);
        else URL.revokeObjectURL(obj);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [asset.id]);
  return url ? (
    <img src={url} alt={asset.name} />
  ) : (
    <span>Image unavailable</span>
  );
}
export default function App() {
  const s = useSelector((s) => s),
    dispatch = useDispatch(),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState(null),
    [token, setInputToken] = useState("");
  const reload = useCallback(async () => {
    const data = await getSnapshot();
    dispatch(loaded(data));
    setError("");
  }, [dispatch]);
  useEffect(() => {
    reload().catch((e) =>
      setError(
        e.response?.data?.error ||
          "API unavailable. Start the API or open a saved offline package."
      )
    );
  }, [reload]);
  const current = buckets(
    s.date,
    s.period === "all" ? "month" : s.period,
    1
  )[0];
  const rows = useMemo(
    () =>
      s.data
        ? records(s.data, s.selected, {
            activity: s.activity,
            block: s.block,
            bucket: current,
            review: s.review,
          })
        : [],
    [s.data, s.selected, s.activity, s.block, s.date, s.period, s.review]
  );
  const onRecord = useCallback(
    (record) => setDialog({ type: "record", record }),
    []
  );
  if (!s.data)
    return (
      <main className="startup">
        <img src="/icon.svg" width="60" />
        <h1>Estate Atlas</h1>
        <p>{error || "Loading your estate workspace…"}</p>
        {error && (
          <>
            <button
              className="button"
              onClick={() => reload().catch((e) => setError(e.message))}
            >
              Retry connection
            </button>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await clearOffline();
                setToken(token);
                reload().catch((e) =>
                  setError(e.response?.data?.error || e.message)
                );
              }}
            >
              <label>
                DigitalPalm access token
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setInputToken(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <button className="button primary">Connect</button>
            </form>
          </>
        )}
      </main>
    );
  const estates = s.data.estates.filter((e) => s.selected.includes(e.id)),
    blocks = estates.reduce(
      (n, e) => n + (e.boundary?.features?.length || 0),
      0
    ),
    verified = rows.filter((r) => r.status === "verified").length;
  const all = records(s.data, s.selected, {
      activity: s.activity,
      block: s.block,
      bucket: current,
    }),
    pending = all.filter((r) => r.status !== "verified").length;
  const images = imagesAt(s.data.assets, s.selected, s.date, s.override),
    near = s.data.assets
      .filter((a) => s.selected.includes(a.estateId) && a.kind === "imagery")
      .sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));
  const goHistory = () =>
    document.getElementById("timeline").scrollIntoView({ behavior: "smooth" });
  return (
    <>
      <aside className="rail">
        <a className="brand map-brand" href="#" aria-label="DigitalPalm home">
          <img src="/icon.svg" alt="" />
        </a>
        <div className="rail-divider" />
        <button
          className="nav-icon"
          title="Map workspace"
          onClick={() =>
            document
              .getElementById("workspace")
              .scrollIntoView({ behavior: "smooth" })
          }
        >
          ◈
        </button>
        <button className="nav-icon" title="Map history" onClick={goHistory}>
          ◷
        </button>
        <button
          className="nav-icon"
          title="Map sources"
          onClick={() => setDialog({ type: "sources" })}
        >
          ▱
        </button>
        <button
          className="nav-icon"
          title="Offline maps"
          onClick={() => setDialog({ type: "offline" })}
        >
          ⇩
        </button>
      </aside>
      <div className="shell">
        <header>
          <div className="wordmark">
            digital<span>palm</span>
            <small>ESTATE INTELLIGENCE</small>
          </div>
          <div className="breadcrumb">Workspace / Estate Atlas</div>
          <div className="header-right">
            <span className="today">
              {s.data.offline ? "OFFLINE" : "CONNECTED"} ·{" "}
              {s.data.access.role.toUpperCase()}
            </span>
          </div>
        </header>
        <main>
          <div className="page-title">
            <div>
              <div className="eyebrow">GEOSPATIAL COMMAND CENTER</div>
              <h1>Your estate. Every day.</h1>
              <p>
                One view of your land, your people, and the work getting done.
              </p>
            </div>
            <div className="title-actions">
              <button
                className="button"
                onClick={() => setDialog({ type: "offline" })}
              >
                ⇩ Offline maps
              </button>
              <button
                className="button primary"
                onClick={() => setDialog({ type: "sources" })}
              >
                ＋ Manage map sources
              </button>
            </div>
          </div>
          <EstatePicker onAdd={() => setDialog({ type: "estate" })} />
          {!estates.length && (
            <div className="callout">
              Add an estate to begin, or import the existing Estate Atlas data
              using the setup command.
            </div>
          )}
          <section className="stats">
            <article>
              <div className="stat-icon green">✓</div>
              <div>
                <span>Activities verified</span>
                <strong>
                  {verified} <small>/ {rows.length}</small>
                </strong>
                <p>
                  {rows.length ? Math.round((verified / rows.length) * 100) : 0}
                  % of selected records
                </p>
              </div>
            </article>
            <article>
              <div className="stat-icon gold">◈</div>
              <div>
                <span>Harvest recorded</span>
                <strong>
                  {rows
                    .filter((r) => r.type === "Harvesting")
                    .reduce((n, r) => n + r.value, 0)
                    .toFixed(1)}{" "}
                  <small>t</small>
                </strong>
                <p>Field activity records</p>
              </div>
            </article>
            <article>
              <div className="stat-icon blue">⌖</div>
              <div>
                <span>Blocks with activity</span>
                <strong>
                  {new Set(rows.map((r) => r.estateId + "::" + r.block)).size}{" "}
                  <small>/ {blocks}</small>
                </strong>
                <p>Blocks in selected records</p>
              </div>
            </article>
            <article className="alert-stat">
              <div className="stat-icon amber">!</div>
              <div>
                <span>Needs your attention</span>
                <strong>
                  {pending} <small>to review</small>
                </strong>
                <button
                  className="text-button"
                  onClick={() => dispatch(patch({ review: true }))}
                >
                  Review field alerts ↗
                </button>
              </div>
            </article>
          </section>
          <div className="workspace" id="workspace">
            <section className="map-workspace">
              <div className="map-topbar">
                <div className="tabs">
                  <button className="active">Estate map</button>
                  <button onClick={goHistory}>Time machine</button>
                </div>
                <div className="map-tools">
                  <button
                    disabled={near.length < 2}
                    onClick={() =>
                      dispatch(
                        patch({
                          compare: s.compare
                            ? null
                            : near[
                                Math.max(
                                  0,
                                  near.findIndex(
                                    (x) => x.id === images[0]?.id
                                  ) - 1
                                )
                              ]?.id,
                          base: "satellite",
                        })
                      )
                    }
                  >
                    {s.compare ? "Exit comparison" : "◫ Compare images"}
                  </button>
                </div>
              </div>
              <MapView
                rows={rows}
                onRecord={onRecord}
                onImport={() => setDialog({ type: "import" })}
                onOffline={() => setDialog({ type: "offline" })}
              />
              {s.compare && (
                <div className="compare-options">
                  <label>
                    Compare image
                    <select
                      aria-label="Comparison acquisition date"
                      value={s.compare}
                      onChange={(e) =>
                        dispatch(patch({ compare: e.target.value }))
                      }
                    >
                      {near.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>Activities remain on {label(s.date)}</span>
                </div>
              )}
              <Timeline />
            </section>
            <aside className="activity-panel">
              <div className="activity-header">
                <div>
                  <div className="eyebrow">FIELD OPERATIONS</div>
                  <h2>
                    {s.activity === "all" ? "On the ground" : s.activity}{" "}
                    <span>{rows.length}</span>
                  </h2>
                </div>
                <button
                  aria-label="Reset activity filters"
                  onClick={() =>
                    dispatch(
                      patch({ activity: "all", block: "all", review: false })
                    )
                  }
                >
                  ↻
                </button>
              </div>
              <label className="activity-filter">
                Activity
                <select
                  value={s.activity}
                  onChange={(e) =>
                    dispatch(patch({ activity: e.target.value }))
                  }
                >
                  <option value="all">All activities</option>
                  {Object.keys(types).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <div className="activity-status">
                <button
                  className={!s.review ? "active" : ""}
                  onClick={() => dispatch(patch({ review: false }))}
                >
                  All activity
                </button>
                <button
                  className={s.review ? "active" : ""}
                  onClick={() => dispatch(patch({ review: true }))}
                >
                  To verify <span>{pending}</span>
                </button>
              </div>
              <div id="activityImageContext">
                <div className="context-image-heading">
                  <b>Imagery near {label(s.date, false)}</b>
                  <small>Satellite context · field photos not attached</small>
                </div>
                <div className="context-image-grid">
                  {images.map((a) => (
                    <button
                      className="context-image selected"
                      key={a.id}
                      onClick={() =>
                        dispatch(patch({ override: a.id, base: "satellite" }))
                      }
                    >
                      <Thumbnail asset={a} />
                      <span>
                        <b>{label(a.acquiredAt)}</b>
                        <small>
                          {a.resolution
                            ? a.resolution + " m pixels"
                            : "Estate image"}
                        </small>
                        <small>
                          {a.cloudPercent != null
                            ? "Cloud / shadow " + a.cloudPercent + "%"
                            : ""}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                {!images.length && (
                  <p>No earlier image available for this date.</p>
                )}
              </div>
              <div id="activityList">
                {rows
                  .slice()
                  .sort((a, b) => b.observed_at.localeCompare(a.observed_at))
                  .map((r) => (
                    <button
                      className="activity-item"
                      key={r.id}
                      onClick={() => onRecord(r)}
                    >
                      <span
                        className="activity-badge"
                        style={{
                          background: types[r.type]?.bg,
                          color: types[r.type]?.color,
                        }}
                      >
                        {types[r.type]?.icon}
                      </span>
                      <span className="activity-text">
                        <time>{r.time}</time>
                        <strong>{r.type}</strong>
                        <p>
                          {estates.length > 1
                            ? estates.find((e) => e.id === r.estateId)?.name +
                              " · "
                            : ""}
                          {r.block} · {r.quantity}
                        </p>
                        <small className="record-date">{label(r.date)}</small>
                        <small className={r.status}>
                          {r.status === "verified"
                            ? "✓ Verified"
                            : r.status === "alert"
                            ? "! Needs attention"
                            : "◷ Awaiting verification"}
                        </small>
                      </span>
                    </button>
                  ))}
                {!rows.length && (
                  <div className="empty">No activity for this selection.</div>
                )}
              </div>
            </aside>
          </div>
          <div className="bottom-strip">
            <span>
              {estates.map((e) => e.name).join(" · ")} · DigitalPalm Estate
              Atlas
            </span>
            <button onClick={() => setDialog({ type: "import" })}>
              Import a map or image ↗
            </button>
          </div>
        </main>
      </div>
      {dialog && (
        <Dialogs
          mode={dialog}
          onClose={() => setDialog(null)}
          onReload={reload}
          onHistory={(r) => {
            dispatch(
              patch({
                activity: r.type,
                block: r.estateId + "::" + r.block,
                date: r.date,
                period: "day",
              })
            );
            setDialog(null);
            goHistory();
          }}
        />
      )}
    </>
  );
}
