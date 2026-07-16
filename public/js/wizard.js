// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — wizard.js
//  Os 5 passos, validação, collectParams (SEM platform),
//  steppers, prévia do grid, block picker, rascunho auto-salvo,
//  presets nomeados e sugestões (nome/fotos FB) via runStream.
// ============================================================
'use strict';

import { state, esc, toast, saveDraft, loadDraft, clearDraft, listPresets, savePreset, deletePreset } from './state.js';
import { runStream } from './api.js';
import { BLOCKS, makeRunView, cleanText } from './render.js';

const $ = function (s) { return document.querySelector(s); };
const $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };

const STEP_LABELS = ['Nicho', 'Idioma & Voz', 'Estrutura', 'Criativos', 'Gerar'];
const FIELD_IDS = ['niche', 'geoCountry', 'campaignLang', 'pageName', 'flowLang', 'contentLang', 'currency',
  'persona', 'modelWizard', 'onboardRoutes', 'onboardRouteType', 'seqRoutes', 'numP1', 'gridCols', 'gridRows',
  'numCreatives', 'creativePlatform', 'creativeSize', 'numVideos'];
const CHECK_IDS = ['imagePrompts', 'wantCreatives', 'wantAudios', 'wantVideos', 'utmNative', 'agentQuality'];

let curStep = 1;
const totalSteps = 5;
let defaultSnapshot = null; // estado pristino (defaults), capturado ANTES de restaurar rascunho

/* ============================================================ */
export function initWizard() {
  buildWizardRail();
  buildBlockPick();
  buildPresetBar();
  wireWizard();
  // captura os defaults ANTES de restaurar o rascunho — é o que o "Novo funil" restaura
  defaultSnapshot = snapshotWizard();
  const draft = loadDraft();
  if (draft) { restoreWizard(draft); toast('Rascunho restaurado.'); }
  gridUpd();
  updateCreativeUI();
  updateVideoUI();
  syncBlockToggles();
  updateSummary();
  gotoStep(1);
}

/* ---------- rail ---------- */
function buildWizardRail() {
  const el = $('#railSteps'); el.innerHTML = '';
  STEP_LABELS.forEach(function (lb, i) {
    const n = i + 1;
    const d = document.createElement('div');
    d.className = 'rail-node' + (n === 1 ? ' active' : '');
    d.innerHTML = '<div class="rail-num">' + n + '</div><div class="rail-label">' + esc(lb) + '</div>';
    d.onclick = function () { if (n < curStep) gotoStep(n); };
    el.appendChild(d);
  });
}

/* ---------- wiring ---------- */
function wireWizard() {
  $('#wizNext').onclick = function () { if (!validateStep(curStep)) return; if (curStep < totalSteps) gotoStep(curStep + 1); };
  $('#wizPrev').onclick = function () { if (curStep > 1) gotoStep(curStep - 1); };

  $$('[data-inc]').forEach(function (b) {
    b.onclick = function () { const t = $('#' + b.getAttribute('data-inc')); t.value = Math.min(+t.max || 999, (+t.value || 0) + 1); t.dispatchEvent(new Event('input', { bubbles: true })); };
  });
  $$('[data-dec]').forEach(function (b) {
    b.onclick = function () { const t = $('#' + b.getAttribute('data-dec')); t.value = Math.max(+t.min || 0, (+t.value || 0) - 1); t.dispatchEvent(new Event('input', { bubbles: true })); };
  });

  $('#gridCols').oninput = gridUpd;
  $('#gridRows').oninput = gridUpd;
  ['niche', 'numP1', 'seqRoutes', 'onboardRoutes'].forEach(function (id) { $('#' + id).addEventListener('input', updateSummary); });

  $('#suggestName').onclick = suggestNames;
  $('#genFbPhotos').onclick = genFbPhotos;

  $('#wantCreatives').onchange = function () { updateCreativeUI(); syncBlockToggles(); };
  $$('input[name=creativeType]').forEach(function (r) { r.onchange = function () { updateCreativeUI(); syncBlockToggles(); }; });
  $('#imagePrompts').onchange = syncBlockToggles;
  $('#wantAudios').onchange = syncBlockToggles;
  $('#wantVideos').onchange = function () { updateVideoUI(); syncBlockToggles(); };
  $('#agentQuality').onchange = function () { updateSummary(); scheduleDraft(); };

  // auto-save do rascunho: qualquer input/change no wizard
  const wiz = $('#wizard');
  wiz.addEventListener('input', scheduleDraft);
  wiz.addEventListener('change', scheduleDraft);
}

