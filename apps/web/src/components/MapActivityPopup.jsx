import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { api } from "../api";
import { activityName } from "../../../../packages/shared/mapped-records.js";
import { buckets } from "../../../../packages/shared/timeline.js";
import {
  harvesterIdentity,
  harvesterTotal,
} from "../../../../packages/shared/harvest-popup.js";

export default function MapActivityPopup({ record, onClose }) {
  const close = useRef();
  const { data, date, period } = useSelector((s) => s);
  const harvesting = record.recordKind === "harvesting";
  const range = period === "all" ? null : buckets(date, period, 1)[0];
  const identity = harvesterIdentity(record);
  const [summary, setSummary] = useState(null);
  const summaryKey = JSON.stringify([
    record.estateId,
    identity,
    range,
    data.refresh,
  ]);
  useEffect(() => {
    if (!harvesting || !identity || data.offline || !data.paged) return;
    const controller = new AbortController();
    api
      .get("/records/harvesting", {
        params: {
          estates: record.estateId,
          ...identity,
          ...(range ? { from: range.start, to: range.end } : {}),
          limit: 1,
        },
        signal: controller.signal,
      })
      .then(({ data: result }) => {
        if (!controller.signal.aborted)
          setSummary({ key: summaryKey, value: result.summary.value });
      })
      .catch((error) => {
        if (error.code !== "ERR_CANCELED")
          setSummary({ key: summaryKey, error: true });
      });
    return () => controller.abort();
  }, [summaryKey, harvesting, data.offline, data.paged]);
  const current = summary?.key === summaryKey ? summary : null;
  const total =
    data.offline || !data.paged
      ? harvesterTotal(data.activities, record, range)
      : current?.value;
  const number = (value) =>
    Number.isFinite(value)
      ? value.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : "—";
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      className="map-activity-popup"
      role="dialog"
      aria-label={harvesting ? "Harvesting details" : "Map activity"}
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
      <div className="map-popup-scroll">
        <table
          aria-label={
            harvesting ? "Harvester and bunches" : "Activity and mandays"
          }
        >
          <thead>
            <tr>
              <th>{harvesting ? "Harvester" : "Activity"}</th>
              <th>{harvesting ? "Bunches" : "Mandays"}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {harvesting
                  ? record.employeeName || record.employeeNo || "Not recorded"
                  : activityName(record)}
              </td>
              <td>{number(harvesting ? record.bunches : record.mandays)}</td>
            </tr>
          </tbody>
          {harvesting && (
            <tfoot>
              <tr>
                <th scope="row">
                  Total bunches<small>Harvester · selected dates</small>
                </th>
                <td aria-live="polite">
                  {!identity
                    ? "—"
                    : data.paged && !data.offline && !current
                    ? "…"
                    : number(total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        {harvesting && current?.error && (
          <p role="status">Total unavailable. Reopen to retry.</p>
        )}
      </div>
    </div>
  );
}
