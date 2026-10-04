import { createHash } from "node:crypto";
import { z } from "zod";
import { canAccess, estateQuery } from "./auth.js";
import { QueryError, SummaryCache } from "./performance.js";
import { activityView } from "../../../../packages/shared/activities.js";
import {
  mappedBlocks,
  compareMapRecords,
} from "../../../../packages/shared/mapped-records.js";
import { buckets } from "../../../../packages/shared/timeline.js";

export const activeAsset = {
  storageState: { $nin: ["retired", "purging", "purged"] },
};
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => !isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s)
  );
const identifier = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
const input = (req) => (req.method === "POST" ? req.body : req.query);
const visibility = z
  .object({
    mode: z.enum(["include", "exclude"]),
    fields: z.array(z.string().max(500)).max(500),
    harvesting: z.boolean(),
  })
  .strict();
const parameters = z.object({
  mapVisibility: visibility.optional(),
  mappedOnly: z.enum(["true", "false"]).default("false"),
  mapMode: z.enum(["groups", "records"]).default("groups"),
  estates: z.string().max(8100).optional(),
  from: day.optional(),
  to: day.optional(),
  activity: z.string().max(100).default("all"),
  fieldActivity: z.string().max(500).default("all"),
  block: z.string().max(250).default("all"),
  review: z.enum(["true", "false"]).default("false"),
  gps: z.string().max(100).optional(),
  q: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(1500).optional(),
});
export function selection(req) {
  const q = parameters.parse(input(req));
  const ids = q.estates
    ?.split(",")
    .filter(Boolean)
    .map((x) => identifier.parse(x));
  if (ids && (ids.length > 100 || ids.some((x) => !canAccess(req, x))))
    throw new QueryError("Select authorised estates", 403);
  if (q.from && q.to && q.from >= q.to)
    throw new QueryError("The end date must follow the start date.");
  q.scope = ids ? { estateId: { $in: [...new Set(ids)] } } : estateQuery(req);
  if (q.block !== "all") {
    const [estate, code, extra] = q.block.split("::");
    if (
      !estate ||
      !code ||
      extra ||
      !canAccess(req, estate) ||
      (ids && !ids.includes(estate))
    )
      throw new QueryError("Invalid block selection");
    q.scope = { estateId: estate };
    q.blockCode = code;
  }
  if (q.gps && q.gps !== "block") {
    const point = q.gps.split(",").map(Number);
    if (
      point.length !== 2 ||
      !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 90
    )
      throw new QueryError("Invalid location");
    q.point = point;
  }
  return q;
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function matchRecords(q, kind, dates = true) {
  const match = { ...q.scope };
  if (q.blockCode) match.blockCode = q.blockCode;
  if (kind !== "blocks") {
    if (q.matchedBlockIds) match.blockId = { $in: q.matchedBlockIds };
    if (dates && (q.from || q.to))
      match.workDate = {
        ...(q.from && { $gte: q.from }),
        ...(q.to && { $lt: q.to }),
      };
    if (q.mapVisibility) {
      if (kind === "harvesting" && !q.mapVisibility.harvesting)
        match._id = { $in: [] };
      if (kind === "field") {
        const descriptions = {
          activityDescription: {
            [q.mapVisibility.mode === "include" ? "$in" : "$nin"]:
              q.mapVisibility.fields.includes("")
                ? [...q.mapVisibility.fields, null]
                : q.mapVisibility.fields,
          },
        };
        // Keep the older single-description API filter as an intersection.
        match.$and = [descriptions];
      }
    }
    if (q.review === "true") match.status = { $ne: "verified" };
    if (q.gps === "block") match.geolocation = null;
    else if (q.point) match["geolocation.coordinates"] = q.point;
    if (kind === "field" && q.fieldActivity !== "all")
      match.activityDescription = q.fieldActivity;
    if (
      (kind === "field" &&
        q.activity !== "all" &&
        q.activity !== "Field activity") ||
      (kind === "harvesting" &&
        q.activity !== "all" &&
        q.activity !== "Harvesting")
    )
      match._id = { $in: [] };
  }
  if (q.q) {
    // Anchored, literal prefix search. Never accept raw client regular expressions.
    const fields =
      kind === "blocks"
        ? ["blockCode"]
        : kind === "harvesting"
        ? ["blockCode", "employeeNo", "employeeName", "gang"]
        : ["blockCode", "activityCode", "activityDescription", "gang"];
    match.$or = fields.map((key) => ({
      [key]: { $regex: "^" + escape(q.q), $options: "i" },
    }));
  }
  return match;
}
const clean = ({ _id, ...r }) => ({ ...r, id: _id });
const aggregate = (m, p) =>
  m.aggregate(p).option({ maxTimeMS: 10000, allowDiskUse: true });
const totalsGroup = (kind) => ({
  _id: null,
  count: { $sum: 1 },
  value: {
    $sum:
      kind === "harvesting" ? "$bunches" : kind === "field" ? "$mandays" : 0,
  },
  verified: { $sum: { $cond: [{ $eq: ["$status", "verified"] }, 1, 0] } },
  first: { $min: "$workDate" },
  last: { $max: "$workDate" },
});
export async function bounded(query, limit, message) {
  const rows = await query
    .limit(limit + 1)
    .maxTimeMS(10000)
    .lean();
  if (rows.length > limit) throw new QueryError(message, 413);
  return rows;
}

export function installQueries(api, models, expose) {
  const { Estate, Asset, Source, Block, HarvestingActivity, FieldActivity } =
    models;
  const cache = new SummaryCache();
  const readPost = (req) =>
    req.method === "POST" &&
    (["/dashboard", "/timeline", "/map-popup"].includes(req.path) ||
      /^\/records\/(blocks|harvesting|field)$/.test(req.path));
  // POST read queries keep large multi-selections out of proxy URL limits.
  const readRoute = (path, handler) => {
    api.get(path, handler);
    api.post(path, handler);
  };
  let readers = 0;
  api.use((req, res, next) => {
    if (
      (req.method !== "GET" && !readPost(req)) ||
      (![
        "/activity-options",
        "/map-popup",
        "/dashboard",
        "/timeline",
        "/snapshot",
        "/offline",
        "/workspace",
        "/blocks",
        "/harvesting",
        "/field-activities",
      ].includes(req.path) &&
        !req.path.startsWith("/records/"))
    )
      return next();
    if (readers >= 16)
      return res
        .status(429)
        .set("Retry-After", "2")
        .json({ error: "The estate query service is busy. Retry shortly." });
    readers++;
    let done = false;
    const release = () => {
      if (!done) {
        done = true;
        readers--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  });
  api.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) && !readPost(req))
      res.on("finish", () => {
        if (res.statusCode < 400) cache.clear();
      });
    next();
  });
  const cached = async (req, key, fn) => {
    const scope = JSON.stringify([
      req.access.subject,
      req.access.role,
      req.access.estateIds,
      key,
    ]);
    return cache.get(scope) || cache.set(scope, await fn());
  };
  const kinds = [
    ["harvesting", HarvestingActivity],
    ["field", FieldActivity],
  ];
  async function mapSelection(req) {
    const q = selection(req);
    if (q.mappedOnly !== "true" && q.mapMode !== "records") return q;
    q.matchedBlockIds = await cached(
      req,
      ["mapped-blocks", q.scope],
      async () => {
        const [blocks, estates] = await Promise.all([
          bounded(
            Block.find(q.scope).select("estateId mapBlockNames"),
            5000,
            "Select fewer estates."
          ),
          bounded(
            Estate.find(
              q.scope.estateId ? { _id: q.scope.estateId } : {}
            ).select("boundary"),
            100,
            "Select fewer estates."
          ),
        ]);
        return mappedBlocks(blocks, estates).map((b) => b._id);
      }
    );
    return q;
  }
  async function individualMapPage(q) {
    const matches = kinds.map(([kind]) => matchRecords(q, kind));
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([matches, q.limit]))
      .digest("hex");
    let after;
    if (q.cursor) {
      try {
        after = JSON.parse(Buffer.from(q.cursor, "base64url").toString());
        if (
          after.f !== fingerprint ||
          !["field", "harvesting"].includes(after.kind) ||
          typeof after.id !== "string" ||
          after.id.length > 100 ||
          !day.safeParse(after.date).success
        )
          throw Error();
      } catch {
        throw new QueryError(
          "This page does not match the selected map activities."
        );
      }
    }
    const lists = await Promise.all(
      kinds.map(async ([kind, model], i) => {
        const cursorMatch = after
          ? {
              $or: [
                { workDate: { $lt: after.date } },
                { workDate: after.date, _id: { $lt: after.id } },
                ...(kind < after.kind
                  ? [{ workDate: after.date, _id: after.id }]
                  : []),
              ],
            }
          : {};
        const rows = await model
          .find({ $and: [matches[i], cursorMatch] })
          .select(
            "estateId blockId blockCode workDate status geolocation activity activityDescription mandays bunches"
          )
          .sort({ workDate: -1, _id: -1 })
          .limit(q.limit + 1)
          .maxTimeMS(10000)
          .lean();
        return rows.map((r) => activityView(r, kind));
      })
    );
    const ordered = lists.flat().sort(compareMapRecords),
      rows = ordered.slice(0, q.limit),
      last = rows.at(-1);
    return {
      rows,
      mapMode: "records",
      limit: q.limit,
      nextCursor:
        ordered.length > q.limit
          ? Buffer.from(
              JSON.stringify({
                f: fingerprint,
                date: last.date,
                id: last.id,
                kind: last.recordKind,
              })
            ).toString("base64url")
          : null,
    };
  }
  api.get("/bootstrap", async (req, res) => {
    const scoped = estateQuery(req);
    const estates = await bounded(
      Estate.find(
        req.access.estateIds === null
          ? {}
          : { _id: { $in: req.access.estateIds } }
      ).select("-boundary"),
      100,
      "Limit access to 100 estates per workspace."
    );
    const latest = await Promise.all(
      kinds.map(([, m]) =>
        m
          .findOne(scoped)
          .sort({ workDate: -1, _id: -1 })
          .select("workDate")
          .maxTimeMS(10000)
          .lean()
      )
    );
    res.json({
      version: 3,
      paged: true,
      estates: estates.map(clean),
      blocks: [],
      assets: [],
      sources: [],
      activities: [],
      latest: latest
        .map((x) => x?.workDate)
        .filter(Boolean)
        .sort()
        .at(-1),
      access: { role: req.access.role, subject: req.access.subject },
    });
  });
  api.get("/workspace", async (req, res) => {
    const q = selection(req);
    const ids = q.scope.estateId ? { _id: q.scope.estateId } : {};
    const [estates, blocks, sources] = await Promise.all([
      bounded(Estate.find(ids), 100, "Select fewer estates."),
      bounded(
        Block.find(q.scope).sort({ blockCode: 1 }),
        5000,
        "Select fewer estates; maximum 5,000 blocks per map workspace."
      ),
      bounded(Source.find(q.scope), 1000, "Select fewer estates."),
    ]);
    res.json({
      estates: estates.map(clean),
      blocks: blocks.map(clean),
      sources: sources.map(clean),
    });
  });

  async function page(req, res, kind) {
    const model =
      kind === "blocks"
        ? Block
        : kind === "harvesting"
        ? HarvestingActivity
        : FieldActivity;
    const q = selection(req),
      match = matchRecords(q, kind),
      key = kind === "blocks" ? "blockCode" : "workDate";
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([kind, match, q.limit]))
      .digest("hex");
    let after = {};
    if (q.cursor) {
      try {
        const c = JSON.parse(Buffer.from(q.cursor, "base64url").toString());
        if (
          c.f !== fingerprint ||
          typeof c.v !== "string" ||
          typeof c.id !== "string" ||
          c.id.length > 100
        )
          throw Error();
        after = {
          $or: [{ [key]: { $lt: c.v } }, { [key]: c.v, _id: { $lt: c.id } }],
        };
      } catch {
        throw new QueryError(
          "This page cursor does not match the current filters. Start at the first page."
        );
      }
    }
    const [found, summary] = await Promise.all([
      model
        .find({ $and: [match, after] })
        .sort({ [key]: -1, _id: -1 })
        .limit(q.limit + 1)
        .maxTimeMS(10000)
        .lean(),
      cached(
        req,
        ["table", kind, match],
        async () =>
          (
            await aggregate(model, [
              { $match: match },
              { $group: totalsGroup(kind) },
            ])
          )[0] || { count: 0, value: 0 }
      ),
    ]);
    const more = found.length > q.limit,
      rows = found.slice(0, q.limit),
      last = rows.at(-1);
    res.json({
      items: rows.map((r) =>
        kind === "blocks" ? clean(r) : activityView(r, kind)
      ),
      summary,
      nextCursor: more
        ? Buffer.from(
            JSON.stringify({ f: fingerprint, v: last[key], id: last._id })
          ).toString("base64url")
        : null,
      limit: q.limit,
    });
  }
  readRoute("/records/:kind", async (req, res) =>
    page(
      req,
      res,
      z.enum(["blocks", "harvesting", "field"]).parse(req.params.kind)
    )
  );
  for (const [route, kind] of [
    ["blocks", "blocks"],
    ["harvesting", "harvesting"],
    ["field-activities", "field"],
  ])
    api.get("/" + route, (req, res) => page(req, res, kind));

  readRoute("/dashboard", async (req, res) => {
    const q = await mapSelection(req);
    if (q.mapMode === "records") {
      const [page, totals] = await Promise.all([
        individualMapPage(q),
        cached(
          req,
          ["map-totals", { ...q, cursor: undefined, limit: undefined }],
          async () => {
            const result = await Promise.all(
              kinds.map(async ([kind, model]) => {
                const [data] = await aggregate(model, [
                  { $match: matchRecords({ ...q, review: "false" }, kind) },
                  {
                    $facet: {
                      all: [{ $group: totalsGroup(kind) }],
                      visible: [
                        ...(q.review === "true"
                          ? [{ $match: { status: { $ne: "verified" } } }]
                          : []),
                        { $group: totalsGroup(kind) },
                      ],
                    },
                  },
                ]);
                return { kind, ...data };
              })
            );
            const summarize = (key) => {
              const total = { count: 0, verified: 0, bunches: 0, mandays: 0 };
              for (const r of result) {
                const t = r[key][0];
                if (!t) continue;
                total.count += t.count;
                total.verified += t.verified;
                total[r.kind === "harvesting" ? "bunches" : "mandays"] =
                  t.value;
              }
              return { ...total, pending: total.count - total.verified };
            };
            return {
              summary: summarize("visible"),
              selectionSummary: summarize("all"),
            };
          }
        ),
      ]);
      return res.json({ ...page, ...totals });
    }
    res.json(
      await cached(req, ["dashboard", q], async () => {
        const result = await Promise.all(
          kinds.map(async ([kind, model]) => {
            const [data] = await aggregate(model, [
              { $match: matchRecords({ ...q, review: "false" }, kind) },
              {
                $facet: {
                  totals: [{ $group: totalsGroup(kind) }],
                  visibleTotals: [
                    ...(q.review === "true"
                      ? [{ $match: { status: { $ne: "verified" } } }]
                      : []),
                    { $group: totalsGroup(kind) },
                  ],
                  groups: [
                    ...(q.review === "true"
                      ? [{ $match: { status: { $ne: "verified" } } }]
                      : []),
                    {
                      $group: {
                        _id: {
                          estateId: "$estateId",
                          blockId: "$blockId",
                          block: "$blockCode",
                          point: {
                            $ifNull: ["$geolocation.coordinates", null],
                          },
                        },
                        count: { $sum: 1 },
                        value: {
                          $sum: kind === "harvesting" ? "$bunches" : "$mandays",
                        },
                        date: { $max: "$workDate" },
                      },
                    },
                    {
                      $sort: {
                        date: -1,
                        "_id.estateId": 1,
                        "_id.block": 1,
                        "_id.point": 1,
                      },
                    },
                    { $limit: 501 },
                  ],
                },
              },
            ]);
            return { kind, ...data };
          })
        );
        const rows = result.flatMap(({ kind, groups }) =>
          groups.slice(0, 500).map((g) =>
            activityView(
              {
                _id: JSON.stringify([kind, g._id]),
                estateId: g._id.estateId,
                blockId: g._id.blockId,
                blockCode: g._id.block,
                workDate: g.date,
                geolocation: g._id.point
                  ? { type: "Point", coordinates: g._id.point }
                  : null,
                [kind === "harvesting" ? "bunches" : "mandays"]: g.value,
                count: g.count,
                summary: true,
              },
              kind
            )
          )
        );
        const summarize = (key) => {
          const total = { count: 0, verified: 0, bunches: 0, mandays: 0 };
          for (const r of result) {
            const t = r[key][0];
            if (!t) continue;
            total.count += t.count;
            total.verified += t.verified;
            total[r.kind === "harvesting" ? "bunches" : "mandays"] = t.value;
          }
          return { ...total, pending: total.count - total.verified };
        };
        return {
          rows,
          // Map/list totals respect the review tab; cards retain the selection's denominator.
          summary: summarize("visibleTotals"),
          selectionSummary: summarize("totals"),
          limited: result.some((r) => r.groups.length > 500),
          groupLimit: 500,
        };
      })
    );
  });

  readRoute("/map-popup", async (req, res) => {
    const q = selection(req);
    // A popup is scoped to one block/location; never scan an entire unselected estate.
    if (!q.blockCode || !q.gps)
      throw new QueryError("Select an activity location");
    const matches = kinds.map(([kind]) => matchRecords(q, kind));
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([matches, q.limit]))
      .digest("hex");
    let after = null;
    if (q.cursor) {
      try {
        const c = JSON.parse(Buffer.from(q.cursor, "base64url").toString());
        if (
          c.f !== fingerprint ||
          !["field", "harvesting"].includes(c.kind) ||
          typeof c.activity !== "string" ||
          c.activity.length > 500
        )
          throw Error();
        after = c;
      } catch {
        throw new QueryError("This page does not match the selected activity.");
      }
    }
    const result = await cached(
      req,
      ["map-popup", matches, q.limit, after],
      async () => {
        const lists = await Promise.all(
          kinds.map(async ([kind, model], i) => {
            if (after && kind < after.kind) return [];
            const items = await aggregate(model, [
              { $match: matches[i] },
              {
                $group: {
                  _id:
                    kind === "harvesting"
                      ? { $literal: "Harvesting" }
                      : {
                          $cond: [
                            {
                              $eq: [
                                { $ifNull: ["$activityDescription", ""] },
                                "",
                              ],
                            },
                            "Field activity",
                            "$activityDescription",
                          ],
                        },
                  mandays: { $sum: kind === "harvesting" ? 0 : "$mandays" },
                },
              },
              ...(after?.kind === kind
                ? [{ $match: { _id: { $gt: after.activity } } }]
                : []),
              { $sort: { _id: 1 } },
              { $limit: q.limit + 1 },
            ]);
            return items.map((r) => ({
              kind,
              activity: r._id || "Field activity",
              mandays: kind === "harvesting" ? null : r.mandays,
            }));
          })
        );
        const ordered = lists
          .flat()
          .sort((a, b) =>
            Buffer.compare(
              Buffer.from(a.kind + "\0" + a.activity),
              Buffer.from(b.kind + "\0" + b.activity)
            )
          );
        const rows = ordered.slice(0, q.limit),
          last = rows.at(-1);
        return {
          items: rows.map(({ activity, mandays }) => ({ activity, mandays })),
          nextCursor:
            ordered.length > q.limit
              ? Buffer.from(
                  JSON.stringify({
                    f: fingerprint,
                    kind: last.kind,
                    activity: last.activity,
                  })
                ).toString("base64url")
              : null,
        };
      }
    );
    res.json(result);
  });

  api.get("/activity-options", async (req, res) => {
    const q = await mapSelection(req);
    const after = z.string().max(500).optional().parse(req.query.after);
    const where = {
      ...q.scope,
      ...(q.matchedBlockIds ? { blockId: { $in: q.matchedBlockIds } } : {}),
    };
    if (q.q) where.activityDescription = { $regex: escape(q.q), $options: "i" };
    res.json(
      await cached(req, ["activity-options", where, q.q, after], async () => {
        const [result] = await aggregate(FieldActivity, [
          { $match: where },
          { $group: { _id: { $ifNull: ["$activityDescription", ""] } } },
          {
            $facet: {
              total: [{ $count: "count" }],
              names: [
                ...(after !== undefined
                  ? [{ $match: { _id: { $gt: after } } }]
                  : []),
                { $sort: { _id: 1 } },
                { $limit: 51 },
              ],
            },
          },
        ]);
        const items = result.names.slice(0, 50).map((x) => x._id);
        return {
          items,
          total: result.total[0]?.count || 0,
          next: result.names.length > 50 ? items.at(-1) : null,
        };
      })
    );
  });

  readRoute("/timeline", async (req, res) => {
    const q = await mapSelection(req),
      anchor = day.parse(input(req).anchor),
      period = z
        .enum(["day", "week", "month", "year", "all"])
        .parse(input(req).period || "day");
    const before = input(req).before ? day.parse(input(req).before) : null;
    const windows = buckets(anchor, period, period === "all" ? 12 : 7);
    res.json(
      await cached(
        req,
        ["timeline", req.method, q, anchor, period, before],
        async () => {
          const result = await Promise.all(
            kinds.map(async ([kind, model]) => {
              const [data] = await aggregate(model, [
                { $match: matchRecords(q, kind, false) },
                {
                  $facet: {
                    totals: [{ $group: totalsGroup(kind) }],
                    windows: [
                      {
                        $match: {
                          workDate: {
                            $gte: windows[0].start,
                            $lt: windows.at(-1).end,
                          },
                        },
                      },
                      {
                        $group: {
                          _id: {
                            $switch: {
                              branches: windows.map((w, i) => ({
                                case: {
                                  $and: [
                                    { $gte: ["$workDate", w.start] },
                                    { $lt: ["$workDate", w.end] },
                                  ],
                                },
                                then: i,
                              })),
                              default: -1,
                            },
                          },
                          count: { $sum: 1 },
                        },
                      },
                    ],
                    days: [
                      ...(before
                        ? [{ $match: { workDate: { $lt: before } } }]
                        : []),
                      { $group: { _id: "$workDate", count: { $sum: 1 } } },
                      { $sort: { _id: -1 } },
                      { $limit: 41 },
                    ],
                  },
                },
              ]);
              return { kind, ...data };
            })
          );
          // Retain the old GET response for clients still running the previous shell.
          const descriptions =
            req.method === "GET"
              ? await aggregate(FieldActivity, [
                  { $match: q.scope },
                  { $group: { _id: "$activityDescription" } },
                  { $sort: { _id: 1 } },
                  { $limit: 201 },
                ])
              : null;
          const days = new Map();
          for (const r of result)
            for (const d of r.days)
              days.set(d._id, (days.get(d._id) || 0) + d.count);
          const sorted = [...days].sort((a, b) => b[0].localeCompare(a[0]));
          const assets = await Asset.find({
            ...q.scope,
            ...activeAsset,
            kind: "imagery",
            acquiredAt: { $gte: windows[0].start, $lt: windows.at(-1).end },
          })
            .select("-file")
            .sort({ acquiredAt: -1, _id: -1 })
            .limit(201)
            .maxTimeMS(10000)
            .lean();
          return {
            windows,
            series: result.map(({ kind, totals, windows }) => ({
              kind,
              totals: totals[0] || { count: 0 },
              windows,
            })),
            days: sorted.slice(0, 40).map(([date, count]) => ({ date, count })),
            nextBefore: sorted.length > 40 ? sorted[39][0] : null,
            ...(descriptions
              ? {
                  descriptions: descriptions
                    .slice(0, 200)
                    .map((x) => x._id)
                    .filter(Boolean),
                  descriptionsLimited: descriptions.length > 200,
                }
              : {}),
            assets: assets.slice(0, 200).map(clean),
            assetsLimited: assets.length > 200,
          };
        }
      )
    );
  });
  api.get("/map-assets", async (req, res) => {
    const q = selection(req),
      at = day.parse(req.query.at);
    const estates = await bounded(
      Estate.find(q.scope.estateId ? { _id: q.scope.estateId } : {}).select(
        "_id"
      ),
      100,
      "Select fewer estates."
    );
    const list = await Promise.all(
      estates.map(async (e) => {
        const [imagery, core] = await Promise.all([
          Asset.find({
            estateId: e._id,
            ...activeAsset,
            kind: "imagery",
            acquiredAt: { $lte: at },
          })
            .sort({ acquiredAt: -1, _id: -1 })
            .limit(2)
            .maxTimeMS(10000)
            .lean(),
          Asset.find({
            estateId: e._id,
            ...activeAsset,
            kind: { $ne: "imagery" },
          })
            .sort({ acquiredAt: -1, _id: -1 })
            .limit(30)
            .maxTimeMS(10000)
            .lean(),
        ]);
        return [...imagery, ...core];
      })
    );
    const explicit = String(req.query.ids || "")
      .split(",")
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => identifier.parse(x));
    const extras = await Asset.find({
      ...q.scope,
      ...activeAsset,
      _id: { $in: explicit },
    }).lean();
    res.json([
      ...new Map(
        [...list.flat(), ...extras].map((a) => [a._id, expose(a)])
      ).values(),
    ]);
  });
  return cache;
}