function updateCreativeUI() {
  $('#creativeOpts').classList.toggle('hidden', !$('#wantCreatives').checked);
  const imgOnly = (document.querySelector('input[name=creativeType]:checked') || {}).value === 'imagem';
  $('#audioCard').style.display = imgOnly ? 'none' : '';
  if (imgOnly) $('#wantAudios').checked = false;
}
// vídeos Veo/Flow: mostra o stepper numVideos só com o toggle wantVideos ligado
// (mesmo padrão de wantCreatives -> creativeOpts).
function updateVideoUI() {
  const opts = $('#videoOpts');
  if (opts) opts.classList.toggle('hidden', !$('#wantVideos').checked);
}

function gridUpd() {
  const c = +$('#gridCols').value || 1, r = +$('#gridRows').value || 1;
  $('#gridCalc').textContent = c * r;
  drawGridPreview(c, r);
  updateSummary();
}
function drawGridPreview(c, r) {
  const el = $('#gridPreview');
  el.style.gridTemplateColumns = 'repeat(' + c + ',1fr)';
  el.innerHTML = '';
  const n = Math.min(c * r, 32);
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'grid-cell';
    d.style.animationDelay = (i * 0.03) + 's';
    d.textContent = 'P2';
    el.appendChild(d);
  }
}

function validateStep(s) {
  if (s === 1 && !$('#niche').value.trim()) { toast('Digite o nicho primeiro.'); return false; }
  return true;
}

