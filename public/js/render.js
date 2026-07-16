// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — render.js
//  Cards de saída com STREAMING:
//   block_delta -> append em text node (efeito digitação, <pre> cru)
//   block_done  -> SUBSTITUI o preview pelo payload pós-processado
//  + warnings, botão regenerar por card, marcação "desatualizado"
//    (dependentes) e "interrompido" (queda de conexão), preview de
//    chat estilo Messenger para onboard/sequence.
//  Contrato: docs/ARCHITECTURE-V3.md §2, §3, §5.
// ============================================================
'use strict';

import { state, esc, safeParse, toast, setResult, mergeArtifacts } from './state.js';
import { runStream } from './api.js';

/* ---------- catálogo de blocos (kind = como renderizar/exportar) ---------- */
export const BLOCKS = [
  { id: 'page_name',       name: 'Nome de Página',    hint: 'sugestão FB',       kind: 'text',          def: true },
  { id: 'fb_images',       name: 'Página FB Completa', hint: 'fotos + bio + post', kind: 'text',         def: false },
  { id: 'onboard',         name: 'Onboard',           hint: 'JSON chatbot',      kind: 'json-download', def: true },
  { id: 'sequence',        name: 'Sequência',         hint: 'JSON chatbot',      kind: 'json-download', def: true },
  { id: 'comment',         name: 'Comentários',       hint: 'captação orgânica', kind: 'json-download', def: false },
  { id: 'grid',            name: 'Grid MIRB',         hint: 'JSON importável',   kind: 'json-download', def: true },
  { id: 'p1_titles',       name: 'Títulos P1',        hint: 'texto',             kind: 'text',          def: true },
  { id: 'p2_titles',       name: 'Títulos P2',        hint: 'texto',             kind: 'text',          def: true },
  { id: 'quiz',            name: 'Quiz Overlays',     hint: 'texto',             kind: 'text',          def: true },
  { id: 'meta_copy',       name: 'Copy Meta',         hint: 'texto',             kind: 'text',          def: true },
  { id: 'meta_onboard',    name: 'Onboard Meta',      hint: 'texto',             kind: 'text',          def: true },
  { id: 'image_prompts',   name: 'Prompts de Imagem', hint: 'fluxo',             kind: 'text',          def: false, needsToggle: 'imagePrompts' },
  { id: 'creatives_prompt',name: 'Criativos',         hint: 'prompts',           kind: 'text',          def: false, needsToggle: 'wantCreatives' },
  { id: 'audios',          name: 'Áudios v3',         hint: 'ElevenLabs',        kind: 'text',          def: false, needsToggle: 'wantAudios' }
];
export const BLABEL = {};
BLOCKS.forEach(function (b) { BLABEL[b.id] = b.name; });
BLABEL.grid_preview = 'Grid · Prévia visual';
BLABEL.optimize = 'Resultado Otimizado';
BLABEL.review = 'Revisão do Agente';
BLABEL.creative_analysis = 'Análise de Criativos';

// dependentes: quando a CHAVE é regenerada, os VALORES ficam "desatualizados"
const DEPENDENTS = {
  grid_preview: ['grid'],
  onboard: ['image_prompts'],
  sequence: ['image_prompts'],
  creatives_prompt: ['audios']
};
// de quem cada card depende (mensagem de "desatualizado")
const DEP_OF = {
  grid: 'grid_preview',
  image_prompts: 'onboard/sequência',
  audios: 'criativos'
};

function kindOf(b) {
  if (b === 'grid' || b === 'optimize') return 'json-download';
  const m = BLOCKS.filter(function (x) { return x.id === b; })[0];
  return m ? m.kind : 'text';
}
function hasChat(b) { return b === 'onboard' || b === 'sequence'; }

// defesa em profundidade contra XSS via URL vinda de conteúdo do modelo:
// só aceita http:/https:; qualquer outro esquema (javascript:, data:, etc.)
// ou string inválida vira '' (o chamador deve renderizar sem <a> nesse caso).
function safeUrl(u) {
  if (!u) return '';
  const s = String(u).trim();
  try {
    const parsed = new URL(s);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? s : '';
  } catch (e) { return ''; }
}

/* ============================================================
   makeRunView(container, opts)
   Gerencia os cards de UMA área de saída. Reutilizável para o
   funil (#output), fotos FB (#fbPhotosOut) e otimizador (#optOutput).
   opts.onFinish(status) — chamado ao fim de cada run/regeneração.
   ============================================================ */
