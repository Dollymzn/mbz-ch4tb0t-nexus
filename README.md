# MBZ::CH4TB0T NEXUS v4.3.4

Gerador completo de funis de arbitragem digital (Meta Ads -> Chatbot -> Blog AdX) 100% via API do Claude.
Um único endpoint SSE gera todos os blocos do funil em paralelo, respeitando as dependências entre eles,
com o texto de cada bloco chegando ao vivo na tela conforme o modelo escreve.

## Novidades da v4.3 — Integração com o Frame (Moodlr)
- **FRAME // UPLINK** (v4.3.4): botão **🖼 Frame** no header do card de criativos (ao lado de regenerar) e faixa no
  topo do card abrem o console — escolha de kit, formato, quantidade, idiomas, opções, estimativa de custo e
  pipeline visual do envio (molde → fundos → montagem → fontes → narração → tradução → Studio). Ele cria no Frame **um design com uma página por criativo**,
  narra **um roteiro por página** (voz e roteiros do bloco Áudios, Eleven v4), traduz (uma cópia por idioma,
  em grupos de 5) e opcionalmente manda pro Creative Studio.
- **Chave pessoal do Frame** (`frm_…`): cada pessoa cadastra a sua no modal da conta (chip do usuário no
  header). Fica **só no navegador** (localStorage), vai no header `x-frame-key` e o servidor nunca guarda.
  Tudo conta na cota de quem criou a chave.
- **Molde / kit de layouts** (v4.3.3): informe um design seu no campo "molde / kit" (o campo sugere os
  designs com "KIT" no nome). Cada página com título + botão editáveis é um layout — fundo do título,
  contorno, posição e animação do CTA ficam como foram montados no Frame — e os criativos alternam entre
  as páginas. Convenção: texto 1 = título, último texto = botão. O fundo é gerado no formato do molde.
- **Fundo sem texto** (v4.3.3): o bloco de criativos devolve o campo `scene` (a arte só como fundo) e é
  ele que gera a imagem; em runs antigos o servidor remove as frases de headline/botão do prompt. O card
  mostra o `scene` e o painel mostra quantos criativos vieram com ele.
- **Fonte do título**: com molde de 1 layout, a fonte roda por página (mantém caixa e animação). Hindi no
  lote → só fontes com devanágari; alfabeto não latino → não varia. Faixa/contorno/animação **não** são
  variados pela API — variam pelo kit.
- Limites do Frame tratados com fila e nova tentativa: 2 trabalhos de IA simultâneos, "Muitas chamadas…",
  gravação recusada com o design aberto no editor (**feche o design no Frame durante o envio**).
- A exportação dos MP4 roda no navegador: abrir o Frame (Início) e clicar **"Exportar agora"** com a aba
  visível.
- Detalhes: `docs/V4-RELEASE.md` (§ v4.3 em diante).

## Novidades da v4.2 — Login, persistência e brief
- **Login por usuário** (master / gestor): blogs e histórico são de cada pessoa; o master vê tudo, cria
  usuários (aba USUÁRIOS) e transfere blogs entre donos. `MASTER_USER`/`MASTER_PASSWORD` são autoritativas
  a cada boot (criam, redefinem a senha e reativam o master).
- **Persistência**: dados em `DATA_DIR` → `RAILWAY_VOLUME_MOUNT_PATH` → `./data` (efêmero, com banner de
  aviso). Blogs com senha de aplicação cifrada (AES-GCM) + backup/restauração cifrados.
- **Passo 1 reordenado**: nicho → GEO/idiomas → nome da página (3 femininos / 3 masculinos / 3 marcas) →
  persona (41 presets + personalizada) → **brief** opcional (bloqueado até escolher nome e persona).
- **Crítico convergente**: análise exaustiva com checklist; "Aplicar sugestões" edita em vez de recriar.
  Identidade visual com rubrica própria e campos novos.
- **Áudios**: catálogo de 86 vozes ElevenLabs como sugestão (toda voz serve pra todos os idiomas), roteiros
  com tags de emoção.
- **Onboard do anúncio Click-to-Messenger**: texto (saudação + perguntas) e JSON `quick_replies`.
- **Lint Meta** determinístico, estimativa de custo por bloco, ZIP do funil, títulos compactos.
- **Visual cyberpunk** com animações e sons (botões pra reduzir efeitos e mutar).

## Novidades da v4.1.1 — App do nicho + CardLinks nos artigos
- Bloco **App do nicho**: descobre o app oficial do nicho (Play Store; URL de busca quando não tem certeza do pacote)
  e pré-preenche a URL do bloco de aplicativo no painel de publicação.
