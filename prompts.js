// ============================================================
//  MBZ::CH4TB0T NEXUS — System prompts e templates
//  Todo o conhecimento da operação embutido aqui
// ============================================================

// ---- Formatos das plataformas (exemplos reais resumidos) ----

const CHATDRINK_FORMAT = `
PLATAFORMA CHATDRINK — formato JSON:
{
  "name": "<Nome do Flow>",
  "type": "onboard" | "sequencia",
  "active": true,
  "routes": [
    { "id": "route_0", "name": "Rota 1", "sort_order": 0, "color": null,
      "interactions": [ { "type": "random", "config": { "routes": [] }, "sort_order": 0 } ] },
    // rotas de conteúdo usam interactions com estes tipos:
    // "digitando" -> config: { duration: 2, redirect_type:"", redirect_target:"" }
    // "menu" -> config: { cards:[{title, subtitle, image_url, buttons:[{label, action_type:"url", url, urls:[{url, weight:100}]}]}], redirect_type:"route", redirect_target:<ID> }
    // "botoes" -> config: { title, buttons:[{label, action_type:"url", url, urls:[{url,weight:100}]}], redirect_type, redirect_target }
    // "mensagem" -> config: { text, buttons:[], quick_replies:[{label, action_type:"route", target_route:<ID>, target_flow:""}] }
    // "delay" -> config: { time:N, unit:"minutes"|"hours" }
    // última rota geralmente: { "type":"goto", config:{ target_type:"flow", target_route:"", target_flow:"<ID>" } }
  ]
}
Onboard ChatDrink: rota 0 = random apontando pras rotas de conteúdo. Cada rota de conteúdo = digitando + menu/botoes com redirect_target pra rota de captura. Última rota = goto.
Sequência ChatDrink: rota 0 = random. Rotas de conteúdo intercalam delay + botoes/menu/mensagem com delays escalando (3min,5min,10min,15min,30min,1h,2h).
URLs sempre: {{URL_REDIR}}?utm_source=onboard&utm_campaign={{UTM_CAMPAIGN}}&utm_medium={{NOMEDAPAGINA}}&utm_term=onboard&utm_content=<slug>
Variáveis: {{FIRST_NAME}}, {{URL_REDIR}}, {{UTM_CAMPAIGN}}, {{NOMEDAPAGINA}}
`;

const CHATFOOD_FORMAT = `
PLATAFORMA CHATFOOD — formato JSON (TOTALMENTE DIFERENTE do ChatDrink):
{
  "WELCOME": { "MESSAGES": [ { "format":"action", "type":"random", "options":[ {"action":"ROUTE_2"}, {"action":"ROUTE_4"} ] } ] },
  "ROUTE_2": { "MESSAGES": [
     { "format":"message", "type":"simple_menu", "option":[ { "option":[ {"option":[],"type":"url","title":"<botão>","urls":[{"url":"<url>","weight":100}]} ], "image":"<url>", "title":"<título>", "subtitle":"<subtítulo>" } ] },
     { "format":"message", "type":"buttons_menu", "option":[ {"option":[],"type":"url","urls":[{"url":"<url>","weight":100}],"title":"<botão>"} ], "redirect":"ROUTE_9", "title":"<mensagem com {{FIRST_NAME}}>" }
  ]},
  // delays no ChatFood: { "format":"action", "type":"delay", "seconds":7200, "timeUnit":"hours" }
  // typing: { "format":"message", "type":"typing", "redirect":"ROUTE_X" }
  // goTo: { "format":"action", "type":"goTo", "route":"WELCOME", "schemaId":"<uuid>" }
}
Onboard ChatFood: WELCOME com random apontando rotas. Cada ROUTE_X tem simple_menu (card com imagem) + buttons_menu (mensagem+botão) com redirect.
Sequência ChatFood: ROUTE_X com delays (action/delay/seconds) intercalados com simple_menu + buttons_menu.
URLs: {{URL_REDIR}}?utm_source=sequence&utm_campaign={{UTM_CAMPAIGN}}&utm_medium={{NOMEDAPAGINA}}&utm_term=sequence&utm_content=<slug>
`;

