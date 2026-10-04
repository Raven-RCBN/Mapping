import fs from "node:fs";
import jwt from "jsonwebtoken";
import { AccessGrant } from "../model/index.js";
export function authentication(config) {
  const key =
    config.authMode === "jwt" ? fs.readFileSync(config.publicKeyPath) : null;
  return async (req, res, next) => {
    if (config.authMode === "development") {
      const ip = req.socket.remoteAddress;
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip))
        return res
          .status(403)
          .json({ error: "Development access is restricted to localhost." });
      req.access = {
        subject: "local-development",
        role: "admin",
        estateIds: null,
      };
      return next();
    }
    try {
      const token = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null;
      const claims = jwt.verify(token, key, {
        algorithms: ["RS256"],
        issuer: config.issuer,
        audience: config.audience,
      });
      const grant = await AccessGrant.findById(
        String(claims.Id || claims.sub)
      ).lean();
      if (!grant?.active)
        return res
          .status(403)
          .json({ error: "No active mapping access grant." });
      req.access = {
        subject: grant._id,
        role: grant.role,
        estateIds: grant.role === "admin" ? null : grant.estateIds,
      };
      next();
    } catch {
      return res
        .status(401)
        .json({ error: "A valid DigitalPalm access token is required." });
    }
  };
}
export const estateQuery = (req) =>
  req.access.estateIds === null
    ? {}
    : { estateId: { $in: req.access.estateIds } };
export const canAccess = (req, id) =>
  req.access.estateIds === null || req.access.estateIds.includes(id);
export function requireWrite(req, res, next) {
  if (!["manager", "admin"].includes(req.access.role))
    return res.status(403).json({ error: "Manager access is required." });
  next();
}
