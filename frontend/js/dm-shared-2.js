/*
  index.html এর জন্য bridge — সকল ডেটা (products / categories / services /
  settings) সরাসরি MongoDB থেকে সিঙ্ক করে নিয়ে আসা হয়। localStorage এ কোনো
  ডেটা রাখা হয় না। Admin panel থেকে যা পরিবর্তন হবে সেটাই এখানে দেখাবে।
*/
/* API_BASE এখন dm-config.js থেকে আসে — এখানে আর হার্ডকোড নেই */

(function(){
  var EP = { categories:'categories', products:'products', services:'services', settings:'settings' };
  window.__API_DATA = window.__API_DATA || {};

  // helper — যদি API থেকে valid array/object আসে সেটা ব্যবহার করো, নাহলে default
  window.__pickApi = function(key, fallback){
    var v = window.__API_DATA[key];
    if (Array.isArray(fallback)) return (Array.isArray(v) && v.length) ? v : fallback;
    return (v && typeof v === 'object') ? v : fallback;
  };

  // ---- আগে এখানে blocking synchronous XHR ছিল — Render ব্যাকএন্ড ঘুমিয়ে থাকলে
  // (cold start) পুরো পেজ অনেক সময় ধরে সাদা/ফাঁকা হয়ে থাকত। এখন non-blocking
  // async fetch (parallel) ব্যবহার হচ্ছে — পেজ সাথে সাথেই নিচের হার্ডকোড করা
  // ডিফল্ট ডেটা দিয়ে রেন্ডার হয়ে যায়, আসল ডেটা এলে ব্যাকগ্রাউন্ডে আপডেট হয়। ----
  Promise.all(Object.keys(EP).map(function(k){
    return fetch(window.API_BASE + '/api/' + EP[k] + '?t=' + Date.now(), { cache:'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(data){ if (data !== null && data !== undefined) window.__API_DATA[k] = data; })
      .catch(function(){});
  })).then(function(){
    if (typeof window.__rerenderFromApi === 'function'){
      try { window.__rerenderFromApi(); } catch(e){}
    }
  });

  // ---- Async refresh প্রতি 20 সেকেন্ডে (admin থেকে নতুন পরিবর্তন live দেখতে) ----
  setInterval(function(){
    Object.keys(EP).forEach(function(k){
      fetch(window.API_BASE + '/api/' + EP[k])
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
          if (!data) return;
          var prev = JSON.stringify(window.__API_DATA[k]);
          var next = JSON.stringify(data);
          if (prev === next) return;
          window.__API_DATA[k] = data;
          if (typeof window.__rerenderFromApi === 'function'){
            try { window.__rerenderFromApi(); } catch(e){}
          }
        }).catch(function(){});
    });
  }, 20000);
})();
