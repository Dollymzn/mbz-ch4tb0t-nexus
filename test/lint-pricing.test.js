'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { lintBlock, toWarnings } = require('../lib/lint');
const { costOf, fmt } = require('../lib/pricing');

test('lint Meta — pega atributo pessoal, garantia, prêmio, sexual, menores; ignora chaves técnicas; soft em marca', () => {
  const hits = lintBlock('broadcast', { broadcasts: [
    { title: 'Você que é solteira, olha isso', body: 'Aprovação garantida e ganhe dinheiro hoje!!!', url: 'https://x.com/sexo' },
    { title: 'Conheça garotas perto de você', body: 'Baixe no Instagram' }
  ] });
  const rules = hits.map(h => h.rule);
  ['personal', 'guarantee', 'money_prize', 'shout', 'minors', 'brand'].forEach(r => assert.ok(rules.includes(r), r));
  assert.ok(!hits.some(h => h.where.endsWith('.url')), 'url ignorada');
  const w = toWarnings(hits);
  assert.ok(w.some(x => x.startsWith('LINT META: "Você que é solteira"')) && w.some(x => x.startsWith('LINT META (atenção): "Instagram"')));
  assert.deepEqual(lintBlock('grid', { items: [{ title: 'ganhe dinheiro' }] }), [], 'grid não é lintado');
  assert.deepEqual(lintBlock('p1_titles', { titles: ['Carta secreta: QUEM MANDOU ISSO PRA VOCÊ HOJE'] }).map(h => h.rule), [], 'títulos ignoram CAPS');
});

test('pricing — custo por modelo com cache a 10%, formato', () => {
  assert.equal(costOf('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6 }), 18);
  assert.equal(costOf('claude-haiku-5-5', { input: 1e6, output: 0, cacheRead: 1e6 }), 1.1);
  assert.equal(costOf('claude-opus-5-5', null), 0);
  assert.equal(fmt(0.0042), '$0.0042'); assert.equal(fmt(0.5), '$0.500'); assert.equal(fmt(12.3), '$12.30');
});
