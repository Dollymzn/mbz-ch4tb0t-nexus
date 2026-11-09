// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — main.js (entry point, type=module)
//  Bootstrap: FX, config/auth, tabs/modos, modelos, forja
//  (orquestração via runStream), otimizador, histórico, modais.
// ============================================================
'use strict';

import { state, esc, toast, setModel, setUserKey, setAccessPass, resetRun, mergeArtifacts } from './state.js';
import { initFX, startClock } from './fx.js';
import { getConfig, auth, getHistory, saveHistory, deleteHistory, getBlogs, addBlog, deleteBlog, testBlog, publishStream } from './api.js';
import { makeRunView, exportJson } from './render.js';
import { initWizard, collectParams, selectedBlocks, gotoStep } from './wizard.js';
import './anim.js'; // efeitos que exigem JS: boot do gate, ripple, View Transitions

const $ = function (s) { return document.querySelector(s); };
const $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };

let appStarted = false;

document.addEventListener('DOMContentLoaded', function () {
  initFX(); startClock(); loadConfig();
});

/* ---------- config / selects / modelos ---------- */
function loadConfig() {
  getConfig().then(function (cfg) {
    state.cfg = cfg;
    fillSel('#flowLang', cfg.languages, 'id', 'label', 'en-US');
    fillSel('#contentLang', cfg.languages, 'id', 'label', 'pt-BR');
    fillSel('#campaignLang', cfg.languages, 'id', 'label', 'pt-BR');
    if (cfg.countries) fillSel('#geoCountry', cfg.countries, 'label', 'label', 'Brasil');
    fillSel('#currency', cfg.currencies, 'id', 'label', 'USD');
    fillSel('#persona', cfg.personas, 'id', 'label', 'sem_persona');
    fillSel('#creativePlatform', cfg.creativePlatforms, 'id', 'label', 'svg_claude');
    fillSel('#optCreativePlatform', cfg.creativePlatforms, 'id', 'label', 'google_flow');
    fillSel('#creativeSize', cfg.creativeSizes, 'id', 'label', '1080x1440');
    // modelo: catálogo vem do backend (contrato §1) — nunca hardcodado
    // v4: migra id de modelo antigo salvo no localStorage (ex.: claude-sonnet-5 / opus-4-8 da v3)
    // — se não está no catálogo atual, cai pro recomendado em vez de mandar id morto pra API.
    if (Array.isArray(cfg.models) && cfg.models.length) {
      const known = cfg.models.some(function (m) { return m.id === state.model; });
      if (!state.model || !known) {
        if (state.model && !known) toast('Modelo ' + state.model + ' saiu do catálogo → ' + cfg.models[0].id);
        setModel(cfg.models[0].id);
      }
    }
    ['#optModel', '#modelGlobal', '#modelWizard'].forEach(fillModels);
    $('#modelFoot').textContent = 'modelo: ' + (state.model || '—');
    if (cfg.needPassword && !state.accessPass) showGate(); else verifyEnter();
  }).catch(function () { toast('Falha ao carregar /api/config.'); });
}
function fillSel(sel, items, vk, lk, def) {
  const el = $(sel); if (!el || !items) return;
  el.innerHTML = '';
  items.forEach(function (it) {
    const o = document.createElement('option');
    o.value = it[vk]; o.textContent = it[lk];
    if (it[vk] === def) o.selected = true;
    el.appendChild(o);
  });
}
function fillModels(sel) {
  const el = $(sel); if (!el) return;
  const models = (state.cfg && Array.isArray(state.cfg.models) && state.cfg.models.length)
    ? state.cfg.models
    : (state.model ? [{ id: state.model, label: state.model }] : []);
  el.innerHTML = '';
  models.forEach(function (m) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.label || m.id;
    if (m.id === state.model) o.selected = true;
    el.appendChild(o);
  });
  el.onchange = function () {
    setModel(el.value);
    $('#modelFoot').textContent = 'modelo: ' + state.model;
    syncModelSelects();
  };
}
function syncModelSelects() {
  ['#optModel', '#modelGlobal', '#modelWizard'].forEach(function (s) { const el = $(s); if (el && el.value !== state.model) el.value = state.model; });
}

/* ---------- gate / auth ---------- */
function showGate() {
  $('#gate').classList.remove('hidden');
  $('#gateBtn').onclick = function () {
    const p = $('#gatePass').value;
    auth(p).then(function (res) {
      if (res.ok) { setAccessPass(p); $('#gate').classList.add('hidden'); enterApp(); }
      else $('#gateErr').textContent = res.error || 'Senha incorreta.';
    });
  };
  $('#gatePass').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#gateBtn').click(); });
}
function verifyEnter() {
  if (state.cfg.needPassword) {
    auth(state.accessPass).then(function (res) { res.ok ? enterApp() : showGate(); });
  } else enterApp();
}
function enterApp() {
  if (appStarted) return; appStarted = true;
  $('#app').classList.remove('hidden');
  initWizard();
  buildClassic();
  wireTabs(); wireModes(); wireKeyModal(); wireOptimizer(); wireOutputActions(); wireBlogs(); wirePublisher();
  if (!state.cfg.serverKey && !state.userKey) $('#keyModal').classList.remove('hidden');
  loadHistory();
}

