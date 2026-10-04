import { gzip } from "node:zlib";

// Bounded, process-local cache. No personnel records, credentials or images here.
export class SummaryCache {
  constructor({
    ttl = 20000,
    maxBytes = 8 * 1024 * 1024,
    maxEntries = 100,
  } = {}) {
    Object.assign(this, { ttl, maxBytes, maxEntries });
    this.entries = new Map();
    this.bytes = 0;
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
  get(key) {
    const e = this.entries.get(key);
    if (!e) return null;
    if (e.until < Date.now()) {
      this.entries.delete(key);
      this.bytes -= e.bytes;
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.value;
  }
  set(key, value) {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > this.maxBytes) return value;
    if (this.entries.has(key)) {
      this.bytes -= this.entries.get(key).bytes;
      this.entries.delete(key);
    }
    while (
      this.entries.size &&
      (this.entries.size >= this.maxEntries ||
        this.bytes + bytes > this.maxBytes)
    ) {
      const first = this.entries.keys().next().value;
      this.bytes -= this.entries.get(first).bytes;
      this.entries.delete(first);
    }
    this.entries.set(key, { value, bytes, until: Date.now() + this.ttl });
    this.bytes += bytes;
    return value;
  }
}

// JSON only: PNG/JPEG/WebP and streamed GIS files are already compressed.
export function compressedJson(req, res, next) {
  const json = res.json.bind(res);
  res.json = (value) => {
    res.vary("Accept-Encoding");
    const bytes = Buffer.from(JSON.stringify(value));
    if (
      bytes.length < 2048 ||
      req.acceptsEncodings("gzip") !== "gzip" ||
      res.get("Content-Encoding")
    )
      return json(value);
    gzip(bytes, { level: 4 }, (error, zipped) => {
      if (res.destroyed) return;
      if (error) return json(value);
      res.type("json").set("Content-Encoding", "gzip").send(zipped);
    });
    return res;
  };
  next();
}

export class QueryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
