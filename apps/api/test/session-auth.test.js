import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { sessionAuth, sessionModels, passwordHash } from '../src/service/session-auth.js';
const origin = 'https://mapping.example.test';
let app, User, Session;
before(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27018/MappingTest_session_${Date.now()}`);
  ({ User, Session } = sessionModels(mongoose.connection));
  await User.create({ _id: 'Admin', passwordHash: await passwordHash('test-secret-123'), role: 'admin' });
  const auth = await sessionAuth(mongoose.connection, origin);
  app = express();
  app.use('/identity', auth.router);
  app.get('/private', auth.authenticate, (req, res) => res.json(req.access));
  app.post('/private', auth.authenticate, (req, res) => res.json(req.access));
});
after(async () => {
  if (mongoose.connection.name?.startsWith('MappingTest_')) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
const login = (password = 'test-secret-123') => request(app).post('/identity/login').set('Origin', origin).set('X-Mapping-Client', '1').send({ login: 'Admin', password });
test('independent login rejects unknown credentials and cross-origin requests', async () => {
  assert.equal((await request(app).post('/identity/login').send({ login: 'Admin', password: 'test-secret-123' })).status, 403);
  assert.equal((await login('incorrect')).status, 401);
  assert.equal((await request(app).get('/private')).status, 401);
});
test('cookie is private, sessions are hashed, revoked on logout, and rejected after expiry', async () => {
  const result = await login();
  assert.equal(result.status, 200);
  assert.equal(result.body.data.authenticated, true);
  assert.equal(result.body.data.token, undefined);
  const header = result.headers['set-cookie'][0];
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(header.includes(flag));
  const cookie = header.split(';')[0];
  const raw = cookie.split('=')[1];
  assert.equal(await Session.findById(raw), null);
  assert.equal((await request(app).get('/private').set('Cookie', cookie)).body.role, 'admin');
  assert.equal((await request(app).post('/private').set('Cookie', cookie).set('Origin', 'https://evil.example')).status, 403);
  assert.equal((await request(app).post('/identity/logout').set('Cookie', cookie).set('Origin', origin).set('X-Mapping-Client', '1')).status, 204);
  assert.equal((await request(app).get('/private').set('Cookie', cookie)).status, 401);
  const fresh = (await login()).headers['set-cookie'][0].split(';')[0];
  await Session.updateMany({}, { expiresAt: new Date(0) });
  assert.equal((await request(app).get('/private').set('Cookie', fresh)).status, 401);
});
test('disabled users lose existing access, and role/estate scope comes from server records', async () => {
  const cookie = (await login()).headers['set-cookie'][0].split(';')[0];
  await User.updateOne({ _id: 'Admin' }, { role: 'viewer', estateIds: ['estate-a'] });
  assert.deepEqual((await request(app).get('/private').set('Cookie', cookie)).body, { subject: 'Admin', role: 'viewer', estateIds: ['estate-a'] });
  await User.updateOne({ _id: 'Admin' }, { active: false });
  assert.equal((await request(app).get('/private').set('Cookie', cookie)).status, 401);
});
test('repeated failed sign-in attempts are throttled', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await login('wrong');
  assert.equal(last.status, 429);
});
