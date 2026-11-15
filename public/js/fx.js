// ============================================================
//  MBZ::CH4TB0T NEXUS v4.2 — fx.js  ·  CYBERPUNK OVERDRIVE II
//  Cena de fundo (grade neon em perspectiva + chuva de dados + partículas),
//  boot screen, glitch periódico, "decode" de títulos, HUD, sons WebAudio
//  (sintetizados, sem arquivos) com mute, e nível de FX (full/lite).
//  Respeita prefers-reduced-motion e pausa tudo com a aba oculta.
// ============================================================
'use strict';

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LS = { sfx: 'nexus_sfx', fx: 'nexus_fx', boot: 'nexus_booted' };
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } }

/* ------------------------------------------------------------------ nível de FX */
let fxLevel = reduceMotion ? 'lite' : lsGet(LS.fx, 'full');
export function getFxLevel() { return fxLevel; }
export function setFxLevel(level) {
  fxLevel = level === 'lite' ? 'lite' : 'full';
  lsSet(LS.fx, fxLevel);
  document.documentElement.setAttribute('data-fx', fxLevel);
  const b = document.getElementById('fxBtn');
  if (b) { b.textContent = fxLevel === 'full' ? 'FX ▮▮▮' : 'FX ▮▯▯'; b.title = fxLevel === 'full' ? 'efeitos: total (clique pra reduzir)' : 'efeitos: reduzidos (clique pra total)'; }
}

/* ------------------------------------------------------------------ SFX (WebAudio) */
let actx = null, master = null, sfxOn = lsGet(LS.sfx, '1') === '1';
function ensureAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume().catch(function () {}); return true; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    actx = new AC(); master = actx.createGain(); master.gain.value = 0.18; master.connect(actx.destination);
    return true;
  } catch (e) { return false; }
}
function tone(freq, dur, type, gain, when, slideTo) {
  if (!sfxOn || !ensureAudio()) return;
  const t0 = actx.currentTime + (when || 0);
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain || 0.5, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, gain, when) {
  if (!sfxOn || !ensureAudio()) return;
  const t0 = actx.currentTime + (when || 0), n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 2200; s.buffer = buf; g.gain.value = gain || 0.3;
  s.connect(f); f.connect(g); g.connect(master); s.start(t0);
}
export const sfx = {
  click: function () { tone(1400, 0.035, 'square', 0.25); },
  hover: function () { tone(2600, 0.012, 'sine', 0.06); },
  tick: function () { tone(900, 0.02, 'triangle', 0.12); },
  blip: function () { tone(880, 0.08, 'sine', 0.35, 0, 1760); },
  done: function () { tone(523, 0.14, 'sine', 0.35); tone(659, 0.14, 'sine', 0.35, 0.09); tone(784, 0.22, 'sine', 0.4, 0.18); tone(1046, 0.3, 'sine', 0.3, 0.27); },
  error: function () { tone(220, 0.18, 'sawtooth', 0.35, 0, 110); noise(0.12, 0.2, 0.05); },
  boot: function () { noise(0.25, 0.15); tone(110, 0.5, 'sawtooth', 0.12, 0, 440); tone(1760, 0.06, 'square', 0.15, 0.45); },
  type: function () { tone(3000 + Math.random() * 800, 0.008, 'square', 0.05); },
  warn: function () { tone(660, 0.07, 'square', 0.25); tone(660, 0.07, 'square', 0.25, 0.11); }
};
export function isSfxOn() { return sfxOn; }
export function setSfx(on) {
  sfxOn = !!on; lsSet(LS.sfx, sfxOn ? '1' : '0');
  const b = document.getElementById('sfxBtn');
  if (b) { b.textContent = sfxOn ? '🔊' : '🔇'; b.title = sfxOn ? 'sons ligados (clique pra mutar)' : 'sons mutados (clique pra ligar)'; b.classList.toggle('muted', !sfxOn); }
  if (sfxOn) sfx.click();
}

