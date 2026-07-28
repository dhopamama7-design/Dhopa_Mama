/**
 * Dhopa Mama — Google Apps Script Email Webhook
 * -------------------------------------------------
 * ব্যবহারবিধি:
 *  1. https://script.google.com এ যান → New Project
 *  2. এই সম্পূর্ণ ফাইলের কোড কপি করে Code.gs এ paste করুন
 *  3. NOTIFY_EMAIL কে আপনার Gmail এ পরিবর্তন করুন (নিচে)
 *  4. Deploy → New deployment → Type: "Web app"
 *       - Execute as: Me
 *       - Who has access: Anyone
 *  5. Deploy শেষে যে URL পাবেন সেটি backend/.env এর APPS_SCRIPT_URL এ বসান
 *
 * এই স্ক্রিপ্ট backend server থেকে দুই ধরণের event গ্রহণ করে:
 *   - order  : নতুন অর্ডার এলে পুরো detail সহ mail
 *   - otp    : পাসওয়ার্ড রিসেট OTP mail
 */

var NOTIFY_EMAIL = 'dhopamama7@gmail.com';   // ← আপনার inbox
var SHOP_NAME    = 'Dhopa Mama';

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    // type না থাকলে ধরে নিই অর্ডার (backend server.js পুরনো ভার্সনে type পাঠাত না)
    var type = body.type || 'order';

    if (type === 'otp') {
      sendOtpMail(body);
    } else {
      sendOrderMail(body);
    }
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonOut({ ok: true, service: 'Dhopa Mama mail webhook' });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ────────────── ORDER MAIL ────────────── */
function sendOrderMail(o) {
  var subject = '🛒 নতুন অর্ডার — ' + (o.id || '') + ' — ' + SHOP_NAME;

  var itemsHtml = '';
  if (Array.isArray(o.items)) {
    itemsHtml += '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:10px">'
      + '<thead><tr style="background:#f3f4f6"><th align="left" style="padding:6px;border:1px solid #ddd">পণ্য</th>'
      + '<th style="padding:6px;border:1px solid #ddd">পরিমাণ</th>'
      + '<th style="padding:6px;border:1px solid #ddd">দাম</th>'
      + '<th style="padding:6px;border:1px solid #ddd">মোট</th></tr></thead><tbody>';
    o.items.forEach(function (it) {
      var qty   = Number(it.qty || it.quantity || 1);
      var price = Number(it.price || 0);
      itemsHtml += '<tr>'
        + '<td style="padding:6px;border:1px solid #ddd">' + escapeHtml(it.name || '') + '</td>'
        + '<td align="center" style="padding:6px;border:1px solid #ddd">' + qty + '</td>'
        + '<td align="right" style="padding:6px;border:1px solid #ddd">৳ ' + price + '</td>'
        + '<td align="right" style="padding:6px;border:1px solid #ddd">৳ ' + (qty * price) + '</td>'
        + '</tr>';
    });
    itemsHtml += '</tbody></table>';
  }

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px">'
    + '<h2 style="color:#0d9488;margin:0 0 12px">🛒 ' + SHOP_NAME + ' — নতুন অর্ডার</h2>'
    + '<p><b>Order ID:</b> ' + escapeHtml(o.id || '') + '</p>'
    + '<p><b>তারিখ:</b> ' + escapeHtml((o.date || '') + ' ' + (o.time || '')) + '</p>'
    + '<hr>'
    + '<h3 style="margin:12px 0 4px">গ্রাহকের তথ্য</h3>'
    + '<p style="margin:2px 0"><b>নাম:</b> ' + escapeHtml(o.customerName || '-') + '</p>'
    + '<p style="margin:2px 0"><b>মোবাইল:</b> ' + escapeHtml(o.customerMobile || '-') + '</p>'
    + '<p style="margin:2px 0"><b>ঠিকানা:</b> ' + escapeHtml(o.customerAddress || '-') + '</p>'
    + '<hr>'
    + '<h3 style="margin:12px 0 4px">অর্ডার আইটেম</h3>'
    + itemsHtml
    + '<p style="text-align:right;font-size:16px;margin-top:10px"><b>মোট:</b> ৳ ' + Number(o.total || 0) + '</p>'
    + '<hr>'
    + '<p><b>পেমেন্ট পদ্ধতি:</b> ' + escapeHtml(o.method || '-') + '</p>'
    + (o.txn ? '<p><b>ট্রানজেকশন ID:</b> ' + escapeHtml(o.txn) + '</p>' : '')
    + '<p><b>Status:</b> ' + escapeHtml(o.status || 'Pending') + '</p>'
    + '<p style="color:#6b7280;font-size:12px;margin-top:24px">এই মেইলটি স্বয়ংক্রিয়ভাবে ' + SHOP_NAME + ' সার্ভার থেকে পাঠানো হয়েছে।</p>'
    + '</div>';

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: subject,
    htmlBody: html
  });
}

/* ────────────── OTP MAIL ────────────── */
function sendOtpMail(b) {
  var to  = b.to;
  var otp = b.otp;
  if (!to || !otp) return;

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:16px">'
    + '<h2 style="color:#0d9488">' + SHOP_NAME + ' — পাসওয়ার্ড রিসেট OTP</h2>'
    + '<p>আপনার OTP কোড:</p>'
    + '<p style="font-size:32px;font-weight:bold;letter-spacing:6px;background:#f3f4f6;padding:12px;text-align:center;border-radius:8px">'
    + escapeHtml(String(otp)) + '</p>'
    + '<p>এই কোডটি ১৫ মিনিটের জন্য বৈধ। আপনি যদি এই রিকোয়েস্ট না করে থাকেন, এই মেইলটি উপেক্ষা করুন।</p>'
    + '</div>';

  MailApp.sendEmail({ to: to, subject: SHOP_NAME + ' — আপনার OTP কোড', htmlBody: html });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
