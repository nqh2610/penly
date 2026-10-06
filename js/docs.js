    // ══ DOC MANAGEMENT ══
    function loadDocs() {
      try { docs = JSON.parse(localStorage.getItem('wc_docs') || '[]'); } catch { docs = []; }
      if (!docs.length) createDoc(false);
      else openDoc(docs[0].id, false);
      renderDocList();
    }
    function saveDocs() {
      try {
        localStorage.setItem('wc_docs', JSON.stringify(
          docs.map(d => ({ ...d, html: d.id === currentId ? editor.innerHTML : d.html }))
        ));
      } catch (e) {
        // localStorage full (common on iOS 5MB limit) — show warning once
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
          toast(uiLang === 'en'
            ? 'Storage full — export your docs to free space'
            : 'Bộ nhớ đầy — hãy xuất bài để giải phóng dung lượng', 'd');
        }
      }
    }

    // Đảm bảo lưu doc.topic độc lập với doc.title
    function onTopicInput(val) {
      const doc = docs.find(d => d.id === currentDocId);
      if (doc) {
        doc.topic = val; // Lưu riêng chủ đề
        saveDocs();
      }
    }
    function getDoc(id) { return docs.find(d => d.id === id); }

    function createDoc(render = true) {
      const d = {
        id: Date.now(), title: '', topic: '', titleCustom: false, html: '',
        aud: document.getElementById('audSel').value,
        tone: document.getElementById('toneSel').value,
        lvl: document.getElementById('lvlSel').value,
        date: new Date().toLocaleDateString('vi-VN')
      };
      docs.unshift(d); saveDocs(); openDoc(d.id, render);
    }
    function newDoc() {
      createDoc(true);
      if (document.getElementById('editor')) document.getElementById('editor').value = '';
      if (document.getElementById('outlineBox')) document.getElementById('outlineBox').innerHTML = '';
      _olState = null;
    }

    function openDoc(id, render = true) {
      if (currentId && currentId !== id) {
        const cur = getDoc(currentId);
        if (cur) {
          cur.html = editor.innerHTML;
          cur.topic = topicInput.value.trim(); // Lưu topic bài cũ trước khi chuyển
        }
      }
      currentId = id;
      improveOriginalText = null; // reset khi chuyển doc
      const d = getDoc(id); if (!d) return;

      topicInput.value = d.topic || ''; // Nạp topic của bài được chọn vào ô nhập

      titleInput.value = d.titleCustom ? (d.title || '') : (d.topic || '');
      document.getElementById('audSel').value = d.aud || document.getElementById('audSel').options[1].value;
      document.getElementById('toneSel').value = d.tone || document.getElementById('toneSel').options[1].value;
      document.getElementById('lvlSel').value = d.lvl || document.getElementById('lvlSel').options[1].value;
      editor.innerHTML = d.html || '';
      updateDocTitleDisplay();
      updateWC(); hideAC(); closePanel();
      syncCtxBar();
      updateFileChip();
      if (window.innerWidth <= 640) closeSidebarMobile();
      if (render) renderDocList();
    }

    function saveDoc() {
      const d = getDoc(currentId); if (!d) return;
      d.html = editor.innerHTML;
      d.topic = topicInput.value.trim();
      d.title = d.titleCustom ? titleInput.value.trim() : d.topic;
      d.date = new Date().toLocaleDateString('vi-VN');
      saveDocs(); renderDocList();
      // localStorage save always succeeds — show success immediately
      const now = new Date();
      saveIcon.className = 'bi bi-cloud-check-fill';
      saveIcon.style.color = 'var(--success)';
      saveStatus.textContent = t('save-time', { h: now.getHours(), m: String(now.getMinutes()).padStart(2, '0') });
      // FSA auto-save is best-effort: runs silently, won't change the save indicator
      saveToFileAuto().catch(() => { });
    }
    function saveDocMeta() {
      const d = getDoc(currentId); if (!d) return;
      d.aud = document.getElementById('audSel').value;
      d.tone = document.getElementById('toneSel').value;
      d.lvl = document.getElementById('lvlSel').value;
      d.topic = topicInput.value.trim();
      d.title = d.titleCustom ? titleInput.value.trim() : d.topic;
      saveDocs(); renderDocList();
    }

    function onTopicChange() {
      const d = getDoc(currentId); if (!d) return;
      d.topic = topicInput.value.trim();
      if (!d.titleCustom) {
        titleInput.value = d.topic;
        d.title = d.topic;
      }
      updateDocTitleDisplay();
      _debouncedTopicSave();
    }
    const _debouncedTopicSave = debounce(() => { saveDocs(); renderDocList(); }, 300);

    function onTitleChange() {
      const doc = docs.find(d => d.id === currentDocId);
      if (doc) {
        doc.title = document.getElementById('titleInput').value; // Chỉ đổi tiêu đề
        saveDocs(); // Lưu lại (doc.topic vẫn giữ nguyên giá trị cũ)
      }
    }
    const _debouncedTitleRender = debounce(() => renderDocList(), 300);

    function toggleTopicLock() { /* no-op — kept for any stale references */ }
    function updateTopicLockUI() { /* no-op */ }

    function updateDocTitleDisplay() {
      const val = titleInput.value.trim() || topicInput.value.trim();
      if (val) titleInput.value = val;
      const display = document.getElementById('titleDisplay');
      if (display) display.textContent = titleInput.value.trim() || t('untitled') || '(Chưa đặt tên)';
    }

    function toggleTitleMenu(e) {
      e.stopPropagation();
      const dd = document.getElementById('titleDropdown');
      dd.classList.toggle('open');
    }

    let _renameCb = null;
    function showRenameDialog(current, title, cb) {
      _renameCb = cb;
      const overlay = document.getElementById('renameOverlay');
      document.getElementById('renameDlgTitle').textContent = title;
      const inp = document.getElementById('renameDlgInput');
      inp.value = current;
      overlay.style.display = 'flex';
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
    }
    function renameDialogOK() {
      const val = document.getElementById('renameDlgInput').value.trim();
      document.getElementById('renameOverlay').style.display = 'none';
      if (_renameCb) { _renameCb(val); _renameCb = null; }
    }
    function renameDialogCancel() {
      document.getElementById('renameOverlay').style.display = 'none';
      _renameCb = null;
    }

    function startRenameDoc() {
      document.getElementById('titleDropdown').classList.remove('open');
      const d = getDoc(currentId); if (!d) return;
      const current = titleInput.value.trim() || topicInput.value.trim() || '';
      const label = uiLang === 'en' ? 'Rename document' : 'Đổi tên bài viết';
      showRenameDialog(current, label, newName => {
        if (!newName && newName !== '') return;
        titleInput.value = newName;
        d.titleCustom = newName !== topicInput.value.trim();
        d.title = newName;
        updateDocTitleDisplay();
        _debouncedTitleRender();
      });
    }

    function confirmDeleteFromMenu() {
      document.getElementById('titleDropdown').classList.remove('open');
      confirmDelete();
    }

    document.addEventListener('click', () => {
      document.querySelectorAll('.doc-dropdown.open').forEach(dd => dd.classList.remove('open'));
    });

    function focusTopic() {
      topicInput.focus();
      topicInput.select();
      document.querySelector('.editor-scroll').scrollTo({ top: 0, behavior: 'smooth' });
    }
    function mirrorSel(masterId, mirrorEl) {
      document.getElementById(masterId).value = mirrorEl.value;
      saveDocMeta();
    }
    function syncCtxBar() {
      const map = { m_audSel: 'audSel', m_toneSel: 'toneSel', m_lvlSel: 'lvlSel' };
      Object.entries(map).forEach(([mid, did]) => {
        const m = document.getElementById(mid);
        if (m) m.value = document.getElementById(did).value;
      });
    }

    function deleteDoc(id) {
      if (docs.length <= 1) { toast(t('toast-only-doc')); return; }
      docs = docs.filter(d => d.id !== id);
      saveDocs();
      if (currentId === id) openDoc(docs[0].id);
      else renderDocList();
    }
    function confirmDelete() {
      const d = getDoc(currentId);
      if (d && !d.html && !d.title) { deleteDoc(currentId); return; }
      if (confirm(t('confirm-delete'))) deleteDoc(currentId);
    }

    function renderDocList() {
      const el = document.getElementById('docList');
      el.innerHTML = '';

      const query = (document.getElementById('docSearchInput')?.value || '').trim().toLowerCase();
      const LAZY_INIT = 15, LAZY_MORE = 10;

      // apply sort
      let list = [...docs];
      if (docSortMode === 'old') {
        list.sort((a, b) => a.id - b.id);
      } else if (docSortMode === 'az') {
        list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      }

      // apply search filter
      if (query) {
        list = list.filter(d =>
          (d.title || '').toLowerCase().includes(query) ||
          (d.topic || '').toLowerCase().includes(query) ||
          (d.html ? d.html.replace(/<[^>]+>/g, '') : '').toLowerCase().includes(query)
        );
      }

      if (!list.length) {
        el.innerHTML = `<div class="doc-empty">${escHtml(t('doc-no-results'))}</div>`;
        return;
      }

      // decide whether to group:
      // group when: no active search, sort is 'new' or 'old', and total > 5
      const useGroups = !query && docSortMode !== 'az' && list.length > 5;

      const renderItem = (d) => {
        const rawText = d.html ? d.html.replace(/<[^>]+>/g, '').trim() : '';
        const wc = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
        const name = d.title || t('untitled');
        const isLinked = hasFSA && !!fileHandles[d.id];

        const div = document.createElement('div');
        div.className = 'doc-item' + (d.id === currentId ? ' active' : '');
        div.innerHTML =
          `<i class="bi bi-file-text doc-icon"></i>` +
          `<div class="doc-info">` +
          `<div class="doc-name">${escHtml(name)}</div>` +
          `<div class="doc-meta">` +
          `<span class="doc-date">${d.date || ''}</span>` +
          (wc > 0 ? `<span class="doc-wc">${t('doc-wc-words', { n: wc })}</span>` : '') +
          `</div>` +
          `</div>` +
          `<div class="doc-actions">` +
          `<button class="doc-btn doc-menu-btn" title="${uiLang === 'en' ? 'Options' : 'Tùy chọn'}"><i class="bi bi-three-dots"></i></button>` +
          `<div class="doc-dropdown">` +
          `<button class="title-dd-item doc-dd-rename"><i class="bi bi-pencil"></i> ${uiLang === 'en' ? 'Rename' : 'Đổi tên'}</button>` +
          (hasFSA ? `<button class="title-dd-item doc-dd-save"><i class="bi bi-floppy"></i> ${uiLang === 'en' ? 'Save to file' : 'Lưu ra file'}</button>` : '') +
          `<div class="title-dd-divider"></div>` +
          `<button class="title-dd-item title-dd-danger doc-dd-del"><i class="bi bi-trash3"></i> ${uiLang === 'en' ? 'Delete' : 'Xóa bài'}</button>` +
          `</div>` +
          `</div>`;

        // menu button
        div.querySelector('.doc-menu-btn').addEventListener('click', e => {
          e.stopPropagation();
          // close all other open dropdowns
          document.querySelectorAll('.doc-dropdown.open').forEach(dd => dd.classList.remove('open'));
          const dd = div.querySelector('.doc-dropdown');
          const rect = e.currentTarget.getBoundingClientRect();
          dd.style.top = (rect.bottom + 4) + 'px';
          // align right edge of dropdown to right edge of button, clamp to viewport
          const ddW = 160;
          const rightAligned = rect.right - ddW;
          dd.style.left = Math.max(4, rightAligned) + 'px';
          dd.classList.toggle('open');
        });
        div.querySelector('.doc-dd-rename').addEventListener('click', e => {
          e.stopPropagation();
          div.querySelector('.doc-dropdown').classList.remove('open');
          const current = d.title || d.topic || '';
          const label = uiLang === 'en' ? 'Rename document' : 'Đổi tên bài viết';
          showRenameDialog(current, label, newName => {
            if (newName === null) return;
            d.title = newName; d.titleCustom = true;
            if (d.id === currentId) { titleInput.value = d.title; updateDocTitleDisplay(); }
            saveDocs(); renderDocList();
          });
        });
        if (hasFSA && div.querySelector('.doc-dd-save')) {
          div.querySelector('.doc-dd-save').addEventListener('click', e => {
            e.stopPropagation();
            div.querySelector('.doc-dropdown').classList.remove('open');
            if (d.id !== currentId) openDoc(d.id);
            saveToFile();
          });
        }
        div.querySelector('.doc-dd-del').addEventListener('click', e => {
          e.stopPropagation();
          div.querySelector('.doc-dropdown').classList.remove('open');
          deleteDoc(d.id);
        });
        div.addEventListener('click', () => openDoc(d.id));
        return div;
      };

      const renderGroup = (groupKey, items) => {
        const isCollapsed = docCollapsedGroups.has(groupKey);
        const label = groupKey || t('doc-group-other');

        // group header
        const header = document.createElement('div');
        header.className = 'doc-group-header' + (isCollapsed ? ' collapsed' : '');
        header.innerHTML =
          `<i class="bi bi-folder2"></i>` +
          `<span>${escHtml(label)}</span>` +
          `<span class="doc-group-count">${items.length}</span>` +
          `<i class="bi bi-chevron-down chevron"></i>`;
        header.addEventListener('click', () => {
          if (docCollapsedGroups.has(groupKey)) docCollapsedGroups.delete(groupKey);
          else docCollapsedGroups.add(groupKey);
          renderDocList();
        });
        el.appendChild(header);

        if (isCollapsed) return;

        // group body with lazy render
        const body = document.createElement('div');
        body.className = 'doc-group-body';

        const shown = { count: Math.min(LAZY_INIT, items.length) };

        const renderSlice = (from, to) => {
          items.slice(from, to).forEach(d => body.appendChild(renderItem(d)));
        };

        renderSlice(0, shown.count);

        if (items.length > shown.count) {
          const addMore = () => {
            const btn = body.querySelector('.doc-load-more');
            if (btn) btn.remove();
            const next = Math.min(shown.count + LAZY_MORE, items.length);
            renderSlice(shown.count, next);
            shown.count = next;
            if (shown.count < items.length) attachLoadMore();
          };
          const attachLoadMore = () => {
            const btn = document.createElement('button');
            btn.className = 'doc-load-more';
            btn.textContent = t('doc-load-more', { n: Math.min(LAZY_MORE, items.length - shown.count) });
            btn.addEventListener('click', e => { e.stopPropagation(); addMore(); });
            body.appendChild(btn);
          };
          attachLoadMore();
        }

        el.appendChild(body);
      };

      // always render as flat list
      if (false) {
        // group by topic (normalize: trim + lowercase as key, display original)
        const groupMap = new Map(); // normalizedTopic -> {label, items[]}
        list.forEach(d => {
          const raw = (d.topic || '').trim();
          const key = raw.toLowerCase();
          if (!groupMap.has(key)) groupMap.set(key, { label: raw, items: [] });
          groupMap.get(key).items.push(d);
        });

        // sort groups: largest first, untitled last
        const sorted = [...groupMap.entries()].sort((a, b) => {
          if (!a[0]) return 1; if (!b[0]) return -1;
          return b[1].items.length - a[1].items.length;
        });

        sorted.forEach(([key, { label, items }]) => renderGroup(label, items));
      } else {
        // flat list with lazy render (no groups)
        const shown = { count: Math.min(LAZY_INIT, list.length) };
        list.slice(0, shown.count).forEach(d => el.appendChild(renderItem(d)));

        if (list.length > shown.count) {
          const addMore = () => {
            const btn = el.querySelector('.doc-load-more');
            if (btn) btn.remove();
            const next = Math.min(shown.count + LAZY_MORE, list.length);
            list.slice(shown.count, next).forEach(d => el.appendChild(renderItem(d)));
            shown.count = next;
            if (shown.count < list.length) attachLoadMore();
          };
          const attachLoadMore = () => {
            const btn = document.createElement('button');
            btn.className = 'doc-load-more';
            btn.textContent = t('doc-load-more', { n: Math.min(LAZY_MORE, list.length - shown.count) });
            btn.addEventListener('click', e => { e.stopPropagation(); addMore(); });
            el.appendChild(btn);
          };
          attachLoadMore();
        }
      }
    }
    function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    // ── DOC SEARCH & SORT ──
    let docSortMode = 'new'; // 'new' | 'old' | 'az'
    const docCollapsedGroups = new Set(); // set of collapsed group labels

    function onDocSearch() {
      renderDocList();
    }

    function cycleDocSort() {
      const modes = ['new', 'old', 'az'];
      docSortMode = modes[(modes.indexOf(docSortMode) + 1) % modes.length];
      updateDocSortUI();
      renderDocList();
    }

    function updateDocSortUI() {
      const btn = document.getElementById('docSortBtn');
      const icon = document.getElementById('docSortIcon');
      if (!btn || !icon) return;
      const icons = { new: 'bi-sort-down', old: 'bi-sort-up', az: 'bi-sort-alpha-down' };
      icon.className = 'bi ' + (icons[docSortMode] || 'bi-sort-down');
      btn.classList.toggle('active', docSortMode !== 'new');
      btn.title = t('doc-sort-' + docSortMode);
    }

    // ── SIDEBAR ──
    function toggleSidebar() {
      const sb = document.getElementById('sidebar');
      if (window.innerWidth <= 640) {
        const open = sb.classList.toggle('mobile-open');
        document.getElementById('sbBackdrop').classList.toggle('show', open);
      } else {
        const collapsing = !sb.classList.contains('collapsed');
        if (collapsing) {
          // save current width before collapsing, then clear inline so CSS width:0 works
          const w = sb.offsetWidth;
          if (w > 0) sb.dataset.savedW = w;
          sb.style.width = '';
          sb.classList.add('collapsed');
        } else {
          sb.classList.remove('collapsed');
          // restore saved width if any
          const saved = sb.dataset.savedW || localStorage.getItem('ui_sbw');
          if (saved) sb.style.width = saved + 'px';
        }
      }
    }
    function closeSidebarMobile() {
      document.getElementById('sidebar').classList.remove('mobile-open');
      document.getElementById('sbBackdrop').classList.remove('show');
    }

