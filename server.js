// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — MBOLIVEIRAZ MEDIA & TECH
//  Backend FINO: wiring Express + rotas. Geração via lib/orchestrator (SSE).
// ============================================================
const express = require('express');
const path = require('path');
const crypto = require('crypto');

const {
  PERSONAS, PERSONA_GROUPS, LANGUAGES, CURRENCIES, COUNTRIES, CREATIVE_PLATFORMS, CREATIVE_SIZES,
  buildSystemPrompt
} = require('./prompts');
const { openSSE } = require('./lib/sse');
const { runOrchestration } = require('./lib/orchestrator');
const { validateParams } = require('./lib/validate');
const { readHistory, writeHistory } = require('./lib/history');
const blogs = require('./lib/blogs');
const { storageInfo } = require('./lib/datadir');
const users = require('./lib/users');
const { WPClient, publishFunnel } = require('./lib/wp');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';

// Catálogo de modelos servido pelo backend (frontend não hardcoda mais).
const MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (recomendado)' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5 (qualidade máxima)' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1 (fronteira · caro)' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (econômico)' }
];

app.use(express.json({ limit: '10mb' })); // v3.1: imagens base64 no body (§2)
app.use(express.static(path.join(__dirname, 'public')));

// ---- auth helpers (mantidos da fase 2: rate-limit + timingSafeEqual) ----
const AUTH_WINDOW_MS = 60 * 1000;
const AUTH_MAX_ATTEMPTS = 5;
const authAttempts = new Map(); // ip -> { count, windowStart }

function constantTimeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a == null ? '' : a)).digest();
  const hb = crypto.createHash('sha256').update(String(b == null ? '' : b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function resolveKey(req) {
  if (SERVER_API_KEY) return SERVER_API_KEY;
  const h = req.get('x-user-key');
  return h && h.trim() ? h.trim() : null;
}
// v4.2 — sessão por token (header x-access-pass carrega o token de sessão). Define req.user.
function authUser(req) {
  if (req.user !== undefined) return req.user;
  const u = users.verifyToken(req.get('x-access-pass') || (req.query && req.query.token) || '');
  req.user = u || null;
  return req.user;
}
function checkPassword(req) { return !!authUser(req); }
function isMaster(req) { const u = authUser(req); return !!(u && u.role === 'master'); }
function canSee(req, ownerId) { const u = authUser(req); return !!u && (u.role === 'master' || !ownerId || ownerId === u.id); }
function requireMaster(req, res) { if (!checkPassword(req)) { res.status(401).json({ error: 'Acesso negado.' }); return false; } if (!isMaster(req)) { res.status(403).json({ error: 'Só o master pode fazer isso.' }); return false; } return true; }
const bootInfo = users.bootstrap();
if (bootInfo.created || bootInfo.mode === 'users' || bootInfo.mode === 'env-sync') { const mid = users.masterId(); if (mid) { const n = blogs.claimOrphans(mid); if (n) console.log(`migração: ${n} blog(s) sem dono → master`); } }

// ---- /api/config ----
app.get('/api/config', (req, res) => {
  res.json({
    serverKey: !!SERVER_API_KEY, needPassword: true, firstRun: users.isFirstRun(), me: users.publicUser(authUser(req)),
    personas: PERSONAS, personaGroups: PERSONA_GROUPS, languages: LANGUAGES, currencies: CURRENCIES, countries: COUNTRIES,
    creativePlatforms: CREATIVE_PLATFORMS, creativeSizes: CREATIVE_SIZES,
    models: MODELS
  });
});

// ---- /api/auth — login por usuário (rate-limit 5/60s por IP). Primeiro acesso sem users.json cria o master. ----
app.post('/api/auth', (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  let entry = authAttempts.get(ip);
  if (!entry || now - entry.windowStart > AUTH_WINDOW_MS) { entry = { count: 0, windowStart: now }; authAttempts.set(ip, entry); }
  if (entry.count >= AUTH_MAX_ATTEMPTS) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde 1 minuto.' });
  const body = req.body || {};
  // compat: token antigo/sessão válida passada como "password" → renova
  if (!body.user && body.password) { const u = users.verifyToken(body.password); if (u) return res.json({ ok: true, token: body.password, user: users.publicUser(u) }); }
  let r = null;
  try { r = users.login(body.user, body.password); } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
  if (r) { authAttempts.delete(ip); return res.json({ ok: true, token: r.token, user: r.user }); }
  entry.count++;
  res.status(401).json({ ok: false, error: 'Usuário ou senha incorretos.' });
});
app.get('/api/me', (req, res) => {
  const u = authUser(req); if (!u) return res.status(401).json({ error: 'Acesso negado.' });
  res.json(users.publicUser(u));
});
app.post('/api/me/password', (req, res) => {
  const u = authUser(req); if (!u) return res.status(401).json({ error: 'Acesso negado.' });
  const b = req.body || {};
  if (!users.verifyPassword(b.current, users.findById(u.id).pass)) return res.status(400).json({ error: 'senha atual incorreta' });
  try { users.setPassword(u.id, b.password); const r = users.login(u.name, b.password); res.json({ ok: true, token: r.token }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// ---- /api/users — só master ----
app.get('/api/users', (req, res) => { if (!requireMaster(req, res)) return; res.json(users.listUsers()); });
app.post('/api/users', (req, res) => {
  if (!requireMaster(req, res)) return;
  try { res.json({ ok: true, user: users.createUser(req.body || {}) }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/users/:id/password', (req, res) => {
  if (!requireMaster(req, res)) return;
  try { res.json({ ok: true, user: users.setPassword(req.params.id, (req.body || {}).password) }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/users/:id/active', (req, res) => {
  if (!requireMaster(req, res)) return;
  try { res.json({ ok: true, user: users.setActive(req.params.id, !!(req.body || {}).active) }); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- /api/brief — v4.1.2: gera o BRIEF detalhado do nicho (opcional) ----
app.post('/api/brief', async (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const apiKey = resolveKey(req);
  if (!apiKey) return res.status(400).json({ error: 'Sem API key. Configure no servidor ou insira a sua.' });
  const b = req.body || {};
  const niche = String(b.niche || '').trim();
  if (!niche) return res.status(400).json({ error: 'Informe o nicho.' });
  const { createMessage, DEFAULT_MODEL } = require('./lib/claude');
  const model = MODELS.some(m => m.id === b.model) ? b.model : DEFAULT_MODEL;
  try {
    const { buildBriefPrompt } = require('./lib/blocks');
    const out = await createMessage({ apiKey, model, system: buildSystemPrompt(), user: buildBriefPrompt({ niche, campaignLang: b.campaignLang, contentLang: b.contentLang, geoCountry: b.geoCountry, tone: b.tone, notes: b.notes }), maxTokens: 4000, timeoutMs: 90000 });
    const text = String(out && (out.text || out) || '').replace(/^```[a-z]*\n?|```$/g, '').trim();
    res.json({ ok: true, brief: text, model });
  } catch (e) { res.status(500).json({ error: e.message || String(e) }); }
});

// ---- /api/run — ÚNICO endpoint de geração (SSE) ----
// Auth ANTES de virar stream: falha => 401/400 application/json. Só depois SSE.
app.post('/api/run', async (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const apiKey = resolveKey(req);
  if (!apiKey) return res.status(400).json({ error: 'Sem API key. Configure no servidor ou insira a sua.' });

  const body = req.body || {};
  const v = validateParams(body);
  if (!v.ok) return res.status(400).json({ error: v.errors.join(' ') || 'Parâmetros inválidos.' });

  // v3.1: agent (política do auto-loop) e images (espelho de tamanho) são repassados.
  const { blocks, params = {}, model, artifacts, agent, images } = body;

  // A partir daqui é stream — sem gzip nesta rota (nenhum middleware de compressão está montado).
  const sse = openSSE(res);
  const ac = new AbortController();
  // 'close' no RESPONSE: só dispara em desconexão real do cliente. (req.on('close')
  // dispara quando o body termina de ser lido — abortaria toda run imediatamente.)
  res.on('close', () => { if (!res.writableEnded) ac.abort(new Error('client disconnect')); });

  const system = buildSystemPrompt();
  try {
    await runOrchestration({
      blocks, params, model, artifacts, agent, images, models: MODELS,
      apiKey, system, sse, signal: ac.signal
    });
  } catch (e) {
    // Falha global fora do grafo (nunca junto com run_done).
    await sse.send('run_error', { code: 'RUN_ERROR', message: (e && e.message) || 'Erro global na run.' });
  } finally {
    sse.close();
  }
});

// ---- Histórico (cap de 200 no arquivo, via lib/history) ----
app.get('/api/history', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const u = authUser(req), umap = {}; if (u.role === 'master') users.listUsers().forEach(x => { umap[x.id] = x.name; });
  const mine = readHistory().filter(e => canSee(req, e.owner));
  res.json(mine.slice(-60).reverse().map(e => Object.assign({}, e, { owner_name: e.owner ? (umap[e.owner] || null) : null })));
});
app.post('/api/history', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const { niche, params, blocks } = req.body || {};
  const arr = readHistory();
  const entry = { id: crypto.randomUUID(), owner: authUser(req).id, niche: niche || 'sem-nome', params: params || {}, blocks: blocks || {}, created_at: new Date().toISOString() };
  arr.push(entry);
  writeHistory(arr);
  res.json({ ok: true, id: entry.id });
});
app.delete('/api/history/:id', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const arr = readHistory(); const e = arr.find(x => x.id === req.params.id);
  if (e && !canSee(req, e.owner)) return res.status(403).json({ error: 'Esse funil não é seu.' });
  writeHistory(arr.filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ============================================================
//  v4.1 PUBLISHER — blogs WordPress + publicação P1/P2
// ============================================================

// ---- /api/blogs — cadastro (senha de aplicação cifrada no volume; nunca volta) ----
app.get('/api/blogs', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const umap = {}; if (isMaster(req)) users.listUsers().forEach(x => { umap[x.id] = x.name; });
  res.json(blogs.listBlogs().filter(b => canSee(req, b.owner)).map(b => Object.assign({}, b, { owner_name: b.owner ? (umap[b.owner] || null) : null, mine: b.owner === authUser(req).id })));
});
// ---- armazenamento: persistente (volume) ou efêmero? + backup/restore dos blogs ----
app.get('/api/storage', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  res.json(Object.assign(storageInfo(), { blogs: blogs.listBlogs().filter(b => canSee(req, b.owner)).length }));
});
app.get('/api/blogs/backup', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  res.json({ v: 1, at: new Date().toISOString(), entries: blogs.exportBackup(isMaster(req) ? null : authUser(req).id) });
});
app.post('/api/blogs/restore', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  try { res.json(Object.assign({ ok: true }, blogs.importBackup((req.body || {}).entries, authUser(req).id))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/blogs', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  try { res.json({ ok: true, blog: blogs.addBlog(req.body || {}, authUser(req).id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/blogs/:id', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  if (!canSee(req, blogs.getBlogOwner(req.params.id))) return res.status(403).json({ error: 'Esse blog não é seu.' });
  blogs.removeBlog(req.params.id);
  res.json({ ok: true });
});

// ---- /api/blogs/:id/owner — master transfere o blog pra um gestor ----
app.post('/api/blogs/:id/owner', (req, res) => {
  if (!requireMaster(req, res)) return;
  const owner = String((req.body || {}).owner || '');
  if (!users.findById(owner)) return res.status(400).json({ error: 'usuário não encontrado' });
  try { res.json(Object.assign({ ok: true }, blogs.setOwner(req.params.id, owner))); } catch (e) { res.status(400).json({ error: e.message }); }
});
// ---- /api/blogs/:id/test — conexão, papel, rota do grid, categorias ----
app.post('/api/blogs/:id/test', async (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  if (!canSee(req, blogs.getBlogOwner(req.params.id))) return res.status(403).json({ error: 'Esse blog não é seu.' });
  const cred = blogs.getBlogCredentials(req.params.id);
  if (!cred) return res.status(404).json({ error: 'Blog não encontrado.' });
  try {
    const client = new WPClient(cred);
    const [me, site, cats] = await Promise.all([client.me(), client.siteInfo(), client.categories()]);
    const gridRest = client.hasGridRest(site.namespaces);
    const caps = me.capabilities || {};
    const info = {
      ok: true, user: me.name, roles: me.roles, site: site.name,
      can: { posts: !!caps.edit_posts, publish: !!caps.publish_posts, media: !!caps.upload_files, categories: !!caps.manage_categories, grid: gridRest && !!caps.edit_others_posts },
      gridRest, categories: (cats || []).map(c => ({ id: c.id, name: c.name, count: c.count }))
    };
    blogs.markOk(cred.id, { user: me.name, gridRest });
    res.json(info);
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// ---- /api/publish — SSE: progresso da publicação P2 → grid → P1 ----
app.post('/api/publish', async (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const body = req.body || {};
  if (!canSee(req, blogs.getBlogOwner(body.blogId))) return res.status(403).json({ error: 'Esse blog não é seu.' });
  const cred = blogs.getBlogCredentials(body.blogId);
  if (!cred) return res.status(404).json({ error: 'Blog não encontrado.' });
  const results = body.results || {};
  if (!(results.p1_posts && results.p1_posts.posts) && !(results.p2_posts && results.p2_posts.posts)) {
    return res.status(400).json({ error: 'Nada pra publicar: gere os blocos Artigos P1 / Artigos P2 primeiro.' });
  }
  const options = Object.assign({}, body.options || {});
  options.status = options.status === 'publish' ? 'publish' : 'draft';
  if (!options.appUrl && cred.appUrl) options.appUrl = cred.appUrl;
  if (!options.categoryId && !options.categoryName && cred.defaultCategory) options.categoryName = cred.defaultCategory;

  const sse = openSSE(res);
  try {
    const report = await publishFunnel({
      blog: cred, params: body.params || {}, results, options,
      onProgress: (evt) => sse.send('publish_progress', evt)
    });
    await sse.send('publish_done', report);
  } catch (e) {
    await sse.send('publish_error', { message: (e && e.message) || 'Erro na publicação.' });
  } finally {
    sse.close();
  }
});

app.listen(PORT, () => {
  const photoKeys = ['PEXELS_API_KEY', 'PIXABAY_API_KEY', 'UNSPLASH_ACCESS_KEY'].filter(k => process.env[k]);
  console.log(`MBZ::CH4TB0T NEXUS v4.2 ONLINE -> port ${PORT}`);
  const st = storageInfo();
  console.log(`DATA_DIR: ${st.dir} (${st.source}) ${st.persistent ? '' : '— ⚠ EFÊMERO: monte um Volume em /data e defina DATA_DIR=/data'}`);
  console.log(`Server key: ${SERVER_API_KEY ? 'YES' : 'NO'} | Auth: ${bootInfo.mode}${bootInfo.mode === 'first-run' ? ' (⚠ primeiro login cria o master)' : ''} · users: ${users.listUsers().length} | MAX_CONCURRENCY: ${process.env.MAX_CONCURRENCY || 3} | Fotos: ${photoKeys.length ? photoKeys.join('+') : 'NENHUMA key (grid sem fotos reais)'}`);
});