/* ---------- tabs / modos ---------- */
function wireTabs() {
  $$('.tab').forEach(function (t) {
    t.onclick = function () {
      $$('.tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      const tb = t.getAttribute('data-tab');
      $('#tab-creator').classList.toggle('hidden', tb !== 'creator');
      $('#tab-optimizer').classList.toggle('hidden', tb !== 'optimizer');
      $('#tab-history').classList.toggle('hidden', tb !== 'history');
      if ($('#tab-blogs')) $('#tab-blogs').classList.toggle('hidden', tb !== 'blogs');
      if (tb === 'history') loadHistory();
      if (tb === 'blogs') loadBlogs();
    };
  });
}
function wireModes() {
  $('#modeWizard').onclick = function () { this.classList.add('active'); $('#modeClassic').classList.remove('active'); $('#wizard').classList.remove('hidden'); $('#classic').classList.add('hidden'); };
  $('#modeClassic').onclick = function () { this.classList.add('active'); $('#modeWizard').classList.remove('active'); $('#classic').classList.remove('hidden'); $('#wizard').classList.add('hidden'); };
}
function buildClassic() {
  $('#classicGrid').innerHTML = '<div class="sel-card"><label>Blocos</label><small>Use o passo a passo p/ ajustes finos. Aqui gera com os blocos marcados lá.</small></div>';
}

/* ---------- forja (run principal) ---------- */
let mainView = null;
function runForge() {
  collectParams();
  if (!state.params.niche) { toast('Digite o nicho.'); gotoStep(1); return; }
  if (!state.cfg.serverKey && !state.userKey) { $('#keyModal').classList.remove('hidden'); return; }
  const blocks = selectedBlocks();
  if (!blocks.length) { toast('Marque ao menos um bloco.'); return; }

  // grid_preview não está no block picker (é predecessor automático do grid):
  // sem ele, o grid gera sem a direção visual (gridDirection). Se 'grid' foi
  // selecionado, 'grid_preview' não está na lista e ainda não temos uma
  // direção visual em cache, insere 'grid_preview' logo antes de 'grid'.
  const gridIdx = blocks.indexOf('grid');
  if (gridIdx >= 0 && blocks.indexOf('grid_preview') < 0 && !(state.artifacts && state.artifacts.gridDirection)) {
    blocks.splice(gridIdx, 0, 'grid_preview');
  }

  // persona_identity (v3.2a) também é predecessor automático (fora do block picker):
  // a identidade visual fixa da persona é injetada em todo prompt de imagem/vídeo. Se a
  // run tem algum bloco visual, não pediu persona_identity e não há identidade em cache,
  // gera o character sheet PRIMEIRO (unshift) — mesmo padrão do grid_preview acima.
  // v4: com estilo "alt" (sem persona), criativos/vídeos NÃO precisam da identidade —
  // só fb_images/image_prompts contam como visuais nesse caso.
  const noPersonaStyle = state.params.creativeStyle === 'alt';
  const VISUAL_BLOCKS = noPersonaStyle
    ? ['fb_images', 'image_prompts']
    : ['fb_images', 'image_prompts', 'creatives_prompt', 'video_prompts'];
  if (blocks.some(function (b) { return VISUAL_BLOCKS.indexOf(b) >= 0; }) &&
      blocks.indexOf('persona_identity') < 0 &&
      !(state.artifacts && state.artifacts.personaIdentity)) {
    blocks.unshift('persona_identity');
  }

  // Artifacts DURÁVEIS sobrevivem ao resetRun e viajam no body da run (dep soft #2
  // do contrato). Sem isso, a identidade gerada no passo 1 (fotos FB) e a direção
  // visual do grid eram apagadas aqui — e as guardas acima, que já pularam os blocos
  // por "ter cache", deixavam a run rodar SEM identidade/direção nenhuma.
  const carry = {};
  if (state.artifacts && state.artifacts.personaIdentity) carry.personaIdentity = state.artifacts.personaIdentity;
  if (state.artifacts && state.artifacts.gridDirection) carry.gridDirection = state.artifacts.gridDirection;

  resetRun();
  mergeArtifacts(carry); // repõe os duráveis no cache do cliente (regen por card também os usa)
  const out = $('#output'); out.innerHTML = '';
  $('#wizForge').disabled = true; $('#classicForge').disabled = true;
  $('#outputActions').classList.add('hidden');
  setBusy(true);

  mainView = makeRunView(out, {
    onFinish: function (status) {
      $('#wizForge').disabled = false; $('#classicForge').disabled = false;
      setBusy(false);
      if (Object.keys(state.results).length) $('#outputActions').classList.remove('hidden');
      updatePublishBtn();
      if (status === 'success' || status === 'partial') toast('Funil gerado! ⚡');
    }
  });
  blocks.forEach(function (b) { mainView.ensureCard(b); });
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const payload = { blocks: blocks, params: state.params, model: state.model, artifacts: carry };
  if ($('#agentQuality') && $('#agentQuality').checked) {
    payload.agent = { enabled: true, maxIterations: 1, minScore: 7, blocks: null };
  }
  mainView.start(payload);
}

/* ---------- otimizador ---------- */
function wireOptimizer() {
  $('#optUpload').onclick = function (e) { e.preventDefault(); $('#optFile').click(); };
  $('#optFile').onchange = function () {
    const f = this.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = function () { $('#optContent').value = rd.result; toast('Arquivo carregado: ' + f.name); };
    rd.readAsText(f);
  };
  function updImgToggle() {
    const k = $('#optKind').value.toLowerCase();
    const show = k.indexOf('onboard') >= 0 || k.indexOf('sequ') >= 0;
    $('#optImgToggle').style.display = show ? 'flex' : 'none';
  }
  $('#optKind').onchange = updImgToggle; updImgToggle();
  $('#optBtn').onclick = runOptimize;
  $('#optCreativeFiles').onchange = handleCreativeFiles;
  $('#optCreativeBtn').onclick = runCreativeAnalysis;
}
function runOptimize() {
  const content = $('#optContent').value.trim();
  if (!content) { toast('Cole o conteúdo.'); return; }
  if (!state.cfg.serverKey && !state.userKey) { $('#keyModal').classList.remove('hidden'); return; }
  const kind = $('#optKind').value;
  const wantImg = $('#optWantImages').checked && $('#optImgToggle').style.display !== 'none';
  const model = $('#optModel').value || state.model;
  const out = $('#optOutput'); out.innerHTML = '';
  $('#optBtn').disabled = true; setBusy(true);
  let imgTriggered = false;

  const optCtx = { content: content, kind: kind, context: $('#optContext').value.trim(), model: model };
  const optimizePayload = { blocks: ['optimize'], params: { optimize: { content: optCtx.content, kind: optCtx.kind, context: optCtx.context } }, model: optCtx.model };

  const view = makeRunView(out, {
    onFinish: function () {
      if (!imgTriggered && wantImg) {
        imgTriggered = true;
        const r = state.results.optimize;
        if (r && r.json) {
          const p = buildImagePayload(r.json, optCtx.kind, optCtx.model);
          if (p) { view.ensureCard('image_prompts'); view.start(p); return; }
          toast('Nenhum card de menu encontrado pra gerar imagens.');
        } else { toast('Sem JSON otimizado para gerar imagens.'); }
      }
      $('#optBtn').disabled = false; setBusy(false);
    },
    // regeneração por card no otimizador usa o payload correto (não o do wizard)
    buildRegenPayload: function (block) {
      if (block === 'optimize') return optimizePayload;
      if (block === 'image_prompts') { const r = state.results.optimize; return r && r.json ? buildImagePayload(r.json, optCtx.kind, optCtx.model) : null; }
      return null;
    }
  });
  view.ensureCard('optimize');
  // bloco sintético optimize com params.optimize = { content, kind, context } (contrato §1)
  view.start(optimizePayload);
}
// image_prompts a partir do fluxo otimizado.
// Decisão (§6): portamos menuBreakdown + inferNicheFromFlow client-side e enviamos os
// menus derivados como ARTIFACTS (mecanismo do contrato) E como params (fallback v2),
// os dois com os mesmos valores — custo zero, robusto às duas interpretações do backend.
function buildImagePayload(flow, kind, model) {
  const bd = menuBreakdown(flow);
  if (!bd.total) return null;
  const isSeq = kind.toLowerCase().indexOf('sequ') >= 0;
  const artifacts = {
    onboardMenuCount: isSeq ? 0 : bd.total, onboardMenuMap: isSeq ? [] : bd.map,
    seqMenuCount: isSeq ? bd.total : 0, seqMenuMap: isSeq ? bd.map : []
  };
  const params = Object.assign({
    niche: inferNicheFromFlow(flow) || '(tema do fluxo enviado)',
    flowLang: 'en-US', contentLang: 'pt-BR', personaLabel: '', fromOptimizer: true
  }, artifacts);
  return { blocks: ['image_prompts'], params: params, model: model, artifacts: artifacts };
}
// {total, map:[{route,menus}]} — conta cards 'menu' por rota (portado do v2)
function menuBreakdown(flow) {
  let total = 0; const map = [];
  try {
    if (flow.routes) {
      flow.routes.forEach(function (r, idx) {
        let c = 0;
        (r.interactions || []).forEach(function (it) { if (it.type === 'menu') c++; });
        if (c > 0) { map.push({ route: idx, menus: c }); total += c; }
      });
    }
  } catch (e) {}
  return { total: total, map: map };
}
// extrai textos do fluxo pra inferir o tema (portado do v2)
function inferNicheFromFlow(flow) {
  const txt = [];
  try {
    if (flow.routes) {
      flow.routes.forEach(function (r) {
        (r.interactions || []).forEach(function (it) {
          const c = it.config || {};
          if (c.text) txt.push(c.text);
          (c.cards || []).forEach(function (cd) { if (cd.title) txt.push(cd.title); if (cd.subtitle) txt.push(cd.subtitle); (cd.buttons || []).forEach(function (b) { if (b.label) txt.push(b.label); }); });
          if (c.title) txt.push(c.title);
          (c.buttons || []).forEach(function (b) { if (b.label) txt.push(b.label); });
          (c.quick_replies || []).forEach(function (q) { if (q.label) txt.push(q.label); });
        });
      });
    }
  } catch (e) {}
  return txt.join(' | ').slice(0, 1200);
}

/* ---------- histórico ---------- */
let creativeImages = [];

function handleCreativeFiles() {
  const files = [].slice.call($('#optCreativeFiles').files || []).slice(0, 6);
  creativeImages = [];
  renderCreativeUploads();
  if (!files.length) return;
  const btn = $('#optCreativeBtn');
  btn.disabled = true;
  setBusy(true);
  Promise.all(files.map(downscaleImage)).then(function (imgs) {
    creativeImages = imgs;
    renderCreativeUploads();
    toast(imgs.length + ' imagem(ns) prontas.');
  }).catch(function (e) {
    toast((e && e.message) || 'Falha ao processar imagem.');
  }).finally(function () {
    btn.disabled = false;
    setBusy(false);
  });
}

function downscaleImage(file) {
  return new Promise(function (resolve, reject) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) { reject(new Error('Arquivo não é imagem.')); return; }
    const rd = new FileReader();
    rd.onerror = function () { reject(new Error('Falha ao ler imagem.')); };
    rd.onload = function () {
      const img = new Image();
      img.onerror = function () { reject(new Error('Imagem inválida.')); };
      img.onload = function () {
        try {
          const maxSide = 1568;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas indisponível.')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          const url = canvas.toDataURL('image/jpeg', 0.85);
          const data = (url.split(',')[1]) || '';
          if (!data) { reject(new Error('Falha ao processar imagem.')); return; }
          resolve({ name: file.name, width: w, height: h, media_type: 'image/jpeg', data: data, metrics: {} });
        } catch (err) {
          // drawImage/toDataURL podem lançar (imagem gigante, canvas "tainted", memória):
          // rejeitar aqui evita o Promise.all pendurado (botão travaria desabilitado).
          reject(new Error('Falha ao processar imagem: ' + (err && err.message ? err.message : 'erro')));
        }
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  });
}

function renderCreativeUploads() {
  const wrap = $('#optCreativeList'); if (!wrap) return;
  if (!creativeImages.length) { wrap.innerHTML = '<span class="preset-empty">nenhuma imagem carregada</span>'; return; }
  wrap.innerHTML = creativeImages.map(function (im, i) {
    return '<div class="creative-upload-row">' +
      '<div><b>' + esc(im.name || ('imagem ' + (i + 1))) + '</b><small>' + im.width + '×' + im.height + '</small></div>' +
      '<input type="number" step="0.01" min="0" data-metric="ctr" data-i="' + i + '" placeholder="CTR">' +
      '<input type="number" step="0.01" min="0" data-metric="cpm" data-i="' + i + '" placeholder="CPM">' +
      '<input type="number" step="0.01" min="0" data-metric="spend" data-i="' + i + '" placeholder="Spend">' +
      '<input type="text" data-metric="note" data-i="' + i + '" placeholder="nota opcional">' +
    '</div>';
  }).join('');
  wrap.querySelectorAll('[data-metric]').forEach(function (el) {
    el.oninput = function () {
      const im = creativeImages[+el.getAttribute('data-i')];
      if (!im) return;
      const k = el.getAttribute('data-metric');
      const v = el.value.trim();
      if (!v) { delete im.metrics[k]; return; }
      im.metrics[k] = k === 'note' ? v : Number(v);
    };
  });
}

function runCreativeAnalysis() {
  if (!creativeImages.length) { toast('Carregue ao menos uma imagem.'); return; }
  if (!state.cfg.serverKey && !state.userKey) { $('#keyModal').classList.remove('hidden'); return; }
  try { collectParams(); } catch (e) {}
  const images = creativeImages.map(function (im) {
    const metrics = {};
    Object.keys(im.metrics || {}).forEach(function (k) {
      const v = im.metrics[k];
      if (v !== '' && v != null && !(typeof v === 'number' && !isFinite(v))) metrics[k] = v;
    });
    return { media_type: im.media_type, data: im.data, metrics: metrics };
  });
  // 100% dirigido pela imagem: NÃO enviar niche/persona/flowLang do wizard — eles
  // contaminavam as variações (ex: persona mística do funil aberto virava cartomante
  // num criativo de crédito; flowLang do chatbot forçava inglês). O backend detecta
  // nicho e idioma da própria imagem (REGRA-MÃE em blocks.js creative_analysis).
  const params = {
    creative_analysis: {
      images: images,
      platform: $('#optCreativePlatform').value,
      nVariations: +$('#optCreativeVariations').value || 8,
      size: $('#creativeSize').value || '1080x1440'
    }
  };
  const out = $('#optCreativeOutput'); out.innerHTML = '';
  $('#optCreativeBtn').disabled = true; setBusy(true);
  const view = makeRunView(out, {
    onFinish: function () {
      $('#optCreativeBtn').disabled = false;
      setBusy(false);
    }
  });
  view.ensureCard('creative_analysis');
  view.start({ blocks: ['creative_analysis'], params: params, model: $('#optModel').value || state.model, images: images });
}

function loadHistory() {
  getHistory().then(function (list) {
    const el = $('#historyList');
    if (!Array.isArray(list) || !list.length) { el.innerHTML = '<p style="color:var(--muted);font-family:var(--f-mono)">Nenhum funil salvo ainda.</p>'; return; }
    el.innerHTML = '';
    list.forEach(function (h) {
      const d = document.createElement('div'); d.className = 'hist-item';
      d.innerHTML = '<div class="hist-info"><b>' + esc(h.niche) + '</b><small>' + esc(new Date(h.created_at).toLocaleString('pt-BR')) + ' · ' + Object.keys(h.blocks || {}).length + ' blocos</small></div><div class="hist-actions"><button class="mini-btn" data-load>carregar</button><button class="mini-btn" data-del>excluir</button></div>';
      d.querySelector('[data-load]').onclick = function () { loadEntry(h); };
      d.querySelector('[data-del]').onclick = function () { if (confirm('Excluir?')) deleteHistory(h.id).then(loadHistory); };
      el.appendChild(d);
    });
  }).catch(function () {});
}
function loadEntry(h) {
  $$('.tab')[0].click(); // volta pro criador
  state.params = h.params || {};
  resetRun();
  const out = $('#output'); out.innerHTML = '';
  const view = makeRunView(out, {});
  const blocks = h.blocks || {};
  Object.keys(blocks).forEach(function (b) {
    const data = blocks[b];
    view.renderStatic(b, { json: data.json, raw: data.raw, artifacts: data.artifacts, warnings: data.warnings, review: data.review, attempt: data.attempt });
  });
  $('#outputActions').classList.remove('hidden');
  updatePublishBtn();
  toast('Funil carregado.');
}

/* ---------- ações de saída ---------- */
function wireOutputActions() {
  $('#wizForge').onclick = function () { runForge(); };
  $('#classicForge').onclick = function () { runForge(); };
  $('#saveBtn').onclick = function () {
    const save = {};
    Object.keys(state.results).forEach(function (k) {
      const r = state.results[k];
      save[k] = { json: r.json, raw: r.raw, artifacts: r.artifacts, warnings: r.warnings, review: r.review, attempt: r.attempt };
    });
    if (!Object.keys(save).length) { toast('Nada para salvar.'); return; }
    saveHistory({ niche: state.params.niche, params: state.params, blocks: save }).then(function () { toast('Salvo no histórico ✓'); });
  };
  $('#downloadAll').onclick = function () {
    let n = 0;
    ['onboard', 'sequence', 'grid', 'comment', 'broadcast'].forEach(function (b) { const r = state.results[b]; if (r && r.json) { dlJson(exportJson(b, r.json), downloadName(b)); n++; } });
    if (!n) toast('Nenhum JSON para baixar.');
  };
}
function downloadName(b) {
  const name = (state.params.niche || 'funil').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (b === 'sequence' ? 'sequencia' : b === 'grid' ? 'mirb-grid' : b === 'comment' ? 'comentarios' : b === 'broadcast' ? 'broadcasts' : b) + '-' + name + '.json';
}
function dlJson(obj, fn) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; a.click(); URL.revokeObjectURL(a.href);
}

