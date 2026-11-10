// v4.1.1 — entrada Meta (CTM): aplica os limites da Meta e monta o JSON de quick replies pronto.
//   greeting ≤300 · pergunta FAQ ≤80 · quick reply ≤20 (com emoji) · máx 5 de cada · payload ONB_<NICHO>_<rota>
// payload da entrada Meta: ONB_<NICHO>_<rota> — nicho em MAIÚSCULAS, até 2 palavras / 16 chars, sem cortar palavra
function metaNs(niche) {
  const words = String(niche || 'nicho').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  let out = '';
  for (const w of words) { const cand = out ? out + '_' + w : w; if (cand.length > 16 || (out && cand.split('_').length > 2)) break; out = cand; }
  return out || (words[0] || 'NICHO').slice(0, 16);
}
function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '').trim() : s; }
function fixMetaOnboard(j, params) {
  if (!j || typeof j !== 'object') return j;
  const warnings = [];
  // formato antigo (welcome/quick_replies de string) → converte
  if (!j.greeting && j.welcome) j.greeting = j.welcome;
  if (Array.isArray(j.quick_replies) && typeof j.quick_replies[0] === 'string') j.quick_replies = j.quick_replies.map((t, i) => ({ route: i + 1, title: t, payload: 'ONB_' + (i + 1) }));
  if (!Array.isArray(j.faq)) j.faq = (j.quick_replies || []).map(q => ({ route: q.route, question: q.title, payload: q.payload }));
  const ns = metaNs((params && params.niche) || 'NICHO');
  const payload = (it, i) => it.payload || ('ONB_' + ns + '_' + (it.route || i + 1));
  const g = String(j.greeting || '');
  if (g.length > 300) warnings.push('saudação com ' + g.length + ' caracteres (máx 300) — cortada');
  j.greeting = clip(g, 300);
  j.faq = (j.faq || []).slice(0, 5).map((it, i) => {
    const q = String(it.question || '');
    if ([...q].length > 80) warnings.push('FAQ #' + (i + 1) + ' com ' + [...q].length + ' caracteres (máx 80) — cortada');
    return { route: it.route || i + 1, question: clip(q, 80), payload: payload(it, i) };
  });
  j.quick_replies = (j.quick_replies || []).slice(0, 5).map((it, i) => {
    const t = String(it.title || '').trim();
    const len = [...t].length;
    if (len > 20) warnings.push('quick reply #' + (i + 1) + ' "' + t + '" tem ' + len + ' caracteres (máx 20) — cortada');
    return { route: it.route || i + 1, title: [...t].slice(0, 20).join('').trim(), payload: payload(it, i) };
  });
  j.followup = clip(j.followup, 300);
  // JSON pronto pro campo "JSON" do anúncio
  j.meta_json = { message: { text: j.greeting, quick_replies: j.quick_replies.map(q => ({ content_type: 'text', title: q.title, payload: q.payload })) } };
  if (warnings.length) j._warnings = (j._warnings || []).concat(warnings);
  return j;
}
module.exports = fixMetaOnboard;
