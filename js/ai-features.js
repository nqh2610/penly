    // callSample is defined in outline.js

    // ── TOPIC VALIDATION ──
    const _btnCooldown = {};      // btnId -> timestamp
    const _topicValidCache = {};  // topic key -> true/false
    let _topicExtra = '';         // extra context added via clarify dialog

    function isCooldown(btnId) {
      if (!btnId) return false;
      const until = _btnCooldown[btnId] || 0;
      if (Date.now() < until) {
        const secs = Math.ceil((until - Date.now()) / 1000);
        toast(uiLang === 'en' ? `Please wait ${secs}s before trying again.` : `Vui lòng chờ ${secs}s trước khi thử lại.`, 'i');
        return true;
      }
      return false;
    }

    function setCooldown(btnId, ms = 30000) {
      if (btnId) _btnCooldown[btnId] = Date.now() + ms;
    }

    // Returns extra topic context (if user clarified), resets after use
    function consumeTopicExtra() {
      const x = _topicExtra; _topicExtra = ''; return x;
    }

    function _isObviousGibberish(tp) {
      if (!/[a-zA-ZÀ-ỹ]/.test(tp)) return true;
      const letters = tp.toLowerCase().replace(/[^a-z]/g, '');
      if (letters.length > 4 && new Set(letters).size / letters.length < 0.25) return true;
      return false;
    }

    function _showClarifyDialog(resolve) {
      const vi = uiLang !== 'en';
      const overlay = document.getElementById('topicClarifyOverlay');
      document.getElementById('topicClarifyTitle').textContent = vi ? 'Chủ đề chưa rõ' : 'Topic unclear';
      document.getElementById('topicClarifyDesc').textContent = vi
        ? 'AI chưa hiểu chủ đề này. Bạn muốn viết về điều gì cụ thể?'
        : 'AI couldn\'t understand this topic. What specifically do you want to write about?';
      document.getElementById('topicClarifyInput').placeholder = vi ? 'Mô tả thêm về chủ đề…' : 'Describe your topic further…';
      document.getElementById('topicClarifyOK').textContent = vi ? 'Tiếp tục' : 'Continue';
      document.getElementById('topicClarifyCancel').textContent = vi ? 'Huỷ' : 'Cancel';
      document.getElementById('topicClarifyInput').value = '';
      overlay.style.display = 'flex';
      document.getElementById('topicClarifyInput').focus();

      const ok = document.getElementById('topicClarifyOK');
      const cancel = document.getElementById('topicClarifyCancel');
      function cleanup() {
        overlay.style.display = 'none';
        ok.replaceWith(ok.cloneNode(true));
        cancel.replaceWith(cancel.cloneNode(true));
      }
      document.getElementById('topicClarifyOK').onclick = () => {
        const extra = document.getElementById('topicClarifyInput').value.trim();
        cleanup();
        resolve(extra || null);
      };
      document.getElementById('topicClarifyCancel').onclick = () => { cleanup(); resolve(false); };
      document.getElementById('topicClarifyInput').onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('topicClarifyOK').click(); }
        if (e.key === 'Escape') { cleanup(); resolve(false); }
      };
    }

    async function _validateTopicAI(tp) {
      const key = tp.trim().toLowerCase();
      if (key in _topicValidCache) return _topicValidCache[key];
      const lk = getLicenseKey();
      if (!lk) return true;
      try {
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            penly_key: lk,
            prompt: `Is "${tp.trim()}" a valid English writing topic? Reply only YES or NO.`,
            temperature: 0,
            max_tokens: 5,
            model: 'llama-3.1-8b-instant'
          })
        });
        const d = await res.json();
        const valid = (d.content || '').trim().toUpperCase().startsWith('YES');
        _topicValidCache[key] = valid;
        return valid;
      } catch { return true; }
    }

    async function guardTopic(btnId) {
      if (isCooldown(btnId)) return false;
      const tp = (topic() || '').trim();
      if (!tp) return true;
      if (_isObviousGibberish(tp)) {
        toast(uiLang === 'en' ? 'Please enter a real writing topic.' : 'Vui lòng nhập chủ đề thực sự.', 'i');
        return false;
      }
      return true;
    }

    async function callGrammar() {
      if (!await guardTopic('btn-grammar')) return;
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
      setCooldown('btn-grammar');
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


    async function callImprove() {
      if (!await guardTopic('btn-improve')) return;
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

      const { lvlCode: improveLevel, lvlStd, toneStd } = typeof getStandards === 'function' ? getStandards() : { lvlCode: (lvlSel.value.match(/^[ABC]/) || ['B'])[0], lvlStd: null, toneStd: null };
      const improveRule = improveLevel === 'A'
        ? 'Fix unnatural phrasing → more natural simple expressions; add a basic connector where missing; correct word order issues'
        : improveLevel === 'C'
          ? 'Elevate to sophisticated vocabulary; vary sentence structures; add discourse markers; improve cohesion and coherence'
          : 'Replace repetitive/weak words with more precise vocabulary; combine short choppy sentences; add transitional phrases';
      const styleRules = [
        'NEVER use em dash (—) — use comma or "and/but" instead',
        lvlStd ? `Sentences: ${lvlStd.sentences}` : '',
        lvlStd ? `Connectors: use ${lvlStd.connectors}` : '',
        toneStd && !toneStd.contractions ? 'No contractions' : '',
        toneStd && !toneStd.firstPerson ? 'No first person ("I")' : '',
      ].filter(Boolean).join('; ');

      const r = await callAI(
        `You are an expert English editor and ESL writing coach. IMPROVE the user's writing — do not rewrite or replace their ideas.

user's ORIGINAL text:
"""
${baseText}
"""
${baseText !== text ? `\nuser's CURRENT text (already improved once — use as starting point, avoid over-editing):
"""
${text}
"""` : ''}
${ctx()}
Interface language: ${uiLang === 'en' ? 'English' : 'Vietnamese'}

LANGUAGE RULE: Write ALL headings, explanations, and tips in ${uiLang === 'en' ? 'English' : 'Vietnamese'}.

**KEEP:** Every idea, fact, detail, narrator voice, emotional tone. Do NOT add or remove content.
**IMPROVE (level ${improveLevel}):** ${improveRule}

**STYLE RULES (must follow — shared standard with Sample and Review):**
${styleRules}

**RULES:**
- NEVER invent new content
- NEVER change word count by more than 30% vs ORIGINAL
- If improved once, focus on a DIFFERENT aspect
- Bold (**word**) ONLY words/phrases changed from current version
- You MUST output ALL THREE sections below in order: the improved text between %%S%% and %%E%%, then the changes section, then the tips section. Do not stop after the improved text.

Output format — follow EXACTLY:

%%S%%
(Improved text here. Bold changed words. No headings.)
%%E%%

## ✏️ ${uiLang === 'en' ? 'Changes made' : 'Thay đổi'}
*(${uiLang === 'en' ? 'List each change: original → improved — short reason why' : 'Liệt kê từng thay đổi: gốc → cải thiện — lý do ngắn'})*

## 💡 ${uiLang === 'en' ? 'Practice tips' : 'Mẹo luyện tập'}
*(${uiLang === 'en' ? '1–2 practical tips based on the changes above' : '1–2 mẹo thực dụng dựa trên những thay đổi trên'})*`,
        'btn-improve'
      );
      if (!r) return;

      // extract improved text — try marker first, fallback to first paragraph block
      let improvedText = null;
      const markerMatch = r.match(/%%S%%\s*([\s\S]*?)\s*%%E%%/);
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
      const displayMd = r.replace(/%%S%%[\s\S]*?%%E%%/,
        improvedText ? improvedText : '');

      openPanel(t('panel-improve'), displayMd, null);
      setCooldown('btn-improve');

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
          // Convert plain text paragraphs to HTML — contenteditable uses <div> per paragraph
          const paras = plain.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
          editor.innerHTML = paras.length > 1
            ? paras.map(p => `<div>${p.replace(/\n/g, '<br>')}</div>`).join('')
            : plain.replace(/\n/g, '<br>');
          editor.dispatchEvent(new Event('input'));
          if (typeof writingSource !== 'undefined') writingSource = 'improve';
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
      if (!await guardTopic('btn-review')) return;
      const text = editor.innerText.trim();
      if (!text) return toast(t('no-text-review'));
      setPanelTitle('panel-review');
      const tp = topic();
      const wc = text.trim().split(/\s+/).filter(Boolean).length;
      const vi = uiLang !== 'en';

      // Guard: reject gibberish / too-short input before calling AI
      if (wc < 8) {
        return toast(vi ? 'Viết ít nhất 8 từ để nhận nhận xét.' : 'Write at least 8 words to get feedback.', '');
      }
      // Detect gibberish: ratio of real word characters vs total is too low
      const alphaRatio = (text.match(/[a-zA-ZÀ-ỹ]/g) || []).length / text.length;
      if (alphaRatio < 0.5) {
        return toast(vi ? 'Nội dung không hợp lệ. Hãy viết bằng tiếng Anh.' : 'Text does not look like real writing. Please write in English.', '');
      }
      // Detect repeated characters / keyboard mashing (e.g. "asdfasdf", "aaaaaaa")
      const uniqueWords = new Set(text.toLowerCase().match(/[a-z]{2,}/g) || []);
      const totalWords = (text.toLowerCase().match(/[a-z]{2,}/g) || []).length;
      if (totalWords > 3 && uniqueWords.size / totalWords < 0.25) {
        return toast(vi ? 'Nội dung có vẻ không phải văn bản thật. Hãy viết một đoạn văn thực sự.' : 'Text looks like random input. Please write a real paragraph.', '');
      }

      let reviewPrompt;

      if (wc < 60) {
        // short text — lightweight feedback proportional to length
        reviewPrompt = `You are a supportive but honest ESL writing teacher. The student wrote a short piece (${wc} word${wc === 1 ? '' : 's'}).

Topic: "${tp || 'not specified'}"
Text:
"""
${text}
"""
${ctx()}
Interface language: ${vi ? 'Vietnamese' : 'English'}

LANGUAGE RULE: Write ALL feedback in ${vi ? 'Vietnamese' : 'English'}.

CALIBRATION RULE: Only praise what genuinely works. Only flag real problems. Do not invent strengths to be encouraging, and do not manufacture weaknesses to seem thorough. A short but well-written text deserves honest recognition. A weak text deserves clear, kind guidance.

Give brief pedagogical feedback. Use 2 sections only:

## ${vi ? '✅ Điểm tốt' : '✅ What works'}
*(${vi ? 'Chỉ nêu nếu thực sự có — trích dẫn từ/câu cụ thể, giải thích tại sao hiệu quả' : 'Only if genuinely present — quote words or phrases, explain why they work'})*

## ${vi ? '💡 Gợi ý cải thiện' : '💡 How to improve'}
*(${vi ? 'Chỉ nêu vấn đề thực sự — trích dẫn → viết lại → giải thích ngắn. Nếu không có vấn đề, nói thẳng bài viết tốt.' : 'Only real issues — quote → rewrite → brief reason. If there are none, say the writing is good.'})*`;

      } else {
        // full review for substantial text
        const srcCtx = typeof writingSource !== 'undefined' && writingSource;
        const srcInstruction = srcCtx === 'sample'
          ? (vi
            ? '\nLƯU Ý: Bài này được chèn từ bài mẫu AI. Đánh giá như bài học mẫu — chỉ ra điểm hay để học theo, gợi ý cách người học tự viết lại theo phong cách riêng.'
            : '\nNOTE: This is an AI-generated sample essay the user is studying. Evaluate it as a model text — highlight what makes it effective and suggest how the learner could adapt it in their own voice.')
          : srcCtx === 'improve'
          ? (vi
            ? '\nLƯU Ý: Bài này đã được AI nâng cấp. Tập trung vào những gì đã tốt, chỉ nêu những điểm còn có thể tinh chỉnh — không nhắc lại lỗi đã được sửa.'
            : '\nNOTE: This text has been refined by AI. Focus on what works well, only flag what could still be improved — do not re-flag issues already addressed.')
          : '';

        reviewPrompt = `You are a supportive but rigorous English writing teacher and language pedagogy specialist.

CALIBRATION RULES — follow strictly:
1. Only praise what genuinely works — quote the specific sentence or phrase and explain WHY it is effective
2. Only flag real problems — if a criterion is strong, skip it; do not manufacture weaknesses
3. If the writing is excellent overall, say so clearly — do not soften with false caveats
4. If the writing has serious problems, name them clearly but kindly — do not soften to avoid discouraging the student
5. Feedback must be actionable — every suggestion must have a concrete example or rewrite
6. Evaluate against the WRITING CONTEXT below — the style rules (connectors, contractions, first person, sentence length) are the agreed standard for this text. Do NOT flag something as a problem if it follows those rules. Do NOT praise deviating from those rules.

Topic: "${tp || 'not specified'}"
Text:
"""
${text}
"""
${ctx()}${srcInstruction}
Interface language: ${vi ? 'Vietnamese' : 'English'}

LANGUAGE RULE: Write ALL output in ${vi ? 'Vietnamese' : 'English'}.

---

## ✅ ${vi ? 'Điểm làm tốt' : 'What works well'}
*(${vi
  ? 'Chỉ nêu những điểm thực sự tốt — trích dẫn câu/từ cụ thể → giải thích tại sao hiệu quả về mặt ngôn ngữ hoặc sư phạm. Nếu không có điểm nổi bật, hãy nói thẳng và chuyển sang phần cải thiện.'
  : 'Only genuinely strong points — quote specific sentence or phrase → explain why it is linguistically or pedagogically effective. If nothing stands out, say so honestly and move on.'})*

## ⚠️ ${vi ? 'Cần cải thiện' : 'Areas to improve'}
*(${vi
  ? 'Chỉ nêu vấn đề thực sự — trích dẫn câu gốc → viết lại hay hơn → giải thích ngắn gọn tại sao bản viết lại tốt hơn. Nếu bài không có vấn đề đáng kể, nói thẳng là bài viết đã tốt ở tiêu chí này.'
  : 'Only real issues — quote original → rewrite → brief explanation of why the rewrite is better. If there are no significant issues, say so directly.'})*

## 🎯 ${vi ? 'Nội dung & mạch văn' : 'Content & flow'}
*(${vi
  ? '2–3 câu thẳng thắn: Bài có đủ ý không? Các đoạn/câu có liên kết tự nhiên không? Có phù hợp với độc giả và văn phong đã chọn không? Chỉ nhận xét những gì thực sự đúng với bài này.'
  : '2–3 honest sentences: Does the essay cover the topic adequately? Do paragraphs connect naturally? Is it consistent with the selected tone and audience? Only comment on what actually applies.'})*

## 📊 ${vi ? 'Trình độ & định hướng' : 'Level & next step'}
*(${vi
  ? 'Ước tính trình độ CEFR thực tế của bài (A1–C2) — giải thích ngắn dựa trên bằng chứng cụ thể trong bài. Sau đó đề xuất 1 kỹ năng cụ thể để tiến lên trình độ cao hơn.'
  : 'Estimate the actual CEFR level (A1–C2) — brief explanation based on specific evidence from the text. Then suggest 1 concrete skill to work on to reach the next level.'})*`;
      }

      const r = await callAI(reviewPrompt, 'btn-review');
      if (r) { setCooldown('btn-review'); openPanel(t('panel-review'), r, null); }
    }

    async function callVocab() {
      if (!await guardTopic('btn-vocab')) return;
      const tp = topic(); const text = editor.innerText.trim();
      if (!tp && !text) return toast(t('no-text-vocab'));
      setPanelTitle('panel-vocab');

      // Cache check — doc-level first, then localStorage
      const d = getDoc(currentId);
      const vocabKey = `${tp}|${lvlSel.value}|${uiLang}`;
      if (d && d.vocab && d.vocabKey === vocabKey) {
        openPanel(t('panel-vocab'), d.vocab, null);
        return;
      }
      const lsVocabKey = `vocab3|${vocabKey}`;
      try {
        const lsCached = localStorage.getItem(lsVocabKey);
        if (lsCached) {
          if (d) { d.vocab = lsCached; d.vocabKey = vocabKey; saveDocs(); }
          openPanel(t('panel-vocab'), lsCached, null);
          return;
        }
      } catch (_) {}

      const r = await callAI(
        `You are an ESL vocabulary teacher. Give a focused, practical vocabulary guide for this user.

${tp ? `Topic: "${tp}"` : ''}
${text ? `user's text so far:\n"""\n${text.substring(0, 400)}\n"""` : ''}
Level: ${lvlSel.value}

Interface language: ${uiLang === 'en' ? 'English' : 'Vietnamese'}

Rules:
- Silently match ALL examples to the level above — never mention the level in the output
- NO em dash (—). Use comma or and/but/so instead
- NO markdown tables. Use the exact card format shown below.
- Keep it practical: words the user can use TODAY in their writing
- LANGUAGE RULE: Write ALL section headings, labels, explanations, and meanings in ${uiLang === 'en' ? 'English' : 'Vietnamese'}
- EXAMPLE SENTENCES: ALL example sentences (lines starting with >) must ALWAYS be written in English — never in Vietnamese, regardless of interface language.
- For Phrasal Verbs, Idioms, and Fixed Expressions: ONLY include if genuinely relevant. If none, SKIP that section entirely.
- NATURALNESS: every example sentence must sound like something a real person would actually say or write — specific, vivid, directly connected to the topic. No generic filler like "She uses this word." No robot-sounding sentences.
- TRANSLATION: when writing meanings or translations in Vietnamese, translate the MEANING not the words — use natural Vietnamese equivalents and collocations. Bad: "có một nụ cười lớn". Good: "có nụ cười tươi".

---

## 🔑 ${uiLang === 'en' ? 'Key vocabulary' : 'Từ vựng cần biết'}

${uiLang === 'en' ? '10–12 words/phrases — practical, level-appropriate, topic-relevant' : '10–12 từ/cụm từ — thực dụng, phù hợp trình độ, gắn chủ đề'}

Use this EXACT format for each word (no tables, no columns):

**word** /IPA/ *(part of speech)* — ${uiLang === 'en' ? 'meaning in English' : 'nghĩa tiếng Việt'}
> *Example sentence in English using this word.*

*(repeat for each word)*

---

## 🔗 ${uiLang === 'en' ? 'Useful connectors' : 'Từ nối hay dùng'}

${uiLang === 'en' ? 'List 4–6 level-appropriate connectors with short examples' : 'Chỉ liệt kê 4–6 từ nối phù hợp trình độ, kèm ví dụ ngắn'}

- **connector** — ${uiLang === 'en' ? 'when to use' : 'khi nào dùng'}: *English example sentence.*

---

${uiLang === 'en'
  ? `OPTIONAL SECTIONS — include ONLY if you can find at least 1 genuinely natural example directly connected to the topic "${tp || 'given'}". If you cannot, skip the section entirely — do not force unnatural examples.

## 🔄 Phrasal verbs
*(Only if 1+ phrasal verbs fit naturally. Format: **verb** /IPA/ — meaning → example sentence.)*

## 💬 Idioms & proverbs
*(Only if 1+ idioms or proverbs connect naturally. Format: **idiom** — real meaning → example sentence.)*

## 📌 Fixed expressions & useful phrases
*(Only if 1+ fixed expressions are genuinely used in this topic area. Format: **expression** — meaning/when to use → example sentence.)*`
  : `CÁC PHẦN TÙY CHỌN — chỉ đưa vào nếu tìm được ít nhất 1 ví dụ thực sự tự nhiên và gắn trực tiếp với chủ đề "${tp || 'đã cho'}". Nếu không có, bỏ qua hoàn toàn — không cố viết ví dụ gượng ép.

## 🔄 Cụm động từ
*(Chỉ khi có 1+ cụm động từ phù hợp tự nhiên. Định dạng: **cụm động từ** /IPA/ — nghĩa → câu ví dụ tiếng Anh.)*

## 💬 Thành ngữ & tục ngữ
*(Chỉ khi có 1+ thành ngữ/tục ngữ gắn tự nhiên. Định dạng: **thành ngữ** — ý nghĩa thực → câu ví dụ tiếng Anh.)*

## 📌 Cụm từ cố định & diễn đạt hay
*(Chỉ khi có 1+ cụm từ thực sự dùng trong chủ đề này. Định dạng: **cụm từ** — nghĩa/khi dùng → câu ví dụ tiếng Anh.)*`}

---

## ✍️ ${uiLang === 'en' ? '3 sample sentences to use now' : '3 câu mẫu tiếng Anh có thể dùng ngay'}

*(Always write these 3 sentences in English — they are English writing examples for the student.)*
> *Sentence 1*
> *Sentence 2*
> *Sentence 3*`,
        'btn-vocab',
        false,
        false,
        1800
      );
      if (r) {
        setCooldown('btn-vocab');
        if (d) { d.vocab = r; d.vocabKey = vocabKey; saveDocs(); }
        try { localStorage.setItem(lsVocabKey, r); } catch (_) {}
        openPanel(t('panel-vocab'), r, null);
      }
    }

    async function callTranslate() {
      if (!await guardTopic('btn-translate')) return;
      const text = editor.innerText.trim();
      if (!text) return toast(t('no-text'));
      const tp = topic();

      // Always translate to Vietnamese — this app is for Vietnamese learners of English
      const targetLang = 'Vietnamese';

      // Count source paragraphs to reconstruct structure
      const srcParas = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

      const r = await callAI(
        `Translate the following English text to ${targetLang}. ${srcParas.length} paragraph(s) — output exactly ${srcParas.length} line(s), one per paragraph.

TRANSLATION RULES:
- Translate MEANING, not words — find the natural equivalent in ${targetLang}, not a word-for-word mapping
- Match tone: humorous stays humorous, formal stays formal, emotional stays emotional
- Use natural ${targetLang} expressions and collocations — avoid literal translations that sound unnatural
- Preserve the author's voice and style
- Examples of natural translation: "has a big smile" → "có nụ cười tươi" (not "có một nụ cười lớn"); "broke my heart" → "khiến tôi đau lòng" (not "phá vỡ trái tim tôi")
- No explanations, no extra text — translation only

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
        setCooldown('btn-translate');
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
      const title = vi ? 'Diễn đạt lại' : 'Paraphrase';
      openCtxPopover(title, null);
      const r = await callAI(
        `Rewrite the following English text in 2 ways: 1) more natural, 2) more advanced. Keep both rewrites in English.${vi ? ' After each rewrite, add a short Vietnamese translation.' : ''} Be brief.
"${text}"`,
        null, false, true, 400
      );
      if (r) updateCtxPopover(r);
      else closeCtxPopover();
    }

    async function callExplain() {
      const sel = window.getSelection()?.toString().trim();
      const text = (sel || ttsGetCurrentPara()).slice(0, 400);
      if (!text) return toast(t('no-text'));
      const vi = uiLang !== 'en';
      const title = vi ? 'Giải thích' : 'Explain';
      openCtxPopover(title, null);
      const r = await callAI(
        vi
          ? `Giải thích các từ/cụm từ quan trọng trong đoạn sau cho học sinh học tiếng Anh. Với mỗi từ/cụm: nghĩa tiếng Việt đơn giản + 1 ví dụ ngắn bằng tiếng Anh. Bỏ qua từ quá đơn giản (a, the, is...).
"${text}"`
          : `Explain key words/phrases for an English learner. For each: simple meaning + 1 short example. Skip very basic words.
"${text}"`,
        null, false, true, 500
      );
      if (r) updateCtxPopover(r);
      else closeCtxPopover();
    }

    async function callAnalyze() {
      const sel = window.getSelection()?.toString().trim();
      const text = (sel || ttsGetCurrentPara()).slice(0, 400);
      if (!text) return toast(t('no-text'));
      const vi = uiLang !== 'en';
      const title = vi ? 'Phân tích ngữ pháp' : 'Grammar Analysis';
      openCtxPopover(title, null);
      const r = await callAI(
        `Grammar check: tense, structure, errors. Be concise.${vi ? ' Explain in Vietnamese, but keep all example sentences and corrections in English.' : ''}
"${text}"`,
        null, false, true, 500
      );
      if (r) updateCtxPopover(r);
      else closeCtxPopover();
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
      openCtxPopover(title, null);
      const body = document.getElementById('ctxPopoverBody');
      body.innerHTML = `<p style="color:var(--muted);font-style:italic;font-size:.83rem">${t('processing')}</p>`;

      const localIpa = (typeof IPA_DATA !== 'undefined' ? IPA_DATA[word] : null) || null;
      let dictData = null;
      try {
        const res = await fetch(`${WORKER_URL}/dict?word=${encodeURIComponent(word)}`);
        if (res.ok) dictData = await res.json();
      } catch (e) { console.error('Dict API error:', e); }

      body.innerHTML = '';

      // helper to append to popover body
      const app = el => body.appendChild(el);

      // header: word + IPA + speak button
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.75rem';
      const wordEl = document.createElement('h2');
      wordEl.style.cssText = 'margin:0;font-size:1.4rem';
      wordEl.textContent = word;
      header.appendChild(wordEl);

      const ipa = (!dictData || !dictData[0])
        ? localIpa
        : (dictData[0].phonetics?.find(p => p.text)?.text || dictData[0].phonetic || localIpa || '');
      if (ipa) {
        const ipaEl = document.createElement('span');
        ipaEl.style.cssText = 'color:var(--muted);font-size:.95rem';
        ipaEl.textContent = ipa;
        header.appendChild(ipaEl);
      }
      const speakBtn = document.createElement('button');
      speakBtn.className = 'dict-audio-btn';
      speakBtn.title = vi ? 'Nghe phát âm' : 'Listen';
      speakBtn.innerHTML = '<i class="bi bi-volume-up-fill"></i>';
      speakBtn.onclick = () => { const u = new SpeechSynthesisUtterance(word); u.lang = 'en-US'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); };
      header.appendChild(speakBtn);
      app(header);

      if (!dictData || !dictData[0]) {
        // fallback to AI
        const aiPrompt = vi
          ? `Tra từ tiếng Anh "${word}". Trả lời ngắn gọn bằng tiếng Việt: phiên âm IPA, loại từ, nghĩa chính (1-2 nghĩa), 1 câu ví dụ tiếng Anh (kèm dịch nghĩa tiếng Việt). Không giải thích dài dòng.`
          : `Define the English word "${word}" briefly: IPA pronunciation, part of speech, 1-2 main meanings, 1 example sentence.`;
        const aiResult = await callAI(aiPrompt, null, true, true, 400);
        if (aiResult) {
          const aiEl = document.createElement('div');
          aiEl.innerHTML = marked.parse(aiResult);
          app(aiEl);
        } else {
          const errEl = document.createElement('p');
          errEl.style.cssText = 'color:var(--muted);font-style:italic';
          errEl.textContent = vi ? 'Không tìm thấy từ này.' : 'Word not found.';
          app(errEl);
        }
        return;
      }

      const entry = dictData[0];
      for (const meaning of (entry.meanings || []).slice(0, 4)) {
        const posEl = document.createElement('div');
        posEl.style.cssText = 'font-weight:600;color:var(--accent);margin:.6rem 0 .3rem;font-size:.85rem;text-transform:uppercase;letter-spacing:.04em';
        posEl.textContent = meaning.partOfSpeech;
        app(posEl);
        const ul = document.createElement('ul');
        ul.style.cssText = 'margin:0 0 .4rem;padding-left:1.2rem';
        for (const def of (meaning.definitions || []).slice(0, 3)) {
          const li = document.createElement('li');
          li.style.cssText = 'margin-bottom:.35rem;font-size:.88rem';
          li.textContent = def.definition;
          if (def.example) {
            const ex = document.createElement('div');
            ex.style.cssText = 'color:var(--muted);font-style:italic;font-size:.82rem;margin-top:.15rem;padding-left:.5rem;border-left:2px solid var(--border)';
            ex.textContent = def.example;
            li.appendChild(ex);
          }
          ul.appendChild(li);
        }
        app(ul);
        const synonyms = (meaning.synonyms || []).slice(0, 5);
        if (synonyms.length) {
          const synEl = document.createElement('div');
          synEl.style.cssText = 'font-size:.82rem;color:var(--muted);margin-bottom:.4rem';
          synEl.innerHTML = `<span style="font-weight:600">${vi ? 'Từ đồng nghĩa:' : 'Synonyms:'}</span> ${synonyms.join(', ')}`;
          app(synEl);
        }
      }
    }

