# NEXUS → WordPress: análise do blog.miawzy.com e requisitos do Publisher (P1/P2)

Levantamento feito via REST com usuário administrador (senha de aplicação), 08/11/2026.
Objetivo: o Nexus criar P1 e P2 completos nos blogs, com grid MIRB e Quiz Overlay no lugar,
links reais entre eles e SEO preenchido. (Credenciais NÃO ficam neste documento.)

---

## 1. O que o blog tem hoje (inventário)

**Stack**: WP com tema próprio `carina` (família "Nebula"), permalink `/%post_id%/%postname%/`
(`/3086/` sozinho também resolve → URL canônica curta por ID). 318 posts, 1 usuário (Andhy, admin).
Idioma pt_BR; **[Moodlr] Translate 1.15.3** serve o mesmo post em 9 idiomas por rota
(`/en/*`, `/es/*`, `/de/*`…) via worker — ou seja, um post publicado em PT já vira multi-GEO.

**Plugins relevantes pro funil** (todos ativos):

| Plugin | Versão | Como entra no post | REST? |
|---|---|---|---|
| **MIRB GRID** | 1.3.3 | bloco `<!-- wp:mirb/grid {"gridId":6} /-->` (posts antigos: `[mirb_grid id="5"]`) | **NÃO** — grid é criado/importado no admin e referenciado por ID |
| **[MBZ] Quiz Overlay** | 4.8.2 | bloco `<!-- wp:quiz-overlay/block {…config completa inline…} /-->` | não precisa — a config do offerwall vai **inteira dentro do bloco** |
| Botões Inteligentes Internos | 6.1.1 | bloco `<!-- wp:botoes-internos/app-block {"url":…,"urlPlay":…} /-->` (CTA de app — nicho Shein) | — |
| CardLink | 2.0.3 | bloco `cardlink/card` (posts de abr/2026; não usado nos novos) | — |
| Ad Inserter | 2.8.20 | **automático** (viewports) — o conteúdo NÃO leva código de anúncio | — |
| Yoast SEO | 28.8 | meta `_yoast_wpseo_focuskw/_title/_metadesc` | **sim**: ability `yoast-seo/update-post-seo-data` (+ rota `custom/v1/add-yoast-meta` do Andhy) |
| [Moodlr] Translate | 1.15.3 | tradução por rota/idioma, fila + `warm` | sim: `/moodlr-translate/v1/{status,queue,run-queue,warm,purge}` |
| moodlr-deploy | — | **deploy de plugin/tema por REST** (`/moodlr-deploy/v1/plugin`) | sim — é por aqui que uma versão nova do MIRB GRID chega nos 16 blogs |
| Imagify | 2.3.4 | otimiza mídia enviada | abilities `imagify/*` |
| AI Automation Lite (Passo 5), Ymir Writing, [Moodlr] General Functions | — | pipeline atual de conteúdo (posts de nov saíram daqui: imagens `wp_XXXXXX.jpg` 1080×720) | — |

Namespaces REST ativos: `wp/v2`, `wp-abilities/v1`, `mcp` (MCP Adapter, 405 em GET), `moodlr-deploy/v1`,
`moodlr-translate/v1`, `custom/v1`, `adreco/v1`, `zero-broken/v1`, `yoast/v1`, `ad-inserter/v1`.
**Nenhum** namespace do MIRB GRID nem do Quiz Overlay.

---

## 2. Anatomia real dos posts (geração nov/2026 — Shein, categoria "Aplicativos" id 233)

### P1 (ex.: #3069 "Shein Grátis: Resgate $100 Agora!") — 1.231 palavras
Ordem exata do conteúdo:
1. `<!-- wp:mirb/grid {"gridId":6} /-->` — **grid no TOPO**
2. `<!-- wp:quiz-overlay/block {…} /-->` — offerwall (config inline, ver §3)
3. 3 parágrafos de abertura (gancho + "eu" da persona, 1ª pessoa)
4. H2 → parágrafos; `botoes-internos/app-block` logo após o 1º H2
5. 8–10 H2 temáticos, 1 `wp:table` comparativa, 1 `wp:image` (upload próprio) perto do fim
6. Fechamento reflexivo/consciente (sem CTA agressivo — o CTA é o grid/offerwall)
- Imagem destacada: upload próprio 1080×720 JPEG (`featured_media`)
- Yoast: `focuskw` = título; `metadesc` = título + 1ª frase (~155 chars); `_yoast_wpseo_title` vazio
- 6 tags geradas por post; 1 categoria
- Blocos Gutenberg nos P1 (`wp:paragraph`, `wp:heading`, `wp:list`, `wp:table`, `wp:image`)