export function gotoStep(n) {
  curStep = n;
  $$('.step').forEach(function (st) { st.classList.toggle('active', +st.getAttribute('data-step') === n); });
  $$('.rail-node').forEach(function (nd, i) { nd.classList.toggle('active', i + 1 === n); nd.classList.toggle('done', i + 1 < n); });
  $('#railFill').style.width = (n / totalSteps * 100) + '%';
  $('#wizPrev').style.visibility = n === 1 ? 'hidden' : 'visible';
  $('#wizNext').classList.toggle('hidden', n === totalSteps);
  $('#wizForge').classList.toggle('hidden', n !== totalSteps);
  if (n === totalSteps) updateSummary();
  if (n === 2) {
    const cl = $('#campaignLang'), ce = $('#campaignLangEcho');
    if (ce && cl) {
      const lbl = cl.options[cl.selectedIndex] ? cl.options[cl.selectedIndex].text : '';
      const geo = $('#geoCountry').value.trim();
      ce.textContent = (geo ? geo + ' · ' : '') + lbl;
    }
  }
  $('#wizard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- block picker ---------- */
function buildBlockPick() {
  const el = $('#blockPick'); el.innerHTML = '';
  BLOCKS.forEach(function (b) {
    const d = document.createElement('div');
    d.className = 'blk' + (b.def ? ' on' : '');
    d.dataset.block = b.id;
    d.innerHTML = '<div class="blk-check">✓</div><div><span class="blk-name">' + esc(b.name) + '</span><small>' + esc(b.hint) + '</small></div>';
    d.onclick = function () { d.classList.toggle('on'); updateSummary(); scheduleDraft(); };
    el.appendChild(d);
  });
}
export function syncBlockToggles() {
  setBlk('image_prompts', $('#imagePrompts').checked);
  setBlk('creatives_prompt', $('#wantCreatives').checked);
  setBlk('audios', $('#wantAudios').checked);
  setBlk('video_prompts', $('#wantVideos').checked);
  updateSummary();
  scheduleDraft();
}
function setBlk(id, on) { const d = $('.blk[data-block="' + id + '"]'); if (d) d.classList.toggle('on', on); }
export function selectedBlocks() { return $$('.blk.on').map(function (d) { return d.dataset.block; }); }

export function updateSummary() {
  const c = +$('#gridCols').value || 1, r = +$('#gridRows').value || 1;
  const blocks = selectedBlocks();
  const reviewable = ['onboard', 'sequence', 'meta_copy', 'creatives_prompt'].filter(function (b) { return blocks.indexOf(b) >= 0; }).length;
  const ag = $('#agentQuality');
  const hint = $('#agentCostHint');
  if (hint) hint.textContent = '+ até ' + (ag && ag.checked ? reviewable : 0) + ' revisões nesta run';
  const s = $('#summary'); if (!s) return;
  s.innerHTML = 'Vou gerar <b>' + esc($('#niche').value || '(nicho)') + '</b> com <b>' + esc($('#seqRoutes').value) +
    '</b> sequência(s) completas, <b>' + esc($('#numP1').value) + '</b> P1 (+ ' + esc($('#numP1').value) +
    ' quizzes), grid <b>' + c + '×' + r + '</b> = <b>' + (c * r) + '</b> P2s.<br>Blocos: <b>' + blocks.length + '</b> selecionados.' +
    (ag && ag.checked ? '<br><span class="agent-cost-line">🛡 Agente ligado: + até ' + reviewable + ' revisões nesta run.</span>' : '');
}

/* ---------- collectParams (SEM platform) ---------- */
export function collectParams() {
  const ps = $('#persona');
  state.params = {
    niche: $('#niche').value.trim(), pageName: $('#pageName').value.trim(), geoCountry: $('#geoCountry').value.trim(),
    flowLang: $('#flowLang').value, contentLang: $('#contentLang').value, campaignLang: $('#campaignLang').value, currency: $('#currency').value,
    persona: ps.value, personaLabel: ps.options[ps.selectedIndex] ? ps.options[ps.selectedIndex].text : '',
    onboardRoutes: +$('#onboardRoutes').value, onboardRouteType: $('#onboardRouteType').value,
    seqRoutes: +$('#seqRoutes').value, numP1: +$('#numP1').value,
    gridCols: +$('#gridCols').value, gridRows: +$('#gridRows').value,
    numCreatives: +$('#numCreatives').value, creativePlatform: $('#creativePlatform').value, creativeSize: $('#creativeSize').value,
    creativeType: (document.querySelector('input[name=creativeType]:checked') || {}).value || 'completo',
    numVideos: +$('#numVideos').value,
    imagePrompts: $('#imagePrompts').checked,
    utmNative: $('#utmNative').checked
  };
  return state.params;
}

/* ---------- snapshot / restore (rascunho + presets) ---------- */
export function snapshotWizard() {
  const snap = { fields: {}, checks: {}, creativeType: (document.querySelector('input[name=creativeType]:checked') || {}).value || 'completo', blocks: selectedBlocks() };
  FIELD_IDS.forEach(function (id) { const el = $('#' + id); if (el) snap.fields[id] = el.value; });
  CHECK_IDS.forEach(function (id) { const el = $('#' + id); if (el) snap.checks[id] = el.checked; });
  return snap;
}
export function restoreWizard(snap) {
  if (!snap) return;
  if (snap.fields) FIELD_IDS.forEach(function (id) {
    if (snap.fields[id] == null) return;
    const el = $('#' + id); if (!el) return;
    el.value = snap.fields[id];
    if (id === 'modelWizard') el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (snap.checks) CHECK_IDS.forEach(function (id) { const el = $('#' + id); if (el && snap.checks[id] != null) el.checked = snap.checks[id]; });
  if (snap.creativeType) { const r = document.querySelector('input[name=creativeType][value="' + snap.creativeType + '"]'); if (r) r.checked = true; }
  if (Array.isArray(snap.blocks)) {
    $$('.blk').forEach(function (d) { d.classList.toggle('on', snap.blocks.indexOf(d.dataset.block) >= 0); });
  }
  gridUpd(); updateCreativeUI(); updateVideoUI(); syncBlockToggles(); updateSummary();
}
function scheduleDraft() { saveDraft(snapshotWizard()); }
export function resetDraft() { clearDraft(); }

// "Novo funil": apaga o rascunho e volta TUDO aos defaults (persona sem_persona, nicho
// vazio, etc.), sem arrastar estado de um funil anterior. Presets salvos são preservados.
export function newFunnel() {
  clearDraft();
  if (defaultSnapshot) restoreWizard(defaultSnapshot);
  const chips = $('#nameChips'); if (chips) chips.innerHTML = '';
  const fbOut = $('#fbPhotosOut'); if (fbOut) fbOut.innerHTML = '';
  scheduleDraft(); // salva o estado limpo como novo rascunho
  gotoStep(1);
  toast('Novo funil — campos limpos.');
}

/* ---------- presets UI ---------- */
function buildPresetBar() {
  const bar = $('#presetBar'); if (!bar) return;
  bar.innerHTML =
    '<div class="preset-row">' +
      '<input type="text" id="presetName" placeholder="nome do preset" class="preset-input">' +
      '<button id="presetSave" class="btn-ghost-sm" type="button">💾 salvar preset</button>' +
      '<button id="newFunnel" class="btn-ghost-sm" type="button" title="Limpa o rascunho e volta tudo aos padrões">🧹 novo funil</button>' +
    '</div>' +
    '<div class="preset-chips" id="presetChips"></div>';
  $('#presetSave').onclick = function () {
    const name = ($('#presetName').value || '').trim();
    if (!name) { toast('Dê um nome ao preset.'); return; }
    savePreset(name, snapshotWizard());
    $('#presetName').value = '';
    renderPresetChips();
    toast('Preset salvo: ' + name);
  };
  $('#newFunnel').onclick = function () {
    if (confirm('Começar um funil novo? Isso limpa o nicho, persona e todos os campos (os presets salvos são mantidos).')) newFunnel();
  };
  renderPresetChips();
}
function renderPresetChips() {
  const wrap = $('#presetChips'); if (!wrap) return;
  const presets = listPresets();
  const names = Object.keys(presets);
  if (!names.length) { wrap.innerHTML = '<span class="preset-empty">nenhum preset salvo</span>'; return; }
  wrap.innerHTML = '';
  names.forEach(function (name) {
    const chip = document.createElement('span');
    chip.className = 'chip preset-chip';
    chip.innerHTML = esc(name) + '<b class="preset-del" title="excluir">×</b>';
    chip.querySelector('.preset-del').onclick = function (e) {
      e.stopPropagation();
      if (confirm('Excluir preset "' + name + '"?')) { deletePreset(name); renderPresetChips(); }
    };
    chip.onclick = function () { restoreWizard(presets[name]); scheduleDraft(); toast('Preset carregado: ' + name); };
    wrap.appendChild(chip);
  });
}

/* ---------- sugestão de nomes (page_name via runStream) ---------- */
function requireKey() {
  if (!state.cfg.serverKey && !state.userKey) { $('#keyModal').classList.remove('hidden'); return false; }
  return true;
}
function suggestNames(e) {
  if (e) e.preventDefault();
  const niche = $('#niche').value.trim();
  if (!niche) { toast('Digite o nicho primeiro.'); return; }
  if (!requireKey()) return;
  const btn = $('#suggestName'); const label = btn.textContent; btn.textContent = '...';
  collectParams();
  runSingle('page_name', state.params).then(function (res) {
    btn.textContent = label;
    const j = res.json;
    if (j && j.names) {
      $('#pageName').value = j.names[0];
      const ch = $('#nameChips'); ch.innerHTML = '';
      j.names.forEach(function (n) {
        const c = document.createElement('span'); c.className = 'chip'; c.textContent = n;
        c.onclick = function () { $('#pageName').value = n; scheduleDraft(); };
        ch.appendChild(c);
      });
      scheduleDraft();
    } else { toast('Sem sugestões.'); }
  }).catch(function (err) { btn.textContent = label; toast(err.message || 'Falha ao sugerir.'); });
}

/* ---------- fotos + bio + post (fb_images via runStream, com streaming) ---------- */
function genFbPhotos(e) {
  if (e) e.preventDefault();
  const niche = $('#niche').value.trim();
  if (!niche) { toast('Digite o nicho primeiro.'); return; }
  if (!$('#pageName').value.trim()) { toast('Defina o nome da página primeiro.'); return; }
  if (!requireKey()) return;
  collectParams();
  const cont = $('#fbPhotosOut'); cont.innerHTML = '';
  const view = makeRunView(cont);
  // gera o character sheet (persona_identity) ANTES da 1a foto se ainda não existir —
  // garante o MESMO rosto em toda imagem/vídeo do funil. Depois fica em cache (state.artifacts).
  const blocks = state.artifacts.personaIdentity ? ['fb_images'] : ['persona_identity', 'fb_images'];
  blocks.forEach(function (b) { view.ensureCard(b); });
  view.start({ blocks: blocks, params: state.params, model: state.model });
}

// executa 1 bloco e resolve com {json,raw,artifacts,warnings} do block_done
function runSingle(block, params, artifacts) {
  return new Promise(function (resolve, reject) {
    let got = null, done = false;
    function settle() { if (done) return; done = true; got ? resolve(got) : reject(new Error('sem resultado')); }
    runStream({ blocks: [block], params: params, model: state.model, artifacts: artifacts || {} }, {
      onBlockDone: function (d) { if (d.block === block) got = { json: d.json, raw: d.raw, artifacts: d.artifacts, warnings: d.warnings }; },
      onBlockError: function (d) { if (d.block === block && !done) { done = true; reject(new Error(d.message || 'erro no bloco')); } },
      onRunDone: settle,
      onRunError: function (d) { if (!done) { done = true; reject(new Error((d && d.message) || 'erro')); } },
      onStreamEnd: settle
    });
  });
}

export { cleanText };
