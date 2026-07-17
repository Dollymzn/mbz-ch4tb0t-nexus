// ============================================================
//  MBZ::CH4TB0T NEXUS v3.2a — testes: identidade visual da persona + vídeos Veo/Flow
//  Cobre docs/VIDEO-IDENTITY-V32.md §1-§3:
//   - BLOCK_META/artifacts de persona_identity e video_prompts;
//   - buildBlockPrompt('persona_identity') com o schema;
//   - injeção de personaIdentityLine em fb_images/image_prompts/creatives_prompt/
//     video_prompts e AUSÊNCIA em creative_analysis;
//   - prompt de vídeo (beats/9:16/no subtitles/idioma da campanha);
//   - artifact audiosContext; deps do grafo.
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBlockPrompt, BLOCK_META, personaIdentityLine } = require('../lib/blocks');

// character sheet de exemplo (formato do artifact personaIdentity, §1)
const IDENTITY = { core: 'a woman in her early thirties with wavy chestnut shoulder-length hair', wardrobe: ['red tailored blazer'], photo_style: 'soft studio light, 85mm lens', avoid: 'no hats, no sunglasses' };
const ID_MARK = 'IDENTIDADE VISUAL FIXA DA PERSONA';

// ---- §1/§2: BLOCK_META + artifacts dos 2 blocos novos ----

test('BLOCK_META — persona_identity: maxTokens 64000, deps [], kind text, requireJson true', () => {
  const m = BLOCK_META.persona_identity;
  assert.ok(m, 'persona_identity deve existir em BLOCK_META');
  assert.equal(m.maxTokens, 64000);
  assert.deepEqual(m.deps, []);
  assert.equal(m.kind, 'text');
  assert.equal(typeof m.requireJson, 'function');
  assert.equal(m.requireJson(), true);
});

test('BLOCK_META — persona_identity.artifacts extrai personaIdentity de {identity} e é undefined sem ela', () => {
  const art = BLOCK_META.persona_identity.artifacts;
  assert.equal(typeof art, 'function');
  assert.deepEqual(art({ identity: IDENTITY }), { personaIdentity: IDENTITY });
  assert.equal(art({}), undefined);
  assert.equal(art(null), undefined);
});

test('BLOCK_META — video_prompts: maxTokens 64000, deps [creatives_prompt,audios,persona_identity], requireJson true', () => {
  const m = BLOCK_META.video_prompts;
  assert.ok(m, 'video_prompts deve existir em BLOCK_META');
  assert.equal(m.maxTokens, 64000);
  assert.deepEqual(m.deps, ['creatives_prompt', 'audios', 'persona_identity']);
  assert.equal(m.kind, 'text');
  assert.equal(m.requireJson(), true);
});

test('BLOCK_META — audios ganha artifacts audiosContext com índice, voz e trecho do script', () => {
  const art = BLOCK_META.audios.artifacts;
  assert.equal(typeof art, 'function');
  const out = art({ audios: [{ index: 1, voice: 'Jessica', script: 'Olá, essa é a minha mensagem de abertura' }, { index: 2, voice: 'Bella', script: 'segundo script' }] });
  assert.ok(out.audiosContext.includes('#1'));
  assert.ok(out.audiosContext.includes('[Jessica]'));
  assert.ok(out.audiosContext.includes('Olá, essa é a minha mensagem'));
  assert.ok(out.audiosContext.includes('#2'));
  // resiliente a json vazio/nulo
  assert.equal(BLOCK_META.audios.artifacts({}).audiosContext, '');
  assert.equal(BLOCK_META.audios.artifacts(null).audiosContext, '');
});

// ---- §1: buildBlockPrompt('persona_identity') retorna o schema esperado ----

