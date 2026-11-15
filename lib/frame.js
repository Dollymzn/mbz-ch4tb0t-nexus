// ============================================================
//  MBZ::CH4TB0T NEXUS v4.3 — lib/frame.js  ·  cliente MCP do FRAME (Moodlr)
//  O Nexus fala com o Frame como cliente MCP (JSON-RPC 2.0 sobre HTTP, Streamable
//  HTTP ou SSE) usando a CHAVE PESSOAL de quem clicou (Bearer frm_…). A chave vem no
//  header x-frame-key de cada request e NUNCA é guardada no servidor.
//  Endpoint: FRAME_MCP_URL (padrão https://town.moodlr.digital/mcp).
// ============================================================
const FRAME_MCP_URL = process.env.FRAME_MCP_URL || 'https://town.moodlr.digital/mcp';
const TIMEOUT_MS = Number(process.env.FRAME_TIMEOUT_MS) || 240000; // criar_designs pode passar de 3 min

// ferramentas que o Nexus pode chamar em nome do usuário
const ALLOWED = new Set([
  'frame_quem_sou', 'frame_uso_hoje', 'frame_listar_vozes', 'frame_formatos_e_modelos', 'frame_listar_designs',
  'frame_ver_design', 'frame_criar_designs', 'frame_criar_de_modelo', 'frame_duplicar_design', 'frame_editar_textos',
  'frame_estilizar_textos', 'frame_subir_imagem', 'frame_gerar_imagem', 'frame_trocar_imagem', 'frame_narrar',
  'frame_traduzir_design', 'frame_paginas', 'frame_enviar_creative_studio', 'frame_status_envios'
]);

let rpcId = 0;

function parseSSE(text) {
  // pega o último "data:" com um JSON-RPC válido (resposta da chamada)
  const msgs = [];
  text.split(/\r?\n\r?\n/).forEach(chunk => {
    const data = chunk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
    if (!data) return;
    try { msgs.push(JSON.parse(data)); } catch (e) { /* ignora */ }
  });
  return msgs;
}

// Resultado MCP → objeto útil: structuredContent > content[0].text (JSON) > texto
function unwrap(result) {
  if (!result) return null;
  if (result.structuredContent) return result.structuredContent;
  const c = Array.isArray(result.content) ? result.content : [];
  const texts = c.filter(x => x && x.type === 'text').map(x => x.text);
  const joined = texts.join('\n').trim();
  if (!joined) return result;
  try { return JSON.parse(joined); } catch (e) { return { text: joined }; }
}

async function frameCall(token, name, args, opts) {
  if (!ALLOWED.has(name)) throw new Error('ferramenta não permitida: ' + name);
  if (!token || !/^frm_/.test(String(token).trim())) throw new Error('chave do Frame ausente ou inválida (começa com frm_)');
  const id = ++rpcId;
  const body = { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args || {} } };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (opts && opts.timeoutMs) || TIMEOUT_MS);
  let res;
  try {
    res = await fetch((opts && opts.url) || FRAME_MCP_URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + String(token).trim(), 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === 'AbortError' ? 'Frame demorou demais (' + name + ')' : 'Frame inacessível: ' + e.message);
  }
  clearTimeout(timer);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();
  if (res.status === 401) throw new Error('Frame: chave inválida ou revogada (401)');
  if (res.status === 403) throw new Error('Frame: sem permissão (403)');
  if (res.status === 429) throw new Error('Frame: cota do dia estourada (429)' + (text ? ' — ' + text.slice(0, 200) : ''));
  let msg = null;
  if (ct.includes('text/event-stream')) {
    const msgs = parseSSE(text);
    msg = msgs.find(m => m && m.id === id) || msgs.reverse().find(m => m && (m.result || m.error)) || null;
  } else {
    try { msg = JSON.parse(text); } catch (e) { throw new Error('Frame respondeu algo que não é JSON (' + res.status + '): ' + text.slice(0, 200)); }
    if (Array.isArray(msg)) msg = msg.find(m => m && m.id === id) || msg[0];
  }
  if (!msg) throw new Error('Frame: resposta vazia (' + res.status + ')');
  if (msg.error) throw new Error('Frame: ' + (msg.error.message || JSON.stringify(msg.error)));
  if (!res.ok) throw new Error('Frame HTTP ' + res.status + ': ' + text.slice(0, 200));
  const r = msg.result || {};
  if (r.isError) { const u = unwrap(r); throw new Error('Frame: ' + (u && (u.text || u.error || u.message) || 'erro na ferramenta ' + name)); }
  return unwrap(r);
}

