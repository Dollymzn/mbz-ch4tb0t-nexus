'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const frame = require('../lib/frame');

function fakeFrame(opts) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const auth = req.headers.authorization || '';
      if (auth !== 'Bearer frm_ok') { res.writeHead(401); return res.end('{"error":"bad key"}'); }
      const j = JSON.parse(body); calls.push(j);
      const name = j.params.name, args = j.params.arguments;
      let result;
      if (name === 'frame_quem_sou') result = { nome: 'Matheus', username: 'matheus', empresa: 'Moodlr', via: 'chave', chave: 'nexus' };
      else if (name === 'frame_uso_hoje') result = { gastoUsd: { voce: 1.5, empresa: 2 }, tetoUsd: { voce: 40, empresa: 200 }, designsHoje: 3, limiteDesignsDia: 50 };
      else if (name === 'frame_criar_designs') result = { designs: args.itens.map((it, i) => ({ id: '11111111-1111-4111-8111-' + String(i + calls.length).padStart(12, '0'), nome: 'CRIATIVO ' + (i + 1), link: 'https://town.moodlr.digital/?tab=frame&design=x' + i })), avisos: args.itens.length > 1 ? ['um aviso'] : [] };
      else if (name === 'frame_narrar') result = { ok: true, design: args.design, paginas: (args.roteiro || []).length };
      else if (name === 'frame_ver_design') result = { id: args.design, paginas: [{ numero: 1, textos: [{ indice: 1, texto: 'OPEN MY LETTER' }, { indice: 2, texto: 'Someone sealed a letter for you' }, { indice: 3, texto: 'extra' }] }] };
      else if (name === 'frame_gerar_imagem') {
        if (opts && opts.flaky && !srv.__flaked) { srv.__flaked = true; const m = { jsonrpc: '2.0', id: j.id, result: { isError: true, content: [{ type: 'text', text: 'Você já tem 2 trabalhos do Frame rodando. Espere um terminar.' }] } }; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(m)); }
        result = { imagem: { id: '22222222-2222-4222-8222-' + String(calls.length).padStart(12, '0') }, formato: args.formato };
      }
      else if (name === 'frame_criar_de_modelo') result = { id: '33333333-3333-4333-8333-000000000001', nome: args.nome, link: 'https://town.moodlr.digital/?tab=frame&design=final', paginas: args.paginas.length };
      else if (name === 'frame_traduzir_design') result = { copias: args.idiomas.map((l, i) => ({ id: '44444444-4444-4444-8444-00000000000' + (i + 1), nome: 'X — ' + l.toUpperCase(), link: 'https://town.moodlr.digital/?tab=frame&design=' + l, idioma: l })) };
      else if (name === 'frame_enviar_creative_studio') result = { enfileirados: args.ids.length };
      else if (name === 'frame_mover_para_lixeira') result = { ok: true };
      else result = { text: 'ferramenta ' + name };
      const msg = { jsonrpc: '2.0', id: j.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } };
      if (opts && opts.sse) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('event: message\ndata: ' + JSON.stringify(msg) + '\n\n'); }
      else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(msg)); }
    });
  });
  return new Promise(r => srv.listen(0, () => r({ srv, calls, url: 'http://127.0.0.1:' + srv.address().port + '/mcp' })));
}

test('frame — JSON-RPC por JSON e por SSE, allowlist, 401, unwrap', async () => {
  for (const sse of [false, true]) {
    const f = await fakeFrame({ sse });
    const me = await frame.frameCall('frm_ok', 'frame_quem_sou', {}, { url: f.url });
    assert.equal(me.nome, 'Matheus');
    assert.equal(f.calls[0].method, 'tools/call');
    await assert.rejects(frame.frameCall('frm_bad', 'frame_quem_sou', {}, { url: f.url }), /401/);
    await assert.rejects(frame.frameCall('frm_ok', 'frame_mover_para_lixeira', {}, { url: f.url }), /não permitida/);
    await assert.rejects(frame.frameCall('abc', 'frame_quem_sou', {}, { url: f.url }), /frm_/);
    f.srv.close();
  }
  assert.deepEqual(frame.unwrap({ structuredContent: { a: 1 } }), { a: 1 });
  assert.deepEqual(frame.unwrap({ content: [{ type: 'text', text: 'oi' }] }), { text: 'oi' });
});

