// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — testes: lib/blocks.js
//  Cobre BLOCK_META (grafo/deps/maxTokens) conforme docs/ARCHITECTURE-V3.md §3
//  e buildBlockPrompt (contrato: string não-vazia contendo o nicho).
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBlockPrompt, BLOCK_META, KNOWN_BLOCKS, personaIdentityLine } = require('../lib/blocks');

// v3.2a: 16 → 18 blocos reais (KNOWN_BLOCKS) — soma persona_identity + video_prompts.
const EXPECTED_BLOCKS = [
  'page_name', 'fb_images', 'comment', 'onboard', 'sequence',
  'grid_preview', 'grid', 'p1_titles', 'p2_titles', 'quiz',
  'meta_copy', 'meta_onboard', 'image_prompts', 'creatives_prompt',
  'audios', 'optimize', 'persona_identity', 'video_prompts', 'broadcast', 'p1_posts', 'p2_posts', 'niche_app'
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
  // v3.2a: fb_images saiu da lista — agora depende (soft) de persona_identity. v4.1.1: meta_onboard depende de onboard.
  const independentes = ['page_name', 'comment', 'p1_titles', 'p2_titles', 'quiz', 'meta_copy', 'optimize', 'persona_identity'];
  independentes.forEach(b => {
    assert.deepEqual(BLOCK_META[b].deps, [], `"${b}" deveria ser independente (sem deps)`);
  });
});

