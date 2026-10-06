    // ── EDITOR ──
    editor.addEventListener('input', () => {
      updateWC();
      clearTimeout(saveTimer);
      saveIcon.className = 'bi bi-arrow-repeat';
      saveIcon.style.color = '#f59e0b';
      saveStatus.textContent = t('saving');
      saveTimer = setTimeout(() => saveDoc(), 700);
      // hide AC when user types new content
      if (pendingAC) hideAC();
      acSeq++; // invalidate any in-flight AC request
    });

    editor.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    editor.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (pendingAC) {
          // accept existing suggestion
          const txt = editor.innerText.trimEnd();
          const endsWithPunct = /[.!?]$/.test(txt);
          const acAlreadyStartsSpace = /^\s/.test(pendingAC);
          const prefix = endsWithPunct && !acAlreadyStartsSpace ? ' ' : '';
          insertAt(prefix + pendingAC);
          hideAC();
          editor.dispatchEvent(new Event('input'));
        } else {
          // no suggestion yet — trigger immediately
          const txt = editor.innerText.trim();
          if (txt.length > 3) { acSeq++; doAC(txt); }
        }
      }
    });

    // save cursor whenever selection changes inside editor
    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    });

    // grammar tooltip (desktop hover)
    editor.addEventListener('mouseover', e => {
      if ('ontouchstart' in window) return; // skip on touch devices
      const sp = e.target.closest('.ge'); if (!sp) { tooltip.style.display = 'none'; return; }
      tooltip.textContent = (uiLang === 'en' ? '✔ Fix: ' : '✔ Sửa: ') + sp.getAttribute('data-fix');
      const r = sp.getBoundingClientRect();
      tooltip.style.left = Math.max(4, r.left) + 'px';
      tooltip.style.top = (r.top - 38) + 'px';
      tooltip.style.display = 'block';
    });
    editor.addEventListener('mouseout', () => { tooltip.style.display = 'none'; });

    // grammar bottom sheet (touch devices — tap to fix)
    editor.addEventListener('touchend', e => {
      const sp = e.target.closest('.ge');
      if (sp) { e.preventDefault(); openGeSheet(sp); }
    });

    function insertAt(text) {
      // restore saved range if editor lost focus (e.g. user clicked a panel card)
      let r;
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        r = sel.getRangeAt(0);
      } else if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
        r = savedRange.cloneRange();
        sel.removeAllRanges(); sel.addRange(r);
      } else {
        // fallback: append at end of editor
        editor.focus();
        r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(false);
        sel.removeAllRanges(); sel.addRange(r);
      }
      r.collapse(false);
      const n = document.createTextNode(text);
      r.insertNode(n); r.setStartAfter(n); r.setEndAfter(n);
      sel.removeAllRanges(); sel.addRange(r);
      savedRange = r.cloneRange();
      editor.focus();
    }
    function updateWC() {
      const txt = editor.innerText.trim();
      wcEl.textContent = (txt ? txt.split(/\s+/).length : 0) + ' ' + t('wc-unit');
    }
    function hideAC() {
      acChip.classList.remove('show');
      pendingAC = '';
      document.getElementById('acBar').classList.remove('show');
    }

    // accept autocomplete from mobile ac-bar
    function acceptACBar() {
      if (!pendingAC) return;
      const txt = editor.innerText.trimEnd();
      const endsWithPunct = /[.!?]$/.test(txt);
      const acAlreadyStartsSpace = /^\s/.test(pendingAC);
      const prefix = endsWithPunct && !acAlreadyStartsSpace ? ' ' : '';
      insertAt(prefix + pendingAC);
      hideAC();
      editor.dispatchEvent(new Event('input'));
    }

    // update ac-bar whenever pendingAC changes
    function syncACBar() {
      const bar = document.getElementById('acBar');
      const isMobile = window.innerWidth <= 640;
      if (isMobile && pendingAC) {
        document.getElementById('acBarText').textContent = pendingAC;
        bar.classList.add('show');
        document.body.classList.add('has-ac');
      } else {
        bar.classList.remove('show');
        document.body.classList.remove('has-ac');
      }
    }

    // ── CONTEXT ──
    function ctx() {
      return `WRITING CONTEXT:\n- Audience: ${audSel.value}\n- Tone: ${toneSel.value}\n- Level: ${lvlSel.value}`;
    }
    function topic() {
      return topicInput.value.trim();
    }

    // ── AUTOCOMPLETE ──
    async function doAC(txt) {
      const seq = acSeq;
      const btn = document.getElementById('acToggleBtn');
      if (btn) btn.classList.add('loading');
      const tp = topic();

      // Parse paragraphs
      const paras = txt.split(/\n+/).filter(p => p.trim());
      const totalParas = paras.length;
      const currentPara = paras[totalParas - 1] || '';
      const prevParas = paras.slice(0, -1);

      const currentParaWords = currentPara.trim().split(/\s+/).filter(Boolean).length;
      const endsWithPunct = /[.!?]$/.test(txt.trim());

      // Extract last sentence from current paragraph for tight context
      const sentences = currentPara.trim().match(/[^.!?]+[.!?]+/g) || [];
      const lastSentence = sentences[sentences.length - 1]?.trim() || currentPara.trim();
      const sentencesInPara = sentences.length;

      // Detect essay structure position
      const essayStage = totalParas === 1 ? 'introduction'
        : totalParas >= 2 && currentPara.trim().length < 30 ? 'new paragraph start'
          : 'body development';

      // Previous paragraphs: enough for AI to understand argument direction
      const prevSummary = prevParas.length
        ? `What has been written so far:\n${prevParas.map((p, i) => `- Para ${i + 1}: "${p.trim().slice(0, 200)}${p.trim().length > 200 ? '...' : ''}"`).join('\n')}`
        : '';

      // Determine what role the next sentence should play based on last sentence
      const sentenceRole = sentencesInPara === 0
        ? 'open this paragraph with a clear topic sentence'
        : sentencesInPara === 1
          ? 'support the topic sentence with a reason, detail, or example'
          : sentencesInPara >= 3
            ? 'either wrap up this paragraph\'s idea with a concluding thought, or write a short transition to signal the next idea'
            : 'continue developing the idea — add evidence, an example, or explain the reason further';

      const levelRules = `- For A1/A2: max 10 words, simple subject-verb-object structure only
- For B1/B2: 12–18 words, connectors like because/however/although are fine
- For C1/C2: varied sentence structures, precise vocabulary, complex ideas welcome`;

      const prompt = currentParaWords < 4 && essayStage !== 'new paragraph start'
        // Very short text — just get started
        ? `You are an English writing coach helping a user practise writing.
Topic: "${tp || 'general'}"
${ctx()}
The user has just started: "${currentPara.trim()}"
${prevSummary}
Task: Suggest ONE natural next sentence to help them continue.
${levelRules}
- Do NOT repeat ideas already covered above
- NO em dash (—), NO quotes, NO explanation — output the sentence only`

        : essayStage === 'new paragraph start'
          // User pressed Enter — starting a new paragraph
          ? `You are an English writing coach helping a user practise writing.
Topic: "${tp || 'general'}"
${ctx()}
${prevSummary}
The user is starting a NEW paragraph.
Task: Suggest ONE strong topic sentence that introduces a NEW idea not yet covered above.
${levelRules}
- The sentence must be clearly different from previous paragraphs
- NO em dash (—), NO quotes, NO explanation — output the sentence only`

          : !endsWithPunct
            // Mid-sentence — complete the current sentence
            ? `You are an English writing coach helping a user practise writing.
Topic: "${tp || 'general'}"
${ctx()}
Current paragraph so far: "${currentPara.trim()}"
The user stopped mid-sentence. The unfinished part: "...${currentPara.trim().split(/\s+/).slice(-10).join(' ')}"
Task: Complete this unfinished sentence naturally — add only the missing ending words.
- Match the sentence's meaning and vocabulary exactly
- Do NOT start a new sentence
- NO em dash (—), NO quotes, NO explanation — output only the completion words`

            // End of sentence — suggest what comes next based on role
            : `You are an English writing coach helping a user practise writing.
Topic: "${tp || 'general'}"
${ctx()}
${prevSummary ? prevSummary + '\n' : ''}Current paragraph (sentence ${sentencesInPara} of this paragraph):
"${currentPara.trim()}"

The last sentence was: "${lastSentence}"
Task: Write ONE next sentence. Its role: ${sentenceRole}.
${levelRules}
- Stay focused on THIS paragraph's idea — do not introduce an unrelated new topic
- Do NOT repeat or rephrase what was already said
- The sentence must feel like a natural continuation a real writer would write
- NO em dash (—), NO quotes, NO explanation — output the sentence only`;

      const r = await callAI(prompt, null, true);
      const btn2 = document.getElementById('acToggleBtn');
      if (btn2) btn2.classList.remove('loading');
      if (seq !== acSeq) return;
      if (r) {
        // take only the first line in case AI returns multiple lines
        const firstLine = r.trim().split(/\n/)[0].trim();
        if (firstLine.length > 0 && firstLine.length < 200 && !firstLine.includes('```')) {
          const clean = firstLine
            .replace(/^["']|["']$/g, '')
            .replace(/\s*—\s*/g, ', ');
          pendingAC = clean;
          acText.textContent = clean;
          acChip.classList.add('show');
          syncACBar();
        }
      }
    }