- **CardLink** no meio dos P1 e P2 (plugin CardLink): P1 → 1º artigo do grid ou link de saída; P2 → próxima P2
  (circular) ou link de saída; ou nenhum. Imagem = featured do destino.
- App-block **opcional nos P1** (switch), **sempre nos P2**.
- **Blogs persistentes**: detecta o Volume do Railway sozinho, avisa quando o armazenamento é efêmero e mantém um
  backup cifrado no navegador que restaura os blogs se o servidor subir vazio. Detalhes em `docs/V4-RELEASE.md` §13.

## Novidades da v4.1 — Publisher WordPress
- **📝 Artigos P1 e P2 completos** (toggle no passo 4): um P2 por item do grid e um P1 por título, ~1.200
  palavras na voz da persona, gerados em lotes de 2.
- **🌐 Publicar no blog**: aba BLOGS cadastra cada WordPress (usuário Editor + senha de aplicação, cifrada no
  volume). O Publisher cria os P2s em rascunho → cria o grid MIRB com os links reais (`/{id}/`) via
  `mirb-grid/v1` ([MBZ] - Mirb Grid 1.4.0+) → cria os P1s com grid + offerwall no topo → Yoast + imagem
  destacada. Relatório com URLs e o card do grid atualizado.
- Detalhes: `docs/WP-PUBLISHER-ANALYSIS.md` e `docs/V4-RELEASE.md` §12.

## Novidades da v4

- **Modelos Claude 5.5**: catálogo atualizado — Sonnet 5.5 (recomendado), Opus 5.5, Fable 5.1 e
  Haiku 5.5. O crítico do NEXUS Agent usa o melhor do catálogo (Opus 5.5 por padrão, `REVIEW_MODEL`
  pra forçar outro).
- **📣 Broadcasts em massa (100–500 templates)**: novo bloco `broadcast` no grafo — gerados
  **server-side em lotes de 50** com pools estruturais por lote (unicidade garantida entre lotes),
  dedup GLOBAL de names/bodies no pós-processamento, formato de importação ChatDrink jul/2026
  (UTILITY, sem emoji no body, `{{first_name}}` sem colchetes, URL broadutility exata, SECRET banido).
  Progresso ao vivo por lote no card.
- **🧩 Quiz Overlay Direct Offerwall (4.8.2 / schema v2)**: novo formato padrão do quiz — seletor no
  passo 3 (offerwall vs clássico 4.1.0, que segue disponível). O sistema monta o export completo
  (rewarded fill 8s/30s, provider triad_v1, timer 300s, 4 modos de conversão).
- **🖼️ Grid MIRB ago/2026 com fotos REAIS**: cada item sai com `pexels_search` (o backend resolve a
  URL da foto via cascata **Pexels → Pixabay → Unsplash**, qualquer UMA key resolve), `image_prompt`
  1:1 casado com a paleta ("no text") e `item_link` de busca do Pinterest. CSS de legibilidade agora
  cobre `img` (180px object-fit) e remove text-decoration.
- **🎙️ Áudios ElevenLabs v4**: tags de emoção LIVRES no idioma do áudio ([sussurrando e seduzindo],
  [gemendo baixinho]…), 2-4 tags modulando o script, stability sugerida por nicho (0.24–0.50), CTA
  falado espelhando o texto EXATO do botão do criativo.
- **🎬 Vídeos Veo 3.1**: prompts com áudio nativo (ambiente + fala), proporção 9:16 ou 16:9, hook em
  0-2s, "no on-screen text" (texto entra depois no Atelier/Frame IA).
- **🎨 Identidade visual dos criativos (3 modos)**: com persona (identidade canônica fixa), SEM
  persona (pixel art, clay 3D, macro… estilos de alto CTR no objeto do nicho) ou misto A/B. Regras
  multi-GEO: headline branca 3-6 palavras, nunca citar país, paletas variadas.
- **CSS Cyberpunk Overdrive**: chão de grid synthwave em perspectiva, orbs de neon, brackets HUD nos
  painéis, chanfros blade-runner nos botões, flicker de letreiro, trilha de energia na topbar,
  varredura de scan nos cards concluídos.

## Herdado da v3 (arquitetura)


- **Streaming SSE ao vivo**: `POST /api/run` devolve um único stream de eventos (`run_start`,
  `block_start`, `block_delta`, `block_done`, `block_error`, `run_done`) — cada card do funil vai
  "digitando" o texto cru do modelo em tempo real e depois troca pelo resultado pós-processado.
