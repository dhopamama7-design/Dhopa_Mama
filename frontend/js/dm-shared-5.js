(function(){
  var API = window.API_BASE;

  /* ---- ১) পেজ ভিজিট ট্র্যাকিং — পেজ লোড হলে একবার সার্ভারে পাঠানো হয় ---- */
  try {
    fetch(API + '/api/track/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: location.hash || '/', ref: document.referrer || '' })
    }).catch(function(){});
  } catch(e){}

  function sendClickEvent(type, productName, productId){
    try {
      fetch(API + '/api/track/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: type, productName: productName, productId: productId || '' })
      }).catch(function(){});
    } catch(e){}
    // Google Analytics 4 (gtag) কাস্টম ইভেন্ট — যাদের আগে থেকেই GA4 কনফিগার করা আছে
    try {
      if (typeof gtag === 'function'){
        gtag('event', type === 'add_to_cart' ? 'add_to_cart' : 'select_item', {
          item_list_name: 'Dhopa Mama Products',
          items: [{ item_name: productName, item_id: productId || productName }]
        });
      }
    } catch(e){}
  }

  /* ---- ২) প্রোডাক্ট ক্লিক (মডাল ওপেন) ট্র্যাকিং ---- */
  var _origOpenProductModal = window.openProductModal;
  if (typeof _origOpenProductModal === 'function'){
    window.openProductModal = function(idx){
      try {
        var p = (typeof products !== 'undefined' && products[idx]) ? products[idx] : null;
        if (p) sendClickEvent('product_view', p.t, p.id || String(idx));
      } catch(e){}
      return _origOpenProductModal.apply(this, arguments);
    };
  }

  /* ---- ৩) কার্টে যোগ (Add to Cart) ট্র্যাকিং ---- */
  var _origAddToCart = window.addToCart;
  if (typeof _origAddToCart === 'function'){
    window.addToCart = function(name){
      try { sendClickEvent('add_to_cart', name); } catch(e){}
      return _origAddToCart.apply(this, arguments);
    };
  }
})();