export function makeRunView(container, opts) {
  opts = opts || {};
  const cards = {};
  let controller = null, runDoneSeen = false, finished = false;
  const inFlight = {};

  /* ---------- criação / posicionamento de card ---------- */
  function ensureCard(block) {
    if (cards[block]) return cards[block];
    const card = buildCard(block);
    cards[block] = card;
    // grid_preview aparece antes do grid
    if (block === 'grid_preview' && cards.grid) {
      container.insertBefore(card.el, cards.grid.el);
    } else {
      container.appendChild(card.el);
    }
    return card;
  }

  function buildCard(block) {
    const label = BLABEL[block] || block;
    const kind = kindOf(block);
    const el = document.createElement('div');
    el.className = 'block-card';
    el.innerHTML =
      '<div class="block-head">' +
        '<span class="block-title">◢ ' + esc(label) + '<span class="attempt-badge hidden"></span></span>' +
        '<div class="block-actions">' +
          '<span class="block-status pending">aguardando</span>' +
          (hasChat(block) ? '<button class="mini-btn chat-toggle hidden" type="button">💬 chat</button>' : '') +
          (kind === 'json-download' ? '<button class="mini-btn dl hidden" type="button">⬇ baixar .json</button>' : '') +
          '<button class="mini-btn cp hidden" type="button">copiar</button>' +
          (block !== 'review' ? '<button class="mini-btn review hidden" type="button">🔎 Analisar</button>' : '') +
          '<button class="mini-btn regen hidden" type="button">🔁 regenerar</button>' +
        '</div>' +
      '</div>' +
      '<div class="card-strip warn hidden"></div>' +
      '<div class="card-strip review hidden"></div>' +
      '<div class="card-strip stale hidden"></div>' +
      '<div class="agent-review-panel hidden"></div>' +
      '<div class="block-body collapsed"></div>';

    const card = {
      block: block, el: el,
      headEl: el.querySelector('.block-head'),
      statusEl: el.querySelector('.block-status'),
      bodyEl: el.querySelector('.block-body'),
      attemptEl: el.querySelector('.attempt-badge'),
      warnEl: el.querySelector('.card-strip.warn'),
      reviewStripEl: el.querySelector('.card-strip.review'),
      reviewPanelEl: el.querySelector('.agent-review-panel'),
      staleEl: el.querySelector('.card-strip.stale'),
      regenBtn: el.querySelector('.regen'),
      cpBtn: el.querySelector('.cp'),
      dlBtn: el.querySelector('.dl'),
      chatBtn: el.querySelector('.chat-toggle'),
      reviewBtn: el.querySelector('.mini-btn.review'),
      preEl: null, json: null, raw: '', status: 'pending', mode: 'json'
    };

    card.headEl.addEventListener('click', function (e) {
      if (e.target.closest('.mini-btn')) return;
      card.bodyEl.classList.toggle('collapsed');
    });
    card.regenBtn.addEventListener('click', function (e) { e.stopPropagation(); regen(block); });
    card.cpBtn.addEventListener('click', function (e) { e.stopPropagation(); doCopy(card); });
    if (card.reviewBtn) card.reviewBtn.addEventListener('click', function (e) { e.stopPropagation(); analyzeCard(card); });
    if (card.dlBtn) card.dlBtn.addEventListener('click', function (e) { e.stopPropagation(); doDownload(card); });
    if (card.chatBtn) card.chatBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      card.mode = card.mode === 'chat' ? 'json' : 'chat';
      card.chatBtn.textContent = card.mode === 'chat' ? '🧾 JSON' : '💬 chat';
      renderCardBody(card);
    });
    return card;
  }

  /* ---------- estados visuais ---------- */
  function setStatus(card, st) {
    card.status = st;
    card.statusEl.className = 'block-status ' + st;
    card.statusEl.innerHTML =
      st === 'loading' ? '<span class="spinner"></span> gerando' :
      st === 'reviewing' ? '🔍 revisando' :
      st === 'done' ? '✓ pronto' :
      st === 'error' ? '✕ erro' :
      st === 'interrupted' ? '⛔ interrompido' :
      st === 'stale' ? '♻ desatualizado' : 'aguardando';
    if (st === 'loading' || st === 'done' || st === 'reviewing') card.bodyEl.classList.remove('collapsed');
  }
  function setAttempt(card, attempt) {
    const n = Number(attempt || 1);
    card.attempt = n;
    if (!card.attemptEl) return;
    if (n > 1) {
      card.attemptEl.textContent = 'v' + n;
      card.attemptEl.classList.remove('hidden');
    } else {
      card.attemptEl.textContent = '';
      card.attemptEl.classList.add('hidden');
    }
  }
  function freshPreview(card) {
    card.warnEl.classList.add('hidden'); card.warnEl.textContent = '';
    card.staleEl.classList.add('hidden'); card.staleEl.textContent = '';
    card.bodyEl.classList.remove('collapsed');
    card.bodyEl.innerHTML = '<pre class="stream-preview"></pre>';
    card.preEl = card.bodyEl.querySelector('.stream-preview');
  }
  function appendDelta(card, text) {
    if (!text) return;
    if (!card.preEl) freshPreview(card);
    card.preEl.appendChild(document.createTextNode(text)); // text node = escape nativo
    card.bodyEl.scrollTop = card.bodyEl.scrollHeight;
  }
  function revealActions(card) {
    card.cpBtn.classList.remove('hidden');
    card.regenBtn.classList.remove('hidden');
    if (card.reviewBtn) card.reviewBtn.classList.remove('hidden');
    if (card.dlBtn) card.dlBtn.classList.remove('hidden');
    if (card.chatBtn && card.json && Array.isArray((card.json || {}).routes)) card.chatBtn.classList.remove('hidden');
  }
  function showWarnings(card, warnings) {
    if (!warnings || !warnings.length) { card.warnEl.classList.add('hidden'); return; }
    card.warnEl.classList.remove('hidden');
    card.warnEl.innerHTML = '⚠ ' + warnings.map(function (w) { return esc(typeof w === 'string' ? w : (w.message || JSON.stringify(w))); }).join(' · ');
  }
  function markStale(card) {
    if (!card) return;
    card.preEl = null;
    setStatus(card, 'stale');
    card.staleEl.classList.remove('hidden');
    card.staleEl.innerHTML = '♻ desatualizado — a dependência (' + esc(DEP_OF[card.block] || '?') + ') foi regenerada. ' +
      '<button class="mini-btn stale-regen" type="button">regenerar agora</button>';
    const b = card.staleEl.querySelector('.stale-regen');
    if (b) b.addEventListener('click', function (e) { e.stopPropagation(); regen(card.block); });
    card.regenBtn.classList.remove('hidden');
  }
  function markInterrupted(card) {
    if (!card) return;
    card.preEl = null;
    setStatus(card, 'interrupted');
    card.staleEl.classList.remove('hidden');
    card.staleEl.innerHTML = '⛔ conexão caiu antes de concluir este bloco.';
    card.regenBtn.classList.remove('hidden');
  }
  function renderError(card, d) {
    card.preEl = null;
    setStatus(card, 'error');
    const dep = d && d.reason === 'dependency_failed';
    const msg = dep ? 'bloco pulado — uma dependência falhou.' : ((d && d.message) || 'falha ao gerar.');
    card.bodyEl.classList.remove('collapsed');
    card.bodyEl.innerHTML = '<pre>' + (dep ? '⚠ ' : 'ERRO: ') + esc(msg) + (d && d.code ? '  [' + esc(d.code) + ']' : '') + '</pre>';
    card.regenBtn.classList.remove('hidden');
  }
  function reviewClass(review) {
    const action = String((review && review.action) || '').toLowerCase();
    const verdict = String((review && review.veredito) || '').toLowerCase();
    if (action === 'accept' || verdict.indexOf('aprovar') >= 0) return 'accept';
    if (action === 'skipped') return 'skipped';
    return 'regenerate';
  }
  function renderReviewHtml(review, panel) {
    review = review || {};
    const score = review.score != null ? review.score : '?';
    let h = panel ? '<div class="clean-view review-panel-view">' : '';
    h += '<div class="review-score"><span class="tag">score ' + esc(score) + '/10</span>' +
      (review.veredito ? '<b>' + esc(review.veredito) + '</b>' : '') + '</div>';
    if (review.problemas && review.problemas.length) h += '<h4>Problemas</h4>' + ulist(review.problemas);
    if (review.sugestoes && review.sugestoes.length) h += '<h4>Sugestões</h4>' + ulist(review.sugestoes);
    if (review.direcao_de_correcao) h += '<h4>Direção</h4><p>' + esc(review.direcao_de_correcao) + '</p>';
    if (panel) h += '<button class="mini-btn apply-review" type="button">Aplicar sugestões</button></div>';
    return h;
  }
  function showReview(card, review, asPanel) {
    if (!card || !review) return;
    card.review = review;
    card.reviewStripEl.className = 'card-strip review ' + reviewClass(review);
    card.reviewStripEl.innerHTML = '🛡 score ' + esc(review.score != null ? review.score : '?') + '/10' +
      (review.veredito ? ' · ' + esc(review.veredito) : '') +
      (review.action ? ' · ' + esc(review.action) : '');
    card.reviewStripEl.classList.remove('hidden');
    if (!asPanel) return;
    card.reviewPanelEl.innerHTML = renderReviewHtml(review, true);
    card.reviewPanelEl.classList.remove('hidden');
    const btn = card.reviewPanelEl.querySelector('.apply-review');
    if (btn) btn.addEventListener('click', function (e) {
      e.stopPropagation();
      regen(card.block, {
        blocks: [card.block],
        params: Object.assign({}, state.params, { _agentFeedback: review }),
        artifacts: state.artifacts
      });
    });
  }

  /* ---------- block_done ---------- */
  function storeResult(d) {
    const data = { json: d.json, raw: d.raw, artifacts: d.artifacts, warnings: d.warnings, status: 'done' };
    if (d.review !== undefined) data.review = d.review;
    if (d.attempt !== undefined) data.attempt = d.attempt;
    setResult(d.block, data);
    if (d.artifacts) mergeArtifacts(d.artifacts);
  }
  function renderDone(card, d) {
    card.json = d.json != null ? d.json : safeParse(d.raw);
    card.raw = d.raw || '';
    card.preEl = null;
    if (d.attempt !== undefined) setAttempt(card, d.attempt);
    setStatus(card, 'done');
    showWarnings(card, d.warnings);
    if (d.review || (state.results[d.block] && state.results[d.block].review)) showReview(card, d.review || state.results[d.block].review, false);
    revealActions(card);
    renderCardBody(card);
  }

  /* ---------- handlers SSE (run principal) ---------- */
  function onRunStart() { runDoneSeen = false; }
  function onBlockStart(d) {
    const card = ensureCard(d.block);
    inFlight[d.block] = true;
    setAttempt(card, d.attempt);
    setStatus(card, 'loading');
    freshPreview(card);
  }
  function onBlockDelta(d) { appendDelta(ensureCard(d.block), d.text); }
  function onBlockDone(d) {
    delete inFlight[d.block];
    storeResult(d);
    renderDone(ensureCard(d.block), d);
    (DEPENDENTS[d.block] || []).forEach(function (dep) {
      const c = cards[dep];
      if (c && (c.status === 'done' || c.status === 'stale')) markStale(c);
    });
  }
  function onBlockError(d) { delete inFlight[d.block]; renderError(ensureCard(d.block), d); }
  function onAgentReviewing(d) {
    const card = ensureCard(d.block);
    setAttempt(card, d.attempt);
    setStatus(card, 'reviewing');
  }
  function onAgentReview(d) {
    const card = ensureCard(d.block);
    setResult(d.block, { review: d, attempt: d.attempt });
    showReview(card, d, false);
  }
  function onRunDone(d) {
    runDoneSeen = true;
    (d.skipped || []).forEach(function (b) {
      if (cards[b]) renderError(cards[b], { reason: 'dependency_failed', message: 'dependência falhou', retryable: true });
    });
    finish(d.status || 'success');
  }
  function onRunError(d) {
    Object.keys(inFlight).forEach(function (b) { markInterrupted(cards[b]); });
    for (const k in inFlight) delete inFlight[k];
    if (d && d.message) toast('Falha: ' + d.message);
    finish('failed');
  }
  function onAbort() {
    Object.keys(inFlight).forEach(function (b) { markInterrupted(cards[b]); });
    for (const k in inFlight) delete inFlight[k];
    finish('aborted');
  }
  function onStreamEnd() {
    if (!runDoneSeen) {
      Object.keys(inFlight).forEach(function (b) { markInterrupted(cards[b]); });
      for (const k in inFlight) delete inFlight[k];
      finish('interrupted');
    }
  }
  function finish(status) { if (finished) return; finished = true; if (opts.onFinish) opts.onFinish(status); }

  const handlers = {
    onRunStart: onRunStart, onBlockStart: onBlockStart, onBlockDelta: onBlockDelta,
    onBlockDone: onBlockDone, onBlockError: onBlockError, onRunDone: onRunDone,
    onAgentReviewing: onAgentReviewing, onAgentReview: onAgentReview,
    onRunError: onRunError, onAbort: onAbort, onStreamEnd: onStreamEnd
  };

  /* ---------- iniciar / abortar / regenerar ---------- */
  function start(payload) {
    finished = false; runDoneSeen = false;
    controller = runStream(payload, handlers);
    return controller;
  }
  function abort() { if (controller) controller.abort(); }

  // regeneração de UM bloco (mini-run isolada, mesmos renderers)
  function regen(block, extra) {
    const card = ensureCard(block);
    setStatus(card, 'loading');
    freshPreview(card);
    let localDone = false;
    const h = {
      onRunStart: function () {},
      onBlockStart: function (d) { const c = ensureCard(d.block); setAttempt(c, d.attempt); setStatus(c, 'loading'); freshPreview(c); },
      onBlockDelta: function (d) { appendDelta(ensureCard(d.block), d.text); },
      onBlockDone: function (d) {
        storeResult(d);
        renderDone(ensureCard(d.block), d);
        (DEPENDENTS[d.block] || []).forEach(function (dep) {
          const c = cards[dep];
          if (c && (c.status === 'done' || c.status === 'stale')) markStale(c);
        });
      },
      onBlockError: function (d) { renderError(ensureCard(d.block), d); },
      onAgentReviewing: function (d) { const c = ensureCard(d.block); setAttempt(c, d.attempt); setStatus(c, 'reviewing'); },
      onAgentReview: function (d) { const c = ensureCard(d.block); setResult(d.block, { review: d, attempt: d.attempt }); showReview(c, d, false); },
      onRunDone: function (d) { localDone = true; (d.skipped || []).forEach(function (b) { if (cards[b]) renderError(cards[b], { reason: 'dependency_failed' }); }); },
      onRunError: function (d) { if (!localDone && card.status === 'loading') markInterrupted(card); if (d && d.message) toast('Falha: ' + d.message); },
      onAbort: function () { if (card.status === 'loading') markInterrupted(card); },
      onStreamEnd: function () { if (!localDone && card.status === 'loading') markInterrupted(card); }
    };
    // views secundárias (otimizador) podem fornecer o payload correto por bloco
    let payload = opts.buildRegenPayload ? opts.buildRegenPayload(block) : null;
    if (!payload) payload = { blocks: [block], params: state.params, model: state.model, artifacts: state.artifacts };
    payload = Object.assign(payload, extra || {});
    runStream(payload, h);
  }

  // render estático (histórico): sem marcar dependentes como desatualizados
  function analyzeCard(card) {
    if (!card || !card.json) { toast('Sem JSON para analisar.'); return; }
    card.reviewPanelEl.classList.remove('hidden');
    card.reviewPanelEl.innerHTML = '<div class="clean-view"><span class="tag">ANÁLISE</span><p><span class="spinner"></span> revisando bloco...</p></div>';
    runStream({
      blocks: ['review'],
      model: state.model,
      params: { review: { target: card.block, json: card.json, params: state.params } }
    }, {
      onBlockDone: function (d) {
        if (d.block !== 'review') return;
        setResult(card.block, { review: d.json });
        showReview(card, d.json, true);
      },
      onBlockError: function (d) {
        card.reviewPanelEl.innerHTML = '<div class="clean-view"><p style="color:var(--pink)">Falha na análise: ' + esc((d && d.message) || 'erro') + '</p></div>';
      },
      onRunError: function (d) {
        card.reviewPanelEl.innerHTML = '<div class="clean-view"><p style="color:var(--pink)">Falha na análise: ' + esc((d && d.message) || 'erro') + '</p></div>';
      }
    });
  }

  function renderStatic(block, d) {
    const card = ensureCard(block);
    storeResult(Object.assign({ block: block }, d));
    renderDone(card, Object.assign({ block: block }, d));
  }

  return { container: container, cards: cards, handlers: handlers, ensureCard: ensureCard, start: start, abort: abort, regen: regen, renderStatic: renderStatic };
}

