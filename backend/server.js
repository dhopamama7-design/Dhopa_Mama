/**
 * Dhopa Mama — Backend API
 * Stack: Express + MongoDB (Mongoose) + Cloudinary + JWT + bcrypt
 * Replit: serves on process.env.PORT (8080)
 * Also serves static frontend (/) and admin panel (/admin/)
 */

try { require('dotenv').config(); } catch (e) { /* dotenv optional in prod hosts like Render */ }
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');

const logger = require('./logger');
const {
  safeEqual, clientIp, rateLimit, createLockout,
  buildCorsOptions, securityHeaders, sha256, randomId, randomOtp
} = require('./security');

const app = express();

/* ── প্রক্সির পিছনে (Render/Replit/Cloudflare) আসল client IP পেতে ── */
app.set('trust proxy', 1);
app.disable('x-powered-by');
logger.installProcessHandlers();
/* ── স্ট্রাকচার্ড রিকোয়েস্ট লগিং (request id + status + duration) ── */
app.use(logger.requestLogger);
app.use(securityHeaders);

/* ── Body parsing ── */
app.use(express.json({ limit: '25mb' }));
/* ⚠️ body-parser এর error handler রুটগুলোর *পরে* বসাতে হয় (নিচে গ্লোবাল
   error handler দেখুন) — আগে বসালে Express সেটিকে কখনোই কল করে না,
   তাই "Payload too large" মেসেজ কাজ করত না। */

/* ── Cloudinary ── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/* ── CORS — শুধু ALLOWED_ORIGINS এ থাকা origin গুলো অনুমোদিত ── */
if (!process.env.ALLOWED_ORIGINS) {
  console.warn('⚠️  ALLOWED_ORIGINS সেট করা নেই — শুধু same-origin রিকোয়েস্ট কাজ করবে।');
}
const corsOptions = buildCorsOptions(process.env.ALLOWED_ORIGINS);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* ── গ্লোবাল rate limit (সব রুটে) ── */
app.use('/api/', rateLimit({ windowMs: 60_000, max: 300 }));

/* ── Static files: admin panel at /admin ── */
const ADMIN_DIR = path.join(__dirname, 'public', 'admin');
if (fs.existsSync(ADMIN_DIR)) {
  app.use('/admin', express.static(ADMIN_DIR));
  app.get('/admin', (_req, res) => res.sendFile(path.join(ADMIN_DIR, 'admin.html')));
}

/* ── Static files: frontend at / (served AFTER /api and /admin routes) ── */
const FRONTEND_DIR = path.join(__dirname, 'public', 'frontend');

/* ── Google Apps Script email notification ── */
async function notifyOrderByEmail(order) {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) { console.warn('APPS_SCRIPT_URL not set — order mail skipped'); return; }
  if (typeof fetch !== 'function') { console.error('global fetch missing — need Node 18+'); return; }
  try {
    const payload = Object.assign({ type: 'order' }, order);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    console.log('Order mail webhook ->', r.status);
  } catch (e) {
    console.error('Order email webhook failed:', e.message);
  }
}

/* ── MongoDB ──
   গুরুত্বপুর্ণ: bufferCommands=false দিলে সংযোগ না থাকলে অপারেশন সাথে সাথে
   fail হয় — অন্যথায় ১০ সেকেন্ড পরে "buffering timed out" error আসে,
   যেটা ইউজারকে বুঝতে দেয় না আসল সমস্যা কী (Atlas IP whitelist, ভুল
   password ইত্যাদি)। এখন সাথে সাথে পরিষ্কার মেসেজ পাওয়া যাবে। */
mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false);
const MONGODB_URI = process.env.MONGODB_URI;
let mongoLastError = null;
async function connectMongo(retry = 0) {
  if (!MONGODB_URI) { console.warn('⚠️  MONGODB_URI not set — DB features disabled'); return; }
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    mongoLastError = null;
    console.log('✅ MongoDB connected');
    try { await seedDefaultsIfEmpty(); } catch (e) { console.error('Seeding error:', e.message); }
  } catch (err) {
    mongoLastError = err.message;
    console.error('❌ MongoDB error:', err.message);
    const delay = Math.min(30000, 3000 * Math.pow(2, retry));
    console.log(`↻ Retrying MongoDB connection in ${Math.round(delay/1000)}s...`);
    setTimeout(() => connectMongo(retry + 1), delay);
  }
}
connectMongo();
mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => console.log('✅ MongoDB reconnected'));

function dbReady() { return mongoose.connection.readyState === 1; }
function requireDb(_req, res, next) {
  if (!dbReady()) {
    return res.status(503).json({
      error: 'ডাটাবেস সংযোগ নেই — MongoDB Atlas এ Network Access (IP allowlist: 0.0.0.0/0), সঠিক username/password এবং MONGODB_URI environment variable চেক করুন।',
      detail: mongoLastError || 'not connected'
    });
  }
  next();
}

/* ── Schemas ── */
const BucketSchema = new mongoose.Schema({
  key:  { type: String, unique: true, default: 'main' },
  data: { type: mongoose.Schema.Types.Mixed, default: [] }
}, { timestamps: true });

