import CompactSelect from "./CompactSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BottomSheet,
  Carousel,
  KeyboardInput,
  MobileScroll,
  useKeyboardInsets,
  useKeyboard,
  useScreenPortal,
  useMobileDevice,
} from "./mobile";
import {
  LayersIcon,
  GlobeIcon,
  BarChartIcon,
  DownloadIcon,
  PersonIcon,
  ChevronDownIcon,
  CheckCircledIcon,
  UpdateIcon,
  Cross2Icon,
  PlusIcon,
  MinusIcon,
  MagnifyingGlassIcon,
  ArrowRightIcon,
  MixerHorizontalIcon,
  LockClosedIcon,
  Crosshair1Icon,
} from "@radix-ui/react-icons";
import Map from "ol/Map";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import ImageLayer from "ol/layer/Image";
import VectorSource from "ol/source/Vector";
import ImageStatic from "ol/source/ImageStatic";
import GeoJSON from "ol/format/GeoJSON";
import { transformExtent, fromLonLat } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import CircleGeometry from "ol/geom/Circle";
import { downloadNearby, savedNearby, type Fix, type Nearby } from "./location";
import { Fill, Stroke, Style, Text, Circle as CircleStyle } from "ol/style";
import "ol/ol.css";
import geo from "./data/map.json";
import production from "./data/production.json";
import imagery from "./data/imagery.json";
import "./prototype.css";
import { selectBlockFeatures, selectionStyles } from "./map-selection.js";

import FertiliserAnalytics from "./FertiliserAnalytics";
import { fertiliserColour } from "./shared/hts-analysis.js";

