/**
 * Dhopa Mama — ফ্রন্টএন্ড আর্কিটেকচার টেস্ট
 * • হেডার/ফুটার পার্শিয়াল সব পেজে সিঙ্ক আছে কিনা
 * • শেয়ার্ড CSS/JS ফাইলগুলোর লিংক ভাঙা নেই
 * • পোলিং ইন্টারভাল যথেষ্ট বড় (Render ফ্রি টিয়ার সুরক্ষা)
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const FE = path.join(ROOT, 'frontend');
const pages = fs.readdirSync(FE).filter((f) => f.endsWith('.html'));

test('সব পেজে পার্শিয়াল আপ-টু-ডেট', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-partials.js'), '--check'], {
    encoding: 'utf8'
  });
  assert.match(out, /সিঙ্ক করা আছে/);
});

test('প্রতিটি পেজে হেডার ও ফুটার পার্শিয়াল মার্কার আছে', () => {
  for (const p of pages) {
    const html = fs.readFileSync(path.join(FE, p), 'utf8');
    const found = [...html.matchAll(/<!--\s*dm:partial\s+([a-z0-9-]+)\s*-->/g)].map((m) => m[1]);
    assert.ok(found.some((n) => n.startsWith('header')), p + ' এ header পার্শিয়াল নেই');
    assert.ok(found.some((n) => n.startsWith('footer')), p + ' এ footer পার্শিয়াল নেই');
  }
});

test('রেফারেন্স করা লোকাল css/js ফাইলগুলো আছে', () => {
  for (const p of pages) {
    const html = fs.readFileSync(path.join(FE, p), 'utf8');
    const refs = [
      ...[...html.matchAll(/<link[^>]+href="((?:css|js)\/[^"]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/<script[^>]+src="((?:css|js)\/[^"]+)"/g)].map((m) => m[1])
    ];
    for (const r of refs) {
      assert.ok(fs.existsSync(path.join(FE, r)), `${p} → অনুপস্থিত ফাইল ${r}`);
    }
  }
});

test('API পোলিং ইন্টারভাল কমপক্ষে ৬০ সেকেন্ড এবং ভিজিবিলিটি-অ্যাওয়্যার', () => {
  const api = fs.readFileSync(path.join(FE, 'dm-api.js'), 'utf8');
  const m = api.match(/POLL_MS\s*=\s*Number\(window\.DM_POLL_MS\)\s*>\s*0\s*\?\s*Number\(window\.DM_POLL_MS\)\s*:\s*(\d+)/);
  assert.ok(m, 'POLL_MS ডিফল্ট খুঁজে পাওয়া যায়নি');
  assert.ok(Number(m[1]) >= 60000, 'পোলিং ইন্টারভাল ৬০ সেকেন্ডের কম');
  assert.match(api, /document\.hidden/);
  assert.match(api, /dm-wake-banner/);
});
