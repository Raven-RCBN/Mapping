import path from "node:path";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { createReadStream } from "node:fs";
async function rejectSymlinks(root, relative) {
  let current = path.resolve(root);
  for (const component of relative.split("/")) {
    current = path.join(current, component);
    if ((await fs.lstat(current)).isSymbolicLink())
      throw new ImageInputError(
        "Symbolic links are not accepted in estate storage"
      );
  }
}
export async function secureStoredFile(root, relative) {
  const full = resolveStoredFile(root, relative),
    realRoot = await fs.realpath(root);
  await rejectSymlinks(root, relative);
  const real = await fs.realpath(full);
  if (
    !real.startsWith(realRoot + path.sep) ||
    (await fs.lstat(full)).isSymbolicLink()
  )
    throw new ImageInputError("Unsafe stored file path");
  if (!(await fs.stat(real)).isFile())
    throw new ImageInputError("Stored resource is not a file");
  return real;
}
export async function fileHash(file) {
  const hash = createHash("sha256");
  for await (const part of createReadStream(file)) hash.update(part);
  return hash.digest("hex");
}
export function resolveStoredFile(root, relative) {
  if (
    typeof relative !== "string" ||
    path.isAbsolute(relative) ||
    relative.includes("\\") ||
    relative.split("/").some((p) => !p || p === ".." || p === ".")
  )
    throw new ImageInputError("Invalid stored path");
  const full = path.resolve(root, relative);
  if (!full.startsWith(path.resolve(root) + path.sep))
    throw Error("Invalid stored path");
  return full;
}
export class ImageInputError extends Error {}
export async function ingestImage(root, temporary, estateId) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(estateId))
    throw Error("Invalid estate identifier");
  const image = sharp(temporary, { limitInputPixels: 100000000 });
  let meta;
  try {
    meta = await image.metadata();
  } catch {
    throw new ImageInputError(
      "This file is not a readable image. Choose PNG, JPEG or WebP."
    );
  }
  if (!["png", "jpeg", "webp"].includes(meta.format))
    throw new ImageInputError(
      "Upload a PNG, JPEG or WebP image. Export GeoTIFF to PNG in QGIS for the web overlay."
    );
  // Decode the full image and normalise it; raw uploads never become executable files.
  const id = randomUUID(),
    relative = `estates/${estateId}/images/${id}.png`,
    full = resolveStoredFile(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o750 });
  await rejectSymlinks(root, path.posix.dirname(relative));
  const parent = await fs.realpath(path.dirname(full)),
    realRoot = await fs.realpath(root);
  if (!parent.startsWith(realRoot + path.sep))
    throw new ImageInputError("Unsafe image folder");
  try {
    // Stream the normalised image to disk; do not allocate an entire decoded image buffer in JS.
    await image
      .rotate()
      .png()
      .toFile(full + ".tmp");
    await fs.chmod(full + ".tmp", 0o640);
  } catch {
    await fs.unlink(full + ".tmp").catch(() => {});
    throw new ImageInputError(
      "The image is damaged or exceeds the pixel limit."
    );
  }
  await fs.rename(full + ".tmp", full);
  return {
    id,
    file: {
      path: relative,
      mime: "image/png",
      bytes: (await fs.stat(full)).size,
      sha256: await fileHash(full),
    },
  };
}
