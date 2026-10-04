import fs from "node:fs/promises";
import { mountEstateAtlas } from "../../apps/api/src/integrations/agrinexus.js";
import { createModels } from "../../apps/api/src/model/index.js";
import { importEstateGIS } from "../../apps/api/src/service/gis-import.js";
import { importWorkbook } from "../../apps/api/src/service/workbook.js";
import { seedEstateAtlas } from "./agrinexus-seed.mjs";

export async function registerEstateAtlas(app, connection, AuthHandler) {
  const root = "/opt/digitalpalm/agrinexus/estate-atlas";
  const marker = root + "/data/.seed-v1-applied";
  try {
    await fs.access(marker);
  } catch {
    const counts = await seedEstateAtlas(
      connection,
      root + "/current/seed.json",
      root + "/data"
    );
    await fs.writeFile(
      marker,
      JSON.stringify({ at: new Date().toISOString(), counts })
    );
    console.log("EstateAtlas initial import:", counts);
  }
  // Private payload is deployed separately from source control.
  const workbookFile = root + "/current/sge-import.json";
  try {
    await fs.access(workbookFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    await fs.access(workbookFile).then(
      () => true,
      () => false
    )
  ) {
    const payload = JSON.parse(await fs.readFile(workbookFile, "utf8"));
    const importMarker = root + "/data/.workbook-" + payload.importId;
    if (
      !(await fs.access(importMarker).then(
        () => true,
        () => false
      ))
    ) {
      const counts = await importWorkbook(
        createModels(connection, "EstateAtlas"),
        payload
      );
      await fs.writeFile(
        importMarker,
        JSON.stringify({
          at: new Date().toISOString(),
          counts,
          removed: payload.removed,
        })
      );
      console.log("EstateAtlas workbook import:", counts);
    }
  }
  const gisFile = root + "/current/gis-import.json";
  const gis = await fs.readFile(gisFile, "utf8").catch((e) => {
    if (e.code !== "ENOENT") throw e;
    return null;
  });
  if (gis) {
    const payload = JSON.parse(gis);
    if (!/^[a-f0-9]{64}$/.test(payload.importId))
      throw Error("Invalid GIS import identity");
    const gisMarker = root + "/data/.gis-" + payload.importId;
    if (
      !(await fs.access(gisMarker).then(
        () => true,
        () => false
      ))
    ) {
      const counts = await importEstateGIS(
        createModels(connection, "EstateAtlas"),
        payload,
        root + "/data"
      );
      await fs.writeFile(
        gisMarker,
        JSON.stringify({ at: new Date().toISOString(), counts }),
        { mode: 0o600 }
      );
      console.log("EstateAtlas GIS import:", counts);
    }
  }
  await mountEstateAtlas(app, {
    connection,
    AuthHandler,
    dataDir: root + "/data",
    qgisCommand: root + "/tools/render-qgis",
  });
  console.log("EstateAtlas mounted at /api/EstateAtlas");
}
