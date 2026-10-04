import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { select } from "../store";
export default function EstatePicker({ onAdd }) {
  const { data, selected } = useSelector((s) => s),
    dispatch = useDispatch(),
    [open, setOpen] = useState(false),
    [draft, setDraft] = useState(selected),
    [search, setSearch] = useState("");
  const estates = data.estates.filter((e) => selected.includes(e.id)),
    count = estates.reduce(
      (n, e) => n + (e.boundary?.features?.length || 0),
      0
    ),
    area = estates.reduce((n, e) => n + (e.totalAreaHa || 0), 0);
  return (
    <div className="context-bar">
      <div className="estate-select">
        <div className="estate-picker-wrap">
          <button
            className="estate-picker-toggle"
            aria-label="Select estates"
            aria-expanded={open}
            onClick={() => {
              setDraft(selected);
              setOpen(!open);
            }}
          >
            <span className="pin">⌖</span>
            <span className="estate-picker-title">
              <small>ESTATES</small>
              <strong>
                {estates.length === 1
                  ? estates[0].name
                  : `${estates.length} estates selected`}
              </strong>
            </span>
            <span className="estate-selection-count">{selected.length}</span>
            <span>⌄</span>
          </button>
          {open && (
            <section className="estate-picker" aria-label="Estate selection">
              <div className="estate-picker-heading">
                <b>Select estates</b>
                <span>
                  {draft.length} of {data.estates.length} selected
                </span>
              </div>
              <input
                id="estateSearch"
                placeholder="Search estates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="estate-picker-tools">
                <button onClick={() => setDraft(data.estates.map((e) => e.id))}>
                  Select all
                </button>
                <button onClick={() => setDraft([])}>Clear</button>
              </div>
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
                        type="checkbox"
                        checked={draft.includes(e.id)}
                        onChange={() =>
                          setDraft(
                            draft.includes(e.id)
                              ? draft.filter((id) => id !== e.id)
                              : [...draft, e.id]
                          )
                        }
                      />
                      <span>
                        <strong>{e.name}</strong>
                        <small>{e.location || "Location not added"}</small>
                      </span>
                      <span className="estate-data-status">
                        {e.boundary?.features?.length || 0} blocks
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
                Maps, timeline and totals follow your selection.
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
      </div>
    </div>
  );
}
