// ============================================================
//  MBZ::CH4TB0T NEXUS v4.1 — lib/wp.js
//  Publisher WordPress: cliente REST (senha de aplicação) + montagem dos
//  posts P1/P2 no formato real dos blogs + fluxo P2 → grid (MIRB GRID
//  mirb-grid/v1) → P1 (grid + offerwall inline) + Yoast + imagem destacada.
//
//  Mapeado em blog.miawzy.com (08/11/2026):
//   - P1: <!-- wp:mirb/grid {"gridId":N} /--> + <!-- wp:quiz-overlay/block {…} /-->
//         + corpo em blocos Gutenberg; botoes-internos/app-block após o 1º H2
//   - P2: HTML clássico + app-block após o 1º H2
//   - grid.item_link = {home}/{p2_id}/  (plugin acrescenta ?src=)
//   - Yoast: meta _yoast_wpseo_focuskw / _metadesc / _title (registrados na REST)
//     com fallback na ability yoast-seo/update-post-seo-data
// ============================================================

const { findPhotoUrl } = require('./photos');

const REQ_TIMEOUT_MS = 30000;
const MEDIA_TIMEOUT_MS = 60000;

function normUrl(u) {
  return String(u || '').trim().replace(/\/+$/, '').replace(/\/wp-admin.*$/i, '').replace(/\/wp-json.*$/i, '');
}

// Serialização de atributos de bloco igual ao @wordpress/blocks (comentário HTML
// não pode conter "--"; < > & " viram escapes unicode).
function serializeAttrs(obj) {
  return JSON.stringify(obj)
    .replace(/--/g, '\\u002d\\u002d')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\\"/g, '\\u0022');
}

/* ---------------------------------------------------------------------
 * Cliente REST
 * ------------------------------------------------------------------- */
class WPClient {
  constructor(blog) {
    this.home = normUrl(blog.url);
    this.auth = 'Basic ' + Buffer.from(String(blog.user || '') + ':' + String(blog.appPassword || blog.app_password || '')).toString('base64');
    this.fetch = blog.fetch || globalThis.fetch;
  }

  async req(path, opts) {
    opts = opts || {};
    const url = this.home + '/wp-json' + path;
    const headers = Object.assign({ Authorization: this.auth, Accept: 'application/json' }, opts.headers || {});
    let body = opts.body;
    if (body && typeof body === 'object' && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const attempts = opts.retries == null ? 2 : opts.retries;
    let lastErr;
    for (let i = 0; i <= attempts; i++) {
      try {
        const r = await this.fetch(url, { method: opts.method || 'GET', headers, body, signal: AbortSignal.timeout(opts.timeoutMs || REQ_TIMEOUT_MS) });
        const text = await r.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
        if (r.status >= 500 && i < attempts) { lastErr = new Error('HTTP ' + r.status); continue; }
        if (!r.ok) {
          const msg = (json && (json.message || json.code)) || text.slice(0, 200) || ('HTTP ' + r.status);
          const err = new Error(msg); err.status = r.status; err.body = json; throw err;
        }
        return json;
      } catch (e) {
        if (e && e.status) throw e; // erro HTTP 4xx: não repete
        lastErr = e;
        if (i >= attempts) break;
      }
    }
    throw lastErr || new Error('falha de rede');
  }

  me() { return this.req('/wp/v2/users/me?context=edit'); }

  async siteInfo() {
    const r = await this.fetch(this.home + '/wp-json/', { signal: AbortSignal.timeout(REQ_TIMEOUT_MS) });
    const j = await r.json();
    return { name: j.name, description: j.description, home: j.home, namespaces: j.namespaces || [] };
  }

  async categories() {
    return this.req('/wp/v2/categories?per_page=100&_fields=id,name,slug,count');
  }

  async findOrCreateCategory(name) {
    const cats = await this.categories();
    const n = String(name || '').trim().toLowerCase();
    const hit = cats.find(c => c.name.toLowerCase() === n) || cats.find(c => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()));
    if (hit) return hit.id;
    const created = await this.req('/wp/v2/categories', { method: 'POST', body: { name: String(name).trim() } });
    return created.id;
  }

  async findOrCreateTags(names) {
    const ids = [];
    for (const raw of (names || [])) {
      const name = String(raw || '').trim();
      if (!name) continue;
      try {
        const found = await this.req('/wp/v2/tags?search=' + encodeURIComponent(name) + '&per_page=5&_fields=id,name');
        const exact = (found || []).find(t => t.name.toLowerCase() === name.toLowerCase());
        if (exact) { ids.push(exact.id); continue; }
        const created = await this.req('/wp/v2/tags', { method: 'POST', body: { name } });
        ids.push(created.id);
      } catch (e) {
        // tag já existe (term_exists) → id vem em data.term_id
        const tid = e && e.body && e.body.data && e.body.data.term_id;
        if (tid) ids.push(tid);
      }
    }
    return ids;
  }

