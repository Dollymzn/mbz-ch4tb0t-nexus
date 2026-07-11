// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — testes: lib/postprocess/quiz.js
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const assembleQuizOverlays = require('../lib/postprocess/quiz');

function fullQuiz(overrides) {
  return Object.assign({
    id: 'meu-quiz',
    entry_mode: 'trivia',
    theme_palette: 'ocean',
    quiz_question: 'Qual seu signo?',
    quiz_options: ['Fogo', 'Água', 'Ar'],
    wheel_options: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    wheel_title: 'Roda da Sorte',
    wheel_result_label: 'Você ganhou!',
    visual_question: 'Qual combina mais?',
    visual_options: [{ label: '🌹 Rosas', pinterest: 'red roses bouquet' }, { label: '🌙 Lua', image: 'https://x.test/lua.png' }],
    hold_visual: 'envelope',
    hold_title: 'Segure',
    scratch_title: 'Raspe',
    scratch_prize: 'Prêmio secreto',
    countdown_title: 'Contagem',
    flip_title: 'Vire',
    gift_title: 'Presente',
    tap_title: 'Toque',
    trivia_question: 'Verdade ou mito?',
    trivia_options: ['Verdade', 'Mito', 'Talvez', 'Nunca'],
    trivia_correct_index: 2,
    final_cta_label: 'Ver agora →'
  }, overrides || {});
}

test('overlay montado com todos os campos esperados (spot-check)', () => {
  const j = { quizzes: [fullQuiz()] };
  const result = assembleQuizOverlays(j, { niche: 'Tarot', finalCtaUrl: 'https://x.test/final' });
  const wrapper = result.quizzes[0];

  // wrapper do plugin
  assert.equal(wrapper.plugin, 'quiz-overlay');
  assert.equal(wrapper.schema_version, 1);
  assert.equal(wrapper.plugin_version, '4.1.0');
  assert.equal(typeof wrapper.exported_at, 'string');
  assert.ok(!isNaN(Date.parse(wrapper.exported_at)));

  const ov = wrapper.overlay;
  assert.equal(ov.id, 'meu-quiz');
  assert.equal(ov.entry_mode, 'trivia');
  assert.equal(ov.theme_palette, 'ocean');
  assert.equal(ov.cooldown_min, 0);
  assert.equal(ov.open_delay_ms, 2000);
  assert.equal(ov.require_completion, true);
  assert.equal(ov.ad_mode, 'rewarded');
  assert.equal(ov.wheel_fixed_index, '0');
  assert.equal(ov.wheel_title, 'Roda da Sorte');
  assert.equal(ov.questions, 'Qual seu signo? | Fogo | Água | Ar');
  assert.deepEqual(ov.qlist, [{ title: 'Qual seu signo?', options: ['Fogo', 'Água', 'Ar'] }]);
  assert.equal(ov.hold_duration, 1.5);
  assert.equal(ov.scratch_threshold, 40);
  assert.equal(ov.countdown_from, 3);
  assert.equal(ov.tap_count, 5);
  assert.equal(ov.loading_ms, 1600);
  assert.equal(ov.final_cta_url, 'https://x.test/final');
});

test('entry_mode inválido vira "wheel"', () => {
  const j = { quizzes: [fullQuiz({ entry_mode: 'nao-existe' })] };
  const result = assembleQuizOverlays(j, { niche: 'Tarot' });
  assert.equal(result.quizzes[0].overlay.entry_mode, 'wheel');
});

test('entry_mode ausente vira "wheel"', () => {
  const j = { quizzes: [fullQuiz({ entry_mode: undefined })] };
  const result = assembleQuizOverlays(j, { niche: 'Tarot' });
  assert.equal(result.quizzes[0].overlay.entry_mode, 'wheel');
});

test('theme_palette inválida vira "mystic"', () => {
  const j = { quizzes: [fullQuiz({ theme_palette: 'cor-que-nao-existe' })] };
  const result = assembleQuizOverlays(j, { niche: 'Tarot' });
  assert.equal(result.quizzes[0].overlay.theme_palette, 'mystic');
});

