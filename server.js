// ============================================================
//  MBZ::CH4TB0T NEXUS v2 — MBOLIVEIRAZ MEDIA & TECH
//  Backend: Express + Claude API (retry + parsing robusto)
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  PERSONAS, LANGUAGES, CURRENCIES, CREATIVE_PLATFORMS, CREATIVE_SIZES,
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
    personas: PERSONAS, languages: LANGUAGES, currencies: CURRENCIES,
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

// ---- GERAÇÃO ----
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
    const text = await callClaude(apiKey, model, system, userMsg, heavy ? 16000 : 7000);

    const json = extractJSON(text);
    // formato: { raw, json, kind } — frontend decide como exibir/baixar
    res.json({ block, raw: text, json: json, ok: true });
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

    const isJsonKind = ['onboard', 'sequência', 'sequencia', 'grid'].includes((kind || '').toLowerCase());
    const system = buildSystemPrompt();
    const userMsg = `TAREFA: Otimizar o seguinte ${kind || 'conteudo'} de funil de arbitragem.
${platform ? 'Plataforma: ' + platform + '. Mantenha EXATAMENTE o formato JSON dessa plataforma.' : ''}
${context ? 'Objetivo do usuario: ' + context : ''}
Melhore copy, ganchos de urgencia, storytelling e CTR. Mantenha a estrutura tecnica valida.
${isJsonKind ? 'Devolva APENAS JSON valido completo pronto pra importar.' : 'Devolva texto limpo e organizado (NAO JSON), pronto pra copiar e colar.'}

CONTEUDO ORIGINAL:
${content}`;
    const text = await callClaude(apiKey, model, system, userMsg, 16000);
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
MOEDA: ${p.currency || 'USD'}
PERSONA: ${p.personaLabel || 'sem persona'}
NOME DA PAGINA FB: ${p.pageName || '(sugira)'}
PLATAFORMA: ${p.platform || 'chatdrink'}
SLUG: ${nslug}`;

  switch (block) {
    case 'page_name':
      return `${ctx}\nGere 6 nomes de pagina de Facebook que pareçam PESSOAS REAIS adequadas ESPECIFICAMENTE ao nicho "${p.niche}". Devem combinar com o tema do nicho. Responda JSON: {"names":["Nome Sobrenome", ...]}`;

    case 'onboard':
      return `${ctx}
Gere o ONBOARD completo na plataforma ${p.platform}.
Numero de rotas de conteudo: ${p.onboardRoutes || 7}. Tipo: ${p.onboardRouteType || 'menu'}.
Idioma do fluxo: ${p.flowLang || 'en-US'}. Persona: ${p.personaLabel}.
${p.imagePrompts ? 'NAO inclua image_prompts aqui (serao gerados em bloco separado).' : ''}
Use a estrutura EXATA da plataforma ${p.platform}. routes[0] random; ultima rota goto. Cada rota de conteudo com seu redirect_target.
Responda APENAS o JSON do flow, valido e completo.`;

    case 'sequence':
      return `${ctx}
Gere a SEQUENCIA completa na plataforma ${p.platform}.
ATENCAO CRITICA: o usuario quer ${p.seqRoutes || 3} SEQUENCIAS. Isso significa ${p.seqRoutes || 3} ROTAS de conteudo (route_1 ... route_${p.seqRoutes || 3}), e CADA rota deve conter UMA SEQUENCIA COMPLETA — um unico array de interactions com 8 a 12 trios escalando: delay -> menu -> mensagem(quick_reply) repetidos. NAO faça uma rota por mensagem. routes[0] = random apontando pra todas as ${p.seqRoutes || 3} rotas.
Delays escalam: 3min, 5min, 10min, 15min, 30min, 1h, 2h, 3h...
Cada trio: menu (card com imagem + botao pro blog) + mensagem (texto da persona ${p.personaLabel} + quick_reply pra fallback). Varie os angulos de urgencia/storytelling entre as rotas.
Idioma do fluxo: ${p.flowLang || 'en-US'}.
Responda APENAS o JSON do flow, valido e completo.`;

    case 'grid':
      return `${ctx}
Gere o MIRB GRID no formato de IMPORTACAO exato (para importar no plugin WordPress).
Grid: ${p.gridCols} colunas. Total de itens: ${p.gridCols * p.gridRows}.
Idioma do conteudo: ${p.contentLang}. ${p.currency !== 'USD' ? 'Moeda ' + p.currency + ' se citar valores.' : ''}
Inclua CSS personalizado combinando com o tema do nicho, TODAS as regras com !important, usando classes .mirb-grid-container .mirb-grid-title .mirb-grid-subtitle .mirb-grid-item .mirb-grid-item:hover .mirb-grid-item-title .mirb-grid-footer .mirb-grid-footer-line .mirb-grid-footer-highlight.
Para cada item, item_image deve ser uma string de busca do Pinterest em INGLES (placeholder pra imagem).
Responda EXATAMENTE neste formato JSON:
{"version":"1.2.2","export_date":"<data>","grid":{"grid_name":"<nome curto>","title":"<titulo no idioma do conteudo>","subtitle":"<subtitulo curto>","columns":"${p.gridCols}","global_link":"","use_global_link":"0","custom_css":"<css com !important>","footer_text_1":"<texto>","footer_text_2":"GRATIS!"},"items":[{"item_title":"<LABEL>","item_image":"<pinterest search EN>","item_link":"","item_order":"0"}]}
Gere exatamente ${p.gridCols * p.gridRows} items com item_order incremental.`;

    case 'p1_titles':
      return `${ctx}\nGere ${p.numP1} titulos de P1 (posts principais) no idioma ${p.contentLang}, estilo clickbait que puxa eCPM alto. ${p.currency !== 'USD' ? 'Moeda ' + p.currency + ' nos valores.' : ''}\nResponda JSON: {"titles":["..."]} com exatamente ${p.numP1} titulos.`;

    case 'p2_titles':
      return `${ctx}\nGere ${p.gridCols * p.gridRows} titulos de P2 (um por item do grid) no idioma ${p.contentLang}, focados em "como obter/saber mais". ${p.currency !== 'USD' ? 'Moeda ' + p.currency + '.' : ''}\nResponda JSON: {"titles":["..."]} com exatamente ${p.gridCols * p.gridRows} titulos.`;

    case 'quiz':
      return `${ctx}
