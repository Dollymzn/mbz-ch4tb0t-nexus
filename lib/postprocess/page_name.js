// v4.2 — nomes de página: 3 mulheres · 3 homens · 3 marcas. Mantém "names" (plano) por compatibilidade.
function clean(arr) { return (Array.isArray(arr) ? arr : []).map(x => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean); }
function fixPageName(j) {
  if (!j || typeof j !== 'object') return j;
  if (Array.isArray(j.names) && !j.fem && !j.masc && !j.marca) {
    // formato antigo → joga tudo em "fem" (compat) mas avisa
    j.fem = clean(j.names).slice(0, 3); j.masc = []; j.marca = [];
  }
  j.fem = clean(j.fem).slice(0, 3); j.masc = clean(j.masc).slice(0, 3); j.marca = clean(j.marca).slice(0, 3);
  j.names = j.fem.concat(j.masc, j.marca);
  return j;
}
module.exports = fixPageName;