const bridge = (window as any).MapIntelAndroid;
const live = (window as any).__MAPINTEL_DATA__?.meta;
const num = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : v.toLocaleString("en-GB", { maximumFractionDigits: d });
const dateLabel = (v: string) =>
  new Date(v + "T12:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
type Tab = "Map" | "Production" | "Analytics" | "Offline";
type Mode = "Road map" | "Satellite" | "Topography" | "Estate mosaic";
const layerNames: Record<string, string> = {
  blocks: "Block boundaries",
  labels: "Block labels",
  "land-use": "Land use",
  rivers: "Rivers · areas",
  "river-lines": "Rivers · waterways",
  roads: "Roads · areas",
  "road-lines": "Roads · routes",
  buildings: "Buildings",
  poi: "Points of interest",
};
const colors: Record<string, string> = {
  "land-use": "#8cb677",
  rivers: "#42c4e7",
  "river-lines": "#42c4e7",
  roads: "#efc16e",
  "road-lines": "#dfad5d",
  buildings: "#ed9e7a",
  poi: "#d99cf5",
  blocks: "#3f7150",
};
const icons = {
  Map: GlobeIcon,
  Production: BarChartIcon,
  Analytics: MixerHorizontalIcon,
  Offline: DownloadIcon,
};

function EstateMap({
  mode,
  date,
  layers,
  selected,
  onSelect,
  highlights,
  onReady,
  fix,
  nearby,
  focus,
  fertiliserLayer,
}: {
  mode: Mode;
  date: string;
  layers: Record<string, boolean>;
  selected: string;
  onSelect: (s: string) => void;
  highlights: string[];
  onReady: (m: Map) => void;
  fix: Fix | null;
  nearby: Nearby | null;
  focus: number;
  fertiliserLayer: any;
}) {
  const [imageStatus, setImageStatus] = useState("ready");
  const el = useRef<HTMLDivElement>(null),
    map = useRef<Map | null>(null),
    selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  useEffect(() => {
    const m = new Map({
      target: el.current!,
      controls: [],
      view: new View({ center: [0, 0], zoom: 12 }),
    });
    map.current = m;
    onReady(m);
    m.on("singleclick", (e) => {
      const code = m.forEachFeatureAtPixel(e.pixel, (f) => f.get("blockName"));
      if (code) selectRef.current(String(code));
    });
    const ro = new ResizeObserver(() => m.updateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.setTarget(undefined);
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.getLayers().clear();
    const format = new GeoJSON();
    if (mode !== "Road map") {
      const bounds =
        mode === "Estate mosaic"
          ? imagery.mosaic.bounds
          : mode === "Topography"
            ? imagery.terrain
            : (imagery as any)[date].bounds;
      const src =
        mode === "Estate mosaic"
          ? "mosaic.webp"
          : mode === "Topography"
            ? "terrain.png"
            : date + ".png";
      const source = new ImageStatic({
        url: "/estate/" + src,
        imageExtent: transformExtent(
          [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]],
          "EPSG:4326",
          "EPSG:3857",
        ),
      });
      setImageStatus("loading");
      source.on("imageloadend", () => setImageStatus("ready"));
      source.on("imageloaderror", () => setImageStatus("unavailable"));
      m.addLayer(new ImageLayer({ source }));
    } else setImageStatus("ready");
    for (const [key, collection] of Object.entries(geo)) {
      if (!layers[key]) continue;
      const source = new VectorSource({
        features: format.readFeatures(collection, {
          featureProjection: "EPSG:3857",
        }),
      });
      m.addLayer(
        new VectorLayer({
          source,
          style: (f, res) => {
            const code = String(f.get("blockName") || ""),
              color = colors[key];
            return new Style({
              fill: new Fill({
                color:
                  key === "blocks"
                    ? mode === "Road map"
                      ? "#cbd7a880"
                      : "#d2dfae18"
                    : key === "land-use"
                      ? "#a2be8670"
                      : color + "90",
              }),
              stroke: new Stroke({
                color: key === "blocks" ? "#647943" : color,
                width: key === "blocks" ? 1 : 1.4,
              }),
              image:
                key === "poi"
                  ? new CircleStyle({
                      radius: 3.5,
                      fill: new Fill({ color }),
                      stroke: new Stroke({ color: "#554162", width: 1 }),
                    })
                  : undefined,
              text:
                key === "blocks" && layers.labels && res < 23
                  ? new Text({
                      text: code,
                      font: "600 11px system-ui",
                      fill: new Fill({ color: "#254b35" }),
                      stroke: new Stroke({ color: "#fff", width: 2.5 }),
                      overflow: false,
                    })
                  : undefined,
            });
          },
        }),
      );
      if (key === "blocks" && !m.get("fitted")) {
        m.updateSize();
        m.getView().fit(source.getExtent(), { padding: [35, 22, 40, 22] });
        m.set("fitted", true);
      }
    }
    if (fertiliserLayer)
      m.addLayer(
        new VectorLayer({
          source: new VectorSource({
            features: format.readFeatures(geo.blocks, {
              featureProjection: "EPSG:3857",
            }),
          }),
          zIndex: 94,
          style: (f) => {
            const code = String(f.get("blockName") || "");
            const value = fertiliserLayer.values[code];
            return new Style({
              fill: new Fill({
                color: Number.isFinite(value)
                  ? fertiliserColour(
                      value,
                      fertiliserLayer.max,
                      fertiliserLayer.bands,
                    ) + "dd"
                  : "#e7e9ec99",
              }),
              stroke: new Stroke({ color: "#315b62", width: 1.5 }),
              text: layers.labels
                ? new Text({
                    text: code,
                    font: "11px Roboto",
                    fill: new Fill({ color: "#143e2c" }),
                    stroke: new Stroke({ color: "#fff", width: 3 }),
                  })
                : undefined,
            });
          },
        }),
      );
    const outlined = selectBlockFeatures(geo.blocks, selected, highlights);
    if (outlined.length)
      m.addLayer(
        new VectorLayer({
          source: new VectorSource({
            features: format.readFeatures(
              { type: "FeatureCollection", features: outlined },
              { featureProjection: "EPSG:3857" },
            ),
          }),
          zIndex: 95,
          style: selectionStyles,
        }),
      );
  }, [mode, date, layers, selected, highlights, fertiliserLayer]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const added: any[] = [];
    if (nearby) {
      const source = new VectorSource({
        features: new GeoJSON().readFeatures(nearby.geojson, {
          featureProjection: "EPSG:3857",
        }),
      });
      const l = new VectorLayer({
        source,
        zIndex: 90,
        style: (f) =>
          new Style({
            stroke: new Stroke({
              color:
                f.get("kind") === "water"
                  ? "#4fb9d3"
                  : f.get("kind") === "building"
                    ? "#a5a890"
                    : "#a5a178",
              width: f.get("kind") === "road" ? 3 : 1,
            }),
            fill: new Fill({
              color: f.get("kind") === "water" ? "#a9dae8" : "#d3d4bf",
            }),
            text: f.get("name")
              ? new Text({
                  text: f.get("name"),
                  font: "10px Roboto",
                  fill: new Fill({ color: "#59634d" }),
                  stroke: new Stroke({ color: "#fff", width: 3 }),
                })
              : undefined,
          }),
      });
      m.addLayer(l);
      added.push(l);
    }
    if (fix) {
      const point = fromLonLat([fix.longitude, fix.latitude]);
      const dot = new Feature(new Point(point)),
        accuracy = new Feature(
          new CircleGeometry(
            point,
            Math.min(fix.accuracy, 5000) /
              Math.max(0.15, Math.cos((fix.latitude * Math.PI) / 180)),
          ),
        );
      accuracy.setStyle(
        new Style({
          fill: new Fill({ color: "#337be928" }),
          stroke: new Stroke({ color: "#337be977", width: 1 }),
        }),
      );
      dot.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: fix.demo ? "#b28a30" : "#2679da" }),
            stroke: new Stroke({ color: "#fff", width: 3 }),
          }),
        }),
      );
      const l = new VectorLayer({
        source: new VectorSource({ features: [accuracy, dot] }),
        zIndex: 100,
      });
      m.addLayer(l);
      added.push(l);
    }
    return () => added.forEach((l) => m.removeLayer(l));
  }, [fix, nearby, mode, date, layers, selected, highlights]);
  useEffect(() => {
    if (focus && fix)
      map.current?.getView().animate({
        center: fromLonLat([fix.longitude, fix.latitude]),
        zoom: 16,
        duration: 450,
      });
  }, [focus]);
  return (
    <>
      <div
        ref={el}
        className="estate-map"
        data-image-status={imageStatus}
        role="img"
        aria-label="Interactive saved estate map"
        data-scroll-drag="ignore"
      />
      {imageStatus === "loading" && (
        <div className="map-loading" role="status">
          <div className="loading-logo">
            <img className="loading-a" src="/estate/logo.png" alt="" />
          </div>
          <span>Please wait while loading</span>
        </div>
      )}
    </>
  );
}

