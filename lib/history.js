// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — history.js
//  Leitura/escrita atômica (tmp + rename) do histórico, cap de 200 entradas.
// ============================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_ENTRIES = 200;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Por bloco, persistimos só estes campos (§6): nada de base64/streams brutos.
// `review` é o veredito final pequeno {score,veredito,problemas,...}.
const BLOCK_KEEP = ['json', 'raw', 'artifacts', 'warnings', 'review'];

// Remove o base64 (`data`) de uma imagem, preservando media_type/metrics (§6: NUNCA persistir base64).
function stripImageData(im) {
  if (!im || typeof im !== 'object') return im;
  const rest = Object.assign({}, im);
  delete rest.data;
  return rest;
}
// Strip recursivo (§6: NUNCA persistir base64, em qualquer profundidade): copia o
// valor removendo `data` de todo objeto dentro de QUALQUER array chamado `images`,
// aninhado em qualquer nível (ex: params.review.params.creative_analysis.images).
// Escopo restrito a arrays `images` — não mexe em outros campos `data` legítimos.
// Cap de profundidade contra estruturas patológicas.
function stripBase64Deep(value, depth) {
  if (depth > 8 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => stripBase64Deep(v, depth + 1));
  const out = {};
  for (const k of Object.keys(value)) {
    if (k === 'images' && Array.isArray(value[k])) {
      out[k] = value[k].map(im => stripImageData(im));
    } else {
      out[k] = stripBase64Deep(value[k], depth + 1);
    }
  }
  return out;
}

// Sanitiza uma entrada de histórico ANTES do write: tira base64 de qualquer array
// `images` (em qualquer profundidade) e reduz cada bloco a BLOCK_KEEP. Idempotente.
function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const e = Object.assign({}, entry);

  if (Array.isArray(e.images)) e.images = e.images.map(stripImageData);
  if (e.body && typeof e.body === 'object' && !Array.isArray(e.body)) e.body = stripBase64Deep(e.body, 0);
  if (e.params && typeof e.params === 'object' && !Array.isArray(e.params)) e.params = stripBase64Deep(e.params, 0);

  if (e.blocks && typeof e.blocks === 'object' && !Array.isArray(e.blocks)) {
    const blocks = {};
    Object.keys(e.blocks).forEach(b => {
      const src = e.blocks[b];
      if (src && typeof src === 'object' && !Array.isArray(src)) {
        const kept = {};
        BLOCK_KEEP.forEach(kk => { if (src[kk] !== undefined) kept[kk] = src[kk]; });
        blocks[b] = kept;
      } else {
        blocks[b] = src;
      }
    });
    e.blocks = blocks;
  }

  return e;
}

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}

function writeHistory(arr) {
  ensureDir();
  const capped = (Array.isArray(arr) ? arr.slice(-MAX_ENTRIES) : []).map(sanitizeEntry);
  const tmp = HISTORY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(capped, null, 2));
  fs.renameSync(tmp, HISTORY_FILE);
}

module.exports = { readHistory, writeHistory, sanitizeEntry, DATA_DIR, HISTORY_FILE, MAX_ENTRIES };
