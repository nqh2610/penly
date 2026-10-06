    // 3. HÀM THỰC THI CHÍNH (THAY THẾ callOutline CŨ)
    async function callOutline() {
      const tp = topic(); if (!tp) return toast(t('no-topic'));
      setPanelTitle('panel-outline');
      const { lvl, tone, aud } = outlineKeys();
      const L = OUTLINE_LEVELS[lvl];
      const lang = uiLang === 'en' ? 'English' : 'Vietnamese';
      const vi = uiLang !== 'en';

      const d = getDoc(currentId);
      const normTp = tp.toLowerCase().trim().replace(/\s+/g, ' ');
      const cacheKey = `v13|${normTp}|${lvl}|${tone}|${aud}|${lang}`;
      if (d && d.outline && d.outlineKey === cacheKey && String(d.outline).startsWith(OL_PREFIX)) {
        showOutline(d.outline); return;
      }

      const run = ++_olRun;
      const c = { tp, lvl, tone, aud, L, lang };

      showOutlineState({
        lvl, vi, c, d, cacheKey,
        data: {
          kind: vi ? 'Đang tạo dàn ý...' : 'Creating outline...',
          opening: vi ? 'AI đang thiết kế dàn ý siêu tốc...' : 'Generating outline...',
          checklist: [], parts: Array.from({ length: OUTLINE_PLAN[lvl].parts.length }, () => ({ status: 'pending' }))
        }
      });

      setBusy('btn-outline', true, false);
      const raw = await callAI(buildUnifiedOutlinePrompt(c), 'btn-outline', false, false, 1400);
      setBusy('btn-outline', false, false);

      if (run !== _olRun) return;
      if (!raw) return showOutlineError(vi);

      const state = { lvl, vi, data: parseUnifiedOutline(raw, c), c, d, cacheKey };
      showOutlineState(state);
      olFinalize(state);
    }

    async function callGrammar() {
      const text = editor.innerText.trim();
      if (!text) return toast(t('no-text'));
      const r = await callAI(
        `You are a professional English proofreader. Check the user's text carefully based on their level.

user text:
"""
${text}
"""
${ctx()}
Interface language: ${uiLang === 'en' ? 'English' : 'Vietnamese'}

LANGUAGE RULE: Write ALL explanations, labels, and feedback in ${uiLang === 'en' ? 'English' : 'Vietnamese'}.

IMPORTANT — adjust expectations to the user's level:
- A1/A2: only mark clear errors (wrong verb form, wrong pronoun, obvious misspelling). Do NOT penalize simple sentence structure or basic vocabulary — that is appropriate for their level.
- B1/B2: mark grammar, collocation, punctuation and word-choice errors.
- C1/C2: mark all errors including subtle word choice, register, and style inconsistencies.

Check these error types:
1. GRAMMAR: verb tense, subject-verb agreement, articles (a/an/the), prepositions, word form
2. SPELLING: misspelled words, wrong homophones (their/there, your/you're, its/it's)
3. VOCABULARY: clearly wrong word choice or unnatural collocation for their level
4. PUNCTUATION: missing period at sentence end, missing apostrophe in contractions
5. CAPITALIZATION: sentence start, proper nouns, pronoun "I"

RULES:
- Wrap EACH error exactly as: <span class="ge" data-fix="CORRECT_TEXT" onclick="applyFix(this)">WRONG_TEXT</span>
- data-fix = the corrected text only (no explanation)
- For a missing punctuation: wrap the word before it, data-fix = word + punctuation
- Do NOT mark correct informal English, valid style choices, or intentional repetition
- Only mark when you are confident it is an error
- Zero errors → return the text exactly as-is
- Return ONLY the corrected HTML string. No explanation, no markdown, no code blocks.`,
        'btn-grammar', false, true
      );
      if (!r) return;
      const clean = strip(r);
      editor.innerHTML = clean;
      const n = (clean.match(/<span class="ge"/g) || []).length;
      toast(n > 0 ? t('grammar-found', { n }) : t('grammar-clean'), n > 0 ? '' : 's');
    }

    window.applyFix = el => {
      tooltip.style.display = 'none';
      el.parentNode.replaceChild(document.createTextNode(el.getAttribute('data-fix')), el);
      editor.dispatchEvent(new Event('input')); toast(t('toast-fixed'), 's');
    };

    async function callSuggest() {
      const text = editor.innerText.trim();
      if (!text) return toast(t('no-text-short'));
      setPanelTitle('panel-suggest');

      const paras = text.split(/\n+/).filter(p => p.trim());
      const totalParas = paras.length;
      const currentPara = paras[totalParas - 1] || '';
      const prevParas = paras.slice(0, -1);

      const sentences = currentPara.trim().match(/[^.!?]+[.!?]+/g) || [];
      const sentencesInPara = sentences.length;
      const lastSentence = sentences[sentences.length - 1]?.trim() || currentPara.trim();

      const prevSummary = prevParas.length
        ? `What has been written so far:\n${prevParas.map((p, i) => `- Para ${i + 1}: "${p.trim().slice(0, 200)}${p.trim().length > 200 ? '...' : ''}"`).join('\n')}`
        : '';

      // Determine essay stage
      const isIntro = totalParas === 1;
      const isNewPara = currentPara.trim().length < 20;
      const isParaLong = sentencesInPara >= 3;

      // Dynamic 3 angles based on context
      const angles = isIntro && sentencesInPara <= 1
        ? [
          'hook the reader with a surprising fact, question, or relatable situation about this topic',
          'state the writer\'s main opinion or stance on this topic clearly',
          'mention 2–3 aspects the essay will cover (a brief signpost sentence)',
        ]
        : isNewPara
          ? [
            'open with a clear topic sentence that introduces a NEW idea not covered in previous paragraphs',
            'open with a contrasting idea that challenges something from the previous paragraph',
            'open with a question or observation that leads into a new angle on the topic',
          ]
          : isParaLong
            ? [
              'wrap up this paragraph with a sentence that ties the ideas together',
              'write a transition sentence that signals a new idea is coming next',
              `push the last point further — the last sentence said: "${lastSentence}" — add a specific consequence or real-world example`,
            ]
            : [
              `support the last sentence ("${lastSentence}") with a specific fact, statistic, or example`,
              `explain WHY the last point matters — give a reason or consequence`,
              `add a personal feeling, experience, or opinion that connects to the last sentence`,
            ];

      const levelRules = `STRICTLY match the user's level:
- A1/A2: max 8–10 words, basic vocabulary, "and/but/so" connectors only
- B1/B2: 12–18 words, varied vocab, "because/when/although/however" are fine
- C1/C2: 15–25 words, rich vocabulary, complex structures welcome`;

      const r = await callAI(
        `You are an English writing coach helping a user write a well-structured essay.

Topic: "${topic() || 'not specified'}"
${ctx()}
Interface language: ${uiLang === 'en' ? 'English' : 'Vietnamese'}

LANGUAGE RULE: Write the "vi" field in natural Vietnamese. Write all other text in ${uiLang === 'en' ? 'English' : 'Vietnamese'}.

${prevSummary ? prevSummary + '\n' : ''}Current paragraph (${sentencesInPara} sentence${sentencesInPara !== 1 ? 's' : ''} so far):
"${currentPara.trim()}"

Generate exactly 3 next sentences, each with a DIFFERENT purpose:
- Sentence 1: ${angles[0]}
- Sentence 2: ${angles[1]}
- Sentence 3: ${angles[2]}

Rules for ALL sentences:
1. Do NOT repeat or restate anything already written above
2. ${levelRules}
3. Sound natural — NOT textbook-formal
4. NO em dash (—). Use comma or "and/but" instead.
5. Vietnamese translation: natural spoken Vietnamese with appropriate pronouns

Return ONLY a valid JSON array, no other text:
[
  {"en": "Sentence 1.", "vi": "Bản dịch tự nhiên."},
  {"en": "Sentence 2.", "vi": "Bản dịch tự nhiên."},
  {"en": "Sentence 3.", "vi": "Bản dịch tự nhiên."}
]`,
        'btn-suggest'
      );
      if (!r) return;
      try {
        const arr = JSON.parse(strip(r));
        openPanel(t('panel-suggest'), '', arr);
      } catch {
        openPanel(t('panel-suggest'), r, null);
      }
    }

    async function callImprove() {
      const text = editor.innerText.trim();
      if (!text) return toast(t('no-text'));

      // lưu bản gốc lần đầu; reset nếu user đã sửa đáng kể so với bản gốc
      if (!improveOriginalText) {
        improveOriginalText = text;
      } else {
        // nếu text hiện tại khác bản gốc > 40% → user đã viết lại, reset
        const sim = text.length > 0 ? Math.min(improveOriginalText.length, text.length) / Math.max(improveOriginalText.length, text.length) : 0;
        if (sim < 0.6) improveOriginalText = text;
      }

      const isFirstImprove = improveOriginalText === text;
      const baseText = improveOriginalText;

      setPanelTitle('panel-improve');
      const r = await callAI(
        `You are an expert English language editor and experienced ESL writing coach. Your task is to IMPROVE the user's writing — not rewrite it, not simplify it, not replace their ideas.

user's ORIGINAL text (baseline — never improve beyond this):
"""
${baseText}
"""
${baseText !== text ? `\nuser's CURRENT text (already improved once — use this as the starting point, but compare against the original above to avoid over-editing):
"""
${text}
"""` : ''}
${ctx()}
Interface language: ${uiLang === 'en' ? 'English' : 'Vietnamese'}

LANGUAGE RULE: Write ALL section headings, explanations, tips, and change descriptions in ${uiLang === 'en' ? 'English' : 'Vietnamese'}.

## YOUR TASK: Style Upgrade

You must EDIT the user's text to make it sound more natural and fluent. Follow these strict rules:

**WHAT YOU MUST KEEP (never change these):**
- Every idea, fact, event, and detail the user wrote — do NOT add new content, do NOT remove content
- The narrator's voice and perspective (I/we/he/she)
- The emotional tone the user intended
- The proficiency level context: ${ctx()}

**WHAT YOU SHOULD IMPROVE (based on level):**
- A1/A2: Fix unnatural phrasing → more natural simple expressions; add ONE basic connector (e.g. "and", "so", "because") where missing; correct word order issues
- B1/B2: Replace repetitive/weak words with more precise vocabulary; combine short choppy sentences into smoother ones; add transitional phrases ("In addition", "However", "As a result")
- C1/C2: Elevate to sophisticated vocabulary; vary sentence structures; add discourse markers; improve cohesion and coherence

**ABSOLUTE RULES:**
- NEVER invent new content (new people, new events, new emotions not in the original)
- NEVER use em dash (—). Use comma or "and/but/so" instead
- NEVER downgrade: if user wrote "I want to tell you about", keep the meaning — don't simplify to "I will talk about"
- NEVER change the word count by more than 30% compared to the ORIGINAL text
- If the text has already been improved once, focus on a DIFFERENT aspect (e.g. if vocabulary was improved before, now improve sentence flow or connectors) — do NOT pile more synonyms onto already-upgraded words
- Bold (**word**) ONLY the words/phrases you changed from the current version

%%IMPROVED_START%%
(Write ONLY the improved version here. Bold every changed word/phrase. No headings, no markdown except bold.)
%%IMPROVED_END%%

## ✏️ ${uiLang === 'en' ? 'Changes made' : 'Thay đổi'}

*(${uiLang === 'en' ? 'List only actual changes. Format: original → improved — short reason, 1 sentence' : 'Liệt kê thay đổi. Format: gốc → cải thiện — lý do ngắn, 1 câu'})*

## 💡 ${uiLang === 'en' ? 'Practice tips' : 'Mẹo luyện tập'}

*(${uiLang === 'en' ? '1–2 practical tips related to this text' : '1–2 mẹo thực dụng, gắn với bài này'})*`,
        'btn-improve'
      );
      if (!r) return;

      // extract improved text — try marker first, fallback to first paragraph block
      let improvedText = null;
      const markerMatch = r.match(/%%IMPROVED_START%%\s*([\s\S]*?)\s*%%IMPROVED_END%%/);
      if (markerMatch) {
        improvedText = markerMatch[1].trim();
      } else {
        // fallback: grab text between the "✨" heading and the next "##" section
        const fallback = r.match(/##\s*✨[^\n]*\n(?:\*[^\n]*\*\n)?\n?([\s\S]*?)(?:\n##|\n\|)/);
        if (fallback) improvedText = fallback[1].trim();
        // last resort: first non-empty paragraph that isn't a heading or table
        if (!improvedText) {
          const paras = r.split(/\n{2,}/);
          const plain = paras.find(p => p.trim() && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('*'));
          if (plain) improvedText = plain.trim();
        }
      }

      // strip markers from displayed markdown
      const displayMd = r.replace(/%%IMPROVED_START%%[\s\S]*?%%IMPROVED_END%%/,
        improvedText ? improvedText : '');

      openPanel(t('panel-improve'), displayMd, null);

      // inject "use this version" button at top of panel body
      if (improvedText) {
        const pContent = document.getElementById('pContent');

        // friendly inline confirm bar — no browser dialog
        const confirmBar = document.createElement('div');
        confirmBar.className = 'improve-confirm-bar';
        confirmBar.innerHTML =
          `<span class="improve-confirm-msg">` +
          `<i class="bi bi-stars"></i> ` +
          (uiLang === 'en'
            ? 'Apply this version to your document?'
            : 'Áp dụng bản nâng cấp vào bài viết?') +
          `</span>` +
          `<div class="improve-confirm-btns">` +
          `<button class="improve-yes"><i class="bi bi-check-lg"></i> ${uiLang === 'en' ? 'Yes, apply' : 'Áp dụng'}</button>` +
          `<button class="improve-no">${uiLang === 'en' ? 'Keep original' : 'Giữ bản gốc'}</button>` +
          `</div>`;

        const btn = document.createElement('button');
        btn.className = 'btn-use-improved';
        btn.innerHTML = `<i class="bi bi-arrow-left-circle-fill"></i> ${uiLang === 'en' ? 'Use this version' : 'Dùng bản này'}`;

        btn.onclick = () => {
          // toggle confirm bar
          const showing = confirmBar.classList.toggle('show');
          btn.style.display = showing ? 'none' : '';
        };

        confirmBar.querySelector('.improve-yes').onclick = () => {
          const plain = improvedText.replace(/\*\*(.*?)\*\*/g, '$1');
          editor.innerText = plain;
          editor.dispatchEvent(new Event('input'));
          confirmBar.classList.remove('show');
          btn.style.display = '';
          closePanel();
          toast(uiLang === 'en' ? '✨ Applied! Keep writing.' : '✨ Đã áp dụng! Tiếp tục viết nhé.', 's');
        };

        confirmBar.querySelector('.improve-no').onclick = () => {
          confirmBar.classList.remove('show');
          btn.style.display = '';
        };

        pContent.insertBefore(confirmBar, pContent.firstChild);
        pContent.insertBefore(btn, pContent.firstChild);
      }
    }

    async function callReview() {
      const text = editor.innerText.trim();
      if (!text) return toast(t('no-text-review'));
      setPanelTitle('panel-review');
      const tp = topic();
      const wc = text.trim().split(/\s+/).filter(Boolean).length;
      const vi = uiLang !== 'en';

      let reviewPrompt;

      if (wc < 60) {
        // short text — lightweight feedback proportional to length
        reviewPrompt = `You are an expert ESL writing reviewer. The user wrote a short piece (${wc} word${wc === 1 ? '' : 's'}).

Topic: "${tp || 'not specified'}"
Text:
"""
${text}
"""
${ctx()}
Interface language: ${vi ? 'Vietnamese' : 'English'}

LANGUAGE RULE: Write ALL feedback in ${vi ? 'Vietnamese' : 'English'}.

Give brief, honest feedback proportional to the text length. Use 2 short sections only:

## ${vi ? '✅ Điểm tốt' : '✅ What works'}
*(${vi ? '1–2 điểm cụ thể, trích dẫn từ/cụm từ trong bài' : '1–2 specific points, quote words or phrases from the text'})*

## ${vi ? '⚠️ Cần cải thiện' : '⚠️ What to improve'}
*(${vi ? '1–2 điểm quan trọng nhất, có ví dụ cụ thể hoặc gợi ý viết lại' : '1–2 key issues with concrete suggestions or rewrites'})*

Keep response short — do not pad or invent issues that aren't there.`;
      } else {
        // full review for substantial text
        reviewPrompt = `You are an expert English writing reviewer. Give honest and helpful feedback on the user's writing.

Topic: "${tp || 'not specified'}"
Text:
"""
${text}
"""
${ctx()}
Interface language: ${vi ? 'Vietnamese' : 'English'}

LANGUAGE RULE: Write ALL feedback, section headings, explanations, and suggestions in ${vi ? 'Vietnamese' : 'English'}. Adjust tone to match the Audience context above.

## ✅ ${vi ? 'Điểm làm tốt' : 'Strengths'}
*(${vi ? '2–3 điểm — trích dẫn câu hoặc từ cụ thể → giải thích tại sao tốt, không khen chung chung' : '2–3 points — quote specific sentences or words → explain why they work well'})*

## ⚠️ ${vi ? 'Điểm cần cải thiện' : 'Areas to improve'}
*(${vi ? '2–3 điểm quan trọng nhất — trích dẫn câu gốc → viết lại hay hơn → giải thích ngắn gọn' : '2–3 key issues — quote original → rewrite better → short explanation'})*

## 🎯 ${vi ? 'Nội dung và mạch văn' : 'Content & flow'}
*(${vi ? 'Bài có đủ ý không? Các câu có liên kết tự nhiên không? Có phù hợp với độc giả không? — 2–3 câu nhận xét thẳng thắn' : 'Does the essay cover the topic fully? Do sentences connect naturally? Is it appropriate for the audience? — 2–3 sentences'})*

## 💡 ${vi ? 'Hai việc cụ thể nên làm ngay' : 'Two actions to take now'}
*(${vi ? 'Mỗi việc 1 câu rõ ràng — ví dụ: "Thêm 1 câu mô tả cảm xúc khi..." hoặc "Thay từ X bằng từ Y vì..."' : '1 sentence each — specific and actionable'})*`;
      }

      const r = await callAI(reviewPrompt, 'btn-review');
      if (r) openPanel(t('panel-review'), r, null);
    }

    async function callVocab() {
      const tp = topic(); const text = editor.innerText.trim();
      if (!tp && !text) return toast(t('no-text-vocab'));
      setPanelTitle('panel-vocab');

      // Cache check — reuse if same topic/level/lang
      const d = getDoc(currentId);
      const vocabKey = `${tp}|${lvlSel.value}|${uiLang}`;
      if (d && d.vocab && d.vocabKey === vocabKey) {
        openPanel(t('panel-vocab'), d.vocab, null);
        return;
      }

      const r = await callAI(
        `You are an ESL vocabulary teacher. Give a focused, practical vocabulary guide for this user.

${tp ? `Topic: "${tp}"` : ''}
${text ? `user's text so far:\n"""\n${text.substring(0, 400)}\n"""` : ''}
Level: ${lvlSel.value}

Interface language: ${uiLang === 'en' ? 'English' : 'Vietnamese'}

Rules:
- Silently match ALL examples to the level above — never mention the level in the output
- NO em dash (—). Use comma or and/but/so instead
- Keep it practical: words the user can use TODAY in their writing
- Show words IN ACTION, not just definitions
- LANGUAGE RULE: Write ALL section headings, labels, explanations, and translations in ${uiLang === 'en' ? 'English' : 'Vietnamese'}
- For Phrasal Verbs, Idioms, and Fixed Expressions: ONLY include if they are genuinely relevant to the topic. If there are none, SKIP that section entirely — do not force examples.

---

## 🔑 ${uiLang === 'en' ? 'Key vocabulary' : 'Từ vựng cần biết'}

*(${uiLang === 'en' ? '10–12 words/phrases — practical, level-appropriate, topic-relevant' : '10–12 từ/cụm từ — thực dụng, phù hợp trình độ, gắn chủ đề'})*

**word / phrase** *(part of speech)* — ${uiLang === 'en' ? 'meaning in English' : 'nghĩa tiếng Việt'}
> *Example sentence using this word, related to "${tp || 'the topic'}".*

*(repeat for each word)*

---

## 🔗 ${uiLang === 'en' ? 'Useful connectors' : 'Từ nối hay dùng'}

*(${uiLang === 'en' ? 'List 4–6 level-appropriate connectors with short examples' : 'Chỉ liệt kê 4–6 từ nối phù hợp trình độ, kèm ví dụ ngắn'})*

- **and** — ${uiLang === 'en' ? 'add an idea' : 'thêm ý'}: *My dad is tall and strong.*
- *(${uiLang === 'en' ? 'continue with level-appropriate connectors' : 'tiếp tục với các từ nối phù hợp trình độ'})*

---

## 🔄 ${uiLang === 'en' ? 'Phrasal verbs' : 'Cụm động từ'} *(${uiLang === 'en' ? 'skip if none fit the topic' : 'bỏ qua nếu không liên quan'})*

*(${uiLang === 'en' ? '3–5 phrasal verbs naturally connected to the topic' : '3–5 cụm động từ tự nhiên gắn với chủ đề'})*

**phrasal verb** — ${uiLang === 'en' ? 'meaning' : 'nghĩa'}
> *Example sentence using it in context.*

*(repeat for each)*

---

## 💬 ${uiLang === 'en' ? 'Idioms & proverbs' : 'Thành ngữ & tục ngữ'} *(${uiLang === 'en' ? 'skip if none fit the topic' : 'bỏ qua nếu không liên quan'})*

*(${uiLang === 'en' ? '2–3 idioms or proverbs that connect naturally to the topic — explain meaning, not just translate literally' : '2–3 thành ngữ hoặc tục ngữ gắn tự nhiên với chủ đề — giải thích ý nghĩa, không dịch từng chữ'})*

**idiom / proverb** — ${uiLang === 'en' ? 'what it really means' : 'ý nghĩa thực sự'}
> *Example sentence showing how to use it naturally.*

*(repeat for each)*

---

## 📌 ${uiLang === 'en' ? 'Fixed expressions & useful phrases' : 'Cụm từ cố định & diễn đạt hay'} *(${uiLang === 'en' ? 'skip if none fit the topic' : 'bỏ qua nếu không liên quan'})*

*(${uiLang === 'en' ? '3–5 fixed expressions, collocations, or set phrases common in this topic area' : '3–5 cụm từ cố định, kết hợp từ thông dụng, hoặc mẫu diễn đạt hay trong chủ đề này'})*

**expression** — ${uiLang === 'en' ? 'meaning / when to use' : 'nghĩa / khi nào dùng'}
> *Example sentence in context.*

*(repeat for each)*

---

## ✍️ ${uiLang === 'en' ? '3 sample sentences to use now' : '3 câu mẫu có thể dùng ngay'}

> *Sentence 1 — ${uiLang === 'en' ? 'level-appropriate, on-topic' : 'đúng trình độ, đúng chủ đề'}*
> *Sentence 2 — ${uiLang === 'en' ? 'level-appropriate, on-topic' : 'đúng trình độ, đúng chủ đề'}*
> *Sentence 3 — ${uiLang === 'en' ? 'level-appropriate, on-topic' : 'đúng trình độ, đúng chủ đề'}*`,
        'btn-vocab',
        false,
        false,
        3500
      );
      if (r) {
        if (d) { d.vocab = r; d.vocabKey = vocabKey; saveDocs(); }
        openPanel(t('panel-vocab'), r, null);
      }
    }

    async function callTranslate() {
      const text = editor.innerText.trim();
      if (!text) return toast(t('no-text'));
      const tp = topic();

      // Count source paragraphs to reconstruct structure
      const srcParas = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

      const r = await callAI(
        `Translate to Vietnamese naturally. One paragraph per line, ${srcParas.length} line(s) total. No extra text.
${srcParas.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
        'btn-translate', false, false, 600, t('panel-translate')
      );

      if (r) {
        // Extract numbered lines, flatten each, join as paragraphs
        const lines = r.split('\n')
          .map(l => l.replace(/^\d+\.\s*/, '').trim())
          .filter(Boolean);
        // group consecutive non-empty lines that belong to same para (model may split)
        const paras = [];
        let buf = [];
        for (const line of lines) {
          if (/^\d+\./.test(line) && buf.length) { paras.push(buf.join(' ')); buf = [line.replace(/^\d+\.\s*/, '').trim()]; }
          else buf.push(line);
        }
        if (buf.length) paras.push(buf.join(' '));
        openPanel(t('panel-translate'), paras.join('\n\n'), null);
      }
    }

    // ── NEW AI FUNCTIONS ──

    function openPanelWith(title) {
      document.getElementById('pCards').style.display = 'none';
      document.getElementById('pContent').innerHTML = `<p style="color:var(--muted);font-size:.83rem;font-style:italic">${t('processing')}</p>`;
      document.getElementById('panelTitle').textContent = title;
      document.getElementById('lbar').classList.remove('hidden');
      document.getElementById('resultPanel').classList.add('open');
      document.getElementById('editorPane').classList.add('shifted');
    }

    async function callParaphrase() {
      const sel = window.getSelection()?.toString().trim();
      const text = (sel || ttsGetCurrentPara()).slice(0, 400);
      if (!text) return toast(t('no-text'));
      const vi = uiLang !== 'en';
      const title = 'Diễn đạt lại';
      openPanelWith(title);
      const r = await callAI(
        `Rewrite in 2 ways: 1) natural, 2) more advanced. Be brief.${vi ? ' Dịch nghĩa ngắn bằng tiếng Việt sau mỗi cách.' : ''}
"${text}"`,
        null, false, true, 400
      );
      if (r) openPanel(title, r, null);
      else document.getElementById('lbar').classList.add('hidden');
    }

    async function callExplain() {
      const sel = window.getSelection()?.toString().trim();
      const text = (sel || ttsGetCurrentPara()).slice(0, 400);
      if (!text) return toast(t('no-text'));
      const vi = uiLang !== 'en';
      const title = vi ? 'Giải thích' : 'Explain';
      openPanelWith(title);
      const r = await callAI(
        vi
          ? `Giải thích các từ/cụm từ quan trọng trong đoạn sau cho học sinh học tiếng Anh. Với mỗi từ/cụm: nghĩa tiếng Việt đơn giản + 1 ví dụ ngắn bằng tiếng Anh. Bỏ qua từ quá đơn giản (a, the, is...).
"${text}"`
          : `Explain key words/phrases for an English learner. For each: simple meaning + 1 short example. Skip very basic words.
"${text}"`,
        null, false, true, 500
      );
      if (r) openPanel(title, r, null);
      else document.getElementById('lbar').classList.add('hidden');
    }

    async function callAnalyze() {
      const sel = window.getSelection()?.toString().trim();
      const text = (sel || ttsGetCurrentPara()).slice(0, 400);
      if (!text) return toast(t('no-text'));
      const vi = uiLang !== 'en';
      const title = vi ? 'Phân tích ngữ pháp' : 'Grammar Analysis';
      openPanelWith(title);
      const r = await callAI(
        `Grammar check: tense, structure, errors. Be concise.${vi ? ' Bằng tiếng Việt.' : ''}
"${text}"`,
        null, false, true, 500
      );
      if (r) openPanel(title, r, null);
      else document.getElementById('lbar').classList.add('hidden');
    }

    // load IPA_DATA in background — starts immediately, non-blocking
    let _ipaPromise = null;
    function ensureIPA() {
      if (_ipaPromise) return _ipaPromise;
      if (typeof IPA_DATA !== 'undefined') { _ipaPromise = Promise.resolve(); return _ipaPromise; }
      _ipaPromise = new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'ipa-data.js';
        s.onload = resolve;
        s.onerror = resolve; // fail silently — IPA just won't be available
        document.head.appendChild(s);
      });
      return _ipaPromise;
    }
    // kick off background load right away
    ensureIPA();

    async function callDict() {
      const word = window.getSelection()?.toString().trim().toLowerCase();
      if (!word) return toast(t('no-text'));
      const vi = uiLang !== 'en';
      const title = vi ? `Từ điển: ${word}` : `Dictionary: ${word}`;
      openPanelWith(title);

      // try local IPA first for instant display, then fetch full API data
      const localIpa = (typeof IPA_DATA !== 'undefined' ? IPA_DATA[word] : null) || null;

      let dictData = null;
      try {
        const res = await fetch(`${WORKER_URL}/dict?word=${encodeURIComponent(word)}`);
        if (res.ok) dictData = await res.json();
      } catch (e) { console.error('Dict API error:', e); }

      // render DOM trực tiếp — không dùng marked.parse()
      const pContent = document.getElementById('pContent');
      document.getElementById('pCards').style.display = 'none';
      document.getElementById('lbar').classList.add('hidden');
      document.getElementById('panelTitle').textContent = title;
      document.getElementById('resultPanel').classList.add('open');
      document.getElementById('editorPane').classList.add('shifted');
      pContent.innerHTML = '';

      if (!dictData || !dictData[0]) {
        // build header with IPA if available
        if (localIpa) {
          const header = document.createElement('div');
          header.style.cssText = 'display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.75rem';
          const wordEl = document.createElement('h2');
          wordEl.style.cssText = 'margin:0;font-size:1.6rem';
          wordEl.textContent = word;
          header.appendChild(wordEl);
          const ipaEl = document.createElement('span');
          ipaEl.style.cssText = 'color:var(--muted);font-size:1rem';
          ipaEl.textContent = localIpa;
          header.appendChild(ipaEl);
          const speakBtn = document.createElement('button');
          speakBtn.className = 'dict-audio-btn';
          speakBtn.title = vi ? 'Nghe phát âm' : 'Listen';
          speakBtn.innerHTML = '<i class="bi bi-volume-up-fill"></i>';
          speakBtn.onclick = () => { const u = new SpeechSynthesisUtterance(word); u.lang = 'en-US'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); };
          header.appendChild(speakBtn);
          pContent.appendChild(header);
        }
        // fallback to AI for definition
        const loadingEl = document.createElement('span');
        const aiPrompt = vi
          ? `Tra từ tiếng Anh "${word}". Trả lời ngắn gọn bằng tiếng Việt: phiên âm IPA, loại từ, nghĩa chính (1-2 nghĩa), 1 ví dụ câu. Không giải thích dài dòng.`
          : `Define the English word "${word}" briefly: IPA pronunciation, part of speech, 1-2 main meanings, 1 example sentence.`;
        const aiResult = await callAI(aiPrompt, null, true, true, 400);
        loadingEl.remove();
        if (aiResult) {
          const aiEl = document.createElement('div');
          aiEl.innerHTML = marked.parse(aiResult);
          pContent.appendChild(aiEl);
        } else {
          const errEl = document.createElement('p');
          errEl.style.cssText = 'color:var(--muted);font-style:italic';
          errEl.textContent = vi ? 'Không tìm thấy từ này.' : 'Word not found.';
          pContent.appendChild(errEl);
        }
        return;
      }

      const entry = dictData[0];
      const phonetics = entry.phonetics || [];
      const ipa = phonetics.find(p => p.text)?.text || entry.phonetic || localIpa || '';

      // header: từ + IPA + nút phát âm
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.75rem';
      const wordEl = document.createElement('h2');
      wordEl.style.cssText = 'margin:0;font-size:1.6rem';
      wordEl.textContent = word;
      header.appendChild(wordEl);

      if (ipa) {
        const ipaEl = document.createElement('span');
        ipaEl.style.cssText = 'color:var(--muted);font-size:1rem';
        ipaEl.textContent = ipa;
        header.appendChild(ipaEl);
      }

      // nút phát âm bằng Web Speech API
      const speakBtn = document.createElement('button');
      speakBtn.className = 'dict-audio-btn';
      speakBtn.title = vi ? 'Nghe phát âm' : 'Listen';
      speakBtn.innerHTML = '<i class="bi bi-volume-up-fill"></i>';
      speakBtn.onclick = () => {
        const u = new SpeechSynthesisUtterance(word);
        u.lang = 'en-US'; u.rate = 0.85;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      };
      header.appendChild(speakBtn);
      pContent.appendChild(header);

      // meanings
      for (const meaning of (entry.meanings || []).slice(0, 4)) {
        const posEl = document.createElement('div');
        posEl.style.cssText = 'font-weight:600;color:var(--accent);margin:.6rem 0 .3rem;font-size:.9rem;text-transform:uppercase;letter-spacing:.04em';
        posEl.textContent = meaning.partOfSpeech;
        pContent.appendChild(posEl);

        const ul = document.createElement('ul');
        ul.style.cssText = 'margin:0 0 .4rem;padding-left:1.2rem';
        for (const def of (meaning.definitions || []).slice(0, 3)) {
          const li = document.createElement('li');
          li.style.cssText = 'margin-bottom:.35rem;font-size:.9rem';
          li.textContent = def.definition;
          if (def.example) {
            const ex = document.createElement('div');
            ex.style.cssText = 'color:var(--muted);font-style:italic;font-size:.83rem;margin-top:.15rem;padding-left:.5rem;border-left:2px solid var(--border)';
            ex.textContent = def.example;
            li.appendChild(ex);
          }
          ul.appendChild(li);
        }
        pContent.appendChild(ul);

        const synonyms = (meaning.synonyms || []).slice(0, 5);
        if (synonyms.length) {
          const synEl = document.createElement('div');
          synEl.style.cssText = 'font-size:.83rem;color:var(--muted);margin-bottom:.4rem';
          synEl.innerHTML = `<span style="font-weight:600">${vi ? 'Từ đồng nghĩa:' : 'Synonyms:'}</span> ${synonyms.join(', ')}`;
          pContent.appendChild(synEl);
        }
      }
    }