test('buildBlockPrompt(persona_identity) — character sheet EN com schema identity/core/wardrobe/photo_style/avoid', () => {
  const prompt = buildBlockPrompt('persona_identity', { niche: 'cartão de crédito', pageName: 'Renata Bittencourt', geoCountry: 'Brasil', campaignLang: 'pt-BR' });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  // schema
  ['identity', 'core', 'wardrobe', 'palette', 'photo_style', 'avoid', 'character_name'].forEach(k => {
    assert.ok(prompt.includes(k), `prompt deveria conter a chave "${k}"`);
  });
  // instruções-chave do contrato: EN, 60-100 palavras, pessoa real, mesmo rosto
  assert.ok(/INGL[ÊE]S/i.test(prompt));
  assert.ok(prompt.includes('60') && prompt.includes('100'));
  assert.ok(/PESSOA REAL/i.test(prompt));
  assert.ok(/MESMO ROSTO/i.test(prompt));
  // leva o nome da página e o nicho
  assert.ok(prompt.includes('Renata Bittencourt'));
  assert.ok(prompt.includes('cartão de crédito'));
});

// ---- §1: helper personaIdentityLine isolado ----

test('personaIdentityLine — devolve o bloco com core/wardrobe/photo_style/avoid quando presente; vazio quando ausente', () => {
  const line = personaIdentityLine({ personaIdentity: IDENTITY });
  assert.ok(line.includes(ID_MARK));
  assert.ok(line.includes(IDENTITY.core));
  assert.ok(line.includes('red tailored blazer'));
  assert.ok(line.includes('soft studio light, 85mm lens'));
  assert.ok(line.includes('no hats, no sunglasses'));
  // ausente / sem core → string vazia (retrocompat)
  assert.equal(personaIdentityLine({}), '');
  assert.equal(personaIdentityLine({ personaIdentity: { wardrobe: ['x'] } }), '');
  assert.equal(personaIdentityLine(null), '');
});

// ---- §1: injeção nos 4 blocos e AUSÊNCIA em creative_analysis ----

test('personaIdentity é injetado em fb_images/image_prompts/creatives_prompt(completo+imgOnly)/video_prompts', () => {
  const base = { niche: 'cartão de crédito', pageName: 'Renata', campaignLang: 'pt-BR', personaIdentity: IDENTITY };

  const fb = buildBlockPrompt('fb_images', base);
  assert.ok(fb.includes(ID_MARK), 'fb_images deveria injetar a identidade');
  assert.ok(fb.includes(IDENTITY.core));
  // logo APÓS a REGRA-MÃE (a identidade aparece depois do texto da regra-mãe)
  assert.ok(fb.indexOf('REGRA-MÃE') < fb.indexOf(ID_MARK));

  const ip = buildBlockPrompt('image_prompts', base);
  assert.ok(ip.includes(ID_MARK), 'image_prompts deveria injetar a identidade');

  const crCompleto = buildBlockPrompt('creatives_prompt', Object.assign({}, base, { creativePlatform: 'google_flow', creativeType: 'completo', creativeSize: '1080x1350', numCreatives: 5 }));
  assert.ok(crCompleto.includes(ID_MARK), 'creatives_prompt (completo) deveria injetar a identidade');

  const crImg = buildBlockPrompt('creatives_prompt', Object.assign({}, base, { creativePlatform: 'google_flow', creativeType: 'imagem', creativeSize: '1080x1350', numCreatives: 5 }));
  assert.ok(crImg.includes(ID_MARK), 'creatives_prompt (imgOnly) deveria injetar a identidade');

  const vp = buildBlockPrompt('video_prompts', Object.assign({}, base, { numVideos: 5 }));
  assert.ok(vp.includes(ID_MARK), 'video_prompts deveria injetar a identidade');
});

test('personaIdentity é AUSENTE em creative_analysis com o MESMO p (regressão de contaminação, §1)', () => {
  const p = {
    niche: 'cartão de crédito', personaIdentity: IDENTITY,
    creative_analysis: { platform: 'google_flow', nVariations: 4, size: '1080x1350', images: [{ media_type: 'image/jpeg', data: 'x' }] }
  };
  const ca = buildBlockPrompt('creative_analysis', p);
  assert.ok(!ca.includes(ID_MARK), 'creative_analysis NUNCA pode conter a identidade injetada');
  assert.ok(!ca.includes(IDENTITY.core));
});

