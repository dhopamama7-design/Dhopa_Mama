(function(){
  var overlay = document.getElementById('page-transition-overlay');
  if(!overlay) return;
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href]');
    if(!a) return;
    var href = a.getAttribute('href');
    if(!href || href.startsWith('#') || href.startsWith('javascript') ||
       a.target === '_blank' || href.startsWith('http') || href.startsWith('//')) return;
    var onclick = a.getAttribute('onclick') || '';
    if(onclick.indexOf('return false') !== -1) return;
    e.preventDefault();
    overlay.classList.add('active');
    setTimeout(function(){ window.location.href = href; }, 230);
  }, true);
})();
