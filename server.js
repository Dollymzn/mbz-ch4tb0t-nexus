// ============================================================
//  MBZ::CH4TB0T NEXUS — MBOLIVEIRAZ MEDIA & TECH
//  Gerador completo de funis de arbitragem digital
//  Backend: Express + Claude API (streaming)
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PERSONAS, LANGUAGES, CURRENCIES, buildSystemPrompt } = require('./prompts');

const app = express();
const PORT = process.env.PORT || 3000;

// Chave no servidor (modo multiusuário) — opcional
const SERVER_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';

// Persistência (Railway Volume)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch { return []; }
}
function writeHistory(arr) {
  const tmp = HISTORY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
  fs.renameSync(tmp, HISTORY_FILE);
}

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// ---- Config pública (sem segredos) ----
app.get('/api/config', (req, res) => {
  res.json({
    serverKey: !!SERVER_API_KEY,
    needPassword: !!ACCESS_PASSWORD,
    personas: PERSONAS,
    languages: LANGUAGES,
    currencies: CURRENCIES
  });
});

// ---- Auth simples (senha) ----
app.post('/api/auth', (req, res) => {
  if (!ACCESS_PASSWORD) return res.json({ ok: true });
  const { password } = req.body || {};
  if (password === ACCESS_PASSWORD) return res.json({ ok: true });
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

// ---- Chamada à Claude API (não-streaming, retorna texto) ----
async function callClaude(apiKey, model, system, userMsg, maxTokens) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: maxTokens || 8000,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// ---- Endpoint principal de geração (um bloco por vez) ----
app.post('/api/generate', async (req, res) => {
  try {
    if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
    const apiKey = resolveKey(req);
    if (!apiKey) return res.status(400).json({ error: 'Sem API key. Defina no servidor ou insira a sua.' });

    const { block, params, model } = req.body || {};
    if (!block || !params) return res.status(400).json({ error: 'Faltam block ou params.' });

    const system = buildSystemPrompt();
    const userMsg = buildBlockPrompt(block, params);
    const maxTokens = block === 'creatives_prompt' || block === 'audios' ? 8000 : 6000;

    const text = await callClaude(apiKey, model, system, userMsg, maxTokens);
    res.json({ block, text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Endpoint do otimizador ----
app.post('/api/optimize', async (req, res) => {
  try {
    if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
    const apiKey = resolveKey(req);
    if (!apiKey) return res.status(400).json({ error: 'Sem API key.' });

    const { content, kind, context, model, platform } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Cole o conteúdo a otimizar.' });

    const system = buildSystemPrompt();
    const userMsg = `TAREFA: Otimizar o seguinte ${kind || 'conteúdo'} de funil de arbitragem.
${platform ? `Plataforma: ${platform}. Mantenha EXATAMENTE o formato JSON dessa plataforma.` : ''}
${context ? `Contexto/objetivo do usuário: ${context}` : ''}

Reescreva melhorando copy, ganchos de urgência, storytelling e CTR, mantendo a estrutura técnica válida e funcional. Se for JSON de chatbot, devolva JSON válido completo pronto pra importar. Se for copy/texto, devolva o texto otimizado organizado.

CONTEÚDO ORIGINAL:
${content}`;

    const text = await callClaude(apiKey, model, system, userMsg, 8000);
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Histórico ----
app.get('/api/history', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  res.json(readHistory().slice(-50).reverse());
});
app.post('/api/history', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const { niche, params, blocks } = req.body || {};
  const arr = readHistory();
  const entry = {
    id: crypto.randomUUID(),
    niche: niche || 'sem-nome',
    params: params || {},
    blocks: blocks || {},
    created_at: new Date().toISOString()
  };
  arr.push(entry);
  writeHistory(arr);
  res.json({ ok: true, id: entry.id });
});
app.delete('/api/history/:id', (req, res) => {
  if (!checkPassword(req)) return res.status(401).json({ error: 'Acesso negado.' });
  const arr = readHistory().filter(e => e.id !== req.params.id);
  writeHistory(arr);
  res.json({ ok: true });
});

// ============================================================
//  CONSTRUÇÃO DOS PROMPTS POR BLOCO
// ============================================================
function buildBlockPrompt(block, p) {
  const ctx = `
NICHO: ${p.niche}
IDIOMA DO FLUXO (chatbot): ${p.flowLang || 'en-US'}
IDIOMA DO CONTEÚDO (blog/P1/P2): ${p.contentLang || 'pt-BR'}
MOEDA LOCAL: ${p.currency || 'USD'}
PERSONA: ${p.personaLabel || 'sem persona'}
NOME DA PÁGINA FB: ${p.pageName || '(sugira um nome de pessoa real pro nicho)'}
PLATAFORMA CHATBOT: ${p.platform || 'chatdrink'}
`;

  switch (block) {
    case 'page_name':
      return `${ctx}\nSugira 5 nomes de página de Facebook que pareçam PESSOAS REAIS adequadas ao nicho "${p.niche}" (ex: Carta de Amor -> Aurora del Amor; Tarot -> Luna Serafina; Finanças -> Harper Blake). Responda JSON: {"names":["Nome 1","Nome 2","Nome 3","Nome 4","Nome 5"]}`;

    case 'onboard':
      return `${ctx}
Gere o ONBOARD do chatbot na plataforma ${p.platform}.
Número de rotas de conteúdo: ${p.onboardRoutes || 7}.
Tipo das rotas: ${p.onboardRouteType || 'menu (cards com imagem)'}.
Idioma do fluxo: ${p.flowLang || 'en-US'}.
${p.imagePrompts ? 'Para CADA card/rota, inclua também um campo "image_prompt" com um prompt em inglês para gerar a imagem daquele card.' : ''}
Devolva JSON válido completo no formato EXATO da plataforma ${p.platform}, pronto pra importar. ${p.imagePrompts ? 'Se incluir image_prompts, adicione um objeto separado "image_prompts" no final mapeando rota->prompt, sem quebrar o JSON do flow.' : ''}`;

    case 'sequence':
      return `${ctx}
Gere a SEQUÊNCIA do chatbot na plataforma ${p.platform}.
Número de rotas: ${p.seqRoutes || 3} (inclua uma rota de urgência casual e uma de storytelling com persona).
Delays escalando: 3min, 5min, 10min, 15min, 30min, 1h, 2h.
Idioma do fluxo: ${p.flowLang || 'en-US'}.
Use storytelling com a persona e urgência crescente (alguém pegou o prêmio/vaga no final).
${p.imagePrompts ? 'Para cada card/menu, inclua image_prompt em inglês.' : ''}
Devolva JSON válido completo no formato EXATO da plataforma ${p.platform}.`;

    case 'grid':
      return `${ctx}
Gere o MIRB GRID da landing page.
Formato do grid: ${p.gridCols}x${p.gridRows} = ${p.gridCols * p.gridRows} itens.
Para cada item: label (no idioma do conteúdo ${p.contentLang}), e uma query de busca do Pinterest em INGLÊS para a imagem.
Inclua também: título do grid, subtítulo, rodapé linha 1, rodapé destaque (tipo "GRÁTIS!"), tudo no idioma ${p.contentLang}.
Inclua um CSS personalizado do MIRB grid combinando com o tema/nicho, TODAS as regras com !important, usando as classes: .mirb-grid-container, .mirb-grid-title, .mirb-grid-subtitle, .mirb-grid-item, .mirb-grid-item:hover, .mirb-grid-item-title, .mirb-grid-footer, .mirb-grid-footer-line, .mirb-grid-footer-highlight.
Responda JSON: {"title","subtitle","footer_line","footer_highlight","items":[{"label","pinterest"}],"custom_css"}`;

    case 'p1_titles':
      return `${ctx}
Gere ${p.numP1} títulos de P1 (posts principais/landing) para o nicho, no idioma ${p.contentLang}, estilo clickbait que puxa eCPM alto e abrangente. ${p.currency !== 'USD' ? `Use moeda ${p.currency} quando citar valores.` : ''}
Responda JSON: {"titles":["...", ...]} com exatamente ${p.numP1} títulos.`;

    case 'p2_titles':
      return `${ctx}
Gere ${p.gridCols * p.gridRows} títulos de P2 (um para cada item do grid), no idioma ${p.contentLang}, focados em "como obter/saber mais" do tema de cada categoria. ${p.currency !== 'USD' ? `Use moeda ${p.currency} quando citar valores.` : ''}
Responda JSON: {"titles":["...", ...]} com exatamente ${p.gridCols * p.gridRows} títulos.`;

    case 'quiz':
      return `${ctx}
Gere ${p.numP1} quiz overlays (UM por P1), no idioma ${p.contentLang}.
Tipos possíveis: "texto" (opções texto), "visual" (opções com imagem), "roleta". Escolha o tipo mais adequado a cada P1 e varie.
Cada quiz: pergunta, opções (3-4; se visual incluir pinterest query em inglês por opção), texto de loading, título final, texto do CTA, nota abaixo do CTA. ${p.currency !== 'USD' ? `Moeda ${p.currency} se citar valores.` : ''}
Responda JSON: {"quizzes":[{"p1_index","type","question","options":[{"label","pinterest"}],"loading","final_title","cta","note"}]}`;

    case 'meta_copy':
      return `${ctx}
Gere a copy do Meta Ads no idioma ${p.contentLang} usando moeda ${p.currency}:
- 5 textos principais (primary text), clickbait, com emojis e quebras
- 5 títulos (headline curto)
- 1 descrição
Responda JSON: {"primary_texts":["..."],"headlines":["..."],"description":"..."}`;

    case 'meta_onboard':
      return `${ctx}
Gere o onboard do Meta (mensagem do chatbot na entrada) no idioma ${p.flowLang || 'en-US'}:
- 1 mensagem de boas-vindas
- 5 quick replies curtas com emoji
- 1 mensagem de acompanhamento (follow-up 24h)
Responda JSON: {"welcome":"...","quick_replies":["..."],"followup":"..."}`;

    case 'creatives_prompt':
      return `${ctx}
Gere um PROMPT completo para criar ${p.numCreatives || 20} criativos SVG de anúncio (${Math.ceil((p.numCreatives||20)/2)} animados SMIL + ${Math.floor((p.numCreatives||20)/2)} estáticos), 1080x1440px, estilo gamificado (roleta, raspadinha, mystery box, etc) no idioma ${p.flowLang || 'en-US'}. Inclua regras técnicas SMIL, paleta por bloco, headline, subtext, CTA e elemento visual de cada criativo. Responda em markdown dentro de JSON: {"prompt":"..."}`;

    case 'audios':
      return `${ctx}
Gere os scripts de áudio (até 15s cada) para os criativos no idioma ${p.flowLang || 'en-US'}, otimizados para ElevenLabs v3 com tags emocionais ([excited],[whispers],[curious],[woo],[sighs] etc), reforçadas com texto, 250+ caracteres cada, CAPS para ênfase, nunca tag no final. Sugira voz expressiva (Jessica, Bella, Laura, Charlie) por áudio. Responda JSON: {"audios":[{"index","voice","script"}]}`;

    default:
      return `${ctx}\nBloco desconhecido: ${block}`;
  }
}

app.listen(PORT, () => {
  console.log(`MBZ::CH4TB0T NEXUS ONLINE → port ${PORT}`);
  console.log(`Server key: ${SERVER_API_KEY ? 'YES' : 'NO'} | Password: ${ACCESS_PASSWORD ? 'YES' : 'NO'}`);
});
