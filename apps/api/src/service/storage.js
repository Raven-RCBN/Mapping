import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { canAccess } from "./auth.js";
import { secureStoredFile, fileHash } from "./files.js";
import { activeAsset, selection } from "./queries.js";
import { QueryError } from "./performance.js";

const GRACE = 30 * 86400000;
const admin = (req, res, next) =>
  req.access.role === "admin"
    ? next()
    : res
        .status(403)
        .json({ error: "Administrator access is required to manage storage." });
export function installStorage(api, { Asset }, config) {
  // Preview tokens are single-use, short-lived, scoped to the authenticated administrator.
  const previews = new Map();
  const now = () => (config.clock ? config.clock() : new Date());
  const shape = z.object({
    estateId: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
    before: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (s) => !isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s)
      ),
    keep: z.number().int().min(1).max(1000).default(2),
    action: z.enum(["retire", "purge"]),
  });
  async function candidates(input) {
    const retained = await Asset.find({
      estateId: input.estateId,
      kind: "imagery",
      ...activeAsset,
    })
      .sort({ acquiredAt: -1, _id: -1 })
      .limit(input.keep)
      .select("_id")
      .lean();
    const query = {
      estateId: input.estateId,
      kind: "imagery",
      acquiredAt: { $lt: input.before },
      ...(input.action === "retire"
        ? { ...activeAsset, _id: { $nin: retained.map((x) => x._id) } }
        : {
            storageState: { $in: ["retired", "purging"] },
            retiredAt: { $lte: new Date(now().getTime() - GRACE) },
          }),
    };
    return Asset.find(query)
      .sort({ acquiredAt: 1, _id: 1 })
      .limit(101)
      .maxTimeMS(10000)
      .lean();
  }
  api.get("/storage", async (req, res) => {
    const q = selection(req);
    const groups = await Asset.aggregate([
      { $match: q.scope },
      {
        $group: {
          _id: {
            estate: "$estateId",
            kind: "$kind",
            state: { $ifNull: ["$storageState", "active"] },
          },
          files: { $sum: 1 },
          bytes: { $sum: "$file.bytes" },
        },
      },
    ]).option({ maxTimeMS: 10000 });
    const stat = await fs.statfs(config.dataDir);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(q.scope))
      .digest("hex");
    let after = {};
    if (q.cursor) {
      try {
        const c = JSON.parse(Buffer.from(q.cursor, "base64url").toString());
        if (
          c.f !== fingerprint ||
          typeof c.id !== "string" ||
          c.id.length > 100 ||
          typeof c.at !== "string" ||
          isNaN(Date.parse(c.at))
        )
          throw Error();
        const at = new Date(c.at);
        after = {
          $or: [
            { retiredAt: { $gt: at } },
            { retiredAt: at, _id: { $gt: c.id } },
          ],
        };
      } catch {
        throw new QueryError(
          "Invalid storage page cursor. Return to the first page."
        );
      }
    }
    const retired = await Asset.find({
      ...after,
      ...q.scope,
      storageState: { $in: ["retired", "purging"] },
    })
      .select("_id name estateId acquiredAt retiredAt storageState file.bytes")
      .sort({ retiredAt: 1, _id: 1 })
      .limit(101)
      .maxTimeMS(10000)
      .lean();
    const last = retired[99];
    res.json({
      groups,
      retired: retired.slice(0, 100).map(({ _id, file, ...x }) => ({
        ...x,
        id: _id,
        bytes: file.bytes,
        purgeAfter: new Date(new Date(x.retiredAt).getTime() + GRACE),
      })),
      nextCursor:
        retired.length > 100
          ? Buffer.from(
              JSON.stringify({
                f: fingerprint,
                at: last.retiredAt,
                id: last._id,
              })
            ).toString("base64url")
          : null,
      freeDiskBytes: Number(stat.bavail) * Number(stat.bsize),
      recoveryDays: 30,
      batchLimit: 100,
    });
  });
  api.post("/storage/preview", admin, async (req, res) => {
    const input = shape.parse(req.body);
    if (!canAccess(req, input.estateId))
      throw new QueryError("Estate access denied", 403);
    const list = await candidates(input),
      files = list.slice(0, 100);
    for (const [key, value] of previews)
      if (value.until < Date.now()) previews.delete(key);
    while (previews.size >= 30) previews.delete(previews.keys().next().value);
    const token = randomUUID();
    previews.set(token, {
      input,
      subject: req.access.subject,
      ids: files.map((x) => x._id),
      until: Date.now() + 5 * 60000,
    });
    res.json({
      token,
      action: input.action,
      files: files.map((x) => ({
        id: x._id,
        name: x.name,
        acquiredAt: x.acquiredAt,
        bytes: x.file.bytes,
      })),
      bytes: files.reduce((n, x) => n + x.file.bytes, 0),
      more: list.length > 100,
      recoveryDays: 30,
    });
  });
  api.post("/storage/apply", admin, async (req, res) => {
    const { token, confirmation } = z
      .object({
        token: z.string().uuid(),
        confirmation: z.enum(["RETIRE", "PURGE"]),
      })
      .parse(req.body);
    const preview = previews.get(token);
    if (
      !preview ||
      preview.subject !== req.access.subject ||
      preview.until < Date.now() ||
      confirmation !== preview.input.action.toUpperCase()
    )
      throw new QueryError(
        "Preview expired or confirmation does not match. Preview again.",
        409
      );
    previews.delete(token);
    // Re-evaluate retention immediately before applying: newly acquired imagery may change the protected set.
    const permitted = new Set(
      (await candidates(preview.input)).map((x) => x._id)
    );
    if (preview.ids.some((id) => !permitted.has(id)))
      throw new QueryError(
        "Storage changed since the preview. Preview again.",
        409
      );
    const completed = [],
      skipped = [];
    for (const id of preview.ids) {
      const row = await Asset.findById(id);
      if (!row || !canAccess(req, row.estateId) || row.kind !== "imagery") {
        skipped.push(id);
        continue;
      }
      if (preview.input.action === "retire") {
        const result = await Asset.updateOne(
          { _id: id, ...activeAsset },
          {
            $set: {
              storageState: "retired",
              retiredAt: now(),
              retiredBy: req.access.subject,
            },
          }
        );
        if (result.modifiedCount) completed.push(id);
        else skipped.push(id);
        continue;
      }
      // A shared path (including a terrain/QGIS asset) must never be removed.
      if (
        await Asset.exists({
          _id: { $ne: id },
          "file.path": row.file.path,
          storageState: { $ne: "purged" },
        })
      ) {
        skipped.push(id);
        continue;
      }
      // Purge only files from this estate's imagery directory; protect QGIS projects, boundaries and terrain.
      const relative = row.file.path.replaceAll("\\", "/");
      if (
        !relative.startsWith(`estates/${row.estateId}/images/`) &&
        !relative.startsWith(`estates/${row.estateId}/imagery/`)
      ) {
        skipped.push(id);
        continue;
      }
      const locked = await Asset.findOneAndUpdate(
        {
          _id: id,
          storageState: { $in: ["retired", "purging"] },
          retiredAt: { $lte: new Date(now().getTime() - GRACE) },
        },
        { $set: { storageState: "purging" } },
        { new: true }
      );
      if (!locked) {
        skipped.push(id);
        continue;
      }
      try {
        try {
          const filename = await secureStoredFile(config.dataDir, relative);
          if ((await fileHash(filename)) !== row.file.sha256)
            throw new QueryError(
              "File changed; purge stopped for this asset.",
              409
            );
          await fs.unlink(filename);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        // Keep metadata as the durable audit trail. Retry recovers after a crash between unlink and this write.
        await Asset.updateOne(
          { _id: id, storageState: "purging" },
          {
            $set: {
              storageState: "purged",
              purgedAt: now(),
              purgedBy: req.access.subject,
            },
          }
        );
        completed.push(id);
      } catch {
        skipped.push(id);
      }
    }
    res.json({ action: preview.input.action, completed, skipped });
  });
  api.post("/storage/:id/restore", admin, async (req, res) => {
    const row = await Asset.findById(req.params.id);
    if (!row) throw new QueryError("Image not found", 404);
    if (!canAccess(req, row.estateId))
      throw new QueryError("Estate access denied", 403);
    await secureStoredFile(config.dataDir, row.file.path);
    const result = await Asset.updateOne(
      { _id: row._id, storageState: "retired" },
      {
        $set: { storageState: "active" },
        $unset: { retiredAt: "", retiredBy: "" },
      }
    );
    if (!result.modifiedCount)
      throw new QueryError("Only retired images can be restored.", 409);
    res.json({ restored: true });
  });
}
