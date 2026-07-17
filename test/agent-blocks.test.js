// ============================================================
//  MBZ::CH4TB0T NEXUS v3.1 — testes: NEXUS Agent em lib/blocks.js
//  Cobre BLOCK_META dos blocos sintéticos (review/creative_analysis, §3.6),
//  buildBlockPrompt('review', ...) por rubrica (§4), o anexo do feedback do
//  crítico em regen (§3.3), buildBlockPrompt('creative_analysis', ...) (§5)
//  e platformPromptRules (§5.3), conforme docs/AGENT-V31.md.
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBlockPrompt, BLOCK_META, platformPromptRules } = require('../lib/blocks');
const { pickBest } = require('../lib/orchestrator');

// ---- BLOCK_META dos blocos sintéticos (§3.6) ----

test('BLOCK_META — review tem maxTokens 8000', () => {
  assert.ok(BLOCK_META.review);
  assert.equal(BLOCK_META.review.maxTokens, 8000);
});

test('BLOCK_META — creative_analysis tem maxTokens 64000 e hasImages true', () => {
  assert.ok(BLOCK_META.creative_analysis);
  assert.equal(BLOCK_META.creative_analysis.maxTokens, 64000);
  assert.equal(BLOCK_META.creative_analysis.hasImages, true);
});

// ---- buildBlockPrompt('review', ...) — rubrica por target (§4) ----

test("buildBlockPrompt(review) — target 'onboard' usa a rubrica de onboard + schema de saída", () => {
  const prompt = buildBlockPrompt('review', { review: { target: 'onboard', json: { routes: [] }, params: { niche: 'amor' } } });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  assert.ok(/gancho/i.test(prompt) || /CTR/i.test(prompt));
  assert.ok(prompt.includes('score'));
  assert.ok(prompt.includes('veredito'));
  assert.ok(prompt.includes('direcao_de_correcao'));
});

test("buildBlockPrompt(review) — target 'sequence' usa a rubrica de sequence", () => {
  const prompt = buildBlockPrompt('review', { review: { target: 'sequence', json: { routes: [] }, params: { niche: 'amor' } } });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  assert.ok(/delays/i.test(prompt) || /urgência/i.test(prompt));
});

test("buildBlockPrompt(review) — target 'meta_copy' usa a rubrica de meta_copy", () => {
  const prompt = buildBlockPrompt('review', { review: { target: 'meta_copy', json: { primary_texts: [] }, params: { niche: 'amor' } } });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  assert.ok(/idioma da campanha/i.test(prompt) || /política/i.test(prompt));
});

test("buildBlockPrompt(review) — target 'creatives_prompt' usa a rubrica de creatives_prompt", () => {
  const prompt = buildBlockPrompt('review', { review: { target: 'creatives_prompt', json: { prompts: [] }, params: { niche: 'amor' } } });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  assert.ok(/plataforma/i.test(prompt) || /gancho gamificado/i.test(prompt));
});

test('buildBlockPrompt(review) — target desconhecido cai na rubrica genérica sem lançar', () => {
  let prompt;
  assert.doesNotThrow(() => {
    prompt = buildBlockPrompt('review', { review: { target: 'bloco_inexistente_xyz', json: {}, params: {} } });
  });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
});

// ---- feedback do crítico anexado em regen (§3.3) ----

test('buildBlockPrompt — bloco normal com _agentFeedback anexa o bloco "REVISÃO DO CRÍTICO"', () => {
  const prompt = buildBlockPrompt('page_name', {
    niche: 'teste',
    _agentFeedback: { problemas: ['x'], direcao_de_correcao: 'y' }
  });
  assert.ok(prompt.includes('REVISÃO DO CRÍTICO'));
  assert.ok(prompt.includes('y'));
});

// ---- buildBlockPrompt('creative_analysis', ...) (§5) ----

test('buildBlockPrompt(creative_analysis) — injeta as regras da plataforma e o schema dna/variations', () => {
  const prompt = buildBlockPrompt('creative_analysis', {
    creative_analysis: { platform: 'google_flow', nVariations: 5, niche: 'amor', size: '1080x1440' }
  });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  assert.ok(prompt.includes('IMAGEFX') || prompt.includes('FRASES NATURAIS'));
  assert.ok(prompt.includes('dna'));
  assert.ok(prompt.includes('variations'));
});

test('buildBlockPrompt(creative_analysis) — detecta nicho/idioma da IMAGEM e não injeta o nicho do wizard (regressão variações místicas/inglês)', () => {
  // wizard num funil místico em inglês, mas o criativo enviado é de finanças em PT:
  const prompt = buildBlockPrompt('creative_analysis', {
    niche: 'tarot místico', personaLabel: 'vidente', flowLang: 'en-US',
    creative_analysis: { platform: 'google_flow', nVariations: 5, size: '1080x1350', flowLang: 'en-US', images: [{ media_type: 'image/jpeg', data: 'x' }] }
  });
  // o nicho/idioma do wizard NÃO podem virar diretiva do prompt
  assert.ok(!/^NICHO: tarot/m.test(prompt));
  assert.ok(!prompt.includes('IDIOMA DOS TEXTOS (headline/cta): en-US'));
  // deve mandar detectar da própria imagem e travar o nicho
  assert.ok(/da própria imagem|EXCLUSIVAMENTE do criativo/i.test(prompt));
  assert.ok(/nunca troca de nicho|vira outro nicho/i.test(prompt));
  assert.ok(prompt.includes('niche_detectado'));
  assert.ok(prompt.includes('idioma_detectado'));
});

// ---- platformPromptRules (§5.3) ----

test('platformPromptRules — google_flow e midjourney retornam as regras corretas por plataforma', () => {
  const gf = platformPromptRules('google_flow', '1080x1440');
  const mj = platformPromptRules('midjourney', '1080x1080');
  assert.ok(gf.includes('IMAGEFX'));
  assert.ok(mj.includes('MIDJOURNEY'));
  assert.ok(!gf.includes('MIDJOURNEY'));
  assert.ok(!mj.includes('IMAGEFX'));
  assert.notEqual(gf, mj);
});

// ---- pickBest (§3.5) ----

test('pickBest — prioriza opus quando presente no catálogo real', () => {
  const catalog = [
    { id: 'claude-sonnet-5' },
    { id: 'claude-opus-4-8' },
    { id: 'claude-haiku-4-5-20251001' }
  ];
  assert.equal(pickBest(catalog), 'claude-opus-4-8');
});

test('pickBest — catálogo vazio retorna algum fallback string não-vazia', () => {
  const result = pickBest([]);
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0);
});

test('pickBest — sem nenhum match de prioridade retorna o primeiro id da lista', () => {
  const catalog = [{ id: 'modelo-x-generico' }, { id: 'modelo-y' }];
  assert.equal(pickBest(catalog), 'modelo-x-generico');
});
