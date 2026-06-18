// ============================================================
//  MBZ::CH4TB0T NEXUS — Frontend logic
// ============================================================
(function () {
  'use strict';

  var CFG = null;
  var ACCESS_PASS = sessionStorage.getItem('mbz_nexus_pass') || '';
  var USER_KEY = localStorage.getItem('mbz_nexus_userkey') || '';
  var lastBlocks = {}; // armazena outputs da última geração

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', function () {
    startClock();
    loadConfig();
    wireTabs();
    wireCreator();
    wireOptimizer();
    wireKeyModal();
    wireGridCalc();
  });

  function startClock() {
    var el = $('#clock');
    setInterval(function () {
      var d = new Date();
      el.textContent = d.toTimeString().slice(0, 8);
    }, 1000);
  }

  // ---------- Config + auth ----------
  function loadConfig() {
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
      CFG = cfg;
      fillSelect('#flowLang', cfg.languages, 'id', 'label', 'en-US');
      fillSelect('#contentLang', cfg.languages, 'id', 'label', 'pt-BR');
      fillSelect('#currency', cfg.currencies, 'id', 'label', 'USD');
      fillSelect('#persona', cfg.personas, 'id', 'label', 'sem_persona');

      if (cfg.needPassword && !ACCESS_PASS) {
        showGate();
      } else {
        verifyAndEnter();
      }
    });
  }

  function showGate() {
    $('#gate').classList.remove('hidden');
    $('#gateBtn').onclick = function () {
      var pass = $('#gatePass').value;
      fetch('/api/auth', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pass })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.ok) {
          ACCESS_PASS = pass;
          sessionStorage.setItem('mbz_nexus_pass', pass);
          $('#gate').classList.add('hidden');
          enterApp();
        } else {
          $('#gateErr').textContent = res.error || 'Senha incorreta.';
        }
      });
    };
    $('#gatePass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('#gateBtn').click();
    });
  }

  function verifyAndEnter() {
    if (CFG.needPassword) {
      fetch('/api/auth', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: ACCESS_PASS })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.ok) enterApp(); else showGate();
      });
    } else {
      enterApp();
    }
  }

  function enterApp() {
    $('#app').classList.remove('hidden');
    // Se servidor não tem chave e usuário não inseriu a dele, pede
    if (!CFG.serverKey && !USER_KEY) {
      $('#keyModal').classList.remove('hidden');
    }
    loadHistory();
  }

  function fillSelect(sel, items, valKey, labelKey, def) {
    var el = $(sel);
    el.innerHTML = '';
    items.forEach(function (it) {
      var o = document.createElement('option');
      o.value = it[valKey]; o.textContent = it[labelKey];
      if (it[valKey] === def) o.selected = true;
      el.appendChild(o);
    });
  }

  // ---------- Tabs ----------
  function wireTabs() {
    $$('.tab').forEach(function (t) {
      t.onclick = function () {
        $$('.tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        var tab = t.getAttribute('data-tab');
        $('#tab-creator').classList.toggle('hidden', tab !== 'creator');
        $('#tab-optimizer').classList.toggle('hidden', tab !== 'optimizer');
        $('#tab-history').classList.toggle('hidden', tab !== 'history');
        if (tab === 'history') loadHistory();
      };
    });
    $('#platform').onchange = function () {
      $('#platformWarn').style.display = 'block';
    };
  }

  // ---------- API key modal ----------
  function wireKeyModal() {
    $('#saveKey').onclick = function () {
      var k = $('#userKey').value.trim();
      if (!k) return;
      USER_KEY = k;
      localStorage.setItem('mbz_nexus_userkey', k);
      $('#keyModal').classList.add('hidden');
    };
  }

  // ---------- Grid calc ----------
  function wireGridCalc() {
    function upd() {
      var c = parseInt($('#gridCols').value || '0', 10);
      var r = parseInt($('#gridRows').value || '0', 10);
      $('#gridCalc').textContent = '= ' + (c * r) + ' P2s';
    }
    $('#gridCols').oninput = upd;
    $('#gridRows').oninput = upd;
    upd();
  }

  // ---------- Headers helper ----------
  function authHeaders() {
    var h = { 'content-type': 'application/json' };
    if (CFG.needPassword) h['x-access-pass'] = ACCESS_PASS;
    if (!CFG.serverKey && USER_KEY) h['x-user-key'] = USER_KEY;
    return h;
  }

  // ---------- Collect params ----------
  function collectParams() {
    var personaSel = $('#persona');
    return {
      niche: $('#niche').value.trim(),
      pageName: $('#pageName').value.trim(),
      flowLang: $('#flowLang').value,
      contentLang: $('#contentLang').value,
      currency: $('#currency').value,
      persona: personaSel.value,
      personaLabel: personaSel.options[personaSel.selectedIndex].text,
      platform: $('#platform').value,
      onboardRoutes: parseInt($('#onboardRoutes').value, 10),
      onboardRouteType: $('#onboardRouteType').value,
      seqRoutes: parseInt($('#seqRoutes').value, 10),
      numP1: parseInt($('#numP1').value, 10),
      gridCols: parseInt($('#gridCols').value, 10),
      gridRows: parseInt($('#gridRows').value, 10),
      numCreatives: parseInt($('#numCreatives').value, 10),
      imagePrompts: $('#imagePrompts').checked
    };
  }

  // ---------- Creator ----------
  var BLOCK_LABELS = {
    page_name: 'Nome de Página FB',
    onboard: 'Onboard (' + 'chatbot)',
    sequence: 'Sequência (chatbot)',
    grid: 'Grid MIRB + CSS',
    p1_titles: 'Títulos P1',
    p2_titles: 'Títulos P2',
    quiz: 'Quiz Overlays',
    meta_copy: 'Copy Meta',
    meta_onboard: 'Onboard Meta',
    creatives_prompt: 'Prompt Criativos SVG',
    audios: 'Áudios ElevenLabs v3'
  };

  function wireCreator() {
    $('#suggestName').onclick = function (e) {
      e.preventDefault();
      var niche = $('#niche').value.trim();
      if (!niche) { alert('Preencha o nicho primeiro.'); return; }
      var btn = this; btn.textContent = '...';
      var params = collectParams();
      fetch('/api/generate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ block: 'page_name', params: params, model: $('#model').value })
      }).then(function (r) { return r.json(); }).then(function (res) {
        btn.textContent = 'sugerir ✨';
        if (res.error) { alert(res.error); return; }
        try {
          var j = JSON.parse(res.text);
          if (j.names && j.names.length) {
            $('#pageName').value = j.names[0];
            $('#pageName').title = 'Sugestões: ' + j.names.join(', ');
          }
        } catch (err) { $('#pageName').value = res.text.slice(0, 40); }
      }).catch(function () { btn.textContent = 'sugerir ✨'; });
    };

    $('#forgeBtn').onclick = runForge;
    $('#saveBtn').onclick = saveToHistory;
  }

  function selectedBlocks() {
    return $$('.toggles input[data-block]').filter(function (c) { return c.checked; })
      .map(function (c) { return c.getAttribute('data-block'); });
  }

  function runForge() {
    var params = collectParams();
    if (!params.niche) { alert('Preencha o nicho.'); return; }
    if (!CFG.serverKey && !USER_KEY) { $('#keyModal').classList.remove('hidden'); return; }

    var blocks = selectedBlocks();
    if (!blocks.length) { alert('Selecione ao menos um bloco.'); return; }

    var model = $('#model').value;
    var out = $('#output');
    out.innerHTML = '';
    lastBlocks = {};
    $('#forgeBtn').disabled = true;
    $('#saveBtn').classList.add('hidden');

    // cria os cards
    blocks.forEach(function (b) {
      out.appendChild(makeBlockCard(b));
    });

    // gera sequencialmente
    var i = 0;
    function next() {
      if (i >= blocks.length) {
        $('#forgeBtn').disabled = false;
        $('#saveBtn').classList.remove('hidden');
        return;
      }
      var b = blocks[i];
      setBlockStatus(b, 'loading');
      fetch('/api/generate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ block: b, params: params, model: model })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.error) {
          setBlockStatus(b, 'error');
          setBlockBody(b, 'ERRO: ' + res.error);
        } else {
          lastBlocks[b] = res.text;
          setBlockStatus(b, 'done');
          setBlockBody(b, prettify(res.text));
        }
        i++; next();
      }).catch(function (err) {
        setBlockStatus(b, 'error');
        setBlockBody(b, 'ERRO: ' + err.message);
        i++; next();
      });
    }
    next();
  }

  function makeBlockCard(b) {
    var card = document.createElement('div');
    card.className = 'block-card';
    card.id = 'block-' + b;
    card.innerHTML =
      '<div class="block-head">' +
        '<span class="block-title">' + (BLOCK_LABELS[b] || b) + '</span>' +
        '<div class="block-actions">' +
          '<span class="block-status pending" id="status-' + b + '">aguardando</span>' +
          '<button class="copy-btn" id="copy-' + b + '">copiar</button>' +
        '</div>' +
      '</div>' +
      '<div class="block-body"><pre id="body-' + b + '">—</pre></div>';
    card.querySelector('.block-head').onclick = function (e) {
      if (e.target.classList.contains('copy-btn')) return;
      var body = card.querySelector('.block-body');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    };
    setTimeout(function () {
      $('#copy-' + b).onclick = function () {
        var txt = lastBlocks[b] || '';
        navigator.clipboard.writeText(txt).then(function () {
          var btn = $('#copy-' + b); btn.textContent = '✓ copiado';
          setTimeout(function () { btn.textContent = 'copiar'; }, 1500);
        });
      };
    }, 0);
    return card;
  }

  function setBlockStatus(b, st) {
    var el = $('#status-' + b);
    if (!el) return;
    el.className = 'block-status ' + st;
    el.innerHTML = st === 'loading' ? '<span class="spinner"></span> gerando' :
      st === 'done' ? '✓ pronto' : st === 'error' ? '✕ erro' : 'aguardando';
  }
  function setBlockBody(b, txt) {
    var el = $('#body-' + b);
    if (el) el.textContent = txt;
  }

  function prettify(txt) {
    try { return JSON.stringify(JSON.parse(txt), null, 2); }
    catch (e) { return txt; }
  }

  // ---------- Save / History ----------
  function saveToHistory() {
    var params = collectParams();
    fetch('/api/history', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ niche: params.niche, params: params, blocks: lastBlocks })
    }).then(function (r) { return r.json(); }).then(function () {
      $('#saveBtn').textContent = '✓ SALVO';
      setTimeout(function () { $('#saveBtn').textContent = '💾 SALVAR NO HISTÓRICO'; }, 1500);
    });
  }

  function loadHistory() {
    fetch('/api/history', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        var el = $('#historyList');
        if (!Array.isArray(list) || !list.length) {
          el.innerHTML = '<p style="color:var(--muted)">Nenhum funil salvo ainda.</p>';
          return;
        }
        el.innerHTML = '';
        list.forEach(function (h) {
          var div = document.createElement('div');
          div.className = 'hist-item';
          var d = new Date(h.created_at).toLocaleString('pt-BR');
          div.innerHTML =
            '<div class="hist-info"><b>' + escapeHtml(h.niche) + '</b>' +
            '<small>' + d + ' — ' + Object.keys(h.blocks || {}).length + ' blocos</small></div>' +
            '<div class="hist-actions">' +
              '<button class="copy-btn" data-load="' + h.id + '">carregar</button>' +
              '<button class="copy-btn" data-del="' + h.id + '">excluir</button>' +
            '</div>';
          el.appendChild(div);
          div.querySelector('[data-load]').onclick = function () { loadEntry(h); };
          div.querySelector('[data-del]').onclick = function () { delEntry(h.id); };
        });
      });
  }

  function loadEntry(h) {
    $$('.tab')[0].click();
    var out = $('#output');
    out.innerHTML = '';
    lastBlocks = h.blocks || {};
    Object.keys(lastBlocks).forEach(function (b) {
      out.appendChild(makeBlockCard(b));
      setBlockStatus(b, 'done');
      setBlockBody(b, prettify(lastBlocks[b]));
    });
    $('#saveBtn').classList.remove('hidden');
  }

  function delEntry(id) {
    if (!confirm('Excluir este funil do histórico?')) return;
    fetch('/api/history/' + id, { method: 'DELETE', headers: authHeaders() })
      .then(function () { loadHistory(); });
  }

  // ---------- Optimizer ----------
  function wireOptimizer() {
    $('#optBtn').onclick = function () {
      var content = $('#optContent').value.trim();
      if (!content) { alert('Cole o conteúdo a otimizar.'); return; }
      if (!CFG.serverKey && !USER_KEY) { $('#keyModal').classList.remove('hidden'); return; }

      var out = $('#optOutput');
      out.innerHTML = '';
      var card = makeOptCard();
      out.appendChild(card);
      $('#optBtn').disabled = true;

      fetch('/api/optimize', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          content: content,
          kind: $('#optKind').value,
          platform: $('#optPlatform').value,
          context: $('#optContext').value.trim(),
          model: $('#optModel').value
        })
      }).then(function (r) { return r.json(); }).then(function (res) {
        $('#optBtn').disabled = false;
        if (res.error) {
          $('#optStatus').className = 'block-status error';
          $('#optStatus').textContent = '✕ erro';
          $('#optBody').textContent = 'ERRO: ' + res.error;
        } else {
          window._optResult = res.text;
          $('#optStatus').className = 'block-status done';
          $('#optStatus').textContent = '✓ pronto';
          $('#optBody').textContent = prettify(res.text);
        }
      }).catch(function (err) {
        $('#optBtn').disabled = false;
        $('#optStatus').className = 'block-status error';
        $('#optStatus').textContent = '✕ erro';
        $('#optBody').textContent = 'ERRO: ' + err.message;
      });
    };
  }

  function makeOptCard() {
    var card = document.createElement('div');
    card.className = 'block-card';
    card.innerHTML =
      '<div class="block-head">' +
        '<span class="block-title">RESULTADO OTIMIZADO</span>' +
        '<div class="block-actions">' +
          '<span class="block-status loading" id="optStatus"><span class="spinner"></span> otimizando</span>' +
          '<button class="copy-btn" id="optCopy">copiar</button>' +
        '</div>' +
      '</div>' +
      '<div class="block-body"><pre id="optBody">—</pre></div>';
    setTimeout(function () {
      $('#optCopy').onclick = function () {
        navigator.clipboard.writeText(window._optResult || '').then(function () {
          $('#optCopy').textContent = '✓ copiado';
          setTimeout(function () { $('#optCopy').textContent = 'copiar'; }, 1500);
        });
      };
    }, 0);
    return card;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
