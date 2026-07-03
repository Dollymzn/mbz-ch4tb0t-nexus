// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — anim.js
//  Animações que exigem JS (side-effect module; importado por main.js).
//  NÃO altera a lógica dos outros módulos — apenas observa o DOM que
//  eles já manipulam e adiciona camadas visuais:
//    1. Sequência de boot cinematográfica do gate (terminal + reveal)
//    2. Shake + flash no erro de senha
//    3. Ripple de energia nos botões
//    4. View Transitions API nas tabs (com feature-detect + fallback CSS)
//  Tudo respeita prefers-reduced-motion.
// ============================================================
'use strict';

const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------- init ---------- */
function ready(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

ready(function () {
  setupGateBoot();
  setupGateErrorShake();
  setupRipples();
  setupTabTransitions();
});

/* ============================================================
   1) GATE — boot sequence
   O gate começa com a classe .hidden; main.js a remove em showGate().
   Observamos essa transição e, quando o gate aparece pela 1ª vez,
   rodamos o boot: digitamos 3 linhas de terminal e revelamos o form.
   Progressive enhancement: se este módulo não rodar, o form já é
   utilizável (o estado .booting nunca é aplicado).
   ============================================================ */
const BOOT_LINES = [
  '> INITIALIZING NEXUS CORE<span class="ok">...</span>',
  '> LOADING NEURAL MODULES <span class="ok">[OK]</span>',
  '> ESTABLISHING SECURE UPLINK<span class="ok">...</span>'
];

function setupGateBoot() {
  const gate = document.getElementById('gate');
  if (!gate) return;
  const box = gate.querySelector('.gate-box');
  if (!box) return;

  // container do terminal (injetado — index.html não precisa conhecê-lo)
  let boot = box.querySelector('.gate-boot');
  if (!boot) {
    boot = document.createElement('div');
    boot.className = 'gate-boot';
    boot.id = 'gateBoot';
    boot.setAttribute('aria-hidden', 'true');
    const glitch = box.querySelector('.gate-glitch');
    if (glitch && glitch.nextSibling) box.insertBefore(boot, glitch.nextSibling);
    else box.insertBefore(boot, box.firstChild);
  }

  let booted = false;
  function runBoot() {
    if (booted) return; booted = true;
    const pass = document.getElementById('gatePass');
    if (reduceMotion) { focusInput(pass); return; } // sem cinemática: apenas foca

    box.classList.add('booting');
    box.style.willChange = 'transform, filter';
    let skipped = false;
    const finish = function () {
      if (skipped) return; skipped = true;
      box.classList.remove('booting');
      box.style.willChange = '';
      gate.removeEventListener('click', onSkip, true);
      focusInput(pass);
    };
    const onSkip = function () { boot.innerHTML = ''; finish(); };
    gate.addEventListener('click', onSkip, true); // clicar pula o boot

    typeLines(boot, BOOT_LINES, function () {
      // pequena pausa antes de revelar o formulário
      setTimeout(finish, 240);
    });
  }

  function focusInput(pass) { if (pass) { try { pass.focus({ preventScroll: true }); } catch (e) { pass.focus(); } } }

  // se já estiver visível quando montarmos, roda já; senão, observa a revelação
  if (!gate.classList.contains('hidden')) runBoot();
  const obs = new MutationObserver(function () {
    if (!gate.classList.contains('hidden')) runBoot();
  });
  obs.observe(gate, { attributes: true, attributeFilter: ['class'] });
}

// digita várias linhas em sequência dentro de `host`
function typeLines(host, lines, done) {
  host.innerHTML = '';
  let li = 0;
  function nextLine() {
    if (li >= lines.length) { if (done) done(); return; }
    const line = document.createElement('div');
    line.className = 'boot-line';
    const caret = document.createElement('span');
    caret.className = 'boot-caret';
    caret.textContent = '▋';
    host.appendChild(line);
    typeHtml(line, lines[li], caret, function () {
      caret.remove();
      li++;
      setTimeout(nextLine, 90);
    });
  }
  nextLine();
}

// "digita" uma string que pode conter tags simples (<span class="ok">...</span>)
// revelando caractere a caractere do TEXTO visível; mantém o caret ao fim da linha.
function typeHtml(lineEl, html, caret, cb) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const full = tmp.textContent || '';
  // mapa: para cada tamanho de prefixo do texto, o HTML correspondente
  let i = 0;
  const speed = 16; // ms/char -> 3 linhas ~ < 1.6s
  function step() {
    i++;
    lineEl.innerHTML = slicePreserveTags(html, i);
    lineEl.appendChild(caret);
    if (i >= full.length) { if (cb) cb(); return; }
    setTimeout(step, speed);
  }
  step();
}

