// ============================================================
//  MBZ::CH4TB0T NEXUS v4.2 — lib/users.js
//  Usuários (users.json no volume), senha com scrypt, sessão por token HMAC
//  (stateless: sobrevive a redeploy), papéis master|gestor.
//
//  Bootstrap do master (primeiro boot sem users.json):
//    1) MASTER_USER + MASTER_PASSWORD no ambiente → cria o master
//    2) senão, ACCESS_PASSWORD (legado) → master "master" com essa senha
//    3) senão → "primeiro acesso": o primeiro login cria o master (gate avisa)
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./datadir');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_DAYS = 30;
const SECRET = crypto.createHash('sha256').update(String(process.env.SESSION_SECRET || process.env.BLOGS_SECRET || process.env.MASTER_PASSWORD || process.env.ACCESS_PASSWORD || 'nexus-dev-key')).digest();

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function readAll() {
  try { const a = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function writeAll(arr) {
  ensureDir();
  const tmp = USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
  fs.renameSync(tmp, USERS_FILE);
}

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return salt + ':' + h;
}
function verifyPassword(pw, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  const [salt, h] = stored.split(':');
  const cand = crypto.scryptSync(String(pw || ''), salt, 32);
  const have = Buffer.from(h, 'hex');
  return cand.length === have.length && crypto.timingSafeEqual(cand, have);
}
function normName(n) { return String(n || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32); }
function publicUser(u) { return u ? { id: u.id, name: u.name, role: u.role, active: u.active !== false, created_at: u.created_at, last_login: u.last_login || null } : null; }

// ---- bootstrap ----
// NUNCA derruba o servidor: senha curta vinda do ambiente é aceita (o master troca depois); qualquer
// outro erro cai em first-run com aviso no log.
function bootstrap() {
  const arr = readAll();
  const mu = normName(process.env.MASTER_USER), mp = process.env.MASTER_PASSWORD;
  if (arr.length) {
    // v4.2.1: as vars MASTER_* são a fonte de verdade — garantem o master mesmo com users.json já criado
    if (mu && mp) {
      try {
        const u = arr.find(x => x.name === mu);
        if (!u) { createUser({ name: mu, password: mp, role: 'master' }, { allowShort: true }); return { created: true, mode: 'env+users' }; }
        let changed = false;
        if (u.role !== 'master') { u.role = 'master'; changed = true; }
        if (u.active === false) { u.active = true; changed = true; }
        if (!verifyPassword(mp, u.pass)) { u.pass = hashPassword(mp); u.pass_changed_at = new Date().toISOString(); changed = true; }
        if (changed) { writeAll(arr); return { created: false, mode: 'env-sync' }; }
      } catch (e) { console.error('[users] sync do master pelo ambiente falhou: ' + e.message); }
    }
    return { created: false, mode: 'users' };
  }
  try {
    if (mu && mp) { createUser({ name: mu, password: mp, role: 'master' }, { allowShort: true }); return { created: true, mode: 'env' }; }
    if (process.env.ACCESS_PASSWORD) { createUser({ name: 'master', password: process.env.ACCESS_PASSWORD, role: 'master' }, { allowShort: true }); return { created: true, mode: 'legacy' }; }
  } catch (e) {
    console.error('[users] bootstrap do master falhou (' + e.message + ') — caindo em primeiro acesso');
  }
  return { created: false, mode: 'first-run' };
}
function isFirstRun() { return readAll().length === 0; }

// ---- CRUD ----
function listUsers() { return readAll().map(publicUser); }
function findByName(name) { const n = normName(name); return readAll().find(u => u.name === n) || null; }
function findById(id) { return readAll().find(u => u.id === id) || null; }
function createUser({ name, password, role }, opts) {
  const n = normName(name);
  if (!n) throw new Error('nome de usuário inválido (a-z, 0-9, . _ -)');
  const minLen = opts && opts.allowShort ? 1 : 6;
  if (String(password || '').length < minLen) throw new Error(minLen === 1 ? 'senha vazia' : 'senha precisa ter 6+ caracteres');
  const arr = readAll();
  if (arr.find(u => u.name === n)) throw new Error('usuário já existe');
  const u = { id: crypto.randomUUID(), name: n, pass: hashPassword(password), role: role === 'master' ? 'master' : 'gestor', active: true, created_at: new Date().toISOString() };
  arr.push(u); writeAll(arr);
  return publicUser(u);
}
function setPassword(id, password) {
  if (String(password || '').length < 6) throw new Error('senha precisa ter 6+ caracteres');
  const arr = readAll(); const u = arr.find(x => x.id === id); if (!u) throw new Error('usuário não encontrado');
  u.pass = hashPassword(password); u.pass_changed_at = new Date().toISOString(); writeAll(arr);
  return publicUser(u);
}
function setActive(id, active) {
  const arr = readAll(); const u = arr.find(x => x.id === id); if (!u) throw new Error('usuário não encontrado');
  if (u.role === 'master' && !active) throw new Error('o master não pode ser desativado');
  u.active = !!active; writeAll(arr);
  return publicUser(u);
}
function masterId() { const m = readAll().find(u => u.role === 'master'); return m ? m.id : null; }

// ---- sessão (token HMAC, stateless) ----
function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function unb64u(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
function sign(payload) { return b64u(crypto.createHmac('sha256', SECRET).update(payload).digest()); }
function issueToken(u) {
  const body = b64u(JSON.stringify({ uid: u.id, exp: Date.now() + SESSION_DAYS * 86400000, v: u.pass_changed_at || '' }));
  return body + '.' + sign(body);
}
function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  let data; try { data = JSON.parse(unb64u(body).toString('utf8')); } catch (e) { return null; }
  if (!data || !data.uid || data.exp < Date.now()) return null;
  const u = findById(data.uid);
  if (!u || u.active === false) return null;
  if ((u.pass_changed_at || '') !== (data.v || '')) return null; // trocou a senha → sessões antigas caem
  return u;
}
function login(name, password) {
  let arr = readAll();
  const n = normName(name);
  let u = arr.find(x => x.name === n);
  if (!u && arr.length === 0) { // primeiro acesso: cria o master
    const created = createUser({ name: n, password, role: 'master' });
    arr = readAll(); u = arr.find(x => x.id === created.id);
  }
  if (!u || u.active === false || !verifyPassword(password, u.pass)) return null;
  u.last_login = new Date().toISOString();
  writeAll(arr.map(x => x.id === u.id ? u : x));
  return { token: issueToken(u), user: publicUser(u) };
}

module.exports = { bootstrap, isFirstRun, listUsers, findByName, findById, createUser, setPassword, setActive, masterId, login, verifyToken, publicUser, USERS_FILE, hashPassword, verifyPassword };
