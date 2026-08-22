# Dhopa Mama — আর্কিটেকচার ও রক্ষণাবেক্ষণ আপডেট

এই রিলিজে যেসব সমস্যা ঠিক করা হয়েছে:

## ১) কোড ডুপ্লিকেশন কমানো (~২৮,০০০ → ~১৭,৩০০ লাইন HTML)
- একাধিক পেজে হুবহু একই ইনলাইন `<style>` ব্লকগুলো এখন `frontend/css/dm-shared-*.css`
- একাধিক পেজে হুবহু একই ইনলাইন `<script>` ব্লকগুলো এখন `frontend/js/dm-shared-*.js`
- ব্রাউজার এগুলো একবারই ডাউনলোড ও ক্যাশ করে → পেজ লোড দ্রুত।

## ২) নেভিগেশন/ফুটার এখন একটাই সোর্স
- `frontend/partials/header-main.html`, `header-account.html`, `header-orders.html`,
  `footer-main.html`, `footer-account.html`
- প্রতিটি পেজে মার্কার আছে:
  `<!-- dm:partial footer-main --> … <!-- /dm:partial -->`
- পার্শিয়াল বদলানোর পর চালান:
  ```bash
  cd backend && npm run build:frontend     # অথবা: node tools/build-partials.js
  ```
- যাচাই: `node tools/build-partials.js --check` (টেস্টেও চলে)।
- ফলে ফুটার/মেনু বদলাতে এখন **একটি ফাইল** এডিট করলেই সব পেজে যায়।

## ৩) API পোলিং লোড কমানো
`frontend/dm-api.js`:
- ইন্টারভাল ১০ সেকেন্ড → **৬০ সেকেন্ড** (`window.DM_POLL_MS` দিয়ে ওভাররাইড করা যায়)
- ট্যাব ব্যাকগ্রাউন্ডে গেলে পোলিং **সম্পূর্ণ বন্ধ**, সামনে এলে (১৫ সে. থ্রটলসহ) রিফ্রেশ
- ব্যর্থ হলে exponential backoff (সর্বোচ্চ ৫ মিনিট)
- ফলে Render ফ্রি টিয়ারে রিকোয়েস্ট প্রায় **৬–১০ গুণ কম**।

## ৪) কোল্ড-স্টার্ট ওয়েটিং UI
সার্ভার ঘুমিয়ে থাকলে ২.৫ সেকেন্ডের বেশি সময় লাগলে নিচে একটি ব্যানার দেখায়:
“সার্ভার চালু হচ্ছে… প্রথমবার লোড হতে ৩০–৫০ সেকেন্ড লাগতে পারে।”
ডেটা এলেই ব্যানার চলে যায়। কোনো এক্সট্রা CSS ফাইল লাগে না (JS নিজেই স্টাইল বসায়)।

## ৫) package.json ভার্সন ঠিক করা
`cors ^2.8.6 → ^2.8.5`, `express ^4.22.2 → ^4.21.2`,
`jsonwebtoken ^9.0.3 → ^9.0.2`, `mongoose ^8.24.1 → ^8.9.5` (সব রিয়েল রিলিজ)।

## ৬) admin_panel/vercel.json
পুরনো `routes` → আধুনিক `rewrites` (robots.txt বাদ দিয়ে সব `/admin.html` এ),
শেষের অতিরিক্ত হোয়াইটস্পেস মুছে ফেলা হয়েছে।

## ৭) লগিং ও error monitoring
- নতুন `backend/logger.js`: JSON/pretty স্ট্রাকচার্ড লগ, request id, response time,
  password/token স্বয়ংক্রিয়ভাবে redact, `unhandledRejection`/`uncaughtException` ধরা।
  ENV: `LOG_LEVEL`, `LOG_FORMAT`.
- `POST /api/client-errors` — ব্রাউজারের JS error/rejection সার্ভার লগে আসে
  (রেট-লিমিটেড, দিনে সর্বোচ্চ ৫টি প্রতি পেজলোড)।
- ফ্রন্টএন্ডে `window.dmReportError(err, where)` হেল্পার।

## ৮) টেস্ট
```bash
cd backend && npm test        # Node 18+ বিল্ট-ইন runner, কোনো dev-dependency নেই
```
কভার করে: security হেল্পার, rate limit, CORS, logger/redaction,
পার্শিয়াল সিঙ্ক, css/js রেফারেন্স ভাঙা কিনা, পোলিং ইন্টারভাল নীতি।

## ৯) পরিচ্ছন্নতা
`frontend/google app script` (ফাঁকা, স্পেসযুক্ত নাম) ফাইলটি মুছে ফেলা হয়েছে —
আসল স্ক্রিপ্ট `google_apps_script/Code.gs` এ আছে।