/* ------------------------------------------------------------------ cena de fundo */
export function initFX() {
  const c = document.getElementById('fx');
  if (!c) return;
  const x = c.getContext('2d');
  let W = 0, H = 0, t = 0;
  const pts = [], drops = [];
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  function rs() {
    W = innerWidth; H = innerHeight;
    c.width = Math.floor(W * DPR); c.height = Math.floor(H * DPR);
    c.style.width = W + 'px'; c.style.height = H + 'px';
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    drops.length = 0;
    const cols = Math.floor(W / 26);
    for (let i = 0; i < cols; i++) if (Math.random() < 0.35) drops.push({ col: i, y: Math.random() * H, v: 40 + Math.random() * 90, len: 6 + Math.floor(Math.random() * 14) });
  }
  rs(); addEventListener('resize', rs);
  for (let i = 0; i < 70; i++) pts.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: 0.8 + Math.random() * 1.2 });

  const GLYPHS = '01アイウエオカキクケコ∆◊∑λΩ<>/{}[]#$%&*+=';
  function grid(dt) {
    // chão neon em perspectiva (synthwave) — ocupa o terço inferior
    const horizon = H * 0.62, depth = H - horizon;
    const g = x.createLinearGradient(0, horizon - 120, 0, horizon + 40);
    g.addColorStop(0, 'rgba(255,45,120,0)'); g.addColorStop(0.7, 'rgba(255,45,120,.10)'); g.addColorStop(1, 'rgba(0,245,255,.05)');
    x.fillStyle = g; x.fillRect(0, horizon - 120, W, 160);
    x.lineWidth = 1;
    // linhas horizontais que "vêm" na direção do observador
    const n = 14, speed = (t * 0.00035) % 1;
    for (let i = 0; i <= n; i++) {
      let p = (i / n + speed) % 1; const yy = horizon + Math.pow(p, 2.2) * depth;
      const a = 0.04 + p * 0.22;
      x.strokeStyle = 'rgba(0,245,255,' + a.toFixed(3) + ')';
      x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke();
    }
    // linhas verticais convergindo pro ponto de fuga
    const vx = W / 2, cols = 18;
    for (let i = -cols; i <= cols; i++) {
      const xb = vx + i * (W / cols) * 1.4;
      x.strokeStyle = 'rgba(255,45,120,' + (0.05 + 0.10 * (1 - Math.abs(i) / cols)).toFixed(3) + ')';
      x.beginPath(); x.moveTo(vx + (xb - vx) * 0.04, horizon); x.lineTo(xb, H); x.stroke();
    }
    // sol de linhas no horizonte
    const sr = Math.min(W, H) * 0.16, sx = W * 0.82, sy = horizon - sr * 0.35;
    const sg = x.createRadialGradient(sx, sy, 0, sx, sy, sr * 1.8);
    sg.addColorStop(0, 'rgba(255,45,120,.18)'); sg.addColorStop(1, 'rgba(255,45,120,0)');
    x.fillStyle = sg; x.fillRect(sx - sr * 2, sy - sr * 2, sr * 4, sr * 4);
    x.save(); x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.clip();
    x.fillStyle = 'rgba(255,45,120,.12)'; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    x.fillStyle = 'rgba(5,6,12,.9)';
    for (let i = 0; i < 7; i++) { const yy = sy - sr * 0.1 + i * sr * 0.16 + (t * 0.01 % (sr * 0.16)); x.fillRect(sx - sr, yy, sr * 2, 2 + i * 0.6); }
    x.restore();
  }
  function rain(dt) {
    x.font = '12px "Share Tech Mono", monospace'; x.textBaseline = 'top';
    for (const d of drops) {
      d.y += d.v * dt;
      if (d.y - d.len * 14 > H) { d.y = -Math.random() * 300; d.v = 40 + Math.random() * 90; }
      const xx = d.col * 26 + 6;
      for (let k = 0; k < d.len; k++) {
        const yy = d.y - k * 14; if (yy < -14 || yy > H) continue;
        const a = (1 - k / d.len) * 0.28;
        x.fillStyle = k === 0 ? 'rgba(255,255,255,' + (a + 0.25) + ')' : 'rgba(0,245,255,' + a.toFixed(3) + ')';
        x.fillText(GLYPHS[(d.col * 7 + k * 3 + Math.floor(t / 90)) % GLYPHS.length], xx, yy);
      }
    }
  }
  function particles(move) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (move) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      x.fillStyle = 'rgba(0,245,255,.55)'; x.fillRect(p.x, p.y, p.r, p.r);
      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j], d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < 110) { x.strokeStyle = 'rgba(0,245,255,' + (0.10 * (1 - d / 110)).toFixed(3) + ')'; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke(); }
      }
    }
  }
  let last = performance.now();
  function draw(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t = now;
    x.clearRect(0, 0, W, H);
    if (fxLevel === 'full') { grid(dt); rain(dt); }
    particles(!reduceMotion);
  }
  if (reduceMotion) { draw(performance.now()); addEventListener('resize', function () { draw(performance.now()); }); return; }
  let raf = 0, running = false;
  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }
  function play() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); } }
  function pause() { if (running) { running = false; cancelAnimationFrame(raf); } }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else play(); });
  if (!document.hidden) play();
}

/* ------------------------------------------------------------------ relógio */
export function startClock() {
  const e = document.getElementById('clock');
  if (!e) return;
  function tick() { e.textContent = new Date().toTimeString().slice(0, 8); }
  tick(); setInterval(tick, 1000);
}

