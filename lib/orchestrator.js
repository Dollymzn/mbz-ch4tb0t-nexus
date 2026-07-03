// ============================================================
//  MBZ::CH4TB0T NEXUS v3 — orchestrator.js
//  Scheduler topológico orientado a eventos, com semáforo MAX_CONCURRENCY.
//  Deps soft: (1) bloco da mesma run, (2) artifacts do body, (3) fallback por params.
//  Falha => block_error; dependentes transitivos => skipped (reason:dependency_failed).
// ============================================================
const crypto = require('crypto');
const { streamMessage, DEFAULT_TIMEOUT_MS } = require('./claude');
const { buildBlockPrompt, BLOCK_META } = require('./blocks');
const { applyPostprocess } = require('./postprocess');
const { validateChatDrink } = require('./validate');
const { extractJSON } = require('./postprocess/_util');

function maxConcurrency() {
  const n = parseInt(process.env.MAX_CONCURRENCY, 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// Ordena topologicamente (DFS): deps vêm antes dos dependentes.
function topoSort(nodes, depMap) {
  const result = [];
  const visited = {};
  const temp = {};
  function visit(n) {
    if (visited[n]) return;
    if (temp[n]) return; // guarda contra ciclo (o grafo não tem)
    temp[n] = true;
    (depMap[n] || []).forEach(visit);
    temp[n] = false;
    visited[n] = true;
    result.push(n);
  }
  nodes.forEach(visit);
  return result;
}

/**
 * Executa a run e cola no SSE. Resolve quando run_done (ou fim por disconnect) é emitido.
 * @param {Object} opts { blocks, params, model, artifacts, apiKey, system, sse, signal }
 */
function runOrchestration(opts) {
  const { blocks, params = {}, model, artifacts, apiKey, system, sse, signal } = opts;
  const runId = crypto.randomUUID();
  const runBlocks = blocks.slice();

  // deps efetivas desta run = deps declaradas ∩ blocos presentes (soft deps).
  const inRunDeps = {};
  runBlocks.forEach(b => {
    const meta = BLOCK_META[b] || {};
    inRunDeps[b] = (meta.deps || []).filter(d => runBlocks.indexOf(d) >= 0);
  });

  const plan = topoSort(runBlocks, inRunDeps).map(b => ({ block: b, deps: inRunDeps[b] }));

  const bodyArtifacts = (artifacts && typeof artifacts === 'object') ? artifacts : {};
  const runArtifacts = {}; // produzidos por blocos desta run (prioridade máxima)

  const MAX = maxConcurrency();

  const state = {}; // pending | running | done | failed | skipped
  runBlocks.forEach(b => { state[b] = 'pending'; });
  const completed = [], failed = [], skipped = [];
  let running = 0;

  return new Promise(async (resolve) => {
    let settled = false;
    let finishing = false; // guarda SÍNCRONA: impede run_done duplicado por chamadas concorrentes
    function done() { if (!settled) { settled = true; resolve(); } }

    function anyActive() {
      return runBlocks.some(b => state[b] === 'pending' || state[b] === 'running');
    }

    async function finishIfDone() {
      if (settled || finishing || anyActive()) return;
      finishing = true;
      const status = (failed.length === 0 && skipped.length === 0) ? 'success'
        : (completed.length > 0 ? 'partial' : 'failed');
      await sse.send('run_done', { runId, status, completed, failed, skipped });
      done();
    }

    // Marca dependentes transitivos de um bloco falho/pulado como skipped.
    function cascadeSkip() {
      let changed = true;
      while (changed) {
        changed = false;
        runBlocks.forEach(b => {
          if (state[b] !== 'pending') return;
          const deps = inRunDeps[b];
          const broken = deps.filter(d => state[d] === 'failed' || state[d] === 'skipped');
          if (broken.length) {
            state[b] = 'skipped';
            skipped.push(b);
            sse.send('block_error', {
              block: b,
              code: 'DEPENDENCY_FAILED',
              message: 'Dependência falhou: ' + broken.join(', '),
              retryable: false,
              reason: 'dependency_failed'
            });
            changed = true;
          }
        });
      }
    }

    function effectiveParams() {
      // prioridade: runArtifacts > bodyArtifacts > params (fallback v2 dentro do buildBlockPrompt)
      return Object.assign({}, params, bodyArtifacts, runArtifacts);
    }

    async function runBlock(b) {
      const meta = BLOCK_META[b] || {};
      const effParams = effectiveParams();
      try {
        await sse.send('block_start', { block: b, attempt: 1 });
        const user = buildBlockPrompt(b, effParams);
        const maxTokens = meta.maxTokens || 7000;

        const { text, usage, stopReason } = await streamMessage({
          apiKey,
          model,
          system,
          user,
          maxTokens,
          onDelta: (t) => sse.delta(b, t),
          signal,
          timeoutMs: DEFAULT_TIMEOUT_MS
        });
        await sse.flush(b); // garante todos os deltas antes do done

        if (stopReason === 'max_tokens') {
          // texto truncado: mesmo que saia um JSON parseável dele, pode estar
          // incompleto — trata como falha ANTES de tentar extrair o JSON.
          running--;
          state[b] = 'failed';
          failed.push(b);
          await sse.send('block_error', {
            block: b,
            code: 'MAX_TOKENS',
            message: 'Resposta truncada: o modelo atingiu o limite de tokens (max_tokens) antes de terminar.',
            retryable: true
          });
          cascadeSkip();
          pump();
          return;
        }

        const json = extractJSON(text);
        const needJson = typeof meta.requireJson === 'function' ? meta.requireJson(effParams) : true;

        if (!json && needJson) {
          running--;
          state[b] = 'failed';
          failed.push(b);
          await sse.send('block_error', {
            block: b,
            code: 'JSON_EXTRACT_FAILED',
            message: 'Não foi possível extrair JSON válido do texto completo.',
            retryable: true
          });
          cascadeSkip();
          pump();
          return;
        }

        // postprocess determinístico (funções puras)
        let finalJson = json;
        if (json && meta.postprocess) finalJson = applyPostprocess(meta.postprocess, json, effParams);

        // validação de schema (não-fatal => warnings)
        let warnings;
        const v = validateChatDrink(b, finalJson);
        if (v && !v.ok && v.errors.length) warnings = v.errors;

        // produção de artifacts pros dependentes / cache do cliente
        let producedArtifacts;
        if (finalJson && typeof meta.artifacts === 'function') {
          producedArtifacts = meta.artifacts(finalJson);
          Object.assign(runArtifacts, producedArtifacts);
        }

        running--;
        state[b] = 'done';
        completed.push(b);
        const raw = finalJson ? JSON.stringify(finalJson, null, 2) : text;
        await sse.send('block_done', {
          block: b,
          json: finalJson,
          raw,
          artifacts: producedArtifacts,
          warnings,
          usage
        });
        pump();
      } catch (e) {
        running--;
        state[b] = 'failed';
        failed.push(b);
        if (signal && signal.aborted) {
          // disconnect/timeout: não spamma block_error; cliente já marca "interrompido".
          await finishIfDone();
          return;
        }
        await sse.send('block_error', {
          block: b,
          code: 'UPSTREAM_ERROR',
          message: (e && e.message) || 'Erro na geração do bloco.',
          retryable: true
        });
        cascadeSkip();
        pump();
      }
    }

    function pump() {
      if (settled) return;
      if (signal && signal.aborted) {
        // não inicia novos blocos; marca pendentes como skipped (sem evento) e encerra.
        runBlocks.forEach(b => {
          if (state[b] === 'pending') { state[b] = 'skipped'; skipped.push(b); }
        });
        finishIfDone();
        return;
      }
      for (let i = 0; i < runBlocks.length; i++) {
        if (running >= MAX) break;
        const b = runBlocks[i];
        if (state[b] !== 'pending') continue;
        const deps = inRunDeps[b];
        if (deps.some(d => state[d] !== 'done')) continue; // aguarda deps (skip tratado no cascade)
        state[b] = 'running';
        running++;
        runBlock(b); // async, não aguarda aqui (semáforo controla)
      }
      finishIfDone();
    }

    // aborta => reavalia (marca pendentes como skipped, deixa in-flight terminar)
    if (signal) signal.addEventListener('abort', () => pump(), { once: true });

    await sse.send('run_start', { runId, plan, ts: Date.now() });
    pump();
  });
}

module.exports = { runOrchestration };
