import fs from "node:fs/promises";
import sharp from "sharp";
import { secureStoredFile } from "./files.js";

// CarryMap's reviewed raster pyramid uses bottom-up rows AND bottom-up pixels.
// Read only the requested embedded WebP; never decode the full estate raster.
export async function readMosaicTile(root, mosaic, z, x, y) {
  if (![z, x, y].every(Number.isSafeInteger)) return null;
  const level = mosaic.levels[z];
  if (!level || x < 0 || y < 0 || x >= level.cols || y >= level.rows) return null;
  const filename = await secureStoredFile(root, mosaic.path);
  const file = await fs.open(filename, "r");
  try {
    const size = (await file.stat()).size;
    const read = async (offset, length) => {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > size)
        throw Error("Invalid mosaic offset");
      const buffer = Buffer.alloc(length);
      if ((await file.read(buffer, 0, length, offset)).bytesRead !== length)
        throw Error("Incomplete mosaic tile");
      return buffer;
    };
    const index = (level.rows - 1 - y) * level.cols + x;
    const entry = await read(level.indexOffset + index * 8, 8);
    if (entry[6] !== 0 || entry[7] !== 3) throw Error("Invalid mosaic index");
    const offset = mosaic.dataOffset + entry.readUIntLE(0, 6);
    const header = await read(offset, 8);
    if (header[0] !== 3) throw Error("Invalid mosaic tile type");
    let length = 0, shift = 0, cursor = 1;
    for (; cursor < 6; cursor++) {
      const byte = header[cursor];
      length += (byte & 127) * 2 ** shift;
      shift += 7;
      if (byte < 128) { cursor++; break; }
    }
    if (length < 12 || length > 1024 * 1024 || cursor >= 6)
      throw Error("Invalid mosaic tile length");
    const raw = await read(offset + cursor, length);
    if (raw.toString("ascii", 0, 4) !== "RIFF" || raw.toString("ascii", 8, 12) !== "WEBP")
      throw Error("Invalid mosaic tile image");
    return await sharp(raw, { limitInputPixels: 256 * 256 }).flip().png().toBuffer();
  } finally { await file.close(); }
}

export function installMosaic(api, { Asset }, config, canAccess) {
  api.get("/assets/:id/tiles/:z/:x/:y", async (req, res) => {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(req.params.id) ||
        ![req.params.z, req.params.x, req.params.y].every(v => /^\d{1,6}$/.test(v)))
      return res.sendStatus(400);
    const asset = await Asset.findById(req.params.id).lean();
    if (!asset) return res.sendStatus(404);
    if (!canAccess(req, asset.estateId)) return res.sendStatus(403);
    if (["retired", "purging", "purged"].includes(asset.storageState)) return res.sendStatus(410);
    if (asset.kind !== "reference-image" || !asset.mosaic?.levels?.length) return res.sendStatus(404);
    const { z, x, y } = req.params;
    const tile = await readMosaicTile(config.dataDir, asset.mosaic, +z, +x, +y);
    if (!tile) return res.sendStatus(404);
    res.set("Cache-Control", "private, no-cache")
      .set("ETag", `"${asset.mosaic.sha256}-${z}-${x}-${y}"`)
      .vary("Authorization").vary("Cookie");
    if (req.fresh) return res.status(304).end();
    res.type("png").send(tile);
  });
}
