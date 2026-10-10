import {
  oneEstate,
  mergeEstateWorkspace,
} from "../../../packages/shared/estate-selection.js";
import { validMapVisibility } from "../../../packages/shared/map-visibility.js";
import { configureStore, createSlice } from "@reduxjs/toolkit";
const basePath = import.meta.env?.BASE_URL || "/";
const currentRequest = (s, payload) =>
  s.selected[0] === payload.estateId && s.data?.refresh === payload.refresh;
export const estateMapReady = (s) =>
  !s.data?.paged ||
  s.data.offline ||
  s.workspaceEstate === s.selected[0];
const defaultMapActivities = () => ({
  mode: "include",
  fields: [],
  harvesting: true,
});
const visibilityKey = (s) =>
  "estate-atlas-map-activities:v2:" +
  JSON.stringify([basePath, s.data?.access?.subject, [...s.selected].sort()]);
function restoreVisibility(s) {
  try {
    const saved = JSON.parse(localStorage.getItem(visibilityKey(s)) || "null");
    s.mapVisibility = validMapVisibility(saved)
      ? saved
      : defaultMapActivities();
  } catch {
    s.mapVisibility = defaultMapActivities();
  }
}
const slice = createSlice({
  name: "atlas",
  initialState: {
    data: null,
    selected: [],
    workspaceEstate: null,
    assetsEstate: null,
    rowsEstate: null,
    estateLoadError: "",
    activity: "all",
    block: "all",
    mapVisibility: defaultMapActivities(),
    selectedBlock: null,
    date: "2026-10-03",
    period: "day",
    base: "road",
    terrain: "terrain",
    contours: true,
    showActivities: true,
    showBoundaries: true,
    showLabels: true,
    hiddenGisLayers: [],
    opacity: 18,
    review: false,
    override: null,
    compare: null,
  },
  reducers: {
    signedOut() {
      return slice.getInitialState();
    },
    loaded(s, { payload }) {
      const restore =
        !s.data || s.data.access?.subject !== payload.access?.subject;
      if (!s.data) {
        const latest =
          payload.latest ||
          payload.activities
            .map((r) => r.date)
            .filter(Boolean)
            .sort()
            .at(-1);
        if (latest) s.date = latest;
      }
      s.data = payload;
      s.workspaceEstate = null;
      s.assetsEstate = null;
      s.rowsEstate = null;
      s.estateLoadError = "";
      const ids = payload.estates.map((e) => e.id);
      s.selected = s.selected.filter((id) => ids.includes(id));
      if (!s.selected.length) {
        try {
          s.selected = JSON.parse(
            localStorage.getItem("estate-atlas-selected:" + basePath) || "[]"
          ).filter((id) => ids.includes(id));
        } catch {}
        if (!s.selected.length) s.selected = ids.slice(0, 1);
      }
      s.selected = oneEstate(s.selected, ids);
      if (payload.offline && s.base === "road") {
        s.base = payload.assets?.some(
          (a) => s.selected.includes(a.estateId) && a.kind === "terrain"
        )
          ? "topography"
          : "satellite";
      }
      if (restore) restoreVisibility(s);
    },
    patch(s, { payload }) {
      Object.assign(s, payload);
      if (payload.mapVisibility) {
        try {
          localStorage.setItem(
            visibilityKey(s),
            JSON.stringify(s.mapVisibility)
          );
        } catch {}
      }
    },
    workspaceLoaded(s, { payload }) {
      if (!currentRequest(s, payload)) return;
      s.data.estates = mergeEstateWorkspace(
        s.data.estates,
        payload.data.estates
      );
      s.data.blocks = payload.data.blocks;
      s.data.sources = payload.data.sources;
      s.workspaceEstate = payload.estateId;
      s.estateLoadError = "";
    },
    assetsLoaded(s, { payload }) {
      if (!currentRequest(s, payload)) return;
      s.mapAssets = payload.data;
      s.assetsEstate = payload.estateId;
    },
    rowsLoaded(s, { payload }) {
      if (!currentRequest(s, payload)) return;
      Object.assign(s, payload.patch);
      s.rowsEstate = payload.estateId;
    },
    estateLoadFailed(s, { payload }) {
      if (currentRequest(s, payload)) s.estateLoadError = payload.message;
    },
    select(s, { payload }) {
      const next = oneEstate(payload, s.data.estates);
      if (next[0] === s.selected[0]) return;
      s.selected = next;
      s.workspaceEstate = null;
      s.assetsEstate = null;
      s.rowsEstate = null;
      s.estateLoadError = "";
      s.mapRows = [];
      s.mapAssets = [];
      s.dashboard = null;
      s.dashboardKey = null;
      s.mapLoading = true;
      s.activity = "all";
      s.review = false;
      s.hiddenGisLayers = [];
      if (s.base === "reference") s.base = "road";
      if (s.data.paged) {
        s.data.blocks = [];
        s.data.sources = [];
      }
      restoreVisibility(s);
      s.block = "all";
      s.selectedBlock = null;
      s.override = null;
      s.compare = null;
      try {
        localStorage.setItem(
          "estate-atlas-selected:" + basePath,
          JSON.stringify(s.selected)
        );
      } catch {}
    },
  },
});
export const {
  signedOut,
  loaded,
  patch,
  select,
  workspaceLoaded,
  assetsLoaded,
  rowsLoaded,
  estateLoadFailed,
} = slice.actions;
export const atlasReducer = slice.reducer;
export const store = configureStore({ reducer: slice.reducer });
