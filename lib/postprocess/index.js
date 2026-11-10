// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — postprocess dispatcher
//  applyPostprocess(name, json, params) => json (funções puras)
// ============================================================
const fixOnboardChatdrink = require('./onboard');
const fixSequenceChatdrink = require('./sequence');
const assembleQuiz = require('./quiz');
const enforceGridLegibility = require('./grid');
const fixBroadcasts = require('./broadcast');
const fixPosts = require('./posts');
const fixAudios = require('./audios');
const titles = require('./titles');
const fixMetaOnboard = require('./meta_onboard');

const MAP = {
  onboard: fixOnboardChatdrink,
  sequence: fixSequenceChatdrink,
  quiz: assembleQuiz,
  grid: enforceGridLegibility,
  broadcast: fixBroadcasts,
  posts: fixPosts,
  audios: fixAudios,
  p1_titles: titles.p1,
  p2_titles: titles.p2,
  meta_onboard: fixMetaOnboard
};

function applyPostprocess(name, json, params) {
  if (!json || !name) return json;
  const fn = MAP[name];
  return fn ? fn(json, params || {}) : json;
}

module.exports = { applyPostprocess, MAP };