/* ---------- modal de chave ---------- */
function wireKeyModal() {
  $('#saveKey').onclick = function () {
    const k = $('#userKey').value.trim();
    if (!k) { toast('Insira a chave.'); return; }
    setUserKey(k);
    setModel($('#modelGlobal').value);
    syncModelSelects();
    $('#modelFoot').textContent = 'modelo: ' + state.model;
    $('#keyModal').classList.add('hidden');
    toast('Chave salva ✓');
  };
}

/* ---------- util UI ---------- */
function setBusy(on) { const d = $('#connDot'); if (d) d.classList.toggle('busy', on); }


/* ============================================================
   v4.1 — PUBLISHER: aba Blogs + painel de publicação
   ============================================================ */
let blogsCache = [];

function wireBlogs() {
  if (!$('#blogAdd')) return;
  $('#blogAdd').onclick = function () {
    const data = { name: $('#blogName').value.trim(), url: $('#blogUrl').value.trim(), user: $('#blogUser').value.trim(), appPassword: $('#blogPass').value, appUrl: $('#blogAppUrl').value.trim(), defaultCategory: $('#blogCategory').value.trim() };
    if (!data.url || !data.user || !data.appPassword) { $('#blogFormMsg').textContent = 'URL, usuário e senha de aplicação são obrigatórios.'; return; }
    $('#blogFormMsg').textContent = 'salvando…';
    addBlog(data).then(function (r) {
      if (r.error) { $('#blogFormMsg').textContent = '✕ ' + r.error; return; }
      $('#blogFormMsg').textContent = '✓ salvo — testando conexão…';
      $('#blogPass').value = '';
      return testBlog(r.blog.id).then(function (t) {
        $('#blogFormMsg').textContent = t.ok ? ('✓ conectado como ' + t.user + ' (' + (t.roles || []).join(',') + ')' + (t.gridRest ? ' · grid REST ok' : ' · ⚠ MIRB GRID sem rota 1.4.0')) : ('✕ ' + (t.error || 'falha'));
        loadBlogs();
      });
    }).catch(function (e) { $('#blogFormMsg').textContent = '✕ ' + e.message; });
  };
}

