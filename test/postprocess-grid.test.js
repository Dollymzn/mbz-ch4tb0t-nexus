// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — testes: lib/postprocess/grid.js
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const enforceGridLegibility = require('../lib/postprocess/grid');

test('custom_css recebe o bloco de legibilidade com !important', () => {
  const j = { grid: { custom_css: '.mirb-grid-container{background:#111}' }, items: [] };
  const params = { gridDirection: { title_color: '#00ffcc', item_bg: '#111111', item_text_color: '#ffee00', font: 'Poppins', palette: ['#ff00ff', '#00ffff'] } };
  const result = enforceGridLegibility(j, params);

  assert.ok(result.grid.custom_css.startsWith('.mirb-grid-container{background:#111}'), 'preserva o css original antes de anexar');
  assert.ok(result.grid.custom_css.includes('LEGIBILIDADE GARANTIDA'));
  assert.ok(result.grid.custom_css.includes('.mirb-grid-title'));
  assert.ok(result.grid.custom_css.includes('.mirb-grid-item-title'));
  assert.ok(result.grid.custom_css.includes('.mirb-grid-footer-highlight'));
  // conta de !important — deve ter várias ocorrências
  const count = (result.grid.custom_css.match(/!important/g) || []).length;
  assert.ok(count >= 10, `esperava várias ocorrências de !important, achou ${count}`);
});

test('cores da gridDirection são aplicadas no CSS gerado', () => {
  const j = { grid: { custom_css: '' } };
  const params = { gridDirection: { title_color: '#00ffcc', item_bg: '#111111', item_text_color: '#ffee00', font: 'Poppins', palette: ['#ff00ff', '#00ffff'] } };
  const result = enforceGridLegibility(j, params);
  const css = result.grid.custom_css;

  assert.ok(css.includes('font-family:Poppins'));
  assert.ok(css.includes('color:#00ffcc')); // title_color (contraste ok, preservada)
  assert.ok(css.includes('background:#111111')); // item_bg
  assert.ok(css.includes('color:#ffee00')); // item_text_color (contraste ok, preservada)
  assert.ok(css.includes('border:2px solid #ff00ff')); // accent = palette[0]
  assert.ok(css.includes('background:#ff00ff')); // footer-highlight usa o accent
});

test('title_color/item_text_color claros demais caem pro fallback de contraste', () => {
  const j = { grid: { custom_css: '' } };
  const params = { gridDirection: { title_color: '#ffffff', item_bg: '#1a1a2e', item_text_color: '#ffffff', font: 'Georgia' } };
  const result = enforceGridLegibility(j, params);
  const css = result.grid.custom_css;
  // title_color branco (luminância>220) cai pro fallback '#ffffff' (mesmo valor, mas via fallback)
  // item_bg escuro (#1a1a2e) => fallback de item_text seria '#ffffff'; item_text_color '#ffffff' também é claro >220 => cai no MESMO fallback '#ffffff'
  assert.ok(css.includes('background:#1a1a2e'));
  assert.ok(css.includes('border:2px solid #c084fc')); // accent default, sem palette
});

test('sem params.gridDirection usa defaults e não quebra', () => {
  const j = { grid: { custom_css: '' } };
  const result = enforceGridLegibility(j, {});
  const css = result.grid.custom_css;
  assert.ok(css.includes('background:#1a1a2e')); // item_bg default
  assert.ok(css.includes('border:2px solid #c084fc')); // accent default
  assert.ok(css.includes('Georgia'));
});

test('sem grid (j.grid ausente) retorna intacto', () => {
  const input = { items: [] };
  const result = enforceGridLegibility(input, { gridDirection: {} });
  assert.equal(result, input);
  assert.deepEqual(result, { items: [] });
});

test('input null/undefined retorna intacto', () => {
  assert.equal(enforceGridLegibility(null, {}), null);
  assert.equal(enforceGridLegibility(undefined, {}), undefined);
});