test('maxTokens — 64000 uniforme em todos os blocos de geração (v3.2b: qualidade > custo; teto, não alvo)', () => {
  // Regressão do MAX_TOKENS truncando image_prompts em funis grandes: o teto agora é
  // o máximo seguro para todos os modelos do catálogo (Haiku 4.5 = 64K de saída).
  EXPECTED_BLOCKS.forEach(b => {
    assert.equal(BLOCK_META[b].maxTokens, 64000, `"${b}" deveria ter maxTokens 64000`);
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

test('buildBlockPrompt — fb_images: nicho manda sobre persona mística e post pede convite ao comentário (regressão página vidente)', () => {
  // persona mística vazada do rascunho num nicho de crédito:
  const prompt = buildBlockPrompt('fb_images', { niche: 'cartão de crédito para negativados', persona: 'fem_mistica', personaLabel: 'Feminina mística (vidente / cartomante)', campaignLang: 'pt-BR', pageName: 'Renata Bittencourt', geoCountry: 'Brasil' });
  assert.ok(prompt.includes('REGRA-MÃE'));
  assert.ok(/IGNORE esse universo|NUNCA use termos de tarô/i.test(prompt));
  // bio e post travados no nicho, não no universo da persona
  assert.ok(prompt.includes('SEM termos de outro nicho'));
  // post mais longo terminando em convite ao comentário
  assert.ok(/convite EXPLICITO pra COMENTAR/i.test(prompt));
  assert.ok(prompt.includes('10 a 16 linhas'));
});

test('v4.0.2 — prompts de imagem/vídeo carregam as regras de segurança do Flow (sem país/cartão/negativos sensíveis)', () => {
  const p = { niche: 'Cartão de Crédito', pageName: 'Harper', geoCountry: 'Brasil', numCreatives: 3, creativePlatform: 'google_flow', creativeType: 'completo', numVideos: 2, gridCols: 2, gridRows: 2 };
  ['fb_images', 'persona_identity', 'image_prompts', 'creatives_prompt', 'video_prompts'].forEach(b => {
    assert.ok(buildBlockPrompt(b, p).includes('SEGURANÇA DO PROMPT'), b + ' sem FLOW_SAFE');
  });
  const fb = buildBlockPrompt('fb_images', p);
  assert.ok(!fb.includes('bandeira sutil'), 'capa não pede bandeira do país');
  assert.ok(buildBlockPrompt('persona_identity', p).includes('PROIBIDO nacionalidade/etnia/país'));
});

test('v4.1.1 — Aplicar sugestões = MODO EDIÇÃO (JSON anterior + todas as sugestões); crítico exaustivo e convergente', () => {
  const fb = { problemas: ['core: vago'], sugestoes: ['core → adicionar textura do cabelo'], direcao_de_correcao: 'editar core' };
  const edit = buildBlockPrompt('persona_identity', { niche: 'x', _agentFeedback: fb, _previousJson: { identity: { core: 'ANTIGO' } } });
  assert.ok(edit.includes('MODO EDIÇÃO') && edit.includes('"core": "ANTIGO"') && edit.includes('core → adicionar textura do cabelo') && edit.includes('permanece IDÊNTICO'));
  const regen = buildBlockPrompt('persona_identity', { niche: 'x', _agentFeedback: fb });
  assert.ok(!regen.includes('MODO EDIÇÃO') && regen.includes('core → adicionar textura do cabelo'), 'sem JSON anterior: regen tradicional, mas com as sugestões');
  // schema novo da identidade
  const pi = buildBlockPrompt('persona_identity', { niche: 'x', pageName: 'Clara', campaignLang: 'pt-BR' });
  ['signature_prop', 'stage_expressions', 'hook_line', '"allowed"'].forEach(k => assert.ok(pi.includes(k), k));
  // review: checklist + rubrica própria + convergência
  const rv = buildBlockPrompt('review', { review: { target: 'persona_identity', json: {}, params: {} } });
  assert.ok(rv.includes('"checklist"') && rv.includes('Reprodutibilidade do rosto') && rv.includes('NÃO peça campos fora dele') && !rv.includes('CONVERGÊNCIA'));
  const rv2 = buildBlockPrompt('review', { review: { target: 'persona_identity', json: {}, params: {}, previousReview: { problemas: ['p1'], sugestoes: ['s1'] } } });
  assert.ok(rv2.includes('CONVERGÊNCIA') && rv2.includes('p1') && rv2.includes('Não mova a trave'));
  // identity line carrega props/expressões/gancho pros blocos dependentes
  const line = personaIdentityLine({ personaIdentity: { core: 'c', wardrobe: ['w'], signature_prop: ['sealed envelope'], stage_expressions: { curiosity: 'raised brow' }, hook_line: 'oi', allowed: ['scratch card (game prop)'] } });
  assert.ok(line.includes('Props assinatura: sealed envelope') && line.includes('curiosidade: raised brow') && line.includes('Gancho central da persona: "oi"') && line.includes('scratch card (game prop)'));
});

test('v4.1.1 — áudios: catálogo ElevenLabs real no prompt e postprocess normaliza voz/voice_id', () => {
  const { VOICES } = require('../lib/voices');
  const fixAudios = require('../lib/postprocess/audios');
  assert.ok(VOICES.length >= 80 && VOICES.every(v => v.id && v.name));
  const pr = buildBlockPrompt('audios', { niche: 'x', flowLang: 'pt-BR', numCreatives: 2 });
  assert.ok(pr.includes('cgSgspJ2msm6clMCkdW9') && pr.includes('Thais - Youthful and Feminine') && pr.includes('"voice_main"'));
  const out = fixAudios({ voice_main: { name: 'jessica' }, audios: [{ index: 1, voice: 'Thais', script: 's' }, { index: 2, voice: 'Inexistente', script: 's' }, { index: 3, voice_id: 'ORgG8rwdAiMYRug8RJwR', script: 's' }] });
  assert.equal(out.voice_main.id, 'cgSgspJ2msm6clMCkdW9');
  assert.equal(out.audios[0].voice_id, '5EtawPduB139avoMLQgH');
  assert.equal(out.audios[1].voice_id, 'cgSgspJ2msm6clMCkdW9', 'voz desconhecida cai na principal');
  assert.equal(out.audios[2].voice, 'Ana Alice - Friendly & Clear');
});

test('v4.1.1 — Entrada Meta (CTM): prompt usa ganchos do onboard; postprocess aplica limites da Meta e monta o JSON de quick replies', () => {
  const fix = require('../lib/postprocess/meta_onboard');
  const pr = buildBlockPrompt('meta_onboard', { niche: 'Carta Secreta', campaignLang: 'es-ES', onboardHooks: [{ route: 1, title: 'Alguien te dejó una carta' }] });
  assert.ok(pr.includes('rota 1: "Alguien te dejó una carta"') && pr.includes('ONB_CARTA_SECRETA_1') && pr.includes('{{user_first_name}}'));
  const out = fix({ greeting: 'g'.repeat(320), faq: [{ route: 1, question: 'q'.repeat(90) }], quick_replies: [{ route: 1, title: '💌 Abrir mi carta secreta ya' }], followup: 'f' }, { niche: 'Carta Secreta' });
  assert.equal(out.greeting.length <= 300, true);
  assert.ok([...out.faq[0].question].length <= 80 && out.faq[0].payload === 'ONB_CARTA_SECRETA_1');
  assert.ok([...out.quick_replies[0].title].length <= 20);
  assert.deepEqual(Object.keys(out.meta_json.message), ['text', 'quick_replies']);
  assert.equal(out.meta_json.message.quick_replies[0].content_type, 'text');
  assert.ok(out._warnings.length >= 3);
  // artifacts do onboard → onboardHooks
  const art = BLOCK_META.onboard.artifacts({ routes: [{ interactions: [{ type: 'random' }] }, { interactions: [{ type: 'menu', config: { cards: [{ title: 'Gancho 1' }] } }] }, { interactions: [{ type: 'botoes', config: { title: 'Gancho 2' } }] }] });
  assert.deepEqual(art.onboardHooks, [{ route: 1, title: 'Gancho 1' }, { route: 2, title: 'Gancho 2' }]);
});

test('v4.1.1 — títulos compactos: prompts pedem ≤60/≤55 e o postprocess avisa quando estoura', () => {
  const t = require('../lib/postprocess/titles');
  assert.ok(buildBlockPrompt('p1_titles', { numP1: 2, contentLang: 'pt-BR', currency: 'USD' }).includes('no maximo 60 caracteres'));
  assert.ok(buildBlockPrompt('p2_titles', { gridCols: 2, gridRows: 2, contentLang: 'pt-BR', currency: 'USD' }).includes('no maximo 55 caracteres'));
  const out = t.p1({ titles: ['curto', 'x'.repeat(70) + '...'] });
  assert.equal(out.titles[1].length, 70);
  assert.equal(out._warnings.length, 1);
});
