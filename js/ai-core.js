    // ── API ──
    // Worker handles all model selection internally (OR → CF AI)
    // No model chain or cooldown needed on the client side

    function setModelChip(source) {
      const chip = document.getElementById('modelChip');
      if (!chip) return;
      const map = {
        '__or__': { text: '🌐 OR', cls: 'tier-3', title: 'Đang dùng OpenRouter' },
        '__cf__': { text: '☁ Cafe', cls: 'tier-4', title: 'Đang dùng Cloudflare AI' },
      };
      const info = map[source] || map['__cf__'];
      chip.textContent = info.text;
      chip.className = 'model-chip ' + info.cls;
      chip.title = info.title;
      chip.style.display = 'inline-flex';
    }

    // Dummy MODEL_CHAIN for outline.js compatibility (sampleModels filter)
    const MODEL_CHAIN = [];

    function aiOutageInfo() { return null; }

    // ── Loading UX ──
    let _busyTimer = null;
    let _progressTimer = null;
    let _progressVal = 0;

    const BUSY_MSGS_VI = [
      'Đang xử lý…', 'Đang phân tích…', 'Đang viết…',
      'Sắp xong rồi…', 'Đang hoàn thiện…', 'Chờ xíu nhé…',
    ];
    const BUSY_MSGS_EN = [
      'Processing…', 'Analysing…', 'Writing…',
      'Almost there…', 'Finishing up…', 'Just a moment…',
    ];

    function _startLoadingAnim(panelTitle) {
      _stopLoadingAnim();
      const msgs = uiLang === 'en' ? BUSY_MSGS_EN : BUSY_MSGS_VI;
      let idx = 0;
      _progressVal = 0;

      // Fake progress bar
      const lbar = document.getElementById('lbar');
      if (lbar) {
        lbar.style.width = '0%';
        lbar.style.transition = 'none';
      }

      // Rotating status text in pContent
      function updateMsg() {
        const pContent = document.getElementById('pContent');
        if (!pContent) return;
        const dots = ['', '.', '..', '...'][idx % 4 === 0 ? 0 : idx % 4];
        pContent.innerHTML = `<div class="ai-loading-wrap">
          <div class="ai-loading-dots"><span></span><span></span><span></span></div>
          <p class="ai-loading-msg">${msgs[Math.floor(idx / 2) % msgs.length]}</p>
        </div>`;
        idx++;
      }

      // Fake progress: quickly to 30%, slowly to 85%, stall there
      function updateProgress() {
        const lbar = document.getElementById('lbar');
        if (!lbar) return;
        if (_progressVal < 30) _progressVal += 3;
        else if (_progressVal < 60) _progressVal += 1.2;
        else if (_progressVal < 85) _progressVal += 0.4;
        lbar.style.transition = 'width 0.4s ease';
        lbar.style.width = _progressVal + '%';
      }

      updateMsg();
      updateProgress();
      _busyTimer = setInterval(() => { updateMsg(); updateProgress(); }, 2000);
    }

    function _stopLoadingAnim() {
      if (_busyTimer) { clearInterval(_busyTimer); _busyTimer = null; }
      // Complete the progress bar
      const lbar = document.getElementById('lbar');
      if (lbar) {
        lbar.style.transition = 'width 0.3s ease';
        lbar.style.width = '100%';
        setTimeout(() => { lbar.style.width = '0%'; lbar.style.transition = 'none'; }, 400);
      }
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
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ penly_key: lk, prompt, temperature: 0.7, max_tokens: maxTokens })
        });
        const d = await res.json();

        if (d.content) {
          if (!silent) setBusy(btnId, false, !noPanel);
          setModelChip(d.or_model ? '__or__' : '__cf__');
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
    let _panelRegenFn = null; // set by vocab/sample to enable ↻ button

    function _setRegenFn(fn) {
      _panelRegenFn = fn;
      const btn = document.getElementById('regenBtn');
      if (btn) btn.classList.toggle('hidden', !fn);
    }

    function regenPanel() {
      if (!_panelRegenFn) return;
      const vi = uiLang !== 'en';
      document.getElementById('regenModalTitle').textContent = vi ? 'Tạo lại nội dung?' : 'Regenerate content?';
      document.getElementById('regenModalDesc').textContent = vi
        ? 'Nội dung hiện tại sẽ bị xóa và AI sẽ tạo bản mới hoàn toàn.'
        : 'The current result will be discarded and AI will generate a fresh version.';
      document.getElementById('regenModalConfirm').querySelector('#regenModalBtnLabel').textContent = vi ? 'Tạo lại' : 'Regenerate';
      document.querySelector('#regenModal .express-cancel').textContent = vi ? 'Hủy' : 'Cancel';
      document.getElementById('regenModal').style.display = 'flex';
    }

    function closeRegenModal() {
      document.getElementById('regenModal').style.display = 'none';
    }

    function confirmRegen() {
      closeRegenModal();
      if (_panelRegenFn) _panelRegenFn();
    }

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
      _setRegenFn(null);
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
        if (panelTitle) document.getElementById('panelTitle').textContent = panelTitle;
        document.getElementById('resultPanel').classList.add('open');
        document.getElementById('editorPane').classList.add('shifted');
        _startLoadingAnim(panelTitle);
      }
      if (!on) _stopLoadingAnim();
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

