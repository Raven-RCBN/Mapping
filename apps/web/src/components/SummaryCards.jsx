export default function SummaryCards({ state, scope, offline, onReview }) {
  const { summary, status } = state;
  const n = (key) => (summary ? summary[key].toLocaleString() : "—");
  const waiting =
    status === "loading" ? "Loading totals…" : "Totals unavailable";
  return (
    <section aria-label="Activity summary" aria-busy={status === "loading"}>
      <p className="summary-scope">
        <strong>{offline ? "Saved offline totals" : "Totals for"}</strong>{" "}
        {scope}
      </p>
      <div className="stats">
        <article>
          <div className="stat-icon green">✓</div>
          <div>
            <span>Activities verified</span>
            <strong>
              {n("verified")} <small>/ {n("count")}</small>
            </strong>
            <p>
              {!summary
                ? waiting
                : summary.count
                ? `${Math.round(
                    (summary.verified / summary.count) * 100
                  )}% of selected records`
                : "No selected records"}
            </p>
          </div>
        </article>
        <article>
          <div className="stat-icon gold">◈</div>
          <div>
            <span>Harvest recorded</span>
            <strong>
              {n("bunches")} <small>bunches</small>
            </strong>
            <p>{summary ? "Selected harvesting records" : waiting}</p>
          </div>
        </article>
        <article>
          <div className="stat-icon blue">⌖</div>
          <div>
            <span>Field work</span>
            <strong>
              {n("mandays")} <small>mandays</small>
            </strong>
            <p>{summary ? "Selected field-activity records" : waiting}</p>
          </div>
        </article>
        <article className="alert-stat">
          <div className="stat-icon amber">!</div>
          <div>
            <span>Needs your attention</span>
            <strong>
              {n("pending")} <small>to review</small>
            </strong>
            <button
              className="text-button"
              disabled={!summary?.pending}
              onClick={onReview}
            >
              Review field alerts ↗
            </button>
          </div>
        </article>
      </div>
      {status === "error" && (
        <p className="summary-note" role="status">
          Unable to load totals. Reload the page to retry.
        </p>
      )}
      {summary?.count === 0 && (
        <p className="summary-note" role="status">
          No activity records match these dates and filters. Adjust the timeline
          dates or activity checkboxes to see other records.
        </p>
      )}
    </section>
  );
}
