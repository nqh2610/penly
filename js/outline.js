    // ── SAMPLE ESSAY FEATURE ──
    // Replaces the old outline feature.
    // One AI call → a complete sample essay with VI translation toggle + per-paragraph insert.

    const SAMPLE_LS_PREFIX = 'penly_sample4_';
    const SAMPLE_LS_TTL = 30 * 24 * 60 * 60 * 1000;

    function sampleLsGet(key) {
      try {
        const raw = localStorage.getItem(SAMPLE_LS_PREFIX + key);
        if (!raw) return null;
        const { ts, val } = JSON.parse(raw);
        if (Date.now() - ts > SAMPLE_LS_TTL) { localStorage.removeItem(SAMPLE_LS_PREFIX + key); return null; }
        return val;
      } catch { return null; }
    }

    function sampleLsSet(key, val) {
      try { localStorage.setItem(SAMPLE_LS_PREFIX + key, JSON.stringify({ ts: Date.now(), val })); } catch {}
    }

    // Normalize topic for cache key — strip diacritics, stop words, sort tokens
    const _SAMPLE_STOPS = new Set('a an the my your our his her its this that these those i we you he she they it of in on at to for with about'.split(' '));
    function sampleNormTopic(tp) {
      const stripped = String(tp).normalize('NFD').replace(/[̀-ͯ]/g, '');
      const tokens = stripped.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(w => w && !_SAMPLE_STOPS.has(w));
      return tokens.sort().join(' ') || stripped.toLowerCase().trim();
    }

    function sampleKeys() {
      const lvl = (lvlSel.value.match(/^[ABC]/) || ['B'])[0];
      const toneWord = (toneSel.value.split(/[\s—]/)[0] || 'casual').toLowerCase();
      const tone = { storytelling: 'storytelling', casual: 'casual', humorous: 'humorous', professional: 'professional', persuasive: 'persuasive', emotional: 'emotional' }[toneWord] || 'casual';
      const a = audSel.value;
      const aud = /children/i.test(a) ? 'children' : /friends|family/i.test(a) ? 'friends' : /teachers|professionals/i.test(a) ? 'pro' : 'public';
      return { lvl, tone, aud };
    }

    // Word count targets by level
    const SAMPLE_WORDS = { A: 180, B: 250, C: 400 };

    // Tone guidance compact form
    const SAMPLE_TONES = {
      storytelling: 'Narrative: opening scene → events → turning point → what I learned. Use time connectors.',
      casual: 'Friendly, personal, like chatting. Contractions fine.',
      humorous: 'Light, funny angle per paragraph. Exaggeration or self-mockery welcome.',
      professional: 'Formal argument: claim → reason → evidence. No "I", no slang.',
      persuasive: 'Clear position, strongest reason first, one counter-argument answered, call to action.',
      emotional: 'Show feelings through moments: what I saw, heard, felt and why it mattered.',
    };

    const SAMPLE_AUD = {
      children: 'Reader: young child. Concrete, simple, playful.',
      friends: 'Reader: close friend. Warm, direct, informal.',
      public: 'Reader: general public. Clear, polite, neutral.',
      pro: 'Reader: teacher or professional. Precise, formal, evidence-based.',
    };

    const SAMPLE_LEVEL = {
      A: 'A1–A2: sentences 5–9 words, simple present/past, common words only.',
      B: 'B1–B2: sentences 10–18 words, varied vocab, connectors like "because/however/although".',
      C: 'C1–C2: sentences 18–30 words, sophisticated vocabulary, complex structures.',
    };

    function buildSamplePrompt(tp, lvl, tone, aud) {
      const wordTarget = SAMPLE_WORDS[lvl];
      const lvlStd = typeof WRITING_STANDARDS !== 'undefined' ? WRITING_STANDARDS.level[lvl] : null;
      const toneStd = typeof WRITING_STANDARDS !== 'undefined' ? WRITING_STANDARDS.tone[tone] : null;
      const sentenceRule = lvlStd ? `sentences ${lvlStd.sentences}` : '';
      const vocabRule = lvlStd ? `vocabulary: ${lvlStd.vocab}` : '';
      const connectorRule = lvlStd ? `connectors: use ${lvlStd.connectors}` : '';
      const contractionRule = toneStd ? (toneStd.contractions ? 'contractions OK' : 'no contractions') : '';
      const firstPersonRule = toneStd ? (toneStd.firstPerson ? 'first person OK' : 'avoid "I" — write objectively') : '';

      // Body paragraph count by level — intro must preview exactly this many ideas
      const bodyCount = lvl === 'A' ? 2 : lvl === 'C' ? 4 : 3;
      const paraCount = 1 + bodyCount + 1; // intro + body + conclusion
      const bodyLabels = Array.from({length: bodyCount}, (_, i) => `BODY ${i + 1}`);
      const introPreview = `Preview exactly ${bodyCount} ideas the essay will cover (one per body paragraph)`;

      // Build body lines per tone
      const bodyLines = {
        storytelling: [
          'The situation or problem that started everything — specific detail, not summary.',
          'The key event or turning point — what happened, what you felt, show don\'t tell.',
          'The result or change — what was different after, what you gained or lost.',
          'A deeper reflection — what this experience revealed about you or the world.',
        ],
        casual: [
          'First point from intro preview — personal example or everyday situation.',
          'Second point from intro preview — different angle, conversational.',
          'Third point from intro preview — most interesting or surprising one.',
          'Fourth point from intro preview — a bonus insight or unexpected connection.',
        ],
        humorous: [
          'First funny angle — build the joke with a specific absurd detail or example.',
          'Second angle — escalate the humor, use contrast or unexpected comparison.',
          'Third angle — funniest or most surprising point, land the punchline.',
          'Final twist — an unexpected reversal or self-aware meta-comment.',
        ],
        professional: [
          'Strongest argument — claim + evidence/data + implication.',
          'Second argument — different supporting reason + real-world example.',
          'Third argument — further evidence or a different dimension of the issue.',
          'Counter-argument acknowledged and refuted with evidence.',
        ],
        persuasive: [
          'Most compelling reason — specific example, statistic, or consequence.',
          'Second reason — appeals to reader\'s values or interests.',
          'Third reason — addresses a common misconception or adds urgency.',
          'Strongest objection addressed and refuted.',
        ],
        emotional: [
          'First emotional layer — specific moment, show don\'t tell.',
          'Deepen the emotion — a memory, person, or detail that intensified the feeling.',
          'The shift or resolution — how feelings evolved, what you understood differently.',
          'The lasting impact — how this changed your perspective or behaviour.',
        ],
      }[tone] || [
        'First main point from intro — explain and give a specific example.',
        'Second main point from intro — different angle or supporting reason.',
        'Third main point from intro — most important or memorable idea.',
        'Fourth point — additional insight or supporting evidence.',
      ];

      const toneIntro = {
        storytelling: `1) Hook — vivid opening scene (where, when, who). 2) Introduce the situation. 3) ${introPreview}.`,
        casual: `1) Hook — relatable observation, question, or personal opinion. 2) Briefly introduce the topic. 3) ${introPreview}.`,
        humorous: `1) Hook — funny observation, exaggeration, or self-deprecating remark. 2) Introduce the topic with a comic angle. 3) ${introPreview}.`,
        professional: `1) Hook — striking fact, statistic, or bold statement. 2) State your clear position/thesis. 3) ${introPreview}.`,
        persuasive: `1) Hook — bold statement or striking fact creating urgency. 2) State your position clearly. 3) ${introPreview}.`,
        emotional: `1) Hook — one vivid sensory detail or emotional moment. 2) Introduce the topic and its emotional significance. 3) ${introPreview}.`,
      }[tone] || `1) Hook — interesting question, surprising fact, or vivid image. 2) Introduce the topic clearly. 3) ${introPreview}.`;

      const toneConclusion = {
        storytelling: 'Reflect on what this taught you. Echo the opening scene or image.',
        casual: 'Overall feeling or friendly call-to-action. Refer back to the opening hook.',
        humorous: 'Light witty remark that ties back to the opening joke.',
        professional: 'Restate position, summarize all body points, forward-looking closing statement.',
        persuasive: 'Reinforce position, summarize key reasons, direct call to action.',
        emotional: 'Return to the opening image. End with a quiet, meaningful reflection.',
      }[tone] || 'Restate central idea, summarize all body points, memorable closing thought.';

      const toneStructure = `INTRO (3 parts): ${toneIntro}
${bodyLabels.map((label, i) => `${label}: ${bodyLines[i]}`).join('\n')}
CONCLUSION: ${toneConclusion}`;

      // Audience-specific language guidance
      const audDetail = {
        children: 'Use very simple words a child knows. Short sentences. Concrete, visual examples (animals, toys, food, family). Friendly and encouraging tone.',
        friends: 'Write like texting a close friend. Use "you" directly. Share personal feelings. Casual vocabulary, natural contractions.',
        public: 'Write for a general adult audience. Clear and accessible. Avoid jargon. Polite and neutral.',
        pro: 'Write for educated professionals. Precise vocabulary. Evidence-based reasoning. Formal register without being stiff.',
      }[aud] || 'Write for a general audience. Clear, accessible, neutral.';

      // Intro examples scaled to bodyCount
      const introExamples = {
        2: {
          A: '"Every morning, I feel happy when I go to school. My school is a fun place. I like my teachers and my friends there."',
          B: '"Have you ever walked into a place that felt like home? For me, that place is my school. It has shaped who I am through great teachers and close friendships."',
          C: '"Few places leave as deep an impression as the school where one spends their formative years. My school shaped my character and my ambitions in two profound ways."',
        },
        3: {
          A: '"Every morning, I feel happy when I go to school. My school is a fun place. I like my teachers, my friends, and the games we play at recess."',
          B: '"Have you ever walked into a place that felt like a second home? For me, that place is my school. It has shaped who I am through great teachers, close friendships, and lessons I will never forget."',
          C: '"Few places leave as deep an impression on a person as the school where they spent their formative years. My school was not just a building; it was where I discovered my curiosity, built lasting friendships, and learned that failure is often the best teacher."',
        },
        4: {
          A: '"Every morning, I feel happy when I go to school. My school is a great place. I like my teachers, my friends, the games, and the things I learn every day."',
          B: '"Have you ever been somewhere that changed you without you noticing? My school did exactly that — through inspiring teachers, real friendships, daily challenges, and small moments I will carry for life."',
          C: '"Few institutions shape a person as profoundly as the school they attend in their youth. My own school left its mark on me through exceptional teaching, meaningful friendships, intellectual challenges, and an ethos of resilience that I carry to this day."',
        },
      }[bodyCount][lvl];

      return `You are an expert English writing teacher creating a model essay for a language learner.

TOPIC: "${tp}"
TARGET READER: ${audDetail}
LANGUAGE LEVEL: ${SAMPLE_LEVEL[lvl]}
  - Sentence length: ${sentenceRule}
  - Vocabulary: ${vocabRule}
  - ${connectorRule}
  - ${contractionRule}; ${firstPersonRule}
TONE & STYLE: ${SAMPLE_TONES[tone]}
TOTAL LENGTH: approximately ${wordTarget} words in English
STRUCTURE: ${paraCount} paragraphs total (1 intro + ${bodyCount} body + 1 conclusion)

ESSAY STRUCTURE — follow this exactly:
${toneStructure}

INTRO EXAMPLE for level ${lvl} with ${bodyCount} body paragraphs (model the quality and structure, do NOT copy):
${introExamples}

PERSPECTIVE — decide this silently before writing a single word:
- Choose ONE specific moment, memory, or situation connected to this topic — not a general overview
- Choose ONE concrete detail from that moment (a sound, a smell, an object, a face, a feeling)
- Decide the writer's honest opinion — it may be mixed, unexpected, or imperfect ("I did not always like it", "It surprised me", "I used to think X but now I think Y")
- Write the ENTIRE essay from inside that specific moment and perspective
- NEVER step outside it to say "everyone", "most people", "people in general", or "it is important"
- The essay should read like ONE person's specific experience, not a general article about the topic

QUALITY RULES — every paragraph must follow these:
1. ONE idea per paragraph — do not mix two topics in one paragraph.
2. INTRO must preview exactly ${bodyCount} ideas — one per body paragraph. Each body paragraph covers exactly one previewed idea.
3. CONCLUSION refers back to the intro's central idea and summarizes all ${bodyCount} body points.
4. Hook: first sentence must pull the reader in — a question, surprising fact, or vivid image. NOT "In this essay I will..." Bad: "Dogs are good pets." Good: "The moment my dog nudged my hand on my worst day, I understood why people call them loyal."
5. Show, don't tell: replace emotion labels with concrete details. Bad: "I was nervous." Good: "My hands wouldn't stop shaking."
6. Transition: last sentence of each body paragraph must bridge to the next idea. Bad: "That is why cats are clean." Good: "Their cleanliness is just one reason, but it is their quiet independence that truly sets them apart."
7. Rhythm: mix short and long sentences. Bad: 5 long sentences in a row. Good: "She waited. The room was silent, and every second felt like an hour."
8. Clincher: last sentence of the conclusion must be memorable — an image, a question, or a truth. NOT a plain summary. Bad: "So, dogs are great pets." Good: "Maybe what we love most about dogs is what they remind us to be: present, loyal, and unafraid to show it."
9. NEVER use em dash (—). Use a comma, "and", or "but" instead.
10. Vary sentence openings — do not start 2 sentences in a row with the same word.
11. NATURALNESS: every sentence must sound like something a real person would actually say or write. Be specific — no generic filler like "This topic is important."

Use EXACTLY this output format — each marker on its own line, English and Vietnamese strictly separated:
[P1] (English paragraph 1 only — NO Vietnamese here)
[V1] (Vietnamese translation of P1 only — NO English here)
[P2] (English paragraph 2 only)
[V2] (Vietnamese translation of P2 only)
... and so on for all ${paraCount} paragraphs.

CRITICAL: [P] markers contain ONLY English. [V] markers contain ONLY Vietnamese. Never mix both languages inside the same marker.

Example of CORRECT format:
[P1] I still remember the day I walked into my first classroom. The smell of new books filled the air, and I chose a seat near the window.
[V1] Tôi vẫn còn nhớ cái ngày đầu tiên bước vào lớp học. Mùi sách mới thoang thoảng trong không khí, và tôi chọn ngồi gần cửa sổ.
[P2] My teacher had a loud laugh that made everyone relax.
[V2] Cô giáo tôi có tiếng cười rất to khiến cả lớp bỗng thấy thoải mái hơn.

Example of WRONG format (never do this):
[P1] I love school. Tôi yêu trường học. (WRONG — mixed languages in one marker)

IMPORTANT — reasoning models only: Do NOT output any planning, thinking, or notes before the essay. Start your response with [P1] immediately. No preamble, no "let's", no "we need to", no reasoning — just the essay paragraphs in the exact format above.

Now output the essay for topic "${tp}":
[P1]

TRANSLATION RULES for [V1]–[V${paraCount}]:
- Translate MEANING, not words — use natural Vietnamese equivalents, not word-for-word mapping
- Match tone: humorous stays humorous, formal stays formal, emotional stays emotional
- Use Vietnamese collocations and expressions — avoid literal translations that sound unnatural
- Example: "has a big smile" → "có nụ cười tươi" (not "có một nụ cười lớn"); "broke my heart" → "khiến tôi đau lòng" (not "phá vỡ trái tim tôi")

Output the essay now:
[P1]`;
    }

    function parseSampleResponse(raw) {
      const clean = String(raw || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<\/?think>/gi, '')
        .replace(/```[\w]*\n?/g, '').replace(/```/g, '')
        .trim();

      console.info('[sample] raw response:', clean.slice(0, 400));

      const lines = clean.split('\n');
      const paras = [];
      let cur = null;
      let foundFirst = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // New format: [P1], [P2], ... and [V1], [V2], ...
        const pMatch = trimmed.match(/^\[P\d+\]\s*(.*)/i);
        const vMatch = trimmed.match(/^\[V\d+\]\s*(.*)/i);
        // Old format: PARA:, VI:
        const isPara = /^PARA\s*:/i.test(trimmed);
        const isVi = /^VI\s*:/i.test(trimmed);

        if (pMatch || isPara) {
          foundFirst = true;
          if (cur && cur.en) paras.push(cur);
          const text = pMatch ? pMatch[1].trim() : trimmed.replace(/^PARA\s*:\s*/i, '').trim();
          cur = { en: text, vi: '' };
        } else if ((vMatch || isVi) && cur) {
          const text = vMatch ? vMatch[1].trim() : trimmed.replace(/^VI\s*:\s*/i, '').trim();
          if (text) cur.vi = text;
        } else if (foundFirst && cur && trimmed) {
          // continuation line — append to current en or vi
          if (cur.vi) cur.vi += ' ' + trimmed;
          else cur.en += ' ' + trimmed;
        }
      }
      if (cur && cur.en) paras.push(cur);

      // Fallback: blank-line split if no markers found at all
      if (!paras.length && clean.length > 20) {
        const blocks = clean.split(/\n{2,}/).map(b => b.trim()).filter(b => b.length > 20);
        for (const block of blocks) {
          if (/^(paragraph|intro|body|conclusion|we need|total|count|so |now |let |each |\[P|\[V)/i.test(block)) continue;
          paras.push({ en: block.replace(/\n/g, ' '), vi: '' });
        }
      }

      // Filter out reasoning/planning lines that gpt-oss reasoning models leak
      const planningPattern = /^(need to|let'?s |choose |concrete |opinion:|write from|must not|sentence \d|good\.|words?\.|so |now |we |this |that |for |the essay|i will|i'll|step \d|\d+ words?\.?$|also must|topic:|we need|must decide|decide |pick |but |or "|but we|e\.g\.,)/i;
      return paras.filter(p =>
        p.en && p.en.length > 15 &&
        !/^\[.*\]$/.test(p.en.trim()) &&
        !planningPattern.test(p.en.trim())
      );
    }
    function renderSampleHtml(paras, showVi) {
      if (!paras || !paras.length) return '<p style="color:var(--muted)">—</p>';
      const labels = uiLang === 'en'
        ? ['Introduction', 'Body', 'Body', 'Body', 'Conclusion']
        : ['Mở bài', 'Thân bài 1', 'Thân bài 2', 'Thân bài 3', 'Kết bài'];
      const lastIdx = paras.length - 1;

      return paras.map((p, i) => {
        const label = i === 0 ? labels[0] : i === lastIdx ? labels[4] : (labels[i] || labels[1]);
        const viHtml = p.vi ? `<div class="sample-vi${showVi ? '' : ' hidden'}">${escHtml(p.vi)}</div>` : '';
        return `<div class="sample-para">
  <div class="sample-para-head">
    <span class="sample-label">${escHtml(label)}</span>
    <button class="sample-ins ol-ins" data-en="${escHtml(p.en)}" title="${uiLang === 'en' ? 'Insert into editor' : 'Chèn vào bài'}">
      <i class="bi bi-plus-circle"></i> ${uiLang === 'en' ? 'Use' : 'Dùng đoạn này'}
    </button>
  </div>
  <p class="sample-en">${escHtml(p.en)}</p>
  ${viHtml}
</div>`;
      }).join('');
    }

    function showSamplePanel(paras) {
      const vi = uiLang !== 'en';
      let showVi = false;

      const wrap = document.createElement('div');
      wrap.className = 'sample-wrap';

      // Toggle VI button
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'sample-toggle';
      toggleBtn.innerHTML = `<i class="bi bi-translate"></i> ${vi ? 'Xem dịch' : 'Show translation'}`;
      toggleBtn.onclick = () => {
        showVi = !showVi;
        wrap.querySelectorAll('.sample-vi').forEach(el => el.classList.toggle('hidden', !showVi));
        toggleBtn.innerHTML = `<i class="bi bi-translate"></i> ${showVi ? (vi ? 'Ẩn dịch' : 'Hide translation') : (vi ? 'Xem dịch' : 'Show translation')}`;
      };

      wrap.innerHTML = renderSampleHtml(paras, false);

      // Insert button handlers
      wrap.querySelectorAll('.sample-ins').forEach(btn => {
        btn.addEventListener('click', () => {
          const text = btn.getAttribute('data-en');
          const l = editor.innerText.trimEnd();
          const sep = l ? ((/[.!?]$/.test(l) ? ' ' : '. ')) : '';
          insertAt(sep + text);
          editor.dispatchEvent(new Event('input'));
          if (typeof writingSource !== 'undefined') writingSource = 'sample';
          toast(uiLang === 'en' ? 'Inserted.' : 'Đã chèn.', 's');
        });
      });

      const pContent = document.getElementById('pContent');
      pContent.innerHTML = '';
      pContent.appendChild(toggleBtn);
      pContent.appendChild(wrap);
      document.getElementById('pCards').style.display = 'none';
      document.getElementById('lbar').classList.add('hidden');
      document.getElementById('resultPanel').classList.add('open');
      document.getElementById('editorPane').classList.add('shifted');
      document.getElementById('panelTitle').textContent = uiLang === 'en' ? 'Sample Essay' : 'Bài Mẫu';
      setCooldown('btn-outline');
    }

    // Check if cached paras are valid (not placeholder or reasoning model output)
    function isSampleValid(paras) {
      if (!Array.isArray(paras) || !paras.length) return false;
      return paras.every(p => {
        if (!p || !p.en || p.en.length < 15) return false;
        const en = p.en.trim();
        if (/^\[.*\]$/.test(en)) return false;
        // Reasoning model artifacts: "Count: word1 word2...", "Paragraph3 sentence1:"
        if (/Count:\s*\w+\d*\s+\w+\d*/i.test(en)) return false;
        if (/^Paragraph\d+\s+sentence\d+/i.test(en)) return false;
        if (/^Sentence\d+:/i.test(en)) return false;
        return true;
      });
    }

    // Purge all sample localStorage entries (call once to clear bad cached data)
    function purgeSampleCache() {
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(SAMPLE_LS_PREFIX));
        keys.forEach(k => localStorage.removeItem(k));
      } catch (_) {}
    }

    async function callSample() {
      const tp = topic();
      if (!tp) return toast(uiLang === 'en' ? 'Enter a topic first.' : 'Nhập chủ đề trước.');
      if (!await guardTopic('btn-outline')) return;

      const { lvl, tone, aud } = sampleKeys();
      const normTp = sampleNormTopic(tp);
      const lang = uiLang === 'en' ? 'en' : 'vi';
      const cacheKey = `${normTp}|${lvl}|${tone}|${aud}|${lang}`;

      // 1. Doc-level cache — validate before using
      const d = getDoc(currentId);
      if (d && d.sample && d.sampleKey === cacheKey && isSampleValid(d.sample)) {
        showSamplePanel(d.sample);
        return;
      }
      // 2. localStorage cache — validate before using
      const lsCached = sampleLsGet(cacheKey);
      if (lsCached && isSampleValid(lsCached)) {
        showSamplePanel(lsCached);
        if (d) { d.sample = lsCached; d.sampleKey = cacheKey; saveDocs(); }
        return;
      }
      // Clear any invalid cache
      if (d && d.sampleKey === cacheKey) { delete d.sample; delete d.sampleKey; saveDocs(); }
      try { localStorage.removeItem(SAMPLE_LS_PREFIX + cacheKey); } catch (_) {}

      // maxTokens scales with paraCount: A=4 paras, B=5 paras, C=6 paras
      const maxTokens = lvl === 'A' ? 1000 : lvl === 'C' ? 1800 : 1300;

      // Prefer non-reasoning models — gpt-oss thinks out loud and leaks planning text into output
      // Put gpt-oss last so they're only used when all others are unavailable
      const nonReasoning = typeof MODEL_CHAIN !== 'undefined'
        ? MODEL_CHAIN.filter(m => !m.includes('gpt-oss'))
        : [];
      const reasoning = typeof MODEL_CHAIN !== 'undefined'
        ? MODEL_CHAIN.filter(m => m.includes('gpt-oss'))
        : [];
      const sampleModels = nonReasoning.length
        ? [...nonReasoning, ...reasoning]
        : null; // null = use full MODEL_CHAIN (all gpt-oss)

      setBusy('btn-outline', true, true, uiLang === 'en' ? 'Sample Essay' : 'Bài Mẫu');

      const raw = await callAI(buildSamplePrompt(tp, lvl, tone, aud), 'btn-outline', true, true, maxTokens, null, sampleModels);
      setBusy('btn-outline', false, false);

      if (!raw) {
        const outage = aiOutageInfo();
        const msg = outage
          ? (uiLang === 'en' ? `AI is busy. Try again in ~${outage.minutes} min.` : `AI đang bận. Thử lại sau ~${outage.minutes} phút.`)
          : (uiLang === 'en' ? 'Could not generate sample. Please try again.' : 'Chưa tạo được bài mẫu. Vui lòng thử lại.');
        document.getElementById('pContent').innerHTML = `<p style="color:var(--muted);font-size:.85rem">${escHtml(msg)}</p>`;
        return;
      }

      const paras = parseSampleResponse(raw);
      if (!paras.length) {
        // clear any bad cache entry so next attempt re-fetches
        sampleLsSet(cacheKey, null);
        try { localStorage.removeItem(SAMPLE_LS_PREFIX + cacheKey); } catch (_) {}
        document.getElementById('pContent').innerHTML = `<p style="color:var(--muted);font-size:.85rem">${uiLang === 'en' ? 'Could not parse response. Please try again.' : 'Lỗi định dạng. Vui lòng thử lại.'}</p>`;
        return;
      }

      // Cache and display
      sampleLsSet(cacheKey, paras);
      if (d) { d.sample = paras; d.sampleKey = cacheKey; saveDocs(); }
      showSamplePanel(paras);
    }

    // Expose for onclick in HTML
    window.callSample = callSample;

    // One-time purge of stale sample cache (old prefix + doc-level)
    purgeSampleCache();
    if (typeof docs !== 'undefined') {
      docs.forEach(d => { delete d.sample; delete d.sampleKey; });
      if (typeof saveDocs === 'function') saveDocs();
    }
