// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — postprocess/onboard
//  fixOnboardChatdrink: corrige random, redirects e UTM. (json, params) => json
// ============================================================
const { fixButtonsUtm, nslug } = require('./_util');

module.exports = function fixOnboardChatdrink(j, params) {
  if (!j || !Array.isArray(j.routes)) return j;
  const p = params || {};
  const slug = nslug(p.niche);
  const utmNative = !!p.utmNative;
  const routes = j.routes;
  const n = routes.length;
  if (n < 2) return j;
  const lastIdx = n - 1;
  // indices de conteudo = 1..lastIdx-1
  const contentIdx = [];
  for (let i = 1; i < lastIdx; i++) contentIdx.push(i);
  // 1) random na rota 0
  if (routes[0] && Array.isArray(routes[0].interactions)) {
    const r = routes[0].interactions.find(x => x.type === 'random');
    if (r) r.config = { routes: contentIdx.slice() };
  }
  // 2) cada rota de conteudo: redirect pra ultima + utm_content onbN
  contentIdx.forEach((idx, k) => {
    const route = routes[idx];
    if (!route || !Array.isArray(route.interactions)) return;
    const num = k + 1;
    route.interactions.forEach(it => {
      if (it.type === 'menu' && it.config) {
        it.config.redirect_type = 'route';
        it.config.redirect_target = lastIdx;
        (it.config.cards || []).forEach(c => fixButtonsUtm(c.buttons, 'onboard', 'onb' + num + '-' + slug, utmNative));
      }
      if (it.type === 'botoes' && it.config) {
        it.config.redirect_type = 'route';
        it.config.redirect_target = lastIdx;
        fixButtonsUtm(it.config.buttons, 'onboard', 'onb' + num + '-' + slug, utmNative);
      }
    });
  });
  return j;
};
