// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — testes: lib/postprocess/sequence.js
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixSequenceChatdrink = require('../lib/postprocess/sequence');
const { nslug } = require('../lib/postprocess/_util');

// Monta uma sequência sintética: routes[0]=random, N rotas de conteúdo (menu+mensagem), última=fallback(botoes).
function buildSequence(n) {
  const routes = [];
  routes.push({ id: 'route_0', interactions: [{ type: 'random', config: {} }] });
  for (let i = 1; i <= n; i++) {
    routes.push({
      id: 'route_' + i,
      interactions: [
        { type: 'delay', config: { minutes: 5 } },
        { type: 'menu', config: { cards: [{ buttons: [{ action_type: 'url', label: 'Ver' }] }] } },
        { type: 'mensagem', config: { text: 'oi', quick_replies: [{ label: 'quero mais' }] } }
      ]
    });
  }
  routes.push({
    id: 'route_' + (n + 1),
    interactions: [{ type: 'botoes', config: { buttons: [{ action_type: 'url', label: 'Fallback' }] } }]
  });
  return { name: 'SEQUENCIA', type: 'sequence', routes };
}

test('random exclui a rota fallback', () => {
  const j = buildSequence(3); // routes: 0(random),1,2,3(conteudo),4(fallback)
  fixSequenceChatdrink(j, { niche: 'Chá Detox' });
  const randomInt = j.routes[0].interactions.find(x => x.type === 'random');
  assert.deepEqual(randomInt.config.routes, [1, 2, 3]);
  assert.ok(!randomInt.config.routes.includes(4), 'fallback (4) não deve estar no random');
  assert.ok(!randomInt.config.routes.includes(0));
});

test('quick_replies da mensagem apontam action_type route / target_route fallback', () => {
  const j = buildSequence(3);
  const fbIdx = 4;
  fixSequenceChatdrink(j, { niche: 'Chá Detox' });
  for (let i = 1; i <= 3; i++) {
    const msg = j.routes[i].interactions.find(x => x.type === 'mensagem');
    msg.config.quick_replies.forEach(q => {
      assert.equal(q.action_type, 'route');
      assert.equal(q.target_route, fbIdx);
      assert.equal(q.target_flow, '');
    });
  }
});

test('UTMs seqN nas rotas de conteúdo e seqf na rota fallback', () => {
  const j = buildSequence(3);
  const params = { niche: 'Chá Detox' };
  fixSequenceChatdrink(j, params);
  const slug = nslug(params.niche);

  for (let i = 1; i <= 3; i++) {
    const menu = j.routes[i].interactions.find(x => x.type === 'menu');
    const btn = menu.config.cards[0].buttons[0];
    assert.ok(btn.url.includes('utm_content=seq' + i + '-' + slug));
  }

  const fbRoute = j.routes[4];
  const botoes = fbRoute.interactions.find(x => x.type === 'botoes');
  const fbBtn = botoes.config.buttons[0];
  assert.ok(fbBtn.url.includes('utm_content=seqf-' + slug));
});

test('input sem routes retorna intacto', () => {
  const input = { foo: 'bar' };
  const result = fixSequenceChatdrink(input, { niche: 'x' });
  assert.equal(result, input);
  assert.deepEqual(result, { foo: 'bar' });
});

test('input com menos de 3 rotas (sem fallback+conteudo suficiente) retorna intacto', () => {
  const input = { routes: [{ interactions: [{ type: 'random', config: {} }] }, { interactions: [{ type: 'botoes', config: { buttons: [] } }] }] };
  const before = JSON.parse(JSON.stringify(input));
  const result = fixSequenceChatdrink(input, { niche: 'x' });
  assert.equal(result, input);
  assert.deepEqual(result, before);
});

test('input null/undefined retorna intacto', () => {
  assert.equal(fixSequenceChatdrink(null, {}), null);
  assert.equal(fixSequenceChatdrink(undefined, {}), undefined);
});

test('params.utmNative=true: botões de conteúdo E do fallback usam {{URL_REDIR}} sem query string', () => {
  const j = buildSequence(3);
  fixSequenceChatdrink(j, { niche: 'Chá Detox', utmNative: true });
  for (let i = 1; i <= 3; i++) {
    const menu = j.routes[i].interactions.find(x => x.type === 'menu');
    const btn = menu.config.cards[0].buttons[0];
    assert.equal(btn.url, '{{URL_REDIR}}');
    assert.deepEqual(btn.urls, [{ url: '{{URL_REDIR}}', weight: 100 }]);
  }
  const fbRoute = j.routes[4];
  const botoes = fbRoute.interactions.find(x => x.type === 'botoes');
  const fbBtn = botoes.config.buttons[0];
  assert.equal(fbBtn.url, '{{URL_REDIR}}');
  assert.deepEqual(fbBtn.urls, [{ url: '{{URL_REDIR}}', weight: 100 }]);
});

test('params.utmNative false/ausente: comportamento atual com utm_content seqN/seqf preservado', () => {
  const j = buildSequence(2);
  fixSequenceChatdrink(j, { niche: 'Chá Detox', utmNative: false });
  const slug = nslug('Chá Detox');
  for (let i = 1; i <= 2; i++) {
    const menu = j.routes[i].interactions.find(x => x.type === 'menu');
    const btn = menu.config.cards[0].buttons[0];
    assert.ok(btn.url.includes('utm_content=seq' + i + '-' + slug));
  }
  const fbRoute = j.routes[3];
  const botoes = fbRoute.interactions.find(x => x.type === 'botoes');
  assert.ok(botoes.config.buttons[0].url.includes('utm_content=seqf-' + slug));
});
