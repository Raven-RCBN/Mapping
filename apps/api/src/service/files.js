import path from "node:path";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
export function resolveStoredFile(root, relative) {
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
  let bytes;
  try {
    bytes = await image.rotate().png().toBuffer();
  } catch {
    throw new ImageInputError(
      "The image is damaged or exceeds the pixel limit."
    );
  }
  const id = randomUUID(),
    relative = `estates/${estateId}/images/${id}.png`,
    full = resolveStoredFile(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full + ".tmp", bytes, { flag: "wx" });
  await fs.rename(full + ".tmp", full);
  return {
    id,
    file: {
      path: relative,
      mime: "image/png",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
