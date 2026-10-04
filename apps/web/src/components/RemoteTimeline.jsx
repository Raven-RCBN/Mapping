import { mappedBlocks } from "../../../../packages/shared/mapped-records.js";
import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import MapActivityList from "./MapActivityList";
import { queryData } from "../api";
import { patch } from "../store";
import {
  types,
  label,
  contains,
  buckets,
  addDays,
} from "../../../../packages/shared/timeline.js";

export default function RemoteTimeline() {
  const s = useSelector((x) => x),
    dispatch = useDispatch();
  const [anchor, setAnchor] = useState(s.date),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [before, setBefore] = useState(null),
    [playing, setPlaying] = useState(false),
    [jumpToLatest, setJumpToLatest] = useState(false);
  const windows = buckets(anchor, s.period, s.period === "all" ? 12 : 7);
  const params = {
    estates: s.selected.join(","),
    mappedOnly: "true",
    activity: s.activity,
    mapVisibility: s.mapVisibility,
    block: s.block,
    anchor,
    period: s.period,
    ...(before ? { before } : {}),
  };
  const key = JSON.stringify(params);
  useEffect(() => {
    setAnchor(s.date);
  }, [s.date]);
  useEffect(() => {
    setBefore(null);
  }, [s.selected.join(","), s.activity, s.mapVisibility, s.block]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    queryData("/timeline", params, { signal: controller.signal })
      .then(({ data }) => setData({ ...data, requestKey: key }))
      .catch((e) => {
        if (e.code !== "ERR_CANCELED")
          setError(e.response?.data?.error || e.message);
      });
    return () => controller.abort();
  }, [key, s.data.refresh]);
  useEffect(() => {
    if (!jumpToLatest || !data || data.requestKey !== key) return;
    const last = data.series
      .map((r) => r.totals.last)
      .filter(Boolean)
      .sort()
      .at(-1);
    setJumpToLatest(false);
    if (last) dispatch(patch({ date: last, override: null }));
  }, [data, key, jumpToLatest]);
  useEffect(() => {
    if (!playing || !data) return;
    const timer = setInterval(() => {
      const index = windows.findIndex((w) => contains(s.date, w));
      dispatch(
        patch({
          date: windows[(index + 1) % windows.length].start,
          override: null,
        })
      );
    }, 1800);
    return () => clearInterval(timer);
  }, [playing, s.date, key, data]);
  const choose = (date, activity = s.activity, override = null) =>
    dispatch(patch({ date, activity, override, review: false }));
  const total = data?.series.reduce((n, r) => n + r.totals.count, 0) || 0;
  const kindType = (k) =>
    k === "harvesting" ? "Harvesting" : "Field activity";
  const events = [
    ...(data?.assets || []),
    ...s.data.estates
      .filter((e) => s.selected.includes(e.id) && e.boundaryDate)
      .map((e) => ({
        id: e.id,
        name: e.name + " boundaries",
        acquiredAt: e.boundaryDate,
        boundary: true,
      })),
  ];
  const shift = (n) => {
    if (n > 0) {
      const d = new Date(windows.at(-1).start + "T00:00:00Z");
      if (["all", "month"].includes(s.period))
        d.setUTCMonth(d.getUTCMonth() + windows.length);
      else if (s.period === "year")
        d.setUTCFullYear(d.getUTCFullYear() + windows.length);
      else
        d.setUTCDate(
          d.getUTCDate() + windows.length * (s.period === "week" ? 7 : 1)
        );
      return setAnchor(d.toISOString().slice(0, 10));
    }
    setAnchor(addDays(windows[0].start, -1));
  };
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
              {p === "all" ? "History" : p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="timeline-filter-bar">
        <div id="timelineFilters">
          <MapActivityList />
          {["Harvesting", "Field activity"].map((t) => (
            <button
              key={t}
              className={"history-filter " + (s.activity === t ? "active" : "")}
              onClick={() => {
                setJumpToLatest(true);
                dispatch(patch({ activity: t, override: null }));
              }}
            >
              {types[t]?.icon || "◷"} {t === "all" ? "All types" : t}
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
            {mappedBlocks(s.data.blocks, s.data.estates).map((b) => (
              <option key={b.id} value={`${b.estateId}::${b.blockCode}`}>
                {b.blockCode}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="timeline-window">
        <span>
          {s.period === "all" ? "12-month history window" : "Timeline window"}
        </span>
        <button aria-label="Earlier timeline window" onClick={() => shift(-1)}>
          ‹
        </button>
        <label>
          Ending
          <input
            aria-label="Timeline window end"
            type="date"
            onInput={(e) =>
              e.currentTarget.value && setAnchor(e.currentTarget.value)
            }
            value={anchor}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
          />
        </label>
        <button aria-label="Later timeline window" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="timeline-legends">
        <div className="event-key">
          <span>▧ Image acquired</span>
          <span>▱ Boundary version</span>
          <span>✦ Harvesting</span>
          <span>⌁ Field activity</span>
          <span>Number = records</span>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading timeline…</p>}
      {data && (
        <>
          <div
            className="event-scroll"
            tabIndex="0"
            aria-label="Map updates and activities by date"
          >
            <div className="event-grid" style={{ "--columns": windows.length }}>
              <div className="event-row-label corner">Date</div>
              {windows.map((w) => (
                <div
                  key={w.start}
                  className={
                    "event-date " + (contains(s.date, w) ? "current" : "")
                  }
                >
                  <button onClick={() => choose(w.start)}>
                    {["all", "month", "year"].includes(s.period)
                      ? w.start.slice(0, s.period === "year" ? 4 : 7)
                      : label(w.start, false)}
                  </button>
                </div>
              ))}
              <div className="event-row-label">
                <b>▱ Map updates</b>
                <small>Capture dates</small>
              </div>
              {windows.map((w) => (
                <div key={w.start} className="event-cell map-events">
                  {events
                    .filter((a) => contains(a.acquiredAt, w))
                    .map((a) => (
                      <button
                        title={a.name}
                        key={a.id}
                        className={
                          "event-map-button " +
                          (s.override === a.id ? "selected" : "")
                        }
                        onClick={() =>
                          choose(
                            a.acquiredAt,
                            s.activity,
                            a.boundary ? null : a.id
                          )
                        }
                      >
                        {a.boundary ? "▱" : "▧"} {label(a.acquiredAt, false)}
                      </button>
                    ))}
                  {!events.some((a) => contains(a.acquiredAt, w)) && (
                    <span className="event-empty">—</span>
                  )}
                </div>
              ))}
              <div className="event-row-label">
                <b>◷ Activities</b>
                <small>Recorded dates</small>
              </div>
              {windows.map((w, i) => (
                <div key={w.start} className="event-cell activity-events">
                  {data.series.map((r) => {
                    const n = r.windows.find((x) => x._id === i)?.count || 0,
                      t = kindType(r.kind),
                      v = types[t];
                    return n ? (
                      <button
                        key={t}
                        title={`${t}: ${n} records · ${label(w.start)}`}
                        aria-label={`${t}: ${n} records · ${label(w.start)}`}
                        className={
                          "event-activity-button " +
                          (contains(s.date, w) ? "current" : "")
                        }
                        style={{ "--event-color": v.color, "--event-bg": v.bg }}
                        onClick={() => choose(w.start, t)}
                      >
                        <span>{v.icon}</span>
                        <b>{n}</b>
                      </button>
                    ) : null;
                  })}
                  {!data.series.some((r) =>
                    r.windows.some((x) => x._id === i)
                  ) && <span className="event-empty">—</span>}
                </div>
              ))}
            </div>
          </div>
          {data.assetsLimited && (
            <p className="callout">
              Showing the newest 200 image events in this window. Narrow the
              timeline to see the others.
            </p>
          )}

          <div className="event-notes">
            <span>Images use their acquisition dates.</span>
            <span>— No event recorded</span>
          </div>
          <div className="activity-date-history">
            <b>
              {s.activity === "all" ? "Activity" : s.activity} history ·{" "}
              {total.toLocaleString()} records
            </b>
            <div id="activityDates">
              {data.days.map((d) => (
                <button
                  key={d.date}
                  aria-pressed={s.date === d.date}
                  onClick={() => choose(d.date)}
                >
                  {label(d.date)} <b>{d.count}</b>
                </button>
              ))}
              {!data.days.length && (
                <span>No recorded activity for this selection.</span>
              )}
            </div>
            <div className="table-pagination">
              <button
                className="button"
                disabled={!before}
                onClick={() => setBefore(null)}
              >
                Newest dates
              </button>
              <span>Up to 40 dates per page</span>
              <button
                className="button"
                disabled={!data.nextBefore}
                onClick={() => setBefore(data.nextBefore)}
              >
                Older dates
              </button>
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
              max={windows.length - 1}
              value={Math.max(
                0,
                windows.findIndex((w) => contains(s.date, w))
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
              onClick={() => {
                const last = data.series
                  .map((x) => x.totals.last)
                  .filter(Boolean)
                  .sort()
                  .at(-1);
                if (last) choose(last);
              }}
            >
              Latest
            </button>
          </div>
        </>
      )}
      <div className="timeline-footer">
        <span>Stored estate records · totals calculated on server</span>
        <span>{label(s.date)}</span>
      </div>
    </section>
  );
}
