(function(){
  var lastY = window.pageYOffset || 0;
  var ticking = false;
  function update(){
    var y = window.pageYOffset || 0;
    var diff = y - lastY;
    lastY = y;
    document.querySelectorAll('.header, .mobile-header').forEach(function(h){
      if(diff > 4 && y > 70){
        h.style.transition = 'transform .3s ease';
        h.style.transform = 'translateY(-110%)';
      } else if(diff < -2 || y <= 70){
        h.style.transition = 'transform .3s ease';
        h.style.transform = 'translateY(0)';
      }
    });
    ticking = false;
  }
  window.addEventListener('scroll', function(){
    if(!ticking){ requestAnimationFrame(update); ticking=true; }
  }, {passive:true});
})();
