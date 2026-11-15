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

## 13. v4.1.1 — App do nicho + CardLinks nos artigos

**Pedido:** "o claude deveria procurar apps por nicho e pôr, além de cardlink nos textos, nas P1 e nas P2" +
"cardlink da P2 pode ser link de saída, deve ser opcional; botões da store (app-block) opcional na P1, obrigatório na P2".

### Bloco `niche_app` (novo, ligado junto com "Artigos P1/P2")
- Sem deps. O modelo responde `{app_name, android_package|null, play_url, ios_url, confidence, why}`.
- Regra dura no prompt: só dá `android_package` com certeza absoluta (com.zzkko, com.tinder…); em dúvida, URL de
  **busca** da Play Store (`/store/search?q=…&c=apps`) — link quebrado é pior que busca.
- Também devolve o **link de saída** do nicho (`exit_url`, `exit_label`, `exit_why`): página oficial da marca/produto/benefício,
  só domínio raiz conhecido, Meta/AdX-safe; sem destino claro → `exit_url = play_url`. Pré-preenche "Link de saída" no painel.
- Artifact `nicheApp` → o painel de publicação pré-preenche **URL do app** (hint mostra app/confiança/motivo).
  Prioridade: artifact > `appUrl` do cadastro do blog. Card do bloco mostra os links pra conferir antes de publicar.

### CardLink dentro dos artigos (plugin CardLink · `cardlink/card`)
- Prompts de P1 e P2 pedem a linha `<!--CARDLINK-->` após a 3ª/4ª seção e um objeto
  `cardlink: { variant, internal:{eyebrow,title,description,button,chips[4]}, exit:{…} }` — duas cópias, porque o
  destino é escolhido só na hora de publicar.
- `fixPosts` sanitiza (`fixCardlink`: variante válida, textos sem tags, chips ≤4, formato antigo de cópia única vira `internal`) e
  marca `has_cardlink_marker`.
- `lib/wp.js`: `cardlinkBlock()` (mediaWidth 220, cardClickable, enableFloat br, uid `cl_…`; externo = newTab + nofollow),
  `insertCardlink()` (troca o marcador; sem marcador entra antes do 4º `<h2>`), `htmlToBlocks` preserva o marcador entre blocos.
- Opções do publisher (`options`): `cardlinkP1: p2|exit|none` (default **p2** = 1º artigo do grid),
  `cardlinkP2: exit|next|none` (default **exit** = link de saída), `exitUrl` (default = URL do app).
  P2 → "próxima P2" só existe depois de criar todas: 2ª passada com `PUT /posts/{id}` (evento `cardlink`).
  Imagem do card: featured do destino → foto do item do grid → featured do próprio post.
- App-block: `appP1:false` por padrão (switch "Também nos P1"); nos **P2 é sempre inserido**. URL vazia → aviso no
  relatório + confirm no painel.

### Testes
- `test/wp.test.js`: bloco cardlink (atributos, externo, marcador em P1/P2, fallback 4º h2, limpeza sem bloco), fluxo
  completo com `next` (2 PUTs, 100→101→100) e `exit`/`none`/sem appUrl. 160 testes verdes.

### Persistência dos blogs (fix do "sumiu o blog no deploy")
- Causa: o Railway recria o container a cada deploy; sem Volume, `DATA_DIR` caía em `./data` (efêmero) e
  `blogs.json`/`history.json` eram perdidos.
- `lib/datadir.js` resolve a pasta: `DATA_DIR` → `RAILWAY_VOLUME_MOUNT_PATH` (o Railway seta sozinho quando há
  Volume anexado) → `./data` (marcado como efêmero quando `RAILWAY_ENVIRONMENT` existe). Log de boot avisa.
- `GET /api/storage` → `{dir, source, persistent, blogs}`; banner na aba Blogs (verde = persistente / âmbar =
  efêmero com o passo a passo do Volume).
- Backup cifrado no navegador: `GET /api/blogs/backup` devolve as entradas com a senha AINDA cifrada (só decifra com o
  mesmo `BLOGS_SECRET`/`ACCESS_PASSWORD` do servidor); o front guarda em `localStorage` toda vez que lista blogs e, se o
  servidor acordar sem nenhum, chama `POST /api/blogs/restore` (upsert por url+user; entradas que não decifram são
  ignoradas e o usuário é avisado de que o segredo mudou).
- **Setup definitivo no Railway:** Settings → Volumes → Add Volume, mount path `/data`; variável `DATA_DIR=/data`.

## 14. v4.1.1 — Crítico convergente + "Aplicar sugestões" que edita de verdade

