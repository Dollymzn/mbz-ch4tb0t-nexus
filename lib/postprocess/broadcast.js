// ============================================================
//  MBZ::CH4TB0T NEXUS v4 — postprocess/broadcast
//  fixBroadcasts: garante o formato de importação ChatDrink jul/2026 —
//  sem emoji no body, {{first_name}} sem colchetes, URL exata do broadutility,
//  names/bodies 100% únicos (dedup GLOBAL, inclusive entre lotes),
//  SECRET banido no header. (json, params) => array
// ============================================================

const BODY_VARIANTS = [' now.', ' today.', ' to continue.', ' to proceed.', ' when you are ready.', ' at any time.'];
const BROAD_URL = '{{URL_REDIR}}?utm_source=broadutility&utm_campaign={{CAMPAIGN_BROAD}}&utm_medium={{NOMEDAPAGINA}}';

// remove emojis/pictogramas (quebram o charset do banco do ChatDrink)
function stripEmoji(s) {
  return String(s || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

function fixBroadcasts(arr, params) {
  let list = Array.isArray(arr) ? arr : (arr && Array.isArray(arr.broadcasts) ? arr.broadcasts : null);
  if (!list) return arr;
  const p = params || {};
  const lang = (p.flowLang || 'en-US').replace('-', '_');
  const img = p.broadcastImageUrl || '';
  const seenNames = new Set();
  const seenBodies = new Set();
  return list.map((b, i) => {
    b = b || {};
    let name = String(b.name || ('broadcast_' + (i + 1))).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    while (seenNames.has(name)) name = name + '_' + (i + 1);
    seenNames.add(name);
    let body = stripEmoji(b.body_text || '');
    body = body.replace(/\[\s*\{\{first_name\}\}\s*\]/g, '{{first_name}}'); // nunca [{{first_name}}]
    if (body.indexOf('{{first_name}}') < 0) body = '{{first_name}} ' + body;
    // desempata bodies duplicados (inclusive 3+ iguais): troca o fechamento por variantes
    // e, esgotadas, acrescenta um marcador numérico — nunca deixa dois iguais passar.
    if (seenBodies.has(body)) {
      const base = body.replace(/\.$/, '');
      let k = 0;
      do {
        body = k < BODY_VARIANTS.length ? base + BODY_VARIANTS[k] : base + ' (' + (k - BODY_VARIANTS.length + 2) + ').';
        k++;
      } while (seenBodies.has(body));
    }
    seenBodies.add(body);
    let header = stripEmoji(b.header_title || '').toUpperCase();
    if (/SECRET/.test(header)) header = header.replace(/SECRET/g, 'MESSAGE'); // banido permanente
    const btn = (b.buttons && b.buttons[0]) || {};
    return {
      name,
      header_title: header,
      body_text: body,
      language: String(b.language || lang).replace('-', '_'),
      category: 'UTILITY',
      niche: b.niche || p.niche || '',
      image_url: b.image_url || img,
      buttons: [{ type: 'url', text: stripEmoji(btn.text || 'ACCESS').toUpperCase(), url: BROAD_URL }]
    };
  });
}

module.exports = fixBroadcasts;
module.exports.stripEmoji = stripEmoji;
module.exports.BROAD_URL = BROAD_URL;