// retorna o HTML de `html` cujo texto visível tem no máximo `n` caracteres,
// preservando as tags que já foram totalmente abertas.
function slicePreserveTags(html, n) {
  let out = '', count = 0, i = 0;
  while (i < html.length && count < n) {
    if (html[i] === '<') {
      const close = html.indexOf('>', i);
      if (close < 0) break;
      out += html.slice(i, close + 1);
      i = close + 1;
    } else {
      out += html[i]; count++; i++;
    }
  }
  // fecha tags abertas que porventura ficaram sem par (simples: acrescenta </span> se preciso)
  const opens = (out.match(/<span/g) || []).length;
  const closes = (out.match(/<\/span>/g) || []).length;
  for (let k = 0; k < opens - closes; k++) out += '</span>';
  return out;
}

/* ============================================================
   2) GATE — shake + flash no erro de senha
   main.js escreve em #gateErr.textContent quando a senha falha.
   Observamos essa escrita e disparamos o feedback sem tocar no main.
   ============================================================ */
function setupGateErrorShake() {
  const err = document.getElementById('gateErr');
  const box = document.querySelector('.gate-box');
  if (!err || !box) return;
  let t = null;
  const obs = new MutationObserver(function () {
    if (!(err.textContent || '').trim()) return;
    box.classList.remove('shake');
    void box.offsetWidth; // reflow p/ reiniciar a animação
    if (!reduceMotion) box.classList.add('shake');
    clearTimeout(t);
    t = setTimeout(function () { box.classList.remove('shake'); }, 600);
  });
  obs.observe(err, { childList: true, characterData: true, subtree: true });
}

/* ============================================================
   3) RIPPLE de botões
   ============================================================ */
const RIPPLE_SEL = '.btn-primary,.btn-forge,.btn-ghost,.btn-ghost-sm,.mini-btn,.stepper-ctrl button,.dim-ctrl button,.tab,.mode-btn';

function setupRipples() {
  if (reduceMotion) return;
  document.addEventListener('pointerdown', function (e) {
    const btn = e.target.closest(RIPPLE_SEL);
    if (!btn || btn.disabled) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size / 2) + 'px';
    span.style.top = (e.clientY - rect.top - size / 2) + 'px';
    // garante recorte do ripple dentro do botão
    const cs = getComputedStyle(btn);
    if (cs.position === 'static') btn.style.position = 'relative';
    if (cs.overflow === 'visible') btn.style.overflow = 'hidden';
    btn.appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); }, { once: true });
    setTimeout(function () { if (span.isConnected) span.remove(); }, 900);
  }, { passive: true });
}

/* ============================================================
   4) TABS — View Transitions API (feature-detect) + fallback CSS
   main.js já tem o onclick que troca as views. Interceptamos o clique
   em fase de captura e, se startViewTransition existir, re-disparamos o
   clique DENTRO da transição (guard de reentrância) para que a troca de
   DOM feita pelo main.js aconteça capturada pela View Transition.
   Sem suporte (ou reduced-motion): não fazemos nada e o crossfade CSS
   de .view assume.
   ============================================================ */
function setupTabTransitions() {
  const supported = typeof document.startViewTransition === 'function';
  if (!supported || reduceMotion) return; // fallback: animação CSS .view:not(.hidden)

  let bypass = false;
  document.addEventListener('click', function (e) {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    if (bypass) return;            // clique re-disparado por nós: deixa o main.js rodar
    e.preventDefault();
    e.stopImmediatePropagation();  // impede o handler do main.js NESTE evento
    document.startViewTransition(function () {
      bypass = true;
      tab.click();                 // dispara de novo -> agora passa reto -> main.js troca o DOM aqui dentro
      bypass = false;
    });
  }, true); // capture
}
