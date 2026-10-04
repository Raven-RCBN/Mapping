import { validMapVisibility } from "../../../packages/shared/map-visibility.js";
import { configureStore, createSlice } from "@reduxjs/toolkit";
const defaultMapActivities = () => ({
  mode: "include",
  fields: [],
  harvesting: true,
});
const visibilityKey = (s) =>
  "estate-atlas-map-activities:v2:" +
  JSON.stringify([
    import.meta.env.BASE_URL,
    s.data?.access?.subject,
    [...s.selected].sort(),
  ]);
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
    activity: "all",
    block: "all",
    mapVisibility: defaultMapActivities(),
    selectedBlock: null,
    date: "2026-10-03",
    period: "day",
    base: "satellite",
    terrain: "terrain",
    contours: true,
    showActivities: true,
    showBoundaries: true,
    showLabels: true,
    opacity: 18,
    review: false,
    override: null,
    compare: null,
  },
  reducers: {
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
      const ids = payload.estates.map((e) => e.id);
      s.selected = s.selected.filter((id) => ids.includes(id));
      if (!s.selected.length) {
        try {
          s.selected = JSON.parse(
            localStorage.getItem(
              "estate-atlas-selected:" + import.meta.env.BASE_URL
            ) || "[]"
          ).filter((id) => ids.includes(id));
        } catch {}
        if (!s.selected.length) s.selected = ids.slice(0, 1);
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
    select(s, { payload }) {
      s.selected = payload;
      restoreVisibility(s);
      s.block = "all";
      s.selectedBlock = null;
      s.override = null;
      s.compare = null;
      localStorage.setItem(
        "estate-atlas-selected:" + import.meta.env.BASE_URL,
        JSON.stringify(payload)
      );
    },
  },
});
export const { loaded, patch, select } = slice.actions;
export const store = configureStore({ reducer: slice.reducer });
