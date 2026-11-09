// ============================================================
//  v4.1 — testes do Publisher WordPress (lib/wp.js) com fetch falso
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const wp = require('../lib/wp');

test('htmlToBlocks — converte p/h2/h3/ul/ol/table em blocos Gutenberg válidos', () => {
  const html = '<p>Oi</p><h2>Título</h2><h3>Sub</h3><ul><li>a</li><li>b</li></ul><ol><li>1</li></ol><table><tr><td>x</td></tr></table>';
  const out = wp.htmlToBlocks(html);
  assert.ok(out.includes('<!-- wp:paragraph -->\n<p>Oi</p>\n<!-- /wp:paragraph -->'));
  assert.ok(out.includes('<!-- wp:heading -->\n<h2 class="wp-block-heading">Título</h2>'));
  assert.ok(out.includes('<!-- wp:heading {"level":3} -->'));
  assert.ok(out.includes('<!-- wp:list -->') && out.includes('<!-- wp:list-item -->\n<li>a</li>'));
  assert.ok(out.includes('<!-- wp:list {"ordered":true} -->'));
  assert.ok(out.includes('<!-- wp:table -->\n<figure class="wp-block-table"><table>'));
});

test('quizBlock — offerwall vira bloco com o subconjunto real de atributos e escapes de comentário', () => {
  const ov = { id: 'x', experience_type: 'direct_offerwall', offerwall_title: 'A -- B <c> & "d"', theme_palette: 'candy', qlist: [{ title: 'q', options: ['a', 'b', 'c'] }], cooldown_min: 0, offerwall_provider: 'triad_v1' };
  const b = wp.quizBlock({ overlay: ov });
  assert.ok(b.startsWith('<!-- wp:quiz-overlay/block {') && b.endsWith('} /-->'));
  assert.ok(!b.includes('"id"') && !b.includes('cooldown_min') && !b.includes('offerwall_provider'), 'só chaves do bloco');
  assert.ok(!/--[^>]/.test(b.slice(25, -4)), 'sem "--" dentro do comentário');
  assert.ok(b.includes('\\u002d\\u002d') && b.includes('\\u003c') && b.includes('\\u0026') && b.includes('\\u0022'));
  // o JSON continua parseável depois dos escapes
  const json = JSON.parse(b.slice('<!-- wp:quiz-overlay/block '.length, -' /-->'.length));
  assert.equal(json.offerwall_title, 'A -- B <c> & "d"');
  assert.equal(json.theme_palette, 'candy');
});

test('buildP1Content — grid no topo, offerwall em seguida, app-block antes do 2º H2', () => {
  const html = '<p>abre</p><h2>Primeira</h2><p>x</p><h2>Segunda</h2><p>y</p>';
  const c = wp.buildP1Content({ gridId: 7, overlay: { experience_type: 'direct_offerwall', offerwall_title: 't' }, html, appUrl: 'https://play.google.com/x' });
  const iGrid = c.indexOf('<!-- wp:mirb/grid {"gridId":7} /-->');
  const iQo = c.indexOf('<!-- wp:quiz-overlay/block');
  const iApp = c.indexOf('<!-- wp:botoes-internos/app-block');
  const iH2b = c.indexOf('Segunda');
  assert.ok(iGrid === 0 && iQo > iGrid && iApp > iQo && iApp < iH2b);
});

test('buildP2Content — HTML clássico sem blocos, app-block antes do 2º H2; sem appUrl não injeta', () => {
  const html = '<p>abre</p><h2>Primeira</h2><p>x</p><h2>Segunda</h2>';
  const c = wp.buildP2Content({ html, appUrl: 'https://play.google.com/x' });
  assert.ok(!c.includes('wp:paragraph'));
  assert.ok(c.indexOf('app-block') < c.indexOf('<h2>Segunda</h2>'));
  assert.equal(wp.buildP2Content({ html }), html);
});

// ---- fetch falso que simula o WP + MIRB GRID ----
function fakeWP() {
  const calls = [];
  let nextId = 100;
  const posts = {};
  const fetch = async (url, opts) => {
    opts = opts || {};
    const u = new URL(url);
    const path = u.pathname.replace(/^\/wp-json/, '');
    const method = opts.method || 'GET';
    const body = opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
    calls.push({ method, path, body, auth: opts.headers && opts.headers.Authorization });
    const json = (status, obj) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(obj), json: async () => obj, arrayBuffer: async () => new ArrayBuffer(8) });
    if (u.hostname === 'images.pexels.com') return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(8) };
    if (path === '/wp/v2/users/me') return json(200, { id: 5, name: 'Nexus', roles: ['editor'] });
    if (path === '/wp/v2/categories' && method === 'GET') return json(200, [{ id: 233, name: 'Aplicativos', slug: 'aplicativos' }]);
    if (path === '/wp/v2/tags' && method === 'GET') return json(200, []);
    if (path === '/wp/v2/tags' && method === 'POST') return json(201, { id: 900 + calls.length, name: body.name });
    if (path === '/wp/v2/media' && method === 'POST') return json(201, { id: 3000 + calls.length, source_url: 'https://blog.test/wp-content/uploads/x.jpg' });
    if (/^\/wp\/v2\/media\/\d+$/.test(path)) return json(200, {});
    if (path === '/wp/v2/posts' && method === 'POST') { const id = nextId++; posts[id] = body; return json(201, { id, link: 'https://blog.test/' + id + '/' + body.slug + '/', status: body.status, meta: body.meta }); }
    if (/^\/wp\/v2\/posts\/\d+$/.test(path)) { const id = +path.split('/').pop(); return json(200, { id, meta: body.meta }); }
    if (path === '/mirb-grid/v1/grids' && method === 'POST') return json(201, { grid_id: 77, block: '<!-- wp:mirb/grid {"gridId":77} /-->', shortcode: '[mirb_grid id="77"]', edit_url: 'https://blog.test/wp-admin/?id=77' });
    return json(404, { code: 'rest_no_route', message: 'no route ' + path });
  };
  return { fetch, calls, posts };
}

