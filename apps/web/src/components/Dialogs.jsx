import { useRef, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import {
  api,
  saveOffline,
  offlineManifest,
  downloadAsset,
  clearOffline,
} from "../api";
import { label } from "../../../../packages/shared/timeline";
import DataTables from "./DataTables";
export default function Dialogs({
  mode,
  onClose,
  onReload,
  onHistory,
  onSelectBlock,
}) {
  const ref = useRef(),
    s = useSelector((x) => x),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(null),
    [uploadKind, setUploadKind] = useState("image"),
    [offlineFrom, setOfflineFrom] = useState(""),
    [offlineTo, setOfflineTo] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    offlineManifest().then(setSaved);
  }, []);
  const titles = {
    tables: "Estate data tables",
    records: `${mode.group?.block || "Block"} · Activity details`,
    import: "Import a map or image",
    estate: "Add estate",
    offline: "Offline maps",
    sources: "Map sources & acquisition",
    record: mode.record?.type || "Activity",
  };
  async function run(fn) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(e) {
    e.preventDefault();
    const form = e.currentTarget,
      values = new FormData(form),
      estateId = values.get("estateId");
    await run(async () => {
      if (uploadKind === "boundary") {
        const file = values.get("file"),
          json = JSON.parse(await file.text());
        await api.put(`/estates/${estateId}/boundary`, {
          boundary: json.geojson || json,
          date: values.get("acquiredAt"),
        });
      } else {
        const [south, west, north, east] = [
          "south",
          "west",
          "north",
          "east",
        ].map((k) => Number(values.get(k)));
        values.set(
          "bounds",
          JSON.stringify([
            [south, west],
            [north, east],
          ])
        );
        await api.post(`/estates/${estateId}/images`, values);
      }
      await onReload();
      setMessage(
        "Saved permanently in this estate’s folder. It will reload with the map and is available in offline downloads."
      );
      form.reset();
    });
  }
  const writable =
    !s.data.offline && ["manager", "admin"].includes(s.data.access.role);
  const estateOptions = s.data.estates.map((e) => (
    <option value={e.id} key={e.id}>
      {e.name}
    </option>
  ));
  return (
    <dialog
      className={
        ["tables", "records"].includes(mode.type) ? "table-dialog" : ""
      }
      ref={ref}
      onCancel={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-top">
        <div>
          <div className="eyebrow">ESTATE ATLAS</div>
          <h2>{titles[mode.type]}</h2>
        </div>
        <button aria-label="Close dialog" onClick={onClose}>
          ×
        </button>
      </div>
      <div id="modalBody">
        {["tables", "records"].includes(mode.type) && (
          <DataTables
            blocks={(s.data.blocks || []).filter((b) =>
              s.selected.includes(b.estateId)
            )}
            rows={
              mode.type === "records"
                ? mode.group.rows
                : s.data.activities.filter((r) =>
                    s.selected.includes(r.estateId)
                  )
            }
            server={mode.server}
            popup={mode.type === "records"}
            onHistory={onHistory}
            onSelectBlock={onSelectBlock}
          />
        )}
        {mode.type === "import" && (
          <form onSubmit={upload}>
            <p>
              Images are saved to your estate’s folder. Choose an acquisition
              date and geographic extent to place an image accurately.
            </p>
            <div className="form-grid">
              <label>
                Estate
                <select name="estateId" defaultValue={s.selected[0]}>
                  {estateOptions}
                </select>
              </label>
              <label>
                Map type
                <select
                  value={uploadKind}
                  onChange={(e) => setUploadKind(e.target.value)}
                >
                  <option value="image">Image overlay</option>
                  <option value="boundary">Boundary · GeoJSON</option>
                </select>
              </label>
              <label className="wide">
                Name
                <input
                  name="name"
                  required
                  placeholder="Drone survey / field image"
                />
              </label>
              <label className="wide">
                File
                <input
                  type="file"
                  name="file"
                  accept={
                    uploadKind === "image"
                      ? ".png,.jpg,.jpeg,.webp"
                      : ".json,.geojson"
                  }
                  required
                />
              </label>
              <label>
                Acquisition date
                <input
                  name="acquiredAt"
                  type="date"
                  required
                  defaultValue={s.date}
                />
              </label>
              {uploadKind === "image" &&
                [
                  ["south", "South latitude"],
                  ["west", "West longitude"],
                  ["north", "North latitude"],
                  ["east", "East longitude"],
                ].map(([key, title]) => (
                  <label key={key}>
                    {title}
                    <input name={key} type="number" step="any" required />
                  </label>
                ))}
            </div>
            <div className="callout">
              PNG, JPEG and WebP images · up to 50 MB. Export GeoTIFF as a
              georeferenced PNG from QGIS for a web overlay. Boundaries use WGS
              84 GeoJSON polygons.
            </div>
            <div className="modal-actions">
              <button className="button primary" disabled={busy || !writable}>
                {busy ? "Saving…" : "Save to estate folder"}
              </button>
            </div>
            {!writable && (
              <p>Connect to the API with manager access to upload files.</p>
            )}
          </form>
        )}
        {mode.type === "estate" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              run(async () => {
                await api.post("/estates", {
                  name: d.get("name"),
                  location: d.get("location"),
                  totalAreaHa: d.get("area") ? Number(d.get("area")) : null,
                });
                await onReload();
                onClose();
              });
            }}
          >
            <div className="form-grid">
              <label className="wide">
                Estate name
                <input name="name" required maxLength="100" />
              </label>
              <label>
                Location
                <input name="location" />
              </label>
              <label>
                Area (ha)
                <input name="area" type="number" min="0" step="any" />
              </label>
            </div>
            <p>Add its boundary and images using Import a map or image.</p>
            <div className="modal-actions">
              <button className="button primary" disabled={busy || !writable}>
                Add estate
              </button>
            </div>
          </form>
        )}
        {mode.type === "offline" && (
          <>
            <p>
              Download selected estates for offline viewing: boundaries, dated
              images, activity history, elevation, slope and contours when
              available.
            </p>
            <div className="callout">
              <b>
                {s.data.estates
                  .filter((e) => s.selected.includes(e.id))
                  .map((e) => e.name)
                  .join(", ")}
              </b>
              <br />
              {saved
                ? `Last saved ${label(saved.createdAt)} · ${
                    saved.files.length
                  } files`
                : "No offline package saved on this browser."}
            </div>
            <div className="form-grid">
              <label>
                Activity and imagery from
                <input
                  type="date"
                  value={offlineFrom}
                  onInput={(e) => setOfflineFrom(e.currentTarget.value)}
                  onChange={(e) => setOfflineFrom(e.target.value)}
                />
              </label>
              <label>
                Before
                <input
                  type="date"
                  value={offlineTo}
                  onInput={(e) => setOfflineTo(e.currentTarget.value)}
                  onChange={(e) => setOfflineTo(e.target.value)}
                />
              </label>
            </div>
            <p>
              Leave dates empty for all available history. Packages are limited
              to 25,000 records, 200 files and 512 MB; choose a smaller window
              if needed. The nearest earlier image is included for context.
            </p>
            <div className="modal-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await clearOffline();
                    setSaved(null);
                    setMessage(
                      "Offline copy removed. Server files are unchanged."
                    );
                  })
                }
              >
                Remove offline copy
              </button>
              <button
                className="button primary"
                disabled={busy || s.data.offline}
                onClick={() =>
                  run(async () => {
                    const pack = await saveOffline(
                      s.selected,
                      (done, total) =>
                        setMessage(`Downloading ${done} of ${total} files…`),
                      {
                        ...(offlineFrom ? { from: offlineFrom } : {}),
                        ...(offlineTo ? { to: offlineTo } : {}),
                      }
                    );
                    setSaved(pack);
                    setMessage(
                      "Download complete. These estates can now be opened without a connection."
                    );
                  })
                }
              >
                {busy ? "Downloading…" : "Download selected estates"}
              </button>
            </div>
            <p>
              Online road tiles are not included. For native fieldwork, use the
              React Native app or a QField project.
            </p>
            {(s.data.paged ? s.mapAssets || [] : s.data.assets)
              .filter(
                (a) => s.selected.includes(a.estateId) && a.kind === "qgis"
              )
              .map((a) => (
                <div key={a.id} className="source-row">
                  <strong>{a.name}</strong>
                  <button
                    className="button"
                    onClick={() => run(() => downloadAsset(a))}
                  >
                    Download QGIS / QField
                  </button>
                </div>
              ))}
          </>
        )}
        {mode.type === "sources" && (
          <>
            <p>
              Preserve dated map versions. Folder polling and provider
              credentials will be configured with the hosting environment.
            </p>
            {s.data.sources
              .filter((x) => s.selected.includes(x.estateId))
              .map((x) => (
                <div className="source-row" key={x.id}>
                  <div>
                    <strong>{x.name}</strong>
                    <small>
                      {x.path} · {x.schedule}
                    </small>
                  </div>
                  <span className="tag">Configured</span>
                </div>
              ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.currentTarget));
                run(async () => {
                  await api.post("/sources", data);
                  await onReload();
                  setMessage(
                    "Source configuration saved. No scheduled download is running yet."
                  );
                });
              }}
            >
              <div className="form-grid">
                <label>
                  Estate<select name="estateId">{estateOptions}</select>
                </label>
                <label>
                  Source type
                  <select name="type">
                    {[
                      "Folder",
                      "WMS / WMTS service",
                      "Satellite catalog",
                      "Database API",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Source name
                  <input name="name" required />
                </label>
                <label>
                  Folder or URL
                  <input name="path" required />
                </label>
                <label>
                  Schedule
                  <select name="schedule">
                    {["Manual", "Daily", "Weekly", "Monthly"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  History retention
                  <select name="retention">
                    <option>Keep every version</option>
                  </select>
                </label>
              </div>
              <div className="modal-actions">
                <button className="button primary" disabled={busy || !writable}>
                  Save configuration
                </button>
              </div>
            </form>
          </>
        )}
        {mode.type === "record" && (
          <>
            <div className="callout">
              <b>{mode.record.block}</b> · {label(mode.record.date)} ·{" "}
              {mode.record.time}
              <br />
              {mode.record.quantity}
            </div>
            <p>{mode.record.note}</p>
            <p>
              Location anchored to the block centre. No field photo is attached.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api.patch(`/activities/${mode.record.id}/verify`);
                  await onReload();
                  onClose();
                });
              }}
            >
              <label className="check-row">
                <input type="checkbox" required />I have reviewed this activity
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => onHistory(mode.record)}
                >
                  View activity history
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy || !writable || mode.record.status === "verified"
                  }
                >
                  {mode.record.status === "verified"
                    ? "Verified"
                    : "Mark verified"}
                </button>
              </div>
            </form>
          </>
        )}
        {message && (
          <div className="callout" role="status">
            {message}
          </div>
        )}
      </div>
    </dialog>
  );
}