test('visual_options com pinterest vira URL de busca do Pinterest', () => {
  const j = { quizzes: [fullQuiz()] };
  const result = assembleQuizOverlays(j, { niche: 'Tarot' });
  const vopts = result.quizzes[0].overlay.visual_questions[0].options;
  assert.equal(vopts[0].label, '🌹 Rosas');
  assert.equal(vopts[0].image, 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent('red roses bouquet'));
  // sem pinterest, usa o campo "image" original
  assert.equal(vopts[1].image, 'https://x.test/lua.png');
});

test('trivia_correct_index válido é preservado', () => {
  const j = { quizzes: [fullQuiz({ trivia_correct_index: 3 })] };
  const result = assembleQuizOverlays(j, { niche: 'Tarot' });
  assert.equal(result.quizzes[0].overlay.trivia_correct_index, 3);
});

test('trivia_correct_index fora de 0..3 vira 0', () => {
  const j1 = { quizzes: [fullQuiz({ trivia_correct_index: 4 })] };
  assert.equal(assembleQuizOverlays(j1, { niche: 'Tarot' }).quizzes[0].overlay.trivia_correct_index, 0);
  const j2 = { quizzes: [fullQuiz({ trivia_correct_index: -1 })] };
  assert.equal(assembleQuizOverlays(j2, { niche: 'Tarot' }).quizzes[0].overlay.trivia_correct_index, 0);
});

test('trivia_correct_index ausente vira 0', () => {
  const j = { quizzes: [fullQuiz({ trivia_correct_index: undefined })] };
  const result = assembleQuizOverlays(j, { niche: 'Tarot' });
  assert.equal(result.quizzes[0].overlay.trivia_correct_index, 0);
});

test('params.finalCtaUrl preenche final_cta_url; ausente vira string vazia', () => {
  const j = { quizzes: [fullQuiz()] };
  const withUrl = assembleQuizOverlays(j, { niche: 'Tarot', finalCtaUrl: 'https://x.test/y' });
  assert.equal(withUrl.quizzes[0].overlay.final_cta_url, 'https://x.test/y');

  const j2 = { quizzes: [fullQuiz()] };
  const withoutUrl = assembleQuizOverlays(j2, { niche: 'Tarot' });
  assert.equal(withoutUrl.quizzes[0].overlay.final_cta_url, '');
});

test('input sem quizzes retorna intacto', () => {
  const input = { foo: 'bar' };
  const result = assembleQuizOverlays(input, { niche: 'x' });
  assert.equal(result, input);
});

test('input null/undefined retorna intacto', () => {
  assert.equal(assembleQuizOverlays(null, {}), null);
  assert.equal(assembleQuizOverlays(undefined, {}), undefined);
});

test('stripChatbotVars — remove variáveis de chatbot ({{...}}) recursivamente antes de montar o overlay', () => {
  const j = {
    quizzes: [fullQuiz({
      quiz_question: 'Oi {{FIRST_NAME}}, pronta?',
      quiz_options: ['Sim {{UTM_CAMPAIGN}} claro', 'Não {{NOMEDAPAGINA}}'],
      visual_options: [{ label: '{{FIRST_NAME}} adora rosas', pinterest: 'red roses' }],
      final_cta_label: 'Ver {{URL_REDIR}} agora →'
    })]
  };
  const result = assembleQuizOverlays(j, { niche: 'Tarot' });
  const ov = result.quizzes[0].overlay;
  assert.ok(!ov.qlist[0].title.includes('{{'), 'quiz_question nao deveria conter {{');
  assert.ok(!/ {2,}/.test(ov.qlist[0].title), 'quiz_question nao deveria ter espaco duplo');
  assert.equal(ov.qlist[0].title, 'Oi , pronta?');
  ov.qlist[0].options.forEach(o => assert.ok(!o.includes('{{')));
  assert.ok(!ov.questions.includes('{{'));
  assert.ok(!ov.visual_questions[0].options[0].label.includes('{{'));
  assert.ok(!ov.final_cta_label.includes('{{'));
});
