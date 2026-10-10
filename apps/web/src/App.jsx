import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  signedOut,
  loaded,
  patch,
  workspaceLoaded,
  assetsLoaded,
  rowsLoaded,
  estateLoadFailed,
  estateMapReady,
} from "./store";
import {
  localSignIn,
  signOut,
  getSnapshot,
  setToken,
  clearOffline,
  thumbnailBlob,
  api,
  queryData,
} from "./api";
import {
  label,
  records,
  buckets,
  types,
  imagesAt,
  addDays,
} from "../../../packages/shared/timeline";
import SummaryCards from "./components/SummaryCards";
import { dashboardCardState } from "../../../packages/shared/dashboard-summary.js";
import SignIn from "./components/SignIn";
import EstatePicker from "./components/EstatePicker";
import GlobalBrandLogo from "./components/GlobalBrandLogo";
const loadMapView = () => import("./components/MapView");
const MapView = lazy(loadMapView);
import Timeline from "./components/Timeline";
import Dialogs from "./components/Dialogs";
import Storage from "./components/Storage";
import DataTables, { BlockInformation } from "./components/DataTables";
import ProductionDashboard from './components/ProductionDashboard';
import WagesDashboard from './components/WagesDashboard';
import {
  activityName,
  recordKey,
  compareMapRecords,
} from "../../../packages/shared/mapped-records.js";
function errorMessage(error) {
  const detail = error.response?.data?.error;
  return (
    (typeof detail === "string" ? detail : detail?.desc || detail?.message) ||
    error.message ||
    "Unable to load the workspace."
  );
}
function Thumbnail({ asset }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true,
      obj;
    thumbnailBlob(asset)
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
  const [searchParams, setSearchParams] = useSearchParams();
  const dataView = searchParams.get("view") === "data";
  const storageView = searchParams.get("view") === "storage";
  const openMap = () => setSearchParams({});
  const openData = () => setSearchParams({ view: "data" });
  const s = useSelector((s) => s),
    dispatch = useDispatch(),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState(null),
    [mapRecord, setMapRecord] = useState(null),
    [productionHighlights, setProductionHighlights] = useState([]),
    [dashboardTab, setDashboardTab] = useState("production"),
    [mapPaging, setMapPaging] = useState({ key: "", cursors: [undefined] }),
    [token, setInputToken] = useState("");
  const reload = useCallback(async () => {
    const data = await getSnapshot();
    dispatch(loaded(data));
    setError("");
  }, [dispatch]);
  useEffect(() => {
    const expire = () => {
      dispatch(signedOut());
      setDialog(null);
      setError("Your session has ended. Sign in to continue.");
    };
    window.addEventListener("mapping-session-expired", expire);
    window.addEventListener("mapping-signed-out", expire);
    return () => {
      window.removeEventListener("mapping-session-expired", expire);
      window.removeEventListener("mapping-signed-out", expire);
    };
  }, [dispatch]);
  useEffect(() => {
    reload().catch((e) => setError(errorMessage(e)));
  }, [reload]);
  useEffect(() => {
    document.body.classList.toggle("topography-mode", s.base === "topography");
    return () => document.body.classList.remove("topography-mode");
  }, [s.base]);
  useEffect(() => {
    setMapRecord(null);
    if (s.selected[0]) setError("");
  }, [s.selected[0]]);
  const current =
    s.period === "all"
      ? null
      : buckets(s.date, s.period === "all" ? "month" : s.period, 1)[0];
  const rows = useMemo(
    () =>
      s.data?.paged && !s.data.offline
        ? s.mapRows || []
        : s.data
        ? records(s.data, s.selected, {
            activity: s.activity,
            mapVisibility: s.mapVisibility,
            mappedOnly: true,
            block: s.block,
            bucket: current,
            review: s.review,
          })
        : [],
    [
      s.data,
      s.mapRows,
      s.selected,
      s.activity,
      s.mapVisibility,
      s.block,
      s.date,
      s.period,
      s.review,
    ]
  );
  const mapParams = {
    estates: s.selected.join(","),
    mappedOnly: "true",
    mapMode: "records",
    limit: 100,
    activity: s.activity,
    mapVisibility: s.mapVisibility,
    block: s.block,
    review: String(s.review),
    ...(current ? { from: current.start, to: current.end } : {}),
  };
  const mapKey = JSON.stringify(mapParams);
  const pageKey = JSON.stringify([mapKey, s.data?.refresh]);
  const pageCursors =
    mapPaging.key === pageKey ? mapPaging.cursors : [undefined];
  const mapCursor = pageCursors.at(-1);
  const dashboardKey = JSON.stringify([pageKey, mapCursor]);
  const estateRequest = { estateId: s.selected[0], refresh: s.data?.refresh };
  const failEstateLoad = (e) =>
    dispatch(estateLoadFailed({ ...estateRequest, message: errorMessage(e) }));
  useEffect(() => {
    if (s.data && !dataView && !storageView) loadMapView().catch(() => {});
  }, [Boolean(s.data), dataView, storageView]);
  useEffect(() => {
    if (!s.data?.paged || s.data.offline) return;
    const controller = new AbortController();
    api
      .get("/workspace", {
        params: { estates: s.selected.join(",") },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        dispatch(workspaceLoaded({ ...estateRequest, data }));
      })
      .catch((e) => {
        if (e.code !== "ERR_CANCELED" && !controller.signal.aborted) {
          failEstateLoad(e);
          setError(errorMessage(e));
        }
      });
    return () => controller.abort();
  }, [s.selected.join(","), s.data?.refresh]);
  useEffect(() => {
    if (!s.data?.paged || s.data.offline || dataView || storageView) return;
    const controller = new AbortController();
    dispatch(
      patch({
        mapLoading: true,
        dashboard: null,
        mapRows: [],
        dashboardError: "",
      })
    );
    queryData(
      "/dashboard",
      { ...mapParams, cursor: mapCursor },
      { signal: controller.signal }
    )
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        dispatch(
          rowsLoaded({
            ...estateRequest,
            patch: {
              dashboard: data,
              dashboardKey,
              mapRows: data.rows,
              mapQuery: mapParams,
              mapLoading: false,
            },
          })
        );
        setError("");
      })
      .catch((e) => {
        if (e.code !== "ERR_CANCELED" && !controller.signal.aborted) {
          setError(errorMessage(e));
          dispatch(
            patch({
              mapLoading: false,
              dashboardError: errorMessage(e),
              dashboardKey,
            })
          );
        }
      });
    return () => controller.abort();
  }, [mapKey, mapCursor, s.data?.refresh, dataView, storageView]);
  useEffect(() => {
    if (!s.data?.paged || s.data.offline) return;
    const controller = new AbortController();
    api
      .get("/map-assets", {
        params: {
          estates: s.selected.join(","),
          at: s.date,
          ids: [s.override, s.compare].filter(Boolean).join(","),
        },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted)
          dispatch(assetsLoaded({ ...estateRequest, data }));
      })
      .catch((e) => {
        if (e.code !== "ERR_CANCELED" && !controller.signal.aborted) {
          setError(errorMessage(e));
        }
      });
    return () => controller.abort();
  }, [
    s.selected.join(","),
    s.date,
    s.override,
    s.compare,
    s.data?.refresh,
    dataView,
    storageView,
  ]);
  const onRecord = useCallback((record) => {
    setMapRecord({
      estateId: record.estateId,
      recordKey: recordKey(record),
      requestedAt: Date.now(),
    });
    document
      .getElementById("estateMap")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const displayRows = useMemo(() => {
    if (s.data?.paged && !s.data.offline) return rows;
    const ordered = [...rows].sort(compareMapRecords);
    const offset = (pageCursors.length - 1) * 100;
    return ordered.slice(offset, offset + 100);
  }, [rows, mapCursor, s.data?.paged, s.data?.offline]);
  if (!s.data && localSignIn && error)
    return (
      <SignIn
        message={error}
        onSignedIn={reload}
        onRetry={() => reload().catch((e) => setError(errorMessage(e)))}
      />
    );
  if (!s.data)
    return (
      <main className="startup">
        <img src={import.meta.env.BASE_URL + "icon.svg"} width="60" />
        <h1>Estate Atlas</h1>
        <p>{error || "Loading your estate workspace…"}</p>
        {error && (
          <>
            {import.meta.env.VITE_AGRINEXUS_SESSION === "true" && (
              <p>
                <a className="button primary" href="/login">
                  Sign in to AgriNexus
                </a>
                <br />
                Then return to Estate Atlas.
              </p>
            )}
            <button
              className="button"
              onClick={() => reload().catch((e) => setError(errorMessage(e)))}
            >
              Retry connection
            </button>
            {import.meta.env.VITE_AGRINEXUS_SESSION !== "true" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await clearOffline();
                  setToken(token);
                  reload().catch((e) => setError(errorMessage(e)));
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
            )}
          </>
        )}
      </main>
    );
  const estates = s.data.estates.filter((e) => s.selected.includes(e.id));
  const all = records(s.data, s.selected, {
    activity: s.activity,
    mapVisibility: s.mapVisibility,
    mappedOnly: true,
    block: s.block,
    bucket: current,
  });
  const cardState = dashboardCardState({
    online: s.data.paged && !s.data.offline,
    expectedKey: dashboardKey,
    responseKey: s.dashboardKey,
    loading: s.mapLoading,
    error: s.dashboardError,
    summary: s.dashboard?.selectionSummary,
    offlineRows: all,
  });
  const recordCount =
    s.data.paged && !s.data.offline
      ? s.dashboard?.summary.count || 0
      : rows.length;
  const pending = cardState.summary?.pending;
  const assets = s.data.paged ? s.mapAssets || [] : s.data.assets;
  const scope = [
    estates.map((e) => e.name).join(", ") || "No estates selected",
    current
      ? s.period === "day"
        ? label(current.start)
        : `${label(current.start)} – ${label(addDays(current.end, -1))}`
      : "All recorded dates",
    s.block === "all" ? "Mapped blocks" : s.block.split("::")[1],
    s.activity === "all" ? "All activity types" : s.activity,
    s.mapVisibility.mode === "include"
      ? `${
          s.mapVisibility.fields.length + Number(s.mapVisibility.harvesting)
        } activities selected`
      : s.mapVisibility.fields.length || !s.mapVisibility.harvesting
      ? `${
          s.mapVisibility.fields.length + Number(!s.mapVisibility.harvesting)
        } activities hidden`
      : "All activities selected",
  ].join(" · ");
  const images = imagesAt(assets, s.selected, s.date, s.override),
    near = assets
      .filter((a) => s.selected.includes(a.estateId) && a.kind === "imagery")
      .sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));
  const goHistory = () => {
    setDashboardTab("operations");
    openMap();
    requestAnimationFrame(() =>
      document
        .getElementById("map-dashboard-tabs")
        ?.scrollIntoView({ behavior: "smooth" })
    );
  };
  const selectBlock = (b) => {
    dispatch(patch({ selectedBlock: `${b.estateId}::${b.blockCode}` }));
    setDialog(null);
    openMap();
  };
  const showHistory = (r) => {
    dispatch(
      patch({
        activity: r.type,
        mapVisibility: {
          mode: "include",
          fields:
            r.type === "Harvesting" ? [] : [r.activityDescription || r.type],
          harvesting: r.type === "Harvesting",
        },
        selectedBlock: null,
        block: `${r.estateId}::${r.block}`,
        date: r.date,
        period: "day",
        override: null,
        review: false,
      })
    );
    setDialog(null);
    goHistory();
  };
  return (
    <>
      <aside className="rail">
        <GlobalBrandLogo />
        <a className="brand map-brand" href="#" aria-label="DigitalPalm home">
          <img src={import.meta.env.BASE_URL + "icon.svg"} alt="" />
        </a>
        <div className="rail-divider" />
        <button
          className="nav-icon"
          title="Map workspace"
          onClick={() => {
            openMap();
            requestAnimationFrame(() =>
              document
                .getElementById("workspace")
                ?.scrollIntoView({ behavior: "smooth" })
            );
          }}
        >
          ◈
        </button>
        <button
          className={"nav-icon data-nav " + (dataView ? "active" : "")}
          title="Data tables"
          aria-label="Data tables"
          onClick={openData}
        >
          ▤<small>Data</small>
        </button>
        <button
          className={"nav-icon data-nav " + (storageView ? "active" : "")}
          title="Image storage"
          aria-label="Image storage"
          onClick={() => setSearchParams({ view: "storage" })}
        >
          ▣<small>Storage</small>
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
          <div className="breadcrumb">
            Workspace / Estate Atlas{dataView ? " / Data tables" : ""}
          </div>
          <div className="header-right">
            <span className="today">
              {s.data.offline ? "OFFLINE" : "CONNECTED"} ·{" "}
              {s.data.access.role.toUpperCase()}
            </span>
            {localSignIn && (
              <button
                className="button"
                onClick={() =>
                  signOut().catch((e) => setError(errorMessage(e)))
                }
              >
                Sign out
              </button>
            )}
          </div>
        </header>
        <main>
          <div className="page-title">
            <div>
              <div className="eyebrow">GEOSPATIAL COMMAND CENTER</div>
              <h1>
                {storageView
                  ? "Your image storage."
                  : dataView
                  ? "Your estate data."
                  : "Your estate. Every day."}
              </h1>
              <p>
                {storageView
                  ? "Review image usage and manage retention for your estates."
                  : dataView
                  ? "Monthly production, block history, parameters and field records."
                  : "One view of your land, your people, and the work getting done."}
              </p>
            </div>
            <div className="title-actions">
              {dataView && (
                <button className="button" onClick={openMap}>
                  ◈ Back to map
                </button>
              )}
              {!dataView && !storageView && (
                <>
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
                </>
              )}
            </div>
          </div>
          <EstatePicker onAdd={() => setDialog({ type: "estate" })} />
          {!estates.length && (
            <div className="callout">
              Add an estate to begin, or import the existing Estate Atlas data
              using the setup command.
            </div>
          )}
          {error && (
            <div className="callout" role="alert">
              {error}
            </div>
          )}
          {storageView && <Storage key={s.selected[0]} onReload={reload} />}
          {dataView && (
            <section className="data-workspace">
              <DataTables
                key={s.selected.join(",")}
                productionEstateId={!s.data.offline?s.selected[0]:null}
                initialTab={['monthly','parameters','names','yearly','wages'].includes(searchParams.get('tab'))?searchParams.get('tab'):'blocks'}
                role={s.data.access.role}
                server={s.data.paged ? { estates: s.selected.join(",") } : null}
                blocks={(s.data.blocks || []).filter((b) =>
                  s.selected.includes(b.estateId)
                )}
                rows={s.data.activities.filter((r) =>
                  s.selected.includes(r.estateId)
                )}
                onSelectBlock={selectBlock}
                onHistory={showHistory}
              />
            </section>
          )}
          {!dataView && !storageView && (
            <div>
              <SummaryCards
                state={cardState}
                scope={scope}
                offline={s.data.offline}
                onReview={() => dispatch(patch({ review: true }))}
              />
              {s.mapLoading && (
                <p role="status">Loading selected activity window…</p>
              )}
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
                  <BlockInformation
                    blocks={s.data.blocks || []}
                    estates={estates}
                    selection={
                      s.selectedBlock || (s.block !== "all" ? s.block : null)
                    }
                    onClose={() =>
                      dispatch(patch({ selectedBlock: null, block: "all" }))
                    }
                  />
                  <Suspense
                    fallback={
                      <div
                        className="map-stage estate-map-loading"
                        role="status"
                      >
                        Loading map viewer…
                      </div>
                    }
                  >
                    {estateMapReady(s) ? (
                      <MapView
                        key={s.selected[0]}
                        productionHighlights={productionHighlights}
                        rows={displayRows}
                        pageOffset={(pageCursors.length - 1) * 100}
                        requestedRecord={
                          mapRecord?.estateId === s.selected[0]
                            ? mapRecord
                            : null
                        }
                        onImport={() => setDialog({ type: "import" })}
                        onOffline={() => setDialog({ type: "offline" })}
                      />
                    ) : (
                      <div
                        className="map-stage estate-map-loading"
                        role="status"
                        aria-busy={!s.estateLoadError}
                      >
                        {s.estateLoadError ? (
                          <>
                            <p>
                              Could not load this estate’s map.{" "}
                              {s.estateLoadError}
                            </p>
                            <button
                              className="button"
                              onClick={() =>
                                reload().catch((e) => setError(errorMessage(e)))
                              }
                            >
                              Retry map
                            </button>
                          </>
                        ) : (
                          <p>Loading {estates[0]?.name || "estate"} map…</p>
                        )}
                      </div>
                    )}
                  </Suspense>
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
                  <div className="map-dashboard-tabs" id="map-dashboard-tabs" role="tablist" aria-label="Map dashboard"
                    onKeyDown={e=>{
                      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
                      e.preventDefault();
                      const order=['production','operations','wages'];
                      const next=e.key==='Home'?order[0]:e.key==='End'?order[2]:order[(order.indexOf(dashboardTab)+(e.key==='ArrowRight'?1:2))%3];
                      setDashboardTab(next);
                      document.getElementById('dashboard-tab-'+next)?.focus();
                    }}>
                    {['production','operations','wages'].map(tab=><button key={tab} type="button" role="tab" id={'dashboard-tab-'+tab}
                      aria-selected={dashboardTab===tab} aria-controls={'dashboard-panel-'+tab} tabIndex={dashboardTab===tab?0:-1}
                      onClick={()=>setDashboardTab(tab)}>{tab==='production'?'Production':tab==='operations'?'Operations':'Wages'}</button>)}
                  </div>
                  <div className="map-dashboard-panel" id="dashboard-panel-production" role="tabpanel" aria-labelledby="dashboard-tab-production" hidden={dashboardTab!=='production'}>
                    <ProductionDashboard key={"production-"+s.selected[0]} estateId={s.selected[0]} selection={s.selectedBlock || (s.block !== 'all'?s.block:null)} offline={s.data.offline} onHighlights={setProductionHighlights} onData={()=>setSearchParams({view:'data',tab:'monthly'})}/>
                  </div>
                  <div className="map-dashboard-panel" id="dashboard-panel-operations" role="tabpanel" aria-labelledby="dashboard-tab-operations" hidden={dashboardTab!=='operations'}>
                    {dashboardTab==='operations'&&<Timeline key={s.selected[0]} />}
                  </div>
                  <div className="map-dashboard-panel" id="dashboard-panel-wages" role="tabpanel" aria-labelledby="dashboard-tab-wages" hidden={dashboardTab!=='wages'}>
                    {dashboardTab==='wages'&&<WagesDashboard key={'wages-'+s.selected[0]} estateId={s.selected[0]} selection={s.selectedBlock || (s.block !== 'all'?s.block:null)} offline={s.data.offline} onData={()=>setSearchParams({view:'data',tab:'wages'})}/>}
                  </div>
                </section>
                <aside className="activity-panel">
                  <div className="activity-header">
                    <div>
                      <div className="eyebrow">FIELD OPERATIONS</div>
                      <h2>
                        {s.activity === "all" ? "On the ground" : s.activity}{" "}
                        <span>{recordCount}</span>
                      </h2>
                    </div>
                    <button
                      aria-label="Reset activity filters"
                      onClick={() =>
                        dispatch(
                          patch({
                            activity: "all",
                            mapVisibility: {
                              mode: "exclude",
                              fields: [],
                              harvesting: true,
                            },
                            block: "all",
                            review: false,
                          })
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
                        dispatch(
                          patch({
                            activity: e.target.value,
                          })
                        )
                      }
                    >
                      <option value="all">All activities</option>
                      {(s.data.paged
                        ? ["Harvesting", "Field activity"]
                        : [
                            ...new Set(
                              s.data.activities
                                .filter((r) => s.selected.includes(r.estateId))
                                .map((r) => r.type)
                            ),
                          ]
                      ).map((t) => (
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
                      To verify <span>{pending ?? "—"}</span>
                    </button>
                  </div>
                  <div id="activityImageContext">
                    <div className="context-image-heading">
                      <b>Imagery near {label(s.date, false)}</b>
                      <small>
                        Satellite context · field photos not attached
                      </small>
                    </div>
                    <div className="context-image-grid">
                      {images.map((a) => (
                        <button
                          className="context-image selected"
                          key={a.id}
                          onClick={() =>
                            dispatch(
                              patch({ override: a.id, base: "satellite" })
                            )
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
                    {displayRows.map((r, i) => (
                      <button
                        className="activity-item"
                        key={recordKey(r)}
                        aria-label={`${activityName(r)} · ${r.block} · ${label(
                          r.date
                        )} · ${r.quantity}`}
                        onClick={() => onRecord(r)}
                      >
                        <span
                          className="activity-badge"
                          style={{
                            background: types[r.type]?.bg,
                            color: types[r.type]?.color,
                          }}
                        >
                          {(pageCursors.length - 1) * 100 + i + 1}
                        </span>
                        <span className="activity-text">
                          <strong>{activityName(r)}</strong>
                          <p>
                            {r.block} · {label(r.date)}
                          </p>
                          <small className="record-date">{r.quantity}</small>
                          {estates.length > 1 && (
                            <small>
                              {estates.find((e) => e.id === r.estateId)?.name}
                            </small>
                          )}
                        </span>
                      </button>
                    ))}
                    {!displayRows.length && (
                      <div className="empty">
                        No activity for this selection.
                      </div>
                    )}
                  </div>
                  <div
                    className="map-record-pages"
                    aria-label="Map activity pages"
                  >
                    <span>
                      {displayRows.length
                        ? `${(pageCursors.length - 1) * 100 + 1}–${
                            (pageCursors.length - 1) * 100 + displayRows.length
                          }`
                        : "0"}{" "}
                      of {recordCount.toLocaleString()} activities
                    </span>
                    {(recordCount > 100 || pageCursors.length > 1) && (
                      <>
                        <small>Up to 100 individual bubbles per page</small>
                        <div>
                          <button
                            disabled={s.mapLoading || pageCursors.length === 1}
                            onClick={() =>
                              setMapPaging({
                                key: pageKey,
                                cursors: pageCursors.slice(0, -1),
                              })
                            }
                          >
                            Previous activities
                          </button>
                          <button
                            disabled={
                              s.mapLoading ||
                              (s.data.paged && !s.data.offline
                                ? !s.dashboard?.nextCursor
                                : rows.length <= pageCursors.length * 100)
                            }
                            onClick={() =>
                              setMapPaging({
                                key: pageKey,
                                cursors: [
                                  ...pageCursors,
                                  s.data.paged && !s.data.offline
                                    ? s.dashboard.nextCursor
                                    : String(pageCursors.length),
                                ],
                              })
                            }
                          >
                            Next activities
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          )}
          <div className="bottom-strip">
            <span>
              {estates.map((e) => e.name).join(" · ")} · DigitalPalm Estate
              Atlas
            </span>
            {!dataView && !storageView && (
              <button onClick={() => setDialog({ type: "import" })}>
                Import a map or image ↗
              </button>
            )}
          </div>
        </main>
      </div>
      {dialog && (
        <Dialogs
          key={s.selected[0]}
          mode={dialog}
          onClose={() => setDialog(null)}
          onReload={reload}
          onSelectBlock={selectBlock}
          onHistory={showHistory}
        />
      )}
    </>
  );
}