function loadBlogs() {
  const list = $('#blogList'); if (!list) return;
  list.innerHTML = '<p class="step-help">carregando…</p>';
  getBlogs().then(function (arr) {
    blogsCache = Array.isArray(arr) ? arr : [];
    if (!blogsCache.length) { list.innerHTML = '<p class="step-help">Nenhum blog cadastrado ainda.</p>'; return; }
    list.innerHTML = blogsCache.map(function (b) {
      const ok = b.last_ok ? ('✓ ' + esc(b.last_ok.user || '') + (b.last_ok.gridRest ? ' · grid REST' : ' · ⚠ sem grid REST') + ' · ' + esc(String(b.last_ok.at || '').slice(0, 16).replace('T', ' '))) : 'nunca testado';
      return '<div class="blog-row" data-id="' + esc(b.id) + '">' +
        '<div class="blog-info"><b>' + esc(b.name) + '</b><span class="pin">' + esc(b.url) + '</span><small>usuário <b>' + esc(b.user) + '</b> · ' + ok + (b.defaultCategory ? ' · categoria ' + esc(b.defaultCategory) : '') + '</small><div class="blog-test-out"></div></div>' +
        '<div class="blog-actions"><button class="mini-btn blog-test">🔌 testar</button><button class="mini-btn blog-del">✕ remover</button></div></div>';
    }).join('');
    $$('.blog-test').forEach(function (btn) {
      btn.onclick = function () {
        const row = btn.closest('.blog-row'); const out = row.querySelector('.blog-test-out'); out.textContent = 'testando…';
        testBlog(row.dataset.id).then(function (t) {
          if (!t.ok) { out.innerHTML = '<span style="color:var(--pink)">✕ ' + esc(t.error || 'falha') + '</span>'; return; }
          const can = t.can || {};
          out.innerHTML = '✓ ' + esc(t.site || '') + ' · ' + esc(t.user) + ' (' + esc((t.roles || []).join(',')) + ') · posts ' + (can.posts ? '✓' : '✗') + ' · mídia ' + (can.media ? '✓' : '✗') + ' · categorias ' + (can.categories ? '✓' : '✗') + ' · grid REST ' + (t.gridRest ? '✓' : '<span style="color:var(--amber)">✗ instale o [MBZ] - Mirb Grid 1.4.0</span>') + ' · ' + (t.categories || []).length + ' categorias';
          loadBlogs();
        });
      };
    });
    $$('.blog-del').forEach(function (btn) {
      btn.onclick = function () {
        const row = btn.closest('.blog-row');
        if (!confirm('Remover este blog do Nexus? (não apaga nada no WordPress)')) return;
        deleteBlog(row.dataset.id).then(loadBlogs);
      };
    });
  });
}