const Products   = mongoose.model('Products',   BucketSchema, 'products');
const Categories = mongoose.model('Categories', BucketSchema, 'categories');
const Services   = mongoose.model('Services',   BucketSchema, 'services');
const Settings   = mongoose.model('Settings', new mongoose.Schema({
  key:  { type: String, unique: true, default: 'main' },
  data: { type: mongoose.Schema.Types.Mixed, default: { bkash: '01700-000000', nagad: '01800-000000' } }
}, { timestamps: true }), 'settings');

/* ── Seed default categories / products / services when DB is empty ── */
async function seedDefaultsIfEmpty() {
  let defaults;
  try { defaults = require('./defaults'); }
  catch (e) { console.warn('defaults.js not found — seeding skipped'); return; }
  const pairs = [
    { Model: Categories, name: 'categories', data: defaults.categories },
    { Model: Products,   name: 'products',   data: defaults.products   },
    { Model: Services,   name: 'services',   data: defaults.services   }
  ];
  for (const { Model, name, data } of pairs) {
    const existing = await Model.findOne({ key: 'main' });
    if (!existing || !Array.isArray(existing.data) || existing.data.length === 0) {
      await Model.findOneAndUpdate(
        { key: 'main' }, { $set: { data } }, { upsert: true, new: true }
      );
      console.log(`🌱 Seeded default ${name} (${data.length} items)`);
    }
  }
  const s = await Settings.findOne({ key: 'main' });
  if (!s) {
    await Settings.create({ key: 'main' });
    console.log('🌱 Seeded default settings');
  }
}

const OrderSchema = new mongoose.Schema({
  id:              { type: String, index: true, unique: true },
  items:           { type: Array, default: [] },
  total:           { type: Number, default: 0 },
  date:            String,
  time:            String,
  method:          String,
  status:          { type: String, default: 'Pending' },
  customerName:    String,
  customerMobile:  String,
  customerAddress: String,
  txn:             String,
  userId:          { type: String, index: true },
  userContact:     { type: String, index: true }
}, { timestamps: true });
const Order = mongoose.model('Order', OrderSchema, 'orders');

/* ── অর্ডার আইডি কাউন্টার ──
   আগে সব অর্ডার লোড করে max বের করা হত — একসাথে দুটি অর্ডার এলে একই ID
   তৈরি হয়ে upsert এর কারণে আগের অর্ডার ওভাররাইট হয়ে যেত, আর অর্ডার
   বাড়লে পারফরম্যান্সও পড়ত। এখন MongoDB এর atomic $inc ব্যবহার করা হয় —
   রেস কন্ডিশন সম্ভব নয় এবং O(1)। */
const CounterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', CounterSchema, 'counters');

async function nextOrderId() {
  const c = await Counter.findByIdAndUpdate(
    'orderId', { $inc: { seq: 1 } }, { upsert: true, new: true }
  );
  return 'ORD' + String(c.seq).padStart(4, '0');
}

const UserSchema = new mongoose.Schema({
  name:     String,
  contact:  { type: String, index: true, unique: true, sparse: true },
  password: String,
  // টোকেন রিভোকেশন: লগআউট/পাসওয়ার্ড পরিবর্তনে বাড়ে → পুরনো টোকেন অচল হয়
  tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });
const User = mongoose.model('User', UserSchema, 'users');

/* বাতিল করা (logged-out) টোকেনের jti — TTL index দিয়ে মেয়াদ শেষে নিজে মুছে যায় */
const RevokedTokenSchema = new mongoose.Schema({
  jti:       { type: String, unique: true },
  expiresAt: { type: Date, index: { expires: 0 } }
});
const RevokedToken = mongoose.model('RevokedToken', RevokedTokenSchema, 'revoked_tokens');

/* পাসওয়ার্ড রিসেট OTP — ডাটাবেসে (হ্যাশ করা), মেমোরিতে নয় */
const PasswordResetSchema = new mongoose.Schema({
  contact:   { type: String, index: true, unique: true },
  otpHash:   String,
  attempts:  { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, index: { expires: 0 } }
});
const PasswordReset = mongoose.model('PasswordReset', PasswordResetSchema, 'password_resets');

const VisitEventSchema = new mongoose.Schema({
  ts:   { type: Date, default: Date.now, index: true },
  page: String,
  ref:  String
});
const VisitEvent = mongoose.model('VisitEvent', VisitEventSchema, 'visit_events');

const ClickEventSchema = new mongoose.Schema({
  ts:          { type: Date, default: Date.now, index: true },
  type:        { type: String, default: 'product_view' },
  productId:   String,
  productName: String
});
const ClickEvent = mongoose.model('ClickEvent', ClickEventSchema, 'click_events');

/* ── Bucket helpers ── */
async function getBucket(Model) {
  let doc = await Model.findOne({ key: 'main' });
  if (!doc) doc = await Model.create({ key: 'main', data: Model === Settings ? undefined : [] });
  return doc;
}
async function putBucket(Model, data) {
  return Model.findOneAndUpdate(
    { key: 'main' }, { $set: { data } }, { upsert: true, new: true }
  );
}

