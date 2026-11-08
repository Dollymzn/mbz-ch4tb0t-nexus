// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — postprocess/grid
//  enforceGridLegibility: anexa CSS de contraste que SEMPRE vence.
//  (json, params) => json
// ============================================================
const { isDark, pickContrast } = require('./_util');

module.exports = function enforceGridLegibility(j, params) {
  if (!j || !j.grid) return j;
  const dir = (params && params.gridDirection) || {};
  const titleColor = pickContrast(dir.title_color, '#ffffff');
  const itemBg = dir.item_bg || '#1a1a2e';
  const itemText = pickContrast(dir.item_text_color, isDark(itemBg) ? '#ffffff' : '#111111');
  const font = dir.font || 'Georgia, "Times New Roman", serif';
  const accent = (dir.palette && dir.palette[0]) || '#c084fc';

  const enforced = `
/* === LEGIBILIDADE GARANTIDA (MBZ NEXUS) === */
.mirb-grid-title{font-family:${font} !important;font-weight:800 !important;font-size:30px !important;color:${titleColor} !important;text-shadow:0 2px 10px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.95) !important;letter-spacing:.3px !important;line-height:1.2 !important;}
.mirb-grid-subtitle{font-family:${font} !important;font-weight:600 !important;font-size:17px !important;color:${titleColor} !important;opacity:1 !important;text-shadow:0 1px 6px rgba(0,0,0,.85) !important;}
.mirb-grid-item-title{font-family:${font} !important;font-weight:800 !important;font-size:17px !important;color:${itemText} !important;background:${itemBg} !important;padding:16px 12px !important;text-shadow:${isDark(itemBg) ? '0 1px 4px rgba(0,0,0,.6)' : 'none'} !important;letter-spacing:.2px !important;line-height:1.3 !important;}
.mirb-grid-item{border:2px solid ${accent} !important;border-radius:14px !important;overflow:hidden !important;box-shadow:0 4px 16px rgba(0,0,0,.3) !important;}
.mirb-grid-footer-line{color:${titleColor} !important;font-weight:600 !important;font-size:15px !important;opacity:1 !important;text-shadow:0 1px 5px rgba(0,0,0,.7) !important;}
.mirb-grid-footer-highlight{color:#fff !important;font-weight:800 !important;font-size:18px !important;background:${accent} !important;padding:8px 22px !important;border-radius:24px !important;display:inline-block !important;letter-spacing:1px !important;}
.mirb-grid-item img{width:100% !important;height:180px !important;object-fit:cover !important;display:block !important;}
.mirb-grid-item,.mirb-grid-item a,.mirb-grid-item-title,.mirb-grid-title,.mirb-grid-subtitle{text-decoration:none !important;}
`;
  j.grid.custom_css = (j.grid.custom_css || '') + '\n' + enforced;
  // formato ago/2026: garante item_link = busca do Pinterest (placeholder trocado pelos P2s)
  // e item_image string (a URL real da foto é resolvida depois pelo lib/photos no orchestrator).
  if (Array.isArray(j.items)) {
    j.items.forEach(it => {
      const term = it.pexels_search || it.item_title || '';
      if (!it.item_link) it.item_link = 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(term);
      if (it.item_image == null) it.item_image = '';
    });
  }
  return j;
};
