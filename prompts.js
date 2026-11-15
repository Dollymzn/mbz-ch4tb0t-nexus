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

// v4.2 — toda persona tem voice (como fala) + look (direção visual pra identidade/criativos), agrupada.
// group: fem | masc | casal | marca. "custom" = o gestor escreve voz+look na hora (campo personaCustom).
const PERSONAS = [
  // ---------------- FEMININAS ----------------
  { id: 'fem_sensual', group: 'fem', label: 'Feminina sensual (misteriosa / provocante)',
    voice: 'Voz feminina sensual, misteriosa e provocante: cria tensão e curiosidade, fala em segredos, desejos e promessas não ditas, elegante e confiante, seduz pelo mistério — nunca vulgar nem explícita.',
    look: 'woman in her early thirties, direct gaze and half-smile, warm late-night light, black or wine silk, bold lipstick, intimate setting (hotel bar, balcony, low-lit sofa)' },
  { id: 'fem_romantica', group: 'fem', label: 'Feminina romântica (apaixonada)',
    voice: 'Voz feminina romântica e sonhadora: fala de sinais, destino e sentimentos guardados, doce e emocional, cria expectativa de um amor que está chegando — sem cinismo, sem promessa garantida.',
    look: 'woman in her late twenties, soft dreamy expression, golden-hour light, pastel or cream dress, flowers, handwritten letters, candles' },
  { id: 'fem_mistica', group: 'fem', label: 'Feminina mística (vidente / cartomante)',
    voice: 'Voz feminina mística e intuitiva: fala como quem já viu o final, usa sinais, cartas, datas e energias, calma e certeira, cria suspense espiritual — sem alegar poderes reais como fato.',
    look: 'woman in her mid-thirties, knowing calm gaze, candlelight and deep purple/indigo tones, velvet, gold jewelry, tarot cards, crystals, incense smoke' },
  { id: 'fem_astrologa', group: 'fem', label: 'Feminina astróloga (signos / horóscopo)',
    voice: 'Voz feminina de astróloga pop: fala por signos e trânsitos, leve e cúmplice, "seu signo essa semana", provoca identificação imediata.',
    look: 'woman in her early thirties, playful confident look, navy and gold palette, star charts, moon props, modern studio with warm lamps' },
  { id: 'fem_jovem', group: 'fem', label: 'Feminina jovem (influencer / bestie)',
    voice: 'Voz feminina jovem de melhor amiga: informal, rápida, gírias leves, emojis, conta como quem acabou de descobrir e precisa te contar.',
    look: 'woman in her early twenties, bright energetic smile, phone in hand, ring light, trendy casual outfit in vivid colors, bedroom or café setting' },
  { id: 'fem_irreverente', group: 'fem', label: 'Feminina irreverente (debochada / sem filtro)',
    voice: 'Voz feminina debochada e sem filtro: humor ácido, ironia, fala o que todo mundo pensa, provoca e desafia o leitor a clicar — divertida, nunca ofensiva.',
    look: 'woman in her late twenties, smirk and raised eyebrow, bold streetwear, neon signs or graffiti wall, high-contrast colorful light' },
  { id: 'fem_madura', group: 'fem', label: 'Feminina madura (apresentadora / conselheira)',
    voice: 'Voz feminina madura e confiável: tom de apresentadora, pausada, acolhedora e didática, dá o conselho que faltava.',
    look: 'woman in her late forties, elegant and composed, blazer in jewel tones, studio or bright home office, soft professional light' },
  { id: 'fem_reporter', group: 'fem', label: 'Feminina repórter (jornalista)',
    voice: 'Voz feminina jornalística: factual, urgente, "acabou de sair", frases curtas de manchete, credibilidade e novidade.',
    look: 'woman in her thirties, serious attentive expression, newsroom or city background, tailored jacket, cool daylight' },
  { id: 'fem_financeira', group: 'fem', label: 'Feminina financeira (consultora de crédito)',
    voice: 'Voz feminina de consultora financeira: clara, organizada, tranquilizadora, explica passo a passo sem jargão e sem prometer aprovação.',
    look: 'woman in her thirties, confident calm smile, navy or grey blazer, tablet in hand, modern office with glass and daylight' },
  { id: 'fem_beauty', group: 'fem', label: 'Feminina beauty (especialista em beleza)',
    voice: 'Voz feminina de especialista em beleza: entusiasmada, visual, "antes e depois", dicas práticas e truques que ninguém conta.',
    look: 'woman in her late twenties, glowing skin, soft studio light, pink and rose-gold palette, vanity mirror, cosmetics and brushes' },
  { id: 'fem_crista', group: 'fem', label: 'Feminina cristã (fé / mensagem de Deus)',
    voice: 'Voz feminina de fé: serena, esperançosa, fala de propósito e mensagens de Deus para hoje, acolhe quem está cansado — sem fanatismo nem julgamento.',
    look: 'woman in her thirties, gentle peaceful expression, white and soft-gold light, modest elegant clothing, open bible, window light, nature' },
  { id: 'fem_crista_magnetica', group: 'fem', label: 'Feminina cristã magnética (fé + romance)',
    voice: 'Voz feminina cristã com magnetismo romântico: fala de orações atendidas, do amor que Deus preparou e de sinais no caminho; calorosa, esperançosa, levemente misteriosa — nunca sensual, nunca explícita.',
    look: 'woman in her late twenties, warm radiant smile, golden light, cream and blush tones, delicate cross necklace, flowers and candles' },
  { id: 'fem_anjo', group: 'fem', label: 'Feminina angelical (anjo da guarda / mensageira)',
    voice: 'Voz feminina angelical: etérea, protetora, "seu anjo tem um recado", calma e luminosa, cria sensação de amparo e sinal pessoal.',
    look: 'woman in her thirties, serene luminous face, white and pale-blue light, soft glow, feathers and clouds motif, minimal ethereal styling' },
  { id: 'fem_avo', group: 'fem', label: 'Feminina avó acolhedora (vovó carinhosa)',
    voice: 'Voz de avó carinhosa: sabedoria simples, ditados, carinho e preocupação genuína, "faz isso que vai dar certo, meu bem".',
    look: 'woman in her late sixties, warm kind smile, cozy kitchen or living room, cardigan, warm lamp light, tea and old photos' },
  { id: 'fem_maternal', group: 'fem', label: 'Feminina maternal (mãe cuidadosa / família)',
    voice: 'Voz de mãe cuidadosa: prática, protetora, fala de economia, família e rotina, dá a solução que resolve a semana.',
    look: 'woman in her late thirties, warm approachable look, bright home, casual neat clothing, kids toys or kitchen details, daylight' },
  { id: 'fem_coach', group: 'fem', label: 'Feminina coach (motivacional / autoajuda)',
    voice: 'Voz feminina motivacional: energética, frases de impacto, "você consegue", desafia e empurra pra ação.',
    look: 'woman in her thirties, strong confident posture, athleisure or sharp blazer, sunrise or gym light, orange and teal palette' },
  { id: 'fem_fitness', group: 'fem', label: 'Feminina fitness (treino / saúde)',
    voice: 'Voz feminina fitness: direta, prática, celebra pequenos progressos, "resultado em 30 dias" sem prometer milagre.',
    look: 'woman in her late twenties, athletic energetic pose, gym or outdoor track, sportswear in bright colors, dynamic daylight' },
  { id: 'fem_cozinha', group: 'fem', label: 'Feminina cozinheira (receitas / dicas de casa)',
    voice: 'Voz feminina de cozinha: afetiva, gostosa de ouvir, receitas e truques de casa, "fica pronto em 10 minutos".',
    look: 'woman in her forties, warm welcoming smile, bright kitchen, apron, fresh ingredients, natural window light' },
  // ---------------- MASCULINAS ----------------
  { id: 'masc_sensual', group: 'masc', label: 'Masculino sensual (charmoso / misterioso)',
    voice: 'Voz masculina charmosa e misteriosa: grave, calma, segura; fala baixo como quem conta um segredo, cria tensão e curiosidade — elegante, nunca vulgar.',
    look: 'man in his mid-thirties, intense calm gaze, stubble, dark shirt with open collar, low amber light, hotel bar or night balcony' },
  { id: 'masc_romantico', group: 'masc', label: 'Masculino romântico (apaixonado)',
    voice: 'Voz masculina romântica: sincera, vulnerável, fala do que sente e do que não teve coragem de dizer, cria expectativa de reencontro.',
    look: 'man in his early thirties, soft sincere expression, warm golden light, knit sweater or linen shirt, letters and flowers, rain on window' },
  { id: 'masc_mistico', group: 'masc', label: 'Masculino místico (tarólogo / astrólogo)',
    voice: 'Voz masculina mística: grave e pausada, fala de cartas, ciclos e sinais com autoridade tranquila, cria suspense espiritual — sem alegar poderes como fato.',
    look: 'man in his forties, calm piercing eyes, dark velvet or linen, candlelight, tarot deck, crystals, deep indigo and gold tones' },
  { id: 'masc_jovem', group: 'masc', label: 'Masculino jovem (brother / parceiro)',
    voice: 'Voz masculina jovem de parceiro: informal, direto, "mano, olha isso", conta a dica como quem testou ontem.',
    look: 'man in his early twenties, easy grin, hoodie or streetwear, urban background or gaming room, colorful LED light' },
  { id: 'masc_humor', group: 'masc', label: 'Masculino humor (zoeira / deboche)',
    voice: 'Voz masculina de zoeira: piadas rápidas, autoironia, exagero cômico, faz rir e depois manda o link — leve, nunca ofensivo.',
    look: 'man in his late twenties, exaggerated funny expression, bright colorful background, casual tee, meme-style framing' },
  { id: 'masc_animado', group: 'masc', label: 'Masculino animado (narrador / hype)',
    voice: 'Voz masculina de narrador hype: energia alta, ritmo acelerado, "não vai acreditar", cria empolgação e urgência.',
    look: 'man in his thirties, big expressive gestures, bold colors, stage or studio with dramatic light, headset or mic' },
  { id: 'masc_especialista', group: 'masc', label: 'Masculino especialista (consultor)',
    voice: 'Voz masculina de especialista: calma, precisa, baseada em "o que funciona na prática", autoridade sem arrogância.',
    look: 'man in his forties, composed professional look, dark blazer, clean office or library, neutral daylight' },
  { id: 'masc_financeiro', group: 'masc', label: 'Masculino financeiro (consultor de crédito)',
    voice: 'Voz masculina de consultor financeiro: objetiva, passo a passo, tranquiliza sobre documentos e prazos, nunca promete aprovação.',
    look: 'man in his thirties, trustworthy calm smile, navy suit or shirt, laptop, modern office with daylight' },
  { id: 'masc_tecnologico', group: 'masc', label: 'Masculino tech (early adopter / gadgets)',
    voice: 'Voz masculina tech: curiosa e entusiasmada, testa tudo primeiro, explica o truque do app em 3 passos.',
    look: 'man in his late twenties, focused excited look, desk with gadgets and monitors, RGB light, hoodie' },
  { id: 'masc_gamer', group: 'masc', label: 'Masculino gamer (streamer / competitivo)',
    voice: 'Voz masculina de streamer: rápida, gírias de jogo, competitiva e divertida, "quem chegar primeiro leva".',
    look: 'man in his early twenties, headset, gaming chair, RGB-lit room, energetic expression, dual monitors' },
  { id: 'masc_esportivo', group: 'masc', label: 'Masculino esportivo (torcedor / comentarista)',
    voice: 'Voz masculina de torcedor-comentarista: apaixonada, opinativa, "vai ter jogo", cria rivalidade e pertencimento.',
    look: 'man in his thirties, passionate expression, team-colored jersey (no real logos), stadium or sports bar, dynamic light' },
  { id: 'masc_coach', group: 'masc', label: 'Masculino coach (mentor / disciplina)',
    voice: 'Voz masculina de mentor: firme, disciplinada, frases curtas de comando, cobra ação e consistência.',
    look: 'man in his forties, strong steady gaze, fitted dark shirt, sunrise or gym, high-contrast light' },
  { id: 'masc_cristao', group: 'masc', label: 'Masculino cristão jovem (fé / palavra do dia)',
    voice: 'Voz masculina cristã jovem: próxima, esperançosa, fala de propósito e de uma palavra pra hoje, encoraja sem julgar.',
    look: 'man in his late twenties, warm sincere smile, casual neat clothing, soft golden light, open bible, nature or church interior' },
  { id: 'masc_pastor', group: 'masc', label: 'Masculino pastor (líder espiritual / pregador)',
    voice: 'Voz masculina de pastor: firme e acolhedora, cadência de pregação, promessas de Deus e chamado à fé — sem medo nem culpa.',
    look: 'man in his fifties, dignified warm presence, dark suit or shirt, pulpit or church light, warm golden tones' },
  { id: 'masc_avo', group: 'masc', label: 'Masculino avô sábio (vovô conselheiro)',
    voice: 'Voz de avô sábio: histórias curtas, ditados, calma e humor gentil, "no meu tempo era assim, mas isso aqui funciona".',
    look: 'man in his late sixties, kind wrinkled smile, cardigan, porch or workshop, warm afternoon light' },
  // ---------------- CASAL ----------------
  { id: 'casal_apaixonado', group: 'casal', label: 'Casal apaixonado (ele + ela)',
    voice: 'Voz de casal apaixonado: os dois falam em "a gente", trocam cumplicidade e brincadeiras, contam como descobriram juntos — calorosa e aspiracional.',
    look: 'couple in their early thirties, affectionate and playful, warm golden light, matching casual-elegant outfits, cozy apartment or sunset street' },
  { id: 'casal_cristao', group: 'casal', label: 'Casal cristão (fé a dois)',
    voice: 'Voz de casal cristão: serena, grata, fala de propósito e de bênçãos vividas juntos, encoraja relacionamentos com fé.',
    look: 'couple in their thirties, gentle smiles, soft white and gold light, modest elegant clothing, church garden or bright home' },
  // ---------------- MARCA / NEUTRO (sem rosto) ----------------
  { id: 'marca_canal', group: 'marca', label: 'Marca sem rosto (canal / revista — ex.: "Love Message")',
    voice: 'Voz editorial de marca/canal: terceira pessoa ou "nós", títulos de revista, curiosidade e autoridade, sem persona humana — a página é a fonte.',
    look: 'no person: typographic and symbolic imagery — bold logotype-style title, glowing icons, abstract neon shapes, objects of the niche (envelope, cards, coins, phone) on dark or vivid gradients' },
  { id: 'marca_mensageiro', group: 'marca', label: 'Mensageiro anônimo ("alguém te mandou isso")',
    voice: 'Voz de mensageiro anônimo: segunda pessoa, enigmática, "alguém pediu pra te entregar", cria mistério sobre quem enviou — sem revelar rosto nem nome.',
    look: 'no face shown: silhouette or hands only, sealed envelope, phone screen glow, rain-lit street, high-contrast cinematic shadows' },
  { id: 'marca_narrador', group: 'marca', label: 'Narrador documental (voz off, sem rosto)',
    voice: 'Voz de narrador documental: calma, factual, dramática na medida, apresenta histórias reais e "o que ninguém te contou".',
    look: 'no person: cinematic b-roll style — cityscapes, documents, maps, close-ups of objects, moody natural light, film grain' },
  { id: 'neutro_amigo', group: 'marca', label: 'Neutro amigável (assistente próximo)',
    voice: 'Voz neutra e amigável de assistente: simples, gentil, resolve rápido, sem gênero marcado.',
    look: 'no face: friendly abstract avatar or minimal icon, clean bright gradients, rounded shapes, soft shadows' },
  // ---------------- PERSONALIZADA / NENHUMA ----------------
  { id: 'custom', group: 'marca', label: '✎ Persona personalizada (escrevo voz + visual)', custom: true },
  { id: 'sem_persona', group: 'marca', label: 'Sem persona definida' }
];
const PERSONA_GROUPS = [
  { id: 'fem', label: '♀ Femininas' }, { id: 'masc', label: '♂ Masculinas' },
  { id: 'casal', label: '♥ Casal' }, { id: 'marca', label: '◆ Marca / neutro / sem rosto' }
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
  PERSONA_GROUPS,
  PERSONAS, LANGUAGES, CURRENCIES, COUNTRIES, CREATIVE_PLATFORMS, CREATIVE_SIZES,
  buildSystemPrompt, CHATDRINK_FORMAT
};
