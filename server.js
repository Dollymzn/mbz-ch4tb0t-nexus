// ============================================================
//  MBZ::CH4TB0T NEXUS v2 — MBOLIVEIRAZ MEDIA & TECH
//  Backend: Express + Claude API (retry + parsing robusto)
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  PERSONAS, LANGUAGES, CURRENCIES, COUNTRIES, CREATIVE_PLATFORMS, CREATIVE_SIZES,
  buildSystemPrompt
} = require('./prompts');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readHistory() { try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; } }
function writeHistory(arr) { const t = HISTORY_FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(arr, null, 2)); fs.renameSync(t, HISTORY_FILE); }

app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

app.get('/api/config', (req, res) => {
  res.json({
    serverKey: !!SERVER_API_KEY, needPassword: !!ACCESS_PASSWORD,
    personas: PERSONAS, languages: LANGUAGES, currencies: CURRENCIES, countries: COUNTRIES,
    creativePlatforms: CREATIVE_PLATFORMS, creativeSizes: CREATIVE_SIZES
  });
});

app.post('/api/auth', (req, res) => {
  if (!ACCESS_PASSWORD) return res.json({ ok: true });
  if ((req.body || {}).password === ACCESS_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ ok: false, error: 'Senha incorreta.' });
});

function resolveKey(req) {
  if (SERVER_API_KEY) return SERVER_API_KEY;
  const h = req.get('x-user-key');
  return h && h.trim() ? h.trim() : null;
}
function checkPassword(req) {
  if (!ACCESS_PASSWORD) return true;
  return req.get('x-access-pass') === ACCESS_PASSWORD;
}

// ---- Claude API com retry e erro limpo ----
async function callClaude(apiKey, model, system, userMsg, maxTokens) {
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-6',
          max_tokens: maxTokens || 8000,
          system, messages: [{ role: 'user', content: userMsg }]
        })
      });
      const raw = await r.text();
      if (!r.ok) {
        // Tenta extrair mensagem de erro da Anthropic
        let msg = raw;
        try { const j = JSON.parse(raw); msg = (j.error && j.error.message) || raw; } catch {}
        // 429/500/529 = vale retry
        if (r.status === 429 || r.status >= 500) { lastErr = `${r.status}: ${msg}`; await sleep(900 * (attempt + 1)); continue; }
        throw new Error(`${r.status}: ${msg}`.slice(0, 280));
      }
      const data = JSON.parse(raw);
      return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    } catch (e) {
      lastErr = e.message || String(e);
      if (attempt < 2) await sleep(700 * (attempt + 1));
    }
  }
  throw new Error(lastErr || 'Falha ao chamar a API.');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---- Extrai JSON robusto de uma resposta ----