function hasPosts() {
  const a = state.results.p1_posts, b = state.results.p2_posts;
  return !!((a && a.json && a.json.posts && a.json.posts.length) || (b && b.json && b.json.posts && b.json.posts.length));
}
function updatePublishBtn() {
  const btn = $('#publishBtn'); if (!btn) return;
  btn.classList.toggle('hidden', !hasPosts());
}

let pubCategories = [];
function wirePublisher() {
  if (!$('#publishBtn')) return;
  $('#publishBtn').onclick = function () {
    const panel = $('#publishPanel'); panel.classList.remove('hidden');
    $('#pubProgress').classList.add('hidden'); $('#pubResult').classList.add('hidden'); $('#pubLog').innerHTML = ''; $('#pubBarFill').style.width = '0%';
    fillPubSummary();
    prefillAppUrl(null);
    getBlogs().then(function (arr) {
      blogsCache = Array.isArray(arr) ? arr : [];
      const sel = $('#pubBlog');
      sel.innerHTML = blogsCache.length ? blogsCache.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.name) + ' — ' + esc(b.url) + '</option>'; }).join('') : '<option value="">(nenhum blog cadastrado)</option>';
      $('#pubBlogHint').textContent = blogsCache.length ? 'o grid exige [MBZ] - Mirb Grid 1.4.0+ no blog' : 'cadastre blogs na aba 🌐 BLOGS';
      if (blogsCache.length) onPubBlogChange();
    });
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#publishClose').onclick = function () { $('#publishPanel').classList.add('hidden'); };
  $('#pubBlog').onchange = onPubBlogChange;
  $('#pubGo').onclick = startPublish;
}

