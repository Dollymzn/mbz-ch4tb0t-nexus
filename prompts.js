// ============================================================
//  MBZ::CH4TB0T NEXUS v2 — System prompts e templates
// ============================================================

const CHATDRINK_FORMAT = `
PLATAFORMA CHATDRINK — formato JSON:
{ "name":"<Nome>", "type":"onboard"|"sequencia", "active":true, "routes":[ ... ] }

REGRA DE OURO DA SEQUENCIA CHATDRINK:
- routes[0] = SEMPRE { "id":"route_0","name":"Rota 1","sort_order":0,"color":null,"interactions":[{"type":"random","config":{"routes":[]},"sort_order":0}] }
- Se o usuario pede N sequencias, gere N rotas (route_1 ... route_N). CADA rota e uma SEQUENCIA COMPLETA: um unico array "interactions" com VARIOS trios escalando no tempo:
    delay -> menu -> mensagem -> delay -> menu -> mensagem -> ... (7 a 13 trios por rota)
- NUNCA quebre uma sequencia em varias rotas. Uma rota = uma jornada completa de follow-up.
- Tipos de interaction (cada um com "config" e "sort_order"):
  * "delay": config { "time":N,"unit":"minutes"|"hours","redirect_type":"","redirect_target":"" } (escalar: 3min,5min,10min,15min,30min,1h,2h,3h)
  * "menu": config { "cards":[{"title","subtitle","image_url","buttons":[{"label","action_type":"url","url","urls":[{"url","weight":100}]}]}],"redirect_type":"","redirect_target":"" }
  * "mensagem": config { "text","buttons":[],"redirect_type":"","redirect_target":"","quick_replies":[{"label","action_type":"route","target_route":<int>,"target_flow":""}] }
  * "botoes": config { "title","buttons":[{"label","action_type":"url","url","urls":[{"url","weight":100}]}],"redirect_type":"","redirect_target":"" }
- Padrao vencedor de cada trio: menu (card com imagem + botao pro blog) + mensagem (texto curto da persona + quick_reply pra fallback/loop).
- ONBOARD ChatDrink: routes[0] random; rotas de conteudo = [digitando + menu/botoes] com redirect_target; ultima rota = goto { "type":"goto","config":{"target_type":"flow","target_route":"","target_flow":"<ID>"} }.

URLs sequencia: {{URL_REDIR}}?utm_source=sequence&utm_campaign={{UTM_CAMPAIGN}}&utm_medium={{NOMEDAPAGINA}}&utm_term=sequence&utm_content=seq1-<nicho>
URLs onboard: {{URL_REDIR}}?utm_source=onboard&utm_campaign={{UTM_CAMPAIGN}}&utm_medium={{NOMEDAPAGINA}}&utm_term=onboard&utm_content=onb1-<nicho>
Variaveis: {{FIRST_NAME}}, {{URL_REDIR}}, {{UTM_CAMPAIGN}}, {{NOMEDAPAGINA}}
`;

const CHATFOOD_FORMAT = `
PLATAFORMA CHATFOOD — formato JSON (DIFERENTE do ChatDrink):
{ "WELCOME":{"MESSAGES":[{"format":"action","type":"random","options":[{"action":"ROUTE_2"}]}]}, "ROUTE_N":{"MESSAGES":[...]} }
- Sequencia ChatFood: cada ROUTE_N e jornada completa. Em MESSAGES intercale:
  * delay: { "format":"action","type":"delay","seconds":<int>,"timeUnit":"hours" }
  * card: { "format":"message","type":"simple_menu","option":[{"option":[{"option":[],"type":"url","title":"<botao>","urls":[{"url":"<url>","weight":100}]}],"image":"<url>","title":"<titulo>","subtitle":"<sub>"}] }
  * mensagem: { "format":"message","type":"buttons_menu","option":[{"option":[],"type":"url","urls":[{"url":"<url>","weight":100}],"title":"<botao>"}],"redirect":"ROUTE_X","title":"<texto persona>" }
- Se pede N sequencias, crie N rotas no WELCOME.random, cada ROUTE_N completa.
- ONBOARD ChatFood: WELCOME random -> cada ROUTE_N = simple_menu (card) + buttons_menu (mensagem+botao) com "redirect".
`;