/* ============================================================
   Renderização por tipo de bloco (portado do v2 + streaming)
   ============================================================ */
function renderCardBody(card) {
  const b = card.block, json = card.json, raw = card.raw;

  if (card.mode === 'chat') { card.bodyEl.innerHTML = renderChat(json, raw); return; }
  if (b === 'grid_preview') { card.bodyEl.innerHTML = '<div class="clean-view">' + renderDirection(json || safeParse(raw)) + '</div>'; return; }
  if (b === 'grid') { const ctx = { ip: [], quiz: [] }; card.bodyEl.innerHTML = renderGridView(json, raw, ctx); bindBody(card, ctx); return; }
  if (b === 'optimize') { card.bodyEl.innerHTML = '<pre>' + esc(json ? JSON.stringify(json, null, 2) : (raw || '')) + '</pre>'; return; }

  if (kindOf(b) === 'json-download') {
    card.bodyEl.innerHTML = '<pre>' + esc(json ? JSON.stringify(json, null, 2) : raw) + '</pre>';
  } else {
    const ctx = { ip: [], quiz: [], cv: [] };
    card.bodyEl.innerHTML = '<div class="clean-view">' + sanitize(b, json, raw, ctx) + '</div>';
    bindBody(card, ctx);
  }
}

// grid: itens com título + link Pinterest, JSON de importação recolhível
function renderGridView(j, raw, ctx) {
  if (!j) j = safeParse(raw);
  if (!j || !j.items) return '<pre>' + esc(raw || '') + '</pre>';
  const g = j.grid || {};
  let h = '<div class="clean-view">';
  if (g.title) h += '<h4>' + esc(g.title) + '</h4>';
  if (g.subtitle) h += '<p style="color:var(--muted);margin-bottom:12px">' + esc(g.subtitle) + '</p>';
  h += '<div style="display:flex;flex-direction:column;gap:8px">';
  j.items.forEach(function (it, i) {
    const pin = it.item_image || '';
    const url = 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(pin);
    const id = ctx.ip.length; ctx.ip.push(pin);
    h += '<div class="kv" style="padding-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
      '<b>' + (i + 1) + '. ' + esc(it.item_title || '') + '</b>' +
      '<button class="mini-btn ipcopy" data-ip="' + id + '">copiar busca</button></div>' +
      '<p style="margin-top:4px"><span class="pin">📌 ' + esc(pin) + '</span> &nbsp;<a href="' + esc(url) + '" target="_blank" rel="noopener" style="color:var(--cyan);font-size:12px">abrir no Pinterest ↗</a></p></div>';
  });
  h += '</div>';
  h += '<div style="margin-top:14px"><button class="mini-btn gridJsonToggle">▼ ver JSON de importação</button>' +
    '<pre class="gridJsonRaw" style="display:none;margin-top:8px">' + esc(JSON.stringify(j, null, 2)) + '</pre></div>';
  h += '</div>';
  return h;
}

