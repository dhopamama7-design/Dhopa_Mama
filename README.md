# Dhopa Mama — Fixed Build

## এই আপডেটে যা ঠিক করা হয়েছে
1. **`products.findOneAndUpdate() buffering timed out after 10000ms` সমস্যা:**
   Mongoose এর `bufferCommands` বন্ধ করা হয়েছে। এখন MongoDB সংযোগ না থাকলে
   ১০ সেকেন্ড অপেক্ষা না করে সাথে সাথে পরিষ্কার বাংলা মেসেজ দেখাবে —
   *"ডাটাবেস সংযোগ নেই — Atlas এর Network Access ও MONGODB_URI চেক করুন।"*
2. **অটো-রিকানেক্ট:** MongoDB সংযোগ ফেল করলে exponential backoff দিয়ে
   বার বার চেষ্টা করবে (৩s → ৬s → … → ৩০s)।
3. **ডিফল্ট ক্যাটাগরি/পণ্য/সার্ভিস অটো-সীড:** সংযোগ সফল হলেই যদি
   `products` / `categories` / `services` collection খালি থাকে,
   `backend/defaults.js` থেকে সবকিছু (৬ ক্যাটাগরি, ২১ পণ্য, ৬ সার্ভিস)
   MongoDB তে insert হয়ে যাবে। এডমিন প্যানেল থেকে দাম বদলালে সেটাই
   MongoDB তে সেভ হবে ও ফ্রন্টএন্ডে দেখাবে।
4. **হেলথ endpoint** (`/api/health`) এখন Mongo status ও শেষ error দেখায়।
5. **`POST /api/admin/seed-defaults`** — এডমিন টোকেন দিয়ে ম্যানুয়ালি
   ডিফল্ট সীড করার endpoint।

## MongoDB Atlas চেকলিস্ট (৫০০ error এলে)
- **Network Access → IP Allowlist:** `0.0.0.0/0` অ্যাড করুন
  (Render এর outbound IP আগে থেকে জানা যায় না)।
- **Database Access → User:** `dhopamama` username + password
  `backend/.env` এর `MONGODB_URI` এর সাথে মিলিয়ে নিন।
- **Cluster status:** paused থাকলে Resume করুন।

## Google Apps Script (ইমেইল নোটিফিকেশন)
`google_apps_script/README.md` অনুসরণ করে deploy করুন এবং
Render এর `APPS_SCRIPT_URL` env-var সেট করুন।

## Deployment
- Backend: Render.com — root: `backend/`, start: `npm start`,
  env vars: `MONGODB_URI, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD,
  CLOUDINARY_*, APPS_SCRIPT_URL, NOTIFY_EMAIL`
- Admin panel: Vercel — `admin_panel/admin.html`
- Frontend: any static host — `frontend/`