// ---- Personas disponíveis ----
const PERSONAS = [
  { id: 'fem_jovem', label: 'Feminina jovem (influencer/bestie)' },
  { id: 'fem_madura', label: 'Feminina madura (apresentadora/conselheira)' },
  { id: 'fem_reporter', label: 'Feminina reporter (jornalista/correspondente)' },
  { id: 'masc_jovem', label: 'Masculino jovem (brother/parceiro)' },
  { id: 'masc_animado', label: 'Masculino animado (narrador/hype)' },
  { id: 'masc_especialista', label: 'Masculino especialista (consultor/expert)' },
  { id: 'fem_mistica', label: 'Feminina mística (vidente/cartomante)' },
  { id: 'fem_romantica', label: 'Feminina romântica (apaixonada/sonhadora)' },
  { id: 'masc_financeiro', label: 'Masculino financeiro (consultor de crédito)' },
  { id: 'fem_beauty', label: 'Feminina beauty (especialista em beleza)' },
  { id: 'neutro_amigo', label: 'Neutro amigável (assistente próximo)' },
  { id: 'sem_persona', label: 'Sem persona definida' }
];

// ---- Idiomas ----
const LANGUAGES = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'pt-BR', label: 'Português (BR)' },
  { id: 'es-LATAM', label: 'Español (LATAM)' },
  { id: 'es-ES', label: 'Español (España)' },
  { id: 'it-IT', label: 'Italiano' },
  { id: 'fr-FR', label: 'Français' },
  { id: 'de-DE', label: 'Deutsch' },
  { id: 'ro-RO', label: 'Română' },
  { id: 'pl-PL', label: 'Polski' },
  { id: 'ar-AR', label: 'العربية (Arabic)' },
  { id: 'hi-IN', label: 'हिन्दी (Hindi)' }
];

// ---- Moedas ----
const CURRENCIES = [
  { id: 'USD', label: 'USD ($)' },
  { id: 'EUR', label: 'EUR (€)' },
  { id: 'BRL', label: 'BRL (R$)' },
  { id: 'RON', label: 'RON (lei)' },
  { id: 'PLN', label: 'PLN (zł)' },
  { id: 'GBP', label: 'GBP (£)' },
  { id: 'MXN', label: 'MXN ($)' }
];

// ---- Bloco base de conhecimento da operação ----
const OPERATION_KNOWLEDGE = `
Você é o motor de geração do MBZ::CH4TB0T NEXUS, ferramenta da MBOLIVEIRAZ MEDIA & TECH para criar funis completos de arbitragem digital (Meta Ads -> Chatbot -> Blog AdX).

FUNIL: Meta Ad (criativo) -> Chatbot Messenger (onboard inscreve subscriber + manda link pro blog) -> Sequência (mensagens automáticas com delays escalando + urgência/storytelling) -> Blog LP com Quiz Overlay -> Rewarded Ad -> MIRB Grid (categorias linkando pra P2) -> P2 (mais blocos de anúncio). Broadcasts diários monetizam a base.

REGRAS-CHAVE:
- eCPM sobe com mais P2s (mais pageviews por sessão). Grid com link único = eCPM baixo. Grid com P2s separadas = eCPM alto.
- A sequência usa storytelling com persona fictícia e urgência crescente (ex: "alguém pegou seu prêmio/recap/vaga"). Delays: 3min,5min,10min,15min,30min,1h,2h.
- Criativos gamificados performam melhor (roleta, raspadinha, mystery box, placar fake).
- Nomes de página do Facebook devem parecer pessoas reais relacionadas ao nicho (ex: Carta de Amor -> "Aurora del Amor"; Tarot -> "Luna Serafina"; Finanças -> "Harper Blake").
- Idioma do FLUXO do chatbot por padrão é en-US (o sistema traduz por página). O idioma de conteúdo dos blogs pode variar.
- Copy do Meta para campanhas locais usa a MOEDA LOCAL do país-alvo.
- Quiz overlay: um por P1. Tipos: quiz texto, quiz visual (imagens), roleta. Cada um tem pergunta, opções, texto de loading, título final, CTA e nota.
- Grid MIRB: formato escolhido define nº de P2s (2x1=2, 2x2=4, 2x4=8, 3x2=6, etc). Cada item = label + imagem (sugestão Pinterest) + link pra P2.
`;

function buildSystemPrompt() {
  return `${OPERATION_KNOWLEDGE}\n\n${CHATDRINK_FORMAT}\n\n${CHATFOOD_FORMAT}\n\nResponda SEMPRE em JSON válido conforme o schema pedido na mensagem do usuário, sem texto fora do JSON, sem markdown, sem backticks.`;
}

module.exports = {
  PERSONAS, LANGUAGES, CURRENCIES,
  buildSystemPrompt, CHATDRINK_FORMAT, CHATFOOD_FORMAT
};
