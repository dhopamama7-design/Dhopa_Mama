/* ==========================================================================
   Dhopa Mama — শেয়ার্ড API ব্রিজ (ফ্রন্টএন্ড) - FIXED VERSION
   --------------------------------------------------------------------------
   সব পাবলিক পেজ (index / services / about / contact / cart / account /
   orders) এই একটি ফাইল ব্যবহার করে। products / categories / services /
   settings — সবকিছুই সরাসরি MongoDB (ব্যাকএন্ড API) থেকে আসে।

   🔧 নতুন ফিচার:
   - window.__dmReady বা window.__dmOnReady() দিয়ে বুঝতে পারবেন কখন প্রথম
     ডেটা লোড হয়েছে এবং রেন্ড করতে প্রস্তুত
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     ⚙️  একমাত্র কনফিগারেশন — ব্যাকএন্ড সার্ভারের ঠিকানা।
     ব্যাকএন্ড অন্য কোথাও ডিপ্লয় করলে শুধু নিচের এই একটি লাইন বদলান।
     ====================================================================== */
  var API_BASE = 'https://dhopa-mama-ng4d.onrender.com';

  /* ইচ্ছে করলে পেজে dm-api.js লোড করার আগে window.DM_API_BASE সেট করে
     ওভাররাইড করা যায় (যেমন লোকাল টেস্টিং এ)। */
  if (window.DM_API_BASE) API_BASE = window.DM_API_BASE;
  API_BASE = String(API_BASE).replace(/\/+$/, '');
  window.API_BASE = API_BASE;   

  var KEYS = ['categories', 'products', 'services', 'settings'];
  var CACHE_PREFIX = 'dm_snapshot_';
  var POLL_MS = 10000;    

  window.__API_DATA = window.__API_DATA || {};

  /* 🆕 প্রথম ডেটা লোড সম্পন্ন হয়েছে কিনা */
  window.__dmReady = false;
  var readyHooks = [];
  
  window.__dmOnReady = function (fn) {
    if (typeof fn === 'function') {
      if (window.__dmReady) {
        /* ইতিমধ্যে প্রস্তুত হয়ে গেছে, তো সাথে সাথে কল করো */
        fn(window.__API_DATA);
      } else {
        /* এখনও প্রস্তুত হয়নি, তো queue করো */
        readyHooks.push(fn);
      }
    }
  };

  /* রেন্ডার হুক — পেজ চাইলে window.__dmOnData(fn) দিয়ে নিজের রেন্ডার
     ফাংশন রেজিস্টার করতে পারে। পুরনো `window.__rerenderFromApi` ও সাপোর্টেড। */
  var hooks = [];
  window.__dmOnData = function (fn) {
    if (typeof fn === 'function') hooks.push(fn);
  };

  /* ------------------------------------------------------------------
     ১) তাৎক্ষণিক পেইন্ট — সর্বশেষ সফল সার্ভার স্ন্যাপশট localStorage এ
     ক্যাশ করা থাকে। এটি ডেটার "সোর্স অফ ট্রুথ" নয়, শুধু ক্যাশ; নেটওয়ার্ক
     উত্তর এলেই ওভাররাইট হয়ে যায়। এতে রিপিট ভিজিটে প্রথম ফ্রেমেই আসল
     দাম দেখা যায়, হার্ডকোড করা ডিফল্ট নয়।
     ------------------------------------------------------------------ */
  KEYS.forEach(function (k) {
    try {
      var raw = window.localStorage.getItem(CACHE_PREFIX + k);
      if (!raw || raw === 'null' || raw === 'undefined') return;
      var parsed = JSON.parse(raw);
      if (parsed !== null && parsed !== undefined) window.__API_DATA[k] = parsed;
    } catch (e) { /* ক্যাশ নষ্ট থাকলে উপেক্ষা করো */ }
  });

  /* ------------------------------------------------------------------
     ২) __pickApi — সার্ভার ডেটা থাকলে সেটাই, না থাকলে পেজের ডিফল্ট।
     ------------------------------------------------------------------ */
  window.__pickApi = function (key, fallback) {
    var v = window.__API_DATA[key];
    if (Array.isArray(fallback)) {
      /* খালি array-ও বৈধ উত্তর — অ্যাডমিন সব আইটেম মুছে দিলে সাইটে
         খালিই দেখাবে, আগের মতো ডিফল্ট ডেটা ফিরে আসবে না। */
      return Array.isArray(v) ? v.slice() : JSON.parse(JSON.stringify(fallback));
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    return fallback;
  };

  /* ------------------------------------------------------------------
     ३) সার্ভার থেকে ডেটা আনা
     ------------------------------------------------------------------ */
  function fetchKey(k) {
    return fetch(API_BASE + '/api/' + k + '?t=' + Date.now(), {
      cache: 'no-store',
      credentials: 'omit'
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data === null || data === undefined) return false;
        var next = JSON.stringify(data);
        if (JSON.stringify(window.__API_DATA[k]) === next) return false;
        window.__API_DATA[k] = data;
        try { window.localStorage.setItem(CACHE_PREFIX + k, next); } catch (e) {}
        return true;
      })
      .catch(function () { return false; });
  }

  var pendingApply = false;
  function runHooks() {
    /* পেজের রেন্ডার ফাংশনগুলো তখনই তৈরি হয় যখন সব ইনলাইন স্ক্রিপ্ট চলে
       গেছে — তাই DOM রেডি না হওয়া পর্যন্ত অপেক্ষা করি। */
    if (document.readyState === 'loading') {
      if (pendingApply) return;
      pendingApply = true;
      document.addEventListener('DOMContentLoaded', function () {
        pendingApply = false;
        runHooks();
      }, { once: true });
      return;
    }
    hooks.forEach(function (fn) {
      try { fn(window.__API_DATA); }
      catch (e) { console.warn('[dm-api] render hook ব্যর্থ:', e); }
    });
    if (typeof window.__rerenderFromApi === 'function') {
      try { window.__rerenderFromApi(); }
      catch (e) { console.warn('[dm-api] __rerenderFromApi ব্যর্থ:', e); }
    }
  }

  function refreshAll() {
    return Promise.all(KEYS.map(fetchKey)).then(function (changedFlags) {
      if (changedFlags.indexOf(true) === -1) return false;
      runHooks();
      return true;
    });
  }
  window.__dmRefresh = refreshAll;

  /* 🆕 প্রথম ফেচ শেষ হলে ready hooks কল করা */
  function notifyReady() {
    if (window.__dmReady) return; /* দুইবার কল হবে না */
    window.__dmReady = true;
    var toCall = readyHooks.slice();
    readyHooks = [];
    toCall.forEach(function (fn) {
      try { fn(window.__API_DATA); }
      catch (e) { console.warn('[dm-api] ready hook ব্যর্থ:', e); }
    });
  }

  /* প্রথম ফেচ এখনই শুরু হয় — DOM তৈরি হওয়ার প্রায় সাথে সাথেই আসল
     দাম/পণ্য বসে যায়। */
  refreshAll().then(function () {
    notifyReady();
  });

  /* অ্যাডমিন প্যানেলে পরিবর্তন করলে খোলা থাকা ট্যাবেও লাইভ দেখানোর জন্য */
  setInterval(refreshAll, POLL_MS);

  /* ট্যাব আবার সামনে এলে সাথে সাথে রিফ্রেশ */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshAll();
  });

  /* ------------------------------------------------------------------
     ४) শেয়ার্ড হেল্পার — সব পেজ একইভাবে ইউজার টোকেন পড়তে পারে
     ------------------------------------------------------------------ */
  window.dmAuthToken = function () {
    try {
      var raw = window.localStorage.getItem('dm_auth') ||
                window.localStorage.getItem('dmUser');
      if (!raw) return '';
      var p = JSON.parse(raw);
      return (p && p.token) || '';
    } catch (e) { return ''; }
  };

  window.dmApiUrl = function (path) {
    return API_BASE + (String(path).charAt(0) === '/' ? '' : '/') + path;
  };
})();