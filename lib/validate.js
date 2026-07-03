// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — validate.js
//  validateParams(body) => { ok, errors }  (bloqueia a run: 400)
//  validateChatDrink(block, json) => { ok, errors }  (vira warnings, não bloqueia)
// ============================================================
const { KNOWN_BLOCKS } = require('./blocks');

// Valida o body do POST /api/run.
function validateParams(body) {
  const errors = [];
  const b = body || {};
  if (!Array.isArray(b.blocks)) {
    errors.push('blocks deve ser um array de ids de bloco.');
  } else {
    if (!b.blocks.length) errors.push('blocks está vazio.');
    const unknown = b.blocks.filter(x => KNOWN_BLOCKS.indexOf(x) < 0);
    if (unknown.length) errors.push('blocos desconhecidos: ' + unknown.join(', ') + '.');
    const nonString = b.blocks.filter(x => typeof x !== 'string');
    if (nonString.length) errors.push('todos os ids de bloco devem ser strings.');
  }
  if (b.params != null && (typeof b.params !== 'object' || Array.isArray(b.params))) {
    errors.push('params deve ser um objeto.');
  }
  if (b.model != null && typeof b.model !== 'string') {
    errors.push('model deve ser uma string.');
  }
  if (b.artifacts != null && (typeof b.artifacts !== 'object' || Array.isArray(b.artifacts))) {
    errors.push('artifacts deve ser um objeto.');
  }
  return { ok: errors.length === 0, errors };
}

// Validação de schema por bloco (não-fatal). Roda DEPOIS do postprocess.
function validateChatDrink(block, json) {
  const errors = [];
  if (!json) return { ok: true, errors };

  if (block === 'onboard' || block === 'sequence' || block === 'comment') {
    if (!Array.isArray(json.routes)) {
      errors.push('routes ausente ou não é array.');
    } else {
      json.routes.forEach((r, i) => {
        if (!r || typeof r !== 'object') { errors.push(`route[${i}] inválida.`); return; }
        if (!Array.isArray(r.interactions)) {
          errors.push(`route[${i}] sem array interactions.`);
          return;
        }
        r.interactions.forEach((it, j) => {
          if (!it || typeof it.type !== 'string') errors.push(`route[${i}].interaction[${j}] sem type válido.`);
          else if (it.config != null && typeof it.config !== 'object') errors.push(`route[${i}].interaction[${j}] com config inválido.`);
        });
      });
      const first = json.routes[0];
      if (block === 'onboard' || block === 'sequence') {
        if (!first || !(first.interactions || []).some(it => it.type === 'random')) {
          errors.push(`${block}: route_0 deve conter interaction "random".`);
        }
      }
    }
    if (block === 'comment' && !json.comment_trigger) {
      errors.push('comment: comment_trigger ausente.');
    }
  } else if (block === 'quiz') {
    if (!Array.isArray(json.quizzes)) {
      errors.push('quiz: quizzes ausente ou não é array.');
    } else {
      json.quizzes.forEach((q, i) => {
        const ov = (q && q.overlay) || q;
        if (!ov || typeof ov !== 'object') { errors.push(`quiz[${i}] inválido.`); return; }
        if (ov.trivia_correct_index != null) {
          const n = Number(ov.trivia_correct_index);
          if (!Number.isInteger(n) || n < 0 || n > 3) errors.push(`quiz[${i}]: trivia_correct_index fora de 0..3.`);
        }
      });
    }
  } else if (block === 'grid') {
    if (!json.grid || typeof json.grid !== 'object') errors.push('grid: objeto "grid" ausente.');
    if (!Array.isArray(json.items)) errors.push('grid: "items" ausente ou não é array.');
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validateParams, validateChatDrink };
