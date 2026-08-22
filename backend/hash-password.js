#!/usr/bin/env node
/* অ্যাডমিন পাসওয়ার্ডের bcrypt হ্যাশ বানানোর টুল।
   ব্যবহার:  npm run hash-password -- 'my-strong-password'          */
const bcrypt = require('bcryptjs');
const pw = process.argv[2];
if (!pw) { console.error("ব্যবহার: npm run hash-password -- 'পাসওয়ার্ড'"); process.exit(1); }
if (pw.length < 12) console.warn('⚠️  পাসওয়ার্ড ১২ অক্ষরের কম — আরও লম্বা দিন।');
console.log('ADMIN_PASSWORD_HASH=' + bcrypt.hashSync(pw, 12));