test('publishFunnel — P2s primeiro, grid com links /{id}/ reais, P1 com grid+offerwall, Yoast e rascunho', async () => {
  const fake = fakeWP();
  process.env.PEXELS_API_KEY = ''; // sem keys → sem imagem (warning), fluxo segue
  const results = {
    p2_posts: { posts: [{ index: 1, title: 'P2 um', slug: 'p2-um', html: '<p>a</p><h2>H</h2><p>b</p><h2>H2</h2>', tags: ['t1'], focus_keyword: 'kw1', meta_description: 'md1', image_search: 'x' },
                        { index: 2, title: 'P2 dois', slug: 'p2-dois', html: '<p>a</p>', tags: [], focus_keyword: 'kw2', meta_description: 'md2' }] },
    grid: { version: '1.2.2', grid: { grid_name: 'g', title: 'Grid', subtitle: 's', columns: '2', custom_css: '.x{}' }, items: [{ item_title: 'A', item_image: 'https://images.pexels.com/a.jpg', item_link: 'https://pinterest.com/?q=a' }, { item_title: 'B', item_image: '', item_link: '' }] },
    quiz: { format: 'offerwall', quizzes: [{ overlay: { experience_type: 'direct_offerwall', offerwall_title: 'OW1', theme_palette: 'candy' } }] },
    p1_posts: { posts: [{ index: 1, title: 'P1 um', slug: 'p1-um', html: '<p>abre</p><h2>Um</h2><p>x</p><h2>Dois</h2><p>y</p>', tags: ['t9'], focus_keyword: 'kw', meta_description: 'md' }] }
  };
  const events = [];
  const report = await wp.publishFunnel({ blog: { url: 'https://blog.test/', user: 'Nexus', appPassword: 'abcd efgh', fetch: fake.fetch }, params: { niche: 'Aplicativos' }, results, options: { status: 'draft', appUrl: 'https://play.google.com/app' }, onProgress: (e) => events.push(e.step) });

  assert.equal(report.category, 233, 'categoria existente reaproveitada');
  assert.equal(report.p2.length, 2);
  assert.equal(report.grid.id, 77);
  assert.equal(report.p1.length, 1);
  // ordem: P2s antes do grid antes do P1
  const order = fake.calls.filter(c => c.method === 'POST' && (c.path === '/wp/v2/posts' || c.path === '/mirb-grid/v1/grids')).map(c => c.path === '/mirb-grid/v1/grids' ? 'grid' : c.body.slug);
  assert.deepEqual(order, ['p2-um', 'p2-dois', 'grid', 'p1-um']);
  // grid recebeu os links reais por ID
  const gridCall = fake.calls.find(c => c.path === '/mirb-grid/v1/grids');
  assert.equal(gridCall.body.items[0].item_link, 'https://blog.test/100/');
  assert.equal(gridCall.body.items[1].item_link, 'https://blog.test/101/');
  assert.equal(gridCall.body.grid.style_variant, 'dark');
  assert.equal(gridCall.body.grid.use_src_tracking, 1);
  // P1 tem grid + offerwall + app-block, em rascunho, com Yoast na meta
  const p1 = fake.posts[102];
  assert.equal(p1.status, 'draft');
  assert.ok(p1.content.startsWith('<!-- wp:mirb/grid {"gridId":77} /-->'));
  assert.ok(p1.content.includes('<!-- wp:quiz-overlay/block') && p1.content.includes('"offerwall_title":"OW1"'));
  assert.ok(p1.content.includes('wp:botoes-internos/app-block'));
  assert.equal(p1.meta._yoast_wpseo_focuskw, 'kw');
  assert.deepEqual(p1.categories, [233]);
  // P2 é HTML clássico
  assert.ok(!fake.posts[100].content.includes('wp:paragraph'));
  // auth Basic em toda chamada à REST
  assert.ok(fake.calls.filter(c => c.path.startsWith('/wp/')).every(c => /^Basic /.test(c.auth)));
  assert.ok(events.includes('connected') && events.includes('grid') && events.includes('done'));
  assert.ok(report.warnings.some(w => /sem foto/.test(w)), 'avisa que não achou foto sem keys');
});

test('publishFunnel — grid sem rota (MIRB GRID antigo) vira warning e os P1 saem sem gridId', async () => {
  const fake = fakeWP();
  const origFetch = fake.fetch;
  const fetch = async (url, opts) => { if (/mirb-grid\/v1/.test(url)) return { ok: false, status: 404, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ code: 'rest_no_route', message: 'no route' }) }; return origFetch(url, opts); };
  const results = { grid: { grid: { title: 'g' }, items: [{ item_title: 'A' }] }, p1_posts: { posts: [{ index: 1, title: 'P1', slug: 'p1', html: '<p>a</p>' }] } };
  const report = await wp.publishFunnel({ blog: { url: 'https://blog.test', user: 'u', appPassword: 'p', fetch }, params: {}, results, options: { withImages: false } });
  assert.equal(report.grid, null);
  assert.ok(report.warnings.some(w => /1\.4\.0/.test(w)));
  assert.equal(report.p1.length, 1);
  assert.ok(!fake.posts[100].content.includes('wp:mirb/grid'));
});
