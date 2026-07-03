// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — postprocess/sequence
//  fixSequenceChatdrink: random, fallback, quick_replies, UTM. (json, params) => json
// ============================================================
const { fixButtonsUtm, nslug } = require('./_util');

module.exports = function fixSequenceChatdrink(j, params) {
  if (!j || !Array.isArray(j.routes)) return j;
  const slug = nslug((params || {}).niche);
  const routes = j.routes;
  const n = routes.length;
  if (n < 3) return j;
  const fbIdx = n - 1; // ultima = fallback
  const contentIdx = [];
  for (let i = 1; i < fbIdx; i++) contentIdx.push(i);
  // random aponta so pras de conteudo
  if (routes[0] && Array.isArray(routes[0].interactions)) {
    const r = routes[0].interactions.find(x => x.type === 'random');
    if (r) r.config = { routes: contentIdx.slice() };
  }
  // conteudo: quick_replies -> fallback; utm seqN
  contentIdx.forEach((idx, k) => {
    const route = routes[idx];
    if (!route || !Array.isArray(route.interactions)) return;
    const num = k + 1;
    route.interactions.forEach(it => {
      if (it.type === 'menu' && it.config) (it.config.cards || []).forEach(c => fixButtonsUtm(c.buttons, 'sequence', 'seq' + num + '-' + slug));
      if (it.type === 'mensagem' && it.config && Array.isArray(it.config.quick_replies)) {
        it.config.quick_replies.forEach(q => { q.action_type = 'route'; q.target_route = fbIdx; q.target_flow = ''; });
      }
    });
  });
  // fallback utm seqf
  const fb = routes[fbIdx];
  if (fb && Array.isArray(fb.interactions)) {
    fb.interactions.forEach(it => { if (it.type === 'botoes' && it.config) fixButtonsUtm(it.config.buttons, 'sequence', 'seqf-' + slug); });
  }
  return j;
};
