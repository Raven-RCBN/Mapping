import {
  fertiliserAnalysis,
  fertiliserMapLayer,
} from "./shared/hts-analysis.js";
export function buildFertiliserLayer(data, scope) {
  const {
    year,
    division = "",
    block = "",
    product = "solids",
    metric = "quantity",
  } = scope;
  const unit =
    product === "solids" ? "kg" : data.products[Number(product)].unit;
  const result = fertiliserAnalysis(data, {
    year,
    division,
    block,
    product,
    metric: unit === "kg" ? "perPalm" : metric,
  });
  return {
    ...fertiliserMapLayer(result, {
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
    scope: { year, division, block, product, metric },
    quantityUnit: unit,
    details: Object.fromEntries(result.blocks.map((b) => [b.mapBlockCode, b])),
  };
}
