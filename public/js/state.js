// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — state.js
//  Estado central + persistência (localStorage) + utils puros.
//  Sem imports: é a base de todos os outros módulos.
// ============================================================
'use strict';

/* ---------- chaves de persistência ---------- */
const K = {
  pass:   'mbz_pass',       // sessionStorage
  key:    'mbz_key',        // localStorage
  model:  'mbz_model',      // localStorage
  draft:  'mbz_draft_v3',   // rascunho do wizard
  preset: 'mbz_presets_v3'  // presets nomeados
};

/* ---------- store em memória ---------- */
export const state = {
  cfg: null,                                    // /api/config
  model: localStorage.getItem(K.model) || '',   // id do modelo escolhido
  accessPass: sessionStorage.getItem(K.pass) || '',
  userKey: localStorage.getItem(K.key) || '',
  params: {},                                   // params do wizard (collectParams)
  artifacts: {},                                // cache de artifacts de TODO block_done
  results: {}                                   // block -> { json, raw, artifacts, warnings, status, review?, attempt? }
};

/* ---------- setters persistidos ---------- */
export function setModel(m) {
  state.model = m || '';
  if (m) localStorage.setItem(K.model, m);
}
export function setUserKey(k) {
  state.userKey = k || '';
  if (k) localStorage.setItem(K.key, k);
}
export function setAccessPass(p) {
  state.accessPass = p || '';
  if (p) sessionStorage.setItem(K.pass, p);
}

/* ---------- artifacts / resultados ---------- */
export function mergeArtifacts(a) {
  if (a && typeof a === 'object') Object.assign(state.artifacts, a);
}
export function setResult(block, data) {
  state.results[block] = Object.assign({}, state.results[block], data);
}
export function resetRun() {
  state.artifacts = {};
  state.results = {};
}

/* ---------- rascunho do wizard (auto-save com debounce) ---------- */
let draftTimer = null;
export function saveDraft(snapshot) {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(function () {
    try { localStorage.setItem(K.draft, JSON.stringify(snapshot)); } catch (e) {}
  }, 400);
}
export function loadDraft() {
  try { return JSON.parse(localStorage.getItem(K.draft) || 'null'); } catch (e) { return null; }
}
export function clearDraft() { localStorage.removeItem(K.draft); }

/* ---------- presets nomeados ---------- */
export function listPresets() {
  try { return JSON.parse(localStorage.getItem(K.preset) || '{}') || {}; } catch (e) { return {}; }
}
export function savePreset(name, snapshot) {
  const p = listPresets();
  p[name] = snapshot;
  localStorage.setItem(K.preset, JSON.stringify(p));
}
export function deletePreset(name) {
  const p = listPresets();
  delete p[name];
  localStorage.setItem(K.preset, JSON.stringify(p));
}

/* ---------- utils puros (compartilhados) ---------- */
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// extrai JSON de um texto (mesmo com lixo em volta) — tolerante
export function safeParse(t) {
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) {}
  const f = t.indexOf('{'), fa = t.indexOf('[');
  const s = f < 0 ? fa : fa < 0 ? f : Math.min(f, fa);
  if (s < 0) return null;
  const l = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (l > s) { try { return JSON.parse(t.slice(s, l + 1)); } catch (e) {} }
  return null;
}

let toastTimer = null;
export function toast(m) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}
