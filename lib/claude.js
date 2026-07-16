// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — claude.js
//  streamMessage / createMessage: stream da Anthropic Messages API,
//  prompt caching (system como bloco ephemeral), retry 429/5xx honrando
//  retry-after, timeout por request via AbortController encadeado ao signal externo.
// ============================================================

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 180000; // 180s por request
const MAX_ATTEMPTS = 4;

function abortError(msg) {
  const e = new Error(msg || 'Aborted');
  e.name = 'AbortError';
  return e;
}

// Sleep abortável (pra backoff que respeita o disconnect do browser).
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError());
    const t = setTimeout(() => { cleanup(); resolve(); }, ms);
    function onAbort() { cleanup(); reject(abortError()); }
    function cleanup() {
      clearTimeout(t);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

// Encadeia um timeout (per-request) com o signal externo (disconnect do browser).
function chainSignal(external, timeoutMs) {
  const ctrl = new AbortController();
  let timer = null;
  function onAbort() {
    try { ctrl.abort(external.reason); } catch { ctrl.abort(); }
  }
  if (external) {
    if (external.aborted) onAbort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  if (timeoutMs) timer = setTimeout(() => ctrl.abort(abortError('timeout')), timeoutMs);
  function cleanup() {
    if (timer) clearTimeout(timer);
    if (external) external.removeEventListener('abort', onAbort);
  }
  return { signal: ctrl.signal, cleanup };
}

// retry-after: segundos (numérico) ou HTTP-date.
function retryAfterMs(res) {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const s = Number(h);
  if (!isNaN(s)) return Math.max(0, s * 1000);
  const d = Date.parse(h);
  if (!isNaN(d)) return Math.max(0, d - Date.now());
  return null;
}

function buildBody({ model, system, user, maxTokens, stream }) {
  // `user` aceita string | Array<ContentBlock> (§2.2). A Messages API já aceita
  // `content` como string OU array de blocos (text/image), então basta repassar —
  // string continua idêntica ao v3; array habilita multimodal (imagens no turno user).
  return JSON.stringify({
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens || 8000,
    stream: !!stream,
    // Prompt caching: system estático como bloco de texto com cache_control ephemeral.
    system: [{ type: 'text', text: String(system || ''), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }]
  });
}

// Lê o stream SSE da Anthropic e devolve { text, usage, stopReason }.
async function consumeStream(res, onDelta) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage = null;
  let stopReason = null;

  // Parseia um frame SSE (linhas "data: ..." separadas por \n) e atualiza o
  // estado acima. Fatorado pra poder ser reaplicado no frame residual final.
  async function processFrame(frame) {
    const dataLines = [];
    frame.split('\n').forEach(line => {
      if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).replace(/^\s/, ''));
    });
    if (!dataLines.length) return;
    const dataStr = dataLines.join('\n');
    if (dataStr === '[DONE]') return;
    let evt;
    try { evt = JSON.parse(dataStr); } catch { return; }

    if (evt.type === 'message_start' && evt.message && evt.message.usage) {
      usage = Object.assign({}, evt.message.usage);
    } else if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
      text += evt.delta.text;
      if (onDelta) await onDelta(evt.delta.text); // aguardável => backpressure
    } else if (evt.type === 'message_delta') {
      if (evt.delta && evt.delta.stop_reason) stopReason = evt.delta.stop_reason;
      if (evt.usage) usage = Object.assign({}, usage || {}, evt.usage);
    } else if (evt.type === 'error') {
      throw new Error((evt.error && evt.error.message) || 'Erro no stream da Anthropic.');
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // normaliza CRLF pra separar frames por \n\n de forma confiável
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      await processFrame(frame);
    }
  }
  // flush final do decoder (bytes multibyte pendentes) + processa o frame
  // residual que não veio terminado em \n\n (ex.: conexão fechou logo após
  // o último evento, sem o separador final).
  buffer += decoder.decode().replace(/\r/g, '');
  if (buffer.trim()) await processFrame(buffer);

  return { text, usage, stopReason };
}

// Uma tentativa (stream ou não). Erros retryáveis marcam err.retryable = true.
async function requestOnce({ apiKey, model, system, user, maxTokens, stream, onDelta, signal, timeoutMs }) {
  const { signal: reqSignal, cleanup } = chainSignal(signal, timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: buildBody({ model, system, user, maxTokens, stream }),
      signal: reqSignal
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let msg = raw;
      try { const j = JSON.parse(raw); msg = (j.error && j.error.message) || raw; } catch {}
      const err = new Error(`${res.status}: ${String(msg).slice(0, 280)}`);
      err.status = res.status;
      // Retry SÓ 429/≥500; 4xx aborta imediatamente.
      err.retryable = res.status === 429 || res.status >= 500;
      if (err.retryable) err.retryAfterMs = retryAfterMs(res);
      throw err;
    }

    if (stream) return await consumeStream(res, onDelta);

    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return { text, usage: data.usage || null, stopReason: data.stop_reason || null };
  } finally {
    cleanup();
  }
}

// Loop de retry com backoff exponencial honrando retry-after. Aborts não são retryáveis.
async function withRetry(fn, signal) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e && e.name === 'AbortError') throw e; // disconnect/timeout: não retenta
      if (e && e.retryable && attempt < MAX_ATTEMPTS - 1) {
        const backoff = e.retryAfterMs != null ? e.retryAfterMs : Math.min(1000 * Math.pow(2, attempt), 15000);
        await sleep(backoff, signal);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// ---- API pública (§4) ----

// onDelta(chunk) é AGUARDÁVEL. Só a fase pré-stream (HTTP não-ok) é retryável,
// então nenhum delta é emitido em dobro num retry.
async function streamMessage({ apiKey, model, system, user, maxTokens, onDelta, signal, timeoutMs }) {
  return withRetry(
    () => requestOnce({ apiKey, model, system, user, maxTokens, stream: true, onDelta, signal, timeoutMs: timeoutMs || DEFAULT_TIMEOUT_MS }),
    signal
  );
}

async function createMessage({ apiKey, model, system, user, maxTokens, signal, timeoutMs }) {
  return withRetry(
    () => requestOnce({ apiKey, model, system, user, maxTokens, stream: false, signal, timeoutMs: timeoutMs || DEFAULT_TIMEOUT_MS }),
    signal
  );
}

module.exports = {
  streamMessage,
  createMessage,
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS
};
