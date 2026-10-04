import { Style, Fill, Stroke, Text, Circle } from "ol/style";

export const gisLayerTypes = {
  "land-use": { label: "Land use", color: "#8bb978", z: 11 },
  rivers: { label: "Rivers · areas", color: "#4dc8ef", z: 12 },
  "river-lines": { label: "Rivers · waterways", color: "#4dc8ef", z: 22 },
  roads: { label: "Roads · areas", color: "#f6cf83", z: 13 },
  "road-lines": { label: "Roads · routes", color: "#f6cf83", z: 23 },
  buildings: { label: "Buildings", color: "#f09a77", z: 24 },
  poi: { label: "Points of interest", color: "#e3a8ff", z: 25 },
};

export function gisStyle(type, labels = true) {
  const color = gisLayerTypes[type]?.color || "#aab998";
  const area = new Style({
    fill: new Fill({ color: color + (type === "buildings" ? "bb" : "55") }),
    stroke: new Stroke({ color, width: type === "land-use" ? 0.7 : 1.2 }),
  });
  const river = new Style({ stroke: new Stroke({ color, width: 2 }) });
  const road = [
    new Style({ stroke: new Stroke({ color: "#624d30", width: 4 }) }),
    new Style({ stroke: new Stroke({ color, width: 2 }) }),
  ];
  return (feature, resolution) => {
    if (type === "river-lines") return river;
    if (type === "road-lines") return road;
    if (type !== "poi") return area;
    return new Style({
      image: new Circle({
        radius: 4.5,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: "#342945", width: 1.2 }),
      }),
      text:
        labels && resolution < 7
          ? new Text({
              text: String(feature.get("Name") || feature.get("Type") || ""),
              font: "11px sans-serif",
              offsetY: -13,
              fill: new Fill({ color: "#243b2c" }),
              stroke: new Stroke({ color: "#fff", width: 3 }),
            })
          : undefined,
    });
  };
}
