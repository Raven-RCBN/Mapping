import { normalizeBlockCode } from "../../../../packages/shared/activities.js";

// Idempotent: retries preserve later verification, GPS and confirmed map links.
// No approximate/family matches: ambiguous block codes remain unlocated.
export async function importWorkbook(models, payload) {
  const { Estate, Block, HarvestingActivity, FieldActivity } = models;
  const estate = await Estate.findById(payload.estateId).lean();
  if (!estate) throw new Error("Workbook estate not found");
  if (payload.version !== 1 || !/^[a-f0-9]{64}$/.test(payload.importId))
    throw new Error("Invalid workbook import");
  const names = (estate.boundary?.features || []).map(
    (f) => f.properties.blockName
  );
  const blocks = payload.blocks.map((row) => {
    const matches = names.filter(
      (name) => normalizeBlockCode(name) === normalizeBlockCode(row.blockCode)
    );
    return {
      ...row,
      mapBlockNames: matches.length === 1 ? matches : [],
      mapLinkMethod: matches.length === 1 ? "normalized-exact" : "unmatched",
    };
  });
  const ids = new Map(blocks.map((b) => [b.blockCode, b._id]));
  const harvest = payload.harvesting.map((r) => ({
    ...r,
    blockId: ids.get(r.blockCode) || null,
    status: "recorded",
  }));
  const field = payload.fieldActivities.map((r) => ({
    ...r,
    blockId: ids.get(r.blockCode) || null,
    status: "recorded",
  }));
  // Validate the complete import before performing writes.
  for (const [Model, rows] of [
    [Block, blocks],
    [HarvestingActivity, harvest],
    [FieldActivity, field],
  ]) {
    for (const row of rows) {
      if (
        row.estateId !== estate._id ||
        row.importId !== payload.importId ||
        !row.blockCode
      )
        throw new Error("Invalid workbook scope/block");
      const error = new Model(row).validateSync();
      if (error) throw error;
    }
  }
  for (const [Model, rows] of [
    [Block, blocks],
    [HarvestingActivity, harvest],
    [FieldActivity, field],
  ]) {
    if (rows.length)
      await Model.bulkWrite(
        rows.map((row) => ({
          updateOne: {
            filter: { _id: row._id },
            update: { $setOnInsert: row },
            upsert: true,
          },
        }))
      );
  }
  const counts = await Promise.all(
    [Block, HarvestingActivity, FieldActivity].map((Model) =>
      Model.countDocuments({ estateId: estate._id, importId: payload.importId })
    )
  );
  if (
    counts.some(
      (n, i) => n !== [blocks.length, harvest.length, field.length][i]
    )
  )
    throw new Error("Workbook count mismatch");
  await Estate.updateOne(
    { _id: estate._id },
    { $set: { workbookImportId: payload.importId } }
  );
  return {
    blocks: counts[0],
    harvesting: counts[1],
    fieldActivities: counts[2],
    matchedBlocks: blocks.filter((b) => b.mapBlockNames.length).length,
    removedRows: payload.removed.length,
  };
}