Gere ${p.numP1} quiz overlays (UM por P1) no idioma ${p.contentLang}.
Tipos: "texto", "visual" (opcoes com imagem), "roleta". Varie conforme cada P1.
Cada quiz: pergunta, opcoes (3-4; se visual incluir pinterest EN por opcao), loading, titulo final, cta, nota. ${p.currency !== 'USD' ? 'Moeda ' + p.currency + '.' : ''}
Responda JSON: {"quizzes":[{"p1_index":1,"type":"texto","question":"","options":[{"label":"","pinterest":""}],"loading":"","final_title":"","cta":"","note":""}]}`;

    case 'meta_copy':
      return `${ctx}\nGere copy do Meta Ads no idioma ${p.contentLang} usando moeda ${p.currency}: 5 textos principais (clickbait, emojis, quebras), 5 titulos curtos, 1 descricao.\nResponda JSON: {"primary_texts":["..."],"headlines":["..."],"description":"..."}`;

    case 'meta_onboard':
      return `${ctx}\nGere o onboard do Meta (entrada do chatbot) no idioma ${p.flowLang || 'en-US'}: 1 boas-vindas, 5 quick replies curtas com emoji, 1 follow-up 24h.\nResponda JSON: {"welcome":"...","quick_replies":["..."],"followup":"..."}`;

    case 'image_prompts':
      return `${ctx}
Gere prompts de geracao de imagem (em INGLES) para CADA passo visual do fluxo do chatbot.
Considere ${p.onboardRoutes || 7} cards de onboard e ${p.seqRoutes || 3} sequencias com ~8 cards cada.
Cada prompt deve ser pronto pra DALL-E/Flux/Google Flow, descritivo, fotografico ou ilustrativo conforme o nicho "${p.niche}", vertical.
Responda JSON: {"onboard":[{"step":"onb1","prompt":"..."}],"sequence":[{"route":1,"step":"seq1-card1","prompt":"..."}]}`;

    case 'creatives_prompt': {
      const plat = p.creativePlatform || 'svg_claude';
      if (plat === 'svg_claude') {
        return `${ctx}
Gere um PROMPT completo para criar ${p.numCreatives || 20} criativos SVG de anuncio (${Math.ceil((p.numCreatives || 20) / 2)} animados SMIL + ${Math.floor((p.numCreatives || 20) / 2)} estaticos), formato ${p.creativeSize || '1080x1440'}, estilo gamificado (roleta, raspadinha, mystery box, placar fake) no idioma ${p.flowLang || 'en-US'}. Inclua regras tecnicas SMIL, paleta, headline, subtext, CTA e elemento visual de cada criativo. Responda JSON: {"prompt":"<markdown>"}`;
      }
      return `${ctx}
Gere ${p.numCreatives || 20} prompts de imagem para a plataforma ${plat} (formato ${p.creativeSize || '1080x1440'}) para anuncios do nicho "${p.niche}" no idioma ${p.flowLang || 'en-US'}. Estilo chamativo, gamificado quando possivel, com texto curto de headline e CTA descrito. Cada prompt pronto pra colar na ferramenta. Responda JSON: {"platform":"${plat}","size":"${p.creativeSize || '1080x1440'}","prompts":[{"index":1,"prompt":"...","headline":"...","cta":"..."}]}`;
    }

    case 'audios':
      return `${ctx}\nGere scripts de audio (ate 15s) para os criativos no idioma ${p.flowLang || 'en-US'}, otimizados para ElevenLabs v3 com tags emocionais ([excited],[whispers],[curious],[woo],[sighs]) reforcadas com texto, 250+ caracteres cada, CAPS pra enfase, nunca tag no final. Sugira voz expressiva (Jessica, Bella, Laura, Charlie) por audio.\nResponda JSON: {"audios":[{"index":1,"voice":"Jessica","script":"..."}]}`;

    default:
      return `${ctx}\nBloco desconhecido: ${block}`;
  }
}

app.listen(PORT, () => {
  console.log(`MBZ::CH4TB0T NEXUS v2 ONLINE -> port ${PORT}`);
  console.log(`Server key: ${SERVER_API_KEY ? 'YES' : 'NO'} | Password: ${ACCESS_PASSWORD ? 'YES' : 'NO'}`);
});