const PERSONAS = [
  { id: 'fem_jovem', label: 'Feminina jovem (influencer / bestie)' },
  { id: 'fem_madura', label: 'Feminina madura (apresentadora / conselheira)' },
  { id: 'fem_reporter', label: 'Feminina reporter (jornalista)' },
  { id: 'masc_jovem', label: 'Masculino jovem (brother / parceiro)' },
  { id: 'masc_animado', label: 'Masculino animado (narrador / hype)' },
  { id: 'masc_especialista', label: 'Masculino especialista (consultor)' },
  { id: 'fem_mistica', label: 'Feminina mistica (vidente / cartomante)' },
  { id: 'fem_romantica', label: 'Feminina romantica (apaixonada)' },
  { id: 'masc_financeiro', label: 'Masculino financeiro (consultor de credito)' },
  { id: 'fem_beauty', label: 'Feminina beauty (especialista em beleza)' },
  { id: 'neutro_amigo', label: 'Neutro amigavel (assistente proximo)' },
  { id: 'sem_persona', label: 'Sem persona definida' }
];

const LANGUAGES = [
  { id: 'en-US', label: 'English (US)' }, { id: 'pt-BR', label: 'Portugues (BR)' },
  { id: 'es-LATAM', label: 'Espanol (LATAM)' }, { id: 'es-ES', label: 'Espanol (Espana)' },
  { id: 'it-IT', label: 'Italiano' }, { id: 'fr-FR', label: 'Francais' },
  { id: 'de-DE', label: 'Deutsch' }, { id: 'ro-RO', label: 'Romana' },
  { id: 'pl-PL', label: 'Polski' }, { id: 'ar-AR', label: 'Arabic' },
  { id: 'hi-IN', label: 'Hindi' }
];

const CURRENCIES = [
  { id: 'USD', label: 'USD ($)' }, { id: 'EUR', label: 'EUR (euro)' },
  { id: 'BRL', label: 'BRL (R$)' }, { id: 'RON', label: 'RON (lei)' },
  { id: 'PLN', label: 'PLN (zl)' }, { id: 'GBP', label: 'GBP (libra)' },
  { id: 'MXN', label: 'MXN ($)' }
];

const CREATIVE_PLATFORMS = [
  { id: 'svg_claude', label: 'SVG (Claude / VECTORFLUX)' },
  { id: 'dalle', label: 'DALL-E (OpenAI)' },
  { id: 'google_flow', label: 'Google Flow / ImageFX' },
  { id: 'midjourney', label: 'Midjourney' },
  { id: 'flux', label: 'Flux (Black Forest)' }
];

const CREATIVE_SIZES = [
  { id: '1080x1080', label: '1080x1080 (quadrado / feed)' },
  { id: '1080x1440', label: '1080x1440 (vertical / 4:5)' },
  { id: '1080x1920', label: '1080x1920 (story / reels)' }
];

const OPERATION_KNOWLEDGE = `
Voce e o motor de geracao do MBZ::CH4TB0T NEXUS (MBOLIVEIRAZ MEDIA & TECH), que cria funis completos de arbitragem digital: Meta Ads -> Chatbot Messenger -> Blog AdX.
FUNIL: Meta Ad -> Onboard (inscreve subscriber + manda link do blog) -> Sequencia (follow-ups com delays escalando, urgencia e storytelling com persona) -> LP do blog com Quiz Overlay -> Rewarded Ad -> MIRB Grid (categorias que linkam pra P2) -> P2 (mais anuncios). Broadcasts diarios monetizam a base.
REGRAS:
- eCPM sobe com mais P2s. Grid com link unico = eCPM baixo; P2s separadas = eCPM alto.
- Sequencia usa storytelling + urgencia crescente. Delays escalam.
- Criativos gamificados convertem melhor (roleta, raspadinha, mystery box, placar fake).
- Nome de pagina do Facebook deve parecer PESSOA REAL ligada ao nicho (Carta de Amor -> Aurora del Amor; Tarot -> Luna Serafina; Financas -> Harper Blake; Futebol -> Sofia Mendez).
- Fluxo do chatbot por padrao en-US (o sistema traduz por pagina).
- Copy do Meta usa a MOEDA LOCAL do pais-alvo.
- Quiz overlay: um por P1. Grid: colunas x linhas define no de P2s.
`;

function buildSystemPrompt() {
  return OPERATION_KNOWLEDGE + "\n\n" + CHATDRINK_FORMAT + "\n\n" + CHATFOOD_FORMAT +
    "\n\nIMPORTANTE: responda SEMPRE so com JSON valido conforme o schema pedido, sem texto fora do JSON, sem markdown, sem crases. Use aspas duplas. Nao trunque. Feche todas as chaves e colchetes.";
}

module.exports = {
  PERSONAS, LANGUAGES, CURRENCIES, CREATIVE_PLATFORMS, CREATIVE_SIZES,
  buildSystemPrompt, CHATDRINK_FORMAT, CHATFOOD_FORMAT
};