/* ── Auth helpers ── */
/* ── JWT secret — fallback নেই, না থাকলে সার্ভার চালু হবে না ── */
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error('❌ JWT_SECRET সেট করা নেই বা খুব ছোট (কমপক্ষে ৩২ অক্ষর দরকার)।');
  console.error('   তৈরি করুন:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}

/* ── Admin credentials ── */
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // bcrypt hash (প্রস্তাবিত)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;           // legacy fallback
if (!ADMIN_USERNAME || (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD)) {
  console.error('❌ ADMIN_USERNAME এবং ADMIN_PASSWORD_HASH সেট করুন (README দেখুন)।');
  process.exit(1);
}
if (!ADMIN_PASSWORD_HASH) {
  console.warn('⚠️  ADMIN_PASSWORD (প্লেইন টেক্সট) ব্যবহার হচ্ছে — ADMIN_PASSWORD_HASH এ বদলান।');
  if (String(ADMIN_PASSWORD).length < 12) {
    console.warn('⚠️  অ্যাডমিন পাসওয়ার্ড ১২ অক্ষরের কম — এখনই বদলান।');
  }
}
async function verifyAdminPassword(password) {
  if (!password) return false;
  if (ADMIN_PASSWORD_HASH) {
    try { return await bcrypt.compare(String(password), ADMIN_PASSWORD_HASH); }
    catch (e) { return false; }
  }
  return safeEqual(password, ADMIN_PASSWORD);
}

/* ── টোকেন: ছোট মেয়াদ + jti (রিভোকেশনের জন্য) ── */
const ADMIN_TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || '8h';
const USER_TOKEN_TTL  = process.env.USER_TOKEN_TTL  || '7d';

function signAdminToken() {
  return jwt.sign({ role: 'admin', jti: randomId() }, SECRET, { expiresIn: ADMIN_TOKEN_TTL });
}
function signUserToken(u) {
  return jwt.sign(
    { role: 'user', id: String(u._id), contact: u.contact, name: u.name, tv: u.tokenVersion || 0, jti: randomId() },
    SECRET, { expiresIn: USER_TOKEN_TTL }
  );
}
function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch (e) { return null; }
}
async function isRevoked(payload) {
  if (!payload || !payload.jti) return false;
  if (!dbReady()) return false;
  const hit = await RevokedToken.findOne({ jti: payload.jti }).lean();
  return !!hit;
}
async function revokeToken(payload) {
  if (!payload || !payload.jti || !dbReady()) return;
  const expiresAt = new Date((payload.exp ? payload.exp * 1000 : Date.now() + 86400000));
  await RevokedToken.updateOne({ jti: payload.jti }, { $set: { jti: payload.jti, expiresAt } }, { upsert: true });
}

async function requireAdmin(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'No token' });
  const p = verifyToken(token);
  if (!p || p.role !== 'admin') return res.status(401).json({ error: 'Invalid token' });
  if (await isRevoked(p)) return res.status(401).json({ error: 'Token revoked' });
  req.admin = p;
  next();
}
async function requireUser(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'No token' });
  const p = verifyToken(token);
  if (!p || p.role !== 'user') return res.status(401).json({ error: 'Invalid token' });
  if (await isRevoked(p)) return res.status(401).json({ error: 'Token revoked' });
  if (dbReady()) {
    const u = await User.findById(p.id).select('tokenVersion').lean();
    if (!u) return res.status(401).json({ error: 'User not found' });
    if ((u.tokenVersion || 0) !== (p.tv || 0)) return res.status(401).json({ error: 'Session expired — আবার লগইন করুন।' });
  }
  req.user = p;
  next();
}
async function optionalUser(req, _res, next) {
  const token = bearer(req);
  if (token) {
    const p = verifyToken(token);
    if (p && p.role === 'user' && !(await isRevoked(p))) req.user = p;
  }
  next();
}
async function optionalAdmin(req, _res, next) {
  req.isAdmin = false;
  const token = bearer(req);
  if (token) {
    const p = verifyToken(token);
    if (p && p.role === 'admin' && !(await isRevoked(p))) req.isAdmin = true;
  }
  next();
}

/* ── Rate limiters ── */
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'অনেকবার লগইন চেষ্টা — ১৫ মিনিট পরে আবার চেষ্টা করুন।' });
const authLimiter       = rateLimit({ windowMs: 15 * 60_000, max: 20, message: 'অনেকবার চেষ্টা — কিছুক্ষণ পরে আবার চেষ্টা করুন।' });
const otpLimiter        = rateLimit({ windowMs: 15 * 60_000, max: 5,  message: 'অনেকবার OTP চেষ্টা — ১৫ মিনিট পরে আবার চেষ্টা করুন।' });
const trackLimiter      = rateLimit({ windowMs: 60_000, max: 30, message: 'ট্র্যাকিং রিকোয়েস্ট সীমা ছাড়িয়েছে।' });
const orderLimiter      = rateLimit({ windowMs: 60_000, max: 10, message: 'অনেক বেশি অর্ডার রিকোয়েস্ট — একটু পরে চেষ্টা করুন।' });
const adminLockout      = createLockout({ maxAttempts: 5, lockMs: 15 * 60_000 });
const userLockout       = createLockout({ maxAttempts: 8, lockMs: 15 * 60_000 });

