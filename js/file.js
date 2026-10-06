    // ── FILE ──
    const hasFSA = 'showSaveFilePicker' in window;

    // per-doc file handles: {docId -> FileSystemFileHandle}
    let fileHandles = {};
    try { fileHandles = JSON.parse(localStorage.getItem('wc_fh_names') || '{}'); } catch { }
    // Note: handles can't be serialized — we keep names for display, re-acquire handles on demand
    let liveHandles = {}; // docId -> FileSystemFileHandle (in-memory only)

    function initFSA() {
      updateFileChip();
      renderDocList(); // re-render to show floppy icons on FSA browsers
    }

    function initSidebarResize() {
      const sidebar = document.getElementById('sidebar');
      const handle = document.getElementById('sbResize');
      if (!handle || !sidebar) return;

      const MIN_W = 160, MAX_W = 480;

      // restore saved width — desktop only, mobile uses CSS fixed width
      const saved = parseInt(localStorage.getItem('ui_sbw') || '0');
      if (saved >= MIN_W && saved <= MAX_W && window.innerWidth > 640) {
        sidebar.style.width = saved + 'px';
      }

      let startX, startW;

      handle.addEventListener('mousedown', e => {
        if (sidebar.classList.contains('collapsed')) return;
        e.preventDefault();
        startX = e.clientX;
        startW = sidebar.offsetWidth;
        handle.classList.add('dragging');
        sidebar.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onSbMove);
        document.addEventListener('mouseup', onSbUp);
      });

      function onSbMove(e) {
        const w = Math.min(MAX_W, Math.max(MIN_W, startW + e.clientX - startX));
        sidebar.style.width = w + 'px';
      }
      function onSbUp() {
        handle.classList.remove('dragging');
        sidebar.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const w = sidebar.offsetWidth;
        if (w >= MIN_W) localStorage.setItem('ui_sbw', w);
        document.removeEventListener('mousemove', onSbMove);
        document.removeEventListener('mouseup', onSbUp);
      }

      // touch support
      handle.addEventListener('touchstart', e => {
        if (sidebar.classList.contains('collapsed')) return;
        startX = e.touches[0].clientX;
        startW = sidebar.offsetWidth;
        handle.classList.add('dragging');
        sidebar.classList.add('resizing');
      }, { passive: true });

      document.addEventListener('touchmove', e => {
        if (!handle.classList.contains('dragging')) return;
        const w = Math.min(MAX_W, Math.max(MIN_W, startW + e.touches[0].clientX - startX));
        sidebar.style.width = w + 'px';
      }, { passive: true });

      document.addEventListener('touchend', () => {
        if (!handle.classList.contains('dragging')) return;
        handle.classList.remove('dragging');
        sidebar.classList.remove('resizing');
        const w = sidebar.offsetWidth;
        if (w >= MIN_W) localStorage.setItem('ui_sbw', w);
      });
    }

    function updateFileChip() {
      const chip = document.getElementById('fileChip');
      const name = fileHandles[currentId];
      if (hasFSA && name) {
        document.getElementById('fileChipName').textContent = name;
        chip.style.display = 'inline-flex';
      } else {
        chip.style.display = 'none';
      }
    }

    function getFileName() {
      const d = getDoc(currentId);
      const base = titleInput.value.trim() || topicInput.value.trim() || 'English_Writing';
      return base.replace(/[\\/:*?"<>|]/g, '_').trim() + '.txt';
    }

    async function saveToFile() {
      const text = editor.innerText.trim();
      if (!text) return toast(t('toast-no-content'));

      if (hasFSA) {
        // try write to existing handle; if stale, clear and re-prompt once
        const doWrite = async (handle) => {
          const writable = await handle.createWritable();
          await writable.write(text);
          await writable.close();
        };

        const onSuccess = (handle) => {
          liveHandles[currentId] = handle;
          fileHandles[currentId] = handle.name;
          localStorage.setItem('wc_fh_names', JSON.stringify(fileHandles));
          updateFileChip();
          renderDocList();
          const now = new Date();
          saveIcon.className = 'bi bi-floppy-fill';
          saveIcon.style.color = 'var(--success)';
          saveStatus.textContent = t('save-time', { h: now.getHours(), m: String(now.getMinutes()).padStart(2, '0') });
          toast(t('toast-file-saved'), 's');
        };

        try {
          let handle = liveHandles[currentId];
          if (handle) {
            try {
              await doWrite(handle);
              onSuccess(handle);
            } catch (writeErr) {
              if (writeErr.name === 'AbortError') return;
              // handle stale (file moved/deleted) — clear and re-prompt
              delete liveHandles[currentId];
              delete fileHandles[currentId];
              localStorage.setItem('wc_fh_names', JSON.stringify(fileHandles));
              updateFileChip();
              handle = await window.showSaveFilePicker({
                suggestedName: getFileName(),
                types: [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }]
              });
              await doWrite(handle);
              onSuccess(handle);
            }
          } else {
            handle = await window.showSaveFilePicker({
              suggestedName: getFileName(),
              types: [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }]
            });
            await doWrite(handle);
            onSuccess(handle);
          }
        } catch (e) {
          if (e.name !== 'AbortError') toast(t('toast-file-error'), 'd');
        }
      } else {
        // fallback: download blob (works on all browsers/devices)
        exportTXT();
      }
    }

    async function saveToFileAuto() {
      // silent auto-save to existing handle only — never prompt, never block
      if (!hasFSA) return;
      const handle = liveHandles[currentId];
      if (!handle) return; // no handle = localStorage only, that's fine
      const text = editor.innerText.trim();
      if (!text) return;
      try {
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        // update file chip to show last saved time
        const chip = document.getElementById('fileChip');
        if (chip) chip.title = (uiLang === 'en' ? 'Last saved ' : 'Đã lưu lúc ') +
          new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2, '0');
      } catch (e) {
        // handle lost (file moved/deleted/permission revoked) — unlink silently
        if (e.name !== 'AbortError') {
          delete liveHandles[currentId];
          delete fileHandles[currentId];
          localStorage.setItem('wc_fh_names', JSON.stringify(fileHandles));
          updateFileChip();
          renderDocList();
        }
      }
    }

    async function openFromFile() {
      if (hasFSA) {
        try {
          const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }],
            multiple: false
          });
          const file = await handle.getFile();
          const text = await file.text();
          if (editor.innerText.trim() && !confirm(t('confirm-overwrite'))) return;
          const d = getDoc(currentId);
          if (d) {
            d.title = file.name.replace(/\.txt$/i, '');
            d.topic = d.title;
            d.html = text;
            d.date = new Date().toLocaleDateString('vi-VN');
            // store handle for this doc
            liveHandles[currentId] = handle;
            fileHandles[currentId] = handle.name;
            localStorage.setItem('wc_fh_names', JSON.stringify(fileHandles));
            openDoc(d.id);
            updateFileChip();
          }
          toast(t('toast-imported'), 's');
        } catch (e) {
          if (e.name !== 'AbortError') toast(t('toast-file-error'), 'd');
        }
      }
    }

    function exportTXT() {
      const text = editor.innerText.trim();
      if (!text) return toast(t('toast-no-content'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      a.download = getFileName();
      a.click(); toast(t('toast-exported'), 's');
    }

    function importTXT(e) {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        if (editor.innerText.trim() && !confirm(t('confirm-overwrite'))) return;
        const d = getDoc(currentId);
        if (d) {
          d.title = file.name.replace(/\.txt$/i, '');
          d.topic = d.title;
          d.html = ev.target.result;
          d.date = new Date().toLocaleDateString('vi-VN');
          openDoc(d.id);
        }
        toast(t('toast-imported'), 's');
      };
      reader.readAsText(file, 'utf-8'); e.target.value = '';
    }

