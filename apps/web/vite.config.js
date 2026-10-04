import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { createHash } from "node:crypto";
const base = process.env.VITE_BASE_PATH || "/";
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))
  throw Error("VITE_BASE_PATH must be an absolute directory path ending in /");
export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: "offline-shell",
      closeBundle() {
        const files = fs
          .readdirSync("dist/assets")
          .map((f) => base + "assets/" + f);
        const source = fs
          .readFileSync("public/sw.js", "utf8")
          .replaceAll(
            "__SHELL_FILES__",
            JSON.stringify([
              base,
              base + "index.html",
              base + "manifest.webmanifest",
              base + "icon.svg",
              ...files,
            ])
          )
          .replaceAll("__BASE_PATH__", base)
          .replace(
            "__VERSION__",
            createHash("sha256")
              .update(
                base + files.join(",") + fs.readFileSync("public/sw.js", "utf8")
              )
              .digest("hex")
              .slice(0, 12)
          );
        fs.writeFileSync("dist/sw.js", source);
        const manifest = JSON.parse(
          fs.readFileSync("public/manifest.webmanifest", "utf8")
        );
        manifest.id = base;
        manifest.start_url = base;
        manifest.scope = base;
        manifest.icons.forEach((icon) => {
          icon.src = base + "icon.svg";
        });
        fs.writeFileSync("dist/manifest.webmanifest", JSON.stringify(manifest));
      },
    },
  ],
  server: { proxy: { "/api": "http://127.0.0.1:4180" } },
  preview: { proxy: { "/api": "http://127.0.0.1:4180" } },
});
