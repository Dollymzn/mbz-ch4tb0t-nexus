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
    p2_posts: { posts: [{ index: 1, title: 'P2 um', slug: 'p2-um', html: '<p>a</p><h2>H</h2><p>b</p><!--CARDLINK--><h2>H2</h2>', cardlink: { variant: 'love', internal: { eyebrow: 'VEJA', title: 'Próximo', description: 'd', button: 'Ver', chips: ['a', 'b'] }, exit: { title: 'Baixe', eyebrow: 'APP' } }, tags: ['t1'], focus_keyword: 'kw1', meta_description: 'md1', image_search: 'x' },
                        { index: 2, title: 'P2 dois', slug: 'p2-dois', html: '<p>a</p>', cardlink: { variant: 'fire', internal: { title: 'Volta', eyebrow: 'X' } }, tags: [], focus_keyword: 'kw2', meta_description: 'md2' }] },
    grid: { version: '1.2.2', grid: { grid_name: 'g', title: 'Grid', subtitle: 's', columns: '2', custom_css: '.x{}' }, items: [{ item_title: 'A', item_image: 'https://images.pexels.com/a.jpg', item_link: 'https://pinterest.com/?q=a' }, { item_title: 'B', item_image: '', item_link: '' }] },
    quiz: { format: 'offerwall', quizzes: [{ overlay: { experience_type: 'direct_offerwall', offerwall_title: 'OW1', theme_palette: 'candy' } }] },
    p1_posts: { posts: [{ index: 1, title: 'P1 um', slug: 'p1-um', html: '<p>abre</p><h2>Um</h2><p>x</p><!--CARDLINK--><h2>Dois</h2><p>y</p>', cardlink: { variant: 'indigo', internal: { title: 'Grid', eyebrow: 'GRID' }, exit: { title: 'Sair', eyebrow: 'SAIR' } }, tags: ['t9'], focus_keyword: 'kw', meta_description: 'md' }] }
  };
  const events = [];
  const report = await wp.publishFunnel({ blog: { url: 'https://blog.test/', user: 'Nexus', appPassword: 'abcd efgh', fetch: fake.fetch }, params: { niche: 'Aplicativos' }, results, options: { status: 'draft', appUrl: 'https://play.google.com/app', appP1: true, cardlinkP1: 'p2', cardlinkP2: 'next' }, onProgress: (e) => events.push(e.step) });

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
  assert.ok(p1.content.includes('wp:botoes-internos/app-block'), 'appP1:true põe o bloco de app no P1');
  // cardlink default: P1 → 1º P2 (/100/), P2 → próxima P2 circular (100→101, 101→100) via 2ª passada (PUT)
  assert.ok(p1.content.includes('wp:cardlink/card') && p1.content.includes('"link":"https://blog.test/100/"'));
  const puts = fake.calls.filter(c => c.method === 'POST' && /^\/wp\/v2\/posts\/\d+$/.test(c.path) && c.body && c.body.content);
  assert.equal(puts.length, 2, 'uma atualização de conteúdo por P2');
  assert.ok(puts[0].body.content.includes('"link":"https://blog.test/101/"') && puts[1].body.content.includes('"link":"https://blog.test/100/"'));
  assert.ok(fake.posts[100].content.includes('wp:botoes-internos/app-block'), 'P2 sempre tem app-block');
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


