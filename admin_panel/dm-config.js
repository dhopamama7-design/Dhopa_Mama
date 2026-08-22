/* ==========================================================================
   Dhopa Mama — একমাত্র ব্যাকএন্ড কনফিগারেশন ফাইল
   --------------------------------------------------------------------------
   ব্যাকএন্ড সার্ভারের ঠিকানা এখন **শুধু এই একটি ফাইলে** আছে।
   ব্যাকএন্ড অন্য কোথাও ডিপ্লয় করলে নিচের DEFAULT_API_BASE লাইনটি বদলালেই
   সব পেজ (index / services / about / contact / cart / account / orders) ও
   অ্যাডমিন প্যানেল একসাথে নতুন ঠিকানা ব্যবহার করবে।

   এই ফাইলটি সব HTML পেজের <head> এ dm-api.js এর আগে লোড করতে হয়।
   ========================================================================== */
(function () {
  'use strict';

  /* ⚙️ ব্যাকএন্ড URL — একমাত্র জায়গা যেখানে এটি লেখা আছে */
  var DEFAULT_API_BASE = 'https://dhopa-mama-ng4d.onrender.com';

  /* ব্যাকএন্ড নিজেই ফ্রন্টএন্ড সার্ভ করলে (same-origin) API_BASE খালি রাখাই
     ভালো — তখন রিকোয়েস্ট same-origin হয়, CORS লাগে না। */
  var host = (typeof location !== 'undefined' && location.hostname) || '';
  var isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(host);
  var isBackendHost = false;
  try {
    isBackendHost = DEFAULT_API_BASE.indexOf('//' + host) !== -1 && host !== '';
  } catch (e) {}

  var base = window.DM_API_BASE;                 // ম্যানুয়াল ওভাররাইড (টেস্টিং)
  if (base == null) {
    if (isBackendHost) base = '';                // same-origin
    else if (isLocal) base = location.origin;    // লোকাল ডেভ সার্ভার
    else base = DEFAULT_API_BASE;                // স্ট্যাটিক হোস্ট (Vercel/Netlify)
  }

  base = String(base).replace(/\/+$/, '');
  window.DM_API_BASE = base;
  window.API_BASE = base;

  /* সব পেজে একইভাবে URL বানানোর হেল্পার */
  window.dmApiUrl = function (path) {
    var p = String(path || '');
    return base + (p.charAt(0) === '/' ? '' : '/') + p;
  };
})();
