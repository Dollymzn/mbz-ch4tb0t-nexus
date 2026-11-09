// ============================================================
//  MBZ::CH4TB0T NEXUS v4.1 — postprocess/posts
//  Normaliza os artigos P1/P2 gerados em lotes: campos obrigatórios, slug
//  seguro, HTML saneado (sem script/style/iframe/img/links externos, sem
//  blocos de grid/quiz que o publisher injeta), sem variáveis de chatbot,
//  tags ≤ 6, meta_description ≤ 155, contagem de palavras.
//  (json, params) => { kind, posts:[...] }
// ============================================================

const ALLOWED_TAGS = ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote'];

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'post';
}

function stripVars(s) {
  return String(s || '').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\s*\]/g, '');
}

function sanitizeHtml(html) {
  let h = String(html || '');
  // remove blocos perigosos ou que o publisher injeta sozinho
  h = h.replace(/<(script|style|iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\/\1>/gi, '');
  h = h.replace(/<(script|style|iframe|img|input|link|meta)[^>]*\/?>/gi, '');
  h = h.replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '');
  h = h.replace(/\[mirb_grid[^\]]*\]|\[quiz_overlay[^\]]*\]/gi, '');
  // links viram texto (sem links externos nos artigos)
  h = h.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
  // remove atributos de todas as tags (class/style/onclick) mantendo só a tag
  h = h.replace(/<([a-z0-9]+)(\s[^>]*)?>/gi, (m, tag) => {
    tag = tag.toLowerCase();
    return ALLOWED_TAGS.indexOf(tag) >= 0 ? '<' + tag + '>' : '';
  });
  h = h.replace(/<\/([a-z0-9]+)>/gi, (m, tag) => (ALLOWED_TAGS.indexOf(tag.toLowerCase()) >= 0 ? '</' + tag.toLowerCase() + '>' : ''));
  // headings h1 → h2 (o título do post já é h1)
  h = h.replace(/<h1>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>');
  h = stripVars(h);
  return h.replace(/\n{3,}/g, '\n\n').trim();
}

function wordCount(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

const CL_VARIANTS = ['green', 'blue', 'orange', 'purple', 'heaven', 'mystic', 'love', 'aurora', 'fire', 'gold', 'forest', 'midnight', 'wine', 'navy', 'ocean', 'slate', 'emerald', 'indigo', 'brand', 'dark'];
function cleanCopy(c) {
  if (!c || typeof c !== 'object') return null;
  const t = (v, n) => stripVars(String(v || '')).replace(/<[^>]+>/g, '').trim().slice(0, n);
  const chips = (Array.isArray(c.chips) ? c.chips : String(c.chips || '').split(/\n|,/)).map(x => t(x, 28)).filter(Boolean).slice(0, 4);
  const out = { eyebrow: t(c.eyebrow, 30).toUpperCase() || 'OPORTUNIDADE', title: t(c.title, 90), description: t(c.description, 180), button: t(c.button, 40) || 'Saiba mais', chips };
  return out.title ? out : null;
}
// cardlink gerado pelo modelo → { variant, internal, exit } (qualquer cópia pode faltar)
function fixCardlink(cl) {
  if (!cl || typeof cl !== 'object') return null;
  const variant = CL_VARIANTS.indexOf(String(cl.variant || '').toLowerCase()) >= 0 ? String(cl.variant).toLowerCase() : 'indigo';
  const internal = cleanCopy(cl.internal) || (cl.title ? cleanCopy(cl) : null); // formato antigo (cópia única) vira internal
  const exit = cleanCopy(cl.exit);
  if (!internal && !exit) return null;
  return { variant, internal, exit };
}

function fixPosts(j, params) {
  if (!j || !Array.isArray(j.posts)) return j;
  const seenSlugs = new Set();
  const posts = j.posts.map((raw, i) => {
    const p0 = raw || {};
    const title = stripVars(p0.title || ('Post ' + (i + 1))).trim();
    let slug = slugify(p0.slug || title);
    while (seenSlugs.has(slug)) slug = slug + '-' + (i + 1);
    seenSlugs.add(slug);
    const html = sanitizeHtml(p0.html || p0.content || '');
    let meta = stripVars(p0.meta_description || '').trim();
    if (!meta) meta = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
    if (meta.length > 155) meta = meta.slice(0, 152).replace(/\s+\S*$/, '') + '…';
    const tags = (Array.isArray(p0.tags) ? p0.tags : String(p0.tags || '').split(','))
      .map(t => stripVars(t).trim().toLowerCase()).filter(Boolean)
      .filter((v, k, a) => a.indexOf(v) === k).slice(0, 6);
    const fk = stripVars(p0.focus_keyword || '').trim() || title.split(/\s+/).slice(0, 4).join(' ');
    return {
      index: parseInt(p0.index, 10) || (i + 1),
      title, slug,
      excerpt: stripVars(p0.excerpt || '').trim(),
      focus_keyword: fk,
      meta_description: meta,
      tags,
      image_search: String(p0.image_search || '').trim(),
      image_alt: stripVars(p0.image_alt || title).trim(),
      html,
      has_cardlink_marker: /<!--\s*CARDLINK\s*-->/.test(html),
      cardlink: fixCardlink(p0.cardlink),
      word_count: wordCount(html)
    };
  }).sort((a, b) => a.index - b.index);
  return { kind: j.kind || 'post', posts };
}

module.exports = fixPosts;
module.exports.sanitizeHtml = sanitizeHtml;
module.exports.fixCardlink = fixCardlink;
module.exports.slugify = slugify;
module.exports.wordCount = wordCount;