/* ════════════════════════════════════════════
   API ROUTES
   ════════════════════════════════════════════ */

/* Health — includes MongoDB status so admin panel/ops-এ সমস্যা সহজে বোঝা যায় */
app.get('/api/health', (_req, res) => res.json({
  ok: true, time: new Date().toISOString(),
  mongo: { ready: dbReady(), state: mongoose.connection.readyState, lastError: mongoLastError }
}));
/* ── ব্রাউজার থেকে আসা error রিপোর্ট (frontend error monitoring) ── */
app.post('/api/client-errors',
  rateLimit({ windowMs: 60_000, max: 30 }),
  (req, res) => {
    const b = req.body || {};
    logger.captureError(String(b.message || 'client error').slice(0, 500), {
      kind: 'client',
      page: String(b.page || '').slice(0, 200),
      stack: String(b.stack || '').slice(0, 1000),
      ua: String(req.headers['user-agent'] || '').slice(0, 200),
      ip: clientIp(req)
    });
    res.status(204).end();
  });

app.get('/api/healthz', (_req, res) => res.json({ ok: dbReady(), mongo: dbReady() }));

/* Admin login */
app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const key = clientIp(req) + '|' + String(username || '').slice(0, 64);
  const locked = adminLockout.check(key);
  if (locked.locked) {
    res.set('Retry-After', String(locked.retryAfter));
    return res.status(429).json({ error: `অনেকবার ভুল চেষ্টা — ${Math.ceil(locked.retryAfter / 60)} মিনিট পরে আবার চেষ্টা করুন।` });
  }
  const okUser = safeEqual(username || '', ADMIN_USERNAME);
  const okPass = await verifyAdminPassword(password);
  if (okUser && okPass) {
    adminLockout.reset(key);
    return res.json({ token: signAdminToken(), expiresIn: ADMIN_TOKEN_TTL });
  }
  adminLockout.fail(key);
  return res.status(401).json({ error: 'ভুল ইউজারনেম বা পাসওয়ার্ড।' });
});

