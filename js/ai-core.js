    // ── API ──
    // Worker handles all model selection internally (Gemini → OpenRouter → CF AI)
    // No model chain or cooldown needed on the client side

    function setModelChip(source) {
      const chip = document.getElementById('modelChip');
      if (!chip) return;
      const map = {
        '__gemini__': { text: '✨ Gem', cls: 'tier-1', title: 'Đang dùng Gemini' },
        '__or__':     { text: '🌐 OR', cls: 'tier-3', title: 'Đang dùng OpenRouter' },
        '__cf__':     { text: '☁ Cafe', cls: 'tier-4', title: 'Đang dùng Cloudflare AI' },
      };
      const info = map[source] || map['__gemini__'];
      chip.textContent = info.text;
      chip.className = 'model-chip ' + info.cls;
      chip.title = info.title;
      chip.style.display = 'inline-flex';
    }

    // Dummy MODEL_CHAIN for outline.js compatibility (sampleModels filter)
    const MODEL_CHAIN = [];

    function aiOutageInfo() { return null; }

    // Gemini models to try client-side (browser IP bypasses datacenter geo-block)
    const GEMINI_MODELS_CLIENT = ['gemini-2.0-flash', 'gemini-1.5-flash-latest'];

    async function callGeminiDirect(prompt, maxTokens) {
      const gk = localStorage.getItem('penly_gk');
      if (!gk || gk.length < 20) return null;

      const usesBearer = gk.startsWith('AQ');
      for (const model of GEMINI_MODELS_CLIENT) {
        try {
          const url = usesBearer
            ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
            : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gk}`;
          const headers = { 'Content-Type': 'application/json' };
          if (usesBearer) headers['Authorization'] = `Bearer ${gk}`;

          const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens ?? 2000 },
            }),
          });
          const data = await res.json();
          if (res.status === 429 || res.status === 503) continue;
          if (data.error) continue;
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (content) return { content, gemini_model: model };
        } catch { /* try next */ }
      }
      return null;
    }

    async function callAI(prompt, btnId, silent = false, noPanel = false, maxTokens = 2000, panelTitle = null, models = null) {
      const lk = getLicenseKey();
      if (!lk || !(await isValidKey(lk))) {
        if (!silent) setBusy(btnId, false, !noPanel);
        document.getElementById('licenseGate').classList.remove('hidden');
        return null;
      }
      if (!silent) setBusy(btnId, true, !noPanel, panelTitle);

      try {
        // Try Gemini directly from browser first (user's IP, bypasses datacenter geo-block)
        const gemDirect = await callGeminiDirect(prompt, maxTokens);
        if (gemDirect) {
          if (!silent) setBusy(btnId, false, !noPanel);
          setModelChip('__gemini__');
          return gemDirect.content;
        }

        // Fall back to worker (OpenRouter → Cloudflare AI)
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ penly_key: lk, prompt, temperature: 0.7, max_tokens: maxTokens })
        });
        const d = await res.json();

        if (d.content) {
          if (!silent) setBusy(btnId, false, !noPanel);
          setModelChip(d.gemini_model ? '__gemini__' : d.or_model ? '__or__' : '__cf__');
          return d.content;
        }

        if (!silent) setBusy(btnId, false, !noPanel);
        if (d.rate_limited) {
          if (!silent) toast(uiLang === 'en' ? 'AI is busy, please try again shortly.' : 'AI đang bận, vui lòng thử lại sau.', 'd');
        } else {
          const err = d.error || 'Unknown error';
          if (!silent) toast((uiLang === 'en' ? 'Error: ' : 'Lỗi: ') + err.substring(0, 100), 'd');
        }
        return null;

      } catch {
        if (!silent) setBusy(btnId, false, !noPanel);
        if (!silent) toast(uiLang === 'en' ? 'Connection error.' : 'Lỗi kết nối.', 'd');
        return null;
      }
    }
    function strip(s) { return s.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim(); }

    // ── PANEL ──
    function openPanel(title, md, cards, keepCards = false) {
      document.getElementById('panelTitle').textContent = title;
      document.getElementById('pContent').innerHTML = md ? marked.parse(md) : '';
      const ce = document.getElementById('pCards');
      if (keepCards) {
        // caller already populated pCards — just ensure it's visible if it has content
        if (!ce.innerHTML.trim()) ce.style.display = 'none';
      } else if (cards && cards.length) {
        ce.innerHTML = `<p style="font-size:.7rem;font-weight:700;color:var(--muted);margin-bottom:9px">${t('sc-intro')}</p>`;
        cards.forEach((item, idx) => {
          // support both old string format and new {en, vi} object format
          const eng = typeof item === 'object' ? item.en : (item.match(/^(.*?)\s*\(/) || [, ''])[1].trim() || item;
          const vi = typeof item === 'object' ? item.vi : (item.match(/\(([^)]+)\)$/) || [, ''])[1] || '';
          const label = uiLang === 'en'
            ? ['Option 1', 'Option 2', 'Option 3'][idx] || `Option ${idx + 1}`
            : ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3'][idx] || `Lựa chọn ${idx + 1}`;

          const c = document.createElement('div');
          c.className = 'sc';
          c.innerHTML =
            `<div class="sc-num">${label}</div>` +
            `<div class="sc-en">${escHtml(eng)}</div>` +
            (vi ? `<div class="sc-vi">${escHtml(vi)}</div>` : '') +
            `<div class="sc-hint"><i class="bi bi-plus-circle"></i> ${t('sc-hint')}</div>`;
          c.onclick = () => {
            const l = editor.innerText.trimEnd();
            const sep = /[.!?]$/.test(l) ? ' ' : '. ';
            insertAt((/[.!?]$/.test(l) ? sep : (l ? sep : '')) + eng);
            editor.dispatchEvent(new Event('input'));
            toast(t('toast-inserted'), 's');
          };
          ce.appendChild(c);
        });
        ce.style.display = 'block';
      } else { ce.style.display = 'none'; }
      document.getElementById('lbar').classList.add('hidden');
      document.getElementById('resultPanel').classList.add('open');
      document.getElementById('editorPane').classList.add('shifted');
    }
    function closePanel() {
      const panel = document.getElementById('resultPanel');
      const pane = document.getElementById('editorPane');
      panel.classList.remove('open');
      pane.classList.remove('shifted');
      pane.style.marginRight = '';
    }
    function setPanelTitle(key) {
      document.getElementById('panelTitle').textContent = t(key);
    }
    function copyPanel() {
      const txt = document.getElementById('pContent').innerText;
      if (!txt.trim()) return;
      navigator.clipboard.writeText(txt).then(() => toast(t('toast-copied'), 's'));
    }
    function setBusy(id, on, openPanel = true, panelTitle = null) {
      if (!id) return;
      const el = document.getElementById(id); if (!el) return;
      el.classList.toggle('loading', on);
      document.getElementById('lbar').classList.toggle('hidden', !on);
      if (on && openPanel) {
        document.getElementById('pCards').style.display = 'none';
        document.getElementById('pContent').innerHTML = `<p style="color:var(--muted);font-size:.83rem;font-style:italic">${t('processing')}</p>`;
        if (panelTitle) document.getElementById('panelTitle').textContent = panelTitle;
        document.getElementById('resultPanel').classList.add('open');
        document.getElementById('editorPane').classList.add('shifted');
      }
    }

    // ── RESIZE PANEL ──
    (function () {
      const handle = document.getElementById('rzHandle');
      const panel = document.getElementById('resultPanel');
      let sx = 0, sw = 0;
      function onPanelMove(e) {
        const nw = Math.min(Math.max(sw + (sx - e.clientX), 260), window.innerWidth * .72);
        panel.style.width = nw + 'px';
        document.getElementById('editorPane').style.marginRight = nw + 'px';
        document.documentElement.style.setProperty('--panel-w', nw + 'px');
        document.getElementById('pwRange').value = nw;
        document.getElementById('pwVal').textContent = nw + 'px';
        localStorage.setItem('ui_pw', nw);
      }
      function onPanelUp() {
        handle.classList.remove('active');
        document.body.style.userSelect = ''; document.body.style.cursor = '';
        document.removeEventListener('mousemove', onPanelMove);
        document.removeEventListener('mouseup', onPanelUp);
      }
      handle.addEventListener('mousedown', e => {
        sx = e.clientX; sw = panel.offsetWidth;
        handle.classList.add('active');
        document.body.style.userSelect = 'none'; document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', onPanelMove);
        document.addEventListener('mouseup', onPanelUp);
      });
    })();

    // ── SWIPE DOWN TO CLOSE PANEL (mobile) ──
    (function () {
      const panel = document.getElementById('resultPanel');
      let startY = 0, startX = 0, dragging = false;
      panel.addEventListener('touchstart', e => {
        // only trigger swipe from panel-head area or when scrolled to top
        const body = panel.querySelector('.panel-body');
        const atTop = !body || body.scrollTop <= 2;
        if (!atTop) return;
        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
        dragging = true;
      }, { passive: true });
      panel.addEventListener('touchmove', e => {
        if (!dragging) return;
        const dy = e.touches[0].clientY - startY;
        const dx = Math.abs(e.touches[0].clientX - startX);
        if (dy > 10 && dx < dy) {
          panel.style.transform = `translateY(${Math.min(dy, 200)}px)`;
          panel.style.transition = 'none';
        }
      }, { passive: true });
      panel.addEventListener('touchend', e => {
        if (!dragging) return;
        dragging = false;
        const dy = e.changedTouches[0].clientY - startY;
        panel.style.transition = '';
        if (dy > 80) {
          panel.style.transform = '';
          closePanel();
        } else {
          panel.style.transform = '';
        }
      });
    })();