- **Geração paralela por grafo de dependências**: os blocos rodam concorrentemente respeitando um
  semáforo (`MAX_CONCURRENCY`); só espera de verdade quem depende de outro bloco (ex: `grid` espera
  `grid_preview`; `image_prompts` espera `onboard` + `sequence`; `audios` espera `creatives_prompt`).
  Falha de um bloco marca os dependentes como `skipped`, sem travar o resto da run.
- **Regeneração por bloco**: dá pra regerar um único card sem refazer o funil inteiro — o mesmo
  endpoint `/api/run` aceita `blocks: ['grid']` reaproveitando os `artifacts` já produzidos na run.
- **Presets e rascunho persistente**: o wizard salva o progresso sozinho (localStorage, com debounce)
  e permite salvar/carregar presets nomeados de configuração.
- **Preview de chat**: onboard, sequência e comentários podem ser visualizados como uma simulação de
  conversa (estilo Messenger), além da view JSON crua para download.
- **Prompt caching**: o system prompt vai como bloco `ephemeral` na Anthropic API, reduzindo custo/latência
  entre os blocos de uma mesma run.
- **Validação de schema não-fatal**: cada bloco JSON (`onboard`, `sequence`, `comment`, `quiz`, `grid`)
  passa por uma checagem de forma depois do pós-processamento; problemas viram `warnings` no card, sem
  bloquear a entrega do resultado.
- **Design system novo**: front-end reorganizado em módulos ES (`state.js`, `api.js`, `wizard.js`,
  `render.js`, `fx.js`, `main.js`), sem build step.

## NEXUS Agent (v3.1)

Extensão retrocompatível do contrato v3: sem endpoint novo, sem serviço separado. Contrato técnico
completo em [`docs/AGENT-V31.md`](docs/AGENT-V31.md).

- **Crítico com rubrica por bloco**: um segundo modelo (o "crítico") avalia o JSON gerado com uma
  rubrica específica por bloco (`onboard`, `sequence`, `meta_copy`, `creatives_prompt`, além de uma
  rubrica genérica para qualquer outro alvo) e devolve `{score:0-10, veredito, problemas, sugestoes,
  direcao_de_correcao}`. A aprovação depende do **score** (`>= minScore`), não do veredito textual.
  Se reprovado, o bloco é **regenerado** com o feedback do crítico anexado ao prompt original
  ("REVISÃO DO CRÍTICO"). Uma review que falhar (rede, JSON não extraível, `max_tokens`) nunca
  derruba a run — ela simplesmente aceita a geração atual (`action:"skipped"`).
- **Toggle "🛡 Agente de qualidade" na forja** (passo 5 do wizard): liga o auto-loop de review+regen
  para os 4 blocos-chave (`onboard`, `sequence`, `meta_copy`, `creatives_prompt`) nessa run. **OFF por
  default.** Teto de orçamento fixo: no máximo 1 review + 1 regeneração por bloco.
- **Botão "🔎 Analisar" por card**: em qualquer card do resultado (exceto o próprio `review`), roda a
  mesma rubrica sob demanda para aquele bloco especificamente, sem precisar reprocessar o funil
  inteiro. O painel de crítica mostra score, problemas e sugestões, com um botão "Aplicar sugestões"
  que regenera o bloco alvo usando esse feedback.
- **Análise de criativos por imagem** (sub-aba "Criativos" no Otimizador): envie até 6 imagens do
  criativo vencedor (downscale automático no navegador, lado maior ≤ 1568px, JPEG q≈0.85), com
  métricas opcionais por imagem (CTR/CPM/gasto). O agente extrai o "DNA" do vencedor (mecânica, cor,
  emoção, composição, padrão de headline) e gera N prompts de variação no formato exato da plataforma
  escolhida (Google Flow/ImageFX, Midjourney, DALL-E, Flux ou SVG), cada variação alterando uma única
  dimensão em relação ao DNA (A/B estruturado).
- **Variáveis de ambiente**: `MAX_CONCURRENCY` já existia na v3 (limite de blocos em paralelo por
  run); `REVIEW_MODEL` é nova e opcional — escolhe o modelo usado pelo crítico. Se ausente, o crítico
  roda no melhor modelo disponível no catálogo (`pickBest`, prioridade opus > sonnet-5 > sonnet-4 >
  haiku).

## Rodar local

```bash
npm install
npm start   # http://localhost:3000
npm test    # roda a suíte de testes (node --test, zero dependências extras)
```

`npm run dev` sobe com `node --watch` para reiniciar automaticamente a cada alteração.

## Deploy Railway

