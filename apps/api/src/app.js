import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Estate, Asset, Activity, Source } from "./model/index.js";
import {
  authentication,
  estateQuery,
  canAccess,
  requireWrite,
} from "./service/auth.js";
import {
  resolveStoredFile,
  ingestImage,
  ImageInputError,
} from "./service/files.js";
import { ROOT } from "./config/index.js";
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
const publicAsset = (a) => {
  const { _id, file, ...rest } = a;
  return {
    ...rest,
    id: _id,
    url: `/api/assets/${_id}/file`,
    mime: file.mime,
    bytes: file.bytes,
    sha256: file.sha256,
  };
};
export async function createApp(config) {
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
  app.use("/api", cors({ origin: config.origins }));
  app.use(express.json({ limit: "8mb" }));
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      storage: "filesystem",
      metadata: "mongodb",
      auth: config.authMode,
    })
  );
  const api = express.Router();
  api.use(authentication(config));
  api.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-mapping-client"] !== "1"
    )
      return res.status(400).json({ error: "Missing mapping client header" });
    next();
  });
  const estateIds = (req) =>
    req.access.estateIds === null ? {} : { _id: { $in: req.access.estateIds } };
  const snapshot = async (req) => {
    const [estates, assets, activities, sources] = await Promise.all([
      Estate.find(estateIds(req)).lean(),
      Asset.find(estateQuery(req)).lean(),
      Activity.find(estateQuery(req)).lean(),
      Source.find(estateQuery(req)).lean(),
    ]);
    return {
      version: 1,
      estates: estates.map(clean),
      assets: assets.map(publicAsset),
      activities: activities.map(clean),
      sources: sources.map(clean),
      access: { role: req.access.role, subject: req.access.subject },
    };
  };
  api.get("/estates/:id/qgis", async (req, res) => {
    const estateId = id.parse(req.params.id);
    if (!canAccess(req, estateId)) return res.sendStatus(403);
    if (
      !config.qgisUrl ||
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
    const url = new URL(config.qgisUrl);
    url.search = new URLSearchParams({
      ...q,
      MAP: `${config.qgisRoot}/${estateId}/qgis/published.qgz`,
      SERVICE: "WMS",
      REQUEST: "GetMap",
      VERSION: "1.1.1",
      SRS: "EPSG:3857",
      FORMAT: "image/png",
      TRANSPARENT: "true",
    }).toString();
    try {
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
  await fs.mkdir(staging, { recursive: true });
  const upload = multer({
    dest: staging,
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 8 },
  });
  api.post(
    "/estates/:id/images",
    requireWrite,
    (req, res, next) => {
      if (!canAccess(req, req.params.id)) return res.sendStatus(403);
      next();
    },
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
        res.status(201).json(publicAsset(asset.toObject()));
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
  api.get("/assets/:id/file", async (req, res) => {
    const asset = await Asset.findById(id.parse(req.params.id)).lean();
    if (!asset) return res.sendStatus(404);
    if (!canAccess(req, asset.estateId)) return res.sendStatus(403);
    res.set("Content-Type", asset.file.mime);
    res.set("ETag", `"${asset.file.sha256}"`);
    res.sendFile(resolveStoredFile(config.dataDir, asset.file.path));
  });
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
    for (const k of ["estates", "assets", "activities", "sources"])
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
  app.use("/api", api);
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown API endpoint" })
  );
  const web = path.join(ROOT, "apps/web/dist");
  app.use(express.static(web));
  app.get("/{*path}", (req, res) => res.sendFile(path.join(web, "index.html")));
  app.use((err, _req, res, _next) => {
    const bad =
      err instanceof ImageInputError ||
      err instanceof z.ZodError ||
      err instanceof SyntaxError ||
      err instanceof multer.MulterError;
    res
      .status(bad ? 400 : 500)
      .json({
        error: bad
          ? err.issues?.[0]?.message || err.message
          : "Unable to save or load this resource. Check the API log.",
      });
    if (!bad) console.error(err.message);
  });
  return app;
}
