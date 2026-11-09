# MBZ::CH4TB0T NEXUS — v4.0 (lançamento)

Base: arquitetura v3.2b (SSE + orquestrador topológico + NEXUS Agent + identidade visual)
+ todo o conteúdo operacional de nov/2026 + CSS Cyberpunk Overdrive.

## 1. Modelos (Claude 5.5)
- Catálogo (`server.js MODELS`): `claude-sonnet-5-5` (recomendado), `claude-opus-5-5`,
  `claude-fable-5-1`, `claude-haiku-5-5`.
- `lib/claude.js DEFAULT_MODEL = claude-sonnet-5-5`.
- Crítico (`REVIEW_PRIORITY`): opus → fable → sonnet → haiku (override: env `REVIEW_MODEL`).

## 2. Broadcast em massa (bloco novo `broadcast`)
- UI: toggle 📣 no passo 4 — quantidade 100–500 (default 250, passo 50) + URL de imagem opcional.
- Grafo: `BLOCK_META.broadcast` (kind json-download, postprocess `broadcast`, sem deps).
- **Lotes server-side** (`orchestrator.generateBroadcastBatched`): `ceil(n/50)` chamadas ao modelo,
  cada uma com `batchIndex/batchTotal/batchSize`; o prompt usa POOLS estruturais rotacionados por
  lote (substantivos/verbos/fechamentos distintos + sufixo de série `_b<i>_<n>` nos names) pra
  garantir unicidade entre lotes. Deltas SSE contínuos com separador `/* ===== LOTE i/N ===== */`.
- Lote falho (rede/JSON/max_tokens) vira *warning* e os lotes bons são preservados; a run só falha
  se NENHUM lote retornar JSON.
- Pós-processamento (`lib/postprocess/broadcast.js — fixBroadcasts`): dedup GLOBAL de names e
  bodies, strip de emoji (+espaços antes de \n), `{{first_name}}` sem colchetes e garantido no
  início, header MAIÚSCULO com SECRET→MESSAGE, botão `{type:"url", text:MAIÚSCULO, url:BROAD_URL}`,
  `category:"UTILITY"`, `image_url` do parâmetro.
- `BROAD_URL = {{URL_REDIR}}?utm_source=broadutility&utm_campaign={{CAMPAIGN_BROAD}}&utm_medium={{NOMEDAPAGINA}}`.
- Render: card com contagem + amostra dos 6 primeiros + JSON de importação recolhível; download
  `broadcasts-<nicho>.json` (também no "Baixar todos").
- Otimizador aceita kind `broadcast`.
- O NEXUS Agent NÃO revisa broadcast (fora de DEFAULT_AGENT_BLOCKS — 250 itens no crítico custaria caro).

## 3. Quiz Overlay → Direct Offerwall (padrão)
- UI: seletor "Formato do Quiz Overlay" no passo 3 (`quizFormat`: `offerwall` default | `classic`).
- Prompt: branch no case `quiz` — anatomia de conversão (title gancho de descoberta, body 2-3
  frases, eyebrow/highlight/meta_text/CTA Title Case), 4 modos (`instant_reward`, `priority_signal`,
  `secure_access`, `critical_pulse`), 20 paletas. Anti-`{{...}}` em AMBOS os formatos.
- Assembler (`lib/postprocess/quiz.js — assembleOfferwalls`): schema v2 / plugin 4.8.2 —
  `experience_type:"direct_offerwall"`, `require_rewarded_fill:true`, `rewarded_wait_ms:8000`,
  `rewarded_max_wait_ms:30000`, `offerwall_provider:"triad_v1"`, timer 300s, SEM `offerwall_note`,
  `offerwall_destination_url:""`. stripChatbotVars aplicado. Clássico 4.1.0 preservado
  (trivia_correct_index validado, finalCtaUrl).

## 4. Grid MIRB ago/2026 + fotos reais
- Prompt: cada item com `pexels_search` (termo EN fotografável), `image_prompt` (1:1, paleta do
  grid, "no text") e `item_link` (busca Pinterest). `item_image` sai vazio do modelo.
- `lib/photos.js — resolveGridImages`: cascata PEXELS_API_KEY → PIXABAY_API_KEY →
  UNSPLASH_ACCESS_KEY; roda no orchestrator DEPOIS do postprocess (dispatcher é síncrono, resolução
  é async); marca `_pexels: missing_key | no_results | resolved:<providers>` pro front avisar.
