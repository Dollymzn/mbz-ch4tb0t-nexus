// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — main.js (entry point, type=module)
//  Bootstrap: FX, config/auth, tabs/modos, modelos, forja
//  (orquestração via runStream), otimizador, histórico, modais.
// ============================================================
'use strict';

import { state, esc, toast, setModel, setUserKey, setAccessPass, resetRun, mergeArtifacts } from './state.js';
import { initFX, startClock } from './fx.js';
import { getConfig, auth, getHistory, saveHistory, deleteHistory } from './api.js';
import { makeRunView } from './render.js';
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
    if (!state.model && Array.isArray(cfg.models) && cfg.models.length) setModel(cfg.models[0].id);
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
  wireTabs(); wireModes(); wireKeyModal(); wireOptimizer(); wireOutputActions();
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
      if (tb === 'history') loadHistory();
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
  const VISUAL_BLOCKS = ['fb_images', 'image_prompts', 'creatives_prompt', 'video_prompts'];
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
    ['onboard', 'sequence', 'grid'].forEach(function (b) { const r = state.results[b]; if (r && r.json) { dlJson(r.json, downloadName(b)); n++; } });
    if (!n) toast('Nenhum JSON para baixar.');
  };
}
function downloadName(b) {
  const name = (state.params.niche || 'funil').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (b === 'sequence' ? 'sequencia' : b === 'grid' ? 'mirb-grid' : b) + '-' + name + '.json';
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