function extractJSON(text) {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const first = Math.min(...['{', '['].map(c => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
  if (first === Infinity) return null;
  const lastObj = t.lastIndexOf('}'); const lastArr = t.lastIndexOf(']');
  const last = Math.max(lastObj, lastArr);
  if (last > first) { try { return JSON.parse(t.slice(first, last + 1)); } catch {} }
  return null;
}

// ---- Pós-processa onboard ChatDrink: corrige random, redirects e UTM ----
function fixOnboardChatdrink(j, nslug) {
  if (!j || !Array.isArray(j.routes)) return j;
  const routes = j.routes;
  const n = routes.length;
  if (n < 2) return j;
  const lastIdx = n - 1;
  // indices de conteudo = 1..lastIdx-1
  const contentIdx = [];
  for (let i = 1; i < lastIdx; i++) contentIdx.push(i);
  // 1) random na rota 0
  if (routes[0] && Array.isArray(routes[0].interactions)) {
    const r = routes[0].interactions.find(x => x.type === 'random');
    if (r) r.config = { routes: contentIdx.slice() };
  }
  // 2) cada rota de conteudo: redirect pra ultima + utm_content onbN
  contentIdx.forEach((idx, k) => {
    const route = routes[idx];
    if (!route || !Array.isArray(route.interactions)) return;
    const num = k + 1;
    route.interactions.forEach(it => {
      if (it.type === 'menu' && it.config) {
        it.config.redirect_type = 'route';
        it.config.redirect_target = lastIdx;
        (it.config.cards || []).forEach(c => fixButtonsUtm(c.buttons, 'onboard', 'onb' + num + '-' + nslug));
      }
      if (it.type === 'botoes' && it.config) {
        it.config.redirect_type = 'route';
        it.config.redirect_target = lastIdx;
        fixButtonsUtm(it.config.buttons, 'onboard', 'onb' + num + '-' + nslug);
      }
    });
  });
  return j;
}

// ---- Pós-processa sequência ChatDrink: random, fallback, quick_replies ----
function fixSequenceChatdrink(j, nslug) {
  if (!j || !Array.isArray(j.routes)) return j;
  const routes = j.routes;
  const n = routes.length;
  if (n < 3) return j;
  const fbIdx = n - 1; // ultima = fallback
  const contentIdx = [];
  for (let i = 1; i < fbIdx; i++) contentIdx.push(i);
  // random aponta so pras de conteudo
  if (routes[0] && Array.isArray(routes[0].interactions)) {
    const r = routes[0].interactions.find(x => x.type === 'random');
    if (r) r.config = { routes: contentIdx.slice() };
  }
  // conteudo: quick_replies -> fallback; utm seqN
  contentIdx.forEach((idx, k) => {
    const route = routes[idx];
    if (!route || !Array.isArray(route.interactions)) return;
    const num = k + 1;
    route.interactions.forEach(it => {
      if (it.type === 'menu' && it.config) (it.config.cards || []).forEach(c => fixButtonsUtm(c.buttons, 'sequence', 'seq' + num + '-' + nslug));
      if (it.type === 'mensagem' && it.config && Array.isArray(it.config.quick_replies)) {
        it.config.quick_replies.forEach(q => { q.action_type = 'route'; q.target_route = fbIdx; q.target_flow = ''; });
      }
    });
  });
  // fallback utm seqf
  const fb = routes[fbIdx];
  if (fb && Array.isArray(fb.interactions)) {
    fb.interactions.forEach(it => { if (it.type === 'botoes' && it.config) fixButtonsUtm(it.config.buttons, 'sequence', 'seqf-' + nslug); });
  }
  return j;
}

function fixButtonsUtm(buttons, src, content) {
  if (!Array.isArray(buttons)) return;
  buttons.forEach(b => {
    const url = '{{URL_REDIR}}?utm_source=' + src + '&utm_campaign={{UTM_CAMPAIGN}}&utm_medium={{NOMEDAPAGINA}}&utm_term=' + src + '&utm_content=' + content;
    if (b.action_type === 'url') {
      b.url = url;
      if (Array.isArray(b.urls)) b.urls = [{ url: url, weight: 100 }];
      else b.urls = [{ url: url, weight: 100 }];
    }
  });
}

// ---- Monta o JSON completo do quiz-overlay (52 campos) a partir do conteudo da IA ----
function assembleQuizOverlays(j, nslug) {
  if (!j || !Array.isArray(j.quizzes)) return j;
  const VALID_MODES = ['quiz','wheel','visual','hold','scratch','countdown','flip','gift','tap','trivia'];
  const VALID_PAL = ['sunset','mint','royal','slate','pink','purple','bordo','passion','mystic','romance','angel','ocean','forest','neon','aurora','secret','luxury','candy','arcade','zen'];
  const overlays = j.quizzes.map((q, i) => {
    const mode = VALID_MODES.indexOf(q.entry_mode) >= 0 ? q.entry_mode : 'wheel';
    const pal = VALID_PAL.indexOf(q.theme_palette) >= 0 ? q.theme_palette : 'mystic';
    const qOpts = q.quiz_options || ['Sim','Talvez','Não'];
    const vOpts = (q.visual_options || []).map(o => ({
      label: o.label || '',
      // converte pinterest search -> link de pesquisa do Pinterest
      image: o.pinterest ? 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(o.pinterest) : (o.image || '')
    }));
    const wheelOpts = q.wheel_options && q.wheel_options.length ? q.wheel_options : ['Prêmio 1','Prêmio 2','Prêmio 3','Prêmio 4','Prêmio 5','Prêmio 6'];
    return {
      id: q.id || (nslug + '-' + (i + 1)),
      entry_mode: mode,
      questions: (q.quiz_question || '') + ' | ' + qOpts.join(' | '),
      qlist: [{ title: q.quiz_question || '', options: qOpts }],
      cooldown_min: 0,
      open_delay_ms: 2000,
      require_completion: true,
      ad_mode: 'rewarded',
      wheel_options: wheelOpts,
      wheel_fixed_index: '0',
      wheel_title: q.wheel_title || '',
      wheel_result_label: q.wheel_result_label || '',
      visual_questions: [{ title: q.visual_question || '', options: vOpts }],
      hold_visual: q.hold_visual || 'envelope',
      hold_duration: 1.5,
      hold_title: q.hold_title || '',
      hold_subtitle: q.hold_subtitle || '',
      hold_instruction: q.hold_instruction || '',
      hold_emoji: q.hold_emoji || '💌',
      scratch_title: q.scratch_title || '',
      scratch_prize: q.scratch_prize || '',
      scratch_cover_color: q.scratch_cover_color || '#2b1f3d',
      scratch_threshold: 40,
      scratch_hint: q.scratch_hint || '',
      scratch_subtext: q.scratch_subtext || '',
      countdown_from: 3,
      countdown_title: q.countdown_title || '',
      countdown_reveal: q.countdown_reveal || '',
      countdown_subtext: q.countdown_subtext || '',
      flip_title: q.flip_title || '',
      flip_front_text: q.flip_front_text || '🔒 Toque para virar',
      flip_prize: q.flip_prize || '',
      flip_emoji: q.flip_emoji || '✉️',
      gift_title: q.gift_title || '',
      gift_prize: q.gift_prize || '',
      gift_emoji: q.gift_emoji || '🎁',
      gift_btn_label: q.gift_btn_label || 'Abrir Presente',
      tap_count: 5,
      tap_title: q.tap_title || '',
      tap_label: q.tap_label || 'Toque para abrir',
      tap_complete_text: q.tap_complete_text || '',
      trivia_question: q.trivia_question || '',
      trivia_options: q.trivia_options || ['Sim','Talvez','Não','Agora'],
      trivia_correct_index: 0,
      trivia_wrong_text: q.trivia_wrong_text || '',
      final_cta_label: q.final_cta_label || 'Ver agora →',
      final_cta_url: '',
      finish_title: q.finish_title || '',
      finish_note: q.finish_note || '',
      loading_text: q.loading_text || '',
      loading_ms: 1600,
      theme_palette: pal
    };
  });
  // retorna no formato: cada overlay é um export completo do plugin
  return {
    quizzes: overlays.map(ov => ({
      plugin: 'quiz-overlay',
      schema_version: 1,
      plugin_version: '4.1.0',
      exported_at: new Date().toISOString(),
      overlay: ov
    }))
  };
}

// ---- Garante legibilidade do MIRB grid: anexa CSS de contraste que SEMPRE vence ----
function enforceGridLegibility(j, params) {
  if (!j || !j.grid) return j;
  const dir = params.gridDirection || {};
  const titleColor = pickContrast(dir.title_color, '#ffffff');
  const itemBg = dir.item_bg || '#1a1a2e';
  const itemText = pickContrast(dir.item_text_color, isDark(itemBg) ? '#ffffff' : '#111111');
  const font = dir.font || 'Georgia, "Times New Roman", serif';
  const accent = (dir.palette && dir.palette[0]) || '#c084fc';

  const enforced = `
/* === LEGIBILIDADE GARANTIDA (MBZ NEXUS) === */
.mirb-grid-title{font-family:${font} !important;font-weight:800 !important;font-size:30px !important;color:${titleColor} !important;text-shadow:0 2px 10px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.95) !important;letter-spacing:.3px !important;line-height:1.2 !important;}
.mirb-grid-subtitle{font-family:${font} !important;font-weight:600 !important;font-size:17px !important;color:${titleColor} !important;opacity:1 !important;text-shadow:0 1px 6px rgba(0,0,0,.85) !important;}
.mirb-grid-item-title{font-family:${font} !important;font-weight:800 !important;font-size:17px !important;color:${itemText} !important;background:${itemBg} !important;padding:16px 12px !important;text-shadow:${isDark(itemBg) ? '0 1px 4px rgba(0,0,0,.6)' : 'none'} !important;letter-spacing:.2px !important;line-height:1.3 !important;}
.mirb-grid-item{border:2px solid ${accent} !important;border-radius:14px !important;overflow:hidden !important;box-shadow:0 4px 16px rgba(0,0,0,.3) !important;}
.mirb-grid-footer-line{color:${titleColor} !important;font-weight:600 !important;font-size:15px !important;opacity:1 !important;text-shadow:0 1px 5px rgba(0,0,0,.7) !important;}
.mirb-grid-footer-highlight{color:#fff !important;font-weight:800 !important;font-size:18px !important;background:${accent} !important;padding:8px 22px !important;border-radius:24px !important;display:inline-block !important;letter-spacing:1px !important;}
`;
  j.grid.custom_css = (j.grid.custom_css || '') + '\n' + enforced;
  return j;
}
function isDark(hex) {
  if (!hex || hex[0] !== '#') return true;
  const c = hex.slice(1);
  const f = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const r = parseInt(f.slice(0, 2), 16), g = parseInt(f.slice(2, 4), 16), b = parseInt(f.slice(4, 6), 16);
  if (isNaN(r)) return true;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}
function pickContrast(color, fallback) {
  if (!color || color[0] !== '#') return fallback;
  const c = color.slice(1);
  const f = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const r = parseInt(f.slice(0, 2), 16), g = parseInt(f.slice(2, 4), 16), b = parseInt(f.slice(4, 6), 16);
  if (isNaN(r)) return fallback;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum > 220) return fallback;
  return color;
}

app.post('/api/generate', async (req, res) => {
  try {
    if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
    const apiKey = resolveKey(req);
    if (!apiKey) return res.status(400).json({ error: 'Sem API key. Configure no servidor ou insira a sua.' });
    const { block, params, model } = req.body || {};
    if (!block || !params) return res.status(400).json({ error: 'Faltam parametros.' });

    const system = buildSystemPrompt();
    const userMsg = buildBlockPrompt(block, params);
    const heavy = ['onboard', 'sequence', 'creatives_prompt', 'audios', 'quiz'].includes(block);
    const text = await callClaude(apiKey, model, system, userMsg, heavy ? 20000 : 7000);

    const json = extractJSON(text);
    // pós-processa estrutura determinística (random, redirects, utm, fallback)
    const nslug = (params.niche || 'nicho').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
    let fixedJson = json;
    if (json && (params.platform || 'chatdrink') === 'chatdrink') {
      if (block === 'onboard') fixedJson = fixOnboardChatdrink(json, nslug);
      else if (block === 'sequence') fixedJson = fixSequenceChatdrink(json, nslug);
    }
    // garante legibilidade do grid: injeta CSS de contraste obrigatório
    if (json && block === 'grid') fixedJson = enforceGridLegibility(json, params);
    if (json && block === 'quiz') fixedJson = assembleQuizOverlays(json, nslug);
    res.json({ block, raw: fixedJson ? JSON.stringify(fixedJson, null, 2) : text, json: fixedJson, ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- OTIMIZADOR ----
app.post('/api/optimize', async (req, res) => {
  try {
    if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
    const apiKey = resolveKey(req);
    if (!apiKey) return res.status(400).json({ error: 'Sem API key.' });
    const { content, kind, context, model, platform } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Cole o conteudo a otimizar.' });

    const isJsonKind = ['onboard', 'sequência', 'sequencia', 'grid', 'comment'].includes((kind || '').toLowerCase());
    const system = buildSystemPrompt();
    const userMsg = `TAREFA: Otimizar o seguinte ${kind || 'conteudo'} de funil de arbitragem.
${platform ? 'Plataforma: ' + platform + '. Mantenha EXATAMENTE o formato JSON dessa plataforma.' : ''}
${context ? 'Objetivo do usuario: ' + context : ''}
Melhore copy, ganchos de urgencia, storytelling e CTR. Mantenha a estrutura tecnica valida.
${isJsonKind ? 'Devolva APENAS JSON valido completo pronto pra importar.' : 'Devolva texto limpo e organizado (NAO JSON), pronto pra copiar e colar.'}

CONTEUDO ORIGINAL:
${content}`;
    const text = await callClaude(apiKey, model, system, userMsg, 24000);
    const json = isJsonKind ? extractJSON(text) : null;
    res.json({ raw: text, json: json, isJson: isJsonKind, ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Histórico ----
app.get('/api/history', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  res.json(readHistory().slice(-60).reverse());
});
app.post('/api/history', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const { niche, params, blocks } = req.body || {};
  const arr = readHistory();
  const entry = { id: crypto.randomUUID(), niche: niche || 'sem-nome', params: params || {}, blocks: blocks || {}, created_at: new Date().toISOString() };
  arr.push(entry); writeHistory(arr);
  res.json({ ok: true, id: entry.id });
});
app.delete('/api/history/:id', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  writeHistory(readHistory().filter(e => e.id !== req.params.id));
  res.json({ ok: true });
});

// ============================================================
//  PROMPTS POR BLOCO
// ============================================================
function buildBlockPrompt(block, p) {
  const nslug = (p.niche || 'nicho').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
  const ctx = `
NICHO: ${p.niche}
IDIOMA DO FLUXO (chatbot): ${p.flowLang || 'en-US'}
IDIOMA DO CONTEUDO (blog): ${p.contentLang || 'pt-BR'}
IDIOMA DA CAMPANHA (Meta/GEO alvo): ${p.campaignLang || p.contentLang || 'pt-BR'}
MOEDA: ${p.currency || 'USD'}
PERSONA: ${p.personaLabel || 'sem persona'}
NOME DA PAGINA FB: ${p.pageName || '(sugira)'}
PLATAFORMA: ${p.platform || 'chatdrink'}
SLUG: ${nslug}`;

  switch (block) {
    case 'page_name':
      return `${ctx}\nGere 6 nomes de pagina de Facebook que pareçam PESSOAS REAIS, adequadas ao nicho "${p.niche}"${p.geoCountry ? ' E culturalmente coerentes com o pais-alvo: ' + p.geoCountry : ''}${p.campaignLang ? ' (idioma/origem: ' + p.campaignLang + ')' : ''}. Os nomes devem soar nativos do pais-alvo (ex: Italia -> nomes italianos como Giulia Rossi; Polonia -> nomes poloneses como Zofia Kowalska; Brasil -> nomes brasileiros; Canada/EN -> nomes como Claire Whitestone). Combine o tom com o nicho. Responda JSON: {"names":["Nome Sobrenome", ...]}`;

    case 'fb_images':
      return `${ctx}
Gere 2 prompts de imagem (em INGLES, muito detalhados) para a pagina de Facebook da persona "${p.pageName || 'a persona'}" do nicho "${p.niche}"${p.geoCountry ? ', pais-alvo ' + p.geoCountry : ''}${p.campaignLang ? ', idioma ' + p.campaignLang : ''}.
A persona deve ser uma PESSOA REAL coerente com o nome, etnia e cultura do pais-alvo, e o estilo visual deve combinar com o nicho.

1) FOTO DE PERFIL (profile): retrato quadrado 1:1, rosto/busto da persona em destaque, expressao acolhedora e magnetica, iluminacao cinematografica quente, leve profundidade de campo, elementos do nicho e do pais sutis ao fundo, cores ricas, qualidade editorial premium. Termine com ", 1:1 square portrait, professional photography, ultra detailed".

2) FOTO DE CAPA (cover) — SIGA ESTA FORMULA DE ALTA QUALIDADE (estilo capa profissional de pagina):
- Banner HORIZONTAL widescreen, formato 1640x856 (proporcao ~1.91:1, formato exato de capa do Facebook).
- COMPOSICAO: a persona posicionada em UM DOS LADOS (esquerda ou direita ~1/3 do quadro), em pose elegante e tematica do nicho, ocupando verticalmente o frame. O LADO OPOSTO e o CENTRO reservados pra tipografia e atmosfera.
- TIPOGRAFIA (parte central, descreva no prompt): o nome "${p.pageName || ''}" em DUAS fontes combinadas — primeiro nome em script caligrafico dourado elegante, sobrenome em serif maiuscula imponente; abaixo uma TAGLINE curta do nicho e 3-4 palavras-chave separadas por bullets (ex: FAITH • COMFORT • GUIDANCE pro nicho de fe). Divisores ornamentais finos (linha com pequeno coracao/simbolo no meio).
- FAIXA INFERIOR: uma barra semi-transparente com 4 ICONES circulares + micro-labels representando os beneficios/features do nicho (ex: icone de pena = "DAILY MESSAGES", cruz = "FAITH", coracao = "COMFORT", estrela = "GUIDANCE").
- ATMOSFERA: iluminacao etérea e premium coerente com o nicho (ex: luz dourada celestial pra fe; mistica/velas pra tarot; paisagem do pais-alvo ao fundo ${p.geoCountry || ''}), cores harmoniosas, raios de luz, bokeh, particulas suaves, profundidade cinematografica. Estetica de capa profissional, sofisticada, que transmite confianca.
- Mencione o pais-alvo no cenario quando fizer sentido (paisagem, bandeira sutil, clima).
Termine o prompt da capa com ", 1640x856 horizontal Facebook cover banner, cinematic premium composition, ultra detailed, elegant typography layout".

3) BIO (bio): uma bio curta de pagina, NO MAXIMO 100 caracteres, no IDIOMA DA CAMPANHA (${p.campaignLang || p.contentLang || 'en-US'}), na voz da persona ${p.personaLabel}, capturando a essencia do nicho com um toque de curiosidade/acolhimento. Conte os caracteres — nao passe de 100.

4) POST DE APRESENTACAO (intro_post): um primeiro post de boas-vindas da pagina, no IDIOMA DA CAMPANHA (${p.campaignLang || p.contentLang || 'en-US'}), na voz da persona, apresentando quem ela e, o que a pagina oferece e um convite/CTA suave pra seguir e interagir. Use emojis, quebras de linha, tom autentico e caloroso (3 a 6 linhas).

Responda JSON: {"profile":{"prompt":"..."},"cover":{"prompt":"..."},"bio":"<ate 100 chars>","intro_post":"<post de apresentacao>"}`;

    case 'comment':
      if ((p.platform || 'chatdrink') === 'chatfood') {
        return `${ctx}
Gere o FLUXO DE COMENTARIOS ChatFood (captacao de lead organico via comentarios em posts).
Apenas WELCOME com UMA mensagem type:"text": message.text instigante (curto, emoji, 👇) no idioma ${p.flowLang || 'en-US'}, persona ${p.personaLabel}, + message.option[] com ${p.commentOptions || 4} botoes (title em MAIUSCULO com emoji, type:"redirect", action:"").
Responda APENAS o JSON valido no formato exato do ChatFood comment.`;
      }
      return `${ctx}
Gere o FLUXO DE COMENTARIOS ChatDrink (captacao de lead organico via comentarios em posts), no FORMATO NOVO.
Estrutura EXATA:
{
  "name":"COMENTARIOS <NICHO>","type":"comment","active":true,
  "is_master":false,"master_flow_id":null,"locale":null,"translate_status":null,
  "routes":[{"id":"route_0","name":"Rota 1","sort_order":0,"color":null,"interactions":[{"type":"mensagem","config":{
    "text":"<abertura instigante da persona ${p.personaLabel}, com emojis, gera curiosidade, termina com 👇>",
    "quick_replies":[ {"label":"<emoji + texto curto>","action_type":"route","target_route":"","target_flow":""} (${p.commentOptions || 5} quick_replies) ]
  },"sort_order":0}]}],
  "comment_trigger":{"reply_public":true,"reply_public_text":"<resposta publica curta da persona pro comentario, dizendo que mandou DM/inbox, com emoji — gera prova social no post>","active":true}
}
Idioma ${p.flowLang || 'en-US'}. O reply_public_text e a resposta PUBLICA automatica no comentario (ex: "Just sent you a DM! 💕 Check your inbox ✨").
Responda APENAS o JSON valido nesse formato exato.`;

    case 'onboard': {
      const nr = p.onboardRoutes || 7;
      const lastId = nr + 1; // route_0 random + nr conteudo + 1 goto => ultima e route_(nr+1)
      const typeInstr = p.onboardRouteType && p.onboardRouteType.indexOf('boto') >= 0 ? 'TODAS botoes'
        : p.onboardRouteType && p.onboardRouteType.indexOf('misto') >= 0 ? 'ALTERNE entre menu e botoes'
        : 'TODAS menu';
      return `${ctx}
Gere o ONBOARD ChatDrink com ${nr} rotas de CONTEUDO.
Estrutura: routes[0]=random; routes[1..${nr}]=conteudo isolado [digitando, ${typeInstr === 'TODAS botoes' ? 'botoes' : typeInstr === 'ALTERNE entre menu e botoes' ? 'menu ou botoes' : 'menu'}]; ultima rota route_${lastId}=so goto.
Tipo das rotas de conteudo: ${typeInstr}.
Cada rota de conteudo: digitando(duration:3) + ${typeInstr === 'TODAS botoes' ? 'botoes' : 'menu/botoes'} com redirect_type:"route", redirect_target:${lastId}. SEM mensagem, SEM quick_replies.
IMPORTANTE NOS LINKS: o utm_content de cada rota deve ser onbN-${(p.niche || 'nicho').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)} onde N e o numero da rota (rota 1 = onb1, rota 2 = onb2, etc). Cada rota tem seu numero unico.
routes[0] random: interactions:[{type:"random",config:{routes:[1,2,...,${nr}]},sort_order:0}] (liste os indices 1 a ${nr}).
ultima rota: interactions:[{type:"goto",config:{target_type:"flow",target_route:"",target_flow:"433"},sort_order:0}].
image_url use "https://via.placeholder.com/1200x628". Copy unica e persuasiva por rota, idioma ${p.flowLang || 'en-US'}, persona ${p.personaLabel}.
Responda APENAS o JSON valido e completo, sem markdown.`;
    }

    case 'sequence': {
      const nseq = p.seqRoutes || 3;
      const trios = nseq <= 2 ? 10 : nseq <= 4 ? 8 : nseq <= 6 ? 6 : 5;
      const fbId = nseq + 1;
      const nslug = (p.niche || 'nicho').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
      return `${ctx}
Gere a SEQUENCIA ChatDrink. ${nseq} SEQUENCIAS = ${nseq} ROTAS de conteudo (route_1..route_${nseq}) + 1 ROTA FALLBACK (route_${fbId}).
Cada rota de conteudo = UMA jornada COMPLETA: array "interactions" com trios escalando: delay -> menu -> mensagem(com 1 quick_reply). NUNCA uma rota por mensagem.
LIBERDADE CRIATIVA: cada rota deve ter NO MINIMO 7 trios (menu+mensagem). Voce PODE e DEVE variar a quantidade entre as rotas — uma pode ter 7, outra 9, outra 11. Mire em torno de ${trios} mas varie de verdade pra cada rota ser diferente.
DELAYS UNICOS POR ROTA (CRITICO): NAO repita a mesma sequencia de delays entre rotas diferentes. Cada rota tem seu proprio ritmo. Ex rota 1: 3min,8min,15min,30min,1h,2h,4h... | rota 2: 5min,10min,20min,45min,1h30,3h,5h... | rota 3: 2min,7min,12min,25min,50min,1h30,3h... Misture minutos e horas de forma unica em cada rota. NUNCA todas com os mesmos numeros.
routes[0] random: interactions:[{type:"random",config:{routes:[1,2,...,${nseq}]},sort_order:0}] (indices 1 a ${nseq}, SEM o fallback).
Cada trio: menu (card imagem "https://via.placeholder.com/1200x628" + botao) + mensagem (texto curto persona ${p.personaLabel} + 1 quick_reply action_type:"route" target_route:${fbId}).
ROTA FALLBACK (route_${fbId}, name:"Rota ${fbId + 1} - Fallback"): UM unico "botoes", title persuasivo, 1 botao url, redirect_type:"", redirect_target:"". NADA de delay/menu/mensagem.
Idioma ${p.flowLang || 'en-US'}.
CRITICO: JSON 100% VALIDO e COMPLETO. Feche TODAS as chaves. Textos concisos (1-2 frases). Responda APENAS o JSON, sem markdown.`;
    }

    case 'grid_preview':
      return `${ctx}
Antes de gerar o grid completo, proponha a DIRECAO VISUAL do MIRB grid pro nicho "${p.niche}".
Defina paleta (3-4 cores hex vibrantes), fonte marcante (Georgia, Poppins, Montserrat, Playfair Display, Arial Black).
REGRAS OBRIGATORIAS DE CONTRASTE:
- item_bg: use uma cor ESCURA e SOLIDA (ex #1a0a2e, #2d0010, #0a1628) pro fundo do titulo do item.
- item_text_color: SEMPRE clara e vibrante (#ffffff, #ffe0b3, #ffd700) pra contrastar com o item_bg escuro.
- title_color: cor vibrante e forte (NUNCA branco-pastel apagado, NUNCA tons claros que somem em fundo claro). Pode ser dourado forte, magenta, ciano — algo que salta.
- NADA de cor com luminancia alta demais (pastel apagado).
Responda JSON: {"palette":["#hex","#hex","#hex"],"font":"<fonte>","title_color":"#hex","item_bg":"#hex_escuro","item_text_color":"#hex_claro","mood":"<1 frase>"}`;

    case 'grid':
      return `${ctx}
Gere o MIRB GRID no formato de IMPORTACAO exato (para importar no plugin WordPress).
Grid: ${p.gridCols} colunas. Total de itens: ${p.gridCols * p.gridRows}.
Idioma do conteudo: ${p.contentLang}. ${p.currency !== 'USD' ? 'Moeda ' + p.currency + ' se citar valores.' : ''}
${p.gridDirection ? 'USE esta direcao visual aprovada: ' + JSON.stringify(p.gridDirection) : ''}
CSS personalizado combinando com o tema, TODAS as regras com !important. Classes: .mirb-grid-container .mirb-grid-title .mirb-grid-subtitle .mirb-grid-item .mirb-grid-item:hover .mirb-grid-item-title .mirb-grid-footer .mirb-grid-footer-line .mirb-grid-footer-highlight.
REGRA CRITICA DE LEGIBILIDADE (NAO IGNORE):
- .mirb-grid-title: fonte marcante (Georgia/Poppins/Montserrat/Arial Black), font-weight 800, font-size >= 26px, cor vibrante de alto contraste, text-shadow forte. DEVE ter um fundo proprio OU text-shadow espesso pra destacar do fundo da pagina.
- .mirb-grid-subtitle: NUNCA apagado/transparente. font-size >= 16px, font-weight 600, cor LEGIVEL (nao cinza claro fraco). Contraste forte.
- .mirb-grid-item-title: font-weight 700-800, font-size >= 16px. Se fundo claro -> texto escuro forte; se escuro -> texto claro vibrante. text-shadow sutil.
- .mirb-grid-container e .mirb-grid-footer: devem ter FUNDO solido ou gradiente (nunca transparente deixando o texto sumir).
O texto inteiro do grid deve SALTAR aos olhos, legivel em qualquer fundo de blog. Nada apagado, nada sem fundo.
Para cada item, item_image = string de busca do Pinterest em INGLES.
Responda EXATAMENTE neste formato JSON:
{"version":"1.2.2","export_date":"<data>","grid":{"grid_name":"<nome curto>","title":"<titulo no idioma do conteudo>","subtitle":"<subtitulo curto>","columns":"${p.gridCols}","global_link":"","use_global_link":"0","custom_css":"<css com !important e fontes legiveis>","footer_text_1":"<texto>","footer_text_2":"GRATIS!"},"items":[{"item_title":"<LABEL>","item_image":"<pinterest search EN>","item_link":"","item_order":"0"}]}
Gere exatamente ${p.gridCols * p.gridRows} items com item_order incremental.`;

    case 'p1_titles':
      return `${ctx}\nGere ${p.numP1} titulos de P1 (posts principais) no idioma ${p.contentLang}, estilo clickbait que puxa eCPM alto. ${p.currency !== 'USD' ? 'Moeda ' + p.currency + ' nos valores.' : ''}\nResponda JSON: {"titles":["..."]} com exatamente ${p.numP1} titulos.`;

    case 'p2_titles':
      return `${ctx}\nGere ${p.gridCols * p.gridRows} titulos de P2 (um por item do grid) no idioma ${p.contentLang}, focados em "como obter/saber mais". ${p.currency !== 'USD' ? 'Moeda ' + p.currency + '.' : ''}\nResponda JSON: {"titles":["..."]} com exatamente ${p.gridCols * p.gridRows} titulos.`;

    case 'quiz': {
      const palettes = ['sunset','mint','royal','slate','pink','purple','bordo','passion','mystic','romance','angel','ocean','forest','neon','aurora','secret','luxury','candy','arcade','zen'];
      return `${ctx}
Gere ${p.numP1} quiz overlays (UM por P1) no idioma ${p.contentLang}, no formato do plugin quiz-overlay 4.1.0.
Cada overlay preenche TODOS os 10 modos de entrada, mas voce escolhe UM como sugerido (entry_mode) que combine melhor com o nicho.
Modos disponiveis (entry_mode): "quiz","wheel","visual","hold","scratch","countdown","flip","gift","tap","trivia".
Paletas (theme_palette): ${palettes.join(', ')}. Escolha a que combina com o nicho (ex: secret/mystic/romance pra carta de amor; angel pra fe; luxury pra financas; candy/arcade pra jovem).
IMPORTANTE no modo visual: cada opcao tem "pinterest" = string de busca do Pinterest em INGLES (o sistema converte no link).
${p.currency !== 'USD' ? 'Moeda ' + p.currency + ' se citar valores.' : ''}

Para CADA overlay responda com estes campos de CONTEUDO (o resto da estrutura o sistema monta):
{
 "p1_index":1,
 "id":"<slug-curto>",
 "entry_mode":"<um dos 10 modos, o mais adequado>",
 "theme_palette":"<uma paleta>",
 "quiz_question":"<pergunta do quiz padrao>",
 "quiz_options":["op1","op2","op3"],
 "wheel_options":["6 rotulos curtos tematicos"],
 "wheel_title":"<titulo da roleta>",
 "wheel_result_label":"<label do resultado>",
 "visual_question":"<pergunta visual>",
 "visual_options":[{"label":"emoji + texto","pinterest":"EN search"},{"label":"emoji + texto","pinterest":"EN search"}],
 "hold_visual":"envelope","hold_title":"","hold_subtitle":"","hold_instruction":"","hold_emoji":"💌",
 "scratch_title":"","scratch_prize":"","scratch_hint":"","scratch_subtext":"","scratch_cover_color":"#2b1f3d",
 "countdown_title":"","countdown_reveal":"","countdown_subtext":"",
 "flip_title":"","flip_front_text":"","flip_prize":"","flip_emoji":"✉️",
 "gift_title":"","gift_prize":"","gift_emoji":"🎁","gift_btn_label":"",
 "tap_title":"","tap_label":"","tap_complete_text":"",
 "trivia_question":"","trivia_options":["op1","op2","op3","op4"],"trivia_wrong_text":"",
 "final_cta_label":"<CTA final com seta>","finish_title":"","finish_note":"","loading_text":""
}
Responda JSON: {"quizzes":[ ...${p.numP1} overlays... ]}`;
    }

    case 'meta_copy':
      return `${ctx}\nGere copy do Meta Ads no IDIOMA DA CAMPANHA (${p.campaignLang || p.contentLang || 'pt-BR'}) usando moeda ${p.currency}: 5 textos principais (clickbait, emojis, quebras), 5 titulos curtos, 1 descricao. A copy DEVE estar no idioma da campanha (GEO alvo), nao no idioma do blog.\nResponda JSON: {"primary_texts":["..."],"headlines":["..."],"description":"..."}`;

    case 'meta_onboard':
      return `${ctx}\nGere o onboard do Meta (entrada do chatbot) no IDIOMA DA CAMPANHA (${p.campaignLang || p.contentLang || 'pt-BR'}): 1 boas-vindas, 5 quick replies curtas com emoji, 1 follow-up 24h. DEVE estar no idioma da campanha (GEO alvo).\nResponda JSON: {"welcome":"...","quick_replies":["..."],"followup":"..."}`;

    case 'image_prompts': {
      const onbMenus = p.onboardMenuCount != null ? p.onboardMenuCount : (p.onboardRoutes || 7);
      const seqMenus = p.seqMenuCount != null ? p.seqMenuCount : (p.seqRoutes || 3) * 7;
      const themeLine = p.fromOptimizer
        ? `IMPORTANTE: baseie os prompts EXCLUSIVAMENTE no conteudo/tema do fluxo abaixo (ignore qualquer outro nicho). Conteudo real do fluxo enviado: "${p.niche}". As imagens devem refletir ESTE tema, nada alem disso.`
        : `Tema/nicho: "${p.niche}".`;
      // monta o esqueleto EXATO esperado a partir do mapa real de menus por rota
      let seqSkeleton = '';
      let seqExpected = seqMenus;
      if (p.seqMenuMap && p.seqMenuMap.length) {
        const items = [];
        p.seqMenuMap.forEach((r, ri) => {
          const routeNum = ri + 1; // rota 1, 2, 3... (sequencial, nao o indice cru)
          for (let c = 1; c <= r.menus; c++) items.push(`{"route":${routeNum},"step":"seq${routeNum}-card${c}","prompt":"..."}`);
        });
        seqExpected = items.length;
        seqSkeleton = `\nESQUELETO EXATO da sequencia (preencha cada "prompt", mantenha route e step EXATAMENTE como abaixo):\n[${items.join(',')}]`;
      }
      let onbSkeleton = '';
      if (!p.fromOptimizer || onbMenus > 0) {
        const oitems = [];
        for (let c = 1; c <= onbMenus; c++) oitems.push(`{"step":"onb${c}","prompt":"..."}`);
        onbSkeleton = onbMenus > 0 ? `\nESQUELETO EXATO do onboard (preencha cada prompt):\n[${oitems.join(',')}]` : '';
      }
      return `${ctx}
Gere prompts de imagem (INGLES) na quantidade EXATA. NAO invente cards a mais nem a menos.
${themeLine}
ONBOARD: EXATAMENTE ${onbMenus} prompts.${onbSkeleton}
SEQUENCIA: EXATAMENTE ${seqExpected} prompts, DISTRIBUIDOS entre as rotas conforme o esqueleto. NAO coloque tudo na rota 1 — cada card tem sua rota correta.${seqSkeleton}
Cada prompt descritivo, formato HORIZONTAL 1200x628 (formato de card de menu do Messenger, NUNCA vertical). Todos terminam com ", 1200x628 horizontal banner composition".
Responda JSON: {"onboard":[...],"sequence":[...]} preenchendo os esqueletos acima EXATAMENTE (mesmos route e step).`;
    }

    case 'creatives_prompt': {
      const plat = p.creativePlatform || 'svg_claude';
      const imgOnly = p.creativeType === 'imagem';
      const sz = p.creativeSize || '1080x1440';
      const n = p.numCreatives || 20;
      if (imgOnly) {
        // apenas imagem: prompts limpos, SEM headline/cta, pra personalizar no Canva
        return `${ctx}
Gere EXATAMENTE ${n} prompts de IMAGEM (apenas a imagem de fundo, SEM texto, SEM headline, SEM CTA) para anuncios do nicho "${p.niche}" no idioma visual coerente, formato ${sz}.
As imagens serao levadas pro Canva onde cada usuario adiciona o texto depois — entao NAO inclua texto na descricao da imagem, NAO descreva headline nem CTA. Apenas a cena/composicao visual, atmosferica e chamativa, com espaco/area limpa pra sobreposicao de texto depois.
Plataforma de geracao: ${plat}. Cada prompt deve terminar com ", ${sz}, clean composition with space for text overlay, no text".
Responda JSON: {"platform":"${plat}","size":"${sz}","type":"image_only","prompts":[{"index":1,"prompt":"..."}]} com EXATAMENTE ${n} itens, SEM campos headline/cta.`;
      }
      if (plat === 'svg_claude') {
        return `${ctx}
Gere um PROMPT completo para criar ${n} criativos SVG de anuncio (${Math.ceil(n / 2)} animados SMIL + ${Math.floor(n / 2)} estaticos), formato ${sz}, estilo gamificado (raspadinha, mystery box, placar fake) no idioma ${p.flowLang || 'en-US'}. Inclua regras tecnicas SMIL, paleta, headline, subtext, CTA e elemento visual de cada criativo. Responda JSON: {"prompt":"<markdown>"}`;
      }
      return `${ctx}
Gere ${n} prompts de imagem para a plataforma ${plat} (formato ${sz}) para anuncios do nicho "${p.niche}" no idioma ${p.flowLang || 'en-US'}. Estilo chamativo, gamificado quando possivel, COM texto curto de headline e CTA descrito. Cada prompt pronto pra colar na ferramenta. Responda JSON: {"platform":"${plat}","size":"${sz}","prompts":[{"index":1,"prompt":"...","headline":"...","cta":"..."}]}`;
    }

    case 'audios': {
      const nAudios = p.numCreatives || 20;
      const cretxt = p.creativesContext ? `\nCRIATIVOS JA GERADOS (combine cada audio com o criativo correspondente, mesma ordem):\n${p.creativesContext}` : '';
      return `${ctx}
Gere EXATAMENTE ${nAudios} scripts de audio (ate 15s cada), UM para cada criativo (sao ${nAudios} criativos). Cada audio deve fazer sentido e COMBINAR com o criativo de mesmo indice (mesma ideia/headline/CTA).${cretxt}
Idioma ${p.flowLang || 'en-US'}. Otimizados para ElevenLabs v3 com tags emocionais ([excited],[whispers],[curious],[woo],[sighs]) reforcadas com texto antes da tag, 250+ caracteres cada, CAPS pra enfase, nunca tag no final. Sugira voz expressiva (Jessica, Bella, Laura, Charlie, Charlotte) por audio variando conforme o tom.
Responda JSON: {"audios":[{"index":1,"voice":"Jessica","script":"..."}]} com EXATAMENTE ${nAudios} itens, index de 1 a ${nAudios}.`;
    }

    default:
      return `${ctx}\nBloco desconhecido: ${block}`;
  }
}

app.listen(PORT, () => {
  console.log(`MBZ::CH4TB0T NEXUS v2 ONLINE -> port ${PORT}`);
  console.log(`Server key: ${SERVER_API_KEY ? 'YES' : 'NO'} | Password: ${ACCESS_PASSWORD ? 'YES' : 'NO'}`);
});
