// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — api.js
//  Cliente HTTP: SSE via fetch+ReadableStream (POST /api/run) +
//  chamadas JSON simples (config/auth/history).
//  Contrato: docs/ARCHITECTURE-V3.md §0, §1, §2.
// ============================================================
'use strict';

import { state } from './state.js';

/* ---------- headers de auth ---------- */
export function authHeaders() {
  const h = { 'content-type': 'application/json' };
  if (state.cfg && state.cfg.needPassword) h['x-access-pass'] = state.accessPass || '';
  if (state.cfg && !state.cfg.serverKey && state.userKey) h['x-user-key'] = state.userKey;
  return h;
}

/* ---------- endpoints JSON ---------- */
export function getConfig() {
  return fetch('/api/config').then(function (r) { return r.json(); });
}
export function auth(password) {
  return fetch('/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: password })
  }).then(function (r) { return r.json(); });
}
export function getHistory() {
  return fetch('/api/history', { headers: authHeaders() }).then(function (r) { return r.json(); });
}
export function saveHistory(entry) {
  return fetch('/api/history', {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(entry)
  }).then(function (r) { return r.json(); });
}
export function deleteHistory(id) {
  return fetch('/api/history/' + encodeURIComponent(id), {
    method: 'DELETE', headers: authHeaders()
  }).then(function (r) { return r.json(); });
}

/* ============================================================
   SSE — POST /api/run
   handlers: onRunStart, onBlockStart, onBlockDelta, onBlockDone,
             onBlockError, onRunDone, onRunError, onAbort, onStreamEnd
   Retorna um AbortController (chame .abort() para cancelar).
   ============================================================ */
const EVENT_MAP = {
  run_start:   'onRunStart',
  block_start: 'onBlockStart',
  block_delta: 'onBlockDelta',
  block_done:  'onBlockDone',
  block_error: 'onBlockError',
  run_done:    'onRunDone',
  run_error:   'onRunError'
};

export function runStream(payload, handlers) {
  const controller = new AbortController();
  const body = JSON.stringify({
    blocks: payload.blocks,
    params: payload.params || {},
    model: payload.model || state.model,
    artifacts: (payload.artifacts && Object.keys(payload.artifacts).length) ? payload.artifacts : undefined
  });

  fetch('/api/run', {
    method: 'POST',
    headers: authHeaders(),
    body: body,
    signal: controller.signal
  }).then(function (res) {
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // auth/validação falham ANTES do stream => 401/400 JSON normal
    if (!res.ok || ct.indexOf('text/event-stream') < 0) {
      return res.text().then(function (txt) {
        let msg = 'Erro HTTP ' + res.status;
        try { const j = JSON.parse(txt); msg = j.error || j.message || msg; } catch (e) {}
        emit(handlers, 'onRunError', { code: 'HTTP_' + res.status, message: msg });
      });
    }
    return consume(res.body, handlers, controller);
  }).catch(function (e) {
    if (controller.signal.aborted) { emit(handlers, 'onAbort', {}); return; }
    emit(handlers, 'onRunError', { code: 'FETCH_FAILED', message: (e && e.message) || 'falha de rede' });
  });

  return controller;
}

// lê o corpo, quebra em frames (\n\n) e despacha; tolera fragmentação de chunk
function consume(bodyStream, handlers, controller) {
  const reader = bodyStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  function pump() {
    return reader.read().then(function (r) {
      if (r.done) {
        buffer += decoder.decode();
        flushFrames(true);
        emit(handlers, 'onStreamEnd', {});
        return;
      }
      buffer += decoder.decode(r.value, { stream: true });
      flushFrames(false);
      return pump();
    }).catch(function (e) {
      if (controller.signal.aborted) { emit(handlers, 'onAbort', {}); return; }
      // queda de conexão no meio do stream
      emit(handlers, 'onRunError', { code: 'STREAM_DROP', message: (e && e.message) || 'conexão interrompida' });
      emit(handlers, 'onStreamEnd', {});
    });
  }

  function flushFrames(isEnd) {
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      dispatchFrame(frame, handlers);
    }
    if (isEnd && buffer.trim()) { dispatchFrame(buffer, handlers); buffer = ''; }
  }

  return pump();
}

// interpreta um frame SSE: linhas event:/data:, ignora comentários ':'
function dispatchFrame(frame, handlers) {
  let event = 'message';
  const dataLines = [];
  const lines = frame.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.charAt(0) === ':') continue; // comentário (ex.: ": keepalive")
    const c = line.indexOf(':');
    let field, val;
    if (c < 0) { field = line; val = ''; }
    else { field = line.slice(0, c); val = line.slice(c + 1); if (val.charAt(0) === ' ') val = val.slice(1); }
    if (field === 'event') event = val;
    else if (field === 'data') dataLines.push(val);
  }
  if (!dataLines.length) return;
  const dataStr = dataLines.join('\n');
  let data = null;
  if (dataStr) { try { data = JSON.parse(dataStr); } catch (e) { data = { _raw: dataStr }; } }
  const fn = EVENT_MAP[event];
  if (fn) emit(handlers, fn, data || {});
}

function emit(handlers, name, data) {
  const fn = handlers && handlers[name];
  if (typeof fn === 'function') { try { fn(data); } catch (e) { /* handler nunca derruba o stream */ console.error(e); } }
}