// grid_preview -> prévia visual (paleta/fonte/mock) — portado do v2 showGridDirection
function renderDirection(dir) {
  if (!dir) return '<pre>sem prévia</pre>';
  const pal = dir.palette || [];
  const sw = pal.map(function (c) {
    return '<span style="display:inline-block;width:26px;height:26px;border-radius:6px;background:' + esc(c) + ';margin-right:6px;vertical-align:middle;border:1px solid rgba(255,255,255,.2)"></span>';
  }).join('');
  const titleColor = dir.title_color || '#fff';
  const itemBg = dir.item_bg || '#1a1a2e';
  const itemText = dir.item_text_color || '#fff';
  const font = dir.font || 'Georgia';
  const accent = pal[0] || '#c084fc';
  const mock = '<div style="background:linear-gradient(135deg,' + esc(pal[0] || '#222') + '22,' + esc(pal[1] || '#111') + '22);padding:18px;border-radius:12px;margin-top:12px">' +
    '<div style="font-family:' + esc(font) + ';font-weight:800;font-size:20px;color:' + esc(titleColor) + ';text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.8);margin-bottom:4px">Título de Exemplo</div>' +
    '<div style="font-family:' + esc(font) + ';font-weight:600;font-size:13px;color:' + esc(titleColor) + ';text-align:center;opacity:1;margin-bottom:14px">Subtítulo legível de exemplo</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
    ['Opção Um', 'Opção Dois'].map(function (t) {
      return '<div style="border:2px solid ' + esc(accent) + ';border-radius:10px;overflow:hidden"><div style="height:54px;background:linear-gradient(135deg,' + esc(accent) + '66,' + esc(pal[1] || '#333') + '66)"></div><div style="font-family:' + esc(font) + ';font-weight:800;font-size:14px;color:' + esc(itemText) + ';background:' + esc(itemBg) + ';padding:10px;text-align:center">' + t + '</div></div>';
    }).join('') +
    '</div></div>';
  return '<span class="tag">PRÉVIA VISUAL — é assim que vai ficar</span>' +
    '<p style="margin:10px 0 4px"><b>Paleta:</b> ' + sw + '</p>' +
    '<p><b>Fonte:</b> ' + esc(font) + '</p>' + mock +
    '<p style="margin-top:10px;color:var(--muted)">' + esc(dir.mood || '') + '</p>' +
    '<p style="margin-top:6px;color:var(--green);font-size:12px">✓ Contraste garantido pelo backend</p>';
}