test('frame — idioma/formato/itens/extractDesigns', () => {
  assert.equal(frame.frameLang('pt-BR'), 'pt'); assert.equal(frame.frameLang('en-US'), 'en'); assert.equal(frame.frameLang('zh-HK'), 'zh_hk'); assert.equal(frame.frameLang('xx'), null);
  assert.equal(frame.frameFormat('1080x1920'), 'story'); assert.equal(frame.frameFormat('1080x1080'), 'post'); assert.equal(frame.frameFormat('1200x628'), 'link'); assert.equal(frame.frameFormat('', '9:16'), 'story');
  const items = frame.buildCreativeItems({ prompts: [{ prompt: 'a woman holding a sealed letter' }, { prompt: 'envelope on a desk' }], headlines: ['Alguém te escreveu'], lang: 'pt-BR', formato: 'post', niche: 'Carta' });
  assert.equal(items.length, 2);
  assert.ok(items[0].briefing.includes('"Alguém te escreveu"') && items[0].briefing.includes('"Saiba mais"') && items[0].briefing.includes('sealed letter'));
  assert.equal(items[0].formato, 'post');
  const ds = frame.extractDesigns({ designs: [{ id: '11111111-1111-4111-8111-000000000001', nome: 'A', link: 'https://x/1' }], texto: 'outro 22222222-2222-4222-8222-000000000002' });
  assert.equal(ds.length, 1); assert.equal(ds[0].nome, 'A');
  const ds2 = frame.extractDesigns({ text: 'criado 33333333-3333-4333-8333-000000000003' });
  assert.equal(ds2.length, 1); assert.ok(ds2[0].link.includes('design=3333'));
});

