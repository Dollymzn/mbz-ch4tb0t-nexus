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

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}

function writeHistory(arr) {
  ensureDir();
  const capped = Array.isArray(arr) ? arr.slice(-MAX_ENTRIES) : [];
  const tmp = HISTORY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(capped, null, 2));
  fs.renameSync(tmp, HISTORY_FILE);
}

module.exports = { readHistory, writeHistory, DATA_DIR, HISTORY_FILE, MAX_ENTRIES };
