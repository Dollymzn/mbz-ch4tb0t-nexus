// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — testes: lib/postprocess/_util.js
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJSON, nslug, isDark, pickContrast } = require('../lib/postprocess/_util');

test('extractJSON — JSON puro', () => {
  assert.deepEqual(extractJSON('{"a":1,"b":"x"}'), { a: 1, b: 'x' });
});

test('extractJSON — JSON cercado de fence ```json', () => {
  const text = '```json\n{"a":1,"b":[1,2,3]}\n```';
  assert.deepEqual(extractJSON(text), { a: 1, b: [1, 2, 3] });
});

test('extractJSON — fence ``` sem "json"', () => {
  const text = '```\n{"ok":true}\n```';
  assert.deepEqual(extractJSON(text), { ok: true });
});

test('extractJSON — JSON cercado de prosa', () => {
  const text = 'Aqui está o resultado:\n{"a":1,"nested":{"b":2}}\nEspero que ajude!';
  assert.deepEqual(extractJSON(text), { a: 1, nested: { b: 2 } });
});

test('extractJSON — array puro', () => {
  assert.deepEqual(extractJSON('[1,2,3]'), [1, 2, 3]);
});

test('extractJSON — array cercado de prosa', () => {
  const text = 'Segue a lista: [ "x", "y", "z" ] valeu';
  assert.deepEqual(extractJSON(text), ['x', 'y', 'z']);
});

test('extractJSON — texto sem JSON retorna null', () => {
  assert.equal(extractJSON('Não há nenhum JSON aqui, só texto corrido.'), null);
});

test('extractJSON — texto vazio/falsy retorna null', () => {
  assert.equal(extractJSON(''), null);
  assert.equal(extractJSON(null), null);
  assert.equal(extractJSON(undefined), null);
});

test('extractJSON — JSON truncado/inválido retorna null', () => {
  const truncated = '{"a":1,"b":{"c":2';
  assert.equal(extractJSON(truncated), null);
});

test('extractJSON — JSON com chaves desbalanceadas retorna null', () => {
  const broken = 'blah blah sem chaves nem colchetes {{{ mas nao fecha';
  // aqui existe "{" mas o "último" fechamento nunca chega depois do primeiro indice
  assert.equal(extractJSON(broken), null);
});

test('nslug — acentos e espaços viram hífen', () => {
  assert.equal(nslug('Café com Leite'), 'caf-com-leite');
});

test('nslug — espaços simples', () => {
  assert.equal(nslug('Meu Nicho Legal'), 'meu-nicho-legal');
});

test('nslug — limite de 20 caracteres', () => {
  const niche = 'abcdefghijklmnopqrstuvwxyz'; // 26 letras, sem acentos/espacos
  const slug = nslug(niche);
  assert.equal(slug, 'abcdefghijklmnopqrst');
  assert.equal(slug.length, 20);
});

test('nslug — valor default quando niche ausente/vazio', () => {
  assert.equal(nslug(undefined), 'nicho');
  assert.equal(nslug(''), 'nicho');
  assert.equal(nslug(null), 'nicho');
});

test('isDark — casos claros', () => {
  assert.equal(isDark('#ffffff'), false);
  assert.equal(isDark('#ffee00'), false);
});

test('isDark — casos escuros', () => {
  assert.equal(isDark('#000000'), true);
  assert.equal(isDark('#111111'), true);
});

test('isDark — hex de 3 dígitos', () => {
  assert.equal(isDark('#fff'), false);
  assert.equal(isDark('#000'), true);
});

test('isDark — hex inválido ou ausente retorna true (assume escuro)', () => {
  assert.equal(isDark('#zzzzzz'), true);
  assert.equal(isDark('123456'), true); // sem #
  assert.equal(isDark(undefined), true);
  assert.equal(isDark(''), true);
});

test('pickContrast — cor válida com contraste suficiente é preservada', () => {
  assert.equal(pickContrast('#101010', '#000000'), '#101010');
});

test('pickContrast — cor clara demais cai pro fallback', () => {
  assert.equal(pickContrast('#ffffff', '#000000'), '#000000');
});

test('pickContrast — hex de 3 dígitos claro cai pro fallback', () => {
  assert.equal(pickContrast('#fff', '#123456'), '#123456');
});

test('pickContrast — hex inválido cai pro fallback', () => {
  assert.equal(pickContrast('#zzzzzz', '#123456'), '#123456');
});

test('pickContrast — sem "#" cai pro fallback', () => {
  assert.equal(pickContrast('ffffff', '#123456'), '#123456');
});

test('pickContrast — ausente cai pro fallback', () => {
  assert.equal(pickContrast(undefined, '#123456'), '#123456');
  assert.equal(pickContrast('', '#123456'), '#123456');
});
