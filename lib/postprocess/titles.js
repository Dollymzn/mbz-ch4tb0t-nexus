// v4.1.1 — títulos compactos: só limpa e AVISA (não corta — corte cego estraga o gancho).
function fixTitles(j, params, maxLen) {
  if (!j || !Array.isArray(j.titles)) return j;
  const lim = maxLen || 60;
  const warnings = [];
  j.titles = j.titles.map((t, i) => {
    let s = String(t || '').replace(/\s+/g, ' ').replace(/[.…]+$/, '').trim();
    if (s.length > lim) warnings.push('#' + (i + 1) + ' tem ' + s.length + ' caracteres (máx ' + lim + '): "' + s.slice(0, 50) + '…" — regenere ou encurte');
    return s;
  });
  if (warnings.length) j._warnings = (j._warnings || []).concat(warnings);
  return j;
}
module.exports = { p1: (j, p) => fixTitles(j, p, 60), p2: (j, p) => fixTitles(j, p, 55), fixTitles };
