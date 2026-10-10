import express from 'express';
import { randomBytes, createHash, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const COOKIE = '__Host-mapping-session';
const ttl = 8 * 60 * 60 * 1000;
export async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024)
    throw Error('Password must contain 8–1024 characters.');
  const salt = randomBytes(32).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
async function verify(password, encoded) {
  const [salt, stored] = encoded.split(':');
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(stored, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function sessionModels(connection) {
  const Schema = connection.base.Schema;
  const User = connection.models.MappingUser || connection.model('MappingUser', new Schema({
    _id: String, passwordHash: { type: String, required: true }, active: { type: Boolean, default: true },
    role: { type: String, enum: ['admin', 'manager', 'viewer'], required: true }, estateIds: [String],
  }, { timestamps: true }));
  const Session = connection.models.MappingSession || connection.model('MappingSession', new Schema({
    _id: String, subject: { type: String, required: true, index: true }, expiresAt: { type: Date, expires: 0, required: true },
  }));
  return { User, Session };
}
export async function sessionAuth(connection, origin) {
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw Error('PUBLIC_ORIGIN must be an exact HTTPS origin.');
  const { User, Session } = sessionModels(connection);
  await Promise.all([User.createIndexes(), Session.createIndexes()]);
  const dummy = await passwordHash(randomBytes(32).toString('hex'));
  const attempts = new Map();
  function limited(key) {
    const now = Date.now();
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    if (attempts.size >= 10000 && !attempts.has(key)) return true;
    const v = attempts.get(key) || { n: 0, until: now + 15 * 60 * 1000 };
    v.n++; attempts.set(key, v); return v.n > 10;
  }
  const token = (req) => {
    const bearer = req.get('authorization');
    if (bearer?.startsWith('Bearer ')) return bearer.slice(7);
    return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  };
  const cookie = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' };
  const router = express.Router();
  router.use(express.json({ limit: '8kb' }));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('origin') !== origin || req.get('x-mapping-client') !== '1')
      return res.status(403).json({ error: 'Origin not allowed.' });
    next();
  });
  router.post('/login', async (req, res, next) => {
    try {
      const { login, password } = req.body || {};
      if (limited(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
      if (typeof login !== 'string' || login.length > 100 || typeof password !== 'string' || password.length > 1024)
        return res.status(401).json({ error: 'Invalid username or password.' });
      const user = await User.findById(login).lean();
      const valid = await verify(password, user?.passwordHash || dummy);
      if (!valid || !user?.active) return res.status(401).json({ error: 'Invalid username or password.' });
      const raw = randomBytes(32).toString('hex');
      // Replace any previous browser session on this device.
      const previous = token(req);
      if (previous) await Session.deleteOne({ _id: hash(previous) });
      await Session.create({ _id: hash(raw), subject: user._id, expiresAt: new Date(Date.now() + ttl) });
      res.cookie(COOKIE, raw, { ...cookie, maxAge: ttl });
      res.json({ data: { authenticated: true } });
    } catch (e) { next(e); }
  });
  router.post('/logout', async (req, res, next) => {
    try {
      const raw = token(req);
      if (raw) await Session.deleteOne({ _id: hash(raw) });
      res.clearCookie(COOKIE, cookie).sendStatus(204);
    } catch (e) { next(e); }
  });
  const authenticate = async (req, res, next) => {
    try {
      const raw = token(req);
      if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return res.status(401).json({ error: 'Sign in to MapIntel.' });
      if (!['GET', 'HEAD'].includes(req.method) && req.get('origin') !== origin)
        return res.status(403).json({ error: 'Origin not allowed.' });
      const session = await Session.findOne({ _id: hash(raw), expiresAt: { $gt: new Date() } }).lean();
      const user = session && await User.findById(session.subject).lean();
      if (!user?.active) return res.status(401).json({ error: 'Sign in to MapIntel.' });
      req.access = { subject: user._id, role: user.role, estateIds: user.role === 'admin' ? null : user.estateIds };
      next();
    } catch (e) { next(e); }
  };
  return { router, authenticate };
}
