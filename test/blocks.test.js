// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — testes: lib/blocks.js
//  Cobre BLOCK_META (grafo/deps/maxTokens) conforme docs/ARCHITECTURE-V3.md §3
//  e buildBlockPrompt (contrato: string não-vazia contendo o nicho).
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBlockPrompt, BLOCK_META, KNOWN_BLOCKS } = require('../lib/blocks');

const EXPECTED_BLOCKS = [
  'page_name', 'fb_images', 'comment', 'onboard', 'sequence',
  'grid_preview', 'grid', 'p1_titles', 'p2_titles', 'quiz',
  'meta_copy', 'meta_onboard', 'image_prompts', 'creatives_prompt',
  'audios', 'optimize'
];

test('BLOCK_META cobre todos os blocos usados pelo sistema', () => {
  assert.deepEqual(new Set(KNOWN_BLOCKS), new Set(EXPECTED_BLOCKS));
  EXPECTED_BLOCKS.forEach(b => {
    assert.ok(BLOCK_META[b], `BLOCK_META deveria conter "${b}"`);
    assert.ok(Array.isArray(BLOCK_META[b].deps), `"${b}".deps deveria ser array`);
    assert.equal(typeof BLOCK_META[b].maxTokens, 'number');
  });
});

test('grafo de dependências — grid depende de grid_preview', () => {
  assert.ok(BLOCK_META.grid.deps.includes('grid_preview'));
});

test('grafo de dependências — image_prompts depende de onboard e sequence', () => {
  assert.ok(BLOCK_META.image_prompts.deps.includes('onboard'));
  assert.ok(BLOCK_META.image_prompts.deps.includes('sequence'));
});

test('grafo de dependências — audios depende de creatives_prompt', () => {
  assert.ok(BLOCK_META.audios.deps.includes('creatives_prompt'));
});

test('grafo de dependências — blocos independentes não têm deps', () => {
  const independentes = ['page_name', 'fb_images', 'comment', 'p1_titles', 'p2_titles', 'quiz', 'meta_copy', 'meta_onboard', 'optimize'];
  independentes.forEach(b => {
    assert.deepEqual(BLOCK_META[b].deps, [], `"${b}" deveria ser independente (sem deps)`);
  });
});

test('maxTokens — 20000 para onboard, sequence, creatives_prompt, audios, quiz', () => {
  ['onboard', 'sequence', 'creatives_prompt', 'audios', 'quiz'].forEach(b => {
    assert.equal(BLOCK_META[b].maxTokens, 20000, `"${b}" deveria ter maxTokens 20000`);
  });
});

test('maxTokens — 24000 para optimize', () => {
  assert.equal(BLOCK_META.optimize.maxTokens, 24000);
});

test('maxTokens — 7000 para o resto dos blocos', () => {
  const resto = EXPECTED_BLOCKS.filter(b =>
    !['onboard', 'sequence', 'creatives_prompt', 'audios', 'quiz', 'optimize'].includes(b));
  resto.forEach(b => {
    assert.equal(BLOCK_META[b].maxTokens, 7000, `"${b}" deveria ter maxTokens 7000`);
  });
});

test('buildBlockPrompt — page_name contém o nicho e retorna string não-vazia', () => {
  const prompt = buildBlockPrompt('page_name', { niche: 'Tarot Diário Místico', flowLang: 'pt-BR' });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  assert.ok(prompt.includes('Tarot Diário Místico'));
});

test('buildBlockPrompt — onboard contém o nicho e retorna string não-vazia', () => {
  const prompt = buildBlockPrompt('onboard', { niche: 'Chá Detox Emagrecedor', onboardRoutes: 5, flowLang: 'en-US' });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  assert.ok(prompt.includes('Chá Detox Emagrecedor'));
});

test('buildBlockPrompt — quiz contém o nicho e retorna string não-vazia', () => {
  const prompt = buildBlockPrompt('quiz', { niche: 'Finanças Pessoais', numP1: 3, contentLang: 'pt-BR' });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  assert.ok(prompt.includes('Finanças Pessoais'));
});

test('buildBlockPrompt — optimize monta prompt standalone (sem o cabeçalho de nicho)', () => {
  const prompt = buildBlockPrompt('optimize', { optimize: { content: 'texto original aqui', kind: 'copy', context: 'mais urgência' } });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  assert.ok(prompt.includes('texto original aqui'));
});

