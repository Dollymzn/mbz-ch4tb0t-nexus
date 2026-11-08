// ============================================================
//  v4 — testes do postprocess/broadcast (fixBroadcasts)
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fixBroadcasts = require('../lib/postprocess/broadcast');
const { stripEmoji, BROAD_URL } = require('../lib/postprocess/broadcast');

const P = { niche: 'Carta de Amor', flowLang: 'en-US', broadcastImageUrl: 'https://img.x/a.jpg' };

test('fixBroadcasts — formato jul/2026: category UTILITY, url exata, type url minúsculo, text MAIÚSCULO', () => {
  const out = fixBroadcasts([{ name: 'a', header_title: 'message ready', body_text: '{{first_name}} A message has been registered.\n\nOpen it now.', buttons: [{ type: 'URL', text: 'access ✨' }] }], P);
  assert.equal(out[0].category, 'UTILITY');
  assert.equal(out[0].buttons[0].url, BROAD_URL);
  assert.ok(BROAD_URL.includes('utm_source=broadutility'));
  assert.ok(BROAD_URL.includes('{{CAMPAIGN_BROAD}}'));
  assert.ok(BROAD_URL.includes('{{NOMEDAPAGINA}}'));
  assert.equal(out[0].buttons[0].type, 'url');
  assert.equal(out[0].buttons[0].text, 'ACCESS');
  assert.equal(out[0].header_title, 'MESSAGE READY');
  assert.equal(out[0].image_url, 'https://img.x/a.jpg');
});

test('fixBroadcasts — SECRET banido no header (vira MESSAGE)', () => {
  const out = fixBroadcasts([{ name: 'x', header_title: 'SECRET WAITING', body_text: '{{first_name}} t.', buttons: [] }], P);
  assert.equal(out[0].header_title, 'MESSAGE WAITING');
});

test('fixBroadcasts — emoji removido do body, {{first_name}} sem colchetes e garantido no início', () => {
  const out = fixBroadcasts([
    { name: 'b1', header_title: 'NOTE READY', body_text: '[{{first_name}}] your note is ready. 🎉\n\nCheck it now. ✨', buttons: [] },
    { name: 'b2', header_title: 'NOTE READY', body_text: 'A letter has been saved.', buttons: [] }
  ], P);
  assert.ok(out[0].body_text.startsWith('{{first_name}}'));
  assert.ok(!/[\u{1F000}-\u{1FAFF}]/u.test(out[0].body_text), 'sem emoji');
  assert.ok(!/ \n/.test(out[0].body_text), 'sem espaço antes de quebra');
  assert.ok(out[1].body_text.startsWith('{{first_name}} '), 'first_name adicionado quando falta');
});

test('fixBroadcasts — dedup GLOBAL de names e bodies (entre lotes)', () => {
  const out = fixBroadcasts([
    { name: 'dup', body_text: '{{first_name}} Same body.', header_title: 'A B', buttons: [] },
    { name: 'dup', body_text: '{{first_name}} Same body.', header_title: 'A B', buttons: [] }
  ], P);
  assert.notEqual(out[0].name, out[1].name);
  assert.notEqual(out[0].body_text, out[1].body_text);
});

test('fixBroadcasts — aceita {broadcasts:[...]} e passa adiante não-arrays', () => {
  const out = fixBroadcasts({ broadcasts: [{ name: 'n', body_text: '{{first_name}} x.', buttons: [] }] }, P);
  assert.ok(Array.isArray(out) && out.length === 1);
  const passthrough = fixBroadcasts({ foo: 1 }, P);
  assert.deepEqual(passthrough, { foo: 1 });
});

test('stripEmoji — limpa pictogramas e espaços duplicados', () => {
  assert.equal(stripEmoji('ready. 🎉✨  now ➜'), 'ready. now');
});

test('fixBroadcasts — 3+ bodies idênticos ficam TODOS únicos e language normaliza pra en_US', () => {
  const same = { name: 'n', header_title: 'NOTE READY', body_text: '{{first_name}} A note has been saved.\n\nOpen it now.', buttons: [], language: 'en-US' };
  const out = fixBroadcasts([same, same, same, same], P);
  const bodies = new Set(out.map(b => b.body_text));
  assert.equal(bodies.size, 4);
  assert.equal(out[0].language, 'en_US');
});
