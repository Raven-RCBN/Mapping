import { configureStore, createSlice } from "@reduxjs/toolkit";
const slice = createSlice({
  name: "atlas",
  initialState: {
    data: null,
    selected: [],
    activity: "all",
    block: "all",
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
      s.data = payload;
      const ids = payload.estates.map((e) => e.id);
      s.selected = s.selected.filter((id) => ids.includes(id));
      if (!s.selected.length) {
        try {
          s.selected = JSON.parse(
            localStorage.getItem("mapping-selected") || "[]"
          ).filter((id) => ids.includes(id));
        } catch {}
        if (!s.selected.length) s.selected = ids.slice(0, 1);
      }
    },
    patch(s, { payload }) {
      Object.assign(s, payload);
    },
    select(s, { payload }) {
      s.selected = payload;
      s.block = "all";
      s.override = null;
      s.compare = null;
      localStorage.setItem("mapping-selected", JSON.stringify(payload));
    },
  },
});
export const { loaded, patch, select } = slice.actions;
export const store = configureStore({ reducer: slice.reducer });
