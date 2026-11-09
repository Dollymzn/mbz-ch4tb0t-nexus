// ============================================================
//  MBZ::CH4TB0T NEXUS v3 / v3.1 — orchestrator.js
//  Scheduler topológico orientado a eventos, com semáforo MAX_CONCURRENCY.
//  Deps soft: (1) bloco da mesma run, (2) artifacts do body, (3) fallback por params.
//  Falha => block_error; dependentes transitivos => skipped (reason:dependency_failed).
//
//  v3.1 (AGENT-V31): loop review+regen INLINE em runBlock, entre o fim da geração e
//  o block_done. Scheduler/semáforo/cascadeSkip INTACTOS — um bloco segura seu slot
//  durante todo review+regen (§3.2). runBlock = generateOnce + [review loop] +
//  finalizeSuccess | finalizeFailure.
// ============================================================
const crypto = require('crypto');
const { streamMessage, createMessage, DEFAULT_TIMEOUT_MS, DEFAULT_MODEL } = require('./claude');
const { buildBlockPrompt, BLOCK_META, CRITIC_SYSTEM, IMG_GUARD, BATCH_SPECS } = require('./blocks');
const { applyPostprocess } = require('./postprocess');
const { validateChatDrink } = require('./validate');
const { extractJSON } = require('./postprocess/_util');
const { resolveGridImages } = require('./photos');

// v4/v4.1: blocos gerados em lotes server-side (broadcast 50/lote, artigos P1/P2 2/lote) — ver BATCH_SPECS em blocks.js e generateBatched.

