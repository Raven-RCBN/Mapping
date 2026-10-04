import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
export const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });
export function configFromEnv(env = process.env) {
  const production = env.NODE_ENV === "production";
  const authMode = env.AUTH_MODE || (production ? "jwt" : "development");
  if (production && authMode !== "jwt")
    throw Error("Production requires AUTH_MODE=jwt.");
  if (
    authMode === "jwt" &&
    (!env.JWT_PUBLIC_KEY_PATH || !env.JWT_ISSUER || !env.JWT_AUDIENCE)
  )
    throw Error("Configure JWT_PUBLIC_KEY_PATH, JWT_ISSUER and JWT_AUDIENCE.");
  return {
    qgisUrl: env.QGIS_SERVER_URL,
    qgisRoot: env.QGIS_PROJECT_ROOT || "/data/estates",
    production,
    authMode,
    host: env.HOST || (production ? "0.0.0.0" : "127.0.0.1"),
    port: Number(env.PORT || 4180),
    mongoUri: env.MONGODB_URI || "mongodb://127.0.0.1:27018/DigitalPalmMapping",
    dataDir: path.resolve(ROOT, env.DATA_DIR || "data"),
    publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    origins: (
      env.CORS_ORIGINS || "http://localhost:5177,http://127.0.0.1:5177"
    ).split(","),
  };
}