/* Admin logout — টোকেন সাথে সাথে বাতিল */
app.post('/api/admin/logout', requireAdmin, requireDb, async (req, res) => {
  try { await revokeToken(req.admin); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* Cloudinary upload (admin only) */
app.post('/api/upload', requireAdmin, async (req, res) => {
  try {
    const { image, folder } = req.body || {};
    if (!image) return res.status(400).json({ error: 'image (dataURL) required' });
    const result = await cloudinary.uploader.upload(image, {
      folder: folder || 'dhopa-mama',
      resource_type: 'image'
    });
    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (e) {
    console.error('Cloudinary upload error:', e.message);
    res.status(500).json({ error: e.message || 'Upload failed' });
  }
});

/* Bucket routes (products, categories, services, settings)
   GET: admin (valid Bearer admin token) সব আইটেম দেখে — disabled সহ, যাতে
   অ্যাডমিন প্যানেলে টগল করে আবার চালু করা যায়। কিন্তু public/frontend
   রিকোয়েস্টে (কোনো admin token ছাড়া) enabled:false থাকা আইটেম বাদ দিয়ে
   পাঠানো হয় — অর্থাৎ অ্যাডমিন প্যানেল থেকে ডিসেবল করলেই তা ফ্রন্টএন্ড থেকে
   সার্ভার লেভেলেই বাদ পড়ে যাবে। */
function bucketRoutes(path, Model) {
  app.get(`/api/${path}`, optionalAdmin, requireDb, async (req, res) => {
    try {
      // ব্রাউজার/প্রক্সি/CDN কোথাও যেন এই রেসপন্স ক্যাশ না হয় — নাহলে অ্যাডমিন
      // থেকে ডিসেবল করার পরেও ফ্রন্টএন্ডে পুরনো (ক্যাশড) ডেটা দেখাতে পারে।
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
      const b = await getBucket(Model);
      let data = b.data;
      if (!req.isAdmin && Array.isArray(data)) {
        data = data.filter(item => !item || item.enabled !== false);
      }
      res.json(data);
    }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put(`/api/${path}`, requireAdmin, requireDb, async (req, res) => {
    try { const b = await putBucket(Model, req.body); res.json(b.data); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
}
bucketRoutes('products',   Products);
bucketRoutes('categories', Categories);
bucketRoutes('services',   Services);
bucketRoutes('settings',   Settings);

/* Admin utility: force re-seed defaults (empty buckets only) */
app.post('/api/admin/seed-defaults', requireAdmin, requireDb, async (_req, res) => {
  try { await seedDefaultsIfEmpty(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* Analytics */
app.post('/api/track/visit', trackLimiter, requireDb, async (req, res) => {
  try {
    const { page, ref } = req.body || {};
    if (page != null && typeof page !== 'string') return res.status(400).json({ error: 'invalid page' });
    if (ref != null && typeof ref !== 'string') return res.status(400).json({ error: 'invalid ref' });
    await VisitEvent.create({ page: String(page || '/').slice(0, 200), ref: String(ref || '').slice(0, 200) });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/track/click', trackLimiter, requireDb, async (req, res) => {
  try {
    const { type, productId, productName } = req.body || {};
    if (!productName || typeof productName !== 'string') return res.status(400).json({ error: 'productName required' });
    await ClickEvent.create({
      type: String(type || 'product_view').slice(0, 50),
      productId: String(productId || '').slice(0, 100),
      productName: productName.slice(0, 200)
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/analytics/summary', requireAdmin, requireDb, async (req, res) => {
  try {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startWeek  = new Date(startToday); startWeek.setDate(startWeek.getDate() - 6);
    const startAllTime = new Date(0);
    const visitCount = (since) => VisitEvent.countDocuments({ ts: { $gte: since } });
    const topProducts = (since, limit = 8) => ClickEvent.aggregate([
      { $match: { ts: { $gte: since } } },
      { $group: { _id: '$productName', clicks: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
      { $limit: limit }
    ]);
    const [visitsToday, visitsWeek, visitsAll, topToday, topWeek, topAll] = await Promise.all([
      visitCount(startToday), visitCount(startWeek), visitCount(startAllTime),
      topProducts(startToday), topProducts(startWeek), topProducts(startAllTime)
    ]);
    res.json({
      visitsToday, visitsWeek, visitsAll,
      topToday: topToday.map(x => ({ name: x._id || 'অজানা', clicks: x.clicks })),
      topWeek:  topWeek.map(x  => ({ name: x._id || 'অজানা', clicks: x.clicks })),
      topAll:   topAll.map(x   => ({ name: x._id || 'অজানা', clicks: x.clicks }))
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Orders */
app.get('/api/orders', requireAdmin, requireDb, async (_req, res) => {
  try { const list = await Order.find().sort({ createdAt: -1 }).lean(); res.json(list); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/my-orders', requireUser, requireDb, async (req, res) => {
  try {
    const or = [{ userId: req.user.id }];
    if (req.user.contact) or.push({ userContact: req.user.contact });
    const list = await Order.find({ $or: or }).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
/* ── অর্ডার ইনপুট ভ্যালিডেশন + সার্ভার-সাইড মূল্য গণনা ──
   ক্লায়েন্ট থেকে পাঠানো দাম/টোটাল আর বিশ্বাস করা হয় না। প্রতিটি আইটেমের
   দাম ডাটাবেসের products bucket থেকে যাচাই করা হয়, ডেলিভারি চার্জ ও
   ডিসকাউন্ট সার্ভারেই হিসাব হয় — তাই দাম জালিয়াতি সম্ভব নয়। */
const MAX_ITEMS = 50;
const MAX_QTY   = 99;

function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

async function buildPriceCatalog() {
  const b = await getBucket(Products);
  const list = Array.isArray(b.data) ? b.data : [];
  return list
    .filter(p => p && p.t && p.enabled !== false)
    .map(p => ({
      title: String(p.t),
      prices: Object.values(p.services || {})
        .map(Number)
        .filter(n => isFinite(n) && n >= 0)
    }));
}

function matchProduct(catalog, name) {
  const n = String(name || '').trim();
  let best = null;
  for (const p of catalog) {
    if (n === p.title || n.indexOf(p.title) === 0) {
      if (!best || p.title.length > best.title.length) best = p;
    }
  }
  return best;
}

async function validateOrderPayload(body, user) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return { error: 'অর্ডারে কোনো আইটেম নেই।' };
  if (items.length > MAX_ITEMS) return { error: 'একবারে সর্বোচ্চ ' + MAX_ITEMS + 'টি আইটেম অর্ডার করা যাবে।' };

  const customerName    = str(body.customerName, 100);
  const customerMobile  = str(body.customerMobile, 30);
  const customerAddress = str(body.customerAddress, 300);
  if (!customerName)    return { error: 'নাম দিন।' };
  if (!/^[0-9+\-\s()]{6,20}$/.test(customerMobile)) return { error: 'সঠিক মোবাইল নাম্বার দিন।' };
  if (customerAddress.length < 5) return { error: 'সম্পূর্ণ ঠিকানা দিন।' };

  const method = ['COD', 'bKash', 'Nagad'].includes(String(body.method)) ? String(body.method) : 'COD';
  const txn = str(body.txn, 60);
  if (method !== 'COD' && !txn) return { error: 'অনলাইন পেমেন্টের জন্য Transaction ID দিন।' };

  const catalog = await buildPriceCatalog();
  const clean = [];
  let subtotal = 0, qtyTotal = 0;

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') return { error: 'অবৈধ আইটেম।' };
    const name = str(raw.name || raw.title, 200);
    const qty = Math.floor(Number(raw.qty));
    if (!name) return { error: 'আইটেমের নাম নেই।' };
    if (!isFinite(qty) || qty < 1 || qty > MAX_QTY) return { error: '"' + name + '" — অবৈধ পরিমাণ।' };

    let price = Number(raw.price);
    if (catalog.length) {
      const p = matchProduct(catalog, name);
      if (!p) return { error: '"' + name + '" নামের কোনো পণ্য পাওয়া যায়নি।' };
      if (!p.prices.includes(price)) {
        return { error: '"' + name + '" এর দাম সঠিক নয় — পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।' };
      }
    }
    if (!isFinite(price) || price < 0) return { error: '"' + name + '" এর দাম সঠিক নয়।' };

    subtotal += price * qty;
    qtyTotal += qty;
    clean.push({
      name, qty, price,
      icon:  str(raw.icon, 60),
      brand: str(raw.brand, 60),
      size:  str(raw.size, 40),
      img:   (typeof raw.img === 'string' && /^https?:\/\//.test(raw.img)) ? raw.img.slice(0, 500) : null
    });
  }

  /* ডেলিভারি চার্জ — settings থেকে (ক্লায়েন্ট থেকে নয়) */
  const sDoc = await getBucket(Settings);
  const conf = (sDoc && sDoc.data) || {};
  const charge  = Number(conf.deliveryCharge != null ? conf.deliveryCharge : 10) || 0;
  const minFree = Number(conf.freeDeliveryMinItems != null ? conf.freeDeliveryMinItems : 5) || 0;
  const deliveryCharge = (minFree > 0 && qtyTotal >= minFree) ? 0 : charge;

  /* Top Friend ডিসকাউন্ট — লগইন থাকলে সার্ভারেই মাসিক অর্ডার গুনে হিসাব */
  let discountPercent = 0;
  if (user) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const or = [{ userId: user.id }];
    if (user.contact) or.push({ userContact: user.contact });
    const count = await Order.countDocuments({ $or: or, createdAt: { $gte: start } });
    discountPercent = tierPercent(count);
  }
  const discount = Math.round(subtotal * discountPercent / 100);
  const total = subtotal - discount + deliveryCharge;

  return {
    order: {
      items: clean,
      subtotal, discount, discountPercent, deliveryCharge, total,
      customerName, customerMobile, customerAddress,
      date: str(body.date, 30),
      time: str(body.time, 30),
      method, txn,
      status: 'Pending'
    }
  };
}

app.post('/api/orders', orderLimiter, requireDb, optionalUser, async (req, res) => {
  try {
    const { error, order } = await validateOrderPayload(req.body || {}, req.user);
    if (error) return res.status(400).json({ error });

    if (req.user) {
      order.userId = req.user.id;
      order.userContact = req.user.contact;
      if (!order.customerName) order.customerName = req.user.name;
    }

    /* ক্লায়েন্টের পাঠানো id উপেক্ষা করা হয় — সার্ভারই atomic counter দিয়ে
       ইউনিক ID বানায়, তাই দুটি অর্ডার কখনো একে অপরকে ওভাররাইট করবে না। */
    let doc = null;
    for (let attempt = 0; attempt < 5 && !doc; attempt++) {
      order.id = await nextOrderId();
      try { doc = await Order.create(order); }
      catch (e) { if (e && e.code === 11000) continue; throw e; }
    }
    if (!doc) return res.status(500).json({ error: 'অর্ডার আইডি তৈরি করা যায়নি — আবার চেষ্টা করুন।' });

    notifyOrderByEmail(doc.toObject ? doc.toObject() : doc);
    res.json(doc);
  } catch (e) {
    console.error('Order create failed:', e.message);
    res.status(500).json({ error: 'অর্ডার সেভ করা যায়নি — আবার চেষ্টা করুন।' });
  }
});
app.put('/api/orders', requireAdmin, requireDb, async (req, res) => {
  try {
    const arr = Array.isArray(req.body) ? req.body : [];
    for (const o of arr) {
      if (!o || !o.id) continue;
      await Order.findOneAndUpdate({ id: o.id }, { $set: o }, { upsert: true });
    }
    const list = await Order.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/orders/:id', requireAdmin, requireDb, async (req, res) => {
  try {
    const doc = await Order.findOneAndUpdate({ id: req.params.id }, { $set: req.body }, { new: true });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/orders/:id', requireAdmin, requireDb, async (req, res) => {
  try { await Order.deleteOne({ id: req.params.id }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
/* সব অর্ডার একসাথে ডিলেট — এরপর নতুন অর্ডার আবার ORD0001 থেকে কাউন্ট শুরু হবে */
app.delete('/api/orders', requireAdmin, requireDb, async (_req, res) => {
  try {
    const r = await Order.deleteMany({});
    await Counter.findByIdAndUpdate('orderId', { $set: { seq: 0 } }, { upsert: true });
    res.json({ ok: true, deleted: r.deletedCount || 0 });
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Contact normalize + validation ── */
function normContact(v) { return String(v || '').trim().toLowerCase(); }
function validPassword(p) {
  return typeof p === 'string' && p.length >= 8 && p.length <= 128;
}

/* Users */
app.get('/api/users', requireAdmin, requireDb, async (_req, res) => {
  try {
    const list = await User.find().sort({ createdAt: -1 }).select('-password').lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/register', authLimiter, requireDb, async (req, res) => {
  try {
    const name = req.body?.name;
    const contact = normContact(req.body?.contact);
    const password = req.body?.password;
    if (!contact || !password) return res.status(400).json({ error: 'contact ও password দিন।' });
    if (!validPassword(password)) return res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।' });
    const exists = await User.findOne({ contact });
    if (exists) return res.status(409).json({ error: 'এই নাম্বার/ইমেইল দিয়ে আগে থেকেই রেজিস্টার করা আছে। লগইন করুন।' });
    const hash = await bcrypt.hash(password, 10);
    const u = await User.create({ name: String(name || contact).slice(0, 100), contact, password: hash, tokenVersion: 0 });
    res.json({ id: u._id, name: u.name, contact: u.contact, token: signUserToken(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/login', authLimiter, requireDb, async (req, res) => {
  try {
    const contact = normContact(req.body?.contact);
    const password = req.body?.password;
    const key = clientIp(req) + '|' + contact;
    const locked = userLockout.check(key);
    if (locked.locked) {
      res.set('Retry-After', String(locked.retryAfter));
      return res.status(429).json({ error: `অনেকবার ভুল চেষ্টা — ${Math.ceil(locked.retryAfter / 60)} মিনিট পরে আবার চেষ্টা করুন।` });
    }
    const u = await User.findOne({ contact });
    const ok = u ? await bcrypt.compare(String(password || ''), u.password || '') : false;
    if (!u || !ok) {
      userLockout.fail(key);
      return res.status(401).json({ error: 'ভুল নাম্বার/ইমেইল অথবা পাসওয়ার্ড।' });
    }
    userLockout.reset(key);
    res.json({ id: u._id, name: u.name, contact: u.contact, token: signUserToken(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/me', requireUser, requireDb, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select('-password').lean();
    if (!u) return res.status(401).json({ error: 'User not found' });
    res.json({ id: u._id, name: u.name, contact: u.contact });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/users', requireAdmin, requireDb, async (req, res) => {
  try {
    const arr = Array.isArray(req.body) ? req.body : [];
    for (const u of arr) {
      if (!u || !u.contact) continue;
      await User.findOneAndUpdate({ contact: u.contact }, { $set: { name: u.name, contact: u.contact } }, { upsert: true });
    }
    const list = await User.find().sort({ createdAt: -1 }).select('-password').lean();
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Update user profile (logged-in user) */
app.patch('/api/me', requireUser, requireDb, async (req, res) => {
  try {
    const name = req.body?.name;
    const contact = req.body?.contact != null ? normContact(req.body.contact) : null;
    const update = {};
    if (name) update.name = String(name).slice(0, 100);
    if (contact) {
      if (contact.length < 3) return res.status(400).json({ error: 'সঠিক নাম্বার/ইমেইল দিন।' });
      // uniqueness — অন্য কারো নাম্বার দখল করা যাবে না
      const taken = await User.findOne({ contact, _id: { $ne: req.user.id } }).select('_id').lean();
      if (taken) return res.status(409).json({ error: 'এই নাম্বার/ইমেইল আরেকটি অ্যাকাউন্টে ব্যবহৃত হচ্ছে।' });
      update.contact = contact;
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'পরিবর্তনের কিছু নেই।' });
    // contact বদলালে পুরনো টোকেন অচল করে নতুন টোকেন দেওয়া হয়
    if (update.contact) update.tokenVersion = (await User.findById(req.user.id).select('tokenVersion').lean())?.tokenVersion + 1 || 1;
    const u = await User.findByIdAndUpdate(req.user.id, { $set: update }, { new: true }).select('-password');
    res.json({ id: u._id, name: u.name, contact: u.contact, token: signUserToken(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Change password (logged-in user) */
app.post('/api/change-password', requireUser, requireDb, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'সব ফিল্ড পূরণ করুন।' });
    if (!validPassword(newPassword)) return res.status(400).json({ error: 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।' });
    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ error: 'ইউজার নেই।' });
    const ok = await bcrypt.compare(oldPassword, u.password || '');
    if (!ok) return res.status(401).json({ error: 'বর্তমান পাসওয়ার্ড ভুল।' });
    u.password = await bcrypt.hash(newPassword, 10);
    u.tokenVersion = (u.tokenVersion || 0) + 1; // পুরনো সব টোকেন অচল
    await u.save();
    res.json({ ok: true, token: signUserToken(u) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Logout (user) — চলতি টোকেন বাতিল */
app.post('/api/logout', requireUser, requireDb, async (req, res) => {
  try { await revokeToken(req.user); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* Logout সব ডিভাইস থেকে */
app.post('/api/logout-all', requireUser, requireDb, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Forgot / Reset Password */
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

async function sendOtpEmail(to, otp) {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) throw new Error('APPS_SCRIPT_URL not set');
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'otp', to, otp })
  });
}

app.post('/api/auth/forgot-password', otpLimiter, requireDb, async (req, res) => {
  try {
    const id = normContact(req.body?.email || req.body?.contact);
    if (!id) return res.status(400).json({ error: 'email বা contact required' });
    const u = await User.findOne({ contact: id });
    if (u) {
      const otp = randomOtp();
      // OTP ডাটাবেসে হ্যাশ করে রাখা হয় — রিস্টার্ট/multi-instance এও কাজ করে
      await PasswordReset.findOneAndUpdate(
        { contact: id },
        { $set: { otpHash: sha256(otp), attempts: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + OTP_TTL_MS) } },
        { upsert: true }
      );
      try { await sendOtpEmail(id, otp); } catch (e) { console.error('OTP mail failed:', e.message); }
    }
    // ইউজার আছে কিনা ফাঁস করা হয় না
    res.json({ ok: true, message: 'যদি এই ইমেইল/নাম্বারে অ্যাকাউন্ট থাকে, OTP পাঠানো হয়েছে।' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/reset-password', otpLimiter, requireDb, async (req, res) => {
  try {
    const id = normContact(req.body?.email || req.body?.contact);
    const otp = req.body?.otp;
    const newPassword = req.body?.newPassword;
    if (!id || !otp || !newPassword) return res.status(400).json({ error: 'সব ফিল্ড পূরণ করুন' });
    if (!validPassword(newPassword)) return res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।' });

    const rec = await PasswordReset.findOne({ contact: id });
    if (!rec || !rec.expiresAt || rec.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP ভুল অথবা মেয়াদ শেষ' });
    }
    if ((rec.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      await PasswordReset.deleteOne({ contact: id });
      return res.status(429).json({ error: 'অনেকবার ভুল OTP — আবার নতুন OTP নিন।' });
    }
    if (!safeEqual(sha256(String(otp)), rec.otpHash || '')) {
      await PasswordReset.updateOne({ contact: id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ error: 'OTP ভুল অথবা মেয়াদ শেষ' });
    }

    const u = await User.findOne({ contact: id });
    if (!u) { await PasswordReset.deleteOne({ contact: id }); return res.status(400).json({ error: 'OTP ভুল অথবা মেয়াদ শেষ' }); }
    u.password = await bcrypt.hash(newPassword, 10);
    u.tokenVersion = (u.tokenVersion || 0) + 1; // রিসেটের পরে পুরনো সব সেশন বাতিল
    await u.save();
    await PasswordReset.deleteOne({ contact: id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Top Friend status */
function tierPercent(count) {
  if (count >= 50) return 50;
  if (count >= 30) return 10;
  if (count >= 20) return 5;
  return 0;
}
app.get('/api/top-friend/status', requireUser, requireDb, async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const or = [{ userId: req.user.id }];
    if (req.user.contact) or.push({ userContact: req.user.contact });
    const count = await Order.countDocuments({ $or: or, createdAt: { $gte: start } });
    res.json({
      monthlyOrderCount: count,
      discountPercent: tierPercent(count),
      isTopFriend: count >= 20,
      month: (now.getMonth() + 1) + '/' + now.getFullYear()
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── CORS / সাধারণ error handler (JSON রেসপন্স, stack ফাঁস নয়) ── */
app.use((err, req, res, next) => {
  /* body-parser: রিকোয়েস্ট বডি খুব বড় (যেমন বিশাল ছবি) */
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Payload too large — ছবি/ডেটা অনেক বড়। ছোট ফাইল দিন।' });
  }
  /* body-parser: ভাঙা JSON */
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'অবৈধ JSON ডেটা পাঠানো হয়েছে।' });
  }
  if (err && /^CORS:/.test(err.message || '')) {
    return res.status(403).json({ error: 'এই origin থেকে রিকোয়েস্ট অনুমোদিত নয়।' });
  }
  if (err) {
    logger.captureError(err, { id: req.id, path: req.originalUrl });
    return res.status(500).json({ error: 'সার্ভার সমস্যা হয়েছে।' });
  }
  next();
});

/* ════════════════════════════════════════════
   STATIC FILES (frontend & admin)
   Must come AFTER all /api routes
   ════════════════════════════════════════════ */
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
  // SPA fallback: serve index.html for any unmatched route (excluding /api and /admin)
  const FRONTEND_ROOT = path.resolve(FRONTEND_DIR);
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    /* ── Path traversal সুরক্ষা ──
       req.path সরাসরি path.join এ দিলে "/../../etc/passwd" জাতীয়
       রিকোয়েস্টে সার্ভারের যেকোনো ফাইল পড়ে ফেলা যেত। এখন প্রথমে
       decode + normalize করা হয়, তারপর resolve করা path অবশ্যই
       FRONTEND_ROOT এর ভিতরে আছে কিনা যাচাই করা হয়। */
    let rel;
    try { rel = decodeURIComponent(req.path); }
    catch (e) { return res.status(400).json({ error: 'Bad request' }); }
    if (rel.indexOf('\0') !== -1) return res.status(400).json({ error: 'Bad request' });

    const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
    const file = path.resolve(FRONTEND_ROOT, '.' + path.sep + safe);
    const inside = file === FRONTEND_ROOT || file.startsWith(FRONTEND_ROOT + path.sep);

    if (inside && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return res.sendFile(file);
    }
    res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
  });
}

/* ── Start ── */
const PORT = parseInt(process.env.PORT || '8080', 10);
/* server.js কে টেস্ট থেকে require করা গেলে সুবিধা — শুধু সরাসরি চালালে listen */
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => logger.info('server started', { port: PORT }));
}

module.exports = app;