### P2 (ex.: #3086, #3082, #3078, #3074) — 1.150–1.320 palavras
- **HTML clássico puro** (`<p>`, `<h2>`, `<h3>`, `<strong>`) — sem comentários de bloco, exceto 1
  `botoes-internos/app-block` após o 1º H2
- Sem grid, sem offerwall (o P2 é destino; monetiza por Ad Inserter automático)
- Voz da persona em 1ª pessoa ("Como enfermeira, sei o quanto…") → **a persona do Nexus entra no texto**
- Estrutura: 3 parágrafos de abertura → H2 "como funciona" → H2 passo a passo com H3 numerados (1.–5.)
  → H2 promoções/sazonal → H2 golpes/segurança → H2 como verificar → H2 estratégia → H2 "vale a pena?"
- Mesmo padrão de featured image, Yoast, 6 tags, categoria

### Grid 6 renderizado (o que liga P1 → P2)
```
<div class="mirb-grid-wrapper mirb-grid-single-block mirb-grid-style-dark" data-grid-id="6" data-src-tracking="true">
  <a href="https://blog.miawzy.com/3074/?src=3069" class="mirb-grid-item" data-url="https://blog.miawzy.com/3074/">
    <img src="https://images.pexels.com/photos/8386655/pexels-photo-8386655.jpeg"> Roupas: Candidate-se à Avaliação
```
- `item_link` = **URL por ID do P2** (`{home}/{post_id}/`); o plugin acrescenta `?src={P1 id}` (tracking)
- `item_image` = URL Pexels real (formato ago/2026 ✓ — igual ao que o Nexus v4 já gera)
- 2 colunas; título, subtítulo, footer line + highlight; CSS custom inline `mirb-grid-custom-6`

### Posts antigos (abr/2026 e dez/2025) — 2.000–2.700 palavras
`wp:heading` → `wp:shortcode [mirb_grid id="5"]` → parágrafos → `quiz-overlay/block` → `cardlink/card`
(link externo) → listas/tabelas/imagens. Serve de referência do formato shortcode, mas o padrão atual é o bloco.

---

## 3. Quiz Overlay — como o bloco carrega o offerwall (crítico)

O bloco `quiz-overlay/block` NÃO tem atributos registrados no servidor (registro só em JS) → aceita
qualquer JSON. O P1 #3069 usa:
```json
{"qlist":[{"title":"Você toparia receber produtos grátis para testar?","options":["Com certeza","Talvez","Não tenho interesse"]}],
 "require_completion":false,"require_rewarded_fill":true,"experience_type":"direct_offerwall",
 "offerwall_mode":"instant_reward","offerwall_eyebrow":"PONTOS E INDICAÇÃO",
 "offerwall_title":"…","offerwall_body":"…","offerwall_icon":"🎀","offerwall_highlight":"…",
 "offerwall_meta_text":"Quanto vale cada ação • Como resgatar","offerwall_cta_label":"Ver Como Juntar",
 "offerwall_timer_enabled":true,"offerwall_timer_label":"…","offerwall_expired_title":"…",
 "offerwall_expired_note":"…","theme_palette":"candy"}
```
Conclusão: o `overlay` que o Nexus já monta (`assembleOfferwalls`, schema v2) é **colado direto como
atributos do bloco**. Diferenças a tratar:
- O bloco leva um `qlist` com 1 pergunta de 3 opções mesmo no modo offerwall (fallback/engajamento) →
  o prompt do offerwall passa a gerar `qlist[0]` (título + 3 opções).
- Campos que o Nexus exporta e o bloco omite (usa default do plugin): `id`, `cooldown_min`,
  `open_delay_ms`, `ad_mode`, `rewarded_wait_ms`, `rewarded_max_wait_ms`, `offerwall_provider`,
  `offerwall_destination_url`, `offerwall_timer_seconds`. Enviar não quebra (JSON livre), mas o
  Publisher deve montar o bloco só com o subconjunto acima pra ficar idêntico ao padrão.
- **NÃO** precisa importar JSON no painel do plugin. Zero dependência de REST do QO.

---

## 4. MIRB GRID — o único bloqueio real

- O bloco só referencia `gridId`. O grid em si (título, subtítulo, itens, CSS) vive na storage do plugin
  e hoje é criado via import no admin.
- Senha de aplicação **só autentica REST/XML-RPC** — não dá pra usar `admin-ajax`/`admin-post` do plugin.
- Não há ability nem rota MCP pro MIRB GRID.

