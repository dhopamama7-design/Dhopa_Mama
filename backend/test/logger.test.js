/**
 * Dhopa Mama — logger / error monitoring টেস্ট
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const logger = require('../logger');

function capture(fn) {
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (l) => lines.push(String(l));
  try { fn(); } finally { Object.assign(console, orig); }
  return lines;
}

test('info লগে মেসেজ ও মেটা থাকে', () => {
  const lines = capture(() => logger.info('hello', { a: 1 }));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /hello/);
  assert.match(lines[0], /"a":1|{"a":1}/);
});

test('সংবেদনশীল ফিল্ড redact হয়', () => {
  const lines = capture(() => logger.warn('login', { password: 'p@ss', token: 'xyz', user: 'sam' }));
  assert.doesNotMatch(lines[0], /p@ss/);
  assert.doesNotMatch(lines[0], /xyz/);
  assert.match(lines[0], /redacted/);
  assert.match(lines[0], /sam/);
});

test('captureError স্ট্যাকসহ error লগ করে', () => {
  const lines = capture(() => logger.captureError(new Error('boom'), { kind: 'test' }));
  assert.match(lines[0], /boom/);
  assert.match(lines[0], /stack/);
});

test('requestLogger req.id সেট করে ও finish এ লগ করে', () => {
  const req = { headers: {}, method: 'GET', originalUrl: '/api/products?t=1' };
  let finish;
  const res = { statusCode: 200, setHeader() {}, on(ev, cb) { if (ev === 'finish') finish = cb; } };
  let nexted = false;
  logger.requestLogger(req, res, () => { nexted = true; });
  assert.ok(nexted);
  assert.match(String(req.id), /^[0-9a-f]{12}$/);
  const lines = capture(() => finish());
  assert.match(lines[0], /"path":"\/api\/products"/);
  assert.match(lines[0], /"status":200/);
});
