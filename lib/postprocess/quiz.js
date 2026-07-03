// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — postprocess/quiz
//  assembleQuizOverlays: monta o export completo do plugin quiz-overlay
//  a partir do conteudo da IA. (json, params) => json
//  Melhorias v3: trivia_correct_index vindo da IA (int 0..3, fallback 0);
//               final_cta_url preenchido por params.finalCtaUrl (default '').
// ============================================================
const { nslug } = require('./_util');

const VALID_MODES = ['quiz', 'wheel', 'visual', 'hold', 'scratch', 'countdown', 'flip', 'gift', 'tap', 'trivia'];
const VALID_PAL = ['sunset', 'mint', 'royal', 'slate', 'pink', 'purple', 'bordo', 'passion', 'mystic', 'romance', 'angel', 'ocean', 'forest', 'neon', 'aurora', 'secret', 'luxury', 'candy', 'arcade', 'zen'];

module.exports = function assembleQuizOverlays(j, params) {
  if (!j || !Array.isArray(j.quizzes)) return j;
  const p = params || {};
  const slug = nslug(p.niche);
  const finalCtaUrl = typeof p.finalCtaUrl === 'string' ? p.finalCtaUrl : '';

  const overlays = j.quizzes.map((q, i) => {
    const mode = VALID_MODES.indexOf(q.entry_mode) >= 0 ? q.entry_mode : 'wheel';
    const pal = VALID_PAL.indexOf(q.theme_palette) >= 0 ? q.theme_palette : 'mystic';
    const qOpts = q.quiz_options || ['Sim', 'Talvez', 'Não'];
    const vOpts = (q.visual_options || []).map(o => {
      let image = '';
      if (o.pinterest) {
        // converte pinterest search -> link de pesquisa do Pinterest
        image = 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(o.pinterest);
      } else if (typeof o.image === 'string') {
        // defesa em profundidade: só aceita URL http(s) vinda do modelo
        const trimmed = o.image.trim();
        if (/^https?:\/\//i.test(trimmed)) image = trimmed;
      }
      return { label: o.label || '', image };
    });
    const wheelOpts = q.wheel_options && q.wheel_options.length ? q.wheel_options : ['Prêmio 1', 'Prêmio 2', 'Prêmio 3', 'Prêmio 4', 'Prêmio 5', 'Prêmio 6'];
    // trivia_correct_index: aceita o indice da IA, valida inteiro 0..3, fallback 0
    let tci = parseInt(q.trivia_correct_index, 10);
    if (isNaN(tci) || tci < 0 || tci > 3) tci = 0;
    return {
      id: q.id || (slug + '-' + (i + 1)),
      entry_mode: mode,
      questions: (q.quiz_question || '') + ' | ' + qOpts.join(' | '),
      qlist: [{ title: q.quiz_question || '', options: qOpts }],
      cooldown_min: 0,
      open_delay_ms: 2000,
      require_completion: true,
      ad_mode: 'rewarded',
      wheel_options: wheelOpts,
      wheel_fixed_index: '0',
      wheel_title: q.wheel_title || '',
      wheel_result_label: q.wheel_result_label || '',
      visual_questions: [{ title: q.visual_question || '', options: vOpts }],
      hold_visual: q.hold_visual || 'envelope',
      hold_duration: 1.5,
      hold_title: q.hold_title || '',
      hold_subtitle: q.hold_subtitle || '',
      hold_instruction: q.hold_instruction || '',
      hold_emoji: q.hold_emoji || '💌',
      scratch_title: q.scratch_title || '',
      scratch_prize: q.scratch_prize || '',
      scratch_cover_color: q.scratch_cover_color || '#2b1f3d',
      scratch_threshold: 40,
      scratch_hint: q.scratch_hint || '',
      scratch_subtext: q.scratch_subtext || '',
      countdown_from: 3,
      countdown_title: q.countdown_title || '',
      countdown_reveal: q.countdown_reveal || '',
      countdown_subtext: q.countdown_subtext || '',
      flip_title: q.flip_title || '',
      flip_front_text: q.flip_front_text || '🔒 Toque para virar',
      flip_prize: q.flip_prize || '',
      flip_emoji: q.flip_emoji || '✉️',
      gift_title: q.gift_title || '',
      gift_prize: q.gift_prize || '',
      gift_emoji: q.gift_emoji || '🎁',
      gift_btn_label: q.gift_btn_label || 'Abrir Presente',
      tap_count: 5,
      tap_title: q.tap_title || '',
      tap_label: q.tap_label || 'Toque para abrir',
      tap_complete_text: q.tap_complete_text || '',
      trivia_question: q.trivia_question || '',
      trivia_options: q.trivia_options || ['Sim', 'Talvez', 'Não', 'Agora'],
      trivia_correct_index: tci,
      trivia_wrong_text: q.trivia_wrong_text || '',
      final_cta_label: q.final_cta_label || 'Ver agora →',
      final_cta_url: finalCtaUrl,
      finish_title: q.finish_title || '',
      finish_note: q.finish_note || '',
      loading_text: q.loading_text || '',
      loading_ms: 1600,
      theme_palette: pal
    };
  });
  // retorna no formato: cada overlay é um export completo do plugin
  return {
    quizzes: overlays.map(ov => ({
      plugin: 'quiz-overlay',
      schema_version: 1,
      plugin_version: '4.1.0',
      exported_at: new Date().toISOString(),
      overlay: ov
    }))
  };
};
