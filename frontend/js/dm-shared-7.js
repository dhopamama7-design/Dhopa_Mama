(function(){
  var slider = document.getElementById('heroMainSlider');
  if(!slider) return;
  var slides = slider.querySelectorAll('.hero-slide');
  var dots = slider.querySelectorAll('.hero-slide-dots span');
  var i = 0, timer = null;
  function show(n){
    slides.forEach(function(el,idx){ el.classList.toggle('active', idx===n); });
    dots.forEach(function(el,idx){ el.classList.toggle('active', idx===n); });
  }
  function next(){ i = (i+1) % slides.length; show(i); }
  function start(){ if(!timer) timer = setInterval(next, 3500); }
  function stop(){ if(timer){ clearInterval(timer); timer=null; } }
  function check(){
    if(window.matchMedia('(max-width:720px)').matches){ start(); }
    else{ stop(); i=0; show(0); }
  }
  check();
  window.addEventListener('resize', check);
})();
