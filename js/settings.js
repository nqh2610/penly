    // ══ UI SETTINGS ══

    // UI font size: sets --ui-fs on :root → html font-size inherits → ALL rem values scale
    function setUIFs(v) {
      v = Math.min(19, Math.max(12, v));
      document.documentElement.style.setProperty('--ui-fs', v + 'px');
      document.getElementById('uiFsVal').textContent = v + 'px';
      document.getElementById('uiFsRange').value = v;
      localStorage.setItem('ui_uifs', v);
    }

    // Editor font size: independent token
    function setEdFs(v) {
      document.documentElement.style.setProperty('--ed-fs', v + 'px');
      document.getElementById('edFsVal').textContent = v + 'px';
      localStorage.setItem('ui_edfs', v);
    }

    function setLH(v) {
      v = Math.round(v * 10) / 10;
      document.documentElement.style.setProperty('--ed-lh', v);
      document.getElementById('lhVal').textContent = v.toFixed(1);
      localStorage.setItem('ui_lh', v);
    }

    function setFont(v) {
      document.documentElement.style.setProperty('--ed-font', v);
      localStorage.setItem('ui_font', v);
    }

    function setPW(v) {
      document.documentElement.style.setProperty('--panel-w', v + 'px');
      document.getElementById('pwVal').textContent = v + 'px';
      localStorage.setItem('ui_pw', v);
      const p = document.getElementById('resultPanel');
      if (p.classList.contains('open')) {
        p.style.width = v + 'px';
        document.getElementById('editorPane').style.marginRight = v + 'px';
      }
    }

    function setPad(m) {
      // max-width removed (full-width layout) — just track selection visually
      ['pdC', 'pdN', 'pdW'].forEach(id => document.getElementById(id).classList.remove('on'));
      document.getElementById({ compact: 'pdC', normal: 'pdN', wide: 'pdW' }[m]).classList.add('on');
      localStorage.setItem('ui_pad', m);
    }

    function setTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      document.getElementById('thLight').classList.toggle('on', t === 'light');
      document.getElementById('thDark').classList.toggle('on', t === 'dark');
      localStorage.setItem('ui_theme', t);
    }

    function setAccent(el) {
      const a = el.dataset.a, h = el.dataset.h;
      document.documentElement.style.setProperty('--accent', a);
      document.documentElement.style.setProperty('--accent-h', h);
      document.querySelectorAll('.sw').forEach(s => s.classList.remove('on'));
      el.classList.add('on');
      localStorage.setItem('ui_accent', a); localStorage.setItem('ui_accenth', h);
    }

    function toggleSettings() {
      const d = document.getElementById('settingsDrawer');
      const open = d.classList.toggle('open');
      document.getElementById('btnSettings').classList.toggle('active', open);
      if (open) { sdRefreshKey(); }
    }

    async function clearCacheAndReload() {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.unregister();
      } catch (_) {}
      location.reload(true);
    }

    function sdRefreshKey() {
      const k = getLicenseKey();
      const el = document.getElementById('sdKeyDisplay');
      if (el) el.textContent = k ? k : '(Chưa có key)';
    }

    function sdShowKeyInput() {
      const row = document.getElementById('sdKeyInputRow');
      row.style.display = 'block';
      const inp = document.getElementById('sdKeyInput');
      inp.value = '';
      document.getElementById('sdKeyErr').style.display = 'none';
      inp.focus();
      // format input same as license gate
      inp.oninput = () => {
        const raw = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
        let out = raw.slice(0, 5);
        if (raw.length > 5) out += '-' + raw.slice(5, 9);
        if (raw.length > 9) out += '-' + raw.slice(9, 13);
        if (raw.length > 13) out += '-' + raw.slice(13, 17);
        inp.value = out;
      };
    }

    async function sdSubmitKey() {
      const inp = document.getElementById('sdKeyInput');
      const raw = inp.value.trim().toUpperCase();
      const err = document.getElementById('sdKeyErr');
      if (!(await validateKeyFromServer(raw))) {
        err.style.display = 'block'; return;
      }
      setLicenseKey(raw);
      sdCancelKey();
      sdRefreshKey();
      toast(uiLang === 'en' ? 'Key updated' : 'Đã cập nhật key', 's');
    }

    function sdCancelKey() {
      document.getElementById('sdKeyInputRow').style.display = 'none';
    }
    document.addEventListener('click', e => {
      const d = document.getElementById('settingsDrawer');
      const btn = document.getElementById('btnSettings');
      if (d.classList.contains('open') && !d.contains(e.target) && !btn.contains(e.target))
        toggleSettings();
    });

    // swipe-down to close settings drawer (same logic as panel)
    (() => {
      const d = document.getElementById('settingsDrawer');
      let startY = 0, startX = 0, dragging = false;
      d.addEventListener('touchstart', e => {
        const body = d.querySelector('.sd-body');
        const atTop = !body || body.scrollTop <= 2;
        if (!atTop) return;
        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
        dragging = true;
      }, { passive: true });
      d.addEventListener('touchmove', e => {
        if (!dragging) return;
        const dy = e.touches[0].clientY - startY;
        const dx = Math.abs(e.touches[0].clientX - startX);
        if (dy > 10 && dx < dy) {
          d.style.transform = `translateX(0) translateY(${Math.min(dy, 200)}px)`;
          d.style.transition = 'none';
        }
      }, { passive: true });
      d.addEventListener('touchend', e => {
        if (!dragging) return;
        dragging = false;
        const dy = e.changedTouches[0].clientY - startY;
        d.style.transition = '';
        if (dy > 80) {
          d.style.transform = '';
          toggleSettings();
        } else {
          d.style.transform = '';
        }
      });
    })();

    function loadUI() {
      const uifs = +(localStorage.getItem('ui_uifs') || 15);
      document.getElementById('uiFsRange').value = uifs; setUIFs(uifs);

      const edfs = +(localStorage.getItem('ui_edfs') || 18);
      document.getElementById('edFsRange').value = edfs; setEdFs(edfs);

      const lh = +(localStorage.getItem('ui_lh') || 1.8);
      document.getElementById('lhRange').value = lh; setLH(lh);

      const font = localStorage.getItem('ui_font') || '"Be Vietnam Pro",system-ui,sans-serif';
      document.getElementById('fontSel').value = font; setFont(font);

      const pw = +(localStorage.getItem('ui_pw') || 420);
      document.getElementById('pwRange').value = pw; document.getElementById('pwVal').textContent = pw + 'px';
      document.documentElement.style.setProperty('--panel-w', pw + 'px');

      setTheme(localStorage.getItem('ui_theme') || 'light');
      setPad(localStorage.getItem('ui_pad') || 'normal');

      const acc = localStorage.getItem('ui_accent');
      if (acc) {
        const acch = localStorage.getItem('ui_accenth') || acc;
        document.documentElement.style.setProperty('--accent', acc);
        document.documentElement.style.setProperty('--accent-h', acch);
        document.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s.dataset.a === acc));
      }

      // language: default Vietnamese
      setLang(localStorage.getItem('ui_lang') || 'vi');

      // init AC toggle button state
      // File System Access API
      initFSA();
      // Sidebar resize
      initSidebarResize();
      // clear any saved inline width on mobile so CSS breakpoint controls layout
      if (window.innerWidth <= 640) {
        document.getElementById('sidebar').style.width = '';
      }
    }

