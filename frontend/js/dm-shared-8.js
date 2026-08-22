(function(){
  'use strict';

  // ============ 22: Top Friend মাসিক ডিসকাউন্ট সিস্টেম ============
  var TF_KEY = 'dm_topfriend_v1';
  function tfLoad(){
    try { return JSON.parse(localStorage.getItem(TF_KEY) || '{}'); } catch(e){ return {}; }
  }
  function tfSave(o){ try { localStorage.setItem(TF_KEY, JSON.stringify(o)); } catch(e){} }
  function tfCurrentMonth(){
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth()+1);
  }
  function tfGetUserKey(){
    if (window.currentUser && window.currentUser.contact) return window.currentUser.contact;
    return 'guest';
  }
  window.__tfGetOrderCount = function(){
    var data = tfLoad();
    var uk = tfGetUserKey();
    var m = tfCurrentMonth();
    if (!data[uk] || data[uk].month !== m) return 0;
    return data[uk].count || 0;
  };
  window.__tfBumpOrderCount = function(){
    var data = tfLoad();
    var uk = tfGetUserKey();
    var m = tfCurrentMonth();
    if (!data[uk] || data[uk].month !== m) data[uk] = { month: m, count: 0 };
    data[uk].count++;
    tfSave(data);
    return data[uk].count;
  };
  // ২০ অর্ডার হলে সেই মাসের বাকি সব অর্ডারে ৫%, ৩০+ = ১০%, ৫০+ = ৫০%
  window.__tfGetDiscountPercent = function(){
    var c = window.__tfGetOrderCount();
    if (c >= 50) return 50;
    if (c >= 30) return 10;
    if (c >= 20) return 5;
    return 0;
  };
  window.__tfIsTopFriend = function(){
    return window.__tfGetOrderCount() >= 20;
  };

  // ============ 10: ডেলিভারি চার্জ (এডমিন-কন্ট্রোল সহ) ============
  window.__dmSettings = window.__dmSettings || {};
  // এডমিন প্যানেল থেকে সেট করা settings.deliveryCharge ও settings.freeDeliveryMinItems পড়া হবে
  function getDeliveryConf(){
    var s = {};
    try {
      s = (typeof window.__pickApi === 'function') ? window.__pickApi('settings', {}) : {};
    } catch(e){}
    return {
      charge: Number(s.deliveryCharge != null ? s.deliveryCharge : 10),
      minFree: Number(s.freeDeliveryMinItems != null ? s.freeDeliveryMinItems : 5)
    };
  }

  window.__recomputeCheckoutTotals = function(){
    var cart = window.cart || [];
    var subtotal = cart.reduce(function(s,i){ return s + (Number(i.price)*Number(i.qty)); }, 0);
    var qtyTotal = cart.reduce(function(s,i){ return s + Number(i.qty||0); }, 0);
    var conf = getDeliveryConf();
    var delivery = qtyTotal >= conf.minFree ? 0 : conf.charge;
    var pct = window.__tfGetDiscountPercent();
    var discount = Math.round(subtotal * pct / 100);
    var grand = subtotal - discount + delivery;

    var $ = function(id){ return document.getElementById(id); };
    if ($('checkoutSubtotal')) $('checkoutSubtotal').textContent = '৳' + subtotal.toLocaleString();
    if ($('checkoutDelivery')) $('checkoutDelivery').textContent = (delivery === 0 ? 'ফ্রি (Free)' : '৳' + delivery);
    if ($('checkoutGrandTotal')) $('checkoutGrandTotal').textContent = '৳' + grand.toLocaleString();
    if ($('checkoutDiscount')) $('checkoutDiscount').textContent = '−৳' + discount.toLocaleString();
    if ($('checkoutDiscountRow')) $('checkoutDiscountRow').style.display = (discount > 0 ? 'flex' : 'none');
    if ($('deliveryHint')) {
      $('deliveryHint').innerHTML = (qtyTotal >= conf.minFree)
        ? '<i class="fas fa-check-circle" style="color:#CA9100"></i> ' + conf.minFree + '+ কাপড়ে ডেলিভারি ফ্রি (Free)।'
        : (conf.minFree - qtyTotal) + 'টি কাপড় বাড়ালে ডেলিভারি ফ্রি হবে (Add ' + (conf.minFree-qtyTotal) + ' more items for free delivery)।';
    }
    return { subtotal: subtotal, delivery: delivery, discount: discount, discountPercent: pct, grand: grand };
  };

  // ============ 11: bKash/Nagad Coming Soon ============
  window.showComingSoon = function(e, method){
    if (e && e.stopPropagation) e.stopPropagation();
    alert(method + ' — শীঘ্রই আসছে (Coming Soon)। বর্তমানে শুধু Cash on Delivery (COD) সচল।');
  };

  // ============ 15: Login modal ভেতর ছাড়া বাইরে ক্লিক করলে বন্ধ হবে ============
  function bindOverlayCloseOnOutsideClick(){
    var overlays = ['accountModalOverlay','productModalOverlay','ordersModalOverlay','checkoutModalOverlay','orderSuccessOverlay'];
    overlays.forEach(function(id){
      var el = document.getElementById(id);
      if (!el || el.__dmBound) return;
      el.__dmBound = true;
      el.addEventListener('click', function(ev){
        if (ev.target === el) {
          el.classList.remove('open');
        }
      });
    });
  }

  // ============ 21: mobile-bottom-nav active state ============
  function bindMobileBottomNav(){
    var items = document.querySelectorAll('.mobile-bottom-nav .nav-item');
    items.forEach(function(it){
      if (it.__dmBound) return;
      it.__dmBound = true;
      it.addEventListener('click', function(){
        items.forEach(function(x){ x.classList.remove('active'); });
        it.classList.add('active');
      });
    });
  }

  // ============ 3: খালি কার্ড ক্লিক করলে খুলবে না ============
  function disableEmptyCards(){
    // productsGrid — প্রতিটি product-card এ যদি কোনো service না থাকে তবে ক্লিক ব্লক
    var prods = window.products || [];
    document.querySelectorAll('.product-card').forEach(function(card, idx){
      var p = prods[idx];
      if (!p) return;
      var hasSvc = p.services && (p.services.normal != null || p.services.dry != null);
      if (!hasSvc){
        card.style.opacity = '.4';
        card.style.pointerEvents = 'none';
        card.title = 'বর্তমানে অপ্রাপ্য (Currently unavailable)';
      }
    });
  }

  // ============ 20: card count badge — কার্টে থাকা সংখ্যা কার্ডের উপরে ============
  function updateCardBadges(){
    var cart = window.cart || [];
    // count by product name prefix (before " — ")
    var counts = {};
    cart.forEach(function(it){
      var base = String(it.name || '').split(' — ')[0].trim();
      counts[base] = (counts[base] || 0) + Number(it.qty || 0);
    });
    var prods = window.products || [];
    document.querySelectorAll('.product-card').forEach(function(card, idx){
      var p = prods[idx];
      if (!p) return;
      var name = p.t || p.name || '';
      var c = counts[name] || 0;
      var badge = card.querySelector('.dm-card-count-badge');
      if (c > 0){
        if (!badge){
          badge = document.createElement('div');
          badge.className = 'dm-card-count-badge';
          card.appendChild(badge);
        }
        badge.textContent = c;
      } else if (badge){
        badge.remove();
      }
    });
  }

  // Hook renderCart to also update badges + checkout totals
  var origRenderCart = window.renderCart;
  window.renderCart = function(){
    if (typeof origRenderCart === 'function') origRenderCart.apply(this, arguments);
    try { updateCardBadges(); } catch(e){}
    try { window.__recomputeCheckoutTotals(); } catch(e){}
  };

  // ============ 8: সাইনআপ বাধ্যতামূলক — Add-to-cart ও checkout এ ============
  var origAddToCart = window.addToCart;
  window.addToCart = function(){
    if (!window.currentUser || !window.__getAuthToken || !window.__getAuthToken()){
      alert('কাপড় অর্ডার করতে হলে অনুগ্রহ করে সাইন আপ / লগইন করুন (Please sign up / login first to add items).');
      if (typeof window.openAccountModal === 'function') window.window.location.href='account.html';
      return;
    }
    return origAddToCart.apply(this, arguments);
  };

  // ============ 17: My Orders — বিস্তারিত ============
  function orderItemsHtml(items){
    if (!items || !items.length) return '<em>কোনো আইটেম নেই</em>';
    var rows = items.map(function(it){
      return '<tr><td>'+ (it.name || '-') +'</td><td style="text-align:center">×'+ (it.qty||1) +'</td><td style="text-align:right">৳'+ ((Number(it.price||0))*Number(it.qty||1)).toLocaleString() +'</td></tr>';
    }).join('');
    return '<table>' + rows + '</table>';
  }
  window.renderOrdersList = function(arr){
    var list = document.getElementById('ordersList');
    if (!list) return;
    if (!arr || arr.length === 0){
      list.innerHTML = '<div class="order-empty"><i class="fas fa-box-open"></i>এখনো কোনো অর্ডার করা হয়নি।</div>';
      return;
    }
    list.innerHTML = arr.map(function(o, i){
      var isDone = /deliver|complete|সম্পন্ন|ডেলিভারি/i.test(o.status||'');
      var when = o.date ? o.date : (o.createdAt ? new Date(o.createdAt).toLocaleDateString('bn-BD') : new Date().toLocaleDateString('bn-BD'));
      var total = Number(o.total||0).toLocaleString();
      var sub = Number(o.subtotal || o.total || 0).toLocaleString();
      var del = (o.deliveryCharge != null) ? Number(o.deliveryCharge).toLocaleString() : '0';
      var disc = (o.discount != null) ? Number(o.discount).toLocaleString() : '0';
      return '<div class="order-card" onclick="this.classList.toggle(\'open\')">'
        + '<div class="order-card-top">'
        +   '<span class="order-id"><i class="fas fa-hashtag" style="color:var(--green);margin-right:4px"></i>'+o.id+'</span>'
        +   '<span class="order-pill'+(isDone?" done":"")+'">'+(o.status||"Pending")+'</span>'
        + '</div>'
        + '<div class="order-total">৳ '+total+'</div>'
        + '<div class="order-meta"><i class="far fa-clock"></i> '+when+(o.time?(" , "+o.time):"")+' • '+(o.method||"COD")+' <span style="color:#77612A;margin-left:8px">▾ বিস্তারিত</span></div>'
        + '<div class="order-details">'
        +   '<b>আইটেম:</b>' + orderItemsHtml(o.items)
        +   '<table style="margin-top:8px">'
        +     '<tr><td>সাব-টোটাল</td><td style="text-align:right">৳'+ sub +'</td></tr>'
        +     (Number(disc)>0 ? '<tr><td style="color:#CA9100">Top Friend ছাড় ('+(o.discountPercent||0)+'%)</td><td style="text-align:right;color:#CA9100">−৳'+ disc +'</td></tr>' : '')
        +     '<tr><td>ডেলিভারি চার্জ</td><td style="text-align:right">৳'+ del +'</td></tr>'
        +     '<tr class="order-total-row"><td>সর্বমোট</td><td style="text-align:right">৳'+ total +'</td></tr>'
        +   '</table>'
        +   (o.customerName ? '<div style="margin-top:8px"><b>গ্রাহক:</b> '+o.customerName+' • '+ (o.customerMobile||'') +'</div>' : '')
        +   (o.customerAddress ? '<div><b>ঠিকানা:</b> '+o.customerAddress+'</div>' : '')
        +   (o.txn ? '<div><b>TXN ID:</b> '+o.txn+'</div>' : '')
        + '</div>'
        + '</div>';
    }).join('');
  };

  // Local order fallback (server-এ সাথে থাকলে সেটি প্রায়োরিটি পাবে)
  var LOCAL_ORDERS_KEY = 'dm_local_orders_v1';
  window.__recordUserOrder = function(order){
    try {
      var uk = tfGetUserKey();
      var all = JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY) || '{}');
      all[uk] = all[uk] || [];
      all[uk].unshift(order);
      localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(all));
    } catch(e){}
    window.__tfBumpOrderCount();
  };
  window.__getLocalOrders = function(){
    try {
      var uk = tfGetUserKey();
      var all = JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY) || '{}');
      return all[uk] || [];
    } catch(e){ return []; }
  };

  // openOrdersModal — merge server + local
  var origOpenOrdersModal = window.openOrdersModal;
  window.openOrdersModal = function(){
    var list = document.getElementById('ordersList');
    if (typeof window.closeSidebar==='function') window.closeSidebar();
    if (typeof window.closeAllModals==='function') window.closeAllModals();
    document.getElementById('ordersModalOverlay').classList.add('open');

    var localOrders = window.__getLocalOrders();
    if (!window.currentUser || !window.__getAuthToken()){
      window.renderOrdersList(localOrders);
      return;
    }
    if (list) list.innerHTML = '<div class="order-empty"><i class="fas fa-spinner fa-spin"></i>অর্ডার লোড হচ্ছে...</div>';
    fetch(window.API_BASE + '/api/my-orders', {
      headers: { 'Authorization':'Bearer ' + window.__getAuthToken() }, cache:'no-store'
    })
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(arr){
      var merged = (Array.isArray(arr) ? arr : []).concat(localOrders);
      // dedupe by id
      var seen = {};
      merged = merged.filter(function(o){ if (seen[o.id]) return false; seen[o.id]=1; return true; });
      window.renderOrdersList(merged);
    })
    .catch(function(){
      window.renderOrdersList(localOrders);
    });
  };

  // ============ 9: Forgot Password — Gmail OTP flow ============
  // Login modal-এ "পাসওয়ার্ড ভুলে গেছেন?" লিঙ্ক ইনজেক্ট
  function injectForgotLink(){
    if (document.getElementById('dmForgotLink')) return;
    var passField = document.getElementById('accPass');
    if (!passField) return;
    var wrap = passField.closest('.form-field');
    if (!wrap) return;
    var a = document.createElement('a');
    a.id = 'dmForgotLink';
    a.className = 'dm-forgot-link';
    a.href = '#';
    a.innerHTML = '<i class="fas fa-key"></i> পাসওয়ার্ড ভুলে গেছেন? (Forgot password)';
    a.onclick = function(e){ e.preventDefault(); openForgotFlow(); };
    wrap.appendChild(a);
  }

  function openForgotFlow(){
    var email = prompt('আপনার নিবন্ধিত ইমেইল (Registered email / Gmail) দিন:');
    if (!email) return;
    // Send OTP request
    fetch(window.API_BASE + '/api/auth/forgot-password', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: email })
    }).then(function(r){
      if (!r.ok) throw new Error('failed');
      return r.json();
    }).then(function(){
      alert('আপনার ইমেইলে OTP পাঠানো হয়েছে (OTP sent to your email)।');
      var otp = prompt('ইমেইল-এ পাওয়া ৬-ডিজিট OTP দিন:');
      if (!otp) return;
      var np = prompt('নতুন পাসওয়ার্ড (New password) দিন:');
      if (!np) return;
      fetch(window.API_BASE + '/api/auth/reset-password', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email: email, otp: otp, newPassword: np })
      }).then(function(r){
        if (!r.ok) throw new Error('failed');
        alert('পাসওয়ার্ড রিসেট সফল (Password reset successful)। এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন।');
      }).catch(function(){
        alert('পাসওয়ার্ড রিসেট ব্যর্থ (Reset failed) — OTP ভুল অথবা মেয়াদ শেষ।');
      });
    }).catch(function(){
      alert('OTP পাঠানো যায়নি (Could not send OTP)। ইমেইল ঠিকানা যাচাই করুন।');
    });
  }

  // ============ Top Friend badge — sidebar header ============
  function injectTopFriendBadge(){
    if (!window.__tfIsTopFriend()) return;
    var host = document.querySelector('.sidebar-user .user-text') || document.getElementById('accViewName');
    if (host && !host.querySelector('.top-friend-badge')){
      var b = document.createElement('span');
      b.className = 'top-friend-badge';
      b.innerHTML = '<i class="fas fa-crown"></i> Top Friend';
      host.appendChild(b);
    }
  }

  // ============ Init ============
  function init(){
    bindOverlayCloseOnOutsideClick();
    bindMobileBottomNav();
    disableEmptyCards();
    updateCardBadges();
    injectForgotLink();
    injectTopFriendBadge();
    try { window.__recomputeCheckoutTotals(); } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // Re-run after products render
  setTimeout(init, 800);
  setTimeout(init, 2000);
})();