// JSON -> texto limpo legível por bloco (HTML). ctx acumula strings copiáveis.
function sanitize(b, j, raw, ctx) {
  if (!j) j = safeParse(raw);
  if (!j) return '<pre>' + esc(raw || '') + '</pre>';
  try {
    if (b === 'page_name' && j.names) return ulist(j.names);
    if (b === 'fb_images') {
      let h = '';
      if (j.profile) h += '<h4>📷 Foto de Perfil (1:1)</h4><div class="kv"><p>' + esc(j.profile.prompt || j.profile) + '</p></div>';
      if (j.cover) h += '<h4>🖼️ Foto de Capa (1640×856)</h4><div class="kv"><p>' + esc(j.cover.prompt || j.cover) + '</p></div>';
      if (j.bio) { const bl = ('' + j.bio).length; h += '<h4>✍️ Bio <span style="color:' + (bl <= 100 ? 'var(--green)' : 'var(--pink)') + ';font-size:11px">(' + bl + '/100)</span></h4><div class="kv"><p>' + esc(j.bio) + '</p></div>'; }
      if (j.intro_post) h += '<h4>📢 Post de Apresentação</h4><div class="kv"><p style="white-space:pre-wrap">' + esc(j.intro_post) + '</p></div>';
      return h || '<pre>' + esc(JSON.stringify(j, null, 2)) + '</pre>';
    }
    if ((b === 'p1_titles' || b === 'p2_titles') && j.titles) return olist(j.titles);
    if (b === 'meta_copy') {
      let h = '';
      if (j.primary_texts) { h += '<h4>Textos principais</h4>' + olist(j.primary_texts); }
      if (j.headlines) { h += '<h4>Títulos</h4>' + olist(j.headlines); }
      if (j.description) { h += '<h4>Descrição</h4><p>' + esc(j.description) + '</p>'; }
      return h;
    }
    if (b === 'meta_onboard') {
      let h = '';
      if (j.welcome) { h += '<h4>Boas-vindas</h4><p>' + esc(j.welcome) + '</p>'; }
      if (j.quick_replies) { h += '<h4>Quick replies</h4>' + ulist(j.quick_replies); }
      if (j.followup) { h += '<h4>Follow-up 24h</h4><p>' + esc(j.followup) + '</p>'; }
      return h;
    }
    if (b === 'quiz' && j.quizzes) {
      return j.quizzes.map(function (item, i) {
        const ov = item.overlay || item;
        const qi = ctx.quiz.length; ctx.quiz.push(item);
        let h = '<div class="kv"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="tag">QUIZ ' + (i + 1) + ' · modo: ' + esc(ov.entry_mode || '') + ' · paleta: ' + esc(ov.theme_palette || '') + '</span><button class="mini-btn dl qdl" data-qi="' + qi + '">⬇ .json</button></div>';
        h += '<h4>' + esc((ov.qlist && ov.qlist[0] && ov.qlist[0].title) || '') + '</h4>';
        const vq = ov.visual_questions && ov.visual_questions[0];
        if (vq && vq.options && vq.options.length) {
          h += '<p style="color:var(--purple);font-size:12px;margin:6px 0 2px">Modo visual:</p><div style="display:flex;flex-direction:column;gap:5px;margin-bottom:6px">' + vq.options.map(function (o) {
            const img = o.image || ''; const isPin = img.indexOf('pinterest.com') >= 0;
            const safeImg = safeUrl(img);
            const link = safeImg
              ? '<br><a href="' + esc(safeImg) + '" target="_blank" rel="noopener" style="color:var(--cyan);font-size:11px">' + (isPin ? '🔍 buscar no Pinterest ↗' : 'ver imagem ↗') + '</a>'
              : (img ? '<br><span style="color:var(--muted);font-size:11px">' + esc(img) + '</span>' : '');
            return '<div style="border-left:2px solid var(--purple);padding-left:10px"><b>' + esc(o.label || '') + '</b>' + link + '</div>';
          }).join('') + '</div>';
        }
        h += '<p style="font-size:12px;color:var(--muted)"><b>Roleta:</b> ' + esc(ov.wheel_title || '') + '<br><b>CTA final:</b> ' + esc(ov.final_cta_label || '') + '<br><b>Loading:</b> ' + esc(ov.loading_text || '') + '</p>';
        h += '</div>';
        return h;
      }).join('');
    }
    if (b === 'image_prompts') {
      let h = '';
      function promptRow(tag, prompt) {
        const id = ctx.ip.length; ctx.ip.push(prompt);
        return '<div class="kv"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><span class="tag">' + esc(tag) + '</span><button class="mini-btn ipcopy" data-ip="' + id + '">copiar</button></div><p>' + esc(prompt) + '</p></div>';
      }
      if (j.onboard && j.onboard.length) { h += '<h4>Onboard (' + j.onboard.length + ')</h4>' + j.onboard.map(function (o) { return promptRow(o.step || 'onb', o.prompt || ''); }).join(''); }
      if (j.sequence && j.sequence.length) {
        const byRoute = {};
        j.sequence.forEach(function (o) { const r = o.route != null ? o.route : 1; (byRoute[r] = byRoute[r] || []).push(o); });
        h += '<h4>Sequência (' + j.sequence.length + ')</h4>';
        Object.keys(byRoute).sort(function (a, b) { return a - b; }).forEach(function (r) {
          h += '<div style="margin:8px 0 4px;color:var(--pink);font-family:var(--f-mono);font-size:12px">— Rota ' + esc(r) + ' (' + byRoute[r].length + ' cards)</div>';
          h += byRoute[r].map(function (o) { return promptRow(o.step || ('seq' + r), o.prompt || ''); }).join('');
        });
      }
      return h;
    }
    if (b === 'creative_analysis') {
      const analysis = j.analysis || {};
      const vars = j.variations || [];
      let h = '<span class="tag">DNA DO CRIATIVO</span>';
      if (analysis.niche_detectado || analysis.idioma_detectado) {
        h += '<div class="kv"><h4>Detectado da imagem</h4><p>' +
          (analysis.niche_detectado ? '<span class="tag">nicho: ' + esc(analysis.niche_detectado) + '</span> ' : '') +
          (analysis.idioma_detectado ? '<span class="tag">idioma: ' + esc(analysis.idioma_detectado) + '</span>' : '') +
          '<br><small style="color:var(--muted)">as variações são geradas neste nicho e idioma</small></p></div>';
      }
      if (analysis.dna) h += '<div class="kv"><h4>DNA</h4><p>' + esc(analysis.dna) + '</p></div>';
      if (analysis.porque_venceu) h += '<div class="kv"><h4>Por que venceu</h4><p>' + esc(analysis.porque_venceu) + '</p></div>';
      if (analysis.elementos_chave && analysis.elementos_chave.length) h += '<div class="kv"><h4>Elementos-chave</h4>' + ulist(analysis.elementos_chave) + '</div>';
      if (analysis.alertas_meta_policy && analysis.alertas_meta_policy.length) h += '<div class="kv"><h4>Alertas Meta Policy</h4>' + ulist(analysis.alertas_meta_policy) + '</div>';
      if (vars.length) {
        h += '<h4>Variações</h4><div class="creative-var-grid">';
        vars.forEach(function (v) {
          const copy = [
            v.index ? '#' + v.index : '',
            v.dimensao_variada || '',
            v.headline ? 'Headline: ' + v.headline : '',
            v.cta ? 'CTA: ' + v.cta : '',
            v.prompt || ''
          ].filter(Boolean).join('\n');
          const id = ctx.cv.length; ctx.cv.push(copy);
          h += '<div class="creative-var-card kv">' +
            '<div class="creative-var-head"><span class="tag">#' + esc(v.index || '') + ' · ' + esc(v.dimensao_variada || '') + '</span><button class="mini-btn creative-var-copy" data-cv="' + id + '">copiar</button></div>' +
            (v.headline ? '<p><b>Headline:</b> ' + esc(v.headline) + '</p>' : '') +
            (v.cta ? '<p><b>CTA:</b> ' + esc(v.cta) + '</p>' : '') +
            '<p>' + esc(v.prompt || '') + '</p>' +
          '</div>';
        });
        h += '</div>';
      }
      return h || '<pre>' + esc(JSON.stringify(j, null, 2)) + '</pre>';
    }
    if (b === 'creatives_prompt') {
      if (j.prompt) return '<pre>' + esc(j.prompt) + '</pre>';
      if (j.prompts) {
        const imgOnly = j.type === 'image_only';
        const head = '<span class="tag">' + esc(j.platform || '') + ' · ' + esc(j.size || '') + (imgOnly ? ' · APENAS IMAGEM' : ' · COMPLETO') + '</span>';
        return head + j.prompts.map(function (p) {
          const id = ctx.ip.length; ctx.ip.push(p.prompt || '');
          return '<div class="kv"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>#' + (p.index || '') + '</b><button class="mini-btn ipcopy" data-ip="' + id + '">copiar</button></div>' + (p.headline ? '<br><b>Headline:</b> ' + esc(p.headline) : '') + (p.cta ? '<br><b>CTA:</b> ' + esc(p.cta) : '') + '<p>' + esc(p.prompt || '') + '</p></div>';
        }).join('');
      }
    }
    if (b === 'audios' && j.audios) {
      return j.audios.map(function (a) { return '<div class="kv"><span class="tag">#' + (a.index || '') + ' · voz: ' + esc(a.voice || '') + '</span><p>' + esc(a.script || '') + '</p></div>'; }).join('');
    }
  } catch (e) {}
  return '<pre>' + esc(JSON.stringify(j, null, 2)) + '</pre>';
}

