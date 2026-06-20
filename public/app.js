// ============================================================
//  MBZ::CH4TB0T NEXUS v2 — Frontend
// ============================================================
(function(){
'use strict';
var CFG=null, ACCESS_PASS=sessionStorage.getItem('mbz_pass')||'', USER_KEY=localStorage.getItem('mbz_key')||'';
var MODEL=localStorage.getItem('mbz_model')||'claude-sonnet-4-6';
var lastBlocks={}, lastParams={}, curStep=1, totalSteps=5;
var $=function(s){return document.querySelector(s)}, $$=function(s){return [].slice.call(document.querySelectorAll(s))};

// blocks meta: kind = 'json-download' (baixa .json) | 'text' (sanitiza pra leitura)
var BLOCKS=[
  {id:'page_name',name:'Nome de Página',hint:'sugestão FB',kind:'text',def:true},
  {id:'fb_images',name:'Fotos da Página',hint:'perfil + capa',kind:'text',def:false},
  {id:'onboard',name:'Onboard',hint:'JSON chatbot',kind:'json-download',def:true},
  {id:'sequence',name:'Sequência',hint:'JSON chatbot',kind:'json-download',def:true},
  {id:'comment',name:'Comentários',hint:'captação orgânica',kind:'json-download',def:false},
  {id:'grid',name:'Grid MIRB',hint:'JSON importável',kind:'json-download',def:true},
  {id:'p1_titles',name:'Títulos P1',hint:'texto',kind:'text',def:true},
  {id:'p2_titles',name:'Títulos P2',hint:'texto',kind:'text',def:true},
  {id:'quiz',name:'Quiz Overlays',hint:'texto',kind:'text',def:true},
  {id:'meta_copy',name:'Copy Meta',hint:'texto',kind:'text',def:true},
  {id:'meta_onboard',name:'Onboard Meta',hint:'texto',kind:'text',def:true},
  {id:'image_prompts',name:'Prompts de Imagem',hint:'fluxo',kind:'text',def:false,needsToggle:'imagePrompts'},
  {id:'creatives_prompt',name:'Criativos',hint:'prompts',kind:'text',def:false,needsToggle:'wantCreatives'},
  {id:'audios',name:'Áudios v3',hint:'ElevenLabs',kind:'text',def:false,needsToggle:'wantAudios'}
];
var BLABEL={}; BLOCKS.forEach(function(b){BLABEL[b.id]=b.name});

document.addEventListener('DOMContentLoaded',function(){
  initFX(); startClock(); loadConfig();
});

/* ---------- particles ---------- */
function initFX(){
  var c=$('#fx'),x=c.getContext('2d'),pts=[],W,H;
  function rs(){W=c.width=innerWidth;H=c.height=innerHeight}
  rs();addEventListener('resize',rs);
  for(var i=0;i<60;i++)pts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3});
  (function loop(){
    x.clearRect(0,0,W,H);
    for(var i=0;i<pts.length;i++){var p=pts[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>W)p.vx*=-1;if(p.y<0||p.y>H)p.vy*=-1;
      x.fillStyle='rgba(0,245,255,.5)';x.fillRect(p.x,p.y,1.4,1.4);
      for(var j=i+1;j<pts.length;j++){var q=pts[j],d=Math.hypot(p.x-q.x,p.y-q.y);if(d<120){x.strokeStyle='rgba(0,245,255,'+(.12*(1-d/120))+')';x.beginPath();x.moveTo(p.x,p.y);x.lineTo(q.x,q.y);x.stroke()}}}
    requestAnimationFrame(loop)})();
}
function startClock(){var e=$('#clock');setInterval(function(){e.textContent=new Date().toTimeString().slice(0,8)},1000)}

/* ---------- config / auth ---------- */
function loadConfig(){
  fetch('/api/config').then(function(r){return r.json()}).then(function(cfg){
    CFG=cfg;
    fillSel('#flowLang',cfg.languages,'id','label','en-US');
    fillSel('#contentLang',cfg.languages,'id','label','pt-BR');
    fillSel('#campaignLang',cfg.languages,'id','label','pt-BR');
    if(cfg.countries)fillSel('#geoCountry',cfg.countries,'label','label','Brasil');
    fillSel('#currency',cfg.currencies,'id','label','USD');
    fillSel('#persona',cfg.personas,'id','label','sem_persona');
    fillSel('#creativePlatform',cfg.creativePlatforms,'id','label','svg_claude');
    fillSel('#creativeSize',cfg.creativeSizes,'id','label','1080x1440');
    ['#optModel','#modelGlobal','#modelWizard'].forEach(function(s){fillModels(s)});
    $('#modelFoot').textContent='modelo: '+MODEL;
    if(cfg.needPassword&&!ACCESS_PASS) showGate(); else verifyEnter();
  });
}
function fillModels(sel){
  var el=$(sel); if(!el)return; el.innerHTML='';
  [['claude-sonnet-4-6','Sonnet 4.6 (rápido)'],['claude-opus-4-8','Opus 4.8 (qualidade)'],['claude-haiku-4-5-20251001','Haiku 4.5 (econômico)']]
  .forEach(function(m){var o=document.createElement('option');o.value=m[0];o.textContent=m[1];if(m[0]===MODEL)o.selected=true;el.appendChild(o)});
  el.onchange=function(){MODEL=el.value;localStorage.setItem('mbz_model',MODEL);$('#modelFoot').textContent='modelo: '+MODEL;
    ['#optModel','#modelGlobal','#modelWizard'].forEach(function(s){if($(s))$(s).value=MODEL})};
}
function fillSel(sel,items,vk,lk,def){var el=$(sel);if(!el)return;el.innerHTML='';items.forEach(function(it){var o=document.createElement('option');o.value=it[vk];o.textContent=it[lk];if(it[vk]===def)o.selected=true;el.appendChild(o)})}

