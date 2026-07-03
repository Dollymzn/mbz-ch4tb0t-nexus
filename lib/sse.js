// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — sse.js
//  Writer SSE: flushHeaders imediato, ": connected", keepalive 15s,
//  coalescing de deltas (~60ms ou ~500 chars), backpressure (await 'drain'),
//  headers anti-buffering do §1 (sem compressão nesta rota).
// ============================================================

const KEEPALIVE_MS = 15000;
const COALESCE_MS = 60;
const COALESCE_CHARS = 500;

function frame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function openSSE(res) {
  let closed = false;
  // socket morto (disconnect) => flag imediata; nenhuma espera de drain deve
  // ficar pendurada depois disso, e todo write/send vira no-op.
  function markClosed() { closed = true; }
  res.on('close', markClosed);
  res.on('error', markClosed);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  // primeiro byte imediato (evita buffering do proxy)
  try { res.write(': connected\n\n'); } catch {}

  // Fila serializada de escritas: garante ordem + aplica backpressure.
  let writeChain = Promise.resolve();
  function rawWrite(chunk) {
    writeChain = writeChain.then(() => new Promise((resolve) => {
      if (closed || res.writableEnded || res.destroyed) return resolve();
      let ok;
      try { ok = res.write(chunk); } catch { return resolve(); }
      if (ok) return resolve();
      // backpressure: espera drain OU close OU error — o que vier primeiro —
      // e sempre remove os três listeners (evita deadlock se o socket morrer
      // antes do drain e vazamento de listener no caso contrário).
      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        res.removeListener('drain', finish);
        res.removeListener('close', finish);
        res.removeListener('error', finish);
        resolve();
      }
      res.once('drain', finish);
      res.once('close', finish);
      res.once('error', finish);
    }));
    return writeChain;
  }

  // keepalive enquanto a run viver
  const keepAliveTimer = setInterval(() => { rawWrite(': keepalive\n\n'); }, KEEPALIVE_MS);

  // buffers de coalescing por bloco: block -> { buf, seq, timer }
  const pending = new Map();
  function getP(block) {
    let p = pending.get(block);
    if (!p) { p = { buf: '', seq: 0, timer: null }; pending.set(block, p); }
    return p;
  }
  function flush(block) {
    const p = pending.get(block);
    if (!p) return Promise.resolve();
    if (p.timer) { clearTimeout(p.timer); p.timer = null; }
    if (!p.buf) return Promise.resolve();
    const text = p.buf; p.buf = '';
    const seq = p.seq++;
    return rawWrite(frame('block_delta', { block, seq, text }));
  }

  // Acumula delta; flush por tamanho (aguardável, propaga backpressure) ou por timer.
  function delta(block, text) {
    if (!text) return Promise.resolve();
    const p = getP(block);
    p.buf += text;
    if (p.buf.length >= COALESCE_CHARS) return flush(block);
    if (!p.timer) p.timer = setTimeout(() => { p.timer = null; flush(block); }, COALESCE_MS);
    return Promise.resolve();
  }

  // Evento genérico (run_start, block_start, block_done, block_error, run_done, run_error...).
  function send(event, data) {
    return rawWrite(frame(event, data));
  }

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(keepAliveTimer);
    pending.forEach(p => { if (p.timer) { clearTimeout(p.timer); p.timer = null; } });
    writeChain.then(() => {
      try { if (!res.writableEnded) res.end(); } catch {}
    });
  }

  return { send, delta, flush, close };
}

module.exports = { openSSE };
