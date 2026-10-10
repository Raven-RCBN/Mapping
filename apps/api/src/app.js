import { installMosaic } from "./service/mosaic.js";
import { installProduction } from "./service/production.js";
import express from "express";
import { renderQgisCgi } from "./service/qgis.js";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import {
  installQueries,
  activeAsset,
  selection,
  bounded,
} from "./service/queries.js";
import { installStorage } from "./service/storage.js";
import { compressedJson, QueryError } from "./service/performance.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import * as defaultModels from "./model/index.js";
import { authentication, canAccess, requireWrite } from "./service/auth.js";
import {
  resolveStoredFile,
  ingestImage,
  ImageInputError,
  secureStoredFile,
} from "./service/files.js";
import { ROOT } from "./config/index.js";
import { activityView } from "../../../packages/shared/activities.js";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s),
    "Invalid date"
  );
const bounds = z
  .array(z.array(z.number().finite()).length(2))
  .length(2)
  .refine(
    (b) =>
      b[0][0] >= -90 &&
      b[1][0] <= 90 &&
      b[0][1] >= -180 &&
      b[1][1] <= 180 &&
      b[0][0] < b[1][0] &&
      b[0][1] < b[1][1],
    "Use valid south-west / north-east bounds"
  );
const id = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
const clean = (doc) => {
  const { _id, __v, ...rest } = doc;
  return { ...rest, id: _id };
};
const publicAsset = (a, base = "/api") => {
  const { _id, file, mosaic, ...rest } = a;
  return {
    ...rest,
    id: _id,
    url: `${base}/assets/${_id}/file`,
    mime: file.mime,
    bytes: file.bytes,
    sha256: file.sha256,
    ...(mosaic?.levels?.length ? { tilePyramid: {
      url: `${base}/assets/${_id}/tiles/{z}/{x}/{y}`,
      sha256: mosaic.sha256,
      levels: mosaic.levels.map(({ cols, rows, xmin, ymin, xmax, ymax }) =>
        ({ cols, rows, xmin, ymin, xmax, ymax })),
    } } : {}),
  };
};
export async function createApp(config) {
  const {
    Estate,
    Asset,
    Activity,
    Source,
    Block,
    HarvestingActivity,
    FieldActivity,
  } = config.models || defaultModels;
  const apiPath = config.apiPath ?? "/api";
  const productionModels = config.models || defaultModels;
  await Promise.all([productionModels.ProductionName, productionModels.MonthlyProduction, productionModels.YearlyProduction].filter(Boolean).map(m=>m.createIndexes()));
  const mount = apiPath || "/";
  const expose = (a) => publicAsset(a, config.publicApiPath || "/api");
  // Build only declared indexes; never drop or synchronize away existing indexes.
  await Promise.all(
    [
      Estate,
      Asset,
      Activity,
      Source,
      Block,
      HarvestingActivity,
      FieldActivity,
    ].map((m) => m.createIndexes())
  );
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (
      origin &&
      !config.origins.includes(origin) &&
      origin !== `${req.protocol}://${req.get("host")}`
    )
      return res.status(403).json({ error: "Origin not allowed" });
    next();
  });
  app.use(mount, cors({ origin: config.origins }));
  app.use(express.json({ limit: "8mb" }));
  app.use(compressedJson);
  app.get(apiPath + "/health", (_req, res) =>
    res.json({
      status: "ok",
      storage: "filesystem",
      queryMode: "paged",
      storageRecoveryDays: 30,
      metadata: "mongodb",
      auth: config.authMode,
    })
  );
  const api = express.Router();
  api.use(config.authenticate || authentication(config));
  api.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-mapping-client"] !== "1"
    )
      return res.status(400).json({ error: "Missing mapping client header" });
    next();
  });
  const models = config.models || defaultModels;
  installQueries(api, models, expose);
  installStorage(api, models, config);
  installProduction(api, models);
  const snapshot = async (req) => {
    const q = selection(req),
      scope = q.scope;
    const range =
      q.from || q.to
        ? { ...(q.from && { $gte: q.from }), ...(q.to && { $lt: q.to }) }
        : null;
    const tooLarge =
      "This offline package is too large. Select fewer estates or a shorter date range (maximum 25,000 records, 200 files and 512 MB).";
    const previous = q.from
      ? await Asset.aggregate([
          {
            $match: {
              ...scope,
              ...activeAsset,
              kind: "imagery",
              acquiredAt: { $lt: q.from },
            },
          },
          { $sort: { estateId: 1, acquiredAt: -1, _id: -1 } },
          { $group: { _id: "$estateId", id: { $first: "$_id" } } },
          { $limit: 100 },
        ]).option({ maxTimeMS: 10000 })
      : [];
    const assetScope = range
      ? {
          ...scope,
          ...activeAsset,
          $or: [
            { kind: { $ne: "imagery" } },
            { acquiredAt: range },
            { _id: { $in: previous.map((x) => x.id) } },
          ],
        }
      : { ...scope, ...activeAsset };
    const [estates, assets, activities, sources, blocks, harvesting, field] =
      await Promise.all([
        bounded(
          Estate.find(scope.estateId ? { _id: scope.estateId } : {}),
          100,
          tooLarge
        ),
        bounded(Asset.find(assetScope), 200, tooLarge),
        bounded(
          Activity.find({ ...scope, ...(range && { date: range }) }),
          25000,
          tooLarge
        ),
        bounded(Source.find(scope), 1000, tooLarge),
        bounded(Block.find(scope), 5000, tooLarge),
        bounded(
          HarvestingActivity.find({
            ...scope,
            ...(range && { workDate: range }),
          }),
          25000,
          tooLarge
        ),
        bounded(
          FieldActivity.find({ ...scope, ...(range && { workDate: range }) }),
          25000,
          tooLarge
        ),
      ]);
    if (
      activities.length + harvesting.length + field.length > 25000 ||
      assets.reduce((n, a) => n + (a.file?.bytes || 0), 0) > 512 * 1024 * 1024
    )
      throw new QueryError(tooLarge, 413);
    return {
      version: 2,
      blocks: blocks.map(clean),
      estates: estates.map(clean),
      assets: assets.map(expose),
      activities: [
        ...activities
          .filter(
            (r) => !estates.find((e) => e._id === r.estateId)?.workbookImportId
          )
          .map(clean),
        ...harvesting.map((r) => activityView(r, "harvesting")),
        ...field.map((r) => activityView(r, "field")),
      ],
      sources: sources.map(clean),
      access: { role: req.access.role, subject: req.access.subject },
    };
  };
  const geolocation = z
    .object({
      type: z.literal("Point"),
      coordinates: z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ]),
      accuracyMetres: z.number().min(0).optional(),
    })
    .nullable();
  for (const [route, model, kind] of [
    ["harvesting", HarvestingActivity, "harvesting"],
    ["field-activities", FieldActivity, "field"],
  ]) {
    api.post("/" + route, requireWrite, async (req, res) => {
      const common = {
        estateId: id,
        blockId: id,
        workDate: date,
        gang: z.string().max(200),
        geolocation: geolocation.default(null),
      };
      const details =
        kind === "harvesting"
          ? {
              employeeNo: z.string().max(100),
              employeeName: z.string().max(200),
              activity: z.literal("Harvesting").default("Harvesting"),
              bunches: z.number().finite().min(0),
            }
          : {
              activityCode: z.string().min(1).max(100),
              activityDescription: z.string().min(1).max(500),
              mandays: z.number().finite().min(0),
            };
      const row = z.object({ ...common, ...details }).parse(req.body);
      if (!canAccess(req, row.estateId)) return res.sendStatus(403);
      const block = await Block.findOne({
        _id: row.blockId,
        estateId: row.estateId,
      }).lean();
      if (!block)
        return res.status(400).json({ error: "Choose a block in this estate" });
      const record = await model.create({
        ...row,
        _id: randomUUID(),
        blockCode: block.blockCode,
        status: "recorded",
      });
      res.status(201).json(activityView(record.toObject(), kind));
    });
    api.patch(
      "/" + route + "/:id/geolocation",
      requireWrite,
      async (req, res) => {
        const record = await model.findById(id.parse(req.params.id));
        if (!record) return res.sendStatus(404);
        if (!canAccess(req, record.estateId)) return res.sendStatus(403);
        record.geolocation = geolocation.parse(req.body.geolocation);
        record.locationUpdatedBy = req.access.subject;
        record.locationUpdatedAt = new Date();
        await record.save();
        res.json(activityView(record.toObject(), kind));
      }
    );
    api.patch("/" + route + "/:id/verify", requireWrite, async (req, res) => {
      const record = await model.findById(id.parse(req.params.id));
      if (!record) return res.sendStatus(404);
      if (!canAccess(req, record.estateId)) return res.sendStatus(403);
      record.status = "verified";
      record.verifiedBy = req.access.subject;
      record.verifiedAt = new Date();
      await record.save();
      res.json(activityView(record.toObject(), kind));
    });
  }
  api.patch("/blocks/:id/map-links", requireWrite, async (req, res) => {
    const block = await Block.findById(id.parse(req.params.id));
    if (!block) return res.sendStatus(404);
    if (!canAccess(req, block.estateId)) return res.sendStatus(403);
    const links = z
      .array(z.string().min(1))
      .max(100)
      .parse(req.body.mapBlockNames);
    const estate = await Estate.findById(block.estateId).lean();
    const names = new Set(
      estate.boundary?.features.map((f) => f.properties.blockName)
    );
    if (links.some((name) => !names.has(name)))
      return res
        .status(400)
        .json({ error: "Choose map blocks from this estate" });
    block.mapBlockNames = [...new Set(links)];
    block.mapLinkMethod = "confirmed";
    await block.save();
    res.json(clean(block.toObject()));
  });
  api.get("/estates/:id/qgis", async (req, res) => {
    const estateId = id.parse(req.params.id);
    if (!canAccess(req, estateId)) return res.sendStatus(403);
    if (
      (!config.qgisUrl && !config.qgisCommand) ||
      !(await Estate.exists({ _id: estateId, qgis: true }))
    )
      return res.status(503).json({ error: "QGIS service not configured" });
    const q = z
      .object({
        LAYERS: z.enum(["terrain", "hillshade", "slope"]),
        BBOX: z
          .string()
          .regex(/^-?[\d.e+]+,-?[\d.e+]+,-?[\d.e+]+,-?[\d.e+]+$/i),
        WIDTH: z.coerce.number().int().min(1).max(2048),
        HEIGHT: z.coerce.number().int().min(1).max(2048),
      })
      .parse(req.query);
    const bbox = q.BBOX.split(",").map(Number);
    if (
      bbox.some((n) => !Number.isFinite(n) || Math.abs(n) > 3e7) ||
      bbox[0] >= bbox[2] ||
      bbox[1] >= bbox[3]
    )
      return res.status(400).json({ error: "Invalid map extent" });
    const params = new URLSearchParams({
      ...q,
      MAP: `${config.qgisRoot}/${estateId}/qgis/published.qgz`,
      SERVICE: "WMS",
      REQUEST: "GetMap",
      VERSION: "1.1.1",
      SRS: "EPSG:3857",
      FORMAT: "image/png",
      TRANSPARENT: "true",
    });
    const project = await fs.stat(params.get("MAP")).catch(() => null);
    const tag = createHash("sha256")
      .update(params.toString() + ":" + project?.mtimeMs)
      .digest("hex");
    res
      .set("Cache-Control", "private, no-cache")
      .set("ETag", '"' + tag + '"')
      .vary("Authorization")
      .vary("Cookie");
    if (req.fresh) return res.status(304).end();
    try {
      if (config.qgisCommand)
        return res
          .type("png")
          .send(await renderQgisCgi(config.qgisCommand, params));
      const url = new URL(config.qgisUrl);
      url.search = params.toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("image/png")
      )
        return res.status(502).json({ error: "QGIS render failed" });
      res.type("png").send(Buffer.from(await response.arrayBuffer()));
    } catch {
      return res.status(503).json({ error: "QGIS service unavailable" });
    }
  });
  api.get("/snapshot", async (req, res) => res.json(await snapshot(req)));
  api.post("/estates", requireWrite, async (req, res) => {
    if (req.access.role !== "admin")
      return res
        .status(403)
        .json({ error: "Administrator access is required to add estates." });
    const data = z
      .object({
        name: z.string().trim().min(1).max(100),
        location: z.string().max(150).default(""),
        totalAreaHa: z.number().min(0).nullable().optional(),
      })
      .parse(req.body);
    const doc = await Estate.create({ _id: randomUUID(), ...data });
    res.status(201).json(clean(doc.toObject()));
  });
  api.put("/estates/:id/boundary", requireWrite, async (req, res) => {
    const estateId = id.parse(req.params.id);
    if (!canAccess(req, estateId)) return res.sendStatus(403);
    const estate = await Estate.findById(estateId);
    if (!estate) return res.sendStatus(404);
    const body = z
      .object({
        boundary: z.object({
          type: z.literal("FeatureCollection"),
          features: z
            .array(
              z.object({
                type: z.literal("Feature"),
                properties: z.record(z.string(), z.unknown()).default({}),
                geometry: z.object({
                  type: z.enum(["Polygon", "MultiPolygon"]),
                  coordinates: z.array(z.unknown()),
                }),
              })
            )
            .min(1)
            .max(10000),
        }),
        date: date.optional(),
      })
      .parse(req.body);
    const validRing = (ring) =>
      Array.isArray(ring) &&
      ring.length >= 4 &&
      ring.every(
        (p) =>
          Array.isArray(p) &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1]) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 90
      ) &&
      ring[0][0] === ring.at(-1)[0] &&
      ring[0][1] === ring.at(-1)[1];
    if (
      body.boundary.features.some((f) => {
        const polys =
          f.geometry.type === "Polygon"
            ? [f.geometry.coordinates]
            : f.geometry.coordinates;
        return (
          !polys.length ||
          polys.some(
            (poly) =>
              !Array.isArray(poly) || !poly.length || !poly.every(validRing)
          )
        );
      })
    )
      return res.status(400).json({ error: "Invalid WGS 84 polygon rings" });
    const names = new Set();
    for (const [i, f] of body.boundary.features.entries()) {
      const name = String(
        f.properties.blockName || f.properties.name || `Block ${i + 1}`
      );
      if (names.has(name))
        return res.status(400).json({ error: "Duplicate block names" });
      names.add(name);
      f.properties.blockName = name;
    }
    const folder = path.join(config.dataDir, "estates", estateId, "boundaries");
    await fs.mkdir(folder, { recursive: true });
    const filename = path.join(folder, `${randomUUID()}.geojson`);
    await fs.writeFile(filename, JSON.stringify(body.boundary));
    estate.boundary = body.boundary;
    estate.boundaryDate = body.date;
    estate.source = path.basename(filename);
    await estate.save();
    res.json(clean(estate.toObject()));
  });
  const staging = path.join(config.dataDir, ".staging");
  await fs.mkdir(staging, { recursive: true, mode: 0o750 });
  let imageJobs = 0;
  const imageGate = (req, res, next) => {
    if (imageJobs >= 2)
      return res
        .status(429)
        .set("Retry-After", "3")
        .json({ error: "Two image jobs are running. Retry shortly." });
    imageJobs++;
    let done = false;
    const release = () => {
      if (!done) {
        done = true;
        imageJobs--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
  const upload = multer({
    dest: staging,
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 8 },
  });
  api.post(
    "/estates/:id/images",
    requireWrite,
    (req, res, next) => {
      if (!canAccess(req, req.params.id)) return res.sendStatus(403);
      fs.statfs(config.dataDir)
        .then((stat) => {
          if (Number(stat.bavail) * Number(stat.bsize) < 512 * 1024 * 1024)
            return res.status(507).json({
              error:
                "Less than 512 MB of server disk is available. Free space before uploading imagery.",
            });
          next();
        })
        .catch(next);
    },
    imageGate,
    upload.single("file"),
    async (req, res, next) => {
      let saved;
      try {
        const estateId = id.parse(req.params.id);
        if (!(await Estate.exists({ _id: estateId })))
          return res.status(404).json({ error: "Estate not found" });
        const data = z
          .object({
            name: z.string().trim().min(1).max(200),
            acquiredAt: date,
            bounds,
          })
          .parse({
            ...req.body,
            bounds: JSON.parse(req.body.bounds || "null"),
          });
        if (!req.file)
          return res.status(400).json({ error: "Choose an image" });
        saved = await ingestImage(config.dataDir, req.file.path, estateId);
        const asset = await Asset.create({
          _id: saved.id,
          estateId,
          ...data,
          kind: "imagery",
          file: saved.file,
          importedAt: new Date().toISOString(),
          attribution: "Estate image upload",
        });
        res.status(201).json(expose(asset.toObject()));
      } catch (e) {
        if (saved)
          await fs
            .unlink(resolveStoredFile(config.dataDir, saved.file.path))
            .catch(() => {});
        next(e);
      } finally {
        if (req.file) await fs.unlink(req.file.path).catch(() => {});
      }
    }
  );
  installMosaic(api, { Asset }, config, canAccess);
  for (const variant of ["file", "thumbnail"])
    api.get(
      "/assets/:id/" + variant,
      ...(variant === "thumbnail" ? [imageGate] : []),
      async (req, res) => {
        const asset = await Asset.findById(id.parse(req.params.id)).lean();
        if (!asset) return res.sendStatus(404);
        if (!canAccess(req, asset.estateId)) return res.sendStatus(403);
        if (["retired", "purging", "purged"].includes(asset.storageState))
          return res
            .status(410)
            .json({ error: "This image has been retired." });
        const filename = await secureStoredFile(
          config.dataDir,
          asset.file.path
        );
        res
          .set("Cache-Control", "private, no-cache")
          .set("ETag", '"' + asset.file.sha256 + "-" + variant + '"')
          .vary("Authorization")
          .vary("Cookie");
        if (req.fresh) return res.status(304).end();
        if (variant === "thumbnail") {
          if (asset.kind !== "imagery") return res.sendStatus(404);
          return res.type("webp").send(
            await sharp(filename, { limitInputPixels: 100000000 })
              .resize({
                width: 384,
                height: 256,
                fit: "inside",
                withoutEnlargement: true,
              })
              .webp({ quality: 70 })
              .toBuffer()
          );
        }
        res
          .set("Content-Type", asset.file.mime)
          .set("Content-Disposition", "inline");
        res.sendFile(filename, { cacheControl: false });
      }
    );
  api.patch("/activities/:id/verify", requireWrite, async (req, res) => {
    const activity = await Activity.findById(req.params.id);
    if (!activity) return res.sendStatus(404);
    if (!canAccess(req, activity.estateId)) return res.sendStatus(403);
    activity.status = "verified";
    activity.verifiedBy = req.access.subject;
    activity.verifiedAt = new Date();
    await activity.save();
    res.json(clean(activity.toObject()));
  });
  api.post("/sources", requireWrite, async (req, res) => {
    const data = z
      .object({
        estateId: id,
        name: z.string().min(1).max(150),
        type: z.enum([
          "Folder",
          "WMS / WMTS service",
          "Satellite catalog",
          "Database API",
        ]),
        path: z.string().min(1).max(2000),
        schedule: z.enum(["Manual", "Daily", "Weekly", "Monthly"]),
        retention: z.literal("Keep every version"),
      })
      .parse(req.body);
    if (!canAccess(req, data.estateId)) return res.sendStatus(403);
    if (!(await Estate.exists({ _id: data.estateId })))
      return res.sendStatus(404);
    res
      .status(201)
      .json(
        clean((await Source.create({ _id: randomUUID(), ...data })).toObject())
      );
  });
  api.get("/offline", async (req, res) => {
    const wanted = String(req.query.estates || "")
      .split(",")
      .filter(Boolean);
    if (!wanted.length || wanted.some((x) => !canAccess(req, x)))
      return res.status(400).json({ error: "Select authorised estates" });
    const data = await snapshot(req);
    for (const k of ["estates", "assets", "activities", "sources", "blocks"])
      data[k] = data[k].filter((x) =>
        wanted.includes(k === "estates" ? x.id : x.estateId)
      );
    const files = data.assets
      .filter((a) => a.kind !== "qgis")
      .map((a) => ({
        id: a.id,
        url: a.url,
        sha256: a.sha256,
        bytes: a.bytes,
        mime: a.mime,
      }));
    res.json({
      version: 1,
      createdAt: new Date().toISOString(),
      snapshot: data,
      files,
    });
  });
  app.use(mount, api);
  app.use(mount, (_req, res) =>
    res.status(404).json({ error: "Unknown API endpoint" })
  );
  if (config.serveWeb !== false) {
    const web = path.join(ROOT, "apps/web/dist");
    app.use(express.static(web));
    app.get("/{*path}", (req, res) =>
      res.sendFile(path.join(web, "index.html"))
    );
  }
  app.use((err, _req, res, _next) => {
    const bad =
      err instanceof ImageInputError ||
      err instanceof z.ZodError ||
      err instanceof SyntaxError ||
      err instanceof multer.MulterError;
    const status =
      err instanceof QueryError
        ? err.status
        : err.code === 50
        ? 503
        : bad
        ? 400
        : 500;
    res.status(status).json({
      error:
        err.code === 50
          ? "This query took too long. Select a shorter date range or fewer estates."
          : err instanceof QueryError
          ? err.message
          : bad
          ? err.issues?.[0]?.message || err.message
          : "Unable to save or load this resource. Check the API log.",
    });
    if (status >= 500) console.error(err.message);
  });
  return app;
}
