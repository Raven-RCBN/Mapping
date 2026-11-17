import { useMemo, useState } from "react";
import {
  fertiliserAnalysis,
  fertiliserMapLayer,
} from "./shared/hts-analysis.js";
import { fertiliserYield } from "./shared/fertiliser-yield.js";
const n = (v: any, d = 2) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("en-GB", { maximumFractionDigits: d });
export default function FertiliserAnalytics({
  data,
  onMap,
}: {
  data: any;
  onMap: (layer: any) => void;
}) {
  const years = [
    ...new Set((data?.fertiliserSections || []).map((r: any) => r.year)),
  ].sort((a: any, b: any) => b - a);
  const [year, setYear] = useState(String(years[0] || "")),
    [division, setDivision] = useState(""),
    [block, setBlock] = useState(""),
    [product, setProduct] = useState("solids"),
    [metric, setMetric] = useState("quantity");
  const valid =
    Array.isArray(data?.fertiliser) &&
    Array.isArray(data?.products) &&
    Array.isArray(data?.fertiliserSections);
  const a = useMemo(
    () =>
      valid
        ? fertiliserAnalysis(data, { year, division, block, product, metric })
        : null,
    [data, year, division, block, product, metric, valid],
  );
  if (!a)
    return (
      <p className="empty">
        Annual block fertiliser is not saved on this phone. Connect online and
        check for updates. Availability follows your webapp access.
      </p>
    );
  const yieldRow = fertiliserYield(data, data.annualProduction || [], {
    division,
    block,
    product,
  }).rows.find((r) => String(r.year) === year);
  const unit =
    product === "solids" ? "kg" : data.products[Number(product)]?.unit;
  const divisions = [
    ...new Set(data.fertiliser.map((r: any) => r.division)),
  ].sort();
  const codes = [
    ...new Set(
      data.fertiliser
        .filter(
          (r: any) => r.mapBlockCode && (!division || r.division === division),
        )
        .map((r: any) => r.mapBlockCode),
    ),
  ].sort((a: any, b: any) => a.localeCompare(b, undefined, { numeric: true }));
  function show() {
    const result = fertiliserAnalysis(data, {
      year,
      division,
      block,
      product,
      metric: unit === "kg" ? "perPalm" : metric,
    });
    onMap(
      fertiliserMapLayer(result, {
        estateId: data.estateId,
        year,
        division,
        productLabel:
          product === "solids"
            ? "Solid fertiliser"
            : data.products[Number(product)].name,
        unit:
          unit === "kg"
            ? "kg/palm"
            : metric === "perHa"
              ? unit + "/mapped ha"
              : unit,
      }),
    );
  }
  return (
    <section aria-label="Annual block fertiliser">
      <h3>Annual block fertiliser</h3>
      <div className="fertiliser-controls">
        <label>
          Year
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y: any) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Division
          <select
            value={division}
            onChange={(e) => {
              setDivision(e.target.value);
              setBlock("");
            }}
          >
            <option value="">All divisions</option>
            {divisions.map((d: any) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Map block
          <select value={block} onChange={(e) => setBlock(e.target.value)}>
            <option value="">All mapped blocks</option>
            {codes.map((c: any) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Product
          <select
            value={product}
            onChange={(e) => {
              setProduct(e.target.value);
              setMetric("quantity");
            }}
          >
            <option value="solids">All solid fertilisers</option>
            {data.products.map((p: any, i: number) => (
              <option key={i} value={i}>
                {p.name} ({p.unit})
              </option>
            ))}
          </select>
        </label>
        <label>
          Measure
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="quantity">Quantity ({unit})</option>
            {unit === "kg" && (
              <option value="bags">50 kg bag equivalents</option>
            )}
            <option value="perHa">{unit} per mapped hectare</option>
          </select>
        </label>
      </div>
      <button
        className="fertiliser-map-button"
        disabled={!a.blocks.length}
        onClick={show}
      >
        Show on map
      </button>
      <div className="metric-grid">
        <article>
          <span>Mapped quantity</span>
          <strong>
            {n(a.quantity)} {unit}
          </strong>
        </article>
        {unit === "kg" && (
          <>
            <article>
              <span>50 kg bag equivalents</span>
              <strong>{n(a.quantity == null ? null : a.quantity / 50)}</strong>
            </article>
            <article>
              <span>Kg/Palm</span>
              <strong>{n(a.kgPerPalm)}</strong>
            </article>
          </>
        )}
        <article>
          <span>MT/Ha</span>
          <strong>{n(yieldRow?.mtPerHa)}</strong>
        </article>
        <article>
          <span>Polygons with records</span>
          <strong>{a.blocks.length}</strong>
        </article>
        <article>
          <span>Mapped area</span>
          <strong>{n(a.area)} ha</strong>
        </article>
      </div>
      <div className="production-table">
        <table>
          <thead>
            <tr>
              <th>Map block</th>
              <th>
                {metric === "bags"
                  ? "Bag eq."
                  : metric === "perHa"
                    ? unit + "/ha"
                    : unit}
              </th>
              <th>Map ha</th>
            </tr>
          </thead>
          <tbody>
            {a.blocks.map((b: any) => (
              <tr key={b.mapBlockCode}>
                <td>
                  <button onClick={() => setBlock(b.mapBlockCode)}>
                    {b.mapBlockCode}
                  </button>
                  <small>
                    {b.sourceBlocks.join(" + ")} / {b.divisions.join(", ")}
                  </small>
                </td>
                <td>{n(b.value)}</td>
                <td>{n(b.mapHa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!a.blocks.length && (
          <p className="empty">No records for this selection.</p>
        )}
      </div>
      <p className="source-note">
        {data.unitBasis} Solid fertiliser map colours show kg per palm, matching
        the webapp. Grey means no available value. {a.unmapped.length} unlinked
        source records excluded from map totals.
      </p>
    </section>
  );
}