test('server — /api/frame/send: lotes de 7, narração por design, Creative Studio, eventos SSE', async () => {
  const f = await fakeFrame({ sse: true });
  process.env.FRAME_MCP_URL = f.url; process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'nexus-frame-'));
  process.env.MASTER_USER = 'tt'; process.env.MASTER_PASSWORD = 'tttttt'; process.env.NEXUS_NO_LISTEN = '1';
  ['../lib/frame', '../lib/datadir', '../lib/users', '../lib/blogs', '../lib/history'].forEach(m => delete require.cache[require.resolve(m)]);
  delete require.cache[require.resolve('../server.js')];
  const app = require('../server.js');
  const srv = await new Promise(r => { const sv = app.listen(0, () => r(sv)); });
  const port = srv.address().port; const B = 'http://127.0.0.1:' + port;
  const auth = await fetch(B + '/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'tt', password: 'tttttt' }) }).then(r => r.json());
  const H = { 'content-type': 'application/json', 'x-access-pass': auth.token, 'x-frame-key': 'frm_ok' };
  const who = await fetch(B + '/api/frame/whoami', { method: 'POST', headers: H, body: '{}' }).then(r => r.json());
  assert.equal(who.me.nome, 'Matheus'); assert.equal(who.uso.designsHoje, 3);
  const items = Array.from({ length: 9 }, (_, i) => ({ briefing: 'briefing ' + i + ' com texto suficiente', formato: 'post' }));
  const res = await fetch(B + '/api/frame/send', { method: 'POST', headers: H, body: JSON.stringify({ items, idiomas: ['pt-BR', 'es'], narracao: { voz: 'v1', modelo: 'eleven_v4', roteiros: ['r1', 'r2'] }, creativeStudio: true, single: false }) });
  const txt = await res.text(); require('fs').writeFileSync('/home/claude/scratch/frame-sse.txt', txt);
  const events = txt.split('\n\n').filter(Boolean).map(ch => { const ev = (ch.match(/^event: (.*)$/m) || [])[1]; const data = (ch.match(/^data: (.*)$/m) || [])[1]; return { ev, data: data ? JSON.parse(data) : null }; });
  const done = events.find(e => e.ev === 'frame_done');
  assert.ok(done, 'frame_done emitido: ' + txt.slice(0, 1500));
  assert.equal(done.data.designs.length, 9);
  const criar = f.calls.filter(c => c.params.name === 'frame_criar_designs');
  assert.equal(criar.length, 2); assert.equal(criar[0].params.arguments.itens.length, 7); assert.deepEqual(criar[0].params.arguments.idiomas, ['pt', 'es']);
  const narr = f.calls.filter(c => c.params.name === 'frame_narrar');
  assert.equal(narr.length, 9); assert.equal(narr[0].params.arguments.voz, 'v1'); assert.deepEqual(narr[1].params.arguments.roteiro, ['r2']);
  assert.ok(f.calls.some(c => c.params.name === 'frame_enviar_creative_studio'));
  assert.ok(events.some(e => e.ev === 'frame_progress' && e.data.step === 'studio'));
  assert.ok(done.data.warnings.includes('um aviso'));
  // ---- modo single: 1 molde + (n-1) imagens + criar_de_modelo com n páginas + 1 narração + tradução ----
  f.calls.length = 0;
  const items3 = [1, 2, 3].map(i => ({ briefing: 'briefing ' + i + ' com texto suficiente', formato: 'retrato', scene: 'scene ' + i, headline: i === 1 ? 'Someone sealed a letter for you' : 'Headline ' + i, cta: 'OPEN MY LETTER' }));
  const res2 = await fetch(B + '/api/frame/send', { method: 'POST', headers: H, body: JSON.stringify({ items: items3, idiomas: ['en-US', 'es'], narracao: { voz: 'v1', roteiros: ['r1', 'r2', 'r3'] }, creativeStudio: true, nome: 'The Love Note — criativos' }) });
  const txt2 = await res2.text();
  const ev2 = txt2.split('\n\n').filter(Boolean).map(ch => { const ev = (ch.match(/^event: (.*)$/m) || [])[1]; const data = (ch.match(/^data: (.*)$/m) || [])[1]; return { ev, data: data ? JSON.parse(data) : null }; });
  const done2 = ev2.find(e => e.ev === 'frame_done'); assert.ok(done2, txt2.slice(0, 800));
  const names = f.calls.map(c => c.params.name);
  assert.deepEqual(names.filter(n => n === 'frame_criar_designs').length, 1);
  assert.equal(names.filter(n => n === 'frame_gerar_imagem').length, 2, 'n-1 imagens');
  const cdm = f.calls.find(c => c.params.name === 'frame_criar_de_modelo').params.arguments;
  assert.equal(cdm.paginas.length, 3); assert.equal(cdm.origem.design, '11111111-1111-4111-8111-000000000001');
  assert.deepEqual(cdm.paginas[0].textos, [{ indice: 2, texto: 'Someone sealed a letter for you' }, { indice: 1, texto: 'OPEN MY LETTER' }], 'índices casados pelo texto do molde');
  assert.ok(cdm.paginas[1].imagem && cdm.paginas[1].textos[0].texto === 'Headline 2');
  assert.ok(/^22222222-/.test(cdm.paginas[1].imagem), 'lê imagem.id');
  const nar = f.calls.find(c => c.params.name === 'frame_narrar').params.arguments;
  assert.equal(nar.design, '33333333-3333-4333-8333-000000000001'); assert.deepEqual(nar.roteiro, ['r1', 'r2', 'r3']); assert.equal(nar.mesma_em_todas, undefined);
  const tr = f.calls.find(c => c.params.name === 'frame_traduzir_design').params.arguments;
  assert.deepEqual(tr, { design: '33333333-3333-4333-8333-000000000001', idiomas: ['es'], narracao: true });
  const studio = f.calls.find(c => c.params.name === 'frame_enviar_creative_studio').params.arguments;
  assert.deepEqual(studio.ids, ['33333333-3333-4333-8333-000000000001', '44444444-4444-4444-8444-000000000001'], 'studio sem o molde');
  assert.equal(done2.data.designs.length, 3); assert.equal(done2.data.designs[0].papel, 'molde'); assert.equal(done2.data.designs[1].paginas, 3); assert.equal(done2.data.designs[1].narrado, true); assert.equal(done2.data.designs[2].papel, 'traducao');
  // ---- molde existente (baseDesign): sem criar_designs, imagem pra todas as páginas ----
  f.calls.length = 0;
  const res3 = await fetch(B + '/api/frame/send', { method: 'POST', headers: H, body: JSON.stringify({ items: items3, idiomas: ['en-US'], baseDesign: '84e3b1df-839e-4f3f-8a27-8afb5bdba24e' }) });
  const txt3 = await res3.text(); assert.ok(txt3.includes('frame_done'), txt3.slice(0, 500));
  const n3 = f.calls.map(c => c.params.name);
  assert.equal(n3.filter(n => n === 'frame_criar_designs').length, 0, 'molde existente não chama a IA');
  assert.equal(n3.filter(n => n === 'frame_gerar_imagem').length, 3, 'imagem pra todas');
  const cdm3 = f.calls.find(c => c.params.name === 'frame_criar_de_modelo').params.arguments;
  assert.equal(cdm3.origem.design, '84e3b1df-839e-4f3f-8a27-8afb5bdba24e'); assert.equal(cdm3.paginas.length, 3); assert.ok(cdm3.paginas[0].imagem);
  // sem chave
  const nk = await fetch(B + '/api/frame/whoami', { method: 'POST', headers: { 'content-type': 'application/json', 'x-access-pass': auth.token }, body: '{}' });
  assert.equal(nk.status, 400);
  srv.close(); f.srv.close();
});


test('frame — retry em erro transitório ("já tem 2 trabalhos") com backoff', async () => {
  const f = await fakeFrame({ flaky: true });
  let retries = 0;
  const r = await frame.frameCall('frm_ok', 'frame_gerar_imagem', { prompt: 'x' }, { url: f.url, onRetry: () => retries++ });
  assert.ok(r.imagem && r.imagem.id); assert.equal(retries, 1);
  await assert.rejects(frame.frameCall('frm_ok', 'frame_mover_para_lixeira', {}, { url: f.url, retries: 0 }), /não permitida/);
  f.srv.close();
});