  async uploadMediaFromUrl(srcUrl, filename, alt) {
    const r = await this.fetch(srcUrl, { signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
    if (!r.ok) throw new Error('download da imagem falhou: HTTP ' + r.status);
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = /png/.test(ct) ? 'png' : /webp/.test(ct) ? 'webp' : 'jpg';
    const fname = (filename || 'nexus').replace(/[^a-z0-9-]+/gi, '-').slice(0, 60) + '.' + ext;
    const media = await this.req('/wp/v2/media', {
      method: 'POST', timeoutMs: MEDIA_TIMEOUT_MS,
      headers: { 'Content-Type': ct, 'Content-Disposition': 'attachment; filename="' + fname + '"' },
      body: buf
    });
    if (alt) {
      try { await this.req('/wp/v2/media/' + media.id, { method: 'POST', body: { alt_text: alt, title: alt } }); } catch (e) { /* alt é opcional */ }
    }
    return { id: media.id, url: media.source_url };
  }

  createPost(data) { return this.req('/wp/v2/posts', { method: 'POST', body: data }); }
  updatePost(id, data) { return this.req('/wp/v2/posts/' + id, { method: 'POST', body: data }); }

  async setYoast(postId, { focus, title, desc }) {
    const meta = {};
    if (focus != null) meta._yoast_wpseo_focuskw = focus;
    if (desc != null) meta._yoast_wpseo_metadesc = desc;
    if (title != null) meta._yoast_wpseo_title = title;
    const saved = await this.updatePost(postId, { meta });
    const m = (saved && saved.meta) || {};
    // fallback: ability do Yoast pra título/descrição se a meta não pegou
    if ((title && m._yoast_wpseo_title !== title) || (desc && m._yoast_wpseo_metadesc !== desc)) {
      try {
        await this.req('/wp-abilities/v1/abilities/yoast-seo/update-post-seo-data/run', {
          method: 'POST', body: { input: { post_id: postId, seo_title: title || null, meta_description: desc || null } }
        });
      } catch (e) { /* sem ability: fica a meta */ }
    }
    return true;
  }

  // MIRB GRID 1.4.0+ (mirb-grid/v1)
  createGrid(payload) { return this.req('/mirb-grid/v1/grids', { method: 'POST', body: payload }); }
  updateGrid(id, payload) { return this.req('/mirb-grid/v1/grids/' + id, { method: 'PUT', body: payload }); }
  hasGridRest(namespaces) { return Array.isArray(namespaces) && namespaces.indexOf('mirb-grid/v1') >= 0; }
}

/* ---------------------------------------------------------------------
 * Montagem de conteúdo
 * ------------------------------------------------------------------- */

// HTML limpo (saída do postprocess/posts) → blocos Gutenberg.
function htmlToBlocks(html) {
  const src = String(html || '').trim();
  const re = /<(p|h2|h3|h4|ul|ol|table|blockquote)>([\s\S]*?)<\/\1>/gi;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const tag = m[1].toLowerCase();
    const inner = m[2].trim();
    if (!inner) continue;
    if (tag === 'p') out.push('<!-- wp:paragraph -->\n<p>' + inner + '</p>\n<!-- /wp:paragraph -->');
    else if (tag === 'h2') out.push('<!-- wp:heading -->\n<h2 class="wp-block-heading">' + inner + '</h2>\n<!-- /wp:heading -->');
    else if (tag === 'h3' || tag === 'h4') {
      const lvl = tag === 'h3' ? 3 : 4;
      out.push('<!-- wp:heading {"level":' + lvl + '} -->\n<' + tag + ' class="wp-block-heading">' + inner + '</' + tag + '>\n<!-- /wp:heading -->');
    } else if (tag === 'ul' || tag === 'ol') {
      const items = (inner.match(/<li>([\s\S]*?)<\/li>/gi) || []).map(li => '<!-- wp:list-item -->\n' + li + '\n<!-- /wp:list-item -->').join('\n');
      const attrs = tag === 'ol' ? ' {"ordered":true}' : '';
      out.push('<!-- wp:list' + attrs + ' -->\n<' + tag + ' class="wp-block-list">' + items + '</' + tag + '>\n<!-- /wp:list -->');
    } else if (tag === 'table') {
      out.push('<!-- wp:table -->\n<figure class="wp-block-table"><table>' + inner + '</table></figure>\n<!-- /wp:table -->');
    } else if (tag === 'blockquote') {
      out.push('<!-- wp:quote -->\n<blockquote class="wp-block-quote">' + inner + '</blockquote>\n<!-- /wp:quote -->');
    }
  }
  return out.join('\n\n');
}

// Campos do overlay que o bloco quiz-overlay/block carrega (anatomia real do P1).
const OW_BLOCK_KEYS = ['qlist', 'require_completion', 'require_rewarded_fill', 'experience_type', 'offerwall_mode',
  'offerwall_eyebrow', 'offerwall_title', 'offerwall_body', 'offerwall_icon', 'offerwall_highlight', 'offerwall_meta_text',
  'offerwall_cta_label', 'offerwall_timer_enabled', 'offerwall_timer_label', 'offerwall_expired_title', 'offerwall_expired_note', 'theme_palette'];

function quizBlock(overlay) {
  if (!overlay) return '';
  const ov = overlay.overlay || overlay;
  let attrs;
  if (ov.experience_type === 'direct_offerwall') {
    attrs = {};
    OW_BLOCK_KEYS.forEach(k => { if (ov[k] !== undefined) attrs[k] = ov[k]; });
  } else {
    attrs = Object.assign({}, ov); delete attrs.id; // quiz clássico: bloco leva a config inteira
  }
  return '<!-- wp:quiz-overlay/block ' + serializeAttrs(attrs) + ' /-->';
}

function gridBlock(gridId) {
  return '<!-- wp:mirb/grid {"gridId":' + parseInt(gridId, 10) + '} /-->';
}

function appBlock(appUrl) {
  if (!appUrl) return '';
  return '<!-- wp:botoes-internos/app-block ' + serializeAttrs({ url: appUrl, urlPlay: appUrl }) + ' /-->';
}

// insere `snippet` antes do 2º <h2> (fim da 1ª seção) — igual aos posts reais
function insertAfterFirstSection(content, snippet, isBlocks) {
  if (!snippet) return content;
  const re = isBlocks ? /<!-- wp:heading -->\n<h2/g : /<h2>/g;
  let idx = -1, count = 0, m;
  while ((m = re.exec(content))) { count++; if (count === 2) { idx = m.index; break; } }
  if (idx < 0) return content + '\n\n' + snippet;
  return content.slice(0, idx) + snippet + '\n\n' + content.slice(idx);
}

function buildP1Content({ gridId, overlay, html, appUrl }) {
  const body = htmlToBlocks(html);
  const parts = [];
  if (gridId) parts.push(gridBlock(gridId));
  if (overlay) parts.push(quizBlock(overlay));
  parts.push(insertAfterFirstSection(body, appBlock(appUrl), true));
  return parts.join('\n\n');
}

function buildP2Content({ html, appUrl }) {
  // P2 real é HTML clássico (sem comentários de bloco), com app-block após a 1ª seção
  return insertAfterFirstSection(String(html || '').trim(), appBlock(appUrl), false);
}

/* ---------------------------------------------------------------------
 * Fluxo de publicação
 * ------------------------------------------------------------------- */

/**
 * publishFunnel({ blog, params, results, options, onProgress })
 *   results: { p1_posts, p2_posts, grid, quiz }  (json de cada bloco)
 *   options: { status:'draft'|'publish', categoryId|categoryName, appUrl, author, gridId, withImages:true }
 * Retorna relatório { category, p2:[], grid:{}, p1:[], warnings:[] }.
 */
async function publishFunnel({ blog, params, results, options, onProgress }) {
  const opt = Object.assign({ status: 'draft', withImages: true }, options || {});
  const client = opt.client || new WPClient(blog);
  const emit = (step, data) => { try { onProgress && onProgress(Object.assign({ step }, data || {})); } catch (e) { /* noop */ } };
  const report = { blog: client.home, status: opt.status, category: null, p2: [], grid: null, p1: [], warnings: [] };
  const warn = (m) => { report.warnings.push(m); emit('warning', { message: m }); };

  const p2s = (results.p2_posts && Array.isArray(results.p2_posts.posts)) ? results.p2_posts.posts : [];
  const p1s = (results.p1_posts && Array.isArray(results.p1_posts.posts)) ? results.p1_posts.posts : [];
  const gridJson = results.grid && results.grid.items ? results.grid : null;
  const quizzes = (results.quiz && Array.isArray(results.quiz.quizzes)) ? results.quiz.quizzes : [];
  const totalSteps = p2s.length + (gridJson ? 1 : 0) + p1s.length;
  let done = 0;
  const tick = (label) => { done++; emit('progress', { done, total: totalSteps, label }); };

  // 0) conexão + categoria
  const me = await client.me();
  emit('connected', { user: me.name, roles: me.roles });
  let categoryId = opt.categoryId ? parseInt(opt.categoryId, 10) : null;
  if (!categoryId) {
    const catName = opt.categoryName || params.niche || 'Artigos';
    try { categoryId = await client.findOrCreateCategory(catName); } catch (e) { warn('categoria: ' + e.message); }
  }
  report.category = categoryId;

  async function featured(post, slugHint) {
    if (!opt.withImages || !post.image_search) return null;
    try {
      const ph = await findPhotoUrl(post.image_search);
      if (!ph) { warn('sem foto pra "' + post.image_search + '" (keys de foto ausentes ou sem resultado)'); return null; }
      const m = await client.uploadMediaFromUrl(ph.url, slugHint, post.image_alt || post.title);
      return m.id;
    } catch (e) { warn('imagem destacada (' + slugHint + '): ' + e.message); return null; }
  }

  async function createOne(post, content, kindLabel) {
    const tags = await client.findOrCreateTags(post.tags || []);
    const fm = await featured(post, post.slug);
    const data = {
      title: post.title, slug: post.slug, content, status: opt.status,
      excerpt: post.excerpt || '', categories: categoryId ? [categoryId] : undefined, tags,
      featured_media: fm || undefined,
      meta: { _yoast_wpseo_focuskw: post.focus_keyword || '', _yoast_wpseo_metadesc: post.meta_description || '', _yoast_wpseo_title: post.seo_title || '' }
    };
    if (opt.author) data.author = parseInt(opt.author, 10);
    const created = await client.createPost(data);
    // garante Yoast (fallback ability se a meta não ficou)
    try { await client.setYoast(created.id, { focus: post.focus_keyword || '', desc: post.meta_description || '' }); } catch (e) { warn('yoast #' + created.id + ': ' + e.message); }
    const out = { index: post.index, id: created.id, link: created.link, idUrl: client.home + '/' + created.id + '/', title: post.title, status: created.status, featured_media: fm || null };
    emit('post', Object.assign({ kind: kindLabel }, out));
    return out;
  }

  // 1) P2s (destinos do grid)
  for (const post of p2s) {
    try {
      const out = await createOne(post, buildP2Content({ html: post.html, appUrl: opt.appUrl }), 'p2');
      report.p2.push(out);
    } catch (e) { warn('P2 #' + post.index + ' falhou: ' + e.message); }
    tick('P2 #' + post.index);
  }

  // 2) grid com os links reais dos P2s
  let gridId = opt.gridId ? parseInt(opt.gridId, 10) : null;
  if (gridJson) {
    try {
      const items = gridJson.items.map((it, i) => {
        const p2 = report.p2.find(x => x.index === i + 1) || report.p2[i];
        return {
          item_title: it.item_title || '',
          item_image: it.item_image || '',
          item_link: p2 ? p2.idUrl : (it.item_link || ''),
          item_order: i
        };
      });
      const g = gridJson.grid || {};
      const payload = {
        version: gridJson.version || '1.4.0',
        grid: {
          grid_name: (g.grid_name || params.niche || 'grid') + ' · ' + new Date().toISOString().slice(0, 10),
          title: g.title || '', subtitle: g.subtitle || '',
          columns: parseInt(g.columns, 10) || 2,
          global_link: g.global_link || '', use_global_link: g.use_global_link ? 1 : 0,
          custom_css: g.custom_css || '', footer_text_1: g.footer_text_1 || '', footer_text_2: g.footer_text_2 || '',
          use_src_tracking: 1, style_variant: opt.gridStyle || 'dark'
        },
        items
      };
      const res = gridId ? await client.updateGrid(gridId, payload) : await client.createGrid(payload);
      gridId = res.grid_id;
      report.grid = { id: gridId, block: res.block, shortcode: res.shortcode, edit_url: res.edit_url, items: items.length };
      emit('grid', report.grid);
    } catch (e) {
      warn('grid: ' + e.message + (e.status === 404 ? ' — o MIRB GRID do blog precisa ser 1.4.0+ (rota mirb-grid/v1)' : ''));
    }
    tick('grid');
  }

  // 3) P1s com grid + offerwall no topo
  for (const post of p1s) {
    try {
      const overlay = quizzes[post.index - 1] || quizzes[report.p1.length] || null;
      const content = buildP1Content({ gridId, overlay, html: post.html, appUrl: opt.appUrl });
      const out = await createOne(post, content, 'p1');
      report.p1.push(out);
    } catch (e) { warn('P1 #' + post.index + ' falhou: ' + e.message); }
    tick('P1 #' + post.index);
  }

  emit('done', { p1: report.p1.length, p2: report.p2.length, grid: gridId, warnings: report.warnings.length });
  return report;
}

module.exports = { WPClient, publishFunnel, htmlToBlocks, quizBlock, gridBlock, appBlock, buildP1Content, buildP2Content, serializeAttrs, insertAfterFirstSection, normUrl };
