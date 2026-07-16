// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — validate.js
//  validateParams(body) => { ok, errors }  (bloqueia a run: 400)
//  validateChatDrink(block, json) => { ok, errors }  (vira warnings, não bloqueia)
// ============================================================
// ALL_BLOCKS inclui os sintéticos (review/creative_analysis) → a rota aceita esses
// ids sem 400 de validação (§1.5). KNOWN_BLOCKS (16) segue para o picker/grafo.
const { ALL_BLOCKS } = require('./blocks');

// Tetos duros de imagem (§2). base64 é ~1 char/byte, então o length da string serve.
const MAX_IMAGES = 6;
const MAX_IMG_BASE64 = Math.floor(1.2 * 1024 * 1024); // 1.2MB por imagem

// Valida uma lista de imagens (top-level `images` ou `params.<block>.images`).
function validateImages(imgs, label, errors) {
  if (imgs == null) return;
  if (!Array.isArray(imgs)) { errors.push(`${label} deve ser um array de imagens.`); return; }
  if (imgs.length > MAX_IMAGES) {
    errors.push(`${label}: máximo de ${MAX_IMAGES} imagens (recebidas ${imgs.length}).`);
  }
  imgs.forEach((im, i) => {
    if (!im || typeof im !== 'object') { errors.push(`${label}[${i}] inválida.`); return; }
    if (im.data != null) {
      if (typeof im.data !== 'string') {
        errors.push(`${label}[${i}].data deve ser base64 (string).`);
      } else if (im.data.length > MAX_IMG_BASE64) {
        errors.push(`${label}[${i}]: imagem excede o teto de 1.2MB em base64.`);
      }
    }
  });
}

// Valida a política do NEXUS Agent (§1.1).
function validateAgent(agent, errors) {
  if (agent == null) return;
  if (typeof agent !== 'object' || Array.isArray(agent)) { errors.push('agent deve ser um objeto.'); return; }
  if (agent.enabled != null && typeof agent.enabled !== 'boolean') {
    errors.push('agent.enabled deve ser booleano.');
  }
  if (agent.maxIterations != null && (!Number.isInteger(agent.maxIterations) || agent.maxIterations < 0)) {
    errors.push('agent.maxIterations deve ser um inteiro ≥ 0.');
  }
  if (agent.minScore != null && (typeof agent.minScore !== 'number' || agent.minScore < 0 || agent.minScore > 10)) {
    errors.push('agent.minScore deve ser um número entre 0 e 10.');
  }
  if (agent.blocks != null && !Array.isArray(agent.blocks)) {
    errors.push('agent.blocks deve ser null ou um array.');
  }
}

// Valida o body do POST /api/run.
function validateParams(body) {
  const errors = [];
  const b = body || {};
  if (!Array.isArray(b.blocks)) {
    errors.push('blocks deve ser um array de ids de bloco.');
  } else {
    if (!b.blocks.length) errors.push('blocks está vazio.');
    const unknown = b.blocks.filter(x => ALL_BLOCKS.indexOf(x) < 0);
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

  // v3.1: política do agente + tetos de imagem.
  validateAgent(b.agent, errors);
  validateImages(b.images, 'images', errors); // espelho de tamanho (§1.1)
  if (b.params && typeof b.params === 'object' && !Array.isArray(b.params)) {
    Object.keys(b.params).forEach(k => {
      const val = b.params[k];
      if (val && typeof val === 'object' && !Array.isArray(val) && val.images != null) {
        validateImages(val.images, `params.${k}.images`, errors);
      }
    });
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
