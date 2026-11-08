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
REGRA DE OURO DO ONBOARD CHATDRINK (SIGA EXATAMENTE - NAO INVENTE):
- routes[0] = SO random: {"id":"route_0","name":"Rota 1","sort_order":0,"color":null,"interactions":[{"type":"random","config":{"routes":[]},"sort_order":0}]}
- Cada rota de conteudo (route_1...route_N-1) e ISOLADA e tem EXATAMENTE 2 interactions: [digitando, (menu OU botoes)]. NUNCA use "mensagem" no onboard. NUNCA use quick_replies no onboard.
  * digitando: config {"duration":3,"redirect_type":"","redirect_target":""}
  * menu: config {"cards":[{"title","subtitle","image_url":"https://placehold.co/1200x628","buttons":[{"label","action_type":"url","url","urls":[{"url","weight":100}]}]}],"redirect_type":"route","redirect_target":9999}
  * botoes: config {"title","buttons":[{"label","action_type":"url","url","urls":[{"url","weight":100}]}],"redirect_type":"route","redirect_target":9999}
- TODAS as rotas de conteudo redirecionam pro MESMO destino: a ULTIMA rota (use redirect_target:9999 como placeholder do id da ultima rota). NUNCA uma rota de conteudo aponta pra outra rota de conteudo. Sem cadeia entre elas - cada uma e um beco isolado que cai na ultima.
- A ULTIMA rota tem SO o goto, NADA mais: {"id":"route_N","name":"Rota N+1","sort_order":N,"color":null,"interactions":[{"type":"goto","config":{"target_type":"flow","target_route":"","target_flow":"433"},"sort_order":0}]}
- Variar SOMENTE o tipo (menu/botoes/misto conforme pedido) e a quantidade. A copy varia entre rotas, a estrutura e sempre essa.

URLs sequencia: {{URL_REDIR}}?utm_source=sequence&utm_campaign={{UTM_CAMPAIGN}}&utm_medium={{NOMEDAPAGINA}}&utm_term=sequence&utm_content=seq1-<nicho>
URLs onboard: {{URL_REDIR}}?utm_source=onboard&utm_campaign={{UTM_CAMPAIGN}}&utm_medium={{NOMEDAPAGINA}}&utm_term=onboard&utm_content=onb1-<nicho>
Variaveis: {{FIRST_NAME}}, {{URL_REDIR}}, {{UTM_CAMPAIGN}}, {{NOMEDAPAGINA}}

FLUXO DE COMENTARIOS CHATDRINK (captacao de lead organico via comentarios) - FORMATO NOVO:
{ "name":"<Nome>", "type":"comment", "active":true,
  "is_master":false, "master_flow_id":null, "locale":null, "translate_status":null,
  "routes":[ { "id":"route_0","name":"Rota 1","sort_order":0,"color":null,
    "interactions":[ { "type":"mensagem","config":{
      "text":"<mensagem de abertura da persona, instigante, com emojis, termina com 👇>",
      "quick_replies":[ {"label":"<emoji + texto curto>","action_type":"route","target_route":"","target_flow":""} (5 quick_replies) ]
    }, "sort_order":0 } ] } ],
  "comment_trigger":{"reply_public":true,"reply_public_text":"<resposta publica automatica no comentario, ex: mandei DM, checa o inbox>","active":true} }
