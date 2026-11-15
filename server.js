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
const frame = require('./lib/frame');
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

// ============================================================
//  v4.3 — FRAME (Moodlr): o Nexus age no Frame com a chave pessoal de quem clicou
//  (header x-frame-key; nunca guardada). Rotas exigem login do Nexus.
// ============================================================
function frameKey(req) { return String(req.get('x-frame-key') || '').trim(); }
app.post('/api/frame/whoami', async (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const key = frameKey(req); if (!key) return res.status(400).json({ error: 'sem chave do Frame' });
  try {
    const [me, uso] = await Promise.all([frame.frameCall(key, 'frame_quem_sou', {}, { timeoutMs: 20000 }), frame.frameCall(key, 'frame_uso_hoje', {}, { timeoutMs: 20000 }).catch(() => null)]);
    res.json({ ok: true, me, uso });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// proxy genérico (allowlist em lib/frame.js) — usado pra listar vozes/modelos/designs e pro Creative Studio
app.post('/api/frame/call', async (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const key = frameKey(req); if (!key) return res.status(400).json({ error: 'sem chave do Frame' });
  const b = req.body || {};
  try { res.json({ ok: true, result: await frame.frameCall(key, String(b.name || ''), b.arguments || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// envio dos criativos (SSE).
//   single=true (padrão): UM design com N páginas — item 1 vira o molde (criar_designs), as outras cenas viram
//     imagens (gerar_imagem) e o design final é montado copiando a página do molde N× com imagem+textos trocados
//     (criar_de_modelo com paginas). Narração = 1 chamada com um roteiro por página; idiomas extras = traduzir_design
//     (cópia por idioma, narração traduzida junto).
//   single=false: um design por criativo (lotes de 7 em criar_designs), narração por design.
const UUID_ONE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function firstUuid(v) { const m = (typeof v === 'string' ? v : JSON.stringify(v || '')).match(UUID_ONE); return m ? m[0] : null; }
function pickTextIndices(pageTexts, headline, cta) {
  // pageTexts: [{indice, texto}] de frame_ver_design → índice do headline e do CTA
  const arr = (pageTexts || []).map(t => ({ i: t.indice || t.index || t.i, t: String(t.texto || t.text || '') })).filter(x => x.i);
  if (!arr.length) return { h: null, c: null };
  const norm = (x) => x.replace(/\s+/g, ' ').trim().toLowerCase();
  let h = arr.find(x => headline && norm(x.t) === norm(headline));
  let c = arr.find(x => cta && norm(x.t) === norm(cta));
  // sem match exato: convenção dos modelos da Moodlr = texto 1 título, texto 2 CTA; senão maior/menor
  if (!h && !c && arr.length >= 2) { h = arr.find(x => x.i === 1) || null; c = arr.find(x => x.i === 2) || null; }
  const rest = arr.filter(x => x !== h && x !== c);
  if (!h) h = rest.slice().sort((p, q) => q.t.length - p.t.length)[0] || null;
  if (!c) c = rest.filter(x => x !== h).slice().sort((p, q) => p.t.length - q.t.length)[0] || null;
  return { h: h ? h.i : null, c: c ? c.i : null };
}
app.post('/api/frame/send', async (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const key = frameKey(req); if (!key) return res.status(400).json({ error: 'sem chave do Frame' });
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items.filter(x => x && x.briefing) : [];
  if (!items.length) return res.status(400).json({ error: 'nada pra enviar' });
  const idiomas = (Array.isArray(b.idiomas) ? b.idiomas : []).map(frame.frameLang).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 11);
  const narr = b.narracao && typeof b.narracao === 'object' ? b.narracao : null;
  const single = b.single !== false;
  const baseDesign = /^[0-9a-f-]{36}$/i.test(String(b.baseDesign || '')) ? String(b.baseDesign) : null; // molde existente (zero IA)
  const IMG_SUFFIX = ' — clean composition with empty space for a headline, no text anywhere in the image, no letters, no logos, no watermark';
  const sse = openSSE(res);
  const emit = (ev, d) => sse.send(ev, d);
  const designs = []; const warnings = [];
  const warn = (m) => { warnings.push(m); emit('frame_progress', { step: 'warning', message: m }); };
  const nome = String(b.nome || b.niche || 'NEXUS').slice(0, 100);
  try {
    if (single) {
      // ---- 1) molde: item 1 pelo criar_designs ----
      emit('frame_progress', { step: 'start', total: items.length, mode: 'single', idiomas, baseDesign: !!baseDesign });
      const onRetry = (n, msg, wait) => emit('frame_progress', { step: 'retry', n, message: msg, wait });
      let seed;
      if (baseDesign) {
        seed = { id: baseDesign, nome: '(molde existente)', link: 'https://town.moodlr.digital/?tab=frame&design=' + baseDesign };
        emit('frame_progress', { step: 'molde', message: 'usando o design existente como molde (sem IA no layout)' });
      } else {
        emit('frame_progress', { step: 'molde', message: 'criando o molde (criativo 1) — o Frame gera fundo + textos editáveis…' });
        const r0 = await frame.frameCall(key, 'frame_criar_designs', { itens: [Object.assign({}, items[0], { quantidade: 1 })], modo: b.modo === 'camadas' ? 'camadas' : 'fundo_unico' }, { onRetry });
        seed = frame.extractDesigns(r0)[0];
        if (!seed) throw new Error('o Frame não devolveu o id do molde');
        if (r0 && (r0.avisos || r0.warnings)) [].concat(r0.avisos || r0.warnings).forEach(w => warn(String(w)));
        emit('frame_progress', { step: 'design', design: Object.assign({ papel: 'molde' }, seed) });
      }
      let final = seed;
      if (items.length > 1 || baseDesign) {
        // ---- 2) índices dos textos do molde ----
        let hIdx = null, cIdx = null;
        try {
          const vd = await frame.frameCall(key, 'frame_ver_design', { design: seed.id, miniaturas: false }, { timeoutMs: 60000 });
          const pg0 = (vd && (vd.paginas || vd.pages) || [])[0] || {};
          const idx = pickTextIndices(pg0.textos || pg0.texts || [], items[0].headline, items[0].cta);
          hIdx = idx.h; cIdx = idx.c;
          if (!hIdx) warn('não achei o texto do headline no molde — as páginas vão sem troca de headline');
        } catch (e) { warn('ver_design do molde: ' + e.message); }
        // ---- 3) imagens das outras cenas ----
        const fmt = items[0].formato || 'post';
        // com molde da IA, a página 1 já tem o fundo do criativo 1; com molde existente, gera imagem pra TODAS
        const startAt = baseDesign ? 0 : 1;
        const pages = [];
        if (!baseDesign) {
          const t0 = []; if (hIdx && items[0].headline) t0.push({ indice: hIdx, texto: String(items[0].headline).slice(0, 600) }); if (cIdx && items[0].cta) t0.push({ indice: cIdx, texto: String(items[0].cta).slice(0, 600) });
          pages.push(t0.length ? { pagina: 1, textos: t0 } : { pagina: 1 });
        }
        // imagens: 2 por vez (limite do Frame de trabalhos simultâneos), com retry
        const imgIds = new Array(items.length).fill(null);
        const genOne = async (i) => {
          emit('frame_progress', { step: 'imagem', i: i + 1, n: items.length });
          try {
            const scene = String(items[i].scene || items[i].briefing).slice(0, 1300);
            const ri = await frame.frameCall(key, 'frame_gerar_imagem', { prompt: (scene + IMG_SUFFIX).slice(0, 1500), formato: fmt }, { timeoutMs: 120000, onRetry });
            imgIds[i] = (ri && ((ri.imagem && (ri.imagem.id || (typeof ri.imagem === 'string' && ri.imagem))) || ri.id || (ri.asset && ri.asset.id))) || firstUuid(ri);
            if (!imgIds[i]) warn('imagem ' + (i + 1) + ': o Frame não devolveu o id');
          } catch (e) { warn('imagem ' + (i + 1) + ': ' + e.message); }
        };
        for (let i = startAt; i < items.length; i += 2) await Promise.all([genOne(i), i + 1 < items.length ? genOne(i + 1) : null]);
        for (let i = startAt; i < items.length; i++) {
          const pg = { pagina: 1 };
          if (imgIds[i]) pg.imagem = imgIds[i];
          const tx = []; if (hIdx && items[i].headline) tx.push({ indice: hIdx, texto: String(items[i].headline).slice(0, 600) }); if (cIdx && items[i].cta) tx.push({ indice: cIdx, texto: String(items[i].cta).slice(0, 600) });
          if (tx.length) pg.textos = tx;
          pages.push(pg);
        }
        // ---- 4) design final com N páginas ----
        emit('frame_progress', { step: 'montar', n: pages.length });
        const rf = await frame.frameCall(key, 'frame_criar_de_modelo', { origem: { design: seed.id }, nome: nome, paginas: pages }, { timeoutMs: 120000, onRetry });
        const fd = frame.extractDesigns(rf)[0];
        if (!fd) throw new Error('o Frame não devolveu o id do design final');
        final = Object.assign({ papel: 'final', paginas: pages.length }, fd);
        emit('frame_progress', { step: 'design', design: final });
      }
      if (final !== seed) designs.push(Object.assign({ papel: 'molde' }, seed));
      designs.push(final);
      // ---- 5) narração: um roteiro por página ----
      if (narr && Array.isArray(narr.roteiros) && narr.roteiros.length) {
        const n = items.length;
        const roteiro = Array.from({ length: n }, (_, i) => String(narr.roteiros[i % narr.roteiros.length] || '').slice(0, 2400)).filter(Boolean);
        emit('frame_progress', { step: 'narrar', design: final.id, i: 1, n: 1, paginas: roteiro.length });
        try { await frame.frameCall(key, 'frame_narrar', Object.assign({ design: final.id, roteiro: roteiro }, narr.voz ? { voz: narr.voz } : {}, { modelo: narr.modelo || 'eleven_v4' }), { onRetry }); final.narrado = true; }
        catch (e) { warn('narração: ' + e.message); }
      }
      // ---- 6) idiomas extras: cópia traduzida (narração traduzida junto) ----
      const extras = idiomas.slice(1);
      for (let k = 0; k < extras.length; k += 5) {
        const grp = extras.slice(k, k + 5);
        emit('frame_progress', { step: 'traduzir', idiomas: grp });
        try {
          const rt = await frame.frameCall(key, 'frame_traduzir_design', { design: final.id, idiomas: grp, narracao: !!final.narrado }, { onRetry });
          if (rt && (rt.avisos || rt.warnings)) [].concat(rt.avisos || rt.warnings).forEach(w => warn('tradução: ' + String(w)));
          frame.extractDesigns(rt).filter(d => d.id !== final.id).forEach(d => { d.papel = 'traducao'; designs.push(d); emit('frame_progress', { step: 'design', design: d }); });
        } catch (e) { warn('tradução ' + grp.join(',') + ': ' + e.message); }
      }
    } else {
      const chunks = []; for (let i = 0; i < items.length; i += 7) chunks.push(items.slice(i, i + 7));
      emit('frame_progress', { step: 'start', total: items.length, lotes: chunks.length, idiomas, mode: 'multi' });
      for (let c = 0; c < chunks.length; c++) {
        emit('frame_progress', { step: 'lote', lote: c + 1, lotes: chunks.length, n: chunks[c].length });
        const args = { itens: chunks[c].map(it => ({ briefing: it.briefing, formato: it.formato, quantidade: 1, foto: it.foto !== false })), modo: b.modo === 'camadas' ? 'camadas' : 'fundo_unico' };
        if (idiomas.length) args.idiomas = idiomas;
        let r;
        try { r = await frame.frameCall(key, 'frame_criar_designs', args); } catch (e) { warn('lote ' + (c + 1) + ': ' + e.message); continue; }
        const ds = frame.extractDesigns(r);
        if (!ds.length) warn('lote ' + (c + 1) + ': o Frame respondeu sem ids de design');
        if (r && (r.avisos || r.warnings)) [].concat(r.avisos || r.warnings).forEach(w => warn(String(w)));
        ds.forEach((d, i) => { d.item = c * 7 + i + 1; designs.push(d); emit('frame_progress', { step: 'design', design: d }); });
      }
      if (narr && Array.isArray(narr.roteiros) && narr.roteiros.length && designs.length) {
        for (let i = 0; i < designs.length; i++) {
          const d = designs[i]; const txt = narr.roteiros[i % narr.roteiros.length]; if (!txt) continue;
          emit('frame_progress', { step: 'narrar', design: d.id, i: i + 1, n: designs.length });
          try { await frame.frameCall(key, 'frame_narrar', Object.assign({ design: d.id, roteiro: [String(txt).slice(0, 2400)], mesma_em_todas: true }, narr.voz ? { voz: narr.voz } : {}, narr.modelo ? { modelo: narr.modelo } : {})); d.narrado = true; }
          catch (e) { warn('narração ' + d.id.slice(0, 8) + ': ' + e.message); }
        }
      }
    }
    if (b.creativeStudio && designs.length) {
      const ids = designs.filter(d => d.papel !== 'molde').map(d => d.id).slice(0, 20);
      try { await frame.frameCall(key, 'frame_enviar_creative_studio', { ids }); emit('frame_progress', { step: 'studio', n: ids.length }); }
      catch (e) { warn('Creative Studio: ' + e.message); }
    }
    let uso = null; try { uso = await frame.frameCall(key, 'frame_uso_hoje', {}, { timeoutMs: 20000 }); } catch (e) { /* noop */ }
    await emit('frame_done', { designs, warnings, uso });
  } catch (e) {
    await emit('frame_error', { message: e.message || String(e), designs, warnings });
  }
  sse.close();
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
    const out = await createMessage({ apiKey, model, system: buildSystemPrompt(), user: buildBriefPrompt({ niche, campaignLang: b.campaignLang, contentLang: b.contentLang, geoCountry: b.geoCountry, tone: b.tone, notes: b.notes, pageName: String(b.pageName || '').trim(), persona: b.persona, personaLabel: b.personaLabel, personaVoice: b.persona === 'custom' ? String(b.personaCustom || '').slice(0, 1200) : (PERSONAS.find(x => x.id === b.persona) || {}).voice }), maxTokens: 4000, timeoutMs: 90000 });
    let text = String(out && (out.text || out) || '').replace(/^```[a-z]*\n?|```$/g, '').trim();
    // v4.2.1: se o modelo embrulhar em JSON ({"brief": "..."}) ou escapar \n / \", desembrulha
    if (/^\s*\{/.test(text)) { try { const j = JSON.parse(text); const v = j.brief || j.text || j.content || Object.values(j).find(x => typeof x === 'string'); if (v) text = String(v); } catch (e) { /* segue */ } }
    text = text.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/^"+|"+$/g, '').replace(/\n{3,}/g, '\n\n').trim();
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

// NEXUS_NO_LISTEN=1: testes importam o app sem abrir porta
if (!process.env.NEXUS_NO_LISTEN) app.listen(PORT, () => {
  const photoKeys = ['PEXELS_API_KEY', 'PIXABAY_API_KEY', 'UNSPLASH_ACCESS_KEY'].filter(k => process.env[k]);
  console.log(`MBZ::CH4TB0T NEXUS v4.3 ONLINE -> port ${PORT}`);
  const st = storageInfo();
  console.log(`DATA_DIR: ${st.dir} (${st.source}) ${st.persistent ? '' : '— ⚠ EFÊMERO: monte um Volume em /data e defina DATA_DIR=/data'}`);
  console.log(`Server key: ${SERVER_API_KEY ? 'YES' : 'NO'} | Auth: ${bootInfo.mode}${bootInfo.mode === 'first-run' ? ' (⚠ primeiro login cria o master)' : ''} · users: ${users.listUsers().length} | MAX_CONCURRENCY: ${process.env.MAX_CONCURRENCY || 3} | Fotos: ${photoKeys.length ? photoKeys.join('+') : 'NENHUMA key (grid sem fotos reais)'}`);
});
module.exports = app;
