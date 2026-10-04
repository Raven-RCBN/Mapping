import path from "node:path";
import { createApp } from "../app.js";
import { createModels } from "../model/index.js";

// AuthHandler must be the host's existing verified-session middleware.
// Never trust request headers/body to supply a role or user object.
export function agrinexusAccess(AuthHandler, AccessGrant) {
  return (req, res, next) => {
    if (!req.signedCookies?.["user.sid"] && !req.headers.authorization?.startsWith("Bearer "))
      return res.status(401).json({ error: "Sign in to AgriNexus to open Estate Atlas." });
    return AuthHandler(req, res, async (err) => {
      if (err) return next(err);
      try {
        const subject = req.user?.Id?.toString();
        if (!subject) return res.status(401).json({ error: "AgriNexus session required." });
        if (req.user.RootUser === true) {
          req.access = { subject, role: "admin", estateIds: null };
        } else {
          const grant = await AccessGrant.findById(subject).lean();
          if (!grant?.active) return res.status(403).json({ error: "Ask your administrator for Estate Atlas access." });
          // Non-root users cannot promote themselves beyond their explicit mapping grant.
          req.access = { subject, role: grant.role, estateIds: grant.role === "admin" ? null : grant.estateIds };
        }
        next();
      } catch (error) { next(error); }
    });
  };
}
export async function mountEstateAtlas(app, { connection, AuthHandler, dataDir, qgisUrl, qgisCommand }) {
  const models = createModels(connection, "EstateAtlas");
  const mapping = await createApp({
    models, dataDir, authMode: "agrinexus", production: true,
    authenticate: agrinexusAccess(AuthHandler, models.AccessGrant),
    origins: ["https://agrinexus.digitalpalm.ai"],
    apiPath: "", publicApiPath: "/api/EstateAtlas", serveWeb: false,
    qgisUrl, qgisCommand, qgisRoot: path.join(dataDir, "estates"),
  });
  // A case-sensitive router preserves the exact EstateAtlas API namespace.
  const { default: express } = await import("express");
  const router = express.Router({ caseSensitive: true });
  router.use("/api/EstateAtlas", mapping);
  app.use(router);
  return models;
}