- `postprocess/grid.js`: CSS de legibilidade agora inclui `.mirb-grid-item img` (180px, cover) e
  `text-decoration:none` em tudo; preenche `item_link` com busca Pinterest quando o modelo não manda.
- Render: thumbnail da foto resolvida (zoom no hover), busca copiável, prompt 1:1 copiável, aviso
  do estado do resolvedor.

## 5. Áudios ElevenLabs v4
- Tags de emoção LIVRES no idioma do áudio (exemplos pt/en no prompt), 2-4 por script modulando a
  emoção, tag SEMPRE antes do trecho (nunca no fim), 250+ chars, CAPS nas ênfases.
- `stability` sugerida por nicho: HOT 0.24-0.28 · dating 0.30-0.36 · cristão/carta 0.36-0.40 ·
  místico 0.40-0.45 · utility 0.50. Render mostra voz + stability.
- CTA falado espelha o texto EXATO do botão do criativo correspondente (via creativesContext).

## 6. Vídeos Veo 3.1
- `videoRatio` 9:16 | 16:9 (UI no passo 4); tail do prompt:
  `", <ratio> <orient> composition, 8 seconds, cinematic quality, no on-screen text, no subtitles, no captions, no watermark"`.
- Áudio nativo do Veo 3.1 (ambiente/sfx + fala ≤20 palavras no idioma da campanha).
- NO ON-SCREEN TEXT (texto entra depois no Atelier/Frame IA); CTA como ação/fala no beat final.
- Estilos (mesma tríade dos criativos): persona / alt (V_ALT_STYLES) / misto, campo `style` por vídeo.
- Mantido da v3.2: beats hook/body/cta, diálogo condensado do audiosContext, rubrica do crítico.

## 7. Identidade visual dos criativos (`creativeStyle`)
- UI: 3 cards no passo 4 — 👤 persona (default) | 🎨 alt (sem persona) | ⚡ misto A/B.
- `alt`: ALT_STYLES (pixel art cartoon, clay 3D, flat vetorial, anime retro, papercraft, neon glow,
  doodle, macro do objeto, low poly, colagem vintage) focados no OBJETO do nicho; identidade da
  persona NÃO é injetada (nem gerada automaticamente na forja quando só criativos/vídeos pedem).
