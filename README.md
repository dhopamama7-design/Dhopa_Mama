# Dhopa Mama — Fixed Build

## 🐞 চিহ্নিত সমস্যা ও সমাধান

| # | সমস্যা | সমাধান |
|---|--------|--------|
| 1 | `backend/.env` এ `MONGODB_URI=mongodb+srv://<db_username>:...` — placeholder এখনও ছিল, তাই MongoDB connect হত না → admin এ পণ্য যোগ/দাম পরিবর্তন কিছুই save হত না | `.env` এ সঠিক username বসিয়ে দেওয়া হয়েছে (`dhopamama`)। **যদি আপনার Atlas ইউজারনেম অন্য হয়, `.env` এবং Render dashboard এর `MONGODB_URI` variable এ সেটি বসান।** |
| 2 | `ALLOWED_ORIGINS=ALLOWED_ORIGINS=...` (দুইবার prefix) | পরিষ্কার করা হয়েছে |
| 3 | `server.js` এ `dotenv` load করা হয়নি — local run এ .env উপেক্ষিত হত | `require('dotenv').config()` যোগ করা হয়েছে; `dotenv` package dependency তে যোগ |
| 4 | `google app script` ফাইল সম্পূর্ণ **খালি** ছিল — order/OTP mail কখনো যেত না | `google_apps_script/Code.gs` এ সম্পূর্ণ কার্যকর script দেওয়া হয়েছে (order + OTP উভয় support) |
| 5 | `notifyOrderByEmail` payload এ কোনো `type` marker ছিল না — Apps Script order/OTP আলাদা করতে পারত না | payload এ `type: 'order'` যোগ; webhook error log এ status code দেখানো হয় |

## 🚀 Deploy চেকলিস্ট

### Render.com (Backend)
Render dashboard → **Environment** ট্যাব — নিচের সব variables বসান (`.env` এর মান):
- `MONGODB_URI` — **এখানে আপনার আসল Atlas ইউজারনেম বসান**
- `JWT_SECRET`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `APPS_SCRIPT_URL` — নতুন Apps Script deploy করার পর URL বসান
- `NOTIFY_EMAIL`
- `ALLOWED_ORIGINS`

Push করার পর Render auto-deploy করবে। Log এ `✅ MongoDB connected` দেখা গেলে পুরো চেইন কাজ করবে।

### MongoDB Atlas
1. Atlas → Database Access → আপনার user এর সঠিক username ও password নিশ্চিত করুন
2. Network Access → Render এর IP allow করতে `0.0.0.0/0` (Allow from anywhere) যোগ করুন
3. Database name `Dhopa_Mama` auto-created হবে প্রথম write এ

### Google Apps Script (Email)
`google_apps_script/README.md` অনুসরণ করুন — 8 ধাপে হয়ে যাবে।

### Frontend / Admin Panel
কোনো পরিবর্তন লাগবে না — `dm-api.js` এবং `admin.html` উভয়ই `https://dhopa-mama-ng4d.onrender.com` ব্যবহার করছে।

## 🔁 কাজের ফ্লো (এখন যেভাবে কাজ করবে)

```
[Admin Panel]  ──PUT /api/products──►  [Express+Mongoose]  ──►  [MongoDB Atlas]
                                              │
[Frontend]     ──GET /api/products──►         │
   (প্রতি 10 সে auto refresh)                 │
                                              ▼
[Customer Order] ─POST /api/orders─► [Mongo] ─► [Apps Script webhook] ─► ✉️ Gmail
```

Admin এ পণ্য বদলালে সঙ্গে সঙ্গে MongoDB তে save হয়, ফ্রন্টএন্ড ১০ সেকেন্ডের মধ্যে auto refresh এ পরিবর্তন দেখাবে। অর্ডার এলে সাথে সাথে `dhopamama7@gmail.com` এ mail যাবে।
