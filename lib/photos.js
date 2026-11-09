// ============================================================
//  MBZ::CH4TB0T NEXUS v4 — photos
//  resolveGridImages: resolve item_image -> URL real de foto via cascata
//  multi-provider (Pexels -> Pixabay -> Unsplash). ASSÍNCRONO — roda no
//  orchestrator DEPOIS do postprocess do grid (o dispatcher MAP é síncrono).
//  Env (qualquer UMA resolve; tenta na ordem):
//    PEXELS_API_KEY · PIXABAY_API_KEY · UNSPLASH_ACCESS_KEY
//  Marca j._pexels: 'missing_key' | 'no_results' | 'resolved:<providers>'.
// ============================================================

// timeout por request: um provider pendurado não pode travar o bloco grid
const FETCH_TIMEOUT_MS = 8000;
function tfetch(url, opts) {
  return fetch(url, Object.assign({}, opts || {}, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }));
}

const PHOTO_PROVIDERS = [
  {
    name: 'pexels', env: 'PEXELS_API_KEY',
    async search(term, key) {
      const r = await tfetch('https://api.pexels.com/v1/search?per_page=3&orientation=landscape&query=' + encodeURIComponent(term), { headers: { Authorization: key } });
      if (!r.ok) return null;
      const d = await r.json(); const p = d.photos && d.photos[0];
      return p && p.src ? (p.src.large || p.src.medium || p.src.original) : null;
    }
  },
  {
    name: 'pixabay', env: 'PIXABAY_API_KEY',
    async search(term, key) {
      const r = await tfetch('https://pixabay.com/api/?key=' + encodeURIComponent(key) + '&image_type=photo&orientation=horizontal&safesearch=true&per_page=3&q=' + encodeURIComponent(term));
      if (!r.ok) return null;
      const d = await r.json(); const h = d.hits && d.hits[0];
      return h ? (h.largeImageURL || h.webformatURL) : null;
    }
  },
  {
    name: 'unsplash', env: 'UNSPLASH_ACCESS_KEY',
    async search(term, key) {
      const r = await tfetch('https://api.unsplash.com/search/photos?per_page=3&orientation=landscape&query=' + encodeURIComponent(term), { headers: { Authorization: 'Client-ID ' + key } });
      if (!r.ok) return null;
      const d = await r.json(); const ph = d.results && d.results[0];
      return ph && ph.urls ? (ph.urls.regular || ph.urls.full) : null;
    }
  }
];

async function resolveGridImages(j) {
  if (!j || !Array.isArray(j.items)) return j;
  const active = PHOTO_PROVIDERS.filter(pr => process.env[pr.env]);
  if (!active.length) {
    // sem nenhuma key: marca pro front avisar; mantém pexels_search pro usuário resolver manual
    j._pexels = 'missing_key';
    return j;
  }
  const used = new Set();
  for (const it of j.items) {
    const term = it.pexels_search || it.item_title;
    if (!term || (it.item_image && String(it.item_image).startsWith('http'))) continue;
    for (const pr of active) {
      try {
        const url = await pr.search(term, process.env[pr.env]);
        if (url) { it.item_image = url; used.add(pr.name); break; }
      } catch (e) { /* tenta o próximo provider sem travar o grid */ }
    }
  }
  j._pexels = used.size ? ('resolved:' + [...used].join('+')) : 'no_results';
  return j;
}

// v4.1: uma foto pra um termo (imagem destacada dos posts). null se nenhuma key/sem resultado.
async function findPhotoUrl(term) {
  if (!term) return null;
  const active = PHOTO_PROVIDERS.filter(pr => process.env[pr.env]);
  for (const pr of active) {
    try {
      const url = await pr.search(term, process.env[pr.env]);
      if (url) return { url, provider: pr.name };
    } catch (e) { /* próximo provider */ }
  }
  return null;
}

module.exports = { resolveGridImages, findPhotoUrl, PHOTO_PROVIDERS };
