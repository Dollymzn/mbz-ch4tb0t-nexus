# MBZ::CH4TB0T NEXUS

Gerador completo de funis de arbitragem digital (Meta Ads → Chatbot → Blog AdX) usando a **API do Claude**.

Informe o nicho e os parâmetros → a ferramenta gera onboard, sequência, grid MIRB, títulos P1/P2, quiz overlays, copy do Meta, prompts de criativos e scripts de áudio — tudo pronto pra usar.

---

## Recursos

- **Aba CRIADOR** — gera o funil completo do zero, bloco por bloco, com progresso visual.
- **Aba OTIMIZADOR** — cole um onboard, sequência, grid ou copy existente e a IA devolve a versão otimizada.
- **Aba HISTÓRICO** — funis salvos ficam guardados (Railway Volume) pra carregar depois.
- **12 personas** + opção sem persona.
- **11 idiomas** de fluxo e conteúdo (fluxo padrão en-US).
- **7 moedas** locais.
- **P1 personalizável** → gera 1 quiz overlay por P1.
- **Grid personalizável** (colunas × linhas) → define automaticamente o nº de P2s.
- **Rotas de onboard/sequência personalizáveis** (número e tipo).
- **Toggle de prompts de imagem** pra cada passo do fluxo.
- **CSS personalizado do MIRB grid** com `!important` conforme o tema/nicho.
- **Seletor de plataforma** (ChatDrink / ChatFood) com aviso de formato.
- **Seletor de modelo** da IA na interface.
- Cada bloco é ativável individualmente (se você já tem onboard/sequência, gera só o que falta).

---

## Dois modos de operação

**Multiusuário (chave no servidor):** defina `ANTHROPIC_API_KEY` no Railway. Recomenda-se também `ACCESS_PASSWORD`.

**Local (sem chave no servidor):** deixe `ANTHROPIC_API_KEY` vazia. Cada usuário insere a própria chave na interface (salva só no navegador).

---

## Rodar localmente

```bash
npm install
# opcional: export ANTHROPIC_API_KEY=sua_chave
# opcional: export ACCESS_PASSWORD=sua_senha
npm start
```

Acesse `http://localhost:3000`.

---

## Deploy no Railway

1. Suba pro GitHub (o `.gitignore` exclui `node_modules`, `.env` e os JSONs de dados).
2. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
3. Em **Variables**, adicione:
   - `ANTHROPIC_API_KEY` = sua chave (modo multiusuário) — ou deixe vazia (modo local)
   - `ACCESS_PASSWORD` = uma senha (recomendado)
   - `DATA_DIR` = `/data` (pra persistir o histórico)
4. **Settings → Volumes** → crie um volume e monte em `/data`.
5. **Settings → Networking → Generate Domain** pra URL pública.

> Sem o volume, o histórico é apagado a cada redeploy. Com o volume montado em `/data` e `DATA_DIR=/data`, ele persiste.

---

## Estrutura

```
chatbot-nexus/
├── server.js        # Express + Claude API + histórico
├── prompts.js       # System prompt, personas, idiomas, formatos ChatDrink/ChatFood
├── package.json
├── .env.example
└── public/
    ├── index.html
    ├── style.css    # UI cyberpunk
    └── app.js       # lógica do frontend
```

---

MBOLIVEIRAZ MEDIA & TECH