test('cardlink — marcador vira bloco cardlink/card; sem marcador entra antes do 4º h2; sem bloco o marcador some', () => {
  const copy = { eyebrow: 'VEJA', title: 'T', description: 'D', button: 'Ir', chips: ['a', 'b', 'c'] };
  const blk = wp.cardlinkBlock({ copy, link: 'https://blog.test/9/', imageUrl: 'https://i/x.jpg', variant: 'love', uid: 'cl_test' });
  assert.ok(blk.startsWith('<!-- wp:cardlink/card {') && blk.endsWith('/-->'));
  assert.ok(blk.includes('"chipsRaw":"a\\nb\\nc"') && blk.includes('"chip1":"a"') && blk.includes('"mediaWidth":220') && blk.includes('"cardClickable":true') && blk.includes('"uid":"cl_test"'));
  assert.ok(!blk.includes('newTab'), 'interno não abre em nova aba');
  const ext = wp.cardlinkBlock({ copy, link: 'https://x.com', external: true });
  assert.ok(ext.includes('"newTab":true') && ext.includes('"relNofollow":true'));
  // P2 (HTML clássico) com marcador
  const p2 = wp.buildP2Content({ html: '<p>a</p><h2>H</h2><p>b</p><!--CARDLINK--><h2>H2</h2><p>c</p>', appUrl: 'https://app', cardlink: blk });
  assert.ok(!p2.includes('<!--CARDLINK-->') && p2.indexOf('wp:cardlink/card') > p2.indexOf('<p>b</p>') && p2.indexOf('wp:cardlink/card') < p2.indexOf('<h2>H2</h2>'));
  assert.ok(p2.includes('wp:botoes-internos/app-block'));
  // P1 (blocos) com marcador — htmlToBlocks preserva a posição
  const p1 = wp.buildP1Content({ gridId: 1, html: '<p>a</p><h2>Um</h2><p>x</p><!--CARDLINK--><h2>Dois</h2><p>y</p>', appUrl: '', cardlink: blk });
  assert.ok(!p1.includes('<!--CARDLINK-->') && p1.includes('wp:cardlink/card') && !p1.includes('app-block'), 'sem appUrl o P1 não leva app-block');
  assert.ok(p1.indexOf('wp:cardlink/card') < p1.indexOf('<h2 class="wp-block-heading">Dois'));
  // sem cardlink → marcador removido
  assert.ok(!wp.buildP1Content({ html: '<p>a</p><!--CARDLINK--><p>b</p>' }).includes('CARDLINK'));
  assert.ok(!wp.buildP2Content({ html: '<p>a</p><!--CARDLINK--><p>b</p>' }).includes('CARDLINK'));
  // fallback sem marcador: antes do 4º h2
  const html = '<h2>1</h2><p>a</p><h2>2</h2><p>b</p><h2>3</h2><p>c</p><h2>4</h2><p>d</p>';
  const out = wp.insertCardlink(html, blk, false);
  assert.ok(out.indexOf('wp:cardlink/card') > out.indexOf('<p>c</p>') && out.indexOf('wp:cardlink/card') < out.indexOf('<h2>4</h2>'));
});

test('publishFunnel — cardlink exit (P1 e P2) usa exitUrl em nova aba; appP1 false deixa P1 sem app-block; cardlink none limpa o marcador', async () => {
  const fake = fakeWP();
  const results = {
    p2_posts: { posts: [{ index: 1, title: 'P2', slug: 'p2', html: '<p>a</p><h2>H</h2><p>b</p><!--CARDLINK--><h2>H2</h2>', cardlink: { variant: 'gold', exit: { title: 'Baixe o app', eyebrow: 'APP' } } }] },
    p1_posts: { posts: [{ index: 1, title: 'P1', slug: 'p1', html: '<p>abre</p><h2>Um</h2><p>x</p><!--CARDLINK--><h2>Dois</h2><p>y</p>', cardlink: { variant: 'gold', internal: { title: 'i' }, exit: { title: 'Sair', eyebrow: 'OFERTA' } } }] }
  };
  const report = await wp.publishFunnel({ blog: { url: 'https://blog.test', user: 'u', appPassword: 'p', fetch: fake.fetch }, params: {}, results, options: { withImages: false, appUrl: 'https://play.google.com/app', appP1: false, cardlinkP1: 'exit', cardlinkP2: 'exit', exitUrl: 'https://oferta.com/x' } });
  const p2 = fake.posts[100], p1 = fake.posts[101];
  assert.ok(p2.content.includes('wp:cardlink/card') && p2.content.includes('"link":"https://oferta.com/x"') && p2.content.includes('"newTab":true') && p2.content.includes('"title":"Baixe o app"'));
  assert.ok(p2.content.includes('app-block'), 'P2 sempre com app-block');
  assert.ok(p1.content.includes('"link":"https://oferta.com/x"') && p1.content.includes('"title":"Sair"'));
  assert.ok(!p1.content.includes('app-block'), 'appP1:false → P1 sem app-block');
  assert.equal(fake.calls.filter(c => /^\/wp\/v2\/posts\/\d+$/.test(c.path) && c.body && c.body.content).length, 0, 'exit não precisa de 2ª passada');
  // none
  const fake2 = fakeWP();
  await wp.publishFunnel({ blog: { url: 'https://blog.test', user: 'u', appPassword: 'p', fetch: fake2.fetch }, params: {}, results, options: { withImages: false, appUrl: 'https://a', cardlinkP1: 'none', cardlinkP2: 'none' } });
  assert.ok(!fake2.posts[100].content.includes('CARDLINK') && !fake2.posts[100].content.includes('cardlink/card'));
  assert.ok(!fake2.posts[101].content.includes('CARDLINK') && !fake2.posts[101].content.includes('cardlink/card'));
  // sem appUrl → aviso
  const fake3 = fakeWP();
  const r3 = await wp.publishFunnel({ blog: { url: 'https://blog.test', user: 'u', appPassword: 'p', fetch: fake3.fetch }, params: {}, results, options: { withImages: false } });
  assert.ok(r3.warnings.some(w => /URL do app vazia/.test(w)));
});
