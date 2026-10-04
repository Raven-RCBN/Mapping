import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { createHash } from "node:crypto";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "offline-shell",
      closeBundle() {
        const files = fs.readdirSync("dist/assets").map((f) => "/assets/" + f);
        const source = fs
          .readFileSync("public/sw.js", "utf8")
          .replaceAll(
            "__SHELL_FILES__",
            JSON.stringify([
              "/",
              "/index.html",
              "/manifest.webmanifest",
              "/icon.svg",
              ...files,
            ])
          )
          .replace(
            "__VERSION__",
            createHash("sha256")
              .update(files.join(","))
              .digest("hex")
              .slice(0, 12)
          );
        fs.writeFileSync("dist/sw.js", source);
      },
    },
  ],
  server: { proxy: { "/api": "http://127.0.0.1:4180" } },
  preview: { proxy: { "/api": "http://127.0.0.1:4180" } },
});
