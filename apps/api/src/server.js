import mongoose from "mongoose";
import { configFromEnv } from "./config/index.js";
import { createApp } from "./app.js";
const config = configFromEnv();
await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
const app = await createApp(config);
const server = app.listen(config.port, config.host, () =>
  console.log(
    `Mapping API: http://${config.host}:${config.port} · MongoDB metadata · filesystem images`
  )
);
async function close() {
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
