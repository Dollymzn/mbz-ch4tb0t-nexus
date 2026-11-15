// ============================================================
//  MBZ::CH4TB0T NEXUS v4.2 — lib/lint.js  ·  LINT META (determinístico, sem IA)
//  Varre textos que vão pro Meta (broadcasts, copy, entrada CTM, títulos, comentário)
//  e aponta termos que reprovam anúncio/página: atributos pessoais, promessas,
//  dinheiro garantido, sexualização, menores, saúde, armas, etc. Multi-idioma.
//  Saída: [{ where, term, why }] — vira warning no card ("LINT META: …").
// ============================================================
const RULES = [
  { id: 'personal', why: 'atributo pessoal do leitor (Meta proíbe "você que é…")', re: /\b(voc[êe] (que )?[ée] (solteir[oa]|divorciad[oa]|vi[úu]v[oa]|desempregad[oa]|endividad[oa]|negativad[oa]|gord[oa]|velh[oa]|doente|deprimid[oa])|you(\'re| are) (single|divorced|broke|unemployed|overweight|depressed|in debt)|eres (solter[oa]|divorciad[oa]|gord[oa])|est[áa]s (endeudad[oa]|deprimid[oa]))\b/i },
  { id: 'guarantee', why: 'promessa garantida / resultado certo', re: /\b(garantid[oa]s?|100% (aprovad|certeza|seguro)|guaranteed|sin fallar|sem falhar|aprova[çc][ãa]o (garantida|imediata|na hora)|approval guaranteed|dinheiro f[áa]cil|easy money|fique rico|get rich|enriquecer r[áa]pido)\b/i },
  { id: 'money_prize', why: 'prêmio/dinheiro/grátis como chamariz (AdX + Meta)', re: /\b(ganhe (dinheiro|r\$|\$|um pr[êe]mio|gr[áa]tis)|pr[êe]mio garantido|win (cash|money|a prize)|free money|dinero gratis|gane dinero|sorteio|lottery|loteria|aposta|cassino|casino|bet365)\b/i },
  { id: 'sexual', why: 'sexualização explícita', re: /\b(sexo|transar|transa|nudes?|pelad[oa]s?|lingerie|hookup|get laid|sex tonight|nude|naked|calientes?|sexy|gostos[ao]|safad[ao]|xxx|porn)\b/i },
  { id: 'minors', why: 'menção a menores/estudantes (reprovação automática em dating)', re: /\b(menor(es)? de idade|adolescente|teen(s|ager)?|colegial|estudante|schoolgirl|girls?|garot(a|inha)s?|novinha|ni[ñn]as?|chicas? j[óo]venes)\b/i },
  { id: 'health', why: 'claim de saúde/peso/cura', re: /\b(emagre[çc]a|perca \d+ ?kg|lose \d+ ?(lbs|pounds|kg)|cura(r)? (a |o )?(diabetes|c[âa]ncer|ansiedade)|cure|milagre|miracle|sem dieta|without diet)\b/i },
  { id: 'urgency_fake', why: 'urgência falsa / escassez inventada', re: /\b([úu]ltimas? \d+ vagas?|only \d+ left|s[óo] hoje|only today|expira em \d+ ?min|expires in \d+ ?min|[úu]ltim[ao] chance)\b/i },
  { id: 'brand', why: 'marca registrada de terceiros (uso indevido)', re: /\b(facebook|instagram|whatsapp|meta ads|google|netflix|nubank|caixa|governo federal|gov\.br|shein|tinder|bumble|mercado ?livre|amazon)\b/i, soft: true },
  { id: 'country', why: 'país/nacionalidade explícita (Flow/Meta — evite no visual, ok no texto se for o GEO)', re: /\b(brazilian|brasileir[oa]s?|mexican[oa]s?|colombian[oa]s?|indian|nigerian)\b/i, soft: true },
  { id: 'shout', why: 'CAPS/excesso de pontuação (reprova por "sensacionalismo")', re: /(!{3,}|\?{3,}|\b[A-ZÀ-Ú]{6,}\b.*\b[A-ZÀ-Ú]{6,}\b.*\b[A-ZÀ-Ú]{6,}\b)/ },
  { id: 'vars', why: 'variável de template fora do lugar', re: /\{\{(?!URL_REDIR|CAMPAIGN_BROAD|NOMEDAPAGINA|FIRST_NAME|user_first_name)[^}]*\}\}/ }
];

function scan(text, where, out, opts) {
  const s = String(text || '');
  if (!s.trim()) return;
  for (const r of RULES) {
    if (opts && opts.skip && opts.skip.indexOf(r.id) >= 0) continue;
    const m = s.match(r.re);
    if (m) out.push({ where, term: String(m[0]).slice(0, 40), why: r.why, soft: !!r.soft, rule: r.id });
  }
}
// percorre strings de um JSON (até profundidade 6), ignorando chaves técnicas
const SKIP_KEYS = /^(url|image_url|image_search|item_link|payload|id|slug|voice_id|html|_|image_prompt|pexels_search)/;
function walk(v, path, out, depth, opts) {
  if (depth > 6 || v == null) return;
  if (typeof v === 'string') { scan(v, path, out, opts); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[' + i + ']', out, depth + 1, opts)); return; }
  if (typeof v === 'object') Object.keys(v).forEach(k => { if (!SKIP_KEYS.test(k)) walk(v[k], path ? path + '.' + k : k, out, depth + 1, opts); });
}
const LINT_BLOCKS = { broadcast: {}, meta_copy: {}, meta_onboard: {}, p1_titles: { skip: ['shout'] }, p2_titles: { skip: ['shout'] }, comment: {}, onboard: { skip: ['brand'] }, sequence: { skip: ['brand'] } };
function lintBlock(block, json) {
  const opts = LINT_BLOCKS[block]; if (!opts || !json) return [];
  const out = []; walk(json, '', out, 0, opts);
  // dedupe por regra+termo
  const seen = new Set();
  return out.filter(x => { const k = x.rule + '|' + x.term.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
}
function toWarnings(hits) { return hits.map(h => (h.soft ? 'LINT META (atenção): ' : 'LINT META: ') + '"' + h.term + '" em ' + h.where + ' — ' + h.why); }
module.exports = { lintBlock, toWarnings, RULES, LINT_BLOCKS };
