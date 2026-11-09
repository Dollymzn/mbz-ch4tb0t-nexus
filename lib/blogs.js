// ============================================================
//  MBZ::CH4TB0T NEXUS v4.1 — lib/blogs.js
//  Cadastro dos blogs WordPress do Publisher. Arquivo DATA_DIR/blogs.json
//  (volume do Railway) com a senha de aplicação cifrada em AES-256-GCM.
//  Chave = sha256(BLOGS_SECRET || ACCESS_PASSWORD || 'nexus-dev-key').
//  A senha NUNCA volta pro front (listagem mascarada); só lib/wp.js a usa.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const BLOGS_FILE = path.join(DATA_DIR, 'blogs.json');

function key() {
  const secret = process.env.BLOGS_SECRET || process.env.ACCESS_PASSWORD || 'nexus-dev-key';
  return crypto.createHash('sha256').update(String(secret)).digest();
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + iv.toString('base64') + ':' + c.getAuthTag().toString('base64') + ':' + enc.toString('base64');
}
function decrypt(blob) {
  const parts = String(blob || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('senha cifrada inválida (BLOGS_SECRET mudou?)');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(parts[1], 'base64'));
  d.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([d.update(Buffer.from(parts[3], 'base64')), d.final()]).toString('utf8');
}

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function readAll() {
  try { return JSON.parse(fs.readFileSync(BLOGS_FILE, 'utf8')) || []; } catch (e) { return []; }
}
function writeAll(arr) {
  ensureDir();
  const tmp = BLOGS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
  fs.renameSync(tmp, BLOGS_FILE);
}

function normUrl(u) { return String(u || '').trim().replace(/\/+$/, '').replace(/\/wp-admin.*$/i, '').replace(/\/wp-json.*$/i, ''); }

// Listagem segura (sem senha)
function listBlogs() {
  return readAll().map(b => ({ id: b.id, name: b.name, url: b.url, user: b.user, appUrl: b.appUrl || '', defaultCategory: b.defaultCategory || '', created_at: b.created_at, last_ok: b.last_ok || null }));
}

function addBlog({ name, url, user, appPassword, appUrl, defaultCategory }) {
  url = normUrl(url);
  if (!/^https?:\/\/[^/]+/i.test(url)) throw new Error('URL do blog inválida (use https://blog.exemplo.com)');
  if (!user || !appPassword) throw new Error('usuário e senha de aplicação são obrigatórios');
  const arr = readAll();
  const existing = arr.find(b => b.url === url && b.user === user);
  const entry = {
    id: existing ? existing.id : crypto.randomUUID(),
    name: String(name || url.replace(/^https?:\/\//, '')).trim(),
    url, user: String(user).trim(),
    secret: encrypt(String(appPassword).replace(/\s+/g, ' ').trim()),
    appUrl: String(appUrl || '').trim(),
    defaultCategory: String(defaultCategory || '').trim(),
    created_at: existing ? existing.created_at : new Date().toISOString()
  };
  const out = existing ? arr.map(b => (b.id === existing.id ? entry : b)) : arr.concat([entry]);
  writeAll(out);
  return { id: entry.id, name: entry.name, url: entry.url, user: entry.user, appUrl: entry.appUrl, defaultCategory: entry.defaultCategory };
}

function removeBlog(id) {
  const arr = readAll();
  writeAll(arr.filter(b => b.id !== id));
  return true;
}

// Credenciais completas (uso interno: lib/wp.js)
function getBlogCredentials(id) {
  const b = readAll().find(x => x.id === id);
  if (!b) return null;
  return { id: b.id, name: b.name, url: b.url, user: b.user, appPassword: decrypt(b.secret), appUrl: b.appUrl || '', defaultCategory: b.defaultCategory || '' };
}

function markOk(id, info) {
  const arr = readAll();
  writeAll(arr.map(b => (b.id === id ? Object.assign({}, b, { last_ok: Object.assign({ at: new Date().toISOString() }, info || {}) }) : b)));
}

module.exports = { listBlogs, addBlog, removeBlog, getBlogCredentials, markOk, encrypt, decrypt, BLOGS_FILE };
