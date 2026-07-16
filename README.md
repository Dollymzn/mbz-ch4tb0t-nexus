# MBZ::CH4TB0T NEXUS v3

Gerador completo de funis de arbitragem digital (Meta Ads -> Chatbot -> Blog AdX) 100% via API do Claude.
Um único endpoint SSE gera todos os blocos do funil (onboard, sequência, quiz, grid MIRB, criativos,
áudios, copy de Meta Ads etc.) em paralelo, respeitando as dependências entre eles, com o texto de cada
bloco chegando ao vivo na tela conforme o modelo escreve.

## Novidades da v3

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
   - `ACCESS_PASSWORD` — senha de acesso à ferramenta (vazio = fica aberta sem senha).
   - `DATA_DIR=/data` — pasta do histórico, deve apontar pro Volume.
   - `MAX_CONCURRENCY` — opcional, limite de blocos rodando em paralelo por run (default: 3).
   - `REVIEW_MODEL` — opcional, modelo usado pelo crítico do NEXUS Agent v3.1 (default: melhor
     modelo do catálogo, via `pickBest`).
3. Settings -> Volumes -> montar em `/data`.
4. Generate Domain.

Veja `.env.example` para a lista completa de variáveis.

## Estrutura de pastas (v3)

```
chatbot-nexus/
├── server.js               # Express fino: wiring de rotas, auth, static — sem lógica de geração
├── prompts.js               # system prompt + catálogos (personas, idiomas, moedas, países, criativos)
├── lib/
│   ├── claude.js            # streamMessage/createMessage: stream Anthropic, retry 429/5xx, prompt caching
│   ├── blocks.js             # buildBlockPrompt(block, params) + BLOCK_META (grafo, deps, maxTokens)
│   ├── orchestrator.js      # scheduler topológico + semáforo MAX_CONCURRENCY + eventos SSE
│   ├── sse.js               # writer SSE: backpressure, coalescing de deltas, keepalive
│   ├── validate.js           # validateParams (bloqueia a run) + validateChatDrink (gera warnings)
│   ├── history.js            # leitura/escrita atômica do histórico (cap de 200 entradas)
│   └── postprocess/          # funções puras (json, params) => json: onboard, sequence, quiz, grid
├── public/
│   ├── index.html
│   ├── style.css
│   └── js/                   # state.js, api.js, wizard.js, render.js, fx.js, main.js (ES modules)
├── docs/
│   ├── ARCHITECTURE-V3.md    # contrato técnico oficial backend <-> frontend (referência de arquitetura)
│   └── AGENT-V31.md          # contrato técnico do NEXUS Agent (crítico, review/regen, creative_analysis)
├── test/                     # suíte node:test (node --test)
└── .env.example
```

Para detalhes de protocolo (eventos SSE, formato do grafo, contratos de módulo), consulte
`docs/ARCHITECTURE-V3.md` — é a referência técnica oficial do projeto. Para o NEXUS Agent (v3.1),
consulte `docs/AGENT-V31.md`.

MBOLIVEIRAZ MEDIA & TECH
