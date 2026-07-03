// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — testes: lib/validate.js
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateParams, validateChatDrink } = require('../lib/validate');

test('validateParams — blocks não-array falha', () => {
  const { ok, errors } = validateParams({ blocks: 'onboard' });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('array')));
});

test('validateParams — blocks ausente falha', () => {
  const { ok, errors } = validateParams({});
  assert.equal(ok, false);
  assert.ok(errors.length > 0);
});

test('validateParams — bloco desconhecido falha', () => {
  const { ok, errors } = validateParams({ blocks: ['onboard', 'bloco_fantasma'] });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('bloco_fantasma')));
});

test('validateParams — array vazio falha', () => {
  const { ok, errors } = validateParams({ blocks: [] });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('vazio')));
});

test('validateParams — params não-objeto falha', () => {
  const { ok, errors } = validateParams({ blocks: ['onboard'], params: 'x' });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('params')));
});

test('validateParams — model não-string falha', () => {
  const { ok, errors } = validateParams({ blocks: ['onboard'], model: 123 });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('model')));
});

test('validateParams — artifacts array (não objeto) falha', () => {
  const { ok, errors } = validateParams({ blocks: ['onboard'], artifacts: [] });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('artifacts')));
});

test('validateParams — body válido passa', () => {
  const { ok, errors } = validateParams({
    blocks: ['onboard', 'quiz', 'grid'],
    params: { niche: 'Tarot' },
    model: 'claude-sonnet-5',
    artifacts: {}
  });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateChatDrink — onboard válido passa', () => {
  const json = {
    routes: [
      { interactions: [{ type: 'random', config: { routes: [1] } }] },
      { interactions: [{ type: 'menu', config: { redirect_type: 'route', redirect_target: 2 } }] },
      { interactions: [{ type: 'goto', config: {} }] }
    ]
  };
  const { ok, errors } = validateChatDrink('onboard', json);
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateChatDrink — sequence válido passa', () => {
  const json = {
    routes: [
      { interactions: [{ type: 'random', config: { routes: [1] } }] },
      { interactions: [{ type: 'menu', config: {} }, { type: 'mensagem', config: { quick_replies: [] } }] },
      { interactions: [{ type: 'botoes', config: {} }] }
    ]
  };
  const { ok, errors } = validateChatDrink('sequence', json);
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateChatDrink — onboard com routes ausente retorna erro', () => {
  const { ok, errors } = validateChatDrink('onboard', {});
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('routes ausente')));
});

test('validateChatDrink — interaction sem type retorna erro (e falta de "random")', () => {
  const json = { routes: [{ interactions: [{ config: {} }] }] };
  const { ok, errors } = validateChatDrink('onboard', json);
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('sem type válido')));
  assert.ok(errors.some(e => e.includes('random')));
});

test('validateChatDrink — route sem array interactions retorna erro', () => {
  const json = { routes: [{ foo: 'bar' }] };
  const { ok, errors } = validateChatDrink('sequence', json);
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('sem array interactions')));
});

test('validateChatDrink — comment sem comment_trigger retorna erro', () => {
  const json = { routes: [{ interactions: [{ type: 'mensagem', config: {} }] }] };
  const { ok, errors } = validateChatDrink('comment', json);
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('comment_trigger')));
});

test('validateChatDrink — quiz com trivia_correct_index fora de 0..3 retorna erro', () => {
  const json = { quizzes: [{ overlay: { trivia_correct_index: 9 } }] };
  const { ok, errors } = validateChatDrink('quiz', json);
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('trivia_correct_index')));
});

test('validateChatDrink — quiz válido passa', () => {
  const json = { quizzes: [{ overlay: { trivia_correct_index: 1 } }] };
  const { ok, errors } = validateChatDrink('quiz', json);
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateChatDrink — grid sem "grid"/"items" retorna erro', () => {
  const { ok, errors } = validateChatDrink('grid', {});
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('"grid"')));
  assert.ok(errors.some(e => e.includes('"items"')));
});

test('validateChatDrink — grid válido passa', () => {
  const json = { grid: { title: 'x' }, items: [{ item_title: 'a' }] };
  const { ok, errors } = validateChatDrink('grid', json);
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateChatDrink — json ausente retorna ok:true sem erros', () => {
  const { ok, errors } = validateChatDrink('onboard', null);
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});
