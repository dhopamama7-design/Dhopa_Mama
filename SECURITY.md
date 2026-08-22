# নিরাপত্তা — কী কী ঠিক করা হয়েছে ও এখন আপনাকে যা করতে হবে

## ১) এখনই ক্রেডেনশিয়াল রোটেট করুন (সবচেয়ে জরুরি)
পুরনো `backend/.env` ফাইলে আসল ভ্যালু ছিল এবং সেটি শেয়ার হয়ে গেছে — ধরে নিন সব ফাঁস।
এই প্যাকেজ থেকে `.env` ফাইলটি সরিয়ে ফেলা হয়েছে; শুধু `.env.example` আছে।

- [ ] **MongoDB Atlas**: ডাটাবেস ইউজারের পাসওয়ার্ড বদলান (Database Access → Edit → Edit Password), নতুন URI বসান। Network Access-এ `0.0.0.0/0` না রেখে হোস্টের IP দিন।
- [ ] **JWT_SECRET**: নতুন বানান — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (এতে পুরনো সব টোকেন এমনিতেই অচল হয়ে যাবে)।
- [ ] **Admin পাসওয়ার্ড**: কমপক্ষে ১৬ অক্ষরের নতুন পাসওয়ার্ড নিন, তারপর
      `cd backend && npm run hash-password -- 'নতুন-পাসওয়ার্ড'` → আউটপুট `ADMIN_PASSWORD_HASH=...` `.env` এ বসান।
- [ ] **Cloudinary**: API key/secret রোটেট করুন (Settings → Access Keys)।
- [ ] **Google Apps Script**: নতুন deployment বানিয়ে পুরনো URL disable করুন।
- [ ] **ALLOWED_ORIGINS**: আপনার আসল ডোমেইনগুলো কমা দিয়ে দিন।

## ২) কোডে যেসব ফিক্স করা হয়েছে
| সমস্যা | সমাধান |
|---|---|
| `.env` ফাঁস | `.env` সরানো, `.env.example` যোগ, `.gitignore` শক্ত করা |
| প্লেইন-টেক্সট অ্যাডমিন পাসওয়ার্ড | `ADMIN_PASSWORD_HASH` (bcrypt) সাপোর্ট + constant-time তুলনা + `npm run hash-password` টুল |
| brute force | অ্যাডমিন লগইনে rate-limit (১৫ মিনিটে ১০) + ৫ ভুল চেষ্টায় ১৫ মিনিট lockout; ইউজার লগইনেও একই ধরনের সুরক্ষা |
| CORS সম্পূর্ণ খোলা | `ALLOWED_ORIGINS` থেকে whitelist; অননুমোদিত origin → 403 |
| ৩৬৫ দিনের টোকেন, রিভোকেশন নেই | অ্যাডমিন `8h`, ইউজার `7d` (env দিয়ে বদলানো যায়); টোকেনে `jti` + `/api/admin/logout`, `/api/logout`, `/api/logout-all`; পাসওয়ার্ড বদল/রিসেট/contact বদলে `tokenVersion` বাড়ে → পুরনো সব সেশন বাতিল |
| হার্ডকোডেড JWT fallback | ফলব্যাক নেই — `JWT_SECRET` না থাকলে বা ৩২ অক্ষরের কম হলে সার্ভার চালুই হবে না |
| OTP মেমোরিতে | OTP এখন MongoDB-তে (`password_resets`), SHA-256 হ্যাশ করে, ১০ মিনিট TTL, সর্বোচ্চ ৫ চেষ্টা, crypto-secure জেনারেশন, endpoint-এ rate-limit |
| `PATCH /api/me` দিয়ে অন্যের নাম্বার দখল | contact uniqueness চেক + DB-তে unique index + নরমালাইজেশন |
| ট্র্যাকিং endpoint ওপেন | প্রতি IP প্রতি মিনিটে ৩০ রিকোয়েস্ট সীমা, ইনপুট টাইপ/লেন্থ ভ্যালিডেশন |
| অন্যান্য | security headers, `x-powered-by` বন্ধ, গ্লোবাল `/api` rate-limit, অর্ডার POST-এ সীমা, error stack লুকানো, লগইন এরর মেসেজে ইউজার আছে কিনা ফাঁস না করা, পাসওয়ার্ড ন্যূনতম ৮ অক্ষর |

## ৩) ডিপ্লয়ের আগে
1. `cd backend && cp .env.example .env` → সব ভ্যালু পূরণ করুন।
2. `npm install && npm start` — কনসোলে কোনো ⚠️ ওয়ার্নিং থাকলে ঠিক করুন।
3. হোস্টিং (Render/Replit) এর Environment/Secrets-এ একই ভ্যালু দিন — `.env` আপলোড করবেন না।
