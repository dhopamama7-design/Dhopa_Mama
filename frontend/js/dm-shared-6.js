(function(){
  // অ্যাডমিন প্যানেল থেকে আপলোড করা হিরো ব্যানার ছবি (settings.heroassets) প্রয়োগ করে
  function applyHeroassets(){
    try {
      var s = (typeof window.__pickApi === 'function') ? window.__pickApi('settings', {}) : (window.__API_DATA && window.__API_DATA.settings) || {};
      var h = (s && s.heroassets) || {};
      if (h.main){
        var m1 = document.getElementById('heroMainImg');  if (m1) m1.src = h.main;
        var m2 = document.getElementById('heroSlideImg1'); if (m2) m2.src = h.main;
      }
      if (h.side1){
        var s1 = document.getElementById('heroSlideImg2'); if (s1) s1.src = h.side1;
        var s2 = document.getElementById('heroSideImg1');  if (s2) s2.src = h.side1;
      }
      if (h.side2){
        var t1 = document.getElementById('heroSlideImg3'); if (t1) t1.src = h.side2;
        var t2 = document.getElementById('heroSideImg2');  if (t2) t2.src = h.side2;
      }
    } catch(err){ console.warn('hero image apply failed', err); }
  }
  window.__applyHeroassets = applyHeroassets;
  applyHeroassets();
})();