- SO uma rota, UMA mensagem + 5 quick_replies. target_route/target_flow vazios (usuario liga no painel).
- reply_public:true = a pagina responde PUBLICAMENTE o comentario (prova social). reply_public_text e essa resposta.
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
  { id: 'fem_sensual', label: 'Feminina sensual (misteriosa / provocante)',
    voice: 'Voz feminina sensual, misteriosa e provocante: cria tensão e curiosidade, fala em segredos, desejos e promessas não ditas, elegante e confiante, seduz pelo mistério — nunca vulgar nem explícita.' },
  { id: 'masc_financeiro', label: 'Masculino financeiro (consultor de credito)' },
  { id: 'fem_financeira', label: 'Feminina financeira (consultora de credito)' },
  { id: 'fem_beauty', label: 'Feminina beauty (especialista em beleza)' },
  { id: 'neutro_amigo', label: 'Neutro amigavel (assistente proximo)' },
  { id: 'fem_crista', label: 'Feminina crista (fe / mensagem de Deus)' },
  { id: 'fem_crista_magnetica', label: 'Feminina crista magnetica (fe + romance)',
    voice: 'Voz feminina cristã com charme magnético: romântica e devota, fala de amor como destino e bênção, mistura fé (oração, sinais de Deus) com um toque sutil de sedução e mistério — acolhedora, envolvente, jamais vulgar.' },
  { id: 'masc_pastor', label: 'Masculino pastor (lider espiritual / pregador)' },
  { id: 'fem_anjo', label: 'Feminina angelical (anjo da guarda / mensageira)' },
  { id: 'masc_avo', label: 'Masculino avo sabio (vovo conselheiro)' },
  { id: 'fem_avo', label: 'Feminina avo acolhedora (vovo carinhosa)' },
  { id: 'fem_coach', label: 'Feminina coach (motivacional / autoajuda)' },
  { id: 'masc_coach', label: 'Masculino coach (mentor / disciplina)' },
  { id: 'fem_astrologa', label: 'Feminina astrologa (signos / horoscopo)' },
  { id: 'masc_tecnologico', label: 'Masculino tech (early adopter / gadgets)' },
  { id: 'fem_maternal', label: 'Feminina maternal (mae cuidadosa / familia)' },
  { id: 'masc_esportivo', label: 'Masculino esportivo (torcedor / comentarista)' },
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

const COUNTRIES = [
  { id: 'BR', label: 'Brasil' }, { id: 'US', label: 'Estados Unidos' },
  { id: 'DE', label: 'Alemanha' }, { id: 'IT', label: 'Italia' },
  { id: 'FR', label: 'Franca' }, { id: 'ES', label: 'Espanha' },
  { id: 'PT', label: 'Portugal' }, { id: 'MX', label: 'Mexico' },
  { id: 'AR', label: 'Argentina' }, { id: 'CO', label: 'Colombia' },
  { id: 'CL', label: 'Chile' }, { id: 'PE', label: 'Peru' },
  { id: 'RO', label: 'Romenia' }, { id: 'PL', label: 'Polonia' },
  { id: 'GB', label: 'Reino Unido' }, { id: 'IE', label: 'Irlanda' },
  { id: 'NL', label: 'Holanda' }, { id: 'BE', label: 'Belgica' },
  { id: 'AT', label: 'Austria' }, { id: 'CH', label: 'Suica' },
  { id: 'SE', label: 'Suecia' }, { id: 'NO', label: 'Noruega' },
  { id: 'DK', label: 'Dinamarca' }, { id: 'FI', label: 'Finlandia' },
  { id: 'GR', label: 'Grecia' }, { id: 'CZ', label: 'Republica Tcheca' },
  { id: 'HU', label: 'Hungria' }, { id: 'BG', label: 'Bulgaria' },
  { id: 'SK', label: 'Eslovaquia' }, { id: 'HR', label: 'Croacia' },
  { id: 'CA', label: 'Canada' }, { id: 'AU', label: 'Australia' },
  { id: 'NZ', label: 'Nova Zelandia' }, { id: 'ZA', label: 'Africa do Sul' },
  { id: 'IN', label: 'India' }, { id: 'AE', label: 'Emirados Arabes' },
  { id: 'SA', label: 'Arabia Saudita' }, { id: 'TR', label: 'Turquia' },
  { id: 'JP', label: 'Japao' }, { id: 'KR', label: 'Coreia do Sul' }
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
  return OPERATION_KNOWLEDGE + "\n\n" + CHATDRINK_FORMAT +
    "\n\nIMPORTANTE: responda SEMPRE so com JSON valido conforme o schema pedido, sem texto fora do JSON, sem markdown, sem crases. Use aspas duplas. Nao trunque. Feche todas as chaves e colchetes.";
}

module.exports = {
  PERSONAS, LANGUAGES, CURRENCIES, COUNTRIES, CREATIVE_PLATFORMS, CREATIVE_SIZES,
  buildSystemPrompt, CHATDRINK_FORMAT
};
