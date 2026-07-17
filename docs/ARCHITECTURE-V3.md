# MBZ::CH4TB0T NEXUS v3 — Arquitetura (contrato oficial)

Síntese das propostas Opus + Codex (2026-07-03). Este documento é o CONTRATO entre backend e frontend.
Qualquer desvio precisa ser refletido aqui.

## 0. Transporte

`fetch()` + `ReadableStream` lendo resposta SSE de um **POST**. Nunca EventSource (não envia
headers `x-access-pass`/`x-user-key`), nunca query params (vazaria API key nos logs do Railway).
Parser SSE no cliente: TextDecoder + buffer de linhas, frames separados por `\n\n`, campos
`event:` / `data:` (JSON compacto).

## 1. Endpoints

| Rota | Tipo | Função |
|---|---|---|
| `POST /api/run` | **SSE** | Único endpoint de geração. Body: `{ blocks: string[], params: {...}, model: string, artifacts?: {...} }`. Serve o funil completo, um bloco só (regeneração), e o otimizador (bloco sintético `optimize` com `params.optimize = { content, kind, context }`). |
| `GET /api/config` | JSON | Catálogos + `models: [{id, label}]` servido pelo backend (frontend não hardcoda mais modelos). |
| `POST /api/auth` | JSON | Login (mantém rate-limit 5/60s e timingSafeEqual da fase 2). |
| `GET/POST/DELETE /api/history` | JSON | Histórico (cap de 200 entradas no arquivo). |

Auth do `/api/run`: middleware valida `x-access-pass`/`x-user-key` **antes** de virar stream —
falha retorna `401`/`400` `application/json` normal. Só depois `Content-Type: text/event-stream`.

Headers de resposta SSE (anti-buffering Railway):
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```
Sem gzip nesta rota. `res.flushHeaders()` imediato + comentário `: connected` + `run_start`
antes de qualquer geração. Comentário `: keepalive` a cada 15s enquanto a run viver.

## 2. Eventos SSE

| event | payload | semântica |
|---|---|---|
| `run_start` | `{ runId, plan: [{block, deps}], ts }` | run aceita; plano topológico informado |
| `block_start` | `{ block, attempt }` | deps satisfeitas + slot de concorrência adquirido |
| `block_delta` | `{ block, seq, text }` | trecho de texto CRU do modelo — **preview efêmero, nunca parsear** |
| `block_done` | `{ block, json, raw, artifacts?, warnings?, usage? }` | texto completo → extractJSON → postprocess → validate. `json` é o objeto autoritativo; `warnings` = problemas de schema não-fatais; `artifacts` = dados derivados p/ dependentes e cache do cliente |
| `block_error` | `{ block, code, message, retryable, reason? }` | falha após retries internos. `reason:"dependency_failed"` para dependentes pulados. `code:"JSON_EXTRACT_FAILED"` quando o texto completo não rende JSON (retryable:true → usuário regenera) |
| `run_done` | `{ runId, status: "success"\|"partial"\|"failed", completed[], failed[], skipped[] }` | sempre o último evento de uma run que começou |
| `run_error` | `{ code, message }` | falha global fora do grafo (nunca junto com run_done) |

Blocos rodam em paralelo → `block_delta` de blocos diferentes se intercalam; cliente roteia pelo
campo `block`. `seq` é crescente por bloco (detecção de perda/ordem).

Desconexão: **sem auto-reconnect**. `res.close` → aborta chamadas Anthropic em voo
(AbortController compartilhado), scheduler não inicia novos blocos. Cliente marca cards em voo
como "interrompido" e oferece regenerar por card.

## 3. Orquestração (servidor)

Grafo (14 blocos + optimize):
```
grid          ← grid_preview        (artifact: gridDirection)
image_prompts ← onboard + sequence  (artifacts: onboardMenuMap/Count, seqMenuMap/Count — menuBreakdown roda no SERVIDOR)
audios        ← creatives_prompt    (artifact: creativesContext)
independentes: page_name, fb_images, comment, p1_titles, p2_titles, quiz, meta_copy, meta_onboard, optimize
```
Deps são **soft**: satisfeitas (nesta ordem) por (1) bloco da mesma run, (2) `artifacts` injetados
no body, (3) fallback derivado de params (comportamento v2). Regeneração de bloco único =
`POST /api/run` com `blocks:['grid']` + artifacts cacheados — sem endpoint dedicado.
Regenerar um bloco NÃO reexecuta dependentes; o cliente os marca como "desatualizado" com botão
de regenerar apontando a dependência.

Scheduler: pool topológico orientado a eventos (`pending → ready → running → done|failed|skipped`).
Semáforo `MAX_CONCURRENCY` (env, default 3). Falha marca dependentes transitivos como skipped.

maxTokens: 64000 uniforme em todos os blocos de geração (v3.2b: teto máximo seguro — qualidade sobre custo; Haiku 4.5 limita a 64K) e 8000 no review.

## 4. Módulos

```
server.js               # wiring Express, static, rotas, auth middleware — FINO
lib/claude.js           # streamMessage/createMessage: stream Anthropic, retry 429/5xx c/ retry-after,
                        # prompt caching (system como bloco com cache_control ephemeral), timeout AbortController
