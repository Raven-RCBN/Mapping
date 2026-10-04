import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import DataTables, { BlockInformation } from "./components/DataTables";
import {
  activityGroups,
  groupSummary,
} from "../../../packages/shared/activities.js";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const dataView = searchParams.get("view") === "data";
  const openMap = () => setSearchParams({});
  const openData = () => setSearchParams({ view: "data" });
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
    reload().catch((e) => setError(errorMessage(e)));
  }, [reload]);
  const current =
    s.period === "all"
      ? null
      : buckets(s.date, s.period === "all" ? "month" : s.period, 1)[0];
  const rows = useMemo(
    () =>
      s.data
        ? records(s.data, s.selected, {
            activity: s.activity,
            fieldActivity: s.fieldActivity,
            block: s.block,
            bucket: current,
            review: s.review,
          })
        : [],
    [
      s.data,
      s.selected,
      s.activity,
      s.fieldActivity,
      s.block,
      s.date,
      s.period,
      s.review,
    ]
  );
  const onRecord = useCallback(
    (record) =>
      setDialog(
        record.rows
          ? { type: "records", group: record }
          : { type: "record", record }
      ),
    []
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
  const estates = s.data.estates.filter((e) => s.selected.includes(e.id)),
    blocks = estates.reduce(
      (n, e) => n + (e.boundary?.features?.length || 0),
      0
    ),
    verified = rows.filter((r) => r.status === "verified").length;
  const all = records(s.data, s.selected, {
      activity: s.activity,
      fieldActivity: s.fieldActivity,
      block: s.block,
      bucket: current,
    }),
    pending = all.filter((r) => r.status !== "verified").length;
  const images = imagesAt(s.data.assets, s.selected, s.date, s.override),
    near = s.data.assets
      .filter((a) => s.selected.includes(a.estateId) && a.kind === "imagery")
      .sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));
  const goHistory = () => {
    openMap();
    requestAnimationFrame(() =>
      document
        .getElementById("timeline")
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
        fieldActivity: r.activityDescription || "all",
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
          </div>
        </header>
        <main>
          <div className="page-title">
            <div>
              <div className="eyebrow">GEOSPATIAL COMMAND CENTER</div>
              <h1>
                {dataView ? "Your estate data." : "Your estate. Every day."}
              </h1>
              <p>
                {dataView
                  ? "Block information, harvesting and field work in separate grids."
                  : "One view of your land, your people, and the work getting done."}
              </p>
            </div>
            <div className="title-actions">
              {dataView && (
                <button className="button" onClick={openMap}>
                  ◈ Back to map
                </button>
              )}
              {!dataView && (
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
          {dataView && (
            <section className="data-workspace">
              <DataTables
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
          {!dataView && (
            <div>
              <section className="stats">
                <article>
                  <div className="stat-icon green">✓</div>
                  <div>
                    <span>Activities verified</span>
                    <strong>
                      {verified} <small>/ {rows.length}</small>
                    </strong>
                    <p>
                      {rows.length
                        ? Math.round((verified / rows.length) * 100)
                        : 0}
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
                        .filter((r) => r.recordKind === "harvesting")
                        .reduce((n, r) => n + r.value, 0)
                        .toLocaleString()}{" "}
                      <small>bunches</small>
                    </strong>
                    <p>Selected harvesting records</p>
                  </div>
                </article>
                <article>
                  <div className="stat-icon blue">⌖</div>
                  <div>
                    <span>Field work</span>
                    <strong>
                      {rows
                        .filter((r) => r.recordKind === "field")
                        .reduce((n, r) => n + r.mandays, 0)
                        .toLocaleString()}{" "}
                      <small>mandays</small>
                    </strong>
                    <p>Selected field-activity records</p>
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
                          patch({
                            activity: "all",
                            fieldActivity: "all",
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
                            fieldActivity: "all",
                          })
                        )
                      }
                    >
                      <option value="all">All activities</option>
                      {[
                        ...new Set(
                          s.data.activities
                            .filter((r) => s.selected.includes(r.estateId))
                            .map((r) => r.type)
                        ),
                      ].map((t) => (
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
                    {activityGroups(rows)
                      .slice()
                      .sort((a, b) =>
                        b.rows.at(-1).date.localeCompare(a.rows.at(-1).date)
                      )
                      .map((r) => (
                        <button
                          className="activity-item"
                          key={r.id}
                          onClick={() => onRecord(r)}
                        >
                          <span
                            className="activity-badge"
                            style={{
                              background: types[r.rows[0].type]?.bg,
                              color: types[r.rows[0].type]?.color,
                            }}
                          >
                            {types[r.rows[0].type]?.icon}
                          </span>
                          <span className="activity-text">
                            <strong>
                              {r.block} · {r.rows.length} records
                            </strong>
                            <p>
                              {estates.length > 1
                                ? estates.find((e) => e.id === r.estateId)
                                    ?.name + " · "
                                : ""}
                              {groupSummary(r)}
                            </p>
                            <small className="record-date">
                              {[...new Set(r.rows.map((x) => x.type))].join(
                                " · "
                              )}
                            </small>
                            <small>
                              {r.geolocation
                                ? "Exact GPS"
                                : s.data.blocks?.find((b) => b.id === r.blockId)
                                    ?.mapBlockNames?.length
                                ? "Inside matched block"
                                : "Map match pending"}
                            </small>
                          </span>
                        </button>
                      ))}
                    {!rows.length && (
                      <div className="empty">
                        No activity for this selection.
                      </div>
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
            {!dataView && (
              <button onClick={() => setDialog({ type: "import" })}>
                Import a map or image ↗
              </button>
            )}
          </div>
        </main>
      </div>
      {dialog && (
        <Dialogs
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
