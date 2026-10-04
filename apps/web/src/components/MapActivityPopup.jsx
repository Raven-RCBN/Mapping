import { useEffect, useRef, useState } from "react";
import { queryData } from "../api";
import { popupActivities } from "../../../../packages/shared/activity-popup.js";

export default function MapActivityPopup({ group, query, onClose }) {
  const [pages, setPages] = useState([undefined]),
    [result, setResult] = useState(null),
    [error, setError] = useState("");
  const close = useRef();
  const online = group.rows.some((row) => row.summary);
  const params = {
    ...query,
    estates: group.estateId,
    block: `${group.estateId}::${group.block}`,
    gps: group.geolocation ? group.geolocation.join(",") : "block",
    limit: 25,
    cursor: pages.at(-1),
  };
  const key = JSON.stringify(params);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!online) return;
    const controller = new AbortController();
    setResult(null);
    setError("");
    queryData("/map-popup", params, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ ...data, key });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.response?.data?.error || "Unable to load activity.");
      });
    return () => controller.abort();
  }, [key, online]);
  const local = online ? [] : popupActivities(group.rows);
  const items = online
    ? result?.key === key
      ? result.items
      : null
    : local.slice((pages.length - 1) * 25, pages.length * 25);
  const next = online
    ? result?.nextCursor
    : local.length > pages.length * 25
    ? String(pages.length)
    : null;
  return (
    <div
      className="map-activity-popup"
      role="dialog"
      aria-label="Map activity"
      aria-modal="false"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <button
        ref={close}
        className="map-popup-close"
        aria-label="Close activity popup"
        onClick={onClose}
      >
        ×
      </button>
      {error ? (
        <p role="alert">{error}</p>
      ) : !items ? (
        <p role="status">Loading activity…</p>
      ) : (
        <>
          <div className="map-popup-scroll">
            <table aria-label="Activity and mandays">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Mandays</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={row.key || i}>
                    <td>{row.activity}</td>
                    <td>
                      {row.mandays == null ? (
                        <span aria-label="Mandays not recorded">—</span>
                      ) : (
                        row.mandays.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && <p>No activity for this selection.</p>}
          </div>
          {(pages.length > 1 || next != null) && (
            <div className="map-popup-pages">
              <button
                disabled={pages.length === 1}
                onClick={() => setPages(pages.slice(0, -1))}
              >
                Previous
              </button>
              <button
                disabled={next == null}
                onClick={() => setPages([...pages, next])}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
