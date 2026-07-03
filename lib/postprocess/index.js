// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — postprocess dispatcher
//  applyPostprocess(name, json, params) => json (funções puras)
// ============================================================
const fixOnboardChatdrink = require('./onboard');
const fixSequenceChatdrink = require('./sequence');
const assembleQuizOverlays = require('./quiz');
const enforceGridLegibility = require('./grid');

const MAP = {
  onboard: fixOnboardChatdrink,
  sequence: fixSequenceChatdrink,
  quiz: assembleQuizOverlays,
  grid: enforceGridLegibility
};

function applyPostprocess(name, json, params) {
  if (!json || !name) return json;
  const fn = MAP[name];
  return fn ? fn(json, params || {}) : json;
}

module.exports = { applyPostprocess, MAP };
