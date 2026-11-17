import { Fill, Stroke, Style } from "ol/style.js";

// Draw the original survey polygons, never inferred rectangles or buffers.
export function selectBlockFeatures(collection, selected, highlighted) {
  const codes = new Set([selected, ...highlighted].filter(Boolean));
  return collection.features.filter((feature) =>
    codes.has(String(feature.properties?.blockName || "")),
  );
}

// A white casing keeps the blue boundary clear on dark imagery and dense GIS.
// This layer is above estate/nearby layers, but below the current GPS marker.
export const selectionStyles = [
  new Style({ stroke: new Stroke({ color: "#ffffff", width: 7 }) }),
  new Style({
    stroke: new Stroke({ color: "#006bff", width: 3.5 }),
    fill: new Fill({ color: "rgba(0,107,255,0.04)" }),
  }),
];