function fillPubSummary() {
  const p1 = (state.results.p1_posts && state.results.p1_posts.json && state.results.p1_posts.json.posts) || [];
  const p2 = (state.results.p2_posts && state.results.p2_posts.json && state.results.p2_posts.json.posts) || [];
  const g = state.results.grid && state.results.grid.json;
  const q = state.results.quiz && state.results.quiz.json;
  $('#pubSummary').innerHTML = '<b>' + p2.length + '</b> P2 · ' + (g ? '<b>1</b> grid (' + (g.items || []).length + ' itens) · ' : '<span style="color:var(--amber)">sem grid</span> · ') + '<b>' + p1.length + '</b> P1' + (q ? ' com offerwall' : ' <span style="color:var(--amber)">(sem quiz/offerwall)</span>');
}

// URL do app: artifact nicheApp (bloco "App do nicho") > appUrl do cadastro do blog
function prefillAppUrl(b) {
  const na = state.artifacts && state.artifacts.nicheApp;
  const inp = $('#pubAppUrl');
  if (inp && !inp.value) {
    if (na && na.play_url) { inp.value = na.play_url; $('#pubAppHint').innerHTML = '🤖 <b>' + esc(na.app_name || 'app') + '</b> (' + esc(na.confidence || '?') + ') · ' + esc(na.why || ''); }
    else if (b && b.appUrl) inp.value = b.appUrl;
  }
  const ex = $('#pubExitUrl');
  if (ex && !ex.value && na && na.exit_url) { ex.value = na.exit_url; $('#pubExitHint').innerHTML = '🤖 <b>' + esc(na.exit_label || 'destino oficial') + '</b> · ' + esc(na.exit_why || ''); }
}