/* ---------- preview de chat (Messenger) — best-effort ---------- */
function renderChat(json, raw) {
  const flow = json || safeParse(raw);
  if (!flow || !Array.isArray(flow.routes)) {
    return '<div class="clean-view"><p style="color:var(--muted)">Sem estrutura de rotas para exibir como chat.</p></div>';
  }
  let h = '<div class="chat-view">';
  flow.routes.forEach(function (r, ri) {
    h += '<div class="chat-route"><span class="chat-route-tag">◢ Rota ' + esc(r.id != null ? r.id : ri) + (r.name ? ' · ' + esc(r.name) : '') + '</span>';
    const inter = r.interactions || r.steps || [];
    inter.forEach(function (it) { h += renderInteraction(it); });
    h += '</div>';
  });
  h += '</div>';
  return h;
}
function renderInteraction(it) {
  const type = String((it && it.type) || '').toLowerCase();
  const c = (it && it.config) || it || {};
  if (type.indexOf('delay') >= 0) {
    const d = c.duration || c.delay || c.seconds || it.duration || '';
    return '<div class="chat-delay">⏱ ' + esc(fmtDelay(d)) + '</div>';
  }
  if (type.indexOf('menu') >= 0 || (c.cards && c.cards.length)) return renderChatCards(c.cards || []);
  let h = '';
  const txt = c.text || (type.indexOf('text') >= 0 ? c.title : '') || it.text;
  if (txt) h += '<div class="chat-bubble">' + esc(txt) + '</div>';
  else if (c.title) h += '<div class="chat-bubble">' + esc(c.title) + '</div>';
  const btns = c.buttons || [];
  const qr = c.quick_replies || [];
  const chips = btns.concat(qr);
  if (chips.length) h += '<div class="chat-quick">' + chips.map(function (x) { return '<span class="chat-chip">' + esc((x && (x.label || x.title)) || x) + '</span>'; }).join('') + '</div>';
  return h;
}
function renderChatCards(cards) {
  return '<div class="chat-cards">' + cards.map(function (cd) {
    const img = cd.image ? '<div class="chat-card-img">🖼 ' + esc(cd.image) + '</div>' : '';
    const btns = (cd.buttons || []).map(function (b) { return '<span class="chat-chip">' + esc((b && (b.label || b.title)) || b) + '</span>'; }).join('');
    return '<div class="chat-card">' + img + '<div class="chat-card-body"><b>' + esc(cd.title || '') + '</b>' + (cd.subtitle ? '<span>' + esc(cd.subtitle) + '</span>' : '') + '</div>' + (btns ? '<div class="chat-quick">' + btns + '</div>' : '') + '</div>';
  }).join('') + '</div>';
}
function fmtDelay(d) {
  const n = Number(d);
  if (!isFinite(n) || !n) return String(d || '?');
  if (n >= 60 && n % 60 === 0) return (n / 60) + 'min';
  if (n >= 60) return Math.round(n / 60) + 'min';
  return n + 's';
}

