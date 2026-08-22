/**
 * Dhopa Mama — লগিং ও error monitoring (নির্ভরতা ছাড়া)
 * ---------------------------------------------------------------
 * • সব লগ এক ফরম্যাটে (JSON বা human) — Render/Replit লগে সহজে খোঁজা যায়
 * • প্রতিটি রিকোয়েস্টে req.id (request id) + response time
 * • captureError() — সার্ভার ও ব্রাউজার দুই দিকের error এক জায়গায়
 *
 * ENV:
 *   LOG_LEVEL  = debug | info | warn | error   (default: info)
 *   LOG_FORMAT = json | pretty                 (default: json in prod)
 */
'use strict';
const crypto = require('crypto');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;
const FORMAT = String(
  process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty')
).toLowerCase();

/* সংবেদনশীল ফিল্ড কখনো লগে যাবে না */
const REDACT = /^(password|pass|token|authorization|otp|secret|api[_-]?key)$/i;

function redact(obj, depth = 0) {
  if (obj == null || depth > 3) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const k of Object.keys(obj)) {
    out[k] = REDACT.test(k) ? '[redacted]' : redact(obj[k], depth + 1);
  }
  return out;
}

function emit(level, msg, meta) {
  if (LEVELS[level] < LEVEL) return;
  const rec = Object.assign({ t: new Date().toISOString(), level, msg }, redact(meta || {}));
  const line =
    FORMAT === 'json'
      ? JSON.stringify(rec)
      : `${rec.t} ${level.toUpperCase().padEnd(5)} ${msg}` +
        (meta && Object.keys(meta).length ? ' ' + JSON.stringify(redact(meta)) : '');
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

const logger = {
  debug: (m, x) => emit('debug', m, x),
  info: (m, x) => emit('info', m, x),
  warn: (m, x) => emit('warn', m, x),
  error: (m, x) => emit('error', m, x),
};

/** Express request logger — শেষ হলে status + duration লগ করে */
logger.requestLogger = function requestLogger(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomBytes(6).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    emit(level, 'http', {
      id: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms,
    });
  });
  next();
};

/** এক জায়গা থেকে সব error রিপোর্ট — চাইলে বাইরের monitoring এ পাঠানো যায় */
logger.captureError = function captureError(err, context) {
  const e = err instanceof Error ? err : new Error(String(err && err.message ? err.message : err));
  emit('error', e.message || 'error', Object.assign({ stack: (e.stack || '').split('\n').slice(0, 5) }, context));
};

/** প্রসেস-লেভেল সুরক্ষা — নীরবে ক্র্যাশ নয় */
logger.installProcessHandlers = function installProcessHandlers() {
  process.on('unhandledRejection', (r) => logger.captureError(r, { kind: 'unhandledRejection' }));
  process.on('uncaughtException', (e) => logger.captureError(e, { kind: 'uncaughtException' }));
};

module.exports = logger;
