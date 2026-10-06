    // ── TTS (Text-to-Speech) ──
    const tts = window.speechSynthesis;
    let ttsUtterance = null;
    // 'idle' | 'speaking' | 'paused'
    let ttsState = 'idle';
    // 'para' | 'all' | 'from' — which mode is active
    let ttsMode = null;
    // text and char offset for resume-from-pause
    let ttsFullText = '';
    let ttsResumeChar = 0;
    // Chrome keepalive interval (fixes ~15s cutoff bug)
    let ttsKeepAlive = null;

    const TTS_PREFERRED = [
      'Google US English', 'Google UK English Female', 'Google UK English Male',
      'Microsoft Zira - Desktop', 'Microsoft David - Desktop', 'Microsoft Mark - Desktop',
      'Microsoft Zira', 'Microsoft David', 'Microsoft Mark',
      'Karen', 'Daniel', 'Samantha', 'Alex',
    ];

    function ttsGetVoices() {
      return tts.getVoices().filter(v => v.lang.startsWith('en'));
    }

    function ttsPopulateVoices() {
      const sel = document.getElementById('ttsVoiceSel');
      if (!sel) return;
      const voices = ttsGetVoices();
      if (!voices.length) return;
      const saved = localStorage.getItem('tts_voice');
      sel.innerHTML = '';
      const sorted = [...voices].sort((a, b) => {
        const ai = TTS_PREFERRED.indexOf(a.name), bi = TTS_PREFERRED.indexOf(b.name);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
      sorted.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        if (v.name === saved) opt.selected = true;
        sel.appendChild(opt);
      });
      if (!saved || !sorted.find(v => v.name === saved)) {
        const best = TTS_PREFERRED.find(n => sorted.find(v => v.name === n));
        if (best) sel.value = best;
      }
    }

    function saveTTSVoice() {
      localStorage.setItem('tts_voice', document.getElementById('ttsVoiceSel').value);
    }

    function saveTTSRate(val) {
      localStorage.setItem('tts_rate', val);
      document.getElementById('ttsRateVal').textContent = val.toFixed(1) + 'x';
    }

    function ttsGetVoice() {
      const name = localStorage.getItem('tts_voice') || document.getElementById('ttsVoiceSel')?.value;
      const all = tts.getVoices();
      return all.find(v => v.name === name)
        || all.find(v => TTS_PREFERRED.includes(v.name))
        || all.find(v => v.lang.startsWith('en'))
        || all[0] || null;
    }

    function ttsGetRate() {
      return +(localStorage.getItem('tts_rate') || 0.9);
    }

    function ttsUpdateUI() {
      const btnMain = document.getElementById('btn-tts');
      const icoMain = document.getElementById('ico-tts-main');
      const lblMain = document.getElementById('lbl-tts-main');
      const icoPara = document.getElementById('ico-tts-para');
      const icoAll = document.getElementById('ico-tts-all');
      const lblPara = document.getElementById('lbl-tts-para');
      const lblAll = document.getElementById('lbl-tts-all');
      const stopBtn = document.getElementById('ttsStopBtn');
      const stopSep = document.getElementById('ttsStopSep');

      // Reset main button
      btnMain?.classList.remove('speaking', 'paused');
      if (icoMain) icoMain.className = 'bi bi-volume-up-fill';
      if (lblMain) lblMain.textContent = ' Đọc';
      // Reset dropdown item icons
      if (icoPara) icoPara.className = 'bi bi-text-paragraph';
      if (icoAll) icoAll.className = 'bi bi-file-text';
      if (lblPara) lblPara.textContent = 'Đọc đoạn này';
      if (lblAll) lblAll.textContent = 'Đọc toàn bài';
      if (stopBtn) stopBtn.style.display = 'none';
      if (stopSep) stopSep.style.display = 'none';

      if (ttsState === 'idle') return;

      // Show stop button when active
      if (stopBtn) stopBtn.style.display = '';
      if (stopSep) stopSep.style.display = '';

      const activeIco = ttsMode === 'all' ? icoAll : icoPara;
      const activeLbl = ttsMode === 'all' ? lblAll : lblPara;

      if (ttsState === 'speaking') {
        btnMain?.classList.add('speaking');
        if (icoMain) icoMain.className = 'bi bi-pause-fill';
        if (lblMain) lblMain.textContent = ' Tạm dừng';
        if (activeIco) activeIco.className = 'bi bi-pause-fill';
        if (activeLbl) activeLbl.textContent = ttsMode === 'all' ? 'Tạm dừng toàn bài' : 'Tạm dừng đoạn';
      } else if (ttsState === 'paused') {
        btnMain?.classList.add('paused');
        if (icoMain) icoMain.className = 'bi bi-play-fill';
        if (lblMain) lblMain.textContent = ' Tiếp tục';
        if (activeIco) activeIco.className = 'bi bi-play-fill';
        if (activeLbl) activeLbl.textContent = ttsMode === 'all' ? 'Tiếp tục toàn bài' : 'Tiếp tục đoạn';
      }
    }

    function toggleTTSMenu() {
      const menu = document.getElementById('ttsMenu');
      const btn = document.getElementById('btn-tts');
      if (!menu || !btn) return;
      // If speaking/paused, clicking main button toggles pause/resume directly
      if (ttsState === 'speaking') {
        tts.cancel(); ttsState = 'paused'; ttsStopKeepAlive(); ttsUpdateUI();
        menu.classList.remove('open');
        return;
      }
      if (ttsState === 'paused') {
        // resume from current chunk
        setTimeout(() => ttsPlayChunk(), 80);
        ttsState = 'speaking'; ttsUpdateUI();
        menu.classList.remove('open');
        return;
      }
      const isOpen = menu.classList.contains('open');
      if (isOpen) { menu.classList.remove('open'); return; }
      // Position above the button, fixed so overflow:hidden parents don't clip it
      const r = btn.getBoundingClientRect();
      menu.style.display = 'block'; // measure height
      const mh = menu.offsetHeight || 120;
      menu.style.display = '';
      let top = r.top - mh - 6;
      let left = r.left;
      if (top < 8) top = r.bottom + 6; // flip below if not enough space above
      if (left + 190 > window.innerWidth - 8) left = r.right - 190;
      menu.style.top = top + 'px';
      menu.style.left = left + 'px';
      menu.classList.add('open');
      setTimeout(() => document.addEventListener('pointerdown', closeTTSOnOutside, { once: true }), 10);
    }

    function closeTTSOnOutside(e) {
      const wrap = document.getElementById('ttsWrap');
      const menu = document.getElementById('ttsMenu');
      if (!menu) return;
      if (wrap?.contains(e.target)) {
        // click inside wrap — re-arm listener so menu can still be closed
        setTimeout(() => document.addEventListener('pointerdown', closeTTSOnOutside, { once: true }), 10);
      } else {
        menu.classList.remove('open');
      }
    }

    function ttsStartKeepAlive() {
      // Chrome stops speechSynthesis after ~15s — pause/resume every 14s to reset timer
      ttsStopKeepAlive();
      ttsKeepAlive = setInterval(() => {
        if (tts.speaking && !tts.paused) { tts.pause(); tts.resume(); }
      }, 14000);
    }

    function ttsStopKeepAlive() {
      if (ttsKeepAlive) { clearInterval(ttsKeepAlive); ttsKeepAlive = null; }
    }

    // split text into sentence-boundary chunks for Android Chrome TTS bug
    function ttsSplitChunks(text, maxLen = 200) {
      const chunks = [];
      let remaining = text.trim();
      while (remaining.length > 0) {
        if (remaining.length <= maxLen) { chunks.push(remaining); break; }
        // find last sentence boundary within maxLen
        const slice = remaining.slice(0, maxLen);
        const cut = Math.max(
          slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '),
          slice.lastIndexOf('.\n'), slice.lastIndexOf('!\n'), slice.lastIndexOf('?\n')
        );
        const pos = cut > 20 ? cut + 1 : maxLen;
        chunks.push(remaining.slice(0, pos).trim());
        remaining = remaining.slice(pos).trim();
      }
      return chunks.filter(c => c.length > 0);
    }

    let ttsChunks = [], ttsChunkIdx = 0;

    function ttsSpeak(text, fromChar) {
      if (!tts) return toast(uiLang === 'en' ? 'TTS not supported' : 'Trình duyệt không hỗ trợ đọc âm thanh', 'd');
      if (!text.trim()) return;
      if (!text.trim()) return;
      ttsFullText = text;
      ttsResumeChar = fromChar || 0;
      tts.cancel();
      const startText = text.slice(ttsResumeChar);
      ttsChunks = ttsSplitChunks(startText);
      ttsChunkIdx = 0;
      setTimeout(() => ttsPlayChunk(), 80);
    }

    function ttsPlayChunk() {
      if (ttsChunkIdx >= ttsChunks.length) { ttsSetIdle(); return; }
      const chunk = ttsChunks[ttsChunkIdx];
      ttsUtterance = new SpeechSynthesisUtterance(chunk);
      const voice = ttsGetVoice();
      if (voice) ttsUtterance.voice = voice;
      ttsUtterance.rate = ttsGetRate();
      ttsUtterance.lang = 'en-US';
      ttsUtterance.onstart = () => {
        ttsState = 'speaking';
        ttsUpdateUI();
        ttsStartKeepAlive();
      };
      ttsUtterance.onend = () => {
        ttsChunkIdx++;
        if (ttsChunkIdx < ttsChunks.length) {
          setTimeout(() => ttsPlayChunk(), 50);
        } else {
          ttsSetIdle();
        }
      };
      ttsUtterance.onerror = e => {
        if (e.error !== 'interrupted') ttsSetIdle();
      };
      tts.speak(ttsUtterance);
    }

    function ttsSetIdle() {
      ttsState = 'idle';
      ttsMode = null;
      ttsFullText = '';
      ttsResumeChar = 0;
      ttsStopKeepAlive();
      ttsUpdateUI();
    }

    function ttsGetCurrentPara() {
      const sel = window.getSelection();

      // If user has text selected, read just that selection
      if (sel && sel.toString().trim() && editor.contains(sel.anchorNode)) {
        return sel.toString().trim();
      }

      // Find block element at cursor (skip #editor itself)
      if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
        let node = sel.getRangeAt(0).startContainer;
        if (node.nodeType === 3) node = node.parentNode; // text node → element
        while (node && node !== editor) {
          if (node.nodeType === 1 && (node.tagName === 'P' || node.tagName === 'DIV' || node.tagName === 'LI')) {
            const t = node.innerText.trim();
            if (t) return t;
          }
          node = node.parentNode;
        }
        // Cursor directly in editor with no block wrapper — get line at cursor
        const full = editor.innerText;
        const lines = full.split('\n').filter(l => l.trim());
        if (lines.length === 1) return lines[0];
        // Find which line by offset
        const range = sel.getRangeAt(0);
        const pre = document.createRange();
        pre.setStart(editor, 0);
        try { pre.setEnd(range.startContainer, range.startOffset); } catch { return lines[0] || ''; }
        const beforeText = pre.toString();
        let offset = 0;
        for (const line of full.split('\n')) {
          if (beforeText.length <= offset + line.length) return line.trim() || lines[0] || '';
          offset += line.length + 1;
        }
        return lines[0] || '';
      }

      // No cursor in editor — return first non-empty paragraph
      return editor.innerText.split(/\n+/).find(p => p.trim()) || '';
    }

    function ttsTogglePara() {
      if (ttsState === 'speaking' && ttsMode === 'para') {
        tts.cancel(); ttsState = 'paused'; ttsStopKeepAlive(); ttsUpdateUI(); return;
      }
      if (ttsState === 'paused' && ttsMode === 'para') {
        setTimeout(() => ttsPlayChunk(), 80);
        ttsState = 'speaking'; ttsUpdateUI(); return;
      }
      // Stop any other mode and start para
      tts.cancel();
      ttsMode = 'para';
      const para = ttsGetCurrentPara();
      if (!para) return toast(uiLang === 'en' ? 'No text to read.' : 'Không có chữ để đọc.');
      ttsSpeak(para, 0);
    }

    function ttsToggleAll() {
      if (ttsState === 'speaking' && ttsMode === 'all') {
        tts.cancel(); ttsState = 'paused'; ttsStopKeepAlive(); ttsUpdateUI(); return;
      }
      if (ttsState === 'paused' && ttsMode === 'all') {
        setTimeout(() => ttsPlayChunk(), 80);
        ttsState = 'speaking'; ttsUpdateUI(); return;
      }
      tts.cancel();
      ttsMode = 'all';
      const text = editor.innerText.trim();
      if (!text) return toast(uiLang === 'en' ? 'No text to read.' : 'Không có chữ để đọc.');
      ttsSpeak(text, 0);
    }

    function ttsReadFrom(text) {
      tts.cancel();
      ttsMode = 'from';
      ttsSpeak(text, 0);
    }

    function ttsStop() {
      tts.cancel();
      ttsSetIdle();
    }

    // Context menu TTS helpers
    function ctxTTSPara() {
      closeCtxMenu();
      const sel = window.getSelection()?.toString().trim();
      // nếu từ panel: đọc selection hoặc đoạn chứa cursor trong panel
      if (ctxFromPanel) {
        const pContent = document.getElementById('pContent');
        const text = sel || pContent?.innerText?.trim();
        if (!text) return toast(uiLang === 'en' ? 'No text to read.' : 'Không có chữ để đọc.');
        ttsMode = 'para';
        ttsSpeak(text, 0);
        return;
      }
      const para = ttsGetCurrentPara();
      if (!para) return toast(uiLang === 'en' ? 'No text to read.' : 'Không có chữ để đọc.');
      ttsMode = 'para';
      ttsSpeak(para, 0);
    }

    function ctxTTSFrom() {
      closeCtxMenu();
      // nếu từ panel: đọc từ selection đến hết panel
      if (ctxFromPanel) {
        const pContent = document.getElementById('pContent');
        const selObj = window.getSelection();
        let fromText = '';
        if (selObj && selObj.rangeCount && pContent?.contains(selObj.anchorNode)) {
          const range = selObj.getRangeAt(0).cloneRange();
          range.setEnd(pContent, pContent.childNodes.length);
          fromText = range.toString().trim();
        }
        if (!fromText) fromText = pContent?.innerText?.trim();
        if (!fromText) return toast(uiLang === 'en' ? 'No text to read.' : 'Không có chữ để đọc.');
        ttsMode = 'from';
        ttsSpeak(fromText, 0);
        return;
      }
      // Read from cursor position to end
      const sel = window.getSelection();
      let fromText = '';
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0).cloneRange();
        range.setEnd(editor, editor.childNodes.length);
        fromText = range.toString().trim();
      }
      if (!fromText) fromText = editor.innerText.trim();
      if (!fromText) return toast(uiLang === 'en' ? 'No text to read.' : 'Không có chữ để đọc.');
      ttsMode = 'from';
      ttsSpeak(fromText, 0);
    }

    // Populate voices — voices may load async
    if (tts) {
      ttsPopulateVoices();
      tts.onvoiceschanged = ttsPopulateVoices;
      const savedRate = +(localStorage.getItem('tts_rate') || 0.9);
      const rateRange = document.getElementById('ttsRateRange');
      if (rateRange) { rateRange.value = savedRate; document.getElementById('ttsRateVal').textContent = savedRate.toFixed(1) + 'x'; }
    }