/* ---------- listas ---------- */
function ulist(a) { return '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
function olist(a) { return '<ol>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>'; }

/* ---------- binds dentro do card (escopo local, sem globais) ---------- */
function bindBody(card, ctx) {
  const body = card.bodyEl;
  body.querySelectorAll('.ipcopy').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      copyToBtn(btn, ctx.ip[+btn.getAttribute('data-ip')] || '', 'copiar');
    });
  });
  body.querySelectorAll('.creative-var-copy').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      copyToBtn(btn, ctx.cv[+btn.getAttribute('data-cv')] || '', 'copiar');
    });
  });
  body.querySelectorAll('.qdl').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const item = ctx.quiz[+btn.getAttribute('data-qi')];
      if (!item) return;
      const ov = item.overlay || item;
      downloadJson(item, 'qo-' + (ov.id || ('quiz-' + (+btn.getAttribute('data-qi') + 1))) + '.json');
    });
  });
  const gt = body.querySelector('.gridJsonToggle');
  if (gt) gt.addEventListener('click', function (e) {
    e.stopPropagation();
    const r = body.querySelector('.gridJsonRaw');
    const show = r.style.display === 'none';
    r.style.display = show ? 'block' : 'none';
    gt.textContent = (show ? '▲' : '▼') + ' ver JSON de importação';
  });
}