export default function Prototype() {
  const { setDeviceId } = useMobileDevice();
  useEffect(() => setDeviceId("pixel-10"), []);
  const { bottomInset } = useKeyboardInsets();
  const keyboard = useKeyboard();
  const { screenRef } = useScreenPortal();
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const reset = () => {
      if (screen.scrollTop || screen.scrollLeft) screen.scrollTo(0, 0);
    };
    screen.addEventListener("scroll", reset);
    return () => screen.removeEventListener("scroll", reset);
  }, [screenRef]);
  const [tab, setTab] = useState<Tab>(
      live?.allowMap === false ? "Production" : "Map",
    ),
    [mode, setMode] = useState<Mode>("Road map"),
    [date] = useState(live?.imageDate || "2026-09-30");
  const [analyticsKind, setAnalyticsKind] = useState("production"),
    [fertiliserLayer, setFertiliserLayer] = useState<any>(null);
  const [sheet, setSheet] = useState(""),
    [layers, setLayers] = useState<Record<string, boolean>>(
      Object.fromEntries(Object.keys(layerNames).map((k) => [k, true])),
    ),
    [selected, setSelected] = useState(""),
    [highlights, setHighlights] = useState<string[]>([]),
    [search, setSearch] = useState("");
  const [offline, setOffline] = useState(
      bridge ? !bridge.isOnline() : !navigator.onLine,
    ),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState(""),
    [lastCheck, setLastCheck] = useState(""),
    [access] = useState("Production & analytics");
  const [year, setYear] = useState(live?.latestYear || 2026),
    [month, setMonth] = useState(live?.latestMonth || "2026-07"),
    [period, setPeriod] = useState(
      live?.allowMonthly === false ? "Yearly" : "Monthly",
    ),
    [comparison, setComparison] = useState("above"),
    [threshold, setThreshold] = useState("20");
  const mapRef = useRef<Map | null>(null);
  useEffect(() => {
    if (!bridge) return;
    setSaved(true);
    setLastCheck(live?.checkedAt || "");
    const status = (e: any) => {
      setBusy(!!e.detail.busy);
      if (e.detail.message) setMessage(e.detail.message);
      if (e.detail.checkedAt) setLastCheck(e.detail.checkedAt);
    };
    const network = (e: any) => setOffline(!e.detail.online);
    const gps = (e: any) => {
      if (e.detail.error) {
        setGpsBusy(false);
        setGpsLive(false);
        setMessage(e.detail.error);
        return;
      }
      const f = e.detail as Fix;
      setFix(f);
      setGpsLive(Date.now() - f.timestamp < 60000);
      if (Date.now() - f.timestamp < 60000) setGpsBusy(false);
      try {
        localStorage.setItem("mapintel-last-fix", JSON.stringify(f));
      } catch {}
      if (firstFix.current && Date.now() - f.timestamp < 60000) {
        setFocus((v) => v + 1);
        {
          firstFix.current = false;
          void nearbyMap(f);
        }
      }
    };
    window.addEventListener("mapintel-status", status);
    window.addEventListener("mapintel-network", network);
    window.addEventListener("mapintel-location", gps);
    return () => {
      window.removeEventListener("mapintel-status", status);
      window.removeEventListener("mapintel-network", network);
      window.removeEventListener("mapintel-location", gps);
    };
  }, []);
  const [fix, setFix] = useState<Fix | null>(null),
    [nearby, setNearby] = useState<Nearby | null>(null),
    [focus, setFocus] = useState(0),
    [gpsBusy, setGpsBusy] = useState(false),
    [gpsLive, setGpsLive] = useState(false),
    [nearbyBusy, setNearbyBusy] = useState(false);
  const watch = useRef<number | null>(null),
    firstFix = useRef(false),
    nearbyAttempt = useRef(0),
    onlineRef = useRef(!offline);
  onlineRef.current = !offline;
  useEffect(() => {
    try {
      const old = localStorage.getItem("mapintel-last-fix");
      if (old) {
        const f = JSON.parse(old);
        if (Number.isFinite(f.longitude) && Number.isFinite(f.latitude))
          setFix(f);
      }
    } catch {}
    savedNearby()
      .then(setNearby)
      .catch(() => {});
    return () => {
      if (watch.current != null)
        navigator.geolocation.clearWatch(watch.current);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (fix && !fix.demo && Date.now() - fix.timestamp > 60000)
        setGpsLive(false);
    }, 10000);
    return () => clearInterval(timer);
  }, [fix]);
  async function nearbyMap(f: Fix) {
    if (
      !onlineRef.current ||
      f.demo ||
      Date.now() - f.timestamp > 60000 ||
      Date.now() - nearbyAttempt.current < 60000
    )
      return;
    nearbyAttempt.current = Date.now();
    setNearbyBusy(true);
    try {
      setNearby(await downloadNearby(f));
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Nearby map could not be saved.",
      );
    } finally {
      setNearbyBusy(false);
    }
  }
  useEffect(() => {
    if (!offline && gpsLive && fix && !nearby) void nearbyMap(fix);
  }, [offline, gpsLive]);
  function showLocation() {
    setSheet("");
    if (bridge) {
      firstFix.current = true;
      setGpsBusy(true);
      bridge.requestLocation();
      return;
    }
    if (!navigator.geolocation) {
      setMessage("Location is unavailable on this device.");
      return;
    }
    if (watch.current != null) {
      if (fix) setFocus((v) => v + 1);
      return;
    }
    firstFix.current = true;
    setGpsBusy(true);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const f: Fix = {
          longitude: p.coords.longitude,
          latitude: p.coords.latitude,
          accuracy: p.coords.accuracy,
          timestamp: p.timestamp,
        };
        setFix(f);
        setGpsLive(true);
        setGpsBusy(false);
        try {
          localStorage.setItem("mapintel-last-fix", JSON.stringify(f));
        } catch {}
        if (firstFix.current) {
          setFocus((v) => v + 1);
          if (Date.now() - f.timestamp < 60000) {
            firstFix.current = false;
            void nearbyMap(f);
          }
        }
      },
      (e) => {
        setGpsBusy(false);
        setGpsLive(false);
        if (watch.current != null)
          navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
        setMessage(
          e.code === 1
            ? "Location permission was denied. Allow location access in device settings."
            : "No GPS fix available. Please try again.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }
  function stopLocation() {
    if (bridge) bridge.stopLocation();
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setGpsLive(false);
    setGpsBusy(false);
    setMessage("Live location stopped. Saved maps remain available.");
  }
  useEffect(() => {
    const a = () => setOffline(false),
      b = () => setOffline(true);
    window.addEventListener("online", a);
    window.addEventListener("offline", b);
    if (!bridge)
      caches
        .open("mapintel-preview-state")
        .then((c) => c.match("/__estate_pack__"))
        .then((r) => setSaved(!!r));
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() =>
          setMessage("Offline app setup failed. Please reload online."),
        );
    return () => {
      window.removeEventListener("online", a);
      window.removeEventListener("offline", b);
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [message]);
  const baseRows = production.rows.filter(
    (r) =>
      r.kind === (period === "Monthly" ? "monthly" : "yearly") &&
      (period === "Monthly" ? r.month === month : r.year === year),
  );
  const rows = baseRows.filter(
    (r) =>
      !search ||
      `${r.code} ${r.mapCode || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const tonnes = baseRows
      .filter((r) => r.mt != null)
      .reduce((s, r) => s + (r.mt || 0), 0),
    bunches = baseRows.reduce((s, r) => s + (r.bunches || 0), 0);
  const reportingYears = [
    ...new Set(
      production.rows.filter((r) => r.kind === "yearly").map((r) => r.year),
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, 2);
  const annual = production.rows.filter(
    (r) =>
      r.kind === "yearly" &&
      r.year === year &&
      r.mt != null &&
      r.area != null &&
      r.area > 0 &&
      r.mapCode,
  );
  const matches = annual.filter((r) =>
    comparison === "above"
      ? ((r as any).yieldApi ?? r.mt! / r.area!) > Number(threshold)
      : ((r as any).yieldApi ?? r.mt! / r.area!) < Number(threshold),
  );
  const trend = useMemo(
    () =>
      Array.from(
        { length: live ? Number(live.latestMonth?.slice(5) || 7) : 7 },
        (_, i) => {
          const key = `${live?.latestYear || 2026}-${String(i + 1).padStart(2, "0")}`;
          return {
            key,
            value: production.rows
              .filter((r) => r.kind === "monthly" && r.month === key)
              .reduce((s, r) => s + (r.mt || 0), 0),
          };
        },
      ),
    [],
  );
  const block = production.blocks.find((b) => b.blockCode === selected);
  function nav(t: Tab) {
    if (t === "Map" && tab === "Production") setFertiliserLayer(null);
    setTab(t);
    setSearch("");
    setSheet("");
  }
  async function save() {
    if (offline) return;
    if (bridge) {
      bridge.sync();
      return;
    }
    setBusy(true);
    setProgress(0);
    const staging = "mapintel-preview-stage-" + Date.now();
    let committed = false;
    try {
      const files = await fetch("/estate/manifest.json").then((r) => {
        if (!r.ok) throw Error("Map manifest unavailable");
        return r.json();
      });
      const cache = await caches.open(staging);
      const state = await caches.open("mapintel-preview-state");
      const previous = await state
        .match("/__estate_pack__")
        .then((r) => r?.json());
      const old = previous ? await caches.open(previous.cacheName) : null;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        let response = await old?.match(f.url);
        if (!response) response = await fetch(f.url);
        if (!response.ok) throw Error("Unable to download map");
        const bytes = await response.arrayBuffer();
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        if (hash !== f.sha256)
          throw Error("Map verification failed; previous copy retained");
        await cache.put(f.url, new Response(bytes));
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      await state.put(
        "/__estate_pack__",
        new Response(JSON.stringify({ cacheName: staging, files })),
      );
      committed = true;
      if (previous?.cacheName) await caches.delete(previous.cacheName);
      setSaved(true);
      setLastCheck(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setMessage("Oban map files verified and saved on this device.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Download failed.");
    } finally {
      if (!committed) await caches.delete(staging);
      setBusy(false);
    }
  }
  async function check() {
    if (offline) return;
    if (bridge) {
      bridge.sync();
      return;
    }
    setBusy(true);
    try {
      await fetch("/estate/manifest.json", { cache: "no-store" }).then((r) =>
        r.json(),
      );
      setLastCheck(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setMessage("Saved map files checked.");
    } catch {
      setMessage("Unable to check. Your saved map is unchanged.");
    } finally {
      setBusy(false);
    }
  }
  function findBlock(code = search) {
    const b = geo.blocks.features.find(
      (f) =>
        String(f.properties.blockName).toLowerCase() === code.toLowerCase(),
    );
    if (!b) {
      setMessage("No matching saved block. Try A10, E14 or F17.");
      return;
    }
    setSelected(b.properties.blockName);
    const f = new GeoJSON().readFeature(b, {
      featureProjection: "EPSG:3857",
    }) as any;
    mapRef.current?.getView().fit(f.getGeometry().getExtent(), {
      padding: [70, 60, 100, 60],
      maxZoom: 17,
      duration: 400,
    });
    setSheet("");
  }
  const offlinePanel = (
    <>
      <span className="eyebrow">READY FOR THE FIELD</span>
      <h2>Offline maps</h2>
      <p className="subtext">
        Download once. Keep exploring without mobile data.
      </p>
      <article className="saved-estate-card">
        <img src="/estate/mosaic.webp" alt="Oban estate imagery overview" />
        <div>
          <h3>{live?.estateName || "Oban Nigeria"}</h3>
          <p>Boundaries, GIS layers & imagery</p>
          <span className="saved-tag">
            <CheckCircledIcon />
            {saved ? "Verified local copy saved" : "Ready to download"}
          </span>
        </div>
      </article>
      <div className="offline-includes">
        {[
          geo.blocks.features.length + " mapped blocks & estate layers",
          "Latest satellite image & mosaic overview",
          "Terrain overview",
          "Historical production & analytics",
        ].map((t) => (
          <p key={t}>
            <CheckCircledIcon />
            {t}
          </p>
        ))}
      </div>
      {busy && (
        <div className="progress-box" role="status">
          Verifying map files · {progress}%
          <progress value={progress} max="100" />
        </div>
      )}
      <button
        className="primary-button"
        disabled={busy || offline}
        onClick={saved ? check : save}
      >
        {busy
          ? "Please wait…"
          : saved
            ? "Check for changes"
            : "Download Oban for offline use"}
        {saved ? <UpdateIcon /> : <DownloadIcon />}
      </button>
      {lastCheck && (
        <p className="source-note">Local files last checked at {lastCheck}.</p>
      )}
      <div className="info-card">
        <LockClosedIcon />
        <p>
          {offline
            ? "You are offline. Saved content stays unchanged until you reconnect."
            : "Changed server responses and map checksums are checked online. Unchanged maps are reused."}
        </p>
      </div>
      <p className="source-note">
        {live
          ? "The permitted maps and reporting data are saved privately on this phone. Internet road tiles and full-resolution online mosaic tiles are excluded. Latest received production month: " +
            live.latestMonth
          : "Saved maps include the latest available imagery and estate layers. Internet road tiles and online mosaic tiles are excluded."}
      </p>
      {saved && (
        <button
          className="text-button"
          onClick={async () => {
            if (bridge) {
              bridge.removeOffline();
              return;
            }
            const state = await caches.open("mapintel-preview-state");
            const previous = await state
              .match("/__estate_pack__")
              .then((r) => r?.json());
            await state.delete("/__estate_pack__");
            if (previous?.cacheName) await caches.delete(previous.cacheName);
            setSaved(false);
            setMessage("Saved copy removed. Estate access is unchanged.");
          }}
        >
          {live
            ? "Remove saved estate & sign out"
            : "Remove optional saved map copy"}
        </button>
      )}
    </>
  );
  return (
    <div
      className="mapintel-app"
      onClickCapture={(e) => {
        if (
          e.target instanceof Element &&
          e.target.closest('button,a,[role="button"]')
        )
          keyboard.hide();
      }}
      onKeyDownCapture={(e) => {
        if (e.key === "Enter" && !(e.target instanceof HTMLSelectElement)) {
          keyboard.hide();
          if (sheet === "search") findBlock();
        }
      }}
    >
      <header className="brand-header">
        <div className="brand">
          <img src="/estate/logo.png" alt="Agrinexus gold a" />
          <img
            className="wordmark"
            src="/estate/wordmark.png"
            alt="MapIntel Estate Intelligence"
          />
        </div>
        <button
          className="avatar"
          aria-label="Account and access"
          onClick={() => setSheet("account")}
        >
          <PersonIcon />
        </button>
      </header>
      <div className="estate-header">
        <button onClick={() => setSheet("estate")} className="estate-select">
          <span className="eyebrow">YOUR ESTATE</span>
          <strong>
            {live?.estateName || "Oban Nigeria"} <ChevronDownIcon />
          </strong>
          <small>View-only access</small>
        </button>
        <button
          className={"connection " + (offline ? "is-offline" : "")}
          onClick={() => setSheet("connection")}
        >
          <span />
          {offline ? "Offline" : "Online"}
        </button>
      </div>
      <div className={"sync-strip " + (offline ? "offline-strip" : "")}>
        <CheckCircledIcon />
        <span>
          {offline
            ? "Viewing saved map & data"
            : saved
              ? "Saved for offline use"
              : "Estate maps"}
        </span>
        <button onClick={() => setSheet("offline")}>
          {offline ? "Updates paused" : saved ? "Manage" : "Save offline"}
          <ArrowRightIcon />
        </button>
      </div>

      {tab === "Map" ? (
        <div className="map-workspace">
          <div className="map-tabs">
            <strong>Estate map</strong>
            <span>Latest saved map</span>
            <button
              className="icon-button"
              aria-label="Find a block"
              onClick={() => setSheet("search")}
            >
              <MagnifyingGlassIcon />
            </button>
          </div>
          <div className="map-canvas">
            <EstateMap
              mode={mode}
              date={date}
              layers={layers}
              selected={selected}
              onSelect={setSelected}
              highlights={highlights}
              fertiliserLayer={fertiliserLayer}
              onReady={(m) => (mapRef.current = m)}
              fix={gpsLive ? fix : null}
              nearby={nearby}
              focus={focus}
            />
            {!fertiliserLayer && (
              <button className="layers-fab" onClick={() => setSheet("layers")}>
                <LayersIcon />
                Layers
              </button>
            )}
            <div className="zoom-controls">
              <button
                aria-label="Zoom in"
                onClick={() => {
                  const v = mapRef.current?.getView();
                  v?.animate({ zoom: (v.getZoom() || 12) + 1, duration: 200 });
                }}
              >
                <PlusIcon />
              </button>
              <button
                aria-label="Zoom out"
                onClick={() => {
                  const v = mapRef.current?.getView();
                  v?.animate({ zoom: (v.getZoom() || 12) - 1, duration: 200 });
                }}
              >
                <MinusIcon />
              </button>
            </div>
            <div className="map-actions">
              <button
                className="fit-fab"
                aria-label="Show whole estate"
                onClick={() => {
                  const fs = new GeoJSON().readFeatures(geo.blocks, {
                    featureProjection: "EPSG:3857",
                  });
                  mapRef.current
                    ?.getView()
                    .fit(new VectorSource({ features: fs }).getExtent(), {
                      padding: [40, 25, 60, 25],
                      duration: 300,
                    });
                }}
              >
                <GlobeIcon />
              </button>
              <button
                className={gpsBusy ? "location-fab locating" : "location-fab"}
                onClick={showLocation}
                aria-label={gpsBusy ? "Finding location" : "Show location"}
                title="Show location"
              >
                <Crosshair1Icon />
              </button>
            </div>
            {fertiliserLayer ? (
              <details open className="map-legend fertiliser-key">
                <summary>
                  {fertiliserLayer.label} · {fertiliserLayer.unit}
                </summary>
                {fertiliserLayer.bands?.map((b) => (
                  <span key={b.min}>
                    <i style={{ background: b.color }} />
                    {b.label}
                  </span>
                ))}
                <span>
                  <i style={{ background: "#e7e9ec" }} />
                  No record
                </span>
              </details>
            ) : (
              <div className="map-legend">
                <span className="legend-line" /> Estate blocks{" "}
                <span className="legend-dot" /> Points of interest
              </div>
            )}
          </div>
          <div className="map-caption">
            <span>
              <LayersIcon />
              {mode} ·{" "}
              {mode === "Satellite" ? dateLabel(date) : "Saved estate layers"}
            </span>
            <LockClosedIcon />
          </div>
          {nearby && (
            <div className="osm-attribution">
              Nearby map ©{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap contributors
              </a>{" "}
              · saved {new Date(nearby.savedAt).toLocaleDateString("en-GB")}
            </div>
          )}
          {selected ? (
            <div className="selection-card">
              <div>
                <span className="eyebrow">SELECTED BLOCK</span>
                <h3>{selected}</h3>
                <p>
                  {fertiliserLayer
                    ? fertiliserLayer.details?.[selected]
                      ? `${num(fertiliserLayer.details[selected].quantity, 2)} ${fertiliserLayer.quantityUnit} · ${num(fertiliserLayer.details[selected].value, 2)} ${fertiliserLayer.unit}`
                      : "No fertiliser records for this selection"
                    : block
                      ? `${num(block.plantedHectares, 2)} ha · ${block.plantingYear || "Year unavailable"}`
                      : "No linked block details"}
                </p>
              </div>
              {fertiliserLayer ? (
                <button
                  className="outline-button"
                  onClick={() => {
                    setAnalyticsKind("fertiliser");
                    nav("Analytics");
                  }}
                >
                  Fertiliser details
                  <ArrowRightIcon />
                </button>
              ) : (
                (live
                  ? live.allowMonthly || live.allowYearly
                  : access !== "Map only") && (
                  <button
                    className="outline-button"
                    onClick={() => {
                      setSearch(selected);
                      setTab("Production");
                    }}
                  >
                    Production
                    <ArrowRightIcon />
                  </button>
                )
              )}
              <button
                aria-label="Clear block"
                className="clear-selection"
                onClick={() => setSelected("")}
              >
                <Cross2Icon />
              </button>
            </div>
          ) : (
            <div className="map-summary">
              <div>
                <strong>{geo.blocks.features.length}</strong>
                <span>Mapped blocks</span>
              </div>
              <div>
                <strong>
                  {num(live ? live.areaHa : 4488.158357, 2)} <small>ha</small>
                </strong>
                <span>Planted GIS area</span>
              </div>
              <button
                onClick={() =>
                  (
                    live
                      ? !live.allowMonthly && !live.allowYearly
                      : access === "Map only"
                  )
                    ? setSheet("account")
                    : nav("Production")
                }
                aria-label="Open production"
              >
                <ArrowRightIcon />
              </button>
            </div>
          )}
          <p className="map-help">
            Tap a block for details. Pinch or drag to explore.
          </p>
        </div>
      ) : (
        <MobileScroll className="content-scroll">
          <main className="page-content">
            {tab === "Production" && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">ESTATE PERFORMANCE</span>
                    <h2>Production</h2>
                  </div>
                  <span className="read-only">
                    <LockClosedIcon />
                    View only
                  </span>
                </div>
                <p className="subtext">
                  {live
                    ? "Recorded production from the Mapping webapp."
                    : "Recorded production from the Mapping source workbook."}
                </p>
                <div className="segmented">
                  {["Monthly", "Yearly"]
                    .filter(
                      (p) =>
                        !live ||
                        (p === "Monthly"
                          ? live.allowMonthly
                          : live.allowYearly),
                    )
                    .map((p) => (
                      <button
                        className={period === p ? "active" : ""}
                        onClick={() => setPeriod(p)}
                        key={p}
                      >
                        {p}
                      </button>
                    ))}
                </div>
                <div className="filter-row">
                  {period === "Monthly" ? (
                    <label>
                      Reporting month
                      <CompactSelect
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                      >
                        {Array.from(
                          new Set(
                            production.rows
                              .filter((r) => r.kind === "monthly")
                              .map((r) => r.month),
                          ),
                        )
                          .sort()
                          .reverse()
                          .map((m) => (
                            <option key={m} value={m}>
                              {new Date(m + "-01T12:00:00").toLocaleDateString(
                                "en-GB",
                                { month: "long", year: "numeric" },
                              )}
                            </option>
                          ))}
                      </CompactSelect>
                    </label>
                  ) : (
                    <label>
                      Reporting year
                      <CompactSelect
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                      >
                        {reportingYears.map((y) => (
                          <option key={y}>{y}</option>
                        ))}
                      </CompactSelect>
                    </label>
                  )}
                </div>
                <div className="metric-grid">
                  <article>
                    <span>Recorded FFB</span>
                    <strong>
                      {num(tonnes, 2)} <small>MT</small>
                    </strong>
                    <small>
                      {baseRows.filter((r) => r.mt != null).length} records with
                      tonnage
                    </small>
                  </article>
                  <article>
                    <span>Bunches</span>
                    <strong>{num(bunches)}</strong>
                    <small>{baseRows.length} source records</small>
                  </article>
                </div>
                <div className="section-heading">
                  <h3>Block production</h3>
                  <span>{rows.length} records</span>
                </div>
                <label className="search-field">
                  <MagnifyingGlassIcon />
                  <KeyboardInput
                    onBlur={() => keyboard.hide()}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search source or map block"
                    aria-label="Search production blocks"
                  />
                </label>
                <div className="production-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Source / Map block</th>
                        <th>FFB · MT</th>
                        <th>Bunches</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 60).map((r, i) => (
                        <tr key={i}>
                          <td>
                            <button
                              onClick={() => {
                                if (live && !live.allowMap)
                                  setMessage(
                                    "Map viewing is not enabled for this account.",
                                  );
                                else if (r.mapCode) {
                                  setSelected(r.mapCode);
                                  nav("Map");
                                } else
                                  setMessage(
                                    "This source record has no mapped block.",
                                  );
                              }}
                            >
                              {r.code}
                              <small>
                                {r.mapCode ? "Map: " + r.mapCode : "Not mapped"}
                              </small>
                            </button>
                          </td>
                          <td>{num(r.mt, 2)}</td>
                          <td>{num(r.bunches)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rows.length && (
                    <p className="empty">
                      No saved records match this selection.
                    </p>
                  )}
                  {rows.length > 60 && (
                    <p className="source-note">
                      First 60 records shown. Search to narrow the list.
                    </p>
                  )}
                </div>
                <p className="source-note">
                  {live
                    ? "Saved webapp records. Missing values remain blank. Latest received month: " +
                      live.latestMonth +
                      ". Last checked: " +
                      live.checkedAt
                    : "Saved production records. Missing values remain blank."}
                </p>
              </>
            )}
            {tab === "Analytics" && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">SEE THE PATTERNS</span>
                    <h2>Analytics</h2>
                  </div>
                  <BarChartIcon />
                </div>
                <label className="analytics-choice">
                  Analytics query
                  <CompactSelect
                    value={analyticsKind}
                    onChange={(e) => {
                      setAnalyticsKind(e.target.value);
                      setFertiliserLayer(null);
                      setHighlights([]);
                    }}
                  >
                    <option value="production">Production per hectare</option>
                    <option value="fertiliser">Annual block fertiliser</option>
                  </CompactSelect>
                </label>
                {analyticsKind === "fertiliser" ? (
                  <FertiliserAnalytics
                    data={(window as any).__MAPINTEL_DATA__?.fertiliser}
                    initialScope={fertiliserLayer?.scope}
                    initialBlock={fertiliserLayer ? selected : ""}
                    onMap={(layer) => {
                      setFertiliserLayer(layer);
                      setHighlights([]);
                      setSelected("");
                      nav("Map");
                    }}
                  />
                ) : (
                  <>
                    <p className="subtext">
                      Explore production and find matching map blocks.
                    </p>
                    <article className="trend-card">
                      <div className="section-heading">
                        <h3>Monthly FFB</h3>
                        <span>{live?.latestYear || 2026} · MT</span>
                      </div>
                      <div
                        className="bars"
                        role="img"
                        aria-label={
                          "January to July 2026 FFB tonnes: " +
                          trend.map((r) => num(r.value, 2)).join(", ")
                        }
                      >
                        {trend.map((r) => (
                          <div key={r.key}>
                            <span>{num(r.value)}</span>
                            <i
                              style={{
                                height: Math.max(
                                  3,
                                  (r.value /
                                    Math.max(...trend.map((r) => r.value))) *
                                    110,
                                ),
                              }}
                            />
                            <small>
                              {new Date(
                                r.key + "-01T12:00:00",
                              ).toLocaleDateString("en-GB", { month: "short" })}
                            </small>
                          </div>
                        ))}
                      </div>
                      <p>
                        {live
                          ? "Saved webapp records · through " + live.latestMonth
                          : "Saved source data"}
                      </p>
                    </article>
                    <article className="analysis-card">
                      <div className="section-heading">
                        <h3>Production per hectare</h3>
                        <MixerHorizontalIcon />
                      </div>
                      <div className="filter-row">
                        <label>
                          Year
                          <CompactSelect
                            value={year}
                            onChange={(e) => {
                              setYear(Number(e.target.value));
                              setFertiliserLayer(null);
                              setHighlights([]);
                            }}
                          >
                            {reportingYears.map((y) => (
                              <option key={y}>{y}</option>
                            ))}
                          </CompactSelect>
                        </label>
                        <label>
                          Yield
                          <CompactSelect
                            value={comparison}
                            onChange={(e) => {
                              setComparison(e.target.value);
                              setHighlights([]);
                            }}
                          >
                            <option value="above">Above</option>
                            <option value="below">Below</option>
                          </CompactSelect>
                        </label>
                      </div>
                      <label className="threshold-label">
                        Threshold · MT/ha
                        <KeyboardInput
                          onBlur={() => keyboard.hide()}
                          type="number"
                          min="0"
                          value={threshold}
                          onChange={(e) => {
                            setThreshold(e.target.value);
                            setHighlights([]);
                          }}
                          aria-label="Yield threshold"
                        />
                      </label>
                      <div className="match-summary">
                        <strong>{matches.length}</strong>
                        <div>
                          <b>matching source records</b>
                          <small>
                            {annual.length} mapped records with usable area
                          </small>
                        </div>
                      </div>
                      <button
                        className="primary-button"
                        disabled={
                          (live && !live.allowMap) ||
                          !threshold.trim() ||
                          !Number.isFinite(Number(threshold)) ||
                          Number(threshold) < 0
                        }
                        onClick={() => {
                          setHighlights([
                            ...new Set(matches.map((r) => r.mapCode!)),
                          ]);
                          setTab("Map");
                          setMessage("Matching blocks outlined in blue.");
                        }}
                      >
                        Highlight on map
                        <ArrowRightIcon />
                      </button>
                      <p className="source-note">
                        {live
                          ? "Yield uses the webapp production API, including recorded loose fruit and effective area. Source records may share a map block. Partial-year records remain partial-year."
                          : "Recorded production uses source hectares and the webapp crop calculation. Partial-year records remain partial-year."}
                      </p>
                    </article>
                    {matches.slice(0, 8).map((r, i) => (
                      <button
                        className="result-row"
                        key={i}
                        onClick={() => {
                          if (live && !live.allowMap) {
                            setMessage(
                              "Map viewing is not enabled for this account.",
                            );
                            return;
                          }
                          setSelected(r.mapCode!);
                          nav("Map");
                        }}
                      >
                        <span>
                          <b>{r.mapCode}</b>
                          <small>Source {r.code}</small>
                        </span>
                        <strong>
                          {num((r as any).yieldApi ?? r.mt! / r.area!, 2)}
                          <small> MT/ha</small>
                        </strong>
                        <ArrowRightIcon />
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
            {tab === "Offline" && offlinePanel}
          </main>
        </MobileScroll>
      )}
      <nav
        className="bottom-nav"
        style={{ bottom: bottomInset }}
        aria-label="Main navigation"
      >
        {(["Map", "Production", "Analytics"] as Tab[])
          .filter((t) =>
            live
              ? t === "Map"
                ? live.allowMap
                : t === "Production"
                  ? live.allowMonthly || live.allowYearly
                  : t === "Analytics"
                    ? live.allowAnalytics
                    : true
              : access !== "Map only" || ["Map", "Offline"].includes(t),
          )
          .map((t) => {
            const Icon = icons[t];
            return (
              <button
                className={tab === t ? "active" : ""}
                aria-current={tab === t ? "page" : undefined}
                onClick={() => nav(t)}
                key={t}
              >
                <span>
                  <Icon />
                </span>
                {t}
              </button>
            );
          })}
      </nav>
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      <BottomSheet
        open={!!sheet}
        onOpenChange={(open) => {
          if (!open) setSheet("");
        }}
        title={
          {
            layers: "Map layers",
            search: "Find a block",
            account: "Account & access",
            connection: "Connection",
            estate: "Your estates",
            offline: "Offline maps",
            location: "Your location",
          }[sheet] || ""
        }
        snap={sheet === "layers" || sheet === "offline" ? 0.79 : 0.63}
      >
        <div className="sheet-content">
          {sheet === "layers" && (
            <>
              <div className="layer-modes">
                {(
                  [
                    "Road map",
                    "Satellite",
                    "Topography",
                    "Estate mosaic",
                  ] as Mode[]
                ).map((v) => (
                  <button
                    className={mode === v ? "active" : ""}
                    key={v}
                    onClick={() => setMode(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="source-note">
                Road map uses saved estate vectors. Internet road tiles are
                excluded.
              </p>
              {Object.entries(layerNames).map(([key, label]) => (
                <label className="layer-row" key={key}>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={(e) =>
                      setLayers({ ...layers, [key]: e.target.checked })
                    }
                  />
                  <span
                    className="layer-swatch"
                    style={{ background: colors[key] || "#647943" }}
                  />
                  {label}
                  <small>
                    {key === "labels"
                      ? ""
                      : (geo as any)[key]?.features.length || ""}
                  </small>
                </label>
              ))}
              <button className="primary-button" onClick={() => setSheet("")}>
                Apply layers
                <CheckCircledIcon />
              </button>
            </>
          )}
          {sheet === "search" && (
            <>
              <p className="subtext">Find a block in the saved Oban map.</p>
              <label className="search-field">
                <MagnifyingGlassIcon />
                <KeyboardInput
                  onBlur={() => keyboard.hide()}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="e.g. E14"
                  aria-label="Block code"
                />
              </label>
              <button className="primary-button" onClick={() => findBlock()}>
                Find on map
                <ArrowRightIcon />
              </button>
              <Carousel ariaLabel="Suggested blocks">
                {["A10", "E14", "F17", "J20"].map((code) => (
                  <button
                    className="date-chip"
                    key={code}
                    onClick={() => findBlock(code)}
                  >
                    {code}
                  </button>
                ))}
              </Carousel>
            </>
          )}
          {sheet === "account" && (
            <>
              <div className="profile-card">
                <PersonIcon />
                <div>
                  <h3>{live.subject}</h3>
                  <p>Mapping webapp account · view only</p>
                </div>
              </div>
              <div className="info-card">
                <LockClosedIcon />
                <p>
                  Current webapp access controls estate maps, Production and
                  Analytics. Saved maps remain available offline until the app
                  reconnects to recheck access.
                </p>
              </div>
              <button className="primary-button" onClick={check}>
                Check for changes
                <UpdateIcon />
              </button>
              <button
                className="outline-button"
                onClick={() => bridge.logout()}
              >
                Sign out & clear this account
              </button>
            </>
          )}
          {sheet === "connection" && (
            <>
              <div className="info-card">
                <GlobeIcon />
                <div>
                  <h3>{offline ? "Offline viewing" : "Online viewing"}</h3>
                  <p>
                    {offline
                      ? "Saved maps and data stay visible. Downloads and updates are paused."
                      : "The app shows its saved content. Online checks use the Mapping webapp API."}
                  </p>
                </div>
              </div>
              {!bridge && (
                <button
                  className="primary-button"
                  onClick={() => {
                    if (!saved && !offline) {
                      setMessage(
                        "Save the estate before testing offline viewing.",
                      );
                      setSheet("offline");
                      return;
                    }
                    setOffline(!offline);
                    setSheet("");
                  }}
                >
                  {offline ? "Reconnect" : "Offline viewing"}
                  <ArrowRightIcon />
                </button>
              )}
              <p className="source-note">
                {live
                  ? "Network status follows the phone. Saved estate content opens without internet. Reconnect to check changes and user access."
                  : "Saved estate content remains available without an internet connection."}
              </p>
            </>
          )}
          {sheet === "estate" && (
            <>
              <p className="subtext">
                Your estate access follows the Mapping webapp.
              </p>
              <button className="estate-option" onClick={() => setSheet("")}>
                <GlobeIcon />
                <span>
                  <strong>{live?.estateName || "Oban Nigeria"}</strong>
                  <small>Your permitted estate</small>
                </span>
                <CheckCircledIcon />
              </button>
              <p className="source-note">
                Estate access is managed in the Mapping webapp.
              </p>
            </>
          )}
          {sheet === "offline" && offlinePanel}
        </div>
      </BottomSheet>
    </div>
  );
}
