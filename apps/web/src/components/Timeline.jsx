import { mappedBlocks } from "../../../../packages/shared/mapped-records.js";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import MapActivityList from "./MapActivityList";
import RemoteTimeline from "./RemoteTimeline";
import { patch } from "../store";
import {
  types,
  label,
  buckets,
  contains,
  addDays,
  records,
} from "../../../../packages/shared/timeline";
function LocalTimeline() {
  const s = useSelector((s) => s),
    dispatch = useDispatch(),
    [anchor, setAnchor] = useState(s.date),
    [playing, setPlaying] = useState(false);
  const history = records(s.data, s.selected, {
    activity: s.activity,
    mapVisibility: s.mapVisibility,
    mappedOnly: true,
    block: s.block,
  });
  const activeTypes = Object.entries(types).filter(([t]) =>
    s.data.activities.some(
      (r) => s.selected.includes(r.estateId) && r.type === t
    )
  );
  const images = s.data.assets.filter(
    (a) => s.selected.includes(a.estateId) && a.kind === "imagery"
  );
  const estateEvents = s.data.estates
    .filter((e) => s.selected.includes(e.id) && e.boundaryDate)
    .map((e) => ({
      id: e.id,
      acquiredAt: e.boundaryDate,
      name: e.name + " boundaries",
      boundary: true,
    }));
  const events = [...images, ...estateEvents];
  const dates = events
    .map((a) => a.acquiredAt)
    .concat(history.map((r) => r.date))
    .sort();
  const last = dates.at(-1) || anchor,
    first = dates[0] || last;
  const count =
    s.period === "all"
      ? Math.max(
          1,
          (+last.slice(0, 4) - +first.slice(0, 4)) * 12 +
            +last.slice(5, 7) -
            +first.slice(5, 7) +
            1
        )
      : 7;
  const windows = buckets(s.period === "all" ? last : anchor, s.period, count);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const i = windows.findIndex((b) => contains(s.date, b));
      dispatch(
        patch({ date: windows[(i + 1) % windows.length].start, override: null })
      );
    }, 1800);
    return () => clearInterval(t);
  }, [playing, s.date, anchor, s.period]);
  useEffect(() => {
    setAnchor(s.date);
  }, [s.date]);
  const choose = (date, activity = s.activity, override = null) => {
    dispatch(
      patch({
        date,
        activity,
        override,
        review: false,
      })
    );
    if (!windows.some((b) => contains(date, b))) setAnchor(date);
  };
  const counts = (t) =>
    records(s.data, s.selected, {
      activity: t,
      block: s.block,
      mapVisibility: s.mapVisibility,
      mappedOnly: true,
    }).length;
  return (
    <section className="timeline" id="timeline">
      <div className="timeline-heading">
        <div>
          <span className="time-icon">◷</span>
          <b>Estate timeline</b>
          <span className="muted">Maps and field work, together</span>
        </div>
        <div className="periods">
          {["day", "week", "month", "year", "all"].map((p) => (
            <button
              key={p}
              className={s.period === p ? "active" : ""}
              onClick={() => dispatch(patch({ period: p }))}
            >
              {p === "all" ? "All dates" : p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="timeline-filter-bar">
        <div id="timelineFilters">
          <MapActivityList />
          {activeTypes
            .map(([t]) => t)
            .map((t) => (
              <button
                className={
                  "history-filter " + (s.activity === t ? "active" : "")
                }
                key={t}
                onClick={() =>
                  choose(
                    records(s.data, s.selected, {
                      activity: t,
                      block: s.block,
                      mapVisibility: s.mapVisibility,
                      mappedOnly: true,
                    })
                      .map((r) => r.date)
                      .sort()
                      .at(-1) || s.date,
                    t
                  )
                }
              >
                {types[t]?.icon || "◷"} {t === "all" ? "All types" : t}{" "}
                <small>{counts(t)}</small>
              </button>
            ))}
        </div>
        <label className="timeline-block-label">
          Block
          <select
            aria-label="Activity history block"
            value={s.block}
            onChange={(e) =>
              dispatch(patch({ block: e.target.value, selectedBlock: null }))
            }
          >
            <option value="all">All blocks</option>
            {s.data.estates
              .filter((e) => s.selected.includes(e.id))
              .map((e) => (
                <optgroup key={e.id} label={e.name}>
                  {(s.data.blocks?.some((b) => b.estateId === e.id)
                    ? mappedBlocks(s.data.blocks, s.data.estates)
                        .filter((b) => b.estateId === e.id)
                        .map((b) => b.blockCode)
                    : e.boundary?.features.map((f) => f.properties.blockName) ||
                      []
                  ).map((code, i) => (
                    <option key={i} value={`${e.id}::${code}`}>
                      {code}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </label>
      </div>
      {s.period !== "all" && (
        <div className="timeline-window">
          <span>Timeline window</span>
          <button
            aria-label="Earlier timeline window"
            onClick={() => setAnchor(addDays(anchor, -7))}
          >
            ‹
          </button>
          <label>
            Ending
            <input
              aria-label="Timeline window end"
              type="date"
              value={anchor}
              onChange={(e) => e.target.value && setAnchor(e.target.value)}
            />
          </label>
          <button
            aria-label="Later timeline window"
            onClick={() => setAnchor(addDays(anchor, 7))}
          >
            ›
          </button>
        </div>
      )}
      <div className="timeline-legends">
        <div className="event-key">
          <span>▧ Image acquired</span>
          <span>▱ Boundary version</span>
        </div>
        <div className="event-key">
          {activeTypes.map(([t, v]) => (
            <span className="activity-key-item" key={t}>
              <span
                className="activity-key-icon"
                style={{ "--event-color": v.color, "--event-bg": v.bg }}
              >
                {v.icon}
              </span>
              {t}
            </span>
          ))}
          <span>Number = records</span>
        </div>
      </div>
      <div
        className="event-scroll"
        tabIndex="0"
        aria-label="Map updates and activities by date"
      >
        <div className="event-grid" style={{ "--columns": windows.length }}>
          <div className="event-row-label corner">Date</div>
          {windows.map((b) => (
            <div
              key={b.start}
              className={"event-date " + (contains(s.date, b) ? "current" : "")}
            >
              <button onClick={() => choose(b.start)}>
                {["all", "month", "year"].includes(s.period)
                  ? b.start.slice(0, s.period === "year" ? 4 : 7)
                  : label(b.start, false)}
              </button>
            </div>
          ))}
          <div className="event-row-label">
            <b>▱ Map updates</b>
            <small>Capture dates</small>
          </div>
          {windows.map((b) => (
            <div key={b.start} className="event-cell map-events">
              {events
                .filter((a) => contains(a.acquiredAt, b))
                .map((a) => (
                  <button
                    title={a.name}
                    key={a.id}
                    className={
                      "event-map-button " +
                      (s.override === a.id ? "selected" : "")
                    }
                    onClick={() =>
                      choose(a.acquiredAt, s.activity, a.boundary ? null : a.id)
                    }
                  >
                    {a.boundary ? "▱" : "▧"} {label(a.acquiredAt, false)}
                  </button>
                ))}
              {!events.some((a) => contains(a.acquiredAt, b)) && (
                <span className="event-empty">—</span>
              )}
            </div>
          ))}
          <div className="event-row-label">
            <b>◷ Activities</b>
            <small>Recorded dates</small>
          </div>
          {windows.map((b) => (
            <div key={b.start} className="event-cell activity-events">
              {activeTypes.map(([t, v]) => {
                const n = history.filter(
                  (r) => r.type === t && contains(r.date, b)
                ).length;
                return n ? (
                  <button
                    key={t}
                    title={`${t}: ${n} records · ${label(b.start)}`}
                    aria-label={`${t}: ${n} records · ${label(b.start)}`}
                    className={
                      "event-activity-button " +
                      (contains(s.date, b) ? "current" : "")
                    }
                    style={{ "--event-color": v.color, "--event-bg": v.bg }}
                    onClick={() => choose(b.start, t)}
                  >
                    <span>{v.icon}</span>
                    <b>{n}</b>
                  </button>
                ) : null;
              })}
              {!history.some((r) => contains(r.date, b)) && (
                <span className="event-empty">—</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="event-notes">
        <span>Images use their acquisition dates.</span>
        <span>— No event recorded</span>
      </div>
      <div className="activity-date-history">
        <b>
          {s.activity === "all" ? "Activity" : s.activity} history ·{" "}
          {history.length} records
        </b>
        <div id="activityDates">
          {[...new Set(history.map((r) => r.date))]
            .sort()
            .reverse()
            .map((d) => (
              <button
                key={d}
                aria-pressed={s.date === d}
                onClick={() => choose(d)}
              >
                {label(d)} <b>{history.filter((r) => r.date === d).length}</b>
              </button>
            ))}
          {!history.length && (
            <span className="history-empty">
              No recorded activity for this selection.
            </span>
          )}
        </div>
      </div>
      <div className="timeline-slider">
        <button
          className="play"
          aria-label={playing ? "Pause history" : "Play history"}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <button
          aria-label="Previous date"
          onClick={() => choose(addDays(s.date, -1))}
        >
          ‹
        </button>
        <input
          aria-label="History date"
          type="range"
          min="0"
          max={Math.max(0, windows.length - 1)}
          value={Math.max(
            0,
            windows.findIndex((b) => contains(s.date, b))
          )}
          onChange={(e) => choose(windows[+e.target.value].start)}
        />
        <button
          aria-label="Next date"
          onClick={() => choose(addDays(s.date, 1))}
        >
          ›
        </button>
        <button
          className="today-button"
          onClick={() =>
            choose(
              history
                .map((r) => r.date)
                .sort()
                .at(-1) || last
            )
          }
        >
          Latest
        </button>
      </div>
      <div className="timeline-footer">
        <span>
          {s.data.offline ? "Saved offline data" : "Stored estate records"}
        </span>
        <span>{label(s.date)}</span>
      </div>
    </section>
  );
}

export default function Timeline() {
  const data = useSelector((s) => s.data);
  return data.paged && !data.offline ? <RemoteTimeline /> : <LocalTimeline />;
}
