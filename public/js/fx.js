// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — fx.js
//  Partículas de fundo + relógio.
//  Melhorias v3: pausa o rAF com document.hidden e respeita
//  prefers-reduced-motion (não anima nesse caso).
// ============================================================
'use strict';

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initFX() {
  const c = document.getElementById('fx');
  if (!c) return;
  const x = c.getContext('2d');
  let W = 0, H = 0;
  const pts = [];

  function rs() { W = c.width = innerWidth; H = c.height = innerHeight; }
  rs();
  addEventListener('resize', rs);

  for (let i = 0; i < 60; i++) {
    pts.push({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3
    });
  }

  // desenha um quadro (estático se reduceMotion)
  function draw(move) {
    x.clearRect(0, 0, W, H);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (move) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      x.fillStyle = 'rgba(0,245,255,.5)';
      x.fillRect(p.x, p.y, 1.4, 1.4);
      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j], d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < 120) {
          x.strokeStyle = 'rgba(0,245,255,' + (0.12 * (1 - d / 120)) + ')';
          x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke();
        }
      }
    }
  }

  // prefers-reduced-motion: pinta uma vez e para
  if (reduceMotion) { draw(false); addEventListener('resize', function () { draw(false); }); return; }

  let raf = 0, running = false;
  function loop() { draw(true); raf = requestAnimationFrame(loop); }
  function play() { if (!running) { running = true; loop(); } }
  function pause() { if (running) { running = false; cancelAnimationFrame(raf); } }

  // pausa quando a aba não está visível (economia de CPU/bateria)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause(); else play();
  });
  if (!document.hidden) play();
}

export function startClock() {
  const e = document.getElementById('clock');
  if (!e) return;
  function tick() { e.textContent = new Date().toTimeString().slice(0, 8); }
  tick();
  // o relógio é barato; um setInterval simples basta e não precisa pausar
  setInterval(tick, 1000);
}
