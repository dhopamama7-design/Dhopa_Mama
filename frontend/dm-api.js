/* ==========================================================================
   Dhopa Mama — শেয়ার্ড API ব্রিজ (ফ্রন্টএন্ড)
   --------------------------------------------------------------------------
   সব পাবলিক পেজ (index / services / about / contact / cart / account /
   orders) এই একটি ফাইল ব্যবহার করে। products / categories / services /
   settings — সবকিছুই সরাসরি MongoDB (ব্যাকএন্ড API) থেকে আসে।

   ⚠️  পুরনো ভার্সনের যেসব বাগ এখানে ঠিক করা হয়েছে:
   1. আগে একটি *synchronous* XMLHttpRequest এ `xhr.timeout` সেট করা হত।
      ব্রাউজার স্পেক অনুযায়ী synchronous XHR এ timeout সেট করলে
      `InvalidAccessError` throw হয় — ফলে `xhr.send()` কখনোই চলত না এবং
      `window.__API_DATA` সর্বদা খালি থাকত। তাই `__pickApi()` প্রতিবার
      HTML এ হার্ডকোড করা ডিফল্ট ডেটা ফেরত দিত এবং অ্যাডমিন প্যানেলে দাম
      বদলালে/নতুন পণ্য যোগ করলে ওয়েবসাইটে কিছুই বদলাত না।
      → এখন সম্পূর্ণ async fetch ব্যবহার হচ্ছে (পেজ আর ব্লক হয় না)।
   2. আগে `__pickApi` এ `v.length` চেক ছিল, তাই অ্যাডমিন সব পণ্য মুছে দিলে
      আবার ডিফল্ট ডেটা ফিরে আসত। → এখন খালি array-ও বৈধ উত্তর।
   3. cart / account / orders পেজে `API_BASE` ফাঁকা ছিল, তাই অর্ডার ও লগইন
      সার্ভারে পৌঁছাত না। → এখন সব পেজ এই একটি ফাইল থেকেই API_BASE পায়।
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     ⚙️  ব্যাকএন্ড ঠিকানা এখানে হার্ডকোড করা নেই — dm-config.js একমাত্র
     কনফিগ ফাইল। প্রতিটি পেজে dm-config.js এই ফাইলের আগে লোড হয়।
     ====================================================================== */
  var API_BASE = (window.DM_API_BASE != null) ? window.DM_API_BASE : (window.API_BASE || '');
  API_BASE = String(API_BASE).replace(/\/+$/, '');
  window.API_BASE = API_BASE;
  window.DM_API_BASE = API_BASE;

  var KEYS = ['categories', 'products', 'services', 'settings'];
  var CACHE_PREFIX = 'dm_snapshot_';
  /* ── পোলিং নীতি ──────────────────────────────────────────────
     আগে প্রতি ১০ সেকেন্ডে ৪টি করে রিকোয়েস্ট যেত — প্রতিটি খোলা ট্যাব
     থেকে। Render ফ্রি টিয়ারে এটি অপ্রয়োজনীয় লোড। এখন:
     • ইন্টারভাল ৬০ সেকেন্ড (window.DM_POLL_MS দিয়ে বদলানো যায়)
     • ট্যাব ব্যাকগ্রাউন্ডে গেলে পোলিং সম্পূর্ণ বন্ধ
     • ট্যাব সামনে এলে (throttle সহ) একবার রিফ্রেশ
     • পরপর ব্যর্থ হলে exponential backoff (সর্বোচ্চ ৫ মিনিট)          */
  var POLL_MS = Number(window.DM_POLL_MS) > 0 ? Number(window.DM_POLL_MS) : 60000;
  var MAX_POLL_MS = 300000;
  var MIN_FOREGROUND_GAP_MS = 15000;

  window.__API_DATA = window.__API_DATA || {};

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
     ৩) সার্ভার থেকে ডেটা আনা
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
      .catch(function () { return null; });   // null = নেটওয়ার্ক/সার্ভার ব্যর্থতা
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
      /* সব রিকোয়েস্ট ব্যর্থ হলে reject — কলার backoff চালু করবে */
      var ok = changedFlags.filter(function (v) { return v !== null; }).length;
      if (!ok) throw new Error('সব API রিকোয়েস্ট ব্যর্থ হয়েছে');
      if (changedFlags.indexOf(true) === -1) return false;
      runHooks();
      return true;
    });
  }
  window.__dmRefresh = refreshAll;

  /* ------------------------------------------------------------------
     ৪) কোল্ড-স্টার্ট UI — Render ফ্রি টিয়ারে সার্ভার ঘুমিয়ে থাকলে প্রথম
     রিকোয়েস্টে ৩০–৫০ সেকেন্ড লাগে। ইউজার যেন "সাইট নষ্ট" না ভাবে, তাই
     ২.৫ সেকেন্ডের বেশি সময় লাগলে একটি ওয়েটিং ব্যানার দেখানো হয়।
     ------------------------------------------------------------------ */
  var waitTimer = null, banner = null;

  function showWaking() {
    if (banner || !document.body) return;
    banner = document.createElement('div');
    banner.id = 'dm-wake-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML =
      '<span class="dm-wake-spin" aria-hidden="true"></span>' +
      '<span>সার্ভার চালু হচ্ছে… প্রথমবার লোড হতে ৩০–৫০ সেকেন্ড লাগতে পারে।</span>';
    document.body.appendChild(banner);
  }
  function hideWaking() {
    if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }
  function armWaking() {
    if (waitTimer || banner) return;
    waitTimer = setTimeout(function () {
      waitTimer = null;
      if (document.body) showWaking();
      else document.addEventListener('DOMContentLoaded', showWaking, { once: true });
    }, 2500);
  }

  function injectWakeStyles() {
    if (document.getElementById('dm-wake-style')) return;
    var st = document.createElement('style');
    st.id = 'dm-wake-style';
    st.textContent =
      '#dm-wake-banner{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);' +
      'z-index:99999;display:flex;align-items:center;gap:10px;max-width:92vw;' +
      'padding:10px 16px;border-radius:999px;background:rgba(17,24,39,.92);color:#fff;' +
      'font-size:14px;line-height:1.4;box-shadow:0 8px 24px rgba(0,0,0,.25)}' +
      '.dm-wake-spin{width:14px;height:14px;border-radius:50%;flex:0 0 auto;' +
      'border:2px solid rgba(255,255,255,.35);border-top-color:#fff;' +
      'animation:dm-wake-rot .8s linear infinite}' +
      '@keyframes dm-wake-rot{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(st);
  }
  injectWakeStyles();

  /* ------------------------------------------------------------------
     ৫) পোলিং লুপ — ভিজিবিলিটি-অ্যাওয়্যার + backoff
     ------------------------------------------------------------------ */
  var timer = null, delay = POLL_MS, lastRun = 0, running = false;

  function schedule(ms) {
    if (timer) clearTimeout(timer);
    if (document.hidden) { timer = null; return; }   // ব্যাকগ্রাউন্ডে পোলিং বন্ধ
    timer = setTimeout(tick, ms);
  }

  function tick(force) {
    if (running) return Promise.resolve(false);
    if (!force && document.hidden) { schedule(delay); return Promise.resolve(false); }
    running = true; lastRun = Date.now();
    armWaking();
    return refreshAll()
      .then(function (changed) {
        hideWaking();
        delay = POLL_MS;                              // সফল → স্বাভাবিক ইন্টারভাল
        return changed;
      })
      .catch(function (e) {
        delay = Math.min(delay * 2, MAX_POLL_MS);     // ব্যর্থ → backoff
        window.dmReportError && window.dmReportError(e, 'api-refresh');
        return false;
      })
      .then(function (r) { running = false; schedule(delay); return r; });
  }

  /* প্রথম ফেচ এখনই — DOM তৈরি হওয়ার প্রায় সাথে সাথেই আসল দাম/পণ্য বসে যায় */
  tick(true);

  /* ট্যাব সামনে এলে রিফ্রেশ (খুব ঘন ঘন নয়) */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (timer) { clearTimeout(timer); timer = null; } return; }
    if (Date.now() - lastRun >= MIN_FOREGROUND_GAP_MS) tick(true);
    else schedule(Math.max(1000, MIN_FOREGROUND_GAP_MS - (Date.now() - lastRun)));
  });

  window.__dmRefresh = function () { return tick(true); };

  /* ------------------------------------------------------------------
     ৪) শেয়ার্ড হেল্পার — সব পেজ একইভাবে ইউজার টোকেন পড়তে পারে
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

  /* ------------------------------------------------------------------
     ৬) ব্রাউজার-সাইড error monitoring — সব JS error/rejection সার্ভারে
     পাঠানো হয় (/api/client-errors), যাতে লগে সমস্যা ধরা যায়।
     ------------------------------------------------------------------ */
  var sentErrors = 0;
  window.dmReportError = function (err, where) {
    if (sentErrors >= 5) return;                       // স্প্যাম প্রতিরোধ
    sentErrors++;
    var msg = (err && err.message) || String(err || 'unknown error');
    try {
      fetch(API_BASE + '/api/client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: (where ? '[' + where + '] ' : '') + msg,
          stack: (err && err.stack) || '',
          page: location.pathname + location.search
        }),
        keepalive: true,
        credentials: 'omit'
      }).catch(function () {});
    } catch (e) {}
  };

  window.addEventListener('error', function (e) {
    window.dmReportError(e.error || e.message, 'window.onerror');
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.dmReportError(e.reason, 'unhandledrejection');
  });
})();
