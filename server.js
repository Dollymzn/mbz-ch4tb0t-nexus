// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — MBOLIVEIRAZ MEDIA & TECH
//  Backend FINO: wiring Express + rotas. Geração via lib/orchestrator (SSE).
// ============================================================
const express = require('express');
const path = require('path');
const crypto = require('crypto');

const {
  PERSONAS, LANGUAGES, CURRENCIES, COUNTRIES, CREATIVE_PLATFORMS, CREATIVE_SIZES,
  buildSystemPrompt
} = require('./prompts');
const { openSSE } = require('./lib/sse');
const { runOrchestration } = require('./lib/orchestrator');
const { validateParams } = require('./lib/validate');
const { readHistory, writeHistory } = require('./lib/history');
const blogs = require('./lib/blogs');
const { storageInfo } = require('./lib/datadir');
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
function checkPassword(req) {
  if (!ACCESS_PASSWORD) return true;
  return constantTimeEqual(req.get('x-access-pass'), ACCESS_PASSWORD);
}

// ---- /api/config ----
app.get('/api/config', (req, res) => {
  res.json({
    serverKey: !!SERVER_API_KEY, needPassword: !!ACCESS_PASSWORD,
    personas: PERSONAS, languages: LANGUAGES, currencies: CURRENCIES, countries: COUNTRIES,
    creativePlatforms: CREATIVE_PLATFORMS, creativeSizes: CREATIVE_SIZES,
    models: MODELS
  });
});

// ---- /api/auth (rate-limit 5/60s + timingSafeEqual) ----
app.post('/api/auth', (req, res) => {
  if (!ACCESS_PASSWORD) return res.json({ ok: true });
  const ip = req.ip;
  const now = Date.now();
  let entry = authAttempts.get(ip);
  if (!entry || now - entry.windowStart > AUTH_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    authAttempts.set(ip, entry);
  }
  if (entry.count >= AUTH_MAX_ATTEMPTS) {
    return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde 1 minuto.' });
  }
  if (constantTimeEqual((req.body || {}).password, ACCESS_PASSWORD)) {
    authAttempts.delete(ip);
    return res.json({ ok: true });
  }
  entry.count++;
  res.status(401).json({ ok: false, error: 'Senha incorreta.' });
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
  res.json(readHistory().slice(-60).reverse());
});
app.post('/api/history', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const { niche, params, blocks } = req.body || {};
  const arr = readHistory();
  const entry = { id: crypto.randomUUID(), niche: niche || 'sem-nome', params: params || {}, blocks: blocks || {}, created_at: new Date().toISOString() };
  arr.push(entry);
  writeHistory(arr);
  res.json({ ok: true, id: entry.id });
});
app.delete('/api/history/:id', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  writeHistory(readHistory().filter(e => e.id !== req.params.id));
  res.json({ ok: true });
});

// ============================================================
//  v4.1 PUBLISHER — blogs WordPress + publicação P1/P2
// ============================================================

// ---- /api/blogs — cadastro (senha de aplicação cifrada no volume; nunca volta) ----
app.get('/api/blogs', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  res.json(blogs.listBlogs());
});
// ---- armazenamento: persistente (volume) ou efêmero? + backup/restore dos blogs ----
app.get('/api/storage', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  res.json(Object.assign(storageInfo(), { blogs: blogs.listBlogs().length }));
});
app.get('/api/blogs/backup', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  res.json({ v: 1, at: new Date().toISOString(), entries: blogs.exportBackup() });
});
app.post('/api/blogs/restore', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  try { res.json(Object.assign({ ok: true }, blogs.importBackup((req.body || {}).entries))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/blogs', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  try { res.json({ ok: true, blog: blogs.addBlog(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/blogs/:id', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  blogs.removeBlog(req.params.id);
  res.json({ ok: true });
});

// ---- /api/blogs/:id/test — conexão, papel, rota do grid, categorias ----
app.post('/api/blogs/:id/test', async (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
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
  console.log(`MBZ::CH4TB0T NEXUS v4 ONLINE -> port ${PORT}`);
  const st = storageInfo();
  console.log(`DATA_DIR: ${st.dir} (${st.source}) ${st.persistent ? '' : '— ⚠ EFÊMERO: monte um Volume em /data e defina DATA_DIR=/data'}`);
  console.log(`Server key: ${SERVER_API_KEY ? 'YES' : 'NO'} | Password: ${ACCESS_PASSWORD ? 'YES' : 'NO'} | MAX_CONCURRENCY: ${process.env.MAX_CONCURRENCY || 3} | Fotos: ${photoKeys.length ? photoKeys.join('+') : 'NENHUMA key (grid sem fotos reais)'}`);
});