- Regras multi-GEO em todo criativo: nunca citar país/moeda/região; headline 3-6 palavras SEMPRE
  branca (#FFFFFF); pegada sensual/secreta/misteriosa quando o nicho permite; paletas variadas.
- Campo `style` declarado por criativo no JSON.

## 8. CSS Cyberpunk Overdrive (bloco "V4 — CYBERPUNK OVERDRIVE" no style.css)
- Chão de grid synthwave em perspectiva + orbs de neon à deriva (body::before/::after).
- Brackets HUD no wizard e losango girando no header dos cards; circuito pontilhado no painel.
- Chanfros blade-runner (clip-path) no FORJAR e na tab ativa; aberração cromática nos títulos.
- Trilha de energia animada na topbar; flicker de letreiro na logo e no relógio.
- Scan sweep verde ao concluir um card; stripe diagonal animada no header durante o streaming.
- Fixes: grid-preview com max-width; switch-inline dentro de .sel-card (especificidade).
- Tudo coberto por prefers-reduced-motion.

## 9. Testes
- 149 testes (138 da v3 + 11 novos): `postprocess-broadcast.test.js` (formato, SECRET, emoji,
  dedup global, first_name) e `postprocess-offerwall.test.js` (dispatcher, schema v2, validação de
  paleta/modo, stripChatbotVars, clássico preservado). `npm test` verde.

## 10. v4.0.1 — correções pós-revisão
- Card do Quiz renderiza o Direct Offerwall (eyebrow, título-gancho, body, destaque/meta, CTA, timer, expirado).
- Migração de id de modelo antigo no localStorage (id fora do catálogo → recomendado, com toast).
- `photos.js`: timeout de 8s por request de foto (`AbortSignal.timeout`).
- `fixBroadcasts`: dedup de bodies cobre 3+ iguais (variantes de fechamento + marcador); `language` normalizado pra `xx_YY`.
- Stepper respeita `step` (broadcasts de 50 em 50).
- Export do grid (download/copiar/"ver JSON") sai sem `_pexels`, `pexels_search`, `image_prompt`.
- Otimizador com kind `broadcast` passa pelo `fixBroadcasts`.
- `validateChatDrink('broadcast')`: warnings de URL fora do padrão, emoji no body, sem name.
- 151 testes.

## 11. v4.0.2 — prompts "Flow-safe"
- Novo bloco `FLOW_SAFE` injetado em fb_images, persona_identity, image_prompts, creatives_prompt, video_prompts e grid (image_prompt): só descrever o que aparece (sem listas "no tattoos/no celebrity/never change"), sem nacionalidade/país/bandeira (traços e cenário descritos visualmente), sem cartão/dinheiro/documentos (categoria bloqueada no Imagen), adultos por faixa etária, sem marcas/celebridades, sensualidade só por luz/pose/olhar.
- `persona_identity.core` proibido de conter rótulo étnico/nacional; `avoid` vira nota interna (personaIdentityLine não injeta mais "NUNCA altere" como texto de prompt).
- Capa do FB evoca a região por paisagem/luz/arquitetura, nunca por nome do país ou bandeira.
- Motivo: prompt de perfil da persona (nicho crédito) rejeitado pelo Google Flow — cartão de crédito + lista de negativos + "Brazilian woman / hint at Brazil".

## 12. v4.1.0 — PUBLISHER WordPress (P1 + P2 completos, publicados no blog)
Mapeamento e requisitos em `docs/WP-PUBLISHER-ANALYSIS.md`. Dependência externa: **[MBZ] - Mirb Grid 1.4.0+**
(rota `mirb-grid/v1`, já no Miawzy) e um usuário **Editor** por blog com senha de aplicação.

- **Blocos novos** `p2_posts` (1 artigo por item do grid; deps p2_titles+grid) e `p1_posts` (1 por título; deps
  p1_titles+quiz+grid). Toggle "📝 Artigos P1 e P2 completos" no passo 4 liga os dois e garante títulos/grid/quiz.
  Prompts calibrados na anatomia real dos posts de nov/2026 (1.150–1.300 palavras, 1ª pessoa da persona,
  H2/H3 numerados, tabela no P1, fechamento consciente, regras Meta/AdX-safe, sem país, sem links, sem {{vars}}).
- **Lotes genéricos**: `BATCH_SPECS` em blocks.js (broadcast 50/lote, artigos 2/lote) e `generateBatched` no
  orchestrator (substitui o batched só de broadcast); evento SSE `block_progress` → status do card mostra
  "lote 2/5 · 40%". Artifacts novos: `p1Titles`, `p2Titles`, `gridItems/gridMeta`, `offerwallSummaries`.
- **postprocess/posts.js**: slug seguro e único, HTML saneado (whitelist de tags, sem atributos/links/img/
  script, sem blocos wp:/shortcodes), meta ≤155, 6 tags, word_count.
- **Offerwall** agora gera `qlist` (1 pergunta + 3 opções) — o bloco `quiz-overlay/block` leva isso.
- **lib/wp.js**: `WPClient` (Basic auth, retry em 5xx, timeout), categorias/tags (find-or-create), upload de
  mídia por URL (foto via lib/photos → featured), Yoast via `meta` (+ fallback ability), grid via
  `mirb-grid/v1`; `htmlToBlocks` (Gutenberg), `quizBlock` (serialização de atributos igual ao Gutenberg:
  `--`→`--`, `<>&"` escapados), `buildP1Content` (grid → offerwall → corpo, app-block antes do 2º H2),
  `buildP2Content` (HTML clássico). `publishFunnel`: P2s → grid com `item_link={home}/{id}/` → P1s → Yoast;
  lote falho vira warning, relatório com URLs.
- **lib/blogs.js**: `DATA_DIR/blogs.json` com senha de aplicação cifrada AES-256-GCM (chave de `BLOGS_SECRET`
  ou `ACCESS_PASSWORD`); listagem nunca expõe a senha; upsert por url+usuário.
- **Rotas**: `GET/POST/DELETE /api/blogs`, `POST /api/blogs/:id/test` (papel, capabilities, rota do grid,
  categorias), `POST /api/publish` (SSE `publish_progress`/`publish_done`/`publish_error`; status default
  `draft`; `appUrl`/categoria padrão do cadastro).
- **UI**: aba 🌐 BLOGS (cadastro + teste), botão "🌐 Publicar no blog" na saída quando há artigos, painel
  Publisher (blog, rascunho/publicar, categoria carregada do blog, URL do app) com log ao vivo, barra e
  tabela final; o card do grid é atualizado com os links reais após publicar.
- **Testes**: 158 (wp.js com fetch falso: ordem P2→grid→P1, links por ID, blocos, Yoast, fallback sem rota).
- Env novo: `BLOGS_SECRET` (opcional).
