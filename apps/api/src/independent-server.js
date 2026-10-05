import express from 'express';
import mongoose from 'mongoose';
import path from 'node:path';
import { createApp } from './app.js';
import { sessionAuth } from './service/session-auth.js';
const required = ['MONGODB_URI', 'DATA_DIR', 'PUBLIC_ORIGIN', 'PORT', 'QGIS_COMMAND'];
for (const key of required) if (!process.env[key]) throw Error(`Missing ${key}`);
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid dedicated service port');
if (!path.isAbsolute(process.env.DATA_DIR) || !path.isAbsolute(process.env.QGIS_COMMAND)) throw Error('Use absolute storage/runtime paths');
await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
const auth = await sessionAuth(mongoose.connection, process.env.PUBLIC_ORIGIN);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use('/api/v1/users', auth.router);
app.use(await createApp({
  production: true, authMode: 'mapping-session', authenticate: auth.authenticate,
  dataDir: process.env.DATA_DIR, qgisRoot: path.join(process.env.DATA_DIR, 'estates'),
  qgisCommand: process.env.QGIS_COMMAND, origins: [process.env.PUBLIC_ORIGIN],
  apiPath: '/api/EstateAtlas', publicApiPath: '/api/EstateAtlas', serveWeb: false,
}));
app.use((error, req, res, next) => {
  console.error('Mapping request failed:', error.name);
  res.status(500).json({ error: 'Request failed.' });
});
const server = app.listen(port, '127.0.0.1', () => console.log('Independent Mapping API ready'));
async function close() { server.close(); await mongoose.disconnect(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
