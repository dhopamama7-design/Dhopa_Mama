(function(){
  var API = window.API_BASE;

  /* Checkout → POST /api/orders (লগইন থাকলে অর্ডার ইউজারের সাথে যুক্ত হয়) */
  var _origSubmit = window.submitCheckout;
  window.submitCheckout = function(){
    if (typeof _origSubmit === 'function') _origSubmit();
    try {
      if (window.orders && window.orders.length){
        var o = Object.assign({}, window.orders[window.orders.length - 1]);
        o.customerName    = (document.getElementById('chkName')||{}).value || '';
        o.customerMobile  = (document.getElementById('chkMobile')||{}).value || '';
        o.customerAddress = (document.getElementById('chkAddress')||{}).value || '';
        o.txn             = (document.getElementById('chkTxn')||{}).value || '';
        if (typeof currentUser !== 'undefined' && currentUser){
          o.userContact = currentUser.contact;
        }
        var headers = { 'Content-Type':'application/json' };
        var t = (typeof window.__getAuthToken === 'function') ? window.__getAuthToken() : '';
        if (t) headers['Authorization'] = 'Bearer ' + t;
        fetch(API + '/api/orders', {
          method:'POST',
          headers: headers,
          body: JSON.stringify(o)
        }).catch(function(){});
      }
    } catch(e){ console.warn('order post failed', e); }
  };
})();

/* পেজ লোডে সংরক্ষিত সেশন থাকলে UI আপডেট করি (স্থায়ী লগইন) */
document.addEventListener('DOMContentLoaded', function(){
  try { if (typeof refreshAccountUI === 'function') refreshAccountUI(); } catch(e){}
});
