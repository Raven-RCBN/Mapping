import { useEffect, useRef } from "react";
import { activityName } from "../../../../packages/shared/mapped-records.js";

export default function MapActivityPopup({ record, onClose }) {
  const close = useRef();
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
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
      <div className="map-popup-scroll">
        <table aria-label="Activity and mandays">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Mandays</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{activityName(record)}</td>
              <td>
                {record.recordKind === "harvesting" ||
                record.mandays == null ? (
                  <span aria-label="Mandays not recorded">—</span>
                ) : (
                  record.mandays.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