1. GitHub -> Railway -> Deploy from repo.
2. Variables:
   - `ANTHROPIC_API_KEY` — chave da Anthropic (vazio = cada usuário insere a própria chave na interface).
   - `MASTER_USER` / `MASTER_PASSWORD` — usuário master (senha com 6+ caracteres). Valem a cada boot.
     Sem elas, `ACCESS_PASSWORD` (legado) vira o master "master"; sem nenhuma, o primeiro login cria o master.
   - `SESSION_SECRET` — assina os tokens de sessão. Não troque depois (derruba as sessões).
   - `BLOGS_SECRET` — cifra as senhas de aplicação dos blogs. Se mudar, re-cadastre os blogs.
   - `DATA_DIR=/data` — pasta de dados (usuários, blogs, histórico); deve apontar pro Volume.
   - `MAX_CONCURRENCY` — opcional, blocos em paralelo por run (default: 3).
   - `REVIEW_MODEL` — opcional, modelo do crítico do NEXUS Agent (default: melhor do catálogo).
   - `MODEL_PRICES` — opcional, preços por milhão de tokens pra estimativa de custo.
   - `FRAME_MCP_URL` / `FRAME_TIMEOUT_MS` — opcionais (default `https://town.moodlr.digital/mcp` / 240000).
     A chave do Frame **não** é variável de ambiente: cada pessoa cadastra a sua na interface.
   - **Fotos reais do grid MIRB** (opcional, qualquer UMA resolve; o app tenta na ordem):
     `PEXELS_API_KEY` (emissão de novas chaves pausada — só se já tiver),
     `PIXABAY_API_KEY` (grátis, aparece ao logar em https://pixabay.com/api/docs/),
     `UNSPLASH_ACCESS_KEY` (demo grátis 50 req/h em https://unsplash.com/developers).
3. Settings -> Volumes -> montar em `/data` (sem Volume os dados somem a cada deploy).
4. Generate Domain.

Veja `.env.example` para a lista completa de variáveis.

## Estrutura de pastas (v4)

```
chatbot-nexus/
├── server.js               # Express fino: wiring de rotas, auth, static — sem lógica de geração
├── prompts.js               # system prompt + catálogos (personas, idiomas, moedas, países, criativos)
├── lib/
│   ├── claude.js            # streamMessage/createMessage: stream Anthropic, retry 429/5xx, prompt caching
│   ├── blocks.js            # buildBlockPrompt(block, params) + BLOCK_META (grafo, deps, maxTokens) + rubricas
│   ├── orchestrator.js      # scheduler topológico + semáforo MAX_CONCURRENCY + eventos SSE + crítico
│   ├── sse.js               # writer SSE: backpressure, coalescing de deltas, keepalive
│   ├── frame.js             # v4.3: cliente MCP do Frame (allowlist, retry, cena limpa, fontes)
│   ├── users.js             # v4.2: usuários (scrypt), tokens de sessão, master/gestor
│   ├── blogs.js             # blogs por dono, senha cifrada, backup/restore
│   ├── wp.js                # Publisher WordPress (P2 → grid → P1, CardLinks)
│   ├── datadir.js           # resolve a pasta de dados (DATA_DIR → Volume → ./data)
│   ├── voices.js            # catálogo de vozes ElevenLabs
│   ├── lint.js              # Lint Meta determinístico
│   ├── pricing.js           # estimativa de custo por bloco
│   ├── photos.js            # resolvedor de fotos do grid (Pexels -> Pixabay -> Unsplash)
│   ├── validate.js          # validateParams (bloqueia a run) + validateChatDrink (gera warnings)
│   ├── history.js           # leitura/escrita atômica do histórico (por usuário)
│   └── postprocess/         # funções puras (json, params) => json: onboard, sequence, quiz, grid, posts, áudios…
├── public/
│   ├── index.html
│   ├── style.css
│   └── js/                   # state, api, wizard, render, fx, anim, zip, main (ES modules)
├── docs/
│   ├── ARCHITECTURE-V3.md    # contrato técnico oficial backend <-> frontend (referência de arquitetura)
│   ├── AGENT-V31.md          # contrato técnico do NEXUS Agent (crítico, review/regen, creative_analysis)
│   └── V4-RELEASE.md         # notas de versão da v4 (até a v4.3.3)
├── test/                     # suíte node:test (node --test)
└── .env.example
```

Para detalhes de protocolo (eventos SSE, formato do grafo, contratos de módulo), consulte
`docs/ARCHITECTURE-V3.md` — é a referência técnica oficial do projeto. Para o NEXUS Agent (v3.1),
consulte `docs/AGENT-V31.md`.

MBOLIVEIRAZ MEDIA & TECH