function onPubBlogChange() {
  const id = $('#pubBlog').value; if (!id) return;
  const b = blogsCache.find(function (x) { return x.id === id; });
  prefillAppUrl(b);
  const catSel = $('#pubCategory'); catSel.innerHTML = '<option value="">(carregando categorias…)</option>';
  testBlog(id).then(function (t) {
    pubCategories = (t && t.categories) || [];
    const niche = String(state.params.niche || '').toLowerCase();
    const pref = (b && b.defaultCategory ? b.defaultCategory : '').toLowerCase();
    catSel.innerHTML = '<option value="">(auto: criar/usar "' + esc(state.params.niche || 'Artigos') + '")</option>' + pubCategories.map(function (c) {
      const sel = (pref && c.name.toLowerCase() === pref) || (!pref && niche && c.name.toLowerCase() === niche) ? ' selected' : '';
      return '<option value="' + c.id + '"' + sel + '>' + esc(c.name) + ' (' + c.count + ')</option>';
    }).join('');
    if (t && t.ok === false) toast('Blog inacessível: ' + (t.error || ''));
    else if (t && !t.gridRest) toast('⚠ Esse blog não tem a rota do grid (MIRB GRID 1.4.0) — os P1 sairão sem grid.');
  });
}

function pubLog(msg, cls) {
  const log = $('#pubLog'); const line = document.createElement('div'); line.className = 'pub-line ' + (cls || ''); line.innerHTML = msg; log.appendChild(line); log.scrollTop = log.scrollHeight;
}