/* ------------------------------------------------------------------ decode / scramble de texto */
const SCRAMBLE = '!<>-_\\/[]{}—=+*^?#________';
export function decode(el, finalText, ms) {
  if (!el) return;
  const target = finalText != null ? finalText : (el.getAttribute('data-decode') || el.textContent);
  el.setAttribute('data-decode', target);
  if (reduceMotion || fxLevel !== 'full') { el.textContent = target; return; }
  const dur = ms || 520, start = performance.now(), len = target.length;
  (function frame(now) {
    const p = Math.min(1, (now - start) / dur); let out = '';
    for (let i = 0; i < len; i++) {
      const ch = target[i];
      if (ch === ' ' || i < p * len) out += ch;
      else out += SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(frame); else el.textContent = target;
  })(start);
}

/* ------------------------------------------------------------------ glitch periódico nos títulos */
function glitchLoop() {
  if (reduceMotion) return;
  const els = document.querySelectorAll('.glitch');
  if (els.length && fxLevel === 'full') {
    const el = els[Math.floor(Math.random() * els.length)];
    el.classList.add('glitching'); setTimeout(function () { el.classList.remove('glitching'); }, 260 + Math.random() * 300);
  }
  setTimeout(glitchLoop, 1800 + Math.random() * 4200);
}

/* ------------------------------------------------------------------ boot screen */
const BOOT_LINES = [
  'NEXUS KERNEL 4.2.0 ........................ OK',
  'MOUNT /data (persistent volume) ............ OK',
  'LOAD claude-fable-5-1 · opus-5-5 · sonnet-5-5  OK',
  'LINK wordpress REST · mirb-grid/v1 ......... OK',
  'LINK elevenlabs voice catalog (86) ......... OK',
  'ARM orchestrator · topological graph ....... OK',
  'ARM critic agent · rubric engine ........... OK',
  'SYNC photo cascade pexels→pixabay→unsplash . OK',
  'HUD online. welcome back, operator.'
];
export function bootScreen(done) {
  const boot = document.getElementById('boot');
  if (!boot || reduceMotion || fxLevel !== 'full' || sessionStorage.getItem(LS.boot)) { if (boot) boot.remove(); done && done(); return; }
  const log = boot.querySelector('.boot-log'), bar = boot.querySelector('.boot-bar i');
  let i = 0, finished = false;
  function finish() {
    if (finished) return; finished = true; sessionStorage.setItem(LS.boot, '1');
    boot.classList.add('boot-out'); setTimeout(function () { boot.remove(); done && done(); }, 420);
  }
  function next() {
    if (finished) return;
    if (i >= BOOT_LINES.length) { setTimeout(finish, 260); return; }
    const line = document.createElement('div'); line.className = 'boot-line'; line.textContent = '> ' + BOOT_LINES[i]; log.appendChild(line);
    bar.style.width = Math.round(((i + 1) / BOOT_LINES.length) * 100) + '%';
    sfx.tick(); i++;
    setTimeout(next, 90 + Math.random() * 120);
  }
  boot.addEventListener('click', finish); addEventListener('keydown', finish, { once: true });
  setTimeout(function () { sfx.boot(); next(); }, 180);
}

/* ------------------------------------------------------------------ wiring global */
export function initCyberpunk() {
  document.documentElement.setAttribute('data-fx', fxLevel);
  setFxLevel(fxLevel); setSfx(sfxOn);
  // sons delegados: clique em botão/aba/link, hover sutil em botões primários
  document.addEventListener('click', function (e) {
    const b = e.target.closest('button, .tab, .rail-node, .grid-cell, .sel-card, a');
    if (b && !b.classList.contains('no-sfx')) sfx.click();
  }, true);
  document.addEventListener('mouseover', function (e) {
    if (fxLevel !== 'full') return;
    const b = e.target.closest('.btn-primary, .tab, .mode-btn');
    if (b && b !== lastHover) { lastHover = b; sfx.hover(); }
  }, true);
  let lastHover = null;
  const sb = document.getElementById('sfxBtn'); if (sb) sb.addEventListener('click', function (e) { e.stopPropagation(); setSfx(!sfxOn); });
  const fb = document.getElementById('fxBtn'); if (fb) fb.addEventListener('click', function (e) { e.stopPropagation(); setFxLevel(fxLevel === 'full' ? 'lite' : 'full'); });
  // títulos de passo decodificam ao entrar
  document.addEventListener('nexus:step', function (e) {
    const st = document.querySelector('.step.active .step-title'); if (st) decode(st);
  });
  document.addEventListener('nexus:event', function (e) {
    const k = e.detail && e.detail.kind;
    if (k === 'block_done') sfx.blip(); else if (k === 'run_done') sfx.done(); else if (k === 'error') sfx.error(); else if (k === 'warn') sfx.warn();
  });
  glitchLoop();
}
export function emit(kind, detail) { document.dispatchEvent(new CustomEvent('nexus:event', { detail: Object.assign({ kind: kind }, detail || {}) })); }
