    // ── API ──
    const MODEL_CHAIN = [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
    ];
    // Human-readable tier labels (no technical names)
    const MODEL_LABELS = {
      'openai/gpt-oss-120b': { text: '✦ Cấp 1', cls: 'tier-1', title: 'Đang dùng AI cấp cao nhất' },
      'openai/gpt-oss-20b': { text: '⚡ Cấp 2', cls: 'tier-2', title: 'Đang dùng AI cấp 2 do cấp 1 bận' },
      'llama-3.3-70b-versatile': { text: '⚡ Cấp 3', cls: 'tier-3', title: 'Đang dùng AI cấp 3 do cấp trên bận' },
      'llama-3.1-8b-instant': { text: '⚡ Cấp 4', cls: 'tier-4', title: 'Đang dùng AI cấp 4 do cấp trên bận' },
      'gemma2-9b-it': { text: '⚡ Cấp 5', cls: 'tier-4', title: 'Đang dùng AI cấp 5 do cấp trên bận' },
      '__or__': { text: '🌐 Dự phòng 2', cls: 'tier-4', title: 'Đang dùng OpenRouter (miễn phí)' },
      '__gemini__': { text: '✨ Gemini', cls: 'tier-3', title: 'Đang dùng Gemini (Groq bận)' },
      '__cf__': { text: '☁ Dự phòng 3', cls: 'tier-4', title: 'Đang dùng Cloudflare AI (tất cả model chính bận)' },
    };

    function setModelChip(model) {
      const chip = document.getElementById('modelChip');
      if (!chip) return;
      const info = MODEL_LABELS[model] || { text: '✦ Cấp 1', cls: 'tier-1', title: '' };
      chip.textContent = info.text;
      chip.className = 'model-chip ' + info.cls;
      chip.title = info.title;
      chip.style.display = 'inline-flex';
    }
    // per-model cooldown: if rate limited, skip that model for 2 minutes
    const _modelCooldown = {}; // model -> timestamp until which it's blocked
    let _fallbackFailAt = 0; // when the fallback service last failed to answer

    // Non-null only when every main model is resting AND the fallback was just seen failing: asking again is pointless
    function aiOutageInfo() {
      const now = Date.now();
      const until = MODEL_CHAIN.map(m => _modelCooldown[m] || 0);
      if (!until.every(u => u > now) || !_fallbackFailAt || now - _fallbackFailAt > 120000) return null;
      return { minutes: Math.max(1, Math.ceil((Math.min(...until) - now) / 60000)) };
    }

    function _pickModel() {
      const now = Date.now();
      for (const m of MODEL_CHAIN) {
        if (!_modelCooldown[m] || now > _modelCooldown[m]) return m;
      }
      // all models rate limited — return last one anyway and let it fail gracefully
      return MODEL_CHAIN[MODEL_CHAIN.length - 1];
    }

    async function _callWorker(lk, prompt, model, maxTokens = 2000) {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ penly_key: lk, prompt, temperature: 0.7, max_tokens: maxTokens, model })
      });
      return res.json();
    }

    async function _callFallback(lk, prompt, maxTokens = 2000) {
      try {
        const cfRes = await fetch(WORKER_URL.replace(/\/?$/, '') + '/cf-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ penly_key: lk, prompt, temperature: 0.7, max_tokens: maxTokens })
        });
        const cfData = await cfRes.json();
        if (cfData.content) { _fallbackFailAt = 0; return cfData; }
        console.info(`[ai] fallback failed (${cfRes.status}): ${String(cfData.error || '').slice(0, 300)}`);
      } catch (e) {
        console.info(`[ai] fallback unreachable: ${e.message}`);
      }
      _fallbackFailAt = Date.now();
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

      const now = Date.now();
      const chain = models && models.length ? models : MODEL_CHAIN;

      // check if all Groq models are on cooldown — skip straight to fallback
      const allCooled = chain.every(m => _modelCooldown[m] && now < _modelCooldown[m]);
      if (allCooled) {
        const fb = await _callFallback(lk, prompt, maxTokens);
        if (fb) {
          if (!silent) setBusy(btnId, false, !noPanel);
          setModelChip(fb.gemini_model ? '__gemini__' : fb.or_model ? '__or__' : '__cf__');
          return fb.content;
        }
        if (!silent) setBusy(btnId, false, !noPanel);
        if (!silent) toast(uiLang === 'en' ? 'All models busy, please try again later.' : 'Tất cả model đang bận, vui lòng thử lại sau.', 'd');
        return null;
      }

      for (let i = 0; i < chain.length; i++) {
        const model = chain[i];
        if (_modelCooldown[model] && now < _modelCooldown[model]) continue;

        try {
          const d = await _callWorker(lk, prompt, model, maxTokens);

          if (d.content) {
            if (!silent) setBusy(btnId, false, !noPanel);
            setModelChip(model);
            return d.content;
          }

          if (d.rate_limited) {
            const isPermError = d.error && (
              d.error.toLowerCase().includes("does not exist") ||
              d.error.toLowerCase().includes("not found") ||
              d.error.toLowerCase().includes("do not have access")
            );
            const isDaily = d.error && /per day|\bTPD\b|\bRPD\b/i.test(d.error);
            const isPerMinute = d.error && /per minute|\bTPM\b|\bRPM\b/i.test(d.error);
            const w = String(d.error || '').match(/try again in\s*(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?/i);
            const advised = w ? (((+w[1] || 0) * 60 + (+w[2] || 0)) * 60 + (+w[3] || 0)) * 1000 + 2000 : 0;
            const defaultCooldown = isPermError ? 24 * 60 * 60 * 1000
              : isDaily ? 30 * 60 * 1000
              : isPerMinute ? 15 * 1000
              : 30 * 1000;
            _modelCooldown[model] = Date.now() + Math.min(24 * 60 * 60 * 1000, Math.max(advised, defaultCooldown));
            console.info(`[ai] ${model} unavailable${isDaily ? ' (daily quota)' : ''}: ${String(d.error || '').slice(0, 400)}`);
            // check if there's a next non-cooled model
            const hasNext = chain.slice(i + 1).some(m => !_modelCooldown[m] || Date.now() >= _modelCooldown[m]);
            if (hasNext) continue;
            // all Groq exhausted — try fallback silently
            const fb = await _callFallback(lk, prompt, maxTokens);
            if (fb) {
              if (!silent) setBusy(btnId, false, !noPanel);
              setModelChip(fb.gemini_model ? '__gemini__' : fb.or_model ? '__or__' : '__cf__');
              return fb.content;
            }
            if (!silent) setBusy(btnId, false, !noPanel);
            if (!silent) toast(uiLang === 'en' ? 'All models busy, please try again later.' : 'Tất cả model đang bận, vui lòng thử lại sau.', 'd');
            return null;
          }

          // non-rate-limit error — show it
          if (!silent) setBusy(btnId, false, !noPanel);
          const err = d.error || JSON.stringify(d);
          if (!silent) toast((uiLang === 'en' ? 'Error: ' : 'Lỗi: ') + err.substring(0, 100), 'd');
          return null;

        } catch {
          if (!silent) setBusy(btnId, false, !noPanel);
          if (!silent) toast(uiLang === 'en' ? 'Connection error.' : 'Lỗi kết nối.', 'd');
          return null;
        }
      }

      if (!silent) setBusy(btnId, false, !noPanel);
      if (!silent) toast(uiLang === 'en' ? 'All models busy, please try again shortly.' : 'Tất cả model đang bận, vui lòng thử lại sau ít phút.', 'd');
      return null;
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