/* ---------- copiar / baixar ---------- */
function copyToBtn(btn, text, restore) {
  navigator.clipboard.writeText(text || '').then(function () {
    const old = btn.textContent; btn.textContent = '✓';
    setTimeout(function () { btn.textContent = restore || old; }, 1200);
  });
}
function doCopy(card) {
  const b = card.block;
  const json = card.json, raw = card.raw;
  let txt;
  if (kindOf(b) === 'json-download') txt = json ? JSON.stringify(json, null, 2) : raw;
  else txt = cleanText(b, json || safeParse(raw), raw);
  copyToBtn(card.cpBtn, txt || '', 'copiar');
}
function doDownload(card) {
  const b = card.block, json = card.json;
  if (!json) { toast('JSON inválido — veja o conteúdo.'); return; }
  const name = (state.params.niche || 'funil').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fn =
    b === 'onboard' ? 'onboard-' + name + '.json' :
    b === 'sequence' ? 'sequencia-' + name + '.json' :
    b === 'grid' ? 'mirb-grid-' + name + '.json' :
    b === 'comment' ? 'comentarios-' + name + '.json' :
    b === 'optimize' ? 'otimizado-' + name + '.json' :
    b + '-' + name + '.json';
  downloadJson(json, fn);
  toast('Baixado: ' + fn);
}
function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

// versão texto p/ copiar dos blocos 'text' — portado do v2 cleanText
export function cleanText(b, j, raw) {
  if (!j) return raw || '';
  try {
    if (b === 'page_name' && j.names) return j.names.join('\n');
    if (b === 'fb_images') return 'FOTO DE PERFIL:\n' + ((j.profile && (j.profile.prompt || j.profile)) || '') + '\n\nFOTO DE CAPA:\n' + ((j.cover && (j.cover.prompt || j.cover)) || '') + (j.bio ? '\n\nBIO:\n' + j.bio : '') + (j.intro_post ? '\n\nPOST DE APRESENTAÇÃO:\n' + j.intro_post : '');
    if ((b === 'p1_titles' || b === 'p2_titles') && j.titles) return j.titles.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n');
    if (b === 'meta_copy') return 'TEXTOS:\n' + (j.primary_texts || []).map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n\n') + '\n\nTÍTULOS:\n' + (j.headlines || []).join('\n') + '\n\nDESCRIÇÃO:\n' + (j.description || '');
    if (b === 'meta_onboard') return 'BOAS-VINDAS:\n' + (j.welcome || '') + '\n\nQUICK REPLIES:\n' + (j.quick_replies || []).join('\n') + '\n\nFOLLOW-UP:\n' + (j.followup || '');
    if (b === 'quiz' && j.quizzes) return JSON.stringify(j.quizzes.length === 1 ? j.quizzes[0] : j.quizzes, null, 2);
    if (b === 'creatives_prompt' && j.prompt) return j.prompt;
    if (b === 'creatives_prompt' && j.prompts) return j.prompts.map(function (p) { return '#' + p.index + ' ' + (p.headline || '') + '\n' + p.prompt + '\nCTA: ' + (p.cta || ''); }).join('\n\n');
    if (b === 'creative_analysis') return JSON.stringify({ analysis: j.analysis || {}, variations: j.variations || [] }, null, 2);
    if (b === 'audios' && j.audios) return j.audios.map(function (a) { return '#' + a.index + ' [' + a.voice + ']\n' + a.script; }).join('\n\n');
    if (b === 'image_prompts') { const o = (j.onboard || []).map(function (x) { return x.step + ': ' + x.prompt; }).join('\n'); const s = (j.sequence || []).map(function (x) { return 'r' + x.route + ' ' + x.step + ': ' + x.prompt; }).join('\n'); return 'ONBOARD:\n' + o + '\n\nSEQUÊNCIA:\n' + s; }
  } catch (e) {}
  return JSON.stringify(j, null, 2);
}