function startPublish() {
  const blogId = $('#pubBlog').value;
  if (!blogId) { toast('Cadastre um blog primeiro (aba 🌐 BLOGS).'); return; }
  if (!hasPosts()) { toast('Gere os Artigos P1/P2 antes.'); return; }
  const status = $('#pubStatus').value;
  if (status === 'publish' && !confirm('Publicar DIRETO (sem revisão)? Os posts ficam públicos na hora.')) return;
  const results = {};
  ['p1_posts', 'p2_posts', 'quiz'].forEach(function (b) { if (state.results[b] && state.results[b].json) results[b] = state.results[b].json; });
  if (state.results.grid && state.results.grid.json) results.grid = exportJson('grid', state.results.grid.json);
  const appUrl = $('#pubAppUrl').value.trim();
  if (!appUrl && !confirm('URL do app vazia: os P2 sairiam SEM o bloco de aplicativo (obrigatório na anatomia real). Publicar mesmo assim?')) return;
  const options = {
    status: status, appUrl: appUrl,
    appP1: $('#pubAppP1').checked,
    cardlinkP1: $('#pubCardP1').value, cardlinkP2: $('#pubCardP2').value,
    exitUrl: $('#pubExitUrl').value.trim()
  };
  if ($('#pubCategory').value) options.categoryId = +$('#pubCategory').value;
  $('#pubGo').disabled = true; $('#pubProgress').classList.remove('hidden'); $('#pubResult').classList.add('hidden'); $('#pubLog').innerHTML = ''; $('#pubBarFill').style.width = '2%';
  pubLog('⚡ conectando…');
  publishStream({ blogId: blogId, params: state.params, results: results, options: options }, {
    onPublishProgress: function (e) {
      if (e.step === 'connected') pubLog('✓ conectado como <b>' + esc(e.user) + '</b> (' + esc((e.roles || []).join(',')) + ')');
      else if (e.step === 'post') pubLog((e.kind === 'p1' ? '📄 P1' : '📑 P2') + ' #' + esc(e.index) + ' → <a href="' + esc(e.link) + '" target="_blank" rel="noopener">' + esc(e.title) + '</a> <span class="pin">id ' + esc(e.id) + ' · ' + esc(e.status) + '</span>');
      else if (e.step === 'cardlink') pubLog('🃏 cardlink P2 #' + esc(e.index) + (e.to ? ' → <span class="pin">' + esc(e.to) + '</span>' : ' (sem destino)'));
      else if (e.step === 'grid') pubLog('🧩 grid <b>#' + esc(e.id) + '</b> criado com ' + esc(e.items) + ' links reais · <span class="pin">' + esc(e.block) + '</span>');
      else if (e.step === 'warning') pubLog('⚠ ' + esc(e.message), 'warn');
      else if (e.step === 'progress') { $('#pubBarFill').style.width = Math.max(2, Math.round((e.done / Math.max(1, e.total)) * 100)) + '%'; }
      else if (e.step === 'done') pubLog('✓ concluído: ' + e.p2 + ' P2 · ' + e.p1 + ' P1' + (e.grid ? ' · grid #' + e.grid : '') + (e.warnings ? ' · ' + e.warnings + ' aviso(s)' : ''), 'ok');
    },
    onPublishDone: function (report) {
      $('#pubGo').disabled = false; $('#pubBarFill').style.width = '100%';
      renderPubResult(report);
      // grid do card passa a ter os links reais (export fica correto pra reuso)
      if (report.grid && state.results.grid && state.results.grid.json && Array.isArray(state.results.grid.json.items)) {
        state.results.grid.json.items.forEach(function (it, i) { const p2 = report.p2.find(function (x) { return x.index === i + 1; }) || report.p2[i]; if (p2) it.item_link = p2.idUrl; });
        state.results.grid.json._published_grid_id = report.grid.id;
        if (mainView && mainView.renderStatic) mainView.renderStatic('grid', state.results.grid);
      }
      toast('Publicado no blog ✓');
    },
    onPublishError: function (e) { $('#pubGo').disabled = false; pubLog('✕ ' + esc(e.message || 'erro'), 'err'); toast('Falha na publicação: ' + (e.message || '')); }
  });
}

function renderPubResult(r) {
  const box = $('#pubResult'); box.classList.remove('hidden');
  const row = function (kind, p) { return '<tr><td>' + kind + ' #' + esc(p.index) + '</td><td><a href="' + esc(p.link) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a></td><td><span class="pin">' + esc(p.idUrl) + '</span></td><td>' + esc(p.status) + '</td></tr>'; };
  box.innerHTML = '<h4>Resultado · ' + esc(r.blog) + ' · ' + esc(r.status) + '</h4>' +
    '<table class="pub-table"><thead><tr><th>Post</th><th>Título</th><th>URL por ID (usada no grid)</th><th>Status</th></tr></thead><tbody>' +
    r.p2.map(function (p) { return row('P2', p); }).join('') +
    (r.grid ? '<tr class="pub-grid-row"><td>GRID</td><td>#' + esc(r.grid.id) + ' · ' + esc(r.grid.items) + ' itens</td><td><span class="pin">' + esc(r.grid.block) + '</span></td><td><a href="' + esc(r.grid.edit_url) + '" target="_blank" rel="noopener">editar</a></td></tr>' : '') +
    r.p1.map(function (p) { return row('P1', p); }).join('') +
    '</tbody></table>' +
    (r.warnings && r.warnings.length ? '<div class="pub-warnings">' + r.warnings.map(function (w) { return '<div>⚠ ' + esc(w) + '</div>'; }).join('') + '</div>' : '');
}