lib/blocks.js           # buildBlockPrompt(block, params) + BLOCK_META {maxTokens, deps, postprocess, kind} + grafo
lib/orchestrator.js     # scheduler + semáforo + cola com SSE
lib/sse.js              # openSSE(res), send(event,data) c/ backpressure (await drain), keepAlive, coalescing ~60ms
lib/postprocess/        # index.js dispatcher + onboard.js, sequence.js, quiz.js, grid.js + _util.js — FUNÇÕES PURAS (json, params) => json
lib/validate.js         # validateParams(params) + validateChatDrink(block, json) => {ok, errors} (errors viram warnings no block_done)
lib/history.js          # read/write atômico (tmp+rename), cap 200
prompts.js              # system prompt + catálogos (inalterado da fase 2)
public/                 # state.js, api.js, wizard.js, render.js, fx.js, main.js — ES modules, sem build
```

### lib/claude.js — API pública
```js
async function streamMessage({ apiKey, model, system, user, maxTokens, onDelta, signal, timeoutMs })
// => { text, usage, stopReason } — onDelta(chunk) é AGUARDÁVEL (backpressure)
async function createMessage({ apiKey, model, system, user, maxTokens, signal, timeoutMs })
// => { text, usage, stopReason }
```
- Caching: `system: [{ type:"text", text: SYSTEM_ESTÁTICO, cache_control:{type:"ephemeral"} }]`.
  Mínimo cacheável: 2048 tokens (Sonnet), 4096 (Opus/Haiku). Verificar via usage.cache_read_input_tokens.
- Stream Anthropic: `stream:true`; mapear `content_block_delta`/`text_delta` → onDelta; acumular text;
  `stop_reason`/`usage` do `message_delta`.
- Retry: SÓ 429/≥500, backoff exponencial honrando header `retry-after`; 4xx aborta na hora.

## 5. Frontend (contrato de responsabilidades)

- `api.js` — `runStream({blocks, params, model, artifacts}, handlers)` com fetch+ReadableStream;
  handlers por evento do §2.
- `state.js` — params, cache de artifacts (de todo block_done), resultados, modelo, rascunho do
  wizard persistido em localStorage, presets nomeados.
- `render.js` — cards: append de delta em text node (efeito digitação), REPLACE pelo payload
  pós-processado no block_done, warnings visíveis, botão regenerar por card, marcação "desatualizado".
- `wizard.js` — passos, validação, collectParams.
- CSS/visual: fase 5 — nesta fase manter classes/aparência atuais.

## 6. Riscos → mitigação

| risco | mitigação |
|---|---|
| Railway bufferiza SSE | headers do §1 + flushHeaders + primeiro byte imediato + keepalive 15s |
| Parse de JSON em texto parcial | proibido; parse só do buffer completo no block_done; falha → JSON_EXTRACT_FAILED retryable |
| Backpressure | coalescing ~60ms no servidor; `res.write()===false` → await 'drain'; onDelta aguardável propaga até o consumo do stream Anthropic |
| Tokens desperdiçados em disconnect | abort upstream em res.close; sem auto-reconnect |
| Falha parcial | isolamento pelo grafo; dependentes skipped; run_done relata; regen por card com artifacts |