function showGate(){
  $('#gate').classList.remove('hidden');
  $('#gateBtn').onclick=function(){
    var p=$('#gatePass').value;
    fetch('/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:p})})
    .then(function(r){return r.json()}).then(function(res){
      if(res.ok){ACCESS_PASS=p;sessionStorage.setItem('mbz_pass',p);$('#gate').classList.add('hidden');enterApp()}
      else $('#gateErr').textContent=res.error||'Senha incorreta.';
    });
  };
  $('#gatePass').addEventListener('keydown',function(e){if(e.key==='Enter')$('#gateBtn').click()});
}
function verifyEnter(){
  if(CFG.needPassword){fetch('/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:ACCESS_PASS})})
    .then(function(r){return r.json()}).then(function(res){res.ok?enterApp():showGate()})}
  else enterApp();
}
function enterApp(){
  $('#app').classList.remove('hidden');
  buildWizardRail(); buildBlockPick(); buildClassic(); wireWizard(); wireTabs(); wireModes(); wireKeyModal(); wireOptimizer(); wireOutputActions();
  updateSummary();
  if(!CFG.serverKey&&!USER_KEY) $('#keyModal').classList.remove('hidden');
  loadHistory();
}

/* ---------- tabs / modes ---------- */
function wireTabs(){
  $$('.tab').forEach(function(t){t.onclick=function(){
    $$('.tab').forEach(function(x){x.classList.remove('active')});t.classList.add('active');
    var tb=t.getAttribute('data-tab');
    $('#tab-creator').classList.toggle('hidden',tb!=='creator');
    $('#tab-optimizer').classList.toggle('hidden',tb!=='optimizer');
    $('#tab-history').classList.toggle('hidden',tb!=='history');
    if(tb==='history')loadHistory();
  }});
}
function wireModes(){
  $('#modeWizard').onclick=function(){this.classList.add('active');$('#modeClassic').classList.remove('active');$('#wizard').classList.remove('hidden');$('#classic').classList.add('hidden')};
  $('#modeClassic').onclick=function(){this.classList.add('active');$('#modeWizard').classList.remove('active');$('#classic').classList.remove('hidden');$('#wizard').classList.add('hidden');syncClassicFromWizard()};
}

/* ---------- wizard ---------- */
var STEP_LABELS=['Nicho','Idioma & Voz','Estrutura','Criativos','Gerar'];
function buildWizardRail(){
  var el=$('#railSteps');el.innerHTML='';
  STEP_LABELS.forEach(function(lb,i){
    var n=i+1;var d=document.createElement('div');d.className='rail-node'+(n===1?' active':'');
    d.innerHTML='<div class="rail-num">'+n+'</div><div class="rail-label">'+lb+'</div>';
    d.onclick=function(){if(n<curStep)gotoStep(n)};
    el.appendChild(d);
  });
}
function wireWizard(){
  $('#wizNext').onclick=function(){ if(!validateStep(curStep))return; if(curStep<totalSteps)gotoStep(curStep+1)};
  $('#wizPrev').onclick=function(){ if(curStep>1)gotoStep(curStep-1)};
  $('#wizForge').onclick=function(){collectParams();runForge()};
  // steppers +/-
  $$('[data-inc]').forEach(function(b){b.onclick=function(){var t=$('#'+b.getAttribute('data-inc'));t.value=Math.min(+t.max||999,(+t.value||0)+1);t.dispatchEvent(new Event('input'))}});
  $$('[data-dec]').forEach(function(b){b.onclick=function(){var t=$('#'+b.getAttribute('data-dec'));t.value=Math.max(+t.min||0,(+t.value||0)-1);t.dispatchEvent(new Event('input'))}});
  // grid calc + preview
  function gridUpd(){var c=+$('#gridCols').value||1,r=+$('#gridRows').value||1;$('#gridCalc').textContent=c*r;drawGridPreview(c,r);updateSummary()}
  $('#gridCols').oninput=gridUpd;$('#gridRows').oninput=gridUpd;gridUpd();
  ['niche','numP1','seqRoutes','onboardRoutes'].forEach(function(id){$('#'+id).addEventListener('input',updateSummary)});
  // suggest name
  $('#suggestName').onclick=suggestNames;
  $('#genFbPhotos').onclick=genFbPhotos;
  // creative toggle
  $('#wantCreatives').onchange=function(){$('#creativeOpts').classList.toggle('hidden',!this.checked);syncBlockToggles()};
  $('#imagePrompts').onchange=syncBlockToggles;
  $('#wantAudios').onchange=syncBlockToggles;
}
function drawGridPreview(c,r){
  var el=$('#gridPreview');el.style.gridTemplateColumns='repeat('+c+',1fr)';el.innerHTML='';
  var n=Math.min(c*r,32);for(var i=0;i<n;i++){var d=document.createElement('div');d.className='grid-cell';d.style.animationDelay=(i*.03)+'s';d.textContent='P2';el.appendChild(d)}
}
function validateStep(s){
  if(s===1&&!$('#niche').value.trim()){toast('Digite o nicho primeiro.');return false}
  return true;
}
function gotoStep(n){
  curStep=n;
  $$('.step').forEach(function(st){st.classList.toggle('active',+st.getAttribute('data-step')===n)});
  $$('.rail-node').forEach(function(nd,i){nd.classList.toggle('active',i+1===n);nd.classList.toggle('done',i+1<n)});
  $('#railFill').style.width=(n/totalSteps*100)+'%';
  $('#wizPrev').style.visibility=n===1?'hidden':'visible';
  $('#wizNext').classList.toggle('hidden',n===totalSteps);
  $('#wizForge').classList.toggle('hidden',n!==totalSteps);
  if(n===totalSteps)updateSummary();
  if(n===2){var cl=$('#campaignLang');var ce=$('#campaignLangEcho');if(ce&&cl){var lbl=cl.options[cl.selectedIndex]?cl.options[cl.selectedIndex].text:'';var geo=$('#geoCountry').value.trim();ce.textContent=(geo?geo+' · ':'')+lbl}}
  $('#wizard').scrollIntoView({behavior:'smooth',block:'start'});
}

function buildBlockPick(){
  var el=$('#blockPick');el.innerHTML='';
  BLOCKS.forEach(function(b){
    var on=b.def;
    var d=document.createElement('div');d.className='blk'+(on?' on':'');d.dataset.block=b.id;
    d.innerHTML='<div class="blk-check">✓</div><div><span class="blk-name">'+b.name+'</span><small>'+b.hint+'</small></div>';
    d.onclick=function(){d.classList.toggle('on');updateSummary()};
    el.appendChild(d);
  });
}
function syncBlockToggles(){
  // liga blocos condicionais conforme toggles do passo 4
  setBlk('image_prompts',$('#imagePrompts').checked);
  setBlk('creatives_prompt',$('#wantCreatives').checked);
  setBlk('audios',$('#wantAudios').checked);
  updateSummary();
}
function setBlk(id,on){var d=$('.blk[data-block="'+id+'"]');if(d)d.classList.toggle('on',on)}
function selectedBlocks(){return $$('.blk.on').map(function(d){return d.dataset.block})}

function updateSummary(){
  var c=+$('#gridCols').value||1,r=+$('#gridRows').value||1;
  var blocks=selectedBlocks();
  var s=$('#summary');if(!s)return;
  s.innerHTML='Vou gerar <b>'+($('#niche').value||'(nicho)')+'</b> com <b>'+($('#seqRoutes').value)+'</b> sequência(s) completas, <b>'+$('#numP1').value+'</b> P1 (+ '+$('#numP1').value+' quizzes), grid <b>'+c+'×'+r+'</b> = <b>'+(c*r)+'</b> P2s.<br>Blocos: <b>'+blocks.length+'</b> selecionados.';
}

/* ---------- classic mode ---------- */
function buildClassic(){
  // espelha campos principais num grid único
  var el=$('#classicGrid');
  el.innerHTML='<div class="sel-card"><label>Blocos</label><small>Use o passo a passo p/ ajustes finos. Aqui gera com os blocos marcados lá.</small></div>';
}
function syncClassicFromWizard(){}

/* ---------- name suggest ---------- */
function suggestNames(e){
  if(e)e.preventDefault();
  var niche=$('#niche').value.trim();if(!niche){toast('Digite o nicho primeiro.');return}
  if(!CFG.serverKey&&!USER_KEY){$('#keyModal').classList.remove('hidden');return}
  var btn=$('#suggestName');btn.textContent='...';
  collectParams();
  fetch('/api/generate',{method:'POST',headers:authHeaders(),body:JSON.stringify({block:'page_name',params:lastParams,model:MODEL})})
  .then(function(r){return r.json()}).then(function(res){
    btn.textContent='✨ Sugerir do nicho';
    if(res.error){toast(res.error);return}
    var j=res.json||safeParse(res.raw);
    if(j&&j.names){
      $('#pageName').value=j.names[0];
      var ch=$('#nameChips');ch.innerHTML='';
      j.names.forEach(function(n){var c=document.createElement('span');c.className='chip';c.textContent=n;c.onclick=function(){$('#pageName').value=n};ch.appendChild(c)});
    }
  }).catch(function(){btn.textContent='✨ Sugerir do nicho'});
}

function genFbPhotos(e){
  if(e)e.preventDefault();
  var niche=$('#niche').value.trim();if(!niche){toast('Digite o nicho primeiro.');return}
  var name=$('#pageName').value.trim();if(!name){toast('Defina o nome da página primeiro.');return}
  if(!CFG.serverKey&&!USER_KEY){$('#keyModal').classList.remove('hidden');return}
  var btn=$('#genFbPhotos');btn.textContent='gerando...';
  collectParams();
  var out=$('#fbPhotosOut');out.innerHTML='<div class="block-card"><div class="block-head"><span class="block-title">◢ Fotos da Página</span><span class="block-status loading"><span class="spinner"></span> gerando</span></div><div class="block-body" id="fbBd"></div></div>';
  fetch('/api/generate',{method:'POST',headers:authHeaders(),body:JSON.stringify({block:'fb_images',params:lastParams,model:MODEL})})
  .then(function(r){return r.json()}).then(function(res){
    btn.textContent='📸 Gerar prompts de perfil + capa';
    if(res.error){toast(res.error);out.innerHTML='';return}
    var j=res.json||safeParse(res.raw);
    window._fbImg=cleanText('fb_images',j,res.raw);
    $('#fbBd').parentNode.querySelector('.block-status').className='block-status done';
    $('#fbBd').parentNode.querySelector('.block-status').textContent='✓ pronto';
    $('#fbBd').innerHTML='<div class="clean-view">'+sanitize('fb_images',j,res.raw)+'<button class="mini-btn" id="fbCp" style="margin-top:10px">copiar prompts</button></div>';
    $('#fbCp').onclick=function(){navigator.clipboard.writeText(window._fbImg||'').then(function(){$('#fbCp').textContent='✓ copiado';setTimeout(function(){$('#fbCp').textContent='copiar prompts'},1400)})};
  }).catch(function(){btn.textContent='📸 Gerar prompts de perfil + capa';out.innerHTML=''});
}
function authHeaders(){var h={'content-type':'application/json'};if(CFG.needPassword)h['x-access-pass']=ACCESS_PASS;if(!CFG.serverKey&&USER_KEY)h['x-user-key']=USER_KEY;return h}
function collectParams(){
  var ps=$('#persona');
  lastParams={
    niche:$('#niche').value.trim(),pageName:$('#pageName').value.trim(),geoCountry:$('#geoCountry').value.trim(),
    flowLang:$('#flowLang').value,contentLang:$('#contentLang').value,campaignLang:$('#campaignLang').value,currency:$('#currency').value,
    persona:ps.value,personaLabel:ps.options[ps.selectedIndex].text,
    platform:document.querySelector('input[name=platform]:checked').value,
    onboardRoutes:+$('#onboardRoutes').value,onboardRouteType:$('#onboardRouteType').value,
    seqRoutes:+$('#seqRoutes').value,numP1:+$('#numP1').value,
    gridCols:+$('#gridCols').value,gridRows:+$('#gridRows').value,
    numCreatives:+$('#numCreatives').value,creativePlatform:$('#creativePlatform').value,creativeSize:$('#creativeSize').value,
    imagePrompts:$('#imagePrompts').checked
  };
  return lastParams;
}

/* ---------- forge ---------- */
function runForge(){
  collectParams();
  if(!lastParams.niche){toast('Digite o nicho.');gotoStep(1);return}
  if(!CFG.serverKey&&!USER_KEY){$('#keyModal').classList.remove('hidden');return}
  var blocks=selectedBlocks();if(!blocks.length){toast('Marque ao menos um bloco.');return}
  var out=$('#output');out.innerHTML='';lastBlocks={};delete lastParams.gridDirection;delete lastParams.onboardMenuCount;delete lastParams.seqMenuCount;delete lastParams.onboardMenuMap;delete lastParams.seqMenuMap;delete lastParams.creativesContext;
  $('#wizForge').disabled=true;$('#classicForge').disabled=true;$('#outputActions').classList.add('hidden');
  blocks.forEach(function(b){out.appendChild(makeCard(b))});
  out.scrollIntoView({behavior:'smooth',block:'start'});
  var i=0;
  function step(){
    if(i>=blocks.length){$('#wizForge').disabled=false;$('#classicForge').disabled=false;$('#outputActions').classList.remove('hidden');toast('Funil gerado! ⚡');return}
    var b=blocks[i];i++;setStatus(b,'loading');
    if(b==='grid'&&!lastParams.gridDirection){
      fetch('/api/generate',{method:'POST',headers:authHeaders(),body:JSON.stringify({block:'grid_preview',params:lastParams,model:MODEL})})
      .then(function(r){return r.json()}).then(function(res){
        var dir=res.json||safeParse(res.raw);
        if(dir){lastParams.gridDirection=dir;showGridDirection(b,dir)}
        genBlock(b,step);
      }).catch(function(){genBlock(b,step)});
      return;
    }
    genBlock(b,step);
  }
  step();
}

function genBlock(b,done){
  fetch('/api/generate',{method:'POST',headers:authHeaders(),body:JSON.stringify({block:b,params:lastParams,model:MODEL})})
  .then(function(r){return r.json()}).then(function(res){
    if(res.error){setStatus(b,'error');setBody(b,'<pre>ERRO: '+esc(res.error)+'</pre>')}
    else{
      lastBlocks[b]={raw:res.raw,json:res.json};setStatus(b,'done');renderBlock(b,res);
      // conta menus pra alimentar os prompts de imagem
      if(b==='onboard'&&res.json){var om=menuBreakdown(res.json);lastParams.onboardMenuCount=om.total;lastParams.onboardMenuMap=om.map}
      if(b==='sequence'&&res.json){var sm=menuBreakdown(res.json);lastParams.seqMenuCount=sm.total;lastParams.seqMenuMap=sm.map}
      // captura contexto dos criativos pra casar com os audios
      if(b==='creatives_prompt'&&res.json)lastParams.creativesContext=creativesSummary(res.json);
    }
    done();
  }).catch(function(err){setStatus(b,'error');setBody(b,'<pre>ERRO: '+esc(err.message)+'</pre>');done()});
}
function countMenus(flow){
  var n=0;
  try{
    if(flow.routes){ // chatdrink
      flow.routes.forEach(function(r){(r.interactions||[]).forEach(function(it){if(it.type==='menu')n++})});
    }else{ // chatfood
      Object.keys(flow).forEach(function(k){var msgs=(flow[k]&&flow[k].MESSAGES)||[];msgs.forEach(function(m){if(m.type==='simple_menu')n++})});
    }
  }catch(e){}
  return n;
}
// retorna {total, map:[{route:N,menus:M}]} contando menus por rota
function menuBreakdown(flow){
  var total=0,map=[];
  try{
    if(flow.routes){ // chatdrink: rota 0 e random; conteudo de 1 em diante
      flow.routes.forEach(function(r,idx){
        var c=0;(r.interactions||[]).forEach(function(it){if(it.type==='menu')c++});
        if(c>0){map.push({route:idx,menus:c});total+=c}
      });
    }else{ // chatfood
      var ri=0;Object.keys(flow).forEach(function(k){
        if(k==='WELCOME')return;ri++;
        var c=0;((flow[k]&&flow[k].MESSAGES)||[]).forEach(function(m){if(m.type==='simple_menu')c++});
        if(c>0){map.push({route:ri,menus:c});total+=c}
      });
    }
  }catch(e){}
  return {total:total,map:map};
}
// extrai um resumo dos criativos (headline/cta por indice) pra casar com os audios
function creativesSummary(j){
  try{
    if(j.prompts&&j.prompts.length){
      return j.prompts.map(function(p){return '#'+(p.index||'')+' '+(p.headline||'')+(p.cta?' | CTA: '+p.cta:'')}).join('\n').slice(0,2000);
    }
    if(j.prompt){ // svg: um markdown unico; manda um trecho pra dar contexto tematico
      return String(j.prompt).slice(0,1500);
    }
  }catch(e){}
  return '';
}
function showGridDirection(b,dir){
  var pal=(dir.palette||[]);
  var sw=pal.map(function(c){return '<span style="display:inline-block;width:26px;height:26px;border-radius:6px;background:'+esc(c)+';margin-right:6px;vertical-align:middle;border:1px solid rgba(255,255,255,.2)"></span>'}).join('');
  var titleColor=dir.title_color||'#fff';
  var itemBg=dir.item_bg||'#1a1a2e';
  var itemText=dir.item_text_color||'#fff';
  var font=dir.font||'Georgia';
  var accent=pal[0]||'#c084fc';
  // mini-mockup renderizado do grid com as cores reais
  var mock='<div style="background:linear-gradient(135deg,'+esc(pal[0]||'#222')+'22,'+esc(pal[1]||'#111')+'22);padding:18px;border-radius:12px;margin-top:12px">'+
    '<div style="font-family:'+esc(font)+';font-weight:800;font-size:20px;color:'+esc(titleColor)+';text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.8);margin-bottom:4px">Título de Exemplo</div>'+
    '<div style="font-family:'+esc(font)+';font-weight:600;font-size:13px;color:'+esc(titleColor)+';text-align:center;opacity:1;margin-bottom:14px">Subtítulo legível de exemplo</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
      ['Opção Um','Opção Dois'].map(function(t){return '<div style="border:2px solid '+esc(accent)+';border-radius:10px;overflow:hidden"><div style="height:54px;background:linear-gradient(135deg,'+esc(accent)+'66,'+esc(pal[1]||'#333')+'66)"></div><div style="font-family:'+esc(font)+';font-weight:800;font-size:14px;color:'+esc(itemText)+';background:'+esc(itemBg)+';padding:10px;text-align:center">'+t+'</div></div>'}).join('')+
    '</div></div>';
  var html='<div class="clean-view"><span class="tag">PRÉVIA VISUAL — é assim que vai ficar</span>'+
    '<p style="margin:10px 0 4px"><b>Paleta:</b> '+sw+'</p>'+
    '<p><b>Fonte:</b> '+esc(font)+'</p>'+
    mock+
    '<p style="margin-top:10px;color:var(--muted)">'+esc(dir.mood||'')+'</p>'+
    '<p style="margin-top:6px;color:var(--green);font-size:12px">✓ Contraste garantido — o backend força legibilidade com !important</p></div>';
  var pc=document.createElement('div');pc.className='block-card';
  pc.innerHTML='<div class="block-head"><span class="block-title">◢ Grid · Prévia visual</span><span class="block-status done">✓ prévia</span></div><div class="block-body">'+html+'</div>';
  pc.querySelector('.block-head').onclick=function(){pc.querySelector('.block-body').classList.toggle('collapsed')};
  var gridCard=$('#card-grid');
  if(gridCard&&gridCard.parentNode)gridCard.parentNode.insertBefore(pc,gridCard);
}

function makeCard(b){
  var meta=BLOCKS.filter(function(x){return x.id===b})[0]||{name:b,kind:'text'};
  var card=document.createElement('div');card.className='block-card';card.id='card-'+b;
  card.innerHTML=
    '<div class="block-head">'+
      '<span class="block-title">◢ '+(BLABEL[b]||b)+'</span>'+
      '<div class="block-actions">'+
        '<span class="block-status pending" id="st-'+b+'">aguardando</span>'+
        (meta.kind==='json-download'?'<button class="mini-btn dl" id="dl-'+b+'">⬇ baixar .json</button>':'')+
        '<button class="mini-btn" id="cp-'+b+'">copiar</button>'+
      '</div>'+
    '</div>'+
    '<div class="block-body collapsed" id="bd-'+b+'"></div>';
  card.querySelector('.block-head').onclick=function(e){if(e.target.classList.contains('mini-btn'))return;$('#bd-'+b).classList.toggle('collapsed')};
  setTimeout(function(){
    var cp=$('#cp-'+b);if(cp)cp.onclick=function(){doCopy(b)};
    var dl=$('#dl-'+b);if(dl)dl.onclick=function(){doDownload(b)};
  },0);
  return card;
}
function setStatus(b,st){var e=$('#st-'+b);if(!e)return;e.className='block-status '+st;e.innerHTML=st==='loading'?'<span class="spinner"></span> gerando':st==='done'?'✓ pronto':st==='error'?'✕ erro':'aguardando';if(st==='done')$('#bd-'+b).classList.remove('collapsed')}
function setBody(b,html){var e=$('#bd-'+b);if(e)e.innerHTML=html}

/* ---------- render: JSON-download vs text-clean ---------- */
function renderBlock(b,res){
  var meta=BLOCKS.filter(function(x){return x.id===b})[0]||{kind:'text'};
  if(meta.kind==='json-download'){
    var pretty=res.json?JSON.stringify(res.json,null,2):res.raw;
    setBody(b,'<pre>'+esc(pretty)+'</pre>');
  }else{
    setBody(b,'<div class="clean-view">'+sanitize(b,res.json,res.raw)+'</div>');
  }
}

// transforma JSON em texto limpo legível por bloco
function sanitize(b,j,raw){
  if(!j)j=safeParse(raw);
  if(!j)return '<pre>'+esc(raw||'')+'</pre>';
  try{
    if(b==='page_name'&&j.names) return list(j.names);
    if(b==='fb_images'){
      var h='';
      if(j.profile)h+='<h4>📷 Foto de Perfil (1:1)</h4><div class="kv"><p>'+esc(j.profile.prompt||j.profile)+'</p></div>';
      if(j.cover)h+='<h4>🖼️ Foto de Capa (1640×856)</h4><div class="kv"><p>'+esc(j.cover.prompt||j.cover)+'</p></div>';
      return h||'<pre>'+esc(JSON.stringify(j,null,2))+'</pre>';
    }
    if((b==='p1_titles'||b==='p2_titles')&&j.titles) return olist(j.titles);
    if(b==='meta_copy'){
      var h='';
      if(j.primary_texts){h+='<h4>Textos principais</h4>'+olist(j.primary_texts)}
      if(j.headlines){h+='<h4>Títulos</h4>'+olist(j.headlines)}
      if(j.description){h+='<h4>Descrição</h4><p>'+esc(j.description)+'</p>'}
      return h;
    }
    if(b==='meta_onboard'){
      var h='';
      if(j.welcome){h+='<h4>Boas-vindas</h4><p>'+esc(j.welcome)+'</p>'}
      if(j.quick_replies){h+='<h4>Quick replies</h4>'+ulist(j.quick_replies)}
      if(j.followup){h+='<h4>Follow-up 24h</h4><p>'+esc(j.followup)+'</p>'}
      return h;
    }
    if(b==='quiz'&&j.quizzes){
      return j.quizzes.map(function(q,i){
        var h='<div class="kv"><span class="tag">QUIZ '+(q.p1_index||i+1)+' · '+esc(q.type||'')+'</span>';
        h+='<h4>'+esc(q.question||'')+'</h4>';
        if(q.options)h+=ulist(q.options.map(function(o){return o.label+(o.pinterest?'  ·  📌 '+o.pinterest:'')}));
        h+='<p><b>Loading:</b> '+esc(q.loading||'')+'<br><b>Final:</b> '+esc(q.final_title||'')+'<br><b>CTA:</b> '+esc(q.cta||'')+'<br><b>Nota:</b> '+esc(q.note||'')+'</p></div>';
        return h;
      }).join('');
    }
    if(b==='image_prompts'){
      var h='';
      if(j.onboard){h+='<h4>Onboard</h4>'+j.onboard.map(function(o){return '<div class="kv"><span class="tag">'+esc(o.step||'')+'</span><p>'+esc(o.prompt||'')+'</p></div>'}).join('')}
      if(j.sequence){h+='<h4>Sequência</h4>'+j.sequence.map(function(o){return '<div class="kv"><span class="tag">rota '+esc(String(o.route||''))+' · '+esc(o.step||'')+'</span><p>'+esc(o.prompt||'')+'</p></div>'}).join('')}
      return h;
    }
    if(b==='creatives_prompt'){
      if(j.prompt)return '<pre>'+esc(j.prompt)+'</pre>';
      if(j.prompts)return '<span class="tag">'+esc(j.platform||'')+' · '+esc(j.size||'')+'</span>'+j.prompts.map(function(p){return '<div class="kv"><b>#'+(p.index||'')+'</b> '+(p.headline?'<br><b>Headline:</b> '+esc(p.headline):'')+(p.cta?'<br><b>CTA:</b> '+esc(p.cta):'')+'<p>'+esc(p.prompt||'')+'</p></div>'}).join('');
    }
    if(b==='audios'&&j.audios){
      return j.audios.map(function(a){return '<div class="kv"><span class="tag">#'+(a.index||'')+' · voz: '+esc(a.voice||'')+'</span><p>'+esc(a.script||'')+'</p></div>'}).join('');
    }
  }catch(e){}
  return '<pre>'+esc(JSON.stringify(j,null,2))+'</pre>';
}
function list(a){return '<ul>'+a.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>'}
function ulist(a){return '<ul>'+a.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>'}
function olist(a){return '<ol>'+a.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ol>'}

/* ---------- copy / download ---------- */
function doCopy(b){
  var data=lastBlocks[b];if(!data)return;
  var meta=BLOCKS.filter(function(x){return x.id===b})[0]||{kind:'text'};
  var txt;
  if(meta.kind==='json-download') txt=data.json?JSON.stringify(data.json,null,2):data.raw;
  else txt=cleanText(b,data.json||safeParse(data.raw),data.raw);
  navigator.clipboard.writeText(txt||'').then(function(){var btn=$('#cp-'+b);btn.textContent='✓ copiado';setTimeout(function(){btn.textContent='copiar'},1400)});
}
function doDownload(b){
  var data=lastBlocks[b];if(!data||!data.json){toast('JSON inválido — veja o conteúdo.');return}
  var name=(lastParams.niche||'funil').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  var fn=b==='onboard'?'onboard-'+name+'.json':b==='sequence'?'sequencia-'+name+'.json':b==='grid'?'mirb-grid-'+name+'.json':b==='comment'?'comentarios-'+name+'.json':b+'-'+name+'.json';
  var blob=new Blob([JSON.stringify(data.json,null,2)],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fn;a.click();URL.revokeObjectURL(a.href);
  toast('Baixado: '+fn);
}
// versão texto p/ copiar dos blocos 'text'
function cleanText(b,j,raw){
  if(!j)return raw||'';
  try{
    if(b==='page_name'&&j.names)return j.names.join('\n');
    if(b==='fb_images')return 'FOTO DE PERFIL:\n'+((j.profile&&(j.profile.prompt||j.profile))||'')+'\n\nFOTO DE CAPA:\n'+((j.cover&&(j.cover.prompt||j.cover))||'');
    if((b==='p1_titles'||b==='p2_titles')&&j.titles)return j.titles.map(function(t,i){return (i+1)+'. '+t}).join('\n');
    if(b==='meta_copy')return 'TEXTOS:\n'+(j.primary_texts||[]).map(function(t,i){return (i+1)+'. '+t}).join('\n\n')+'\n\nTÍTULOS:\n'+(j.headlines||[]).join('\n')+'\n\nDESCRIÇÃO:\n'+(j.description||'');
    if(b==='meta_onboard')return 'BOAS-VINDAS:\n'+(j.welcome||'')+'\n\nQUICK REPLIES:\n'+(j.quick_replies||[]).join('\n')+'\n\nFOLLOW-UP:\n'+(j.followup||'');
    if(b==='quiz'&&j.quizzes)return j.quizzes.map(function(q,i){return 'QUIZ '+(q.p1_index||i+1)+' ('+(q.type||'')+')\nPergunta: '+(q.question||'')+'\nOpções: '+(q.options||[]).map(function(o){return o.label}).join(' | ')+'\nLoading: '+(q.loading||'')+'\nFinal: '+(q.final_title||'')+'\nCTA: '+(q.cta||'')+'\nNota: '+(q.note||'')}).join('\n\n');
    if(b==='creatives_prompt'&&j.prompt)return j.prompt;
    if(b==='creatives_prompt'&&j.prompts)return j.prompts.map(function(p){return '#'+p.index+' '+(p.headline||'')+'\n'+p.prompt+'\nCTA: '+(p.cta||'')}).join('\n\n');
    if(b==='audios'&&j.audios)return j.audios.map(function(a){return '#'+a.index+' ['+a.voice+']\n'+a.script}).join('\n\n');
    if(b==='image_prompts'){var o=(j.onboard||[]).map(function(x){return x.step+': '+x.prompt}).join('\n');var s=(j.sequence||[]).map(function(x){return 'r'+x.route+' '+x.step+': '+x.prompt}).join('\n');return 'ONBOARD:\n'+o+'\n\nSEQUÊNCIA:\n'+s}
  }catch(e){}
  return JSON.stringify(j,null,2);
}

/* ---------- output actions ---------- */
function wireOutputActions(){
  $('#saveBtn').onclick=function(){
    var save={};Object.keys(lastBlocks).forEach(function(k){save[k]=lastBlocks[k]});
    fetch('/api/history',{method:'POST',headers:authHeaders(),body:JSON.stringify({niche:lastParams.niche,params:lastParams,blocks:save})})
    .then(function(r){return r.json()}).then(function(){toast('Salvo no histórico ✓')});
  };
  $('#downloadAll').onclick=function(){
    ['onboard','sequence','grid'].forEach(function(b){if(lastBlocks[b]&&lastBlocks[b].json)doDownload(b)});
  };
  $('#classicForge').onclick=function(){collectParams();runForge()};
}

/* ---------- history ---------- */
function loadHistory(){
  fetch('/api/history',{headers:authHeaders()}).then(function(r){return r.json()}).then(function(list){
    var el=$('#historyList');if(!Array.isArray(list)||!list.length){el.innerHTML='<p style="color:var(--muted);font-family:var(--f-mono)">Nenhum funil salvo ainda.</p>';return}
    el.innerHTML='';
    list.forEach(function(h){
      var d=document.createElement('div');d.className='hist-item';
      d.innerHTML='<div class="hist-info"><b>'+esc(h.niche)+'</b><small>'+new Date(h.created_at).toLocaleString('pt-BR')+' · '+Object.keys(h.blocks||{}).length+' blocos</small></div><div class="hist-actions"><button class="mini-btn" data-load>carregar</button><button class="mini-btn" data-del>excluir</button></div>';
      d.querySelector('[data-load]').onclick=function(){loadEntry(h)};
      d.querySelector('[data-del]').onclick=function(){if(confirm('Excluir?'))fetch('/api/history/'+h.id,{method:'DELETE',headers:authHeaders()}).then(function(){loadHistory()})};
      el.appendChild(d);
    });
  });
}
function loadEntry(h){
  $$('.tab')[0].click();lastBlocks=h.blocks||{};lastParams=h.params||{};
  var out=$('#output');out.innerHTML='';
  Object.keys(lastBlocks).forEach(function(b){
    out.appendChild(makeCard(b));setStatus(b,'done');
    var data=lastBlocks[b];renderBlock(b,{json:data.json,raw:data.raw});
  });
  $('#outputActions').classList.remove('hidden');toast('Funil carregado.');
}

/* ---------- optimizer ---------- */
function wireOptimizer(){
  // upload de arquivo
  $('#optUpload').onclick=function(e){e.preventDefault();$('#optFile').click()};
  $('#optFile').onchange=function(){
    var f=this.files[0];if(!f)return;
    var rd=new FileReader();
    rd.onload=function(){$('#optContent').value=rd.result;toast('Arquivo carregado: '+f.name)};
    rd.readAsText(f);
  };
  // mostra toggle de imagens so pra onboard/sequencia
  function updImgToggle(){
    var k=$('#optKind').value.toLowerCase();
    var show=k.indexOf('onboard')>=0||k.indexOf('sequ')>=0;
    $('#optImgToggle').style.display=show?'flex':'none';
  }
  $('#optKind').onchange=updImgToggle;updImgToggle();

  $('#optBtn').onclick=function(){
    var content=$('#optContent').value.trim();if(!content){toast('Cole o conteúdo.');return}
    if(!CFG.serverKey&&!USER_KEY){$('#keyModal').classList.remove('hidden');return}
    var out=$('#optOutput');out.innerHTML='';out.appendChild(makeOptCard());$('#optBtn').disabled=true;
    var kind=$('#optKind').value;var wantImg=$('#optWantImages').checked&&$('#optImgToggle').style.display!=='none';
    fetch('/api/optimize',{method:'POST',headers:authHeaders(),body:JSON.stringify({content:content,kind:kind,platform:$('#optPlatform').value,context:$('#optContext').value.trim(),model:$('#optModel').value})})
    .then(function(r){return r.json()}).then(function(res){
      $('#optBtn').disabled=false;
      if(res.error){$('#optSt').className='block-status error';$('#optSt').textContent='✕ erro';$('#optBd').innerHTML='<pre>ERRO: '+esc(res.error)+'</pre>';return}
      window._opt=res;$('#optSt').className='block-status done';$('#optSt').textContent='✓ pronto';
      if(res.isJson&&res.json){$('#optBd').innerHTML='<pre>'+esc(JSON.stringify(res.json,null,2))+'</pre>';$('#optDl').style.display='inline-block'}
      else{$('#optBd').innerHTML='<pre>'+esc(res.raw)+'</pre>'}
      // gera prompts de imagem se pedido e se temos JSON do fluxo
      if(wantImg&&res.json){optGenImages(res.json,kind)}
    }).catch(function(err){$('#optBtn').disabled=false;$('#optSt').className='block-status error';$('#optSt').textContent='✕ erro';$('#optBd').innerHTML='<pre>ERRO: '+esc(err.message)+'</pre>'});
  };
}

// gera prompts de imagem a partir do fluxo otimizado
function optGenImages(flow,kind){
  var bd=menuBreakdown(flow);
  if(!bd.total){toast('Nenhum card de menu encontrado pra gerar imagens.');return}
  var isSeq=kind.toLowerCase().indexOf('sequ')>=0;
  var params={
    niche:$('#niche').value.trim()||'campanha',
    flowLang:$('#flowLang')?$('#flowLang').value:'en-US',
    contentLang:$('#contentLang')?$('#contentLang').value:'pt-BR',
    personaLabel:'',
    onboardMenuCount:isSeq?0:bd.total, onboardMenuMap:isSeq?[]:bd.map,
    seqMenuCount:isSeq?bd.total:0, seqMenuMap:isSeq?bd.map:[]
  };
  var card=document.createElement('div');card.className='block-card';
  card.innerHTML='<div class="block-head"><span class="block-title">◢ Prompts de Imagem ('+bd.total+' cards)</span><div class="block-actions"><span class="block-status loading" id="oiSt"><span class="spinner"></span> gerando</span><button class="mini-btn" id="oiCp">copiar</button></div></div><div class="block-body" id="oiBd"></div>';
  $('#optOutput').appendChild(card);
  setTimeout(function(){$('#oiCp').onclick=function(){navigator.clipboard.writeText(window._optImg||'').then(function(){$('#oiCp').textContent='✓ copiado';setTimeout(function(){$('#oiCp').textContent='copiar'},1400)})}},0);
  fetch('/api/generate',{method:'POST',headers:authHeaders(),body:JSON.stringify({block:'image_prompts',params:params,model:$('#optModel').value})})
  .then(function(r){return r.json()}).then(function(res){
    if(res.error){$('#oiSt').className='block-status error';$('#oiSt').textContent='✕ erro';$('#oiBd').innerHTML='<pre>ERRO: '+esc(res.error)+'</pre>';return}
    var j=res.json||safeParse(res.raw);
    window._optImg=cleanText('image_prompts',j,res.raw);
    $('#oiSt').className='block-status done';$('#oiSt').textContent='✓ pronto';
    $('#oiBd').innerHTML='<div class="clean-view">'+sanitize('image_prompts',j,res.raw)+'</div>';
  }).catch(function(err){$('#oiSt').className='block-status error';$('#oiSt').textContent='✕ erro';$('#oiBd').innerHTML='<pre>ERRO: '+esc(err.message)+'</pre>'});
}
function makeOptCard(){
  var c=document.createElement('div');c.className='block-card';
  c.innerHTML='<div class="block-head"><span class="block-title">◢ RESULTADO OTIMIZADO</span><div class="block-actions"><span class="block-status loading" id="optSt"><span class="spinner"></span> otimizando</span><button class="mini-btn dl" id="optDl" style="display:none">⬇ baixar .json</button><button class="mini-btn" id="optCp">copiar</button></div></div><div class="block-body" id="optBd"></div>';
  setTimeout(function(){
    $('#optCp').onclick=function(){var r=window._opt;var t=r&&r.isJson&&r.json?JSON.stringify(r.json,null,2):(r?r.raw:'');navigator.clipboard.writeText(t||'').then(function(){$('#optCp').textContent='✓ copiado';setTimeout(function(){$('#optCp').textContent='copiar'},1400)})};
    $('#optDl').onclick=function(){var r=window._opt;if(!r||!r.json)return;var blob=new Blob([JSON.stringify(r.json,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='otimizado.json';a.click();URL.revokeObjectURL(a.href)};
  },0);
  return c;
}

/* ---------- key modal ---------- */
function wireKeyModal(){
  $('#saveKey').onclick=function(){var k=$('#userKey').value.trim();if(!k){toast('Insira a chave.');return}USER_KEY=k;localStorage.setItem('mbz_key',k);MODEL=$('#modelGlobal').value;localStorage.setItem('mbz_model',MODEL);$('#keyModal').classList.add('hidden');toast('Chave salva ✓')};
}

/* ---------- utils ---------- */
function safeParse(t){if(!t)return null;try{return JSON.parse(t)}catch(e){}var f=t.indexOf('{'),fa=t.indexOf('[');var s=f<0?fa:fa<0?f:Math.min(f,fa);if(s<0)return null;var l=Math.max(t.lastIndexOf('}'),t.lastIndexOf(']'));if(l>s){try{return JSON.parse(t.slice(s,l+1))}catch(e){}}return null}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function toast(m){var t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('show')},2600)}
})();
