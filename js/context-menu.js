    // ── CONTEXT MENU ──
    let ctxLongPressTimer = null;
    let ctxTargetNode = null;
    let ctxFromPanel = false;
    let _ctxPopoverSel = null; // saved selection range for popover positioning

    function openCtxPopover(title, md) {
      const pop = document.getElementById('ctxPopover');
      document.getElementById('ctxPopoverTitle').textContent = title;
      document.getElementById('ctxPopoverBody').innerHTML = md ? marked.parse(md) : '<p style="color:var(--muted);font-style:italic;font-size:.83rem">Đang xử lý…</p>';
      // Position near saved selection
      const vw = window.innerWidth, vh = window.innerHeight;
      const pw = Math.min(380, vw * 0.92);
      pop.style.width = pw + 'px';
      pop.style.display = 'flex';
      let left = 0, top = 0;
      if (_ctxPopoverSel) {
        try {
          const rect = _ctxPopoverSel.getBoundingClientRect();
          left = rect.left;
          top = rect.bottom + 10;
          // keep in viewport
          if (left + pw > vw - 8) left = vw - pw - 8;
          if (left < 8) left = 8;
          const ph = Math.min(vh * 0.7, 480);
          if (top + ph > vh - 8) top = rect.top - ph - 10;
          if (top < 8) top = 8;
        } catch { left = 8; top = 60; }
      } else {
        left = Math.max(8, vw / 2 - pw / 2);
        top = 60;
      }
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
      setTimeout(() => document.addEventListener('pointerdown', _closePopoverOutside, { once: true }), 50);
    }

    function updateCtxPopover(md) {
      const body = document.getElementById('ctxPopoverBody');
      if (body) body.innerHTML = md ? marked.parse(md) : '';
    }

    function closeCtxPopover() {
      document.getElementById('ctxPopover').style.display = 'none';
    }

    function _closePopoverOutside(e) {
      if (!document.getElementById('ctxPopover')?.contains(e.target)) closeCtxPopover();
      else setTimeout(() => document.addEventListener('pointerdown', _closePopoverOutside, { once: true }), 50);
    }

    function showCtxMenu(x, y, panelMode = false) {
      ctxFromPanel = panelMode;
      const menu = document.getElementById('ctxMenu');
      if (!menu) return;
      const selText = window.getSelection()?.toString().trim() || '';
      const hasSel = selText.length > 0;
      const isShort = hasSel && selText.length <= 300 && (selText.match(/[.!?]/g) || []).length <= 1;
      const isOneWord = hasSel && /^\s*[a-zA-Z'-]+\s*$/.test(selText);

      const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };

      if (panelMode) {
        // panel: ẩn cut/paste/tts-from, giữ copy + đọc đoạn + phân tích
        show('ctx-cut', false);
        show('ctx-copy', hasSel);
        show('ctx-paste', false);
        show('ctx-sep-edit', hasSel);
        show('ctx-tts-para', true);
        show('ctx-tts-from', false);
        show('ctx-sep-analysis', isShort || isOneWord);
        show('ctx-dict', isOneWord);
        show('ctx-paraphrase', isShort);
        show('ctx-explain', isShort);
        show('ctx-analyze', isShort);
      } else {
        document.getElementById('ctx-cut')?.toggleAttribute('disabled', !hasSel);
        document.getElementById('ctx-copy')?.toggleAttribute('disabled', !hasSel);
        show('ctx-cut', true);
        show('ctx-copy', true);
        show('ctx-paste', true);
        show('ctx-sep-edit', true);
        show('ctx-tts-para', true);
        show('ctx-tts-from', true);
        show('ctx-sep-analysis', isShort || isOneWord);
        show('ctx-dict', isOneWord);
        show('ctx-paraphrase', isShort);
        show('ctx-explain', isShort);
        show('ctx-analyze', isShort);
      }

      menu.classList.add('open');
      // save selection range for popover positioning
      const sel = window.getSelection();
      _ctxPopoverSel = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;
      const vw = window.innerWidth, vh = window.innerHeight;
      const mw = 200, mh = 280;
      let left = x, top = y;
      if (left + mw > vw - 8) left = vw - mw - 8;
      if (top + mh > vh - 8) top = vh - mh - 8;
      if (left < 8) left = 8;
      if (top < 8) top = 8;
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      setTimeout(() => document.addEventListener('pointerdown', closeCtxOnOutside, { once: true }), 10);
    }

    function closeCtxMenu() {
      document.getElementById('ctxMenu')?.classList.remove('open');
    }

    function closeCtxOnOutside(e) {
      if (!document.getElementById('ctxMenu')?.contains(e.target)) closeCtxMenu();
    }


    function ctxCut() {
      closeCtxMenu();
      document.execCommand('cut');
    }

    function ctxCopy() {
      closeCtxMenu();
      document.execCommand('copy');
    }

    async function ctxPaste() {
      closeCtxMenu();
      try {
        const text = await navigator.clipboard.readText();
        document.execCommand('insertText', false, text);
      } catch {
        document.execCommand('paste');
      }
    }

    // Block native context menu on editor, show custom one
    editor.addEventListener('contextmenu', e => {
      e.preventDefault();
      ctxTargetNode = e.target;
      showCtxMenu(e.clientX, e.clientY);
    });

    // Context menu on result panel — analysis items only
    document.getElementById('pContent').addEventListener('contextmenu', e => {
      const sel = window.getSelection()?.toString().trim();
      if (!sel) return; // no selection — let browser handle it
      e.preventDefault();
      ctxTargetNode = e.target;
      showCtxMenu(e.clientX, e.clientY, true); // panelMode=true
    });

    // Long-press on touch devices
    editor.addEventListener('touchstart', e => {
      ctxLongPressTimer = setTimeout(() => {
        ctxTargetNode = e.target;
        const t = e.touches[0];
        showCtxMenu(t.clientX, t.clientY);
      }, 600);
    }, { passive: true });

    editor.addEventListener('touchend', () => clearTimeout(ctxLongPressTimer));
    editor.addEventListener('touchmove', () => clearTimeout(ctxLongPressTimer));
    editor.addEventListener('touchcancel', () => clearTimeout(ctxLongPressTimer));

    // ── SELECTION TOOLBAR (mobile) ──
    let selHideTimer = null;
    const getSelToolbar = () => document.getElementById('selToolbar');

    function showSelToolbar() {
      return; // disabled — context menu handles all actions
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { hideSelToolbar(); return; }
      if (!editor.contains(sel.anchorNode)) { hideSelToolbar(); return; }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) { hideSelToolbar(); return; }

      const selText = sel.toString().trim();
      const isShort = selText.length <= 300 && (selText.match(/[.!?]/g) || []).length <= 1;

      // Show/hide analysis buttons based on selection length
      ['selParaphraseBtn', 'selExplainBtn', 'selAnalyzeBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isShort ? '' : 'none';
      });

      getSelToolbar().classList.add('show');

      // Position above selection, centered
      const _st = getSelToolbar();
      const tw = _st.offsetWidth || 320;
      let left = rect.left + rect.width / 2 - tw / 2;
      let top = rect.top - _st.offsetHeight - 12;

      // Keep in viewport
      if (left < 8) left = 8;
      if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
      if (top < 8) top = rect.bottom + 12;

      _st.style.left = left + 'px';
      _st.style.top = top + 'px';
    }

    function hideSelToolbar() {
      getSelToolbar()?.classList.remove('show');
    }

    // Show on selection change (touch devices)
    document.addEventListener('selectionchange', () => {
      clearTimeout(selHideTimer);
      // Small delay so selection is finalized
      selHideTimer = setTimeout(showSelToolbar, 300);
    });

    // Hide when tapping outside editor
    document.addEventListener('pointerdown', e => {
      if (!editor.contains(e.target) && !getSelToolbar()?.contains(e.target)) hideSelToolbar();
    });

    // ── POPOVER DRAG ──
    (function () {
      const pop = document.getElementById('ctxPopover');
      const header = document.getElementById('ctxPopoverHeader');
      if (!pop || !header) return;
      let ox = 0, oy = 0, sx = 0, sy = 0;
      let isDragging = false;

      header.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        isDragging = false;
        sx = e.clientX; sy = e.clientY;
        ox = parseInt(pop.style.left) || pop.getBoundingClientRect().left;
        oy = parseInt(pop.style.top) || pop.getBoundingClientRect().top;
        header.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation(); // prevent _closePopoverOutside from firing
      });

      header.addEventListener('pointermove', e => {
        if (!header.hasPointerCapture(e.pointerId)) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (!isDragging && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        isDragging = true;
        const vw = window.innerWidth, vh = window.innerHeight;
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        let nx = Math.max(0, Math.min(ox + dx, vw - pw));
        let ny = Math.max(0, Math.min(oy + dy, vh - ph));
        pop.style.left = nx + 'px';
        pop.style.top = ny + 'px';
      });

      header.addEventListener('pointerup', e => {
        if (isDragging) e.stopPropagation();
        isDragging = false;
      });
      header.addEventListener('pointercancel', () => { isDragging = false; });
    })();

    // Selection toolbar action helpers — hide toolbar then run action
    function selAction(fn) { hideSelToolbar(); fn(); }
    function selCut() { hideSelToolbar(); document.execCommand('cut'); }
    function selCopy() { hideSelToolbar(); document.execCommand('copy'); }
    function selPaste() { hideSelToolbar(); ctxPaste(); }
    function selTTS() { hideSelToolbar(); ctxTTSPara(); }
    function selImprove() { selAction(callImprove); }
    function selParaphrase() { selAction(callParaphrase); }
    function selExplain() { selAction(callExplain); }
    function selAnalyze() { selAction(callAnalyze); }

