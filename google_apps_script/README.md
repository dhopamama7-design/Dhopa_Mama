# Google Apps Script — Email Notification Setup

## ধাপে ধাপে সেটআপ

1. https://script.google.com এ যান (আপনার Gmail দিয়ে লগইন)।
2. **New project** ক্লিক করুন।
3. `Code.gs` এর সম্পূর্ণ কোড কপি করে script editor এ paste করুন।
4. উপরে `NOTIFY_EMAIL` variable এ আপনার Gmail address সেট করুন।
5. **Save** (💾 আইকন) করুন।
6. **Deploy → New deployment** → gear আইকন থেকে type: **Web app** নির্বাচন করুন।
   - Description: `Dhopa Mama Mail Webhook`
   - Execute as: **Me**
   - Who has access: **Anyone**
7. **Deploy** ক্লিক → Google permission চাইলে **Authorize** → Advanced → Go to project (unsafe) → Allow।
8. Deployment হয়ে গেলে একটি URL পাবেন — উদাহরণ:
   `https://script.google.com/macros/s/AKfycb.../exec`
9. এই URL টি:
   - `backend/.env` ফাইলে `APPS_SCRIPT_URL=` এর পাশে বসান।
   - Render.com এ deploy করলে Render dashboard → Environment এ `APPS_SCRIPT_URL` variable এ বসান।

## টেস্ট করা

Script editor এ `sendOrderMail` function সিলেক্ট করে ▶ Run চাপুন → আপনার Gmail এ টেস্ট mail আসা উচিত।

## Update করলে

Code পরিবর্তনের পর সবসময় **Deploy → Manage deployments → Edit → New version → Deploy** করতে হয়, নাহলে পুরনো ভার্সনই চলবে।
