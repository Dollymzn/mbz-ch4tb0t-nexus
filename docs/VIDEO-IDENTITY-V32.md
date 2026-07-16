# NEXUS v3.2a — Vídeos (Veo/Flow) + Identidade Visual da Persona (contrato)

Dois blocos novos, seguindo os padrões de ARCHITECTURE-V3.md/AGENT-V31.md. Extensão retrocompatível.

## 1. Bloco `persona_identity` — mesmo rosto em todo o funil

**Problema:** cada imagem gerada inventa um rosto → a "pessoa real" da página se desfaz.
**Solução:** um character sheet gerado UMA vez e injetado em todo prompt de imagem/vídeo.

### BLOCK_META
```js
persona_identity: { maxTokens: 2500, deps: [], kind: 'text', requireJson: () => true, postprocess: null,
  artifacts: json => (json && json.identity) ? { personaIdentity: json.identity } : undefined }
```
Entra em KNOWN_BLOCKS (bloco real; testes de contagem passam de 16 → 18 — mudança INTENCIONAL).

### Prompt (case em buildBlockPrompt)
Inputs: ctx atual (niche, pageName, geoCountry, campaignLang, personaLine com voice).
Gera uma PESSOA REAL adulta, coerente com nome/país-alvo/nicho. A descrição vai pra geradores
de imagem → 100% em INGLÊS e ESPECÍFICA o bastante pra reproduzir o MESMO rosto sempre
(ex: "wavy chestnut shoulder-length hair with a side part", nunca "brown hair"). Sem marcas.

### Output
```jsonc
{"identity":{
  "character_name":"<pageName ou nome coerente>",
  "core":"<parágrafo EXATO em EN, 60-100 palavras: idade, etnia coerente com o GEO, cabelo (cor/textura/comprimento/estilo), olhos, traços faciais, pele, corpo, expressão padrão>",
  "wardrobe":["outfit assinatura 1 com cores exatas","outfit 2"],
  "palette":["cor dominante","acento"],
  "photo_style":"<iluminação + lente + mood assinatura, EN>",
  "avoid":"<o que NUNCA mudar, EN>"
}}
```

### Injeção — helper `personaIdentityLine(p)` em blocks.js
Se `p.personaIdentity && p.personaIdentity.core`, retorna:
```
IDENTIDADE VISUAL FIXA DA PERSONA (OBRIGATÓRIO: use EXATAMENTE esta descrição física,
palavra por palavra, em TODO prompt de imagem/vídeo em que a persona apareça — é a MESMA
pessoa em todas as imagens do funil): "<core>" Guarda-roupa assinatura: <wardrobe ; >.
Estilo fotográfico: <photo_style>. NUNCA altere: <avoid>.
```
**Injetar em:** fb_images (logo após a REGRA-MÃE), image_prompts, creatives_prompt (branches
completo E imgOnly) e video_prompts.
**PROIBIDO injetar em `creative_analysis`** — esse bloco é 100% dirigido pela imagem enviada
(regressão de contaminação já corrigida; não reintroduzir).

### Deps (soft, como sempre)
`fb_images`, `image_prompts`, `creatives_prompt`, `video_prompts` ganham `'persona_identity'`
nas deps. Fora da run → sem efeito (retrocompat).

### Frontend
- NÃO entra no block picker (mesmo padrão do grid_preview): **auto-inject** no runForge —
  se a run contém qualquer um de [fb_images, image_prompts, creatives_prompt, video_prompts]
  e `persona_identity` não está na lista e `!state.artifacts.personaIdentity` → unshift no array.
- genFbPhotos (passo 1): `blocks: state.artifacts.personaIdentity ? ['fb_images'] : ['persona_identity','fb_images']`.
- Render: card "Identidade Visual" — character_name, core, wardrobe, palette, photo_style + copiar.
- Stale map (regen): regenerar `persona_identity` marca fb_images/image_prompts/creatives_prompt/video_prompts como "desatualizado".

## 2. Bloco `video_prompts` — criativos de vídeo Veo 3 / Google Flow

### BLOCK_META
```js
video_prompts: { maxTokens: 20000, deps: ['creatives_prompt','audios','persona_identity'],
  kind: 'text', requireJson: () => true, postprocess: null }
```
Entra em KNOWN_BLOCKS.

