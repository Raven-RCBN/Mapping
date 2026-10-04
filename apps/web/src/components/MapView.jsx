import { createPortal } from "react-dom";
import Overlay from "ol/Overlay";
import MapActivityPopup from "./MapActivityPopup";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Map from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import ImageLayer from "ol/layer/Image";
import VectorLayer from "ol/layer/Vector";
import TileLayer from "ol/layer/Tile";
import ImageStatic from "ol/source/ImageStatic";
import ImageWMS from "ol/source/ImageWMS";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj";
import { isEmpty } from "ol/extent";
import { Style, Fill, Stroke, Text, Circle as CircleStyle } from "ol/style";
import "ol/ol.css";
import { patch } from "../store";
import { imageBlob, authorisedFile, apiBase } from "../api";
import { imagesAt, types, label } from "../../../../packages/shared/timeline";
import { exactCoordinates } from "../../../../packages/shared/activities.js";
import { recordKey } from "../../../../packages/shared/mapped-records.js";
import {
  linkedFeatures,
  spreadPositions,
} from "../../../../packages/shared/map-placement.js";
import { gisLayerTypes, gisStyle } from "../map/gisLayers.js";
const geo = new GeoJSON();
const featuresOf = (json) =>
  geo.readFeatures(json, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });
export default function MapView({
  rows,
  pageOffset = 0,
  requestedRecord,
  onImport,
  onOffline,
}) {
  const state = useSelector((s) => s),
    dispatch = useDispatch(),
    host = useRef(),
    mapRef = useRef(),
    overlayRef = useRef(),
    pointsRef = useRef([]),
    popupElement = useMemo(() => document.createElement("div"), []),
    [popup, setPopup] = useState(null),
    fitRef = useRef(""),
    [notice, setNotice] = useState(""),
    [split, setSplit] = useState(50),
    [collapsed, setCollapsed] = useState(innerWidth < 600),
    [sample, setSample] = useState(null);
  const { data, selected, date, base, terrain, override, compare } = state;
  useEffect(() => {
    document.body.classList.toggle("topography-mode", base === "topography");
    return () => document.body.classList.remove("topography-mode");
  }, [base]);
  const images = imagesAt(
      state.data.paged ? state.mapAssets || [] : data.assets,
      selected,
      date,
      override
    ),
    estates = data.estates.filter((e) => selected.includes(e.id));
  const gisAssets = (data.paged ? state.mapAssets || [] : data.assets).filter(
    (a) => selected.includes(a.estateId) && a.kind === "vector"
  );
  const availableGisTypes = Object.entries(gisLayerTypes).filter(([type]) =>
    gisAssets.some((a) => a.layerType === type)
  );
  const gisCache = useRef(new globalThis.Map());
  useEffect(() => {
    const map = new Map({
      target: host.current,
      view: new View({ center: fromLonLat([102, 4]), zoom: 6 }),
    });
    mapRef.current = map;
    const overlay = new Overlay({
      element: popupElement,
      positioning: "bottom-center",
      offset: [0, -22],
      autoPan: { animation: { duration: 160 }, margin: 16 },
      stopEvent: true,
    });
    map.addOverlay(overlay);
    overlayRef.current = overlay;
    const popupResize = new ResizeObserver(() => {
      if (overlay.getPosition())
        overlay.panIntoView({ animation: { duration: 160 }, margin: 16 });
    });
    popupResize.observe(popupElement);
    const ro = new ResizeObserver(() => map.updateSize());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      popupResize.disconnect();
      map.setTarget(null);
      map.dispose();
    };
  }, []);
  useEffect(() => {
    overlayRef.current?.setPosition(popup?.coordinate);
  }, [popup]);
  useEffect(() => {
    if (!requestedRecord || !state.showActivities) return;
    const point = pointsRef.current.find(
      (p) => recordKey(p.record) === requestedRecord.recordKey
    );
    // Unmatched records stay in Data; do not invent a location on the map.
    if (point) setPopup(point);
    else {
      setPopup(null);
      setNotice(
        "This activity has no mapped location. Its records are available in Data."
      );
    }
  }, [requestedRecord]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const grids = [],
      layers = [],
      urls = [];
    setNotice("");
    setSample(null);
    setPopup(null);
    pointsRef.current = [];
    const add = (layer, z) => {
      layer.setZIndex(z);
      map.addLayer(layer);
      layers.push(layer);
      return layer;
    };
    const fs = estates.flatMap((e) =>
      featuresOf({
        type: "FeatureCollection",
        features: (e.boundary?.features || []).map((f) => ({
          ...f,
          properties: { ...f.properties, estateId: e.id, estateName: e.name },
        })),
      })
    );
    const source = new VectorSource({ features: fs });
    const linked = (r) => linkedFeatures(r, data.blocks || [], fs);
    if (state.showBoundaries || state.showLabels)
      add(
        new VectorLayer({
          source,
          style: (f) => {
            const r = rows.find((r) => linked(r).includes(f)),
              color =
                base === "topography"
                  ? "#17412b"
                  : types[r?.type]?.color || "#d6bf67";
            return new Style({
              stroke: state.showBoundaries
                ? new Stroke({ color, width: r ? 2.4 : 1.3 })
                : undefined,
              fill: state.showBoundaries
                ? new Fill({
                    color:
                      color +
                      Math.round(
                        (base === "topography" ? 0.04 : state.opacity / 100) *
                          255
                      )
                        .toString(16)
                        .padStart(2, "0"),
                  })
                : undefined,
              text: state.showLabels
                ? new Text({
                    text: f.get("blockName"),
                    font: "12px sans-serif",
                    fill: new Fill({ color: "#173f2d" }),
                    stroke: new Stroke({ color: "#fff6db", width: 3 }),
                    overflow: false,
                  })
                : undefined,
            });
          },
        }),
        20
      );
    const focusFeatures =
      state.block !== "all"
        ? linked({
            estateId: state.block.split("::")[0],
            blockId: data.blocks.find(
              (b) => `${b.estateId}::${b.blockCode}` === state.block
            )?.id,
            recordKind: "field",
          })
        : fs;
    const focusSource = new VectorSource({ features: focusFeatures });
    const key = selected.join(",") + fs.length + state.block;
    if (key !== fitRef.current && !isEmpty(focusSource.getExtent())) {
      fitRef.current = key;
      map.getView().fit(focusSource.getExtent(), {
        padding: [60, 60, 60, 60],
        maxZoom: state.block === "all" ? 16 : 19,
      });
    }
    if (state.showActivities) {
      const byBlock = new globalThis.Map();
      for (const r of rows) {
        const features = linked(r);
        // A GPS coordinate alone does not bypass the confirmed block requirement.
        if (!features.length) continue;
        const key = `${r.estateId}::${r.blockId}`;
        if (!byBlock.has(key)) byBlock.set(key, { features, rows: [] });
        byBlock.get(key).rows.push(r);
      }
      const positions = new globalThis.Map();
      for (const { features, rows: blockRows } of byBlock.values()) {
        const approximate = blockRows
          .filter((r) => !exactCoordinates(r))
          .sort((a, b) => recordKey(a).localeCompare(recordKey(b)));
        const points = spreadPositions(features, approximate.length);
        approximate.forEach((r, i) => positions.set(recordKey(r), points[i]));
        blockRows
          .filter(exactCoordinates)
          .forEach((r) =>
            positions.set(recordKey(r), fromLonLat(exactCoordinates(r)))
          );
      }
      add(
        new VectorLayer({
          source: new VectorSource({
            features: rows.flatMap((r, i) => {
              const p = positions.get(recordKey(r));
              if (!p) return [];
              pointsRef.current.push({ record: r, coordinate: p });
              const feature = new Feature({
                geometry: new Point(p),
                record: r,
              });
              feature.setStyle(
                new Style({
                  image: new CircleStyle({
                    radius: 12,
                    fill: new Fill({
                      color: types[r.type]?.color || "#d8ae40",
                    }),
                    stroke: new Stroke({ color: "#fff", width: 1.5 }),
                  }),
                  text: new Text({
                    text: String(pageOffset + i + 1),
                    font: "bold 10px sans-serif",
                    fill: new Fill({ color: "#153f2b" }),
                  }),
                })
              );
              return [feature];
            }),
          }),
        }),
        30
      );
    }
    async function raster(asset, z = 1) {
      const blob = await imageBlob(asset);
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const b = asset.bounds;
      return add(
        new ImageLayer({
          source: new ImageStatic({
            url,
            imageExtent: transformExtent(
              [b[0][1], b[0][0], b[1][1], b[1][0]],
              "EPSG:4326",
              "EPSG:3857"
            ),
            projection: "EPSG:3857",
            attributions: asset.attribution || "",
          }),
        }),
        z
      );
    }
    async function loadGis() {
      await Promise.all(
        gisAssets
          .filter((a) => !(state.hiddenGisLayers || []).includes(a.layerType))
          .map(async (asset) => {
            try {
              const cacheKey = asset.id + asset.sha256;
              let json = gisCache.current.get(cacheKey);
              if (!json) {
                json = JSON.parse(await (await imageBlob(asset)).text());
                if (gisCache.current.size >= 32) gisCache.current.clear();
                gisCache.current.set(cacheKey, json);
              }
              if (cancelled) return;
              add(
                new VectorLayer({
                  source: new VectorSource({
                    features: featuresOf(json),
                    attributions: asset.attribution,
                  }),
                  declutter: asset.layerType === "poi",
                  style: gisStyle(asset.layerType, state.showLabels),
                }),
                gisLayerTypes[asset.layerType]?.z || 15
              );
            } catch {
              if (!cancelled)
                setNotice(
                  "A GIS layer could not load. Reconnect or save this estate for offline use."
                );
            }
          })
      );
    }
    loadGis();
    async function load() {
      try {
        if (base === "road") {
          if (data.offline) {
            setNotice(
              "Road tiles need a connection. Select saved imagery or topography."
            );
            return;
          }
          add(new TileLayer({ source: new OSM() }), 0);
          return;
        }
        if (base === "satellite") {
          if (!images.length)
            setNotice(
              "No image on or before this date for the selected estates."
            );
          for (const a of images) await raster(a);
          if (compare) {
            const other = (
              state.data.paged ? state.mapAssets || [] : data.assets
            ).find((a) => a.id === compare && selected.includes(a.estateId));
            if (other) {
              const layer = await raster(other, 2);
              if (layer) {
                layer.on("prerender", (e) => {
                  const ctx = e.context;
                  ctx.save();
                  ctx.beginPath();
                  ctx.rect(
                    0,
                    0,
                    (ctx.canvas.width * split) / 100,
                    ctx.canvas.height
                  );
                  ctx.clip();
                });
                layer.on("postrender", (e) => e.context.restore());
              }
            }
          }
        } else {
          for (const e of estates) {
            const a = (
              state.data.paged ? state.mapAssets || [] : data.assets
            ).find((a) => a.estateId === e.id && a.kind === terrain);
            if (!a) continue;
            // Offline exports are kept under the live QGIS map as an immediate fallback.
            await raster(a);
            if (!data.offline && e.qgis) {
              const wms = new ImageWMS({
                url: `${apiBase}/estates/${e.id}/qgis`,
                params: {
                  LAYERS: terrain,
                  VERSION: "1.1.1",
                  FORMAT: "image/png",
                  TRANSPARENT: true,
                },
                ratio: 1,
                serverType: "qgis",
                imageLoadFunction: (image, url) => {
                  authorisedFile(url)
                    .then((blob) => {
                      if (cancelled) return;
                      const u = URL.createObjectURL(blob);
                      urls.push(u);
                      image.getImage().src = u;
                    })
                    .catch(() => {
                      if (!cancelled)
                        setNotice(
                          "QGIS service unavailable. Showing the saved QGIS terrain export."
                        );
                    });
                },
              });
              add(new ImageLayer({ source: wms }), 3);
            }
          }
          if (
            !(state.data.paged ? state.mapAssets || [] : data.assets).some(
              (a) => selected.includes(a.estateId) && a.kind === terrain
            )
          )
            setNotice("No terrain added for the selected estates.");
          if (state.contours)
            for (const a of (state.data.paged
              ? state.mapAssets || []
              : data.assets
            ).filter(
              (a) => selected.includes(a.estateId) && a.kind === "contours"
            )) {
              const json = JSON.parse(await (await imageBlob(a)).text());
              if (!cancelled)
                add(
                  new VectorLayer({
                    source: new VectorSource({ features: featuresOf(json) }),
                    style: new Style({
                      stroke: new Stroke({ color: "#88652c99", width: 1 }),
                    }),
                  }),
                  10
                );
            }
          for (const a of (state.data.paged
            ? state.mapAssets || []
            : data.assets
          ).filter(
            (a) => selected.includes(a.estateId) && a.kind === "elevation-grid"
          ))
            grids.push(JSON.parse(await (await imageBlob(a)).text()));
        }
      } catch (e) {
        if (!cancelled)
          setNotice(e.message || "Save this estate for offline use.");
      }
    }
    load();
    const inspect = (e) => {
      const record = map.forEachFeatureAtPixel(
        e.pixel,
        (f) =>
          f.get("record")
            ? {
                record: f.get("record"),
                coordinate: f.getGeometry().getCoordinates(),
              }
            : undefined,
        { hitTolerance: 3 }
      );
      if (record) {
        setPopup(record);
        setSample(null);
        return;
      }
      setPopup(null);
      const feature = map.forEachFeatureAtPixel(e.pixel, (f) =>
        f.get("blockName") ? f : undefined
      );
      if (feature)
        dispatch(
          patch({
            selectedBlock: `${feature.get("estateId")}::${feature.get(
              "blockName"
            )}`,
          })
        );
      if (base !== "topography") return;
      const [lon, lat] = toLonLat(e.coordinate);
      for (const g of grids) {
        const t = g.transform,
          x = Math.floor((lon - t[0]) / t[1]),
          y = Math.floor((lat - t[3]) / t[5]);
        if (x < 0 || y < 0 || x >= g.width || y >= g.height) continue;
        const z = g.values[y][x];
        if (Number.isFinite(z) && z > -9000) {
          setSample(Math.round(z));
          return;
        }
      }
      setSample(null);
    };
    map.on("singleclick", inspect);
    return () => {
      cancelled = true;
      map.un("singleclick", inspect);
      layers.forEach((l) => {
        map.removeLayer(l);
        l.dispose();
      });
      urls.forEach(URL.revokeObjectURL);
    };
  }, [
    state.mapAssets,
    data,
    selected,
    date,
    base,
    terrain,
    override,
    compare,
    split,
    rows,
    state.contours,
    state.showActivities,
    state.showBoundaries,
    state.showLabels,
    state.hiddenGisLayers,
    state.opacity,
    state.block,
    pageOffset,
  ]);
  return (
    <div className="map-stage">
      <div ref={host} id="estateMap" />
      {popup &&
        createPortal(
          <MapActivityPopup
            key={recordKey(popup.record)}
            record={popup.record}
            onClose={() => setPopup(null)}
          />,
          popupElement
        )}
      <div className={"map-layer-panel " + (collapsed ? "collapsed" : "")}>
        <h3>
          Map layers{" "}
          <button
            aria-label="Toggle map layers"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "+" : "−"}
          </button>
        </h3>
        {!collapsed && (
          <>
            <div className="base-tabs">
              {["satellite", "road", "topography"].map((b) => (
                <button
                  key={b}
                  className={base === b ? "active" : ""}
                  onClick={() => dispatch(patch({ base: b, compare: null }))}
                >
                  {b[0].toUpperCase() + b.slice(1)}
                </button>
              ))}
            </div>
            {base === "topography" && (
              <>
                <select
                  aria-label="Terrain style"
                  value={terrain}
                  onChange={(e) => dispatch(patch({ terrain: e.target.value }))}
                >
                  <option value="terrain">Elevation</option>
                  <option value="hillshade">Hillshade</option>
                  <option value="slope">Slope</option>
                </select>
                <label>
                  <input
                    type="checkbox"
                    checked={state.contours}
                    onChange={(e) =>
                      dispatch(patch({ contours: e.target.checked }))
                    }
                  />
                  Contours · 10 m
                </label>
                <small>QGIS · Copernicus 30 m surface model</small>
              </>
            )}
            {[
              ["showBoundaries", "Block boundaries"],
              ["showActivities", "Field activities"],
              ["showLabels", "Block labels"],
            ].map(([key, title]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={state[key]}
                  onChange={(e) => dispatch(patch({ [key]: e.target.checked }))}
                />
                {title}
              </label>
            ))}
            {availableGisTypes.length > 0 && (
              <div className="gis-layer-options" aria-label="Estate GIS layers">
                <small>Estate layers</small>
                {availableGisTypes.map(([type, info]) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      aria-label={info.label}
                      checked={!(state.hiddenGisLayers || []).includes(type)}
                      onChange={(event) =>
                        dispatch(
                          patch({
                            hiddenGisLayers: event.target.checked
                              ? (state.hiddenGisLayers || []).filter(
                                  (t) => t !== type
                                )
                              : [...(state.hiddenGisLayers || []), type],
                          })
                        )
                      }
                    />
                    <i style={{ background: info.color }} aria-hidden="true" />
                    <span>{info.label}</span>
                    <small>
                      {gisAssets
                        .filter((a) => a.layerType === type)
                        .reduce((n, a) => n + (a.featureCount || 0), 0)}
                    </small>
                  </label>
                ))}
              </div>
            )}
            <div className="opacity">
              <span>Overlay opacity</span>
              <b>{state.opacity}%</b>
              <input
                aria-label="Overlay opacity"
                type="range"
                min="0"
                max="80"
                value={state.opacity}
                onChange={(e) => dispatch(patch({ opacity: +e.target.value }))}
              />
            </div>
            <button className="text-button" onClick={onImport}>
              ＋ Import a map or image
            </button>
            <button className="text-button" onClick={onOffline}>
              ⇩ Save offline maps
            </button>
          </>
        )}
      </div>
      {sample !== null && (
        <button className="elevation-sample" onClick={() => setSample(null)}>
          Surface elevation ≈ {sample} m · Copernicus 30 m cells ×
        </button>
      )}
      <div className="map-caption">
        <span className="status-dot" />
        <b>{label(date)}</b>
        <span>{data.offline ? "Offline map" : "Map + activity timeline"}</span>
      </div>
      {notice && <div id="mapNotice">{notice}</div>}
      <div id="mapSourceLabel">
        {base === "topography"
          ? "Copernicus GLO-30 · acquired mainly 2011–2015 · surface elevation, includes canopy"
          : images
              .map(
                (a) =>
                  `${estates.find((e) => e.id === a.estateId)?.name} · ${
                    a.name
                  }`
              )
              .join(" | ")}
      </div>
      {base === "topography" && (
        <div id="terrainLegend">
          <b>
            {terrain === "slope"
              ? "Slope · degrees"
              : "Surface elevation · metres"}
          </b>
          <div className="ramp" />
          <small>
            Click for a native elevation sample.
            <br />
            30 m cells · ground accuracy unverified
          </small>
        </div>
      )}
      {compare && (
        <div id="imageSwipe">
          <input
            aria-label="Image comparison divider"
            type="range"
            min="0"
            max="100"
            value={split}
            onChange={(e) => setSplit(+e.target.value)}
          />
        </div>
      )}
      <div className="map-legend">
        {Object.entries(types)
          .filter(([t]) =>
            rows.some((r) => selected.includes(r.estateId) && r.type === t)
          )
          .map(([t, v]) => (
            <span key={t}>
              <i style={{ background: v.color }} />
              {t}
            </span>
          ))}
      </div>
    </div>
  );
}
