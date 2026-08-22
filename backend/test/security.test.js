/**
 * Dhopa Mama — security হেল্পার টেস্ট
 * চালান: npm test   (Node 18+ এর বিল্ট-ইন test runner, কোনো dev-dependency লাগে না)
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { safeEqual, rateLimit, buildCorsOptions, sha256, randomOtp } = require('../security');

test('safeEqual একই স্ট্রিং true, ভিন্ন স্ট্রিং false', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual(null, ''), true);
});

test('sha256 স্থিতিশীল ও ৬৪ অক্ষরের hex', () => {
  const h = sha256('dhopa');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, sha256('dhopa'));
});

test('randomOtp ৬ ডিজিটের সংখ্যা', () => {
  for (let i = 0; i < 20; i++) assert.match(String(randomOtp()), /^\d{6}$/);
});

test('rateLimit সীমা ছাড়ালে 429 দেয়', () => {
  const mw = rateLimit({ windowMs: 1000, max: 2 });
  const req = { headers: {}, socket: { remoteAddress: '1.2.3.4' }, ip: '1.2.3.4' };
  let status = 0;
  const res = {
    set() {}, setHeader() {},
    status(c) { status = c; return this; },
    json() { return this; },
    end() { return this; }
  };
  let passed = 0;
  const next = () => { passed++; };
  mw(req, res, next); mw(req, res, next); mw(req, res, next);
  assert.equal(passed, 2);
  assert.equal(status, 429);
});

test('buildCorsOptions অনুমোদিত origin গ্রহণ, অন্যটি বাতিল করে', (t, done) => {
  const opts = buildCorsOptions('https://dhopamama.com');
  opts.origin('https://dhopamama.com', (err, ok) => {
    assert.ifError(err);
    assert.equal(ok, true);
    opts.origin('https://evil.example', (err2) => {
      assert.ok(err2, 'অননুমোদিত origin এ error আসা উচিত');
      done();
    });
  });
});