function maxConcurrency() {
  const n = parseInt(process.env.MAX_CONCURRENCY, 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// Blocos revisados por default quando agent.blocks == null (§1.1).
const DEFAULT_AGENT_BLOCKS = ['onboard', 'sequence', 'meta_copy', 'creatives_prompt'];
// Prioridade estática do modelo do crítico (§3.5): melhor primeiro.
const REVIEW_PRIORITY = ['opus', 'fable', 'sonnet', 'haiku'];

// Ranqueia o catálogo MODELS por prioridade estática (substring do id). Ancora no
// catálogo próprio do server — não hardcoda id externo.
function pickBest(models) {
  const list = Array.isArray(models) ? models : [];
  for (const key of REVIEW_PRIORITY) {
    const found = list.find(m => m && typeof m.id === 'string' && m.id.indexOf(key) >= 0);
    if (found) return found.id;
  }
  return (list[0] && list[0].id) || DEFAULT_MODEL;
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
 * @param {Object} opts { blocks, params, model, artifacts, agent, images, models, apiKey, system, sse, signal }
 */
function runOrchestration(opts) {
  const { blocks, params = {}, model, artifacts, agent, models, apiKey, system, sse, signal } = opts;
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

  // ---- Política do NEXUS Agent (§1.1/§3) ----
  const agentCfg = (agent && typeof agent === 'object' && !Array.isArray(agent)) ? agent : null;
  const agentOn = !!(agentCfg && agentCfg.enabled === true);
  function resolveReviewModel() {
    return (agentCfg && typeof agentCfg.reviewModel === 'string' && agentCfg.reviewModel) ||
      process.env.REVIEW_MODEL || pickBest(models) || model || DEFAULT_MODEL;
  }
  // Interseção agent.blocks ∩ presença + budget/gate resolvidos.
  function agentPolicyFor(b) {
    if (!agentOn) return { review: false };
    const agentBlocks = Array.isArray(agentCfg.blocks) ? agentCfg.blocks : DEFAULT_AGENT_BLOCKS;
    const review = runBlocks.indexOf(b) >= 0 && agentBlocks.indexOf(b) >= 0;
    const maxIterations = (Number.isInteger(agentCfg.maxIterations) && agentCfg.maxIterations >= 0) ? agentCfg.maxIterations : 1;
    const minScore = (typeof agentCfg.minScore === 'number') ? agentCfg.minScore : 7;
    return { review, maxIterations, minScore, reviewModel: resolveReviewModel() };
  }

  // Echo da política efetiva pro run_start (só quando ligada). blocks = interseção com a run.
  let agentEcho = null;
  if (agentOn) {
    const p0 = agentPolicyFor(runBlocks[0] || '');
    const agentBlocks = Array.isArray(agentCfg.blocks) ? agentCfg.blocks : DEFAULT_AGENT_BLOCKS;
    agentEcho = {
      enabled: true,
      maxIterations: p0.maxIterations,
      minScore: p0.minScore,
      reviewModel: p0.reviewModel,
      blocks: agentBlocks.filter(x => runBlocks.indexOf(x) >= 0)
    };
  }

  // Acumulador de custo/uso da run (§1.3). Só emitido em run_done quando o agente está ligado.
  const runUsage = { input: 0, output: 0, cacheRead: 0, byBlock: {} };
  function bucket(b) {
    if (!runUsage.byBlock[b]) {
      runUsage.byBlock[b] = { gen: { input: 0, output: 0, cacheRead: 0 }, review: { input: 0, output: 0, cacheRead: 0 } };
    }
    return runUsage.byBlock[b];
  }
  function addUsage(b, kind, usage) {
    if (!usage) return;
    const inp = usage.input_tokens || 0;
    const out = usage.output_tokens || 0;
    const cr = usage.cache_read_input_tokens || 0;
    const slot = bucket(b)[kind];
    slot.input += inp; slot.output += out; slot.cacheRead += cr;
    runUsage.input += inp; runUsage.output += out; runUsage.cacheRead += cr;
  }

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
      const payload = { runId, status, completed, failed, skipped };
      if (agentOn) payload.usage = runUsage; // opcional (§1.3); omitido => run_done v3 idêntico
      await sse.send('run_done', payload);
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

    // Params "originais" enxutos pro crítico: sem feedback e sem base64 (troca images por contagem).
    function paramsForReview() {
      const clone = Object.assign({}, params);
      delete clone._agentFeedback; delete clone._previousJson;
      Object.keys(clone).forEach(k => {
        const val = clone[k];
        if (val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.images)) {
          clone[k] = Object.assign({}, val, { images: `[${val.images.length} imagem(ns)]` });
        }
      });
      if (Array.isArray(clone.images)) clone.images = `[${clone.images.length} imagem(ns)]`;
      return clone;
    }

    // ---- v4/v4.1: GERAÇÃO EM LOTES server-side (BATCH_SPECS: broadcast, p1_posts,
    //      p2_posts). Mesmo contrato do generateOnce (block_start + deltas + flush,
    //      retorna {ok,...}), mas N chamadas ao modelo com batchIndex/batchFrom/batchTo,
    //      merge dos lotes, postprocess do bloco e artifacts. Um lote falho vira
    //      warning — os lotes bons são preservados. Regen do card re-roda tudo. ----
    async function generateBatched(b, attempt, effParams, spec) {
      const meta = BLOCK_META[b] || {};
      const total = spec.total(effParams);
      const size = Math.max(1, spec.size);
      const nBatches = Math.ceil(total / size);
      await sse.send('block_start', { block: b, attempt });
      const all = [];
      const warnings = [];
      const usageSum = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
      for (let i = 1; i <= nBatches; i++) {
        if (signal && signal.aborted) break;
        const from = (i - 1) * size + 1;
        const to = Math.min(total, i * size);
        const bp = Object.assign({}, effParams, { batchIndex: i, batchTotal: nBatches, batchSize: to - from + 1, batchFrom: from, batchTo: to });
        await sse.delta(b, `\n\n/* ===== LOTE ${i}/${nBatches} — ${spec.label} ${from}-${to} de ${total} ===== */\n`);
        await sse.send('block_progress', { block: b, done: i - 1, total: nBatches, label: `lote ${i}/${nBatches}` });
        let text, usage, stopReason;
        try {
          ({ text, usage, stopReason } = await streamMessage({
            apiKey, model, system, user: buildBlockPrompt(b, bp),
            maxTokens: meta.maxTokens || 64000,
            onDelta: (t) => sse.delta(b, t),
            signal, timeoutMs: DEFAULT_TIMEOUT_MS
          }));
        } catch (e) {
          if (e && e.name === 'AbortError') throw e; // disconnect/timeout propaga (§3.3)
          warnings.push(`lote ${i}/${nBatches} falhou (${(e && e.message) || 'erro'}) — lotes anteriores preservados`);
          continue;
        }
        if (usage) {
          usageSum.input_tokens += usage.input_tokens || 0;
          usageSum.output_tokens += usage.output_tokens || 0;
          usageSum.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
        }
        if (stopReason === 'max_tokens') {
          warnings.push(`lote ${i}/${nBatches} truncado (max_tokens) — lote descartado`);
          continue;
        }
        const json = extractJSON(text);
        const list = spec.pick(json);
        if (!list || !list.length) {
          warnings.push(`lote ${i}/${nBatches} sem JSON válido — lote descartado`);
          continue;
        }
        all.push(...list);
      }
      await sse.flush(b);
      await sse.send('block_progress', { block: b, done: nBatches, total: nBatches, label: 'montando' });
      if (!all.length) {
        return { ok: false, code: 'JSON_EXTRACT_FAILED', retryable: true, usage: usageSum,
          message: `Nenhum lote de ${spec.label} retornou JSON válido.` };
      }
      let finalJson = spec.wrap(all);
      if (meta.postprocess) finalJson = applyPostprocess(meta.postprocess, finalJson, effParams);
      const got = Array.isArray(finalJson) ? finalJson.length : (finalJson && Array.isArray(finalJson.posts) ? finalJson.posts.length : all.length);
      if (got < total) warnings.push(`gerados ${got}/${total} ${spec.label}`);
      let producedArtifacts;
      if (finalJson && typeof meta.artifacts === 'function') producedArtifacts = meta.artifacts(finalJson);
      const raw = JSON.stringify(finalJson, null, 2);
      return { ok: true, finalJson, text: raw, raw, warnings: warnings.length ? warnings : undefined, producedArtifacts, usage: usageSum };
    }

    // ---- geração de UMA tentativa: block_start + deltas + flush + postprocess +
    //      validate. SEM block_done / state=done / pump / running-- (§3.3). ----
    async function generateOnce(b, attempt, effParams) {
      if (BATCH_SPECS[b]) return generateBatched(b, attempt, effParams, BATCH_SPECS[b]);
      const meta = BLOCK_META[b] || {};
      await sse.send('block_start', { block: b, attempt });
      const promptText = buildBlockPrompt(b, effParams);
      const maxTokens = meta.maxTokens || 64000;

      // Montagem multimodal (§2.2): IMG_GUARD (texto) + imagens + promptText (DEPOIS das imagens).
      const imgs = (meta.hasImages && effParams[b] && Array.isArray(effParams[b].images)) ? effParams[b].images : [];
      const user = imgs.length
        ? [{ type: 'text', text: IMG_GUARD },
           ...imgs.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
           { type: 'text', text: promptText }]
        : promptText;

      const { text, usage, stopReason } = await streamMessage({
        apiKey, model, system, user, maxTokens,
        onDelta: (t) => sse.delta(b, t),
        signal, timeoutMs: DEFAULT_TIMEOUT_MS
      });
      await sse.flush(b); // garante todos os deltas antes de qualquer evento subsequente

      if (stopReason === 'max_tokens') {
        // texto truncado: mesmo que saia JSON parseável, pode estar incompleto → falha (caminho v3).
        return { ok: false, code: 'MAX_TOKENS', retryable: true, usage,
          message: 'Resposta truncada: o modelo atingiu o limite de tokens (max_tokens) antes de terminar.' };
      }

      const json = extractJSON(text);
      const needJson = typeof meta.requireJson === 'function' ? meta.requireJson(effParams) : true;
      if (!json && needJson) {
        return { ok: false, code: 'JSON_EXTRACT_FAILED', retryable: true, usage,
          message: 'Não foi possível extrair JSON válido do texto completo.' };
      }

      // postprocess determinístico (funções puras)
      let finalJson = json;
      if (json && meta.postprocess) finalJson = applyPostprocess(meta.postprocess, json, effParams);
      // v4: otimizador de broadcasts passa pelo mesmo fixBroadcasts (sem emoji, URL exata, dedup)
      if (json && b === 'optimize' && String(((effParams.optimize || {}).kind) || '').toLowerCase() === 'broadcast') {
        finalJson = applyPostprocess('broadcast', json, effParams);
      }

      // v4: grid — resolve as fotos reais (Pexels→Pixabay→Unsplash) DEPOIS do
      // postprocess (o dispatcher MAP é síncrono; esta etapa é async). Nunca fatal.
      if (finalJson && b === 'grid') {
        try { finalJson = await resolveGridImages(finalJson); } catch (e) { /* grid segue sem fotos */ }
      }

      // validação de schema (não-fatal => warnings)
      let warnings;
      const v = validateChatDrink(b, finalJson);
      if (v && !v.ok && v.errors.length) warnings = v.errors;

      // artifacts derivados (aplicados só na versão vencedora, em finalizeSuccess)
      let producedArtifacts;
      if (finalJson && typeof meta.artifacts === 'function') producedArtifacts = meta.artifacts(finalJson);

      const raw = finalJson ? JSON.stringify(finalJson, null, 2) : text;
      return { ok: true, finalJson, text, raw, warnings, producedArtifacts, usage };
    }

    // ---- crítico (§3.4): createMessage (não-stream) no reviewModel, system genérico
    //      + user (rubrica+alvo). Engole SÓ erros comuns → null (=> action:skipped).
    //      RE-LANÇA AbortError (disconnect/timeout). ----
    async function safeReview(b, finalJson, policy, previousReview) {
      const user = buildBlockPrompt('review', { review: { target: b, json: finalJson, params: paramsForReview(), previousReview: previousReview || undefined } });
      try {
        const { text, usage, stopReason } = await createMessage({
          apiKey, model: policy.reviewModel, system: CRITIC_SYSTEM, user,
          maxTokens: (BLOCK_META.review && BLOCK_META.review.maxTokens) || 1500,
          signal, timeoutMs: DEFAULT_TIMEOUT_MS
        });
        if (stopReason === 'max_tokens') return null; // veredito truncado → skipped
        const parsed = extractJSON(text);
        if (!parsed || typeof parsed !== 'object') return null;
        let score = Number(parsed.score);
        if (!Number.isFinite(score)) return null;
        score = Math.max(0, Math.min(10, score));
        return {
          score,
          veredito: parsed.veredito || (score >= 7 ? 'aprovar' : 'revisar'),
          problemas: Array.isArray(parsed.problemas) ? parsed.problemas : [],
          sugestoes: Array.isArray(parsed.sugestoes) ? parsed.sugestoes : [],
          checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
          resolvidos: Array.isArray(parsed.resolvidos) ? parsed.resolvidos : [],
          pendentes: Array.isArray(parsed.pendentes) ? parsed.pendentes : [],
          direcao_de_correcao: parsed.direcao_de_correcao || '',
          _usage: usage || null
        };
      } catch (e) {
        if (e && e.name === 'AbortError') throw e; // propaga disconnect/timeout (§3.4)
        return null; // rede / 4xx-5xx pós-retry / JSON não extraível → skipped
      }
    }

    // artifacts da versão vencedora + block_done{attempt?,agentCost?} + state=done + pump.
    async function finalizeSuccess(b, gen, attempt, policy, agentCost) {
      if (gen.producedArtifacts) Object.assign(runArtifacts, gen.producedArtifacts);
      running--;
      state[b] = 'done';
      completed.push(b);
      const payload = {
        block: b, json: gen.finalJson, raw: gen.raw,
        artifacts: gen.producedArtifacts, warnings: gen.warnings, usage: gen.usage
      };
      // Só blocos sob o agente ganham attempt/agentCost → sem agente, block_done = v3 idêntico.
      if (policy.review) { payload.attempt = attempt; payload.agentCost = agentCost; }
      await sse.send('block_done', payload);
      pump();
    }

    // block_error + cascadeSkip + pump (ou finish silencioso em disconnect).
    async function finalizeFailure(b, res) {
      running--;
      state[b] = 'failed';
      failed.push(b);
      const thrown = res && res.thrown;
      if (thrown && signal && signal.aborted) {
        // disconnect: não spamma block_error; cliente já marca "interrompido".
        await finishIfDone();
        return;
      }
      await sse.send('block_error', {
        block: b,
        code: res.code || 'UPSTREAM_ERROR',
        message: res.message || (thrown && thrown.message) || 'Erro na geração do bloco.',
        retryable: res.retryable != null ? res.retryable : true
      });
      cascadeSkip();
      pump();
    }

    async function runBlock(b) {
      const policy = agentPolicyFor(b);
      const agentCost = { reviews: 0, regens: 0, reviewInputTokens: 0, reviewOutputTokens: 0 };
      let attempt = 1;
      let effParams = effectiveParams();
      let previousReview = null;
      let gen;
      try {
        gen = await generateOnce(b, attempt, effParams);
        addUsage(b, 'gen', gen.usage);
        if (!gen.ok) return await finalizeFailure(b, gen);

        // Loop review+regen inline (§3.3). maxIterations = nº máx de REGENERAÇÕES
        // (§1.1/§1.4): cada regen precedida de 1 review; a última versão não é revista.
        if (policy.review && gen.finalJson) {
          for (let r = 1; r <= policy.maxIterations; r++) {
            if (signal && signal.aborted) break;
            await sse.send('agent_reviewing', { block: b, attempt });
            const review = await safeReview(b, gen.finalJson, policy, previousReview);
            if (review == null) {
              await sse.send('agent_review', { block: b, attempt, action: 'skipped' });
              break; // review degradou → aceita a geração atual
            }
            agentCost.reviews++;
            addUsage(b, 'review', review._usage);
            agentCost.reviewInputTokens += (review._usage && review._usage.input_tokens) || 0;
            agentCost.reviewOutputTokens += (review._usage && review._usage.output_tokens) || 0;
            const approved = review.score >= policy.minScore;
            await sse.send('agent_review', {
              block: b, attempt,
              score: review.score, veredito: review.veredito,
              problemas: review.problemas, sugestoes: review.sugestoes,
              checklist: review.checklist, resolvidos: review.resolvidos, pendentes: review.pendentes,
              direcao_de_correcao: review.direcao_de_correcao,
              action: approved ? 'accept' : 'regenerate',
              usage: review._usage, reviewModel: policy.reviewModel
            });
            if (approved) break;
            // reprovado e ainda há budget de regen → gera nova versão com feedback
            attempt++;
            agentCost.regens++;
            // v4.1.1: regen = EDIÇÃO da versão atual (preserva o que estava bom) e o crítico seguinte
            //         recebe a revisão anterior pra checar convergência em vez de mover a trave.
            effParams = Object.assign({}, effParams, { _agentFeedback: review, _previousJson: gen.finalJson });
            previousReview = review;
            gen = await generateOnce(b, attempt, effParams);
            addUsage(b, 'gen', gen.usage);
            if (!gen.ok) return await finalizeFailure(b, gen);
          }
        }
      } catch (e) {
        return await finalizeFailure(b, { thrown: e });
      }

      // Não finaliza após disconnect (§3.3): encerra o bloco sem block_done nem block_error.
      if (signal && signal.aborted) {
        running--;
        if (state[b] === 'running') { state[b] = 'skipped'; skipped.push(b); }
        await finishIfDone();
        return;
      }
      await finalizeSuccess(b, gen, attempt, policy, policy.review ? agentCost : undefined);
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

    const runStartPayload = { runId, plan, ts: Date.now() };
    if (agentEcho) runStartPayload.agent = agentEcho; // echo só quando ligado (§1.3)
    await sse.send('run_start', runStartPayload);
    pump();
  });
}

module.exports = { runOrchestration, pickBest };
