(function(){
  function toOrdersShape(o){
    var iso = (o.createdAt || new Date().toISOString()).slice(0,10);
    var d = new Date(iso);
    var display = d.toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});
    return {
      id: String(o.id).replace(/[^0-9]/g,'').slice(-8) || String(Date.now()).slice(-8),
      paymentDateISO: iso,
      paymentDateDisplay: display,
      status: 'processing',
      customer: { name:o.customerName, mobile:o.customerMobile, address:o.customerAddress },
      pickup: (o.date||'') + (o.time?' '+o.time:''),
      method: o.method,
      total: o.total,
      userContact: (function(){ try{var u=JSON.parse(localStorage.getItem('dmUser')||'null'); return u&&u.contact;}catch(e){return null;} })(),
      items: (o.items||[]).map(function(it){
        return {
          title: it.name||it.title||'Service',
          by: it.category||'Dhopa Mama',
          size: it.size||'-',
          qty: it.qty||1,
          price: Number(it.price||0),
          status: 'Delivered',
          deliveryDate: display,
          icon: '<svg viewBox="0 0 48 48" fill="none" stroke="#997D36" stroke-width="1.6"><rect x="10" y="12" width="28" height="26"/><path d="M16 12v-2a4 4 0 0 1 8 0v2"/></svg>'
        };
      })
    };
  }
  function saveOrder(o){
    try{
      var list = JSON.parse(localStorage.getItem('dmOrders')||'[]');
      list.unshift(toOrdersShape(o));
      localStorage.setItem('dmOrders', JSON.stringify(list));
    }catch(e){ console.warn(e); }
  }
  // Patch after DOMContentLoaded so original functions are defined
  document.addEventListener('DOMContentLoaded', function(){
    if(typeof window.openOrderSuccessModal === 'function'){
      var orig = window.openOrderSuccessModal;
      window.openOrderSuccessModal = function(order){
        try{ saveOrder(order); }catch(e){}
        return orig.apply(this, arguments);
      };
    }
  });
})();