test('buildBlockPrompt — persona com voice injeta a voz no contexto', () => {
  const prompt = buildBlockPrompt('page_name', { niche: 'teste', persona: 'fem_sensual' });
  assert.ok(prompt.includes('misterios'));
});

test('buildBlockPrompt — persona sem voice usa personaLabel/fallback e não injeta voz', () => {
  const prompt = buildBlockPrompt('page_name', { niche: 'teste', persona: 'sem_persona', personaLabel: 'Sem persona definida' });
  assert.ok(!prompt.includes('misterios'));
  assert.ok(prompt.includes('Sem persona definida'));
});

test('buildBlockPrompt — quiz proíbe variáveis de chatbot ({{...}})', () => {
  const prompt = buildBlockPrompt('quiz', { niche: 'Carta de Amor', numP1: 3, contentLang: 'pt-BR' });
  assert.ok(prompt.includes('PROIBIDO'));
  assert.ok(prompt.includes('{{FIRST_NAME}}'));
});

test('buildBlockPrompt — creatives_prompt injeta o guia da plataforma google_flow/ImageFX', () => {
  const prompt = buildBlockPrompt('creatives_prompt', { niche: 'Carta de Amor', creativePlatform: 'google_flow', creativeSize: '1080x1440', numCreatives: 5 });
  assert.ok(prompt.includes('IMAGEFX') || prompt.includes('FRASES NATURAIS'));
});

test('buildBlockPrompt — creatives_prompt injeta o guia também no branch imgOnly e no svg_claude', () => {
  const imgOnly = buildBlockPrompt('creatives_prompt', { niche: 'Carta de Amor', creativePlatform: 'midjourney', creativeType: 'imagem', creativeSize: '1080x1440', numCreatives: 5 });
  assert.ok(imgOnly.includes('MIDJOURNEY'));

  const svg = buildBlockPrompt('creatives_prompt', { niche: 'Carta de Amor', creativePlatform: 'svg_claude', creativeSize: '1080x1440', numCreatives: 10 });
  assert.ok(svg.includes('hierarquia visual clara'));
});

test('buildBlockPrompt — criativo completo manda renderizar o botão de CTA e proíbe área vazia (regressão faixa branca)', () => {
  const full = buildBlockPrompt('creatives_prompt', { niche: 'Cartão de Crédito', creativePlatform: 'google_flow', creativeType: 'completo', creativeSize: '1080x1350', numCreatives: 5, flowLang: 'pt-BR' });
  // deve mandar DESENHAR o botão e preencher o frame...
  assert.ok(/BOT[ÃA]O DE CTA DESENHADO/i.test(full));
  assert.ok(full.includes('PREENCHE O FRAME INTEIRO'));
  // ...e proibir explicitamente reservar área vazia (a causa da faixa branca)
  assert.ok(full.includes('space for text overlay'));
  assert.ok(/PROIBIDO instruir/i.test(full));
  // o branch imagem-only CONTINUA reservando espaço (workflow Canva) — não pode ter a regra de completo
  const imgOnly = buildBlockPrompt('creatives_prompt', { niche: 'Cartão de Crédito', creativePlatform: 'google_flow', creativeType: 'imagem', creativeSize: '1080x1350', numCreatives: 5 });
  assert.ok(!imgOnly.includes('PREENCHE O FRAME INTEIRO'));
  assert.ok(imgOnly.includes('space for text overlay'));
});

test('buildBlockPrompt — onboard com utmNative:true troca a instrução de UTM', () => {
  const prompt = buildBlockPrompt('onboard', { niche: 'Carta de Amor', utmNative: true, onboardRoutes: 3, flowLang: 'en-US' });
  assert.ok(prompt.includes('SEM query string'));
  assert.ok(prompt.includes('{{URL_REDIR}}'));
});

test('buildBlockPrompt — onboard sem utmNative mantém a instrução de utm_content onbN', () => {
  const prompt = buildBlockPrompt('onboard', { niche: 'Carta de Amor', onboardRoutes: 3, flowLang: 'en-US' });
  assert.ok(prompt.includes('utm_content'));
  assert.ok(!prompt.includes('SEM query string'));
});
