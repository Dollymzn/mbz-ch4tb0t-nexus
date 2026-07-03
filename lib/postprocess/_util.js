// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — postprocess/_util
//  Funções puras compartilhadas pelos pós-processadores.
// ============================================================

// slug curto e estável do nicho (mesma regra do v2)
function nslug(niche) {
  return String(niche || 'nicho').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
}

// Extrai JSON robusto de uma resposta de texto (port do v2).
function extractJSON(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const first = Math.min(...['{', '['].map(c => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
  if (first === Infinity) return null;
  const lastObj = t.lastIndexOf('}');
  const lastArr = t.lastIndexOf(']');
  const last = Math.max(lastObj, lastArr);
  if (last > first) { try { return JSON.parse(t.slice(first, last + 1)); } catch {} }
  return null;
}

// Reescreve as URLs dos botões com o padrão UTM canônico (port do v2).
function fixButtonsUtm(buttons, src, content) {
  if (!Array.isArray(buttons)) return;
  buttons.forEach(b => {
    const url = '{{URL_REDIR}}?utm_source=' + src + '&utm_campaign={{UTM_CAMPAIGN}}&utm_medium={{NOMEDAPAGINA}}&utm_term=' + src + '&utm_content=' + content;
    if (b.action_type === 'url') {
      b.url = url;
      b.urls = [{ url: url, weight: 100 }];
    }
  });
}

// Luminância: true = cor escura (port do v2).
function isDark(hex) {
  if (!hex || hex[0] !== '#') return true;
  const c = hex.slice(1);
  const f = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const r = parseInt(f.slice(0, 2), 16), g = parseInt(f.slice(2, 4), 16), b = parseInt(f.slice(4, 6), 16);
  if (isNaN(r)) return true;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

// Escolhe uma cor legível, caindo pro fallback se a cor for clara demais (port do v2).
function pickContrast(color, fallback) {
  if (!color || color[0] !== '#') return fallback;
  const c = color.slice(1);
  const f = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const r = parseInt(f.slice(0, 2), 16), g = parseInt(f.slice(2, 4), 16), b = parseInt(f.slice(4, 6), 16);
  if (isNaN(r)) return fallback;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum > 220) return fallback;
  return color;
}

module.exports = { nslug, extractJSON, fixButtonsUtm, isDark, pickContrast };
