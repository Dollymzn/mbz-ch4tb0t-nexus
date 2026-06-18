# MBZ::CH4TB0T NEXUS v2

Gerador completo de funis de arbitragem digital (Meta Ads -> Chatbot -> Blog AdX) via API do Claude. Interface cyberpunk com wizard passo-a-passo.

## Novidades da v2
- **Wizard passo-a-passo** (5 etapas) + botão de **modo clássico**.
- **Saída sanitizada**: P1, P2, copy, quiz e áudios saem como texto limpo pra copiar e colar. Onboard, sequência e grid MIRB saem como **JSON com botão de download** (.json pronto pra importar).
- **Sequência corrigida**: N sequências = N rotas, cada rota com a sequência COMPLETA (delay -> menu -> mensagem escalando), no formato exato do ChatDrink/ChatFood.
- **Grid MIRB** no formato de importação oficial (version/grid/items) com CSS temático e !important.
- **Card de prompts de imagem** do fluxo (onboard + sequência).
- **Criativos configuráveis**: liga/desliga, escolhe plataforma (SVG Claude, DALL-E, Google Flow, Midjourney, Flux), formato (1080x1080, 1080x1440, 1080x1920) e quantidade.
- **Sugestão de nome de página** baseada no nicho digitado (chips clicáveis).
- **Tratamento de erro robusto**: retry automático + parsing tolerante (acabou o "upstream error is not valid JSON").
- Histórico no Railway Volume, seletor de modelo, dois modos de API key.

## Rodar local
```bash
npm install
npm start   # http://localhost:3000
```

## Deploy Railway
1. GitHub -> Railway -> Deploy from repo.
2. Variables: `ANTHROPIC_API_KEY` (ou vazio p/ modo local), `ACCESS_PASSWORD`, `DATA_DIR=/data`.
3. Settings -> Volumes -> montar em `/data`.
4. Generate Domain.

## Estrutura
```
chatbot-nexus/
├── server.js     # Express + Claude API (retry + parsing robusto) + histórico
├── prompts.js    # system prompt, personas, idiomas, formatos ChatDrink/ChatFood, criativos
├── public/
│   ├── index.html  # wizard + clássico + otimizador + histórico
│   ├── style.css   # UI cyberpunk premium
│   └── app.js      # wizard, sanitização, download JSON, particles
└── .env.example
```

MBOLIVEIRAZ MEDIA & TECH
