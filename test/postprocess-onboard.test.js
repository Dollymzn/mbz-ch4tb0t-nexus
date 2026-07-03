// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — testes: lib/postprocess/onboard.js
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixOnboardChatdrink = require('../lib/postprocess/onboard');
const { nslug } = require('../lib/postprocess/_util');

// Monta um onboard sintético: routes[0]=random, N rotas de conteúdo (menu/botoes), última=goto.
function buildOnboard(n) {
  const routes = [];
  routes.push({ id: 'route_0', interactions: [{ type: 'random', config: {} }] });
  for (let i = 1; i <= n; i++) {
    const isBotoes = i % 2 === 0; // alterna menu/botoes
    if (isBotoes) {
      routes.push({
        id: 'route_' + i,
        interactions: [
          { type: 'digitando', config: { duration: 3 } },
          { type: 'botoes', config: { buttons: [{ action_type: 'url', label: 'Ver mais' }] } }
        ]
      });
    } else {
      routes.push({
        id: 'route_' + i,
        interactions: [
          { type: 'digitando', config: { duration: 3 } },
          { type: 'menu', config: { cards: [{ buttons: [{ action_type: 'url', label: 'Ver mais' }] }] } }
        ]
      });
    }
  }
  routes.push({ id: 'route_' + (n + 1), interactions: [{ type: 'goto', config: { target_flow: '433' } }] });
  return { name: 'ONBOARD', type: 'onboard', routes };
}

test('random.config.routes aponta só para as rotas de conteúdo', () => {
  const j = buildOnboard(4);
  fixOnboardChatdrink(j, { niche: 'Tarot Diário' });
  const randomInt = j.routes[0].interactions.find(x => x.type === 'random');
  assert.deepEqual(randomInt.config.routes, [1, 2, 3, 4]);
  // não inclui a rota 0 nem a última (goto)
  assert.ok(!randomInt.config.routes.includes(0));
  assert.ok(!randomInt.config.routes.includes(5));
});

test('menu e botoes: redirect aponta pra última rota + utm_content onbN-slug', () => {
  const j = buildOnboard(3); // routes: 0(random),1(menu),2(botoes),3(menu),4(goto/last)
  const params = { niche: 'Tarot Diário' };
  fixOnboardChatdrink(j, params);
  const slug = nslug(params.niche);
  const lastIdx = 4;

  const r1menu = j.routes[1].interactions.find(x => x.type === 'menu');
  assert.equal(r1menu.config.redirect_type, 'route');
  assert.equal(r1menu.config.redirect_target, lastIdx);
  const btn1 = r1menu.config.cards[0].buttons[0];
  assert.equal(btn1.action_type, 'url');
  assert.ok(btn1.url.includes('utm_content=onb1-' + slug));
  assert.equal(btn1.urls[0].weight, 100);

  const r2botoes = j.routes[2].interactions.find(x => x.type === 'botoes');
  assert.equal(r2botoes.config.redirect_type, 'route');
  assert.equal(r2botoes.config.redirect_target, lastIdx);
  const btn2 = r2botoes.config.buttons[0];
  assert.ok(btn2.url.includes('utm_content=onb2-' + slug));

  const r3menu = j.routes[3].interactions.find(x => x.type === 'menu');
  assert.equal(r3menu.config.redirect_target, lastIdx);
  const btn3 = r3menu.config.cards[0].buttons[0];
  assert.ok(btn3.url.includes('utm_content=onb3-' + slug));
});

test('utm_content numera sequencialmente por ordem de rota de conteúdo (não pelo índice cru)', () => {
  const j = buildOnboard(5);
  fixOnboardChatdrink(j, { niche: 'Nicho X' });
  const slug = nslug('Nicho X');
  for (let i = 1; i <= 5; i++) {
    const route = j.routes[i];
    const it = route.interactions.find(x => x.type === 'menu' || x.type === 'botoes');
    const btns = it.type === 'menu' ? it.config.cards[0].buttons : it.config.buttons;
    assert.ok(btns[0].url.includes('utm_content=onb' + i + '-' + slug), `rota ${i} deveria ter onb${i}`);
  }
});

test('input sem routes retorna intacto', () => {
  const input = { foo: 'bar' };
  const result = fixOnboardChatdrink(input, { niche: 'x' });
  assert.equal(result, input);
  assert.deepEqual(result, { foo: 'bar' });
});

test('input com menos de 2 rotas retorna intacto', () => {
  const input = { routes: [{ id: 'route_0', interactions: [{ type: 'random', config: {} }] }] };
  const before = JSON.parse(JSON.stringify(input));
  const result = fixOnboardChatdrink(input, { niche: 'x' });
  assert.equal(result, input);
  assert.deepEqual(result, before);
});

test('input null/undefined retorna intacto', () => {
  assert.equal(fixOnboardChatdrink(null, {}), null);
  assert.equal(fixOnboardChatdrink(undefined, {}), undefined);
});