**Sintoma:** Identidade Visual regenerada 5× com as sugestões e o crítico sempre achava problema novo.

**Causas:** (1) "Aplicar sugestões" chamava uma regeneração do zero passando só `problemas` + `direção` (as
`sugestoes` nem iam) → o modelo reescrevia tudo e criava defeitos novos; (2) o crítico pedia campos
(`signature_prop`, `hook_line`, expressões por estágio) que o schema proibia ("mantenha EXATAMENTE o schema") →
impossível aplicar; (3) `persona_identity` não tinha rubrica própria (caía na genérica) e cada análise inventava
critério novo, sem saber o que já tinha sido pedido.

**Correções**
- `agentFeedbackBlock(fb, previousJson)`: com JSON anterior vira **MODO EDIÇÃO** — "resolva cada problema, aplique
  cada sugestão, o resto permanece idêntico, nunca invente chaves". O front manda `_previousJson = card.json` no
  Aplicar; o loop automático do NEXUS Agent também (regen = edição da versão atual). Sem JSON anterior, o bloco
  antigo agora inclui as sugestões.
- Schema da **Identidade Visual** expandido: `signature_prop[]` (props separados do wardrobe), `stage_expressions
  {curiosity, reveal, urgency}`, `hook_line` (idioma da campanha, ≤14 palavras), `allowed[]` (resolve "prop vs
  proibido", ex.: raspadinha não é cartão de pagamento), `photo_style` = 1 direção só. `personaIdentityLine`
  injeta props/expressões/gancho/permitidos em todos os blocos de imagem/vídeo. Card renderiza os campos novos.
- Rubrica própria `REVIEW_RUBRICS.persona_identity` (5 critérios, schema permitido declarado, "sem pedir campos
  novos").
- Prompt do crítico: **exaustivo** (`checklist` por critério ok|falha; "problemas" com TODOS os defeitos de uma
  vez, apontando o campo; cada sugestão = edição concreta dentro do schema) e **convergente** (recebe
  `previousReview` → devolve `resolvidos`/`pendentes`, "não introduza critérios fora da rubrica, não mova a trave").
- UI: botão "✎ Aplicar N sugestões (edita, não recria)" → edita → **re-analisa sozinho** passando a revisão
  anterior; painel mostra ✓ Resolvidos / ↻ Pendentes / Checklist. "Analisar" manual também confere a última revisão.

## 15. v4.1.1 — Vozes ElevenLabs reais (catálogo da conta)
- `lib/voices.js`: 86 vozes da conta (nome, descrição, `voice_id`) extraídas do seletor da Frame IA/ElevenLabs.
- Prompt de `audios` recebe o catálogo inteiro e só pode escolher dali: UMA voz principal da persona
  (`voice_main`, escolhida pelo TIMBRE — gênero/idade/tom do nicho; toda voz fala todos os idiomas, sem filtrar por GEO),
  no máximo uma alternativa A/B (`voice_alt`) e `voice`/`voice_id` por áudio.
- `postprocess/audios.js`: normaliza nome/id pelo catálogo (voz fora do catálogo → cai na principal; id sempre
  preenchido; warning por item).
- Card de áudios mostra a voz da persona com o id (selecionável pra copiar) e o id em cada áudio; o "copiar" leva
  nome + id.

## 16. v4.1.1 — Entrada Meta (CTM) + títulos compactos
**Entrada Meta (bloco `meta_onboard`, agora dependente do `onboard`)** — o que a pessoa vê ao tocar no anúncio
Click-to-Messenger, nos dois formatos que a Meta aceita (testados no Ads Manager → Conversas):
- **A · Editor visual** "Saudação + Perguntas frequentes": saudação ≤300 chars com `{{user_first_name}}` + 5 perguntas
  na voz do usuário (≤80 chars, emoji) — resposta automática fica em branco, o ChatDrink responde. Botão "copiar texto".
- **B · Campo JSON**: `{"message":{"text":<saudação>,"quick_replies":[{content_type:"text",title≤20,payload}]}}` —
  o único formato de perguntas que o campo JSON renderiza sem link (ice_breakers flat/locale e button web_url não
  servem). Botão "copiar JSON".
- Cada pergunta/quick reply aponta pra uma rota do onboard (artifact novo `onboardHooks` = títulos dos cards por rota);
  payload `ONB_<NICHO>_<rota>` (nicho sem acento, ≤2 palavras) pra casar no ChatDrink por payload ou texto.
- `postprocess/meta_onboard.js` aplica os limites (300/80/20, máx 5) com aviso no card e monta o `meta_json` pronto.
  Formato antigo (`welcome` + strings) é convertido.

**Títulos compactos** — P1 ≤60 chars/9 palavras, P2 ≤55/8 (regra no prompt com exemplo de tamanho); artigos
compactam o título se vier longo; `postprocess/titles.js` normaliza espaços/reticências e avisa no card quando estoura
(sem cortar cego — corte estraga o gancho).

## 17. v4.1.2 — Brief opcional do nicho
- Passo 1 ganhou "✎ brief detalhado (opcional)": textarea recolhida; vazio = comportamento de sempre (só o nicho).
- Preenchido, o brief entra em **todos** os blocos como `BRIEF DO NICHO` no contexto (até 6.000 chars) e o crítico
  passa a avaliar aderência (ângulo/tom/persona/gatilhos) com a seção **NÃO FAZER como critério eliminatório**.
- Botão **🤖 gerar brief** → `POST /api/brief` (`createMessage`, não-stream, 4k tokens) com `buildBriefPrompt`: promessa
  em 1 linha + ANGLE / TONE / PERSONA / TRIGGERS / DESIRED STRUCTURE / DO NOT, no idioma da campanha, 1.600-2.400
  chars, o máximo de apelo que Meta/AdX toleram. Campo "tom" opcional (ex.: "sensual e apelativo"). Confirma antes de
  substituir um brief existente; "limpar" zera. Contador e estado "● ativo" no toggle.
- `params.brief` vai no histórico junto com os outros parâmetros (duplicar funil no futuro já carrega o brief).
- Próximo (depende do Frame): chave de API pessoal → Nexus como cliente MCP do Frame com o token guardado só no
  navegador de cada pessoa (ver mensagem enviada ao Marcelo).

## 18. v4.2.0 — CYBERPUNK OVERDRIVE II · personas · nomes · login · extras

### Visual (html[data-fx] = full|lite · botões FX e 🔊/🔇 no header)
- `fx.js` reescrito: cena de fundo em canvas (grade neon em perspectiva + sol de linhas + chuva de glifos + partículas),
  pausa com aba oculta, DPR ≤1.5. **Boot screen** (log de sistemas, barra, pulável; 1× por sessão). **Glitch**
  periódico nos títulos (`.glitch[data-text]`). **Decode/scramble** do título a cada passo. **Sons WebAudio**
  sintetizados (click, hover, blip por bloco, acorde na run, erro, boot) com mute persistido (`nexus_sfx`).
- CSS: cursor custom (mira/seta), CRT (curvatura, flicker, aberração cromática, ruído), scanlines multiply, HUD com
  cantos nos cards/passos (cor por estado: âmbar gerando, verde pronto, rosa erro), varredura no card em geração,
  botões com brilho varrendo, topbar sticky com linha animada, barra com flicker, transição "terminal" entre passos.
- **Lite** (`FX ▮▯▯` ou `prefers-reduced-motion`): sem CRT/ruído/glitch/grade; só partículas.
- Eventos: `nexus:step` (wizard) e `nexus:event` {block_done|run_done|error|warn} (render) → fx.

### Personas (prompts.js)
- 41 personas, **todas com `voice` + `look`**, em 4 grupos (♀ 18 · ♂ 15 · ♥ casal 2 · ◆ marca/neutro 6).
  Novas: fem irreverente/fitness/cozinha; masc sensual/romântico/místico/humor/gamer/cristão jovem; casal
  apaixonado/cristão; marca sem rosto (canal), mensageiro anônimo, narrador documental.
- `custom`: textarea (voz + visual) → `params.personaCustom`. Grupo marca injeta "SEM ROSTO" nos prompts.
- `personaLine` carrega voice + look pra todos os blocos; hint do select mostra a voz.

### Nomes de página
- Sempre **3 mulheres · 3 homens · 3 marcas/neutros** (`{fem,masc,marca}`; `names` plano mantido). Botão **↻ mais**
  por grupo (`nameGroup` + `nameAvoid` evita repetir). Clique no chip preenche o nome. `postprocess/page_name.js`.

### Login (lib/users.js)
- `users.json` no volume, senha scrypt, token HMAC stateless (30 dias; trocar senha derruba sessões), papéis
  `master|gestor`. Bootstrap: `MASTER_USER/MASTER_PASSWORD` → `ACCESS_PASSWORD` legado → primeiro login cria o master.
- Rotas: `POST /api/auth {user,password}` → token (header `x-access-pass`); `GET /api/me`; `POST /api/me/password`;
  master: `GET/POST /api/users`, `POST /api/users/:id/password`, `POST /api/users/:id/active`.
- **Ownership**: `owner` em blogs e histórico; gestor só vê/usa/apaga o seu (403 no resto); master vê tudo com badge
  `@dono`; blogs/funis antigos migram pro master no boot. Backup/restore de blogs por dono.
- UI: gate com usuário+senha (aviso de primeiro acesso), chip `★ teteu`/`@ana` no header → trocar senha / sair,
  aba **USUÁRIOS** (master): criar, redefinir senha, desativar/reativar.

### Extras
- **ZIP do funil** (`zip.js`, store, sem dependência): `<nicho>/README.md`, params, artifacts, `json/`, `texto/`,
  `prompts/` (1 arquivo por prompt de imagem/vídeo), `revisoes/`.
- **Duplicar funil** no histórico: preenche o wizard com nicho/brief/persona/idiomas e volta ao passo 1.
- **Custo US$** (`lib/pricing.js`, tabela por modelo, `MODEL_PRICES` override): `cost` em `block_done` (gen + crítico)
  e `run_done`; badge `≈ $0.016 · 1k/1k` no card e total da run nas ações de saída. Estimativa (preço de lista).
- **Lint Meta** (`lib/lint.js`, determinístico): atributo pessoal, garantia, prêmio/dinheiro, sexual, menores/"girls",
  saúde, urgência falsa, marca de terceiros (soft), país (soft), CAPS, variáveis fora do lugar — em broadcast,
  meta_copy, meta_onboard, títulos, comentário, onboard, sequence → `LINT META: "termo" em caminho — motivo` nos
  warnings do card. `_warnings` de todo postprocess agora chegam ao card.
- `ANTHROPIC_URL` sobrescrevível (testes E2E com Claude falso).

## 19. v4.3.0 — 🍒 Integração com o FRAME (Moodlr)
- `lib/frame.js`: cliente MCP (JSON-RPC 2.0 `tools/call` em `FRAME_MCP_URL`, aceita resposta JSON ou SSE), allowlist de
  ferramentas, `unwrap` (structuredContent → content[].text JSON → texto), erros 401/403/429 legíveis, timeout 4 min.
  Helpers: `frameLang` (pt-BR→pt…), `frameFormat` (1080x1920→story…), `buildCreativeItems`, `extractDesigns`.
- **Chave pessoal**: cada pessoa gera a sua no Frame e cola no chip do usuário (modal da conta) → `localStorage`
  `nexus_frame_key`; vai no header `x-frame-key` e o servidor **nunca guarda**. "testar" chama `frame_quem_sou` +
  `frame_uso_hoje` (mostra conectado como X · gasto/teto · designs do dia). Chip 🖼 no header quando conectada.
- Rotas (login do Nexus + chave): `POST /api/frame/whoami`, `POST /api/frame/call` (proxy allowlisted),
  `POST /api/frame/send` (SSE `frame_progress` {start|lote|design|warning|narrar|studio} / `frame_done` / `frame_error`).
- **Card de Criativos → painel "🖼 ENVIAR PRO FRAME"**: formato (post/story/retrato/link), quantos, idiomas (até 5; o 1º é
  o original, os outros viram cópias traduzidas), narração (voz principal do bloco Áudios + roteiro de cada áudio, 1
  por design via `frame_narrar` mesma_em_todas), mandar pro Creative Studio. Monta o briefing de cada item com o prompt
  da cena + headline da Copy Meta (ou do próprio prompt) + CTA no idioma, modo `fundo_unico` (textos editáveis).
  Lotes de 7 (limite do Frame). Log ao vivo com link de cada design; chips dos designs no fim + uso do dia.
- Testes: `test/frame.test.js` (fake MCP em JSON e SSE, allowlist, 401, idioma/formato/itens/extractDesigns, rota
  `/api/frame/send` ponta a ponta: 2 lotes, 9 narrações, Creative Studio, eventos). `server.js` exporta o app e respeita
  `NEXUS_NO_LISTEN=1` pra testes. **Bug corrigido de tabela**: `sse.send` é assíncrono — o último evento precisa de
  `await` antes de `close()`.

### v4.3.1 — um design com N páginas (padrão)
- Switch **"um design com todas as páginas"** (ligado por padrão). Fluxo: item 1 → `frame_criar_designs` (molde com fundo +
  textos editáveis) → `frame_ver_design` (índices do headline/CTA casados pelo texto; fallback maior/menor) → cenas 2..N →
  `frame_gerar_imagem` (prompt + "empty space for a headline, no text") → `frame_criar_de_modelo` com `origem.design` =
  molde e `paginas` (página 1 do molde N×, cada uma com imagem + headline/CTA trocados) → design final com N páginas →
  `frame_narrar` com **um roteiro por página em uma chamada** → idiomas extras via `frame_traduzir_design` (cópia por
  idioma, narração traduzida junto) → Creative Studio (final + traduções; o molde fica fora).
- Relatório: molde (link, pra apagar se quiser), design final (N páginas, 🎙), traduções. `avisos` do Frame viram warnings.
- Desligado = v4.3.0 (um design por criativo, lotes de 7).

### v4.3.2 — ajustes do FRAME-API-GUIA (testes reais do Frame)
- `frameCall` com **retry/backoff** (até 8×) nos erros transitórios: "já tem 2 trabalhos do Frame rodando", "Muitas chamadas… 2 s",
  "sala ao vivo", 429. Log mostra ⏳ a cada tentativa.
- Imagens **2 por vez** (limite de trabalhos simultâneos do Frame); `gerar_imagem` lido como `imagem.id`.
- **Molde existente**: campo "molde" no painel (id/link de um design seu com fundo + título + CTA) → pula o
  `criar_designs` (zero IA no layout), gera imagem pra todas as páginas e monta por `criar_de_modelo`.
- Índices de texto: match pelo texto; sem match → convenção 1 = título, 2 = CTA; senão maior/menor.
- Sufixo nos fundos: "no text anywhere in the image, no letters, no logos, no watermark".
- Narração continua **1 roteiro por página** (decisão do Teteu — variedade > custo); modelo padrão `eleven_v4`; o bloco
  Áudios agora pede roteiros de 15-20 s com **tags de emoção entre colchetes**.
- Tradução em grupos de 5 idiomas (até 11 no campo); `avisos` da tradução viram warnings.
- Studio: aviso de que a exportação roda no navegador ("Exportar agora" com a aba visível). Chave expira após 90 dias sem uso.

## v4.3.3 — criativos do Frame variados e sem texto na imagem

- **Texto duplicado na imagem (bug):** o fundo era gerado com o `prompt` do bloco de criativos, que descreve o anúncio completo (headline + botão desenhados). Agora o bloco devolve também `scene` (a mesma arte só como fundo, sem nenhum texto) e é ela que vai pro `frame_gerar_imagem`. Runs antigos: `cleanScene()` em `lib/frame.js` remove frases de headline/botão e trechos entre aspas. O prompt de imagem abre e fecha proibindo texto (`imagePrompt()`).
- **Molde = kit de layouts:** todas as páginas do molde com título + CTA editáveis viram layouts; o criativo `i` usa a página `i % K`. Fundo do título, fonte e animação do CTA ficam como foram montados no Frame em cada página. Páginas sem texto editável são puladas; molde sem nenhuma dá erro claro.
- **Índices de texto:** textos sem letras (setas, emoji) são ignorados; título = o mais longo, CTA = o último.
- **Variar fonte do título** (ligado por padrão, só com molde de 1 layout): `frame_estilizar_textos` roda só a **fonte** por página — mantém a caixa e a animação. Faixa/contorno NÃO são variados pela API: são efeitos do Textbox (`atFx`) e o `faixa` do estilizar fica sobreposto. Hindi no lote → só fontes com devanágari; alfabeto não latino → não varia. Campo **fontes** restringe o rodízio.
- Animação do CTA, fundo do título e contorno variam pelo **kit**: `criar_de_modelo` copia a animação (`anim`) de cada página do molde.
- **Kits:** o campo molde sugere os designs da conta com "KIT" no nome (ex.: KIT CARTA SECRETA, 5 páginas). Texto 1 = título, último texto = botão. O fundo é gerado no formato do molde (kit 1080×1080 → post), ignorando o seletor do painel.

## v4.3.4 — FRAME // UPLINK (console do Frame redesenhado)

- O painel inline virou: botão **🖼 Frame** no header do card (ao lado de regenerar) + faixa de status no topo do card + **console em modal**.
- Console: kits da conta como cards (designs com "KIT" no nome) ou "IA cria o layout", formato em segmentos (travado quando o kit define), slider de quantidade, chips de idiomas, opções em tiles com LED, cota do dia no header, estimativa de custo (imagem ~US$0,006, narração ~US$0,11/roteiro, tradução ~US$0,01/idioma + narração refeita) e pipeline visual por etapa com barra de progresso. Log recolhido (abre sozinho em aviso/erro).
- O envio continua com o console fechado: a faixa mostra a etapa atual e, no fim, os designs criados.
- Preferências (kit, formato, variar fonte, Studio, fontes) ficam salvas no navegador (`nexus_frame_cfg`).
