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

// Garantia determinística: o quiz roda no BLOG (fora do Messenger), então nenhum texto
// pode conter variáveis de chatbot tipo {{FIRST_NAME}} — apareceriam como texto cru pro leitor.
// Remove recursivamente qualquer {{...}} de strings (dentro de objetos e arrays também).
function stripChatbotVars(value) {
  if (typeof value === 'string') {
    return value.replace(/\{\{[^}]*\}\}/g, '').replace(/ {2,}/g, ' ').trim();
  }
  if (Array.isArray(value)) {
    return value.map(stripChatbotVars);
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => { out[k] = stripChatbotVars(value[k]); });
    return out;
  }
  return value;
}

// ============================================================
//  v4 — DIRECT OFFERWALL (schema v2, plugin 4.8.2): formato padrão da operação
//  nov/2026. Monta o export completo a partir do conteúdo da IA.
// ============================================================
const OW_PAL = VALID_PAL;
const OW_MODES = ['instant_reward', 'priority_signal', 'secure_access', 'critical_pulse'];

function assembleOfferwalls(j, params) {
  if (!j || !Array.isArray(j.quizzes)) return j;
  const p = params || {};
  const slug = nslug(p.niche);
  const sanitized = j.quizzes.map(stripChatbotVars);
  const overlays = sanitized.map((q, i) => ({
    id: q.id || (slug + '-' + (i + 1)),
    experience_type: 'direct_offerwall',
    cooldown_min: 0,
    open_delay_ms: 2000,
    require_completion: false,
    ad_mode: 'rewarded',
    require_rewarded_fill: true,
    rewarded_wait_ms: 8000,
    rewarded_max_wait_ms: 30000,
    theme_palette: OW_PAL.indexOf(q.theme_palette) >= 0 ? q.theme_palette : 'mystic',
    offerwall_mode: OW_MODES.indexOf(q.offerwall_mode) >= 0 ? q.offerwall_mode : 'instant_reward',
    offerwall_provider: 'triad_v1',
    offerwall_eyebrow: q.offerwall_eyebrow || '',
    offerwall_title: q.offerwall_title || '',
    offerwall_body: q.offerwall_body || '',
    offerwall_icon: q.offerwall_icon || '✨',
    offerwall_highlight: q.offerwall_highlight || '',
    offerwall_meta_text: q.offerwall_meta_text || '',
    offerwall_cta_label: q.offerwall_cta_label || 'Ver Agora',
    offerwall_destination_url: '',
    offerwall_timer_enabled: true,
    offerwall_timer_seconds: 300,
    offerwall_timer_label: q.offerwall_timer_label || '',
    offerwall_expired_title: q.offerwall_expired_title || '',
    offerwall_expired_note: q.offerwall_expired_note || ''
  }));
  return {
    format: 'offerwall',
    quizzes: overlays.map(ov => ({
      plugin: 'quiz-overlay',
      schema_version: 2,
      plugin_version: '4.8.2',
      exported_at: new Date().toISOString(),
      overlay: ov
    }))
  };
}

function assembleQuizOverlays(j, params) {
  if (!j || !Array.isArray(j.quizzes)) return j;
  const p = params || {};
  const slug = nslug(p.niche);
  const finalCtaUrl = typeof p.finalCtaUrl === 'string' ? p.finalCtaUrl : '';
  const sanitizedQuizzes = j.quizzes.map(stripChatbotVars);

  const overlays = sanitizedQuizzes.map((q, i) => {
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
}

// Dispatcher v4: params.quizFormat decide o assembler (offerwall = padrão da operação
// nov/2026; clássico 4.1.0 preservado). Export nomeado dos dois pra testes.
module.exports = function assembleQuiz(j, params) {
  return (params && params.quizFormat === 'offerwall')
    ? assembleOfferwalls(j, params)
    : assembleQuizOverlays(j, params);
};
module.exports.assembleQuizOverlays = assembleQuizOverlays;
module.exports.assembleOfferwalls = assembleOfferwalls;
