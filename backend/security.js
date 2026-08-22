/**
 * Dhopa Mama — Security helpers
 * নির্ভরতা ছাড়া (no extra npm packages) rate-limit, lockout, origin check,
 * এবং নিরাপদ স্ট্রিং তুলনার হেল্পার।
 */
const crypto = require('crypto');

/* ── Constant-time string compare (timing attack প্রতিরোধ) ── */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a == null ? '' : a));
  const bb = Buffer.from(String(b == null ? '' : b));
  if (ba.length !== bb.length) {
    // দৈর্ঘ্য আলাদা হলেও একই সময় নিতে ডামি compare
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/* ── ক্লায়েন্ট IP (proxy-aware, trust proxy সেট থাকলে req.ip ঠিক থাকে) ── */
function clientIp(req) {
  return (req.ip || req.connection?.remoteAddress || 'unknown').toString();
}

/**
 * সাধারণ in-memory sliding-window rate limiter.
 * একাধিক ইনস্ট্যান্সে perfect নয়, কিন্তু স্প্যাম/brute-force অনেকটাই থামায়।
 */
function rateLimit({ windowMs = 60_000, max = 60, keyGenerator = clientIp, message = 'অনেক বেশি রিকোয়েস্ট — কিছুক্ষণ পরে আবার চেষ্টা করুন।' } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const kept = arr.filter(t => now - t < windowMs);
      if (kept.length) hits.set(k, kept); else hits.delete(k);
    }
  }, windowMs).unref?.();

  return function limiter(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      const retry = Math.ceil((windowMs - (now - arr[0])) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: message, retryAfter: retry });
    }
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}

/**
 * ব্যর্থ লগইন গুনে অ্যাকাউন্ট/IP লক করার ট্র্যাকার।
 */
function createLockout({ maxAttempts = 5, lockMs = 15 * 60_000, decayMs = 15 * 60_000 } = {}) {
  const store = new Map(); // key -> { count, first, lockedUntil }
  return {
    check(key) {
      const rec = store.get(key);
      if (!rec) return { locked: false };
      if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
        return { locked: true, retryAfter: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
      }
      if (rec.lockedUntil && rec.lockedUntil <= Date.now()) store.delete(key);
      return { locked: false };
    },
    fail(key) {
      const now = Date.now();
      let rec = store.get(key);
      if (!rec || now - rec.first > decayMs) rec = { count: 0, first: now, lockedUntil: 0 };
      rec.count += 1;
      if (rec.count >= maxAttempts) rec.lockedUntil = now + lockMs;
      store.set(key, rec);
      return rec;
    },
    reset(key) { store.delete(key); }
  };
}

/**
 * ALLOWED_ORIGINS env থেকে CORS origin checker বানায়।
 * খালি থাকলে শুধু same-origin/no-origin (mobile app, curl, server-to-server) অনুমোদিত।
 */
function buildCorsOptions(allowedOriginsEnv) {
  const list = String(allowedOriginsEnv || '')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return {
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);          // same-origin / non-browser
      const clean = origin.replace(/\/$/, '');
      if (list.includes('*')) return cb(null, true);
      if (list.includes(clean)) return cb(null, true);
      return cb(new Error('CORS: origin অনুমোদিত নয় — ' + origin), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600
  };
}

/* ── ছোট নিরাপত্তা হেডার (helmet ছাড়াই) ── */
function securityHeaders(_req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-XSS-Protection', '0');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
}

function sha256(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

function randomId(bytes = 16) { return crypto.randomBytes(bytes).toString('hex'); }

function randomOtp() {
  return String(crypto.randomInt(100000, 1000000)); // cryptographically secure 6-digit
}

module.exports = {
  safeEqual, clientIp, rateLimit, createLockout,
  buildCorsOptions, securityHeaders, sha256, randomId, randomOtp
};
