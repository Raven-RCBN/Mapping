import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { api } from "../api";
import { label } from "../../../../packages/shared/timeline.js";
const size = (n) =>
  n > 1024 ** 3
    ? (n / 1024 ** 3).toFixed(2) + " GB"
    : (n / 1024 ** 2).toFixed(2) + " MB";
export default function Storage({ onReload }) {
  const s = useSelector((x) => x),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(null),
    [confirmation, setConfirmation] = useState(""),
    [notice, setNotice] = useState(""),
    [pageCursor, setPageCursor] = useState(null);
  const [estate, setEstate] = useState(s.selected[0] || ""),
    [before, setBefore] = useState(""),
    [keep, setKeep] = useState(2),
    [action, setAction] = useState("retire");
  const admin = !s.data.offline && s.data.access.role === "admin";
  const load = async (cursor = pageCursor) => {
    const { data } = await api.get("/storage", {
      params: { estates: s.selected.join(","), ...(cursor ? { cursor } : {}) },
    });
    setData(data);
  };
  useEffect(() => {
    setData(null);
    setPreview(null);
    setEstate(s.selected[0] || "");
    setPageCursor(null);
    if (!s.data.offline)
      load(null).catch((e) => setError(e.response?.data?.error || e.message));
  }, [s.selected.join(",")]);
  const run = async (fn) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };
  if (s.data.offline)
    return (
      <section className="data-workspace">
        <p>
          Connect to manage server image storage. Saved mobile and browser
          packages can be removed from Offline maps.
        </p>
      </section>
    );
  return (
    <section className="data-workspace storage-workspace">
      <h2>Image storage & retention</h2>
      <p>
        Images are stored in private estate folders. The database holds their
        dates, locations, checksums and file references.
      </p>
      {error && (
        <p role="alert" className="callout">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="callout">
          {notice}
        </p>
      )}
      {data && (
        <>
          <div className="stats">
            <article>
              <div>
                <span>Active files</span>
                <strong>
                  {size(
                    data.groups
                      .filter((g) => g._id.state === "active")
                      .reduce((n, g) => n + g.bytes, 0)
                  )}
                </strong>
              </div>
            </article>
            <article>
              <div>
                <span>Retired files · recoverable</span>
                <strong>
                  {size(
                    data.groups
                      .filter((g) =>
                        ["retired", "purging"].includes(g._id.state)
                      )
                      .reduce((n, g) => n + g.bytes, 0)
                  )}
                </strong>
              </div>
            </article>
            <article>
              <div>
                <span>Server disk available</span>
                <strong>{size(data.freeDiskBytes)}</strong>
              </div>
            </article>
          </div>
          <div className="data-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Estate</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Files</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g) => (
                  <tr key={JSON.stringify(g._id)}>
                    <td>
                      {s.data.estates.find((e) => e.id === g._id.estate)
                        ?.name || g._id.estate}
                    </td>
                    <td>{g._id.kind}</td>
                    <td>{g._id.state}</td>
                    <td>{g.files}</td>
                    <td>
                      {g._id.state === "purged" ? "Removed" : size(g.bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note">
            File sizes come from the image inventory. Disk availability covers
            the shared server volume.
          </p>
          <h3>Retire or purge older imagery</h3>
          <p>
            Retire hides images from the map and new downloads. You can restore
            them for at least 30 days. Permanent purge becomes available after
            that period. Boundaries, terrain, QGIS packages and activity records
            are protected.
          </p>
          {admin ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const { data } = await api.post("/storage/preview", {
                    estateId: estate,
                    before,
                    keep: Number(keep),
                    action,
                  });
                  setPreview(data);
                  setConfirmation("");
                });
              }}
            >
              <div className="form-grid">
                <label>
                  Estate
                  <select
                    value={estate}
                    onChange={(e) => {
                      setEstate(e.target.value);
                      setPreview(null);
                    }}
                  >
                    {s.data.estates
                      .filter((e) => s.selected.includes(e.id))
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Images acquired before
                  <input
                    type="date"
                    name="before"
                    onInput={(e) => {
                      setBefore(e.currentTarget.value);
                      setPreview(null);
                    }}
                    required
                    value={before}
                    onChange={(e) => {
                      setBefore(e.target.value);
                      setPreview(null);
                    }}
                  />
                </label>
                <label>
                  Action
                  <select
                    value={action}
                    onChange={(e) => {
                      setAction(e.target.value);
                      setPreview(null);
                    }}
                  >
                    <option value="retire">Retire · recoverable</option>
                    <option value="purge">
                      Permanently purge eligible retired files
                    </option>
                  </select>
                </label>
                <label>
                  Keep newest active images
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={keep}
                    onChange={(e) => {
                      setKeep(e.target.value);
                      setPreview(null);
                    }}
                  />
                </label>
              </div>
              <button className="button" disabled={busy || !estate}>
                Preview files
              </button>
            </form>
          ) : (
            <p>Only an administrator can retire, restore or purge imagery.</p>
          )}
          {preview && (
            <div className="callout storage-preview">
              <h3>
                {preview.action === "retire" ? "Retirement" : "Permanent purge"}{" "}
                preview
              </h3>
              <p>
                {preview.files.length} files · {size(preview.bytes)}
                {preview.action === "retire"
                  ? " · space is released only after permanent purge."
                  : " will be removed from server storage."}
              </p>
              <div className="data-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Acquired</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.files.map((f) => (
                      <tr key={f.id}>
                        <td>{f.name}</td>
                        <td>{label(f.acquiredAt)}</td>
                        <td>{size(f.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.more && (
                <p>
                  First 100 files shown. Preview again after this batch to
                  process more.
                </p>
              )}
              {!preview.files.length ? (
                <p>
                  No eligible files. Retired images need 30 days before purge.
                </p>
              ) : (
                <>
                  <label>
                    Type {preview.action.toUpperCase()} to confirm this batch
                    <input
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={
                      busy || confirmation !== preview.action.toUpperCase()
                    }
                    onClick={() =>
                      run(async () => {
                        const { data: result } = await api.post(
                          "/storage/apply",
                          { token: preview.token, confirmation }
                        );
                        setPreview(null);
                        await load();
                        await onReload();
                        setNotice(
                          `${result.completed.length} files ${
                            result.action === "retire" ? "retired" : "purged"
                          }. ${
                            result.skipped.length
                          } protected, changed or unavailable files skipped.`
                        );
                      })
                    }
                  >
                    {preview.action === "retire"
                      ? "Retire listed files"
                      : "Permanently purge listed files"}
                  </button>
                </>
              )}
            </div>
          )}
          <h3>Retired images</h3>
          <div className="data-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Acquired</th>
                  <th>Purge available after</th>
                  <th>Recovery</th>
                </tr>
              </thead>
              <tbody>
                {data.retired.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{label(a.acquiredAt)}</td>
                    <td>{label(a.purgeAfter)}</td>
                    <td>
                      <button
                        className="button"
                        disabled={
                          !admin || busy || a.storageState !== "retired"
                        }
                        onClick={() =>
                          run(async () => {
                            await api.post(`/storage/${a.id}/restore`);
                            await load();
                            await onReload();
                            setNotice("Image restored.");
                          })
                        }
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.retired.length && <p>No retired images.</p>}
          <div className="table-pagination">
            <button
              className="button"
              disabled={!pageCursor || busy}
              onClick={() =>
                run(async () => {
                  await load(null);
                  setPageCursor(null);
                })
              }
            >
              First retired page
            </button>
            <span>Up to 100 files per page</span>
            <button
              className="button"
              disabled={!data.nextCursor || busy}
              onClick={() =>
                run(async () => {
                  await load(data.nextCursor);
                  setPageCursor(data.nextCursor);
                })
              }
            >
              Next retired page
            </button>
          </div>
          <p className="table-note">
            No automatic deletion is enabled. Server purge does not erase
            existing backups or downloaded offline copies; remove or replace
            those separately.
          </p>
        </>
      )}
    </section>
  );
}
