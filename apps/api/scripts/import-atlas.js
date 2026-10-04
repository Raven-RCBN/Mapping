import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { configFromEnv } from "../src/config/index.js";
import { Estate, Asset, Activity } from "../src/model/index.js";
const source = path.resolve(process.argv[2] || "../estate-atlas/dist");
const config = configFromEnv();
await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
try {
  const read = async (p) =>
    JSON.parse(await fs.readFile(path.join(source, p), "utf8"));
  const data = await read("estate.json"),
    history = await read("imagery/history.json"),
    terrain = await read("terrain/metadata.json");
  await Estate.updateOne(
    { _id: "sg-gumut" },
    {
      $setOnInsert: {
        name: "Sungai Gumut",
        location: "Selangor, Malaysia",
        totalAreaHa: data.summary.totalAreaHa,
        boundary: data.geojson,
        boundaryDate: data.summary.date,
        source: data.summary.source,
      },
    },
    { upsert: true }
  );
  async function asset(id, relative, info) {
    const bytes = await fs.readFile(path.join(source, relative)),
      stored = `estates/sg-gumut/${relative}`,
      dest = path.join(config.dataDir, stored);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, bytes);
    await Asset.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          estateId: "sg-gumut",
          ...info,
          file: {
            path: stored,
            mime: relative.endsWith(".png")
              ? "image/png"
              : relative.endsWith(".zip")
              ? "application/zip"
              : "application/json",
            bytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        },
      },
      { upsert: true }
    );
  }
  for (const r of history.records)
    await asset("sg-gumut-" + r.date, r.image_url, {
      name: "Sentinel-2 · " + r.date,
      kind: "imagery",
      acquiredAt: r.date,
      importedAt: history.downloaded,
      bounds: r.image_bounds,
      resolution: 10,
      cloudPercent: r.estate_cloud_shadow_snow_percent,
      attribution: r.attribution,
      sourceUrl: r.catalog_url,
    });
  for (const [kind, file] of [
    ["terrain", "terrain.png"],
    ["hillshade", "hillshade.png"],
    ["slope", "slope.png"],
    ["contours", "contours.geojson"],
    ["elevation-grid", "elevation-grid.json"],
  ])
    await asset("sg-gumut-" + kind, "terrain/" + file, {
      name: "Copernicus GLO-30 · " + kind,
      kind,
      bounds: terrain.image_bounds,
      resolution: 30,
      attribution:
        "Contains modified Copernicus DEM data 2021 · TanDEM-X mainly 2011–2015",
    });
  await asset("sg-gumut-qgis", "sg-gumut-qgis-offline.zip", {
    name: "Sungai Gumut QGIS / QField project",
    kind: "qgis",
  });
  const records = (await read("activity-records.json")).records;
  for (const r of records) {
    const { id, ...rest } = r;
    await Activity.updateOne(
      { _id: "sg-gumut--" + id },
      { $setOnInsert: { estateId: "sg-gumut", ...rest } },
      { upsert: true }
    );
  }
  await Estate.updateOne(
    { _id: "sg-gumut" },
    {
      $set: {
        qgis: await fs
          .access(
            path.join(config.dataDir, "estates/sg-gumut/qgis/published.qgz")
          )
          .then(() => true)
          .catch(() => false),
      },
    }
  );
  console.log(
    `Imported Sungai Gumut: ${data.geojson.features.length} blocks, ${history.records.length} images, ${records.length} existing local activity records. Files: ${config.dataDir}`
  );
} finally {
  await mongoose.disconnect();
}
