// ============================================================
//  MBZ::CH4TB0T NEXUS v3.1 — testes: NEXUS Agent em lib/validate.js
//  Cobre validateParams para blocos sintéticos (review/creative_analysis),
//  a política agent{} (§1.1) e os tetos duros de imagem (§2), conforme
//  docs/AGENT-V31.md.
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateParams } = require('../lib/validate');

// ---- blocos sintéticos aceitos por ALL_BLOCKS (§1.5) ----

test('validateParams — aceita blocks:["review"]', () => {
  const { ok, errors } = validateParams({ blocks: ['review'] });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateParams — aceita blocks:["creative_analysis"]', () => {
  const { ok, errors } = validateParams({ blocks: ['creative_analysis'] });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

// ---- política agent{} (§1.1) ----

test('validateParams — agent válido {enabled:true,maxIterations:1,minScore:7,blocks:null} passa', () => {
  const { ok, errors } = validateParams({
    blocks: ['onboard'],
    agent: { enabled: true, maxIterations: 1, minScore: 7, blocks: null }
  });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateParams — agent.minScore 11 (acima de 10) falha', () => {
  const { ok, errors } = validateParams({ blocks: ['onboard'], agent: { minScore: 11 } });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('minScore')));
});

test('validateParams — agent.minScore -1 (abaixo de 0) falha', () => {
  const { ok, errors } = validateParams({ blocks: ['onboard'], agent: { minScore: -1 } });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('minScore')));
});

test('validateParams — agent.maxIterations -1 (negativo) falha', () => {
  const { ok, errors } = validateParams({ blocks: ['onboard'], agent: { maxIterations: -1 } });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('maxIterations')));
});

test('validateParams — agent.blocks:"x" (não array e não null) falha', () => {
  const { ok, errors } = validateParams({ blocks: ['onboard'], agent: { blocks: 'x' } });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('agent.blocks')));
});

test('validateParams — agent ausente passa (retrocompat v3)', () => {
  const { ok, errors } = validateParams({ blocks: ['onboard'] });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

// ---- tetos duros de imagem (§2) ----

const bigBase64 = 'A'.repeat(1300000); // > 1.2MB (MAX_IMG_BASE64 = floor(1.2*1024*1024) = 1258291 chars)

test('validateParams — params.creative_analysis.images com 7 itens falha (máx 6)', () => {
  const images = Array.from({ length: 7 }, () => ({ media_type: 'image/jpeg', data: 'abc' }));
  const { ok, errors } = validateParams({
    blocks: ['creative_analysis'],
    params: { creative_analysis: { images } }
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('máximo de 6')));
});

test('validateParams — uma imagem com data base64 acima de 1.2MB falha', () => {
  const { ok, errors } = validateParams({
    blocks: ['creative_analysis'],
    params: { creative_analysis: { images: [{ media_type: 'image/jpeg', data: bigBase64 }] } }
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('1.2MB')));
});

test('validateParams — 3 imagens pequenas válidas em params.creative_analysis.images passa', () => {
  const images = [
    { media_type: 'image/jpeg', data: 'abc' },
    { media_type: 'image/jpeg', data: 'def' },
    { media_type: 'image/jpeg', data: 'ghi' }
  ];
  const { ok, errors } = validateParams({
    blocks: ['creative_analysis'],
    params: { creative_analysis: { images } }
  });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateParams — images no topo do body com 7 itens falha (máx 6)', () => {
  const images = Array.from({ length: 7 }, () => ({ media_type: 'image/jpeg', data: 'abc' }));
  const { ok, errors } = validateParams({ blocks: ['creative_analysis'], images });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('máximo de 6')));
});

test('validateParams — images no topo do body com uma imagem acima de 1.2MB falha', () => {
  const { ok, errors } = validateParams({
    blocks: ['creative_analysis'],
    images: [{ media_type: 'image/jpeg', data: bigBase64 }]
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('1.2MB')));
});

test('validateParams — images no topo do body com 3 imagens pequenas válidas passa', () => {
  const images = [
    { media_type: 'image/jpeg', data: 'abc' },
    { media_type: 'image/jpeg', data: 'def' },
    { media_type: 'image/jpeg', data: 'ghi' }
  ];
  const { ok, errors } = validateParams({ blocks: ['creative_analysis'], images });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});
