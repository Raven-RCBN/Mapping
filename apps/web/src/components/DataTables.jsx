import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { exactCoordinates } from "../../../../packages/shared/activities.js";
import { label } from "../../../../packages/shared/timeline.js";

export const blockColumns = [
  ["blockCode", "Block"],
  ["plantingYear", "Planting year"],
  ["plantingYearDescription", "Planting year description"],
  ["blockStatus", "Status"],
  ["plantedHectares", "Planted hectares"],
  ["plantedDate", "Planted date"],
  ["plantingMaterial", "Planting material"],
  ["soilType", "Soil type"],
];
const format = (value, key) =>
  value == null || value === ""
    ? "—"
    : ["workDate", "plantedDate"].includes(key)
    ? label(value)
    : String(value);
export function BlockInformation({ blocks, selection, estates, onClose }) {
  if (!selection)
    return (
      <div className="block-info-hint">
        Select a block on the map or in the block filter to see its details.
      </div>
    );
  const [estateId, code] = selection.split("::");
  const matches = blocks.filter(
    (b) =>
      b.estateId === estateId &&
      (b.blockCode === code || b.mapBlockNames?.includes(code))
  );
  const estate = estates.find((e) => e.id === estateId);
  return (
    <section className="block-info" aria-label="Selected block information">
      <div className="block-info-heading">
        <strong>
          ▱ {code} <small>· {estate?.name}</small>
        </strong>
        <button aria-label="Clear block information" onClick={onClose}>
          ×
        </button>
      </div>
      {matches.map((b) => (
        <div key={b.id}>
          <dl className="block-facts">
            {blockColumns.map(([key, title]) => (
              <div key={key}>
                <dt>{title}</dt>
                <dd>{format(b[key], key)}</dd>
              </div>
            ))}
          </dl>
          <small>
            {b.mapBlockNames?.length
              ? `Map blocks: ${b.mapBlockNames.join(", ")}`
              : "Map match pending · activities remain in the tables"}
          </small>
        </div>
      ))}
      {!matches.length && (
        <p>No block-detail record is linked to this map polygon.</p>
      )}
    </section>
  );
}
export default function DataTables({
  blocks = [],
  rows = [],
  popup = false,
  server = null,
  onSelectBlock,
  onHistory,
}) {
  const [tab, setTab] = useState(
    popup
      ? rows.some((r) => r.recordKind === "harvesting")
        ? "harvesting"
        : "field"
      : "blocks"
  );
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [remote, setRemote] = useState(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [cursors, setCursors] = useState([null]),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const reset = () => {
    setPage(0);
    setCursors([null]);
  };
  const params = {
    ...server,
    q: query,
    limit: 25,
    cursor: cursors[page] || undefined,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const remoteKey = JSON.stringify([tab, params]);
  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    setBusy(true);
    setRemote(null);
    setFailure("");
    const timer = setTimeout(
      () =>
        api
          .get("/records/" + tab, { params, signal: controller.signal })
          .then(({ data }) => {
            setRemote(data);
            setBusy(false);
          })
          .catch((e) => {
            if (e.code !== "ERR_CANCELED") {
              setFailure(e.response?.data?.error || e.message);
              setBusy(false);
            }
          }),
      200
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [remoteKey, !!server]);
  const tabs = [
    ["blocks", "Block details", blocks.length],
    [
      "harvesting",
      "Harvesting",
      rows
        .filter((r) => r.recordKind === "harvesting")
        .reduce((n, r) => n + (r.count ?? 1), 0),
    ],
    [
      "field",
      "Field activity",
      rows
        .filter((r) => r.recordKind === "field")
        .reduce((n, r) => n + (r.count ?? 1), 0),
    ],
  ].filter((t) => !popup || (t[0] !== "blocks" && t[2]));
  const source =
    tab === "blocks" ? blocks : rows.filter((r) => r.recordKind === tab);
  const filtered = useMemo(
    () =>
      source
        .filter(
          (r) =>
            !query ||
            Object.values(r).some(
              (v) =>
                typeof v !== "object" &&
                String(v ?? "")
                  .toLowerCase()
                  .includes(query.toLowerCase())
            )
        )
        .sort(
          (a, b) =>
            (b.workDate || "").localeCompare(a.workDate || "") ||
            (a.sourceRow || 0) - (b.sourceRow || 0)
        ),
    [source, query]
  );
  const total = server ? remote?.summary.count || 0 : filtered.length;
  const pages = Math.max(1, Math.ceil(total / 25)),
    active = server ? page : Math.min(page, pages - 1);
  const visible = server
    ? remote?.items || []
    : filtered.slice(active * 25, active * 25 + 25);
  const columns =
    tab === "blocks"
      ? [...blockColumns, ["mapBlockNames", "Map match"]]
      : [
          ["workDate", "Work date"],
          ["blockCode", "Block"],
          ...(tab === "harvesting"
            ? [
                ["employeeNo", "Employee no."],
                ["employeeName", "Employee name"],
                ["gang", "Gang"],
                ["activity", "Activity"],
                ["bunches", "Bunches"],
              ]
            : [
                ["gang", "Gang"],
                ["activityCode", "Activity code"],
                ["activityDescription", "Activity description"],
                ["mandays", "Mandays"],
              ]),
          ["geolocation", "Geolocation (longitude, latitude)"],
          ["location", "Map position"],
          ["sourceRow", "Source row"],
        ];
  const cell = (r, key) =>
    key === "geolocation"
      ? exactCoordinates(r)
          ?.map((n) => n.toFixed(6))
          .join(", ") || "Not supplied"
      : key === "location"
      ? exactCoordinates(r)
        ? "Exact GPS"
        : blocks.find((b) => b.id === r.blockId)?.mapBlockNames?.length
        ? "Inside matched block"
        : "Map match pending"
      : key === "mapBlockNames"
      ? r.mapBlockNames?.join(", ") || "Pending"
      : format(r[key], key);
  return (
    <div className="data-tables">
      <div className="table-tabs" role="tablist">
        {tabs.map(([id, name, n]) => (
          <button
            role="tab"
            aria-selected={tab === id}
            key={id}
            onClick={() => {
              setTab(id);
              reset();
              setQuery("");
            }}
          >
            {name}{" "}
            <span>
              {server
                ? tab === id && remote
                  ? remote.summary.count.toLocaleString()
                  : popup
                  ? n.toLocaleString()
                  : ""
                : n.toLocaleString()}
            </span>
          </button>
        ))}
      </div>
      <div className="table-toolbar">
        <label>
          Search {tab === "blocks" ? "blocks" : "records"}
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            placeholder={
              server
                ? "Starts with block, employee, gang or activity…"
                : "Block, date, gang or activity…"
            }
          />
        </label>
        {server && !popup && tab !== "blocks" && (
          <>
            <label>
              From
              <input
                type="date"
                value={from}
                onInput={(e) => {
                  setFrom(e.currentTarget.value);
                  reset();
                }}
                onChange={(e) => {
                  setFrom(e.target.value);
                  reset();
                }}
              />
            </label>
            <label>
              Before
              <input
                type="date"
                value={to}
                onInput={(e) => {
                  setTo(e.currentTarget.value);
                  reset();
                }}
                onChange={(e) => {
                  setTo(e.target.value);
                  reset();
                }}
              />
            </label>
          </>
        )}
        <span>
          {total.toLocaleString()} records
          {tab !== "blocks" &&
            ` · ${(server
              ? remote?.summary.value || 0
              : filtered.reduce(
                  (n, r) => n + (tab === "harvesting" ? r.bunches : r.mandays),
                  0
                )
            ).toLocaleString()} ${
              tab === "harvesting" ? "bunches" : "mandays"
            }`}
        </span>
      </div>
      {popup && (
        <p className="table-note">
          Records for the selected period. The location columns distinguish
          supplied GPS, block placement and pending map matches.
        </p>
      )}
      {busy && <p role="status">Loading page…</p>}
      {failure && <p role="alert">{failure}</p>}
      <div className="data-table-scroll" tabIndex="0">
        <table>
          <thead>
            <tr>
              {columns.map(([key, title]) => (
                <th key={key}>{title}</th>
              ))}
              {!popup && <th>View</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                {columns.map(([key]) => (
                  <td key={key}>{cell(r, key)}</td>
                ))}
                {!popup && (
                  <td>
                    <button
                      className="text-button"
                      onClick={() =>
                        tab === "blocks" ? onSelectBlock?.(r) : onHistory?.(r)
                      }
                    >
                      {tab === "blocks" ? "Block info" : "History"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!busy && !failure && !visible.length && (
          <p className="empty">No records for this selection.</p>
        )}
      </div>
      <div className="table-pagination">
        <button
          className="button"
          disabled={busy || !active}
          onClick={() => setPage(active - 1)}
        >
          Previous
        </button>
        <span>
          Page {active + 1} of {pages}
        </span>
        <button
          className="button"
          disabled={
            busy || (server ? !remote?.nextCursor : active >= pages - 1)
          }
          onClick={() => {
            if (server)
              setCursors([...cursors.slice(0, page + 1), remote.nextCursor]);
            setPage(active + 1);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
