(function(){
  function _getUser(){
    try{
      var raw = localStorage.getItem('dmUser') || localStorage.getItem('dm_user');
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return null;
  }
  window.isLoggedIn = function(){ return !!_getUser(); };
  window.getCurrentUser = _getUser;
  function requireLogin(){
    try{ localStorage.setItem('dmRedirectAfterLogin', location.href); }catch(e){}
    alert('অর্ডার করার জন্য প্রথমে Login করুন।');
    window.location.href='account.html';
  }
  window.dmRequireLogin = requireLogin;
  // Replace all legacy modal openers with page navigation
  window.openAccountModal = function(){ window.location.href='account.html'; };
  window.closeAccountModal = function(){};
  window.openOrdersModal = function(){
    if(!window.isLoggedIn()){ requireLogin(); return; }
    window.location.href='orders.html';
  };
  window.closeOrdersModal = function(){};

  // Update Login label if logged in
  function paintAuth(){
    var u = _getUser(); if(!u) return;
    var name = (u.name||u.mobile||u.email||'Account').split(/[@\s]/)[0];
    ['dmAcctLabel','dmAcctLabelMb'].forEach(function(id){var e=document.getElementById(id);if(e) e.textContent=name;});
    // Header sign in in index-like nav
    document.querySelectorAll('#headerSignInBtn span, .sidebar-user-sign').forEach(function(el){
      if(el.tagName==='SPAN') el.textContent = name;
    });
  }
  document.addEventListener('DOMContentLoaded', paintAuth);

  // Guard order/checkout actions site-wide
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-require-login], .btn-checkout, [onclick*="submitOrder"], [onclick*="placeOrder"], [onclick*="confirmOrder"], [onclick*="openCheckout"]');
    if(!t) return;
    if(window.isLoggedIn()) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    requireLogin();
  }, true);
})();