### Novo artifact do bloco `audios`
```js
audios.artifacts = json => ({ audiosContext:
  (json.audios||[]).map(a => '#'+a.index+' ['+(a.voice||'')+'] '+String(a.script||'').slice(0,140))
    .join('\n').slice(0,2500) })
```

### Guia de plataforma — nova entrada `veo_flow` em PLATFORM_GUIDES
(usada só pelo bloco de vídeo; NÃO entra no seletor de plataformas de imagem)
```
REGRAS PARA VEO 3 / GOOGLE FLOW (vídeo): cada prompt descreve UM clipe de ~8 segundos em
frases naturais em inglês. Estrutura: (1) personagem e cena; (2) BEATS com tempo: hook
visual forte em 0-2s (movimento/surpresa que para o dedo), desenvolvimento 2-6s, CTA 6-8s;
(3) câmera explícita (handheld close-up, slow dolly-in, static tripod); (4) iluminação
NOMEADA; (5) FALA: o Veo gera áudio — inclua o diálogo falado ENTRE ASPAS no idioma da
campanha com she says/he says, CURTO (máx ~20 palavras por clipe); (6) sfx/ambiente quando
somar; (7) composição vertical 9:16 pensada pra Reels/Stories; (8) todo prompt termina com:
", vertical 9:16 composition, no subtitles, no captions, no watermark". PROIBIDO: --ar/--v,
keyword-spam, diálogo longo demais pra 8s, legendas.
```

### Prompt (case)
- Gera EXATAMENTE `p.numVideos` (default 10) vídeos.
- Idioma do diálogo/headline/cta: `campaignLang || contentLang || flowLang` (anúncio falado = idioma do GEO).
- Se `p.creativesContext` existir: vídeo #i é a VERSÃO EM VÍDEO do criativo #i (mesmo gancho/headline/CTA).
- Se `p.audiosContext` existir: o diálogo do vídeo #i é versão CONDENSADA (1-2 frases, ≤20 palavras)
  da MESMA ideia do áudio #i — nunca o script inteiro (8s de clipe).
- CTA renderizado como elemento do beat final (botão/texto animado entrando em 6-8s).
- Injeta personaIdentityLine(p) quando presente.
- Gancho gamificado como nos criativos.

### Output
```jsonc
{"platform":"veo_flow","format":"9:16","videos":[
  {"index":1,"concept":"<1 frase>","beats":{"hook_0_2s":"...","body_2_6s":"...","cta_6_8s":"..."},
   "dialogue":"<fala no idioma da campanha>","prompt":"<Veo prompt completo EN pronto pra colar>",
   "headline":"...","cta":"..."}]}
```

### Rubrica (REVIEW_RUBRICS.video_prompts — para o botão Analisar)
1. Hook 0-2s forte (0-2): movimento/surpresa que segura o dedo. 2. Diálogo (0-2): curto (≤20
palavras), idioma da campanha, entre aspas com she/he says. 3. Formato Veo (0-2): frases
naturais EN, 9:16, no subtitles/captions, sem --ar/keyword-spam. 4. CTA no beat final (0-1):
renderizado, imperativo. 5. Variedade (0-2): mecânicas/cenas distintas entre vídeos.
6. Persona/gancho (0-1): identidade respeitada quando presente + gancho gamificado.

### Frontend
- Passo 4: toggle "🎬 Vídeos (Veo/Flow)" (id `wantVideos`) + stepper `numVideos` (1-20, default 10),
  mesmo padrão de wantAudios/wantCreatives; entra em CHECK_IDS/FIELD_IDS (draft/presets) e syncBlockToggles.
- Picker: { id:'video_prompts', name:'Vídeos (Veo)', hint:'clipes 8s', kind:'text', def:false, needsToggle:'wantVideos' }.
- Render: card com #index, concept, beats (3 linhas), dialogue destacado, prompt com copiar por vídeo; cleanText p/ copiar tudo.
- Stale: video_prompts fica "desatualizado" quando creatives_prompt, audios ou persona_identity regeneram.

## 3. Testes (mudanças intencionais)
- KNOWN_BLOCKS: 16 → 18 (atualizar asserts de contagem/conjunto).
- Novos: meta/artifacts dos 2 blocos; injeção do identity nos 4 blocos e AUSÊNCIA no
  creative_analysis; prompt de vídeo contém beats/9:16/"no subtitles"/idioma da campanha;
  audiosContext gerado; deps do grafo.
