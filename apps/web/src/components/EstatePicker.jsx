import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { select } from "../store";
import { exportBoundary } from "../../../../packages/shared/boundary-export.js";
export default function EstatePicker({ onAdd }) {
  const { data, selected, workspaceEstate } = useSelector((s) => s),
    dispatch = useDispatch(),
    [open, setOpen] = useState(false),
    [draft, setDraft] = useState(selected),
    [search, setSearch] = useState(""),
    [exportStatus, setExportStatus] = useState(null);
  const estates = data.estates.filter((e) => selected.includes(e.id)),
    count = estates.reduce(
      (n, e) => n + (e.boundary?.features?.length ?? e.blockCount ?? 0),
      0
    ),
    area = estates.reduce((n, e) => n + (e.totalAreaHa || 0), 0);
  const exportReady =
    (!data.paged || data.offline || workspaceEstate === selected[0]) &&
    !!estates[0]?.boundary?.features?.length;
  function downloadBoundary() {
    try {
      const result = exportBoundary(estates[0]);
      const url = URL.createObjectURL(
        new Blob([result.kml], {
          type: "application/vnd.google-earth.kml+xml;charset=utf-8",
        })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus({
        estateId: selected[0],
        message: `${estates[0].name}: KML download started (${result.count} blocks). In Google Earth, choose File → Import and open the downloaded file.`,
      });
    } catch (error) {
      setExportStatus({ estateId: selected[0], message: error.message });
    }
  }
  return (
    <div className="context-bar">
      <div className="estate-select">
        <div className="estate-picker-wrap">
          <button
            className="estate-picker-toggle"
            aria-label="Select estate"
            aria-expanded={open}
            onClick={() => {
              setDraft(selected);
              setOpen(!open);
            }}
          >
            <span className="pin">⌖</span>
            <span className="estate-picker-title">
              <small>ESTATE</small>
              <strong>
                {estates.length === 1
                  ? estates[0].name
                  : `${estates.length} estates selected`}
              </strong>
            </span>

            <span>⌄</span>
          </button>
          {open && (
            <section className="estate-picker" aria-label="Estate selection">
              <div className="estate-picker-heading">
                <b>Select estate</b>
                <span>Choose one estate</span>
              </div>
              <input
                id="estateSearch"
                placeholder="Search estates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="estate-options">
                {data.estates
                  .filter((e) =>
                    (e.name + " " + e.location)
                      .toLowerCase()
                      .includes(search.toLowerCase())
                  )
                  .map((e) => (
                    <label
                      key={e.id}
                      className={
                        "estate-option " +
                        (draft.includes(e.id) ? "selected" : "")
                      }
                    >
                      <input
                        type="radio"
                        name="active-estate"
                        checked={draft.includes(e.id)}
                        onChange={() => setDraft([e.id])}
                      />
                      <span>
                        <strong>{e.name}</strong>
                        <small>{e.location || "Location not added"}</small>
                      </span>
                      <span className="estate-data-status">
                        {e.boundary?.features?.length ?? e.blockCount ?? 0}{" "}
                        blocks
                      </span>
                    </label>
                  ))}
              </div>
              <button
                className="estate-add"
                onClick={() => {
                  setOpen(false);
                  onAdd();
                }}
              >
                ＋ Add estate
              </button>
              <p id="estatePickerHint">
                Maps, data tables, timeline, storage and offline maps follow
                this estate.
              </p>
              <div className="estate-picker-actions">
                <button className="button" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={!draft.length}
                  onClick={() => {
                    dispatch(select(draft));
                    setOpen(false);
                  }}
                >
                  Apply selection
                </button>
              </div>
            </section>
          )}
        </div>
        <span className="estate-meta">
          {estates.length === 1
            ? estates[0].location
            : `${estates.length} estates`}
        </span>
      </div>
      <div className="context-facts">
        <span>
          <b>{count}</b> blocks
        </span>
        <span>
          <b>{area.toLocaleString("en", { maximumFractionDigits: 2 })}</b> ha
        </span>
        <span className="reference">
          {data.offline ? "Offline package" : "Estate map workspace"}
        </span>
        <div className="estate-export-wrap">
          <button
            className="estate-export-button"
            disabled={!exportReady}
            onClick={downloadBoundary}
            aria-label="Export estate boundaries to Google Earth"
            title="Download estate boundaries for Google Earth (.kml)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
            </svg>
          </button>
          {exportStatus?.estateId === selected[0] && (
            <div className="estate-export-status" role="status">
              <p>{exportStatus.message}</p>
              <button onClick={() => setExportStatus(null)}>Dismiss</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