test('sem personaIdentity, os 4 blocos NÃO trazem o bloco de identidade (retrocompat byte-a-byte)', () => {
  const base = { niche: 'cartão de crédito', pageName: 'Renata', campaignLang: 'pt-BR' };
  assert.ok(!buildBlockPrompt('fb_images', base).includes(ID_MARK));
  assert.ok(!buildBlockPrompt('image_prompts', base).includes(ID_MARK));
  assert.ok(!buildBlockPrompt('creatives_prompt', Object.assign({}, base, { creativePlatform: 'google_flow', creativeType: 'completo', numCreatives: 5 })).includes(ID_MARK));
  assert.ok(!buildBlockPrompt('video_prompts', Object.assign({}, base, { numVideos: 3 })).includes(ID_MARK));
});

// ---- §2: prompt de video_prompts ----

test('buildBlockPrompt(video_prompts) — contém beats(hook_0_2s), 9:16, "no subtitles" e o idioma da campanha', () => {
  const prompt = buildBlockPrompt('video_prompts', {
    numVideos: 5, campaignLang: 'pt-BR',
    creativesContext: '#1 headline X | CTA: Y',
    audiosContext: '#1 [Jessica] fala tal'
  });
  assert.ok(prompt.includes('EXATAMENTE 5'), 'deveria pedir exatamente numVideos');
  assert.ok(prompt.includes('hook_0_2s'));
  assert.ok(prompt.includes('body_2_6s'));
  assert.ok(prompt.includes('cta_6_8s'));
  assert.ok(prompt.includes('9:16'));
  assert.ok(prompt.includes('no subtitles'));
  assert.ok(prompt.includes(', vertical 9:16 composition, no subtitles, no captions, no watermark'));
  // idioma da campanha (não o do blog)
  assert.ok(prompt.includes('pt-BR'));
  // consome creativesContext e audiosContext
  assert.ok(prompt.includes('#1 headline X | CTA: Y'));
  assert.ok(prompt.includes('#1 [Jessica] fala tal'));
  // gancho gamificado + CTA renderizado no beat final
  assert.ok(/GANCHO GAMIFICADO/i.test(prompt));
  assert.ok(/6-8s/.test(prompt));
});

test('buildBlockPrompt(video_prompts) — idioma cai para contentLang/flowLang quando não há campaignLang', () => {
  const p1 = buildBlockPrompt('video_prompts', { numVideos: 2, contentLang: 'it-IT' });
  assert.ok(p1.includes('it-IT'));
  const p2 = buildBlockPrompt('video_prompts', { numVideos: 2, flowLang: 'pl-PL' });
  assert.ok(p2.includes('pl-PL'));
});

test('buildBlockPrompt(video_prompts) — numVideos default 10', () => {
  const prompt = buildBlockPrompt('video_prompts', { niche: 'x', campaignLang: 'pt-BR' });
  assert.ok(prompt.includes('EXATAMENTE 10'));
});

// ---- §2: guia veo_flow NÃO vaza pro seletor de imagem ----

test('veo_flow não aparece como plataforma de imagem em creatives_prompt (só o bloco de vídeo o consome)', () => {
  // creatives_prompt com plataforma inexistente/padrão não deve puxar as regras de vídeo Veo
  const cr = buildBlockPrompt('creatives_prompt', { niche: 'x', creativePlatform: 'google_flow', creativeType: 'completo', numCreatives: 5 });
  assert.ok(!cr.includes('REGRAS PARA VEO 3'));
});

// ---- §2: rubrica de review para video_prompts ----

test('buildBlockPrompt(review) — target video_prompts usa a rubrica de vídeo (hook/diálogo/formato Veo)', () => {
  const prompt = buildBlockPrompt('review', { review: { target: 'video_prompts', json: { videos: [] }, params: { niche: 'x' } } });
  assert.ok(/Hook 0-2s/i.test(prompt));
  assert.ok(/Formato Veo/i.test(prompt));
  assert.ok(/≤20 palavras/.test(prompt));
  assert.ok(prompt.includes('direcao_de_correcao'));
});