**Necessidade #1 (no plugin MIRB GRID, não no Nexus):** uma rota REST autenticada, ex.:
```
POST /wp-json/mirb-grid/v1/grids        body = JSON de importação {version, grid:{…}, items:[…]}
  → 201 { "grid_id": 7, "shortcode": "[mirb_grid id=\"7\"]", "block": "<!-- wp:mirb/grid {\"gridId\":7} /-->" }
PUT  /wp-json/mirb-grid/v1/grids/{id}    (atualizar itens — ex.: trocar links depois de publicar P2s)
GET  /wp-json/mirb-grid/v1/grids/{id}
```
Permissão `manage_options` ou `edit_posts`; reaproveitar a função de import que o admin já usa.
Como o blog tem `moodlr-deploy/v1/plugin`, a versão 1.4.0 do MIRB GRID sobe nos 16 blogs por REST.

---

## 5. O que o Nexus consegue fazer HOJE só com o `wp/v2` (sem mexer em plugin)

| Ação | Endpoint | Status |
|---|---|---|
| Criar/atualizar post (título, slug, conteúdo HTML/blocos, status, categoria, tags, excerpt) | `POST /wp/v2/posts`, `POST /wp/v2/posts/{id}` | ✅ |
| Upload da imagem destacada e das imagens internas | `POST /wp/v2/media` (multipart) → `featured_media` | ✅ |
| Criar tags que não existem | `POST /wp/v2/tags` | ✅ |
| Descobrir/criar categoria do nicho | `GET/POST /wp/v2/categories` | ✅ |
| SEO (focus keyword, meta description, SEO title) | `POST /wp-abilities/v1/abilities/yoast-seo/update-post-seo-data/run` com `{post_id, seo_title, meta_description, focus_keyphrase…}` | ✅ |
| Embutir o offerwall | bloco `quiz-overlay/block` inline no conteúdo | ✅ |
| Embutir o CTA de app | bloco `botoes-internos/app-block` inline | ✅ |
| Disparar/aquecer traduções | `/moodlr-translate/v1/warm` ou `run-queue` (confirmar payload com Andhy) | ⚠️ |
| Criar o grid | — | ❌ precisa da rota do §4 |

---

## 6. Fluxo proposto do Publisher no Nexus ("P1 + P2 + links reais")

Blocos novos no grafo (`BLOCK_META`):
- `p2_posts` (deps: `p2_titles`, `grid_preview`, `persona_identity`) — um artigo por item do grid,
  1.150–1.300 palavras, HTML clássico, voz da persona, estrutura do §2.
- `p1_posts` (deps: `p1_titles`, `quiz`, `grid`, `p2_posts`) — um artigo por P1, 1.200 palavras em
  blocos Gutenberg, com `qlist` + offerwall + grid.
- `post_images` (deps: `p1_posts`,`p2_posts`) — prompt/termo de foto destacada por post (Pexels/Pixabay
  via `lib/photos.js` já existente) ou geração.

Ordem de publicação (uma "Publicar no blog X" por funil, com progresso SSE):
1. Resolve categoria (nicho → `categories`, cria se faltar) e tags.
2. **Publica os P2s** (`status` configurável: draft/publish) com featured image → coleta `{id, link}`.
3. Monta o JSON do grid com `item_link = {home}/{p2_id}/` (adeus busca do Pinterest) e
   `item_image` já resolvido → `POST /mirb-grid/v1/grids` → `gridId`.
4. Publica cada P1: `wp:mirb/grid {gridId}` + `wp:quiz-overlay/block {offerwall do P1}` + corpo.
5. Yoast em todos (ability); opcional: `moodlr-translate warm`.
6. Devolve pro Nexus: tabela P1/P2 com URLs, grid id, e **atualiza o card do grid** com os links reais
   (o JSON de export fica correto pra reuso).
7. O `item_link` dos P2s nos **onboard/sequência** continua `{{URL_REDIR}}` (ChatDrink resolve) — mas o
   Nexus passa a saber as URLs reais dos P1 pra preencher o redirecionador/relatório.

Configuração: aba **Blogs** no Nexus — `{nome, url, usuário, senha de aplicação}` por blog, guardado
no volume do Railway (`DATA_DIR/blogs.json`, cifrado com chave derivada de `ACCESS_PASSWORD` ou de
`BLOGS_SECRET`). Cada usuário escolhe o blog alvo no passo 5. Senha de aplicação por blog e por
usuário do WP (a conta `andhy` é admin; o ideal é uma conta "nexus" com papel Editor em cada blog).

