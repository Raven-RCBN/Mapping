import fs from "node:fs/promises";
import path from "node:path";
import { fileHash, secureStoredFile } from "./files.js";

// Deployment-only import. Private geometry and imagery are never part of Git.
// Preflight every record and file before writes; retries retain subsequent edits.
export async function importEstateGIS(models, payload, dataDir) {
  const { Estate, Block, Asset, Source } = models;
  if (
    payload.version !== 1 ||
    !/^[a-f0-9]{64}$/.test(payload.importId) ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(payload.estateId)
  )
    throw Error("Invalid GIS import");
  const estate = await Estate.findById(payload.estateId).lean();
  if (!estate || estate.name !== payload.estateName)
    throw Error("GIS estate identity mismatch");
  if (
    estate.boundary?.features?.length &&
    estate.gisImportId !== payload.importId
  )
    throw Error("Existing boundary must be reviewed before replacement");
  const features = payload.boundary?.features;
  const names = new Set(features?.map((f) => f.properties?.blockName));
  if (
    payload.boundary?.type !== "FeatureCollection" ||
    !features?.length ||
    names.size !== features.length ||
    names.has(undefined) ||
    payload.blocks.length !== names.size
  )
    throw Error("Invalid planting block boundary");
  const codes = new Set();
  const blocks = payload.blocks.map((b) => ({
    ...b,
    importId: payload.importId,
  }));
  for (const b of blocks) {
    if (
      !names.has(b.blockCode) ||
      codes.has(b.blockCode) ||
      JSON.stringify(b.mapBlockNames) !== JSON.stringify([b.blockCode])
    )
      throw Error("Planting block link mismatch");
    codes.add(b.blockCode);
  }
  const sources = payload.sources || [];
  for (const [Model, rows] of [
    [Block, blocks],
    [Asset, payload.assets],
    [Source, sources],
  ]) {
    const ids = new Set();
    for (const row of rows) {
      if (
        row.estateId !== estate._id ||
        !row._id?.startsWith(estate._id + "-") ||
        ids.has(row._id)
      )
        throw Error("Invalid GIS record scope");
      ids.add(row._id);
      const error = new Model(row).validateSync();
      if (error) throw error;
      const existing = await Model.findById(row._id).lean();
      if (existing && existing.estateId !== estate._id)
        throw Error("GIS record identity conflict");
    }
  }
  const existingBlocks = await Block.find({ estateId: estate._id }).lean();
  if (existingBlocks.some((b) => b.importId !== payload.importId))
    throw Error("Existing block records must be reviewed before import");
  for (const asset of payload.assets) {
    if (!asset.file?.path.startsWith("estates/" + estate._id + "/"))
      throw Error("GIS file scope mismatch");
    const file = await secureStoredFile(dataDir, asset.file.path);
    if (
      (await fs.stat(file)).size !== asset.file.bytes ||
      (await fileHash(file)) !== asset.file.sha256
    )
      throw Error("GIS file checksum mismatch: " + asset.name);
  }
  const backup = path.join(
    dataDir,
    ".gis-before-" + payload.importId + ".json"
  );
  await fs
    .writeFile(backup, JSON.stringify(estate), { flag: "wx", mode: 0o600 })
    .catch((e) => {
      if (e.code !== "EEXIST") throw e;
    });
  for (const [Model, rows] of [
    [Block, blocks],
    [Asset, payload.assets],
    [Source, sources],
  ]) {
    if (rows.length)
      await Model.bulkWrite(
        rows.map((row) => ({
          updateOne: {
            filter: { _id: row._id, estateId: estate._id },
            update: { $setOnInsert: row },
            upsert: true,
          },
        }))
      );
    if (
      (await Model.countDocuments({
        _id: { $in: rows.map((r) => r._id) },
        estateId: estate._id,
      })) !== rows.length
    )
      throw Error("GIS import count mismatch");
  }
  await Estate.updateOne(
    { _id: estate._id },
    {
      $set: {
        boundary: payload.boundary,
        source: payload.source,
        gisImportId: payload.importId,
        qgis: payload.assets.some((a) => a.kind === "qgis"),
      },
    }
  );
  return {
    blocks: blocks.length,
    assets: payload.assets.length,
    sources: sources.length,
  };
}
