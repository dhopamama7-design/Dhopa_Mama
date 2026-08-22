#!/usr/bin/env node
/**
 * Dhopa Mama — partial sync tool
 * -----------------------------------------------------------------------
 * frontend/partials/*.html হলো হেডার/ফুটারের একমাত্র সোর্স।
 * প্রতিটি HTML পেজে মার্কার আছে:
 *
 *   <!-- dm:partial header-main -->  ...generated...  <!-- /dm:partial -->
 *
 * `node tools/build-partials.js`        → সব পেজে পার্শিয়াল সিঙ্ক করে
 * `node tools/build-partials.js --check` → শুধু যাচাই করে (CI/টেস্টে ব্যবহার)
 *
 * ফলে নেভিগেশন/ফুটার বদলাতে এখন একটি ফাইলই এডিট করতে হয়।
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGES_DIRS = [path.join(ROOT, 'frontend')];
const PARTIALS = path.join(ROOT, 'frontend', 'partials');

const RE = /<!--\s*dm:partial\s+([a-z0-9-]+)\s*-->[\s\S]*?<!--\s*\/dm:partial\s*-->/g;

function partial(name) {
  const file = path.join(PARTIALS, name + '.html');
  if (!fs.existsSync(file)) throw new Error('Missing partial: ' + name);
  return fs.readFileSync(file, 'utf8').trim();
}

function render(html) {
  return html.replace(RE, (_m, name) =>
    `<!-- dm:partial ${name} -->\n${partial(name)}\n<!-- /dm:partial -->`
  );
}

function pages() {
  const out = [];
  for (const dir of PAGES_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.html')) out.push(path.join(dir, f));
    }
  }
  return out;
}

function run(check) {
  const stale = [];
  let written = 0;
  for (const file of pages()) {
    const src = fs.readFileSync(file, 'utf8');
    const next = render(src);
    if (src === next) continue;
    if (check) stale.push(path.relative(ROOT, file));
    else { fs.writeFileSync(file, next); written++; }
  }
  if (check) {
    if (stale.length) {
      console.error('❌ পার্শিয়াল আপ-টু-ডেট নয়:', stale.join(', '));
      console.error('   ঠিক করতে চালান: npm run build:frontend');
      process.exitCode = 1;
    } else {
      console.log('✅ সব পেজে হেডার/ফুটার পার্শিয়াল সিঙ্ক করা আছে।');
    }
  } else {
    console.log(`✅ ${written} টি পেজ আপডেট হয়েছে।`);
  }
}

run(process.argv.includes('--check'));
