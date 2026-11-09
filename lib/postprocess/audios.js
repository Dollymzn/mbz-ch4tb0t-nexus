// v4.1.1 — normaliza as vozes dos áudios pelo catálogo ElevenLabs (lib/voices.js):
// nome/id fora do catálogo → corrigido pelo mais próximo; id sempre preenchido.
const { findVoice, VOICES } = require('../voices');

function fixAudios(j) {
  if (!j || !Array.isArray(j.audios)) return j;
  const warnings = [];
  const norm = (obj, label) => {
    if (!obj || typeof obj !== 'object') return null;
    const v = findVoice(obj.id) || findVoice(obj.name);
    if (!v) { warnings.push(label + ': voz "' + (obj.name || obj.id || '?') + '" fora do catálogo'); return null; }
    return { name: v.name, id: v.id };
  };
  j.voice_main = norm(j.voice_main, 'voice_main');
  j.voice_alt = norm(j.voice_alt, 'voice_alt');
  const fallback = j.voice_main || null;
  j.audios = j.audios.map((a) => {
    const v = findVoice(a.voice_id) || findVoice(a.voice) || fallback && findVoice(fallback.id);
    if (!v) { warnings.push('#' + a.index + ': voz "' + (a.voice || '') + '" fora do catálogo'); return a; }
    return Object.assign({}, a, { voice: v.name, voice_id: v.id });
  });
  if (!j.voice_main && j.audios[0] && j.audios[0].voice_id) j.voice_main = { name: j.audios[0].voice, id: j.audios[0].voice_id };
  if (warnings.length) j._warnings = (j._warnings || []).concat(warnings);
  return j;
}
module.exports = fixAudios;
module.exports.VOICES = VOICES;