---

## 7. Lista completa de necessidades

**No WordPress / plugins (lado Andhy/Teteu):**
1. Rota REST no MIRB GRID (create/update/get) — §4. Única dependência bloqueante.
2. Confirmar payload de `/moodlr-translate/v1/warm` e se a tradução é automática ao publicar.
3. (Opcional) conta WP "nexus" (Editor) em cada blog + senha de aplicação; ou usar a existente.
4. (Opcional) categoria padrão por nicho nos 16 blogs (ou o Nexus cria sob demanda).

**No Nexus:**
5. Prompts `p1_posts` e `p2_posts` calibrados nos posts reais (estrutura, tamanho, voz da persona,
   tom "consciente/seguro" do fechamento, tabela comparativa, H3 numerados no passo a passo).
6. `qlist` (1 pergunta + 3 opções) adicionado ao prompt/assembler do offerwall; montador do bloco
   `quiz-overlay/block` a partir do `overlay`.
7. Montador do bloco `botoes-internos/app-block` quando o nicho for app (URL da loja como parâmetro).
8. `lib/wp.js`: cliente REST (Basic auth), upload de mídia, posts, tags/categorias, Yoast ability,
   grid (quando a rota existir), com retry e relatório por item.
9. Featured image: reusar `lib/photos.js` (termo por post) → download → `POST /wp/v2/media`
   (atenção: o container do Railway precisa de saída pra Pexels/Pixabay e pro blog — ok).
10. UI: aba Blogs, seletor de blog + status (draft/publish) no passo 5, card "Publicação" com progresso
    e tabela de URLs; botão "republicar só o grid" após editar.
11. Segurança: credenciais nunca no front; endpoint `/api/publish` autenticado pela senha do Nexus;
    log de publicação no histórico.

**Perguntas em aberto:**
- O `?src=` tracking e o `data-src-tracking` são do MIRB GRID — tem relatório que o Nexus deveria
  alimentar (ex.: PULSE)?
- Posts saem como `publish` direto ou `draft` pra revisão da equipe?
- Imagens internas dos artigos: continuar com 1 upload próprio por post (como hoje) ou só a destacada?
- O pipeline "AI Automation Lite / Ymir Writing" continua pros posts fora de funil? (evitar duplicar.)

---

## 8. Decisões (08/11/2026, tarde)

- **Status de publicação: `draft`** — o Nexus cria P1/P2 como rascunho; a equipe revisa e publica.
- **Rota REST do MIRB GRID: FEITA** — plugin v1.4.0 em `Documentos\mirb-grid` (`includes/class-mirb-grid-rest.php`):
  `GET/POST /wp-json/mirb-grid/v1/grids`, `GET/PUT /wp-json/mirb-grid/v1/grids/{id}`. Mesma whitelist do import
  (`MIRB_Grid_Admin::whitelist_import_grid/item`, agora `public static`), escrita via `save_grid_with_items()`
  (transação), capability padrão `edit_others_posts` (filtro `mirb_grid_rest_capability`). PUT parcial herda os
  campos atuais. Resposta traz `grid_id`, `shortcode`, `block` (`<!-- wp:mirb/grid {"gridId":N} /-->`) e `edit_url`.
  10/10 testes de contrato verdes; `php -l` ok; harness com stubs do WP validou create/update/404/400/401.
  Release: ZIP pela allowlist do README (agora 26 arquivos) → `moodlr-deploy/v1/plugin` nos 16 blogs.
- **Usuário `nexus` (Editor) por blog: recomendado** — ver §9.

## 9. Por que um usuário `nexus` (papel Editor) em cada blog

- Menor privilégio: Editor publica posts, mídia, tags e categorias, e passa na rota do grid (`edit_others_posts`),
  mas NÃO instala plugins, não muda configurações nem cria usuários — se a senha de aplicação vazar, o estrago é
  limitado a conteúdo (reversível).
- Revogação cirúrgica: apagar a senha de aplicação do `nexus` corta só a automação; a conta do Andhy continua.
- Auditoria: rascunhos e grids "do Nexus" ficam visíveis como tal; se a equipe quiser o byline do Andhy, o Nexus
  manda `author: 1` na criação (Editor pode definir autor).
- Operação: 1 senha de aplicação por blog, gerada no perfil do `nexus` → cadastrada na aba Blogs do Nexus.
  Nome sugerido: `nexus` / e-mail interno; se preferir uma única identidade, dá pra usar `andhy` — mas aí a
  senha de aplicação do admin fica em 16 lugares.
