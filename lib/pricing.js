// ============================================================
//  MBZ::CH4TB0T NEXUS v4.2 — lib/pricing.js
//  Custo estimado em US$ por uso (tokens). Tabela em US$ por MILHÃO de tokens.
//  Override: MODEL_PRICES='{"claude-sonnet-5-5":{"in":3,"out":15}}' no ambiente.
//  É ESTIMATIVA (preço de lista; cache lido custa 10% do input).
// ============================================================
const DEFAULT_PRICES = {
  'claude-sonnet-5-5': { in: 3, out: 15 },
  'claude-opus-5-5': { in: 15, out: 75 },
  'claude-fable-5-1': { in: 15, out: 75 },
  'claude-haiku-5-5': { in: 1, out: 5 }
};
let PRICES = Object.assign({}, DEFAULT_PRICES);
try { if (process.env.MODEL_PRICES) Object.assign(PRICES, JSON.parse(process.env.MODEL_PRICES)); } catch (e) { /* ignora JSON inválido */ }

function priceOf(model) {
  if (PRICES[model]) return PRICES[model];
  const k = Object.keys(PRICES).find(id => model && model.indexOf(id.replace(/-\d+-\d+$/, '')) === 0);
  return k ? PRICES[k] : { in: 3, out: 15 };
}
// usage: {input_tokens, output_tokens, cache_read_input_tokens} ou {input, output, cacheRead}
function costOf(model, usage) {
  if (!usage) return 0;
  const p = priceOf(model);
  const inp = usage.input_tokens != null ? usage.input_tokens : (usage.input || 0);
  const out = usage.output_tokens != null ? usage.output_tokens : (usage.output || 0);
  const cr = usage.cache_read_input_tokens != null ? usage.cache_read_input_tokens : (usage.cacheRead || 0);
  return (inp * p.in + out * p.out + cr * p.in * 0.1) / 1e6;
}
function fmt(usd) { return usd >= 1 ? '$' + usd.toFixed(2) : usd >= 0.01 ? '$' + usd.toFixed(3) : '$' + usd.toFixed(4); }
module.exports = { PRICES, priceOf, costOf, fmt };
