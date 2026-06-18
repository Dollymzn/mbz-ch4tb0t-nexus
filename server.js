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

    const isJsonKind = ['onboard', 'sequência', 'sequencia', 'grid'].includes((kind || '').toLowerCase());
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
      return `${ctx}\nGere 6 nomes de pagina de Facebook que pareçam PESSOAS REAIS adequadas ESPECIFICAMENTE ao nicho "${p.niche}". Devem combinar com o tema do nicho. Responda JSON: {"names":["Nome Sobrenome", ...]}`;

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
Defina paleta (3-4 cores hex), tom e estilo. REGRA CRITICA DE LEGIBILIDADE: o texto dos titulos deve ser de ALTO CONTRASTE e facil de ler — fontes marcantes (Georgia, Poppins, Montserrat, Arial Black), peso 600-800, cor com contraste forte sobre o fundo do item (NUNCA texto claro sobre fundo claro, nunca cor fraca/apagada). Prefira fundo do item-title solido ou escuro com texto claro vibrante, OU fundo claro com texto escuro forte.
Responda JSON: {"palette":["#hex","#hex","#hex"],"font":"<nome da fonte>","title_color":"#hex","item_bg":"#hex","item_text_color":"#hex","mood":"<1 frase descrevendo o visual>"}`;

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

    case 'quiz':
      return `${ctx}
Gere ${p.numP1} quiz overlays (UM por P1) no idioma ${p.contentLang}.
Tipos: "texto", "visual" (opcoes com imagem), "roleta". Varie conforme cada P1.
Cada quiz: pergunta, opcoes (3-4; se visual incluir pinterest EN por opcao), loading, titulo final, cta, nota. ${p.currency !== 'USD' ? 'Moeda ' + p.currency + '.' : ''}
Responda JSON: {"quizzes":[{"p1_index":1,"type":"texto","question":"","options":[{"label":"","pinterest":""}],"loading":"","final_title":"","cta":"","note":""}]}`;

    case 'meta_copy':
      return `${ctx}\nGere copy do Meta Ads no IDIOMA DA CAMPANHA (${p.campaignLang || p.contentLang || 'pt-BR'}) usando moeda ${p.currency}: 5 textos principais (clickbait, emojis, quebras), 5 titulos curtos, 1 descricao. A copy DEVE estar no idioma da campanha (GEO alvo), nao no idioma do blog.\nResponda JSON: {"primary_texts":["..."],"headlines":["..."],"description":"..."}`;

    case 'meta_onboard':
      return `${ctx}\nGere o onboard do Meta (entrada do chatbot) no IDIOMA DA CAMPANHA (${p.campaignLang || p.contentLang || 'pt-BR'}): 1 boas-vindas, 5 quick replies curtas com emoji, 1 follow-up 24h. DEVE estar no idioma da campanha (GEO alvo).\nResponda JSON: {"welcome":"...","quick_replies":["..."],"followup":"..."}`;

    case 'image_prompts': {
      const onbMenus = p.onboardMenuCount != null ? p.onboardMenuCount : (p.onboardRoutes || 7);
      const seqMenus = p.seqMenuCount != null ? p.seqMenuCount : (p.seqRoutes || 3) * 7;
      return `${ctx}
Gere prompts de geracao de imagem (em INGLES) APENAS para os cards/menus que existem no fluxo.
ONBOARD: exatamente ${onbMenus} prompts (um por card de menu — botoes nao tem imagem).
SEQUENCIA: exatamente ${seqMenus} prompts (um por card de menu de todas as rotas somadas).
Cada prompt pronto pra DALL-E/Flux/Google Flow, descritivo, fotografico ou ilustrativo conforme o nicho "${p.niche}", vertical.
Responda JSON: {"onboard":[{"step":"onb1","prompt":"..."}],"sequence":[{"route":1,"step":"seq1-card1","prompt":"..."}]} com exatamente ${onbMenus} itens em onboard e ${seqMenus} em sequence.`;
    }

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
