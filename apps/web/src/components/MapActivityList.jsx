import { mappedRecords } from "../../../../packages/shared/mapped-records.js";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { createPortal } from "react-dom";
import { api } from "../api";
import { patch } from "../store";
import {
  allMapActivities,
  noMapActivities,
  fieldVisible,
} from "../../../../packages/shared/map-visibility.js";

function ActivityChoices() {
  const s = useSelector((s) => s),
    dispatch = useDispatch();
  const [search, setSearch] = useState(""),
    [pages, setPages] = useState([undefined]),
    [catalog, setCatalog] = useState(null),
    [error, setError] = useState("");
  const scope = s.selected.join(","),
    after = pages.at(-1);
  const online = s.data.paged && !s.data.offline;
  const key = JSON.stringify([scope, search, after]);
  useEffect(() => {
    setPages([undefined]);
  }, [scope]);
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    setError("");
    const timer = setTimeout(() => {
      api
        .get("/activity-options", {
          params: { estates: scope, q: search, after, mappedOnly: "true" },
          signal: controller.signal,
        })
        .then(({ data }) => setCatalog({ ...data, key }))
        .catch((e) => {
          if (e.code !== "ERR_CANCELED")
            setError(e.response?.data?.error || e.message);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, online, s.data.refresh]);
  const local = useMemo(() => {
    if (online) return null;
    const names = [
      ...new Set(
        mappedRecords(s.data.activities, s.data.blocks || [], s.data.estates)
          .filter(
            (r) => s.selected.includes(r.estateId) && r.type !== "Harvesting"
          )
          .map(
            (r) =>
              r.activityDescription || (r.recordKind === "field" ? "" : r.type)
          )
      ),
    ].sort();
    const matches = names.filter((name) =>
      name.toLowerCase().includes(search.toLowerCase())
    );
    const remaining = matches.filter(
      (name) => after === undefined || name > after
    );
    return {
      items: remaining.slice(0, 50),
      total: matches.length,
      next: remaining.length > 50 ? remaining[49] : null,
    };
  }, [online, s.data, scope, search, after]);
  const ready = !online || catalog?.key === key;
  const result = online ? (ready ? catalog : null) : local;
  const selection = s.mapVisibility;
  const none =
    selection.mode === "include" &&
    !selection.fields.length &&
    !selection.harvesting;
  const change = (next) => {
    if (next.fields.length > 500) {
      setError(
        "Up to 500 individual choices can be saved. Use Select all and uncheck activities to show a larger selection."
      );
      return;
    }
    setError("");
    dispatch(
      patch({ mapVisibility: next, activity: "all", showActivities: true })
    );
  };
  const toggleField = (name) =>
    change({
      ...selection,
      fields: selection.fields.includes(name)
        ? selection.fields.filter((x) => x !== name)
        : [...selection.fields, name],
    });
  const status = none
    ? "No activities selected"
    : selection.mode === "include"
    ? `${
        selection.fields.length + Number(selection.harvesting)
      } activities selected`
    : !selection.fields.length && selection.harvesting
    ? "All activities selected"
    : `${
        selection.fields.length + Number(!selection.harvesting)
      } activities hidden`;
  return (
    <section className="map-activity-list" aria-label="Map activity selection">
      <div className="map-activity-title">
        <div>
          <strong>Activities</strong>
          <p>Choose activities to display on the map and timeline.</p>
        </div>
        <div className="map-activity-actions">
          <button onClick={() => change(allMapActivities())}>Select all</button>
          <button onClick={() => change(noMapActivities())}>Clear all</button>
        </div>
      </div>
      <input
        autoFocus
        type="search"
        aria-label="Search activities to display"
        placeholder="Search activities…"
        maxLength={100}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPages([undefined]);
        }}
      />
      <div className="map-activity-columns">
        <span>Activity</span>
        <span>Display in map</span>
      </div>
      <div className="map-activity-options" aria-busy={!ready}>
        <label
          className={
            "map-activity-option harvest-option" +
            (selection.harvesting ? " checked" : "")
          }
        >
          <span>
            <span className="activity-symbol" aria-hidden="true">
              ✦
            </span>
            Harvesting
          </span>
          <input
            type="checkbox"
            aria-label="Display Harvesting in map"
            checked={selection.harvesting}
            onChange={(e) =>
              change({ ...selection, harvesting: e.target.checked })
            }
          />
        </label>
        {!ready && !error && <p role="status">Loading activity list…</p>}
        {result?.items.map((name) => (
          <label
            key={name}
            className={
              "map-activity-option" +
              (fieldVisible(selection, name) ? " checked" : "")
            }
          >
            <span>
              <span className="activity-symbol" aria-hidden="true">
                ⌁
              </span>
              {name || "Unspecified field activity"}
            </span>
            <input
              type="checkbox"
              aria-label={`Display ${
                name || "Unspecified field activity"
              } in map`}
              checked={fieldVisible(selection, name)}
              onChange={() => toggleField(name)}
            />
          </label>
        ))}
        {result && !result.items.length && (
          <p>
            No field activities match
            {search ? " your search" : " the selected estates"}.
          </p>
        )}
      </div>
      <div className="map-activity-footer">
        <span role="status">
          {status}
          {none ? " · map bubbles hidden" : ""}
        </span>
        <div className="map-activity-pages">
          {result && (
            <small>
              {result.total} field activity types{search ? " matching" : ""}
            </small>
          )}
          <button
            aria-label="Previous activity choices"
            disabled={pages.length === 1 || !ready}
            onClick={() => setPages(pages.slice(0, -1))}
          >
            ‹
          </button>
          <button
            aria-label="Next activity choices"
            disabled={!ready || result?.next == null}
            onClick={() => setPages([...pages, result.next])}
          >
            ›
          </button>
        </div>
      </div>
      {s.activity !== "all" && (
        <p className="map-activity-scope">
          Activity type filter: {s.activity}.{" "}
          <button onClick={() => dispatch(patch({ activity: "all" }))}>
            Show all selected types
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default function MapActivityList() {
  const selection = useSelector((s) => s.mapVisibility);
  const activity = useSelector((s) => s.activity);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef(null),
    panel = useRef(null);
  const id = useId();
  const count =
    selection.mode === "include"
      ? selection.fields.length + Number(selection.harvesting)
      : "All";
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = trigger.current.getBoundingClientRect();
      const popup = panel.current.getBoundingClientRect();
      const below = button.bottom + 8;
      const above = button.top - popup.height - 8;
      setPosition({
        left: Math.max(
          8,
          Math.min(button.left, window.innerWidth - popup.width - 8)
        ),
        top:
          below + popup.height <= window.innerHeight - 8
            ? below
            : above >= 8
            ? above
            : Math.max(8, window.innerHeight - popup.height - 8),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (
        !trigger.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="map-activity-picker"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !trigger.current?.contains(event.relatedTarget) &&
          !panel.current?.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className={
          "history-filter activity-picker-trigger " +
          (activity === "all" ? "active" : "")
        }
        aria-label="Choose map activities"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        ◷ Activities <small>{count}</small>
        <span aria-hidden="true">⌄</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label="Map activity selection"
            className="map-activity-dropdown"
            style={position}
          >
            <button
              className="activity-picker-close"
              aria-label="Close activity list"
              onClick={close}
            >
              ×
            </button>
            <ActivityChoices />
          </div>,
          document.body
        )}
    </div>
  );
}