// ---------- helpers de domínio ----------
const LANG_MAP = { pt: 'pt', 'pt-br': 'pt', 'pt-pt': 'pt', en: 'en', 'en-us': 'en', 'en-gb': 'en', es: 'es', 'es-mx': 'es', 'es-es': 'es', 'es-419': 'es', fr: 'fr', 'fr-fr': 'fr', it: 'it', de: 'de', nl: 'nl', ro: 'ro', hu: 'hu', el: 'el', tr: 'tr', cs: 'cs', sk: 'sk', da: 'da', bg: 'bg', hi: 'hi', bn: 'bn', th: 'th', id: 'id', ko: 'ko', ja: 'ja', ur: 'ur', pl: 'pl', uk: 'uk', zh: 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh', 'zh-hk': 'zh_hk', ru: 'ru', ar: 'ar', sr: 'sr' };
function frameLang(code) { const k = String(code || '').toLowerCase().replace('_', '-'); return LANG_MAP[k] || LANG_MAP[k.split('-')[0]] || null; }

function frameFormat(size, ratio) {
  const s = String(size || '').toLowerCase().replace(/\s/g, '');
  if (/1080x1920|9:16|story/.test(s + ' ' + (ratio || ''))) return 'story';
  if (/1080x1350|4:5|1080x1440|retrato/.test(s)) return 'retrato';
  if (/1200x628|1200x627|1.91:1|link/.test(s)) return 'link';
  if (/1280x720|16:9|youtube/.test(s + ' ' + (ratio || ''))) return 'youtube';
  return 'post';
}

const CTA_BY_LANG = { pt: 'Saiba mais', en: 'Learn more', es: 'Saber más', fr: 'En savoir plus', it: 'Scopri di più', de: 'Mehr erfahren', nl: 'Meer weten', ro: 'Află mai mult', pl: 'Dowiedz się', hi: 'और जानें', tr: 'Daha fazla', ar: 'اعرف المزيد', ru: 'Узнать больше', ja: '詳しく見る', ko: '자세히 보기', zh: '了解更多', id: 'Pelajari', th: 'ดูเพิ่มเติม' };

// Monta os "itens" de frame_criar_designs a partir dos blocos do Nexus:
//   prompts (creatives_prompt.prompts[].prompt) + headlines (meta_copy.headlines) + CTA
function buildCreativeItems({ prompts, headlines, ctas, lang, formato, niche, persona, max }) {
  const L = frameLang(lang) || 'pt';
  const hs = (headlines || []).filter(Boolean);
  const cs = (ctas || []).filter(Boolean);
  const defCta = CTA_BY_LANG[L] || 'Learn more';
  const n = Math.min(prompts.length, max || 7);
  const items = [];
  for (let i = 0; i < n; i++) {
    const p = prompts[i];
    const scene = String(typeof p === 'string' ? p : (p.prompt || p.text || '')).trim();
    if (!scene) continue;
    const h = hs.length ? hs[i % hs.length] : '';
    const cta = cs.length ? cs[i % cs.length] : defCta;
    const brief = [
      `Meta Ads creative for the niche "${niche || ''}"${persona ? ' — persona/voice: ' + persona : ''}. Language: ${L}. Format: ${formato || 'post'}.`,
      `SCENE (background, no text drawn in the image): ${scene}`,
      h ? `HEADLINE text (exact, editable, bold, high contrast, max 2 lines): "${h}"` : '',
      `CTA button text (exact): "${cta}"`,
      'Leave clean space for the headline; mood and lighting as described; no logos, no brand names, no country references, no payment cards, no nudity.'
    ].filter(Boolean).join('\n');
    items.push({ briefing: brief.slice(0, 4000), formato: formato || 'post', quantidade: 1, foto: true });
  }
  return items;
}

// extrai designs {id, nome, link} de qualquer formato de resposta
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function extractDesigns(result) {
  const out = []; const seen = new Set();
  const push = (d) => { if (d && d.id && !seen.has(d.id)) { seen.add(d.id); out.push({ id: d.id, nome: d.nome || d.name || d.titulo || '', link: d.link || d.url || ('https://town.moodlr.digital/?tab=frame&design=' + d.id), idioma: d.idioma || d.lang || null }); } };
  const walk = (v, depth) => {
    if (!v || depth > 6) return;
    if (Array.isArray(v)) { v.forEach(x => walk(x, depth + 1)); return; }
    if (typeof v === 'object') {
      if (typeof v.id === 'string' && UUID_RE.test(v.id) && (v.link || v.url || v.nome || v.name || v.largura || v.paginas)) push(v);
      UUID_RE.lastIndex = 0;
      Object.keys(v).forEach(k => { if (k !== 'id') walk(v[k], depth + 1); });
    }
  };
  walk(result, 0);
  if (!out.length && result) { // fallback: qualquer UUID no texto
    const txt = typeof result === 'string' ? result : JSON.stringify(result);
    (txt.match(UUID_RE) || []).forEach(id => push({ id }));
  }
  return out;
}

module.exports = { frameCall, unwrap, parseSSE, frameLang, frameFormat, buildCreativeItems, extractDesigns, ALLOWED, FRAME_MCP_URL, CTA_BY_LANG };
