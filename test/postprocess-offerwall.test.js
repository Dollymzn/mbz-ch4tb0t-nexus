// ============================================================
//  v4 — testes do Direct Offerwall (schema v2, plugin 4.8.2)
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const assembleQuiz = require('../lib/postprocess/quiz');
const { assembleOfferwalls, assembleQuizOverlays } = require('../lib/postprocess/quiz');

const QIN = {
  quizzes: [{
    id: 'carta-1', theme_palette: 'romance', offerwall_mode: 'priority_signal',
    offerwall_eyebrow: 'RESERVADO', offerwall_title: 'Algo ficou guardado pra você',
    offerwall_body: 'Tem uma mensagem esperando. Veja antes que saia do destaque.',
    offerwall_icon: '💌', offerwall_highlight: 'mensagem de hoje',
    offerwall_meta_text: 'hoje • 1 min', offerwall_cta_label: 'Ver Mensagem',
    offerwall_timer_label: 'Em destaque por', offerwall_expired_title: 'Saiu de destaque',
    offerwall_expired_note: 'Toque para ver a versão atualizada.'
  }]
};

test('dispatcher — quizFormat offerwall vai pro schema v2; default vai pro clássico 4.1.0', () => {
  const ow = assembleQuiz(JSON.parse(JSON.stringify(QIN)), { niche: 'Carta', quizFormat: 'offerwall' });
  assert.equal(ow.format, 'offerwall');
  assert.equal(ow.quizzes[0].schema_version, 2);
  assert.equal(ow.quizzes[0].plugin_version, '4.8.2');
  const cl = assembleQuiz({ quizzes: [{ id: 'x', entry_mode: 'wheel', theme_palette: 'mystic' }] }, { niche: 'Carta' });
  assert.equal(cl.quizzes[0].schema_version, 1);
  assert.equal(cl.quizzes[0].plugin_version, '4.1.0');
});

test('offerwall — campos fixos do schema v2 (rewarded fill, triad_v1, timer 300s, sem offerwall_note)', () => {
  const out = assembleOfferwalls(JSON.parse(JSON.stringify(QIN)), { niche: 'Carta de Amor' });
  const ov = out.quizzes[0].overlay;
  assert.equal(ov.experience_type, 'direct_offerwall');
  assert.equal(ov.require_rewarded_fill, true);
  assert.equal(ov.rewarded_wait_ms, 8000);
  assert.equal(ov.rewarded_max_wait_ms, 30000);
  assert.equal(ov.offerwall_provider, 'triad_v1');
  assert.equal(ov.offerwall_timer_enabled, true);
  assert.equal(ov.offerwall_timer_seconds, 300);
  assert.equal(ov.offerwall_destination_url, '');
  assert.ok(!('offerwall_note' in ov), 'schema v2 NÃO tem offerwall_note');
  assert.equal(ov.theme_palette, 'romance');
  assert.equal(ov.offerwall_mode, 'priority_signal');
});

test('offerwall — valida paleta/modo inválidos (fallback mystic/instant_reward) e id pelo slug', () => {
  const out = assembleOfferwalls({ quizzes: [{ theme_palette: 'xxx', offerwall_mode: 'yyy' }] }, { niche: 'Tarot do Amor' });
  const ov = out.quizzes[0].overlay;
  assert.equal(ov.theme_palette, 'mystic');
  assert.equal(ov.offerwall_mode, 'instant_reward');
  assert.ok(ov.id.indexOf('tarot-do-amor') === 0);
});

test('offerwall — stripChatbotVars: nenhum {{...}} sobrevive nos textos', () => {
  const out = assembleOfferwalls({ quizzes: [{ offerwall_title: 'Oi {{FIRST_NAME}}, olha isso', offerwall_body: 'Vai em {{URL_REDIR}} agora' }] }, { niche: 'x' });
  const ov = out.quizzes[0].overlay;
  assert.ok(ov.offerwall_title.indexOf('{{') < 0);
  assert.ok(ov.offerwall_body.indexOf('{{') < 0);
});

test('clássico preservado — assembleQuizOverlays segue exportando trivia_correct_index validado', () => {
  const out = assembleQuizOverlays({ quizzes: [{ entry_mode: 'trivia', trivia_correct_index: 2 }] }, { niche: 'x' });
  assert.equal(out.quizzes[0].overlay.trivia_correct_index, 2);
  const bad = assembleQuizOverlays({ quizzes: [{ entry_mode: 'trivia', trivia_correct_index: 9 }] }, { niche: 'x' });
  assert.equal(bad.quizzes[0].overlay.trivia_correct_index, 0);
});
