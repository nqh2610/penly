    // ── OUTLINE: plan first (best model), then every part in parallel (fast model), shown as each one arrives ──
    const OUTLINE_LEVELS = {
      A: {
        code: 'A1–A2',
        struggle: 'afraid of not knowing enough words or grammar, and frozen by a blank page',
        topicRule: 'ALWAYS write about the user\'s OWN life. A general topic such as "family" means "my family"; "hobby" means "my hobby". Every option must be something the user can answer from their own memory with everyday words (people, things they do, how they feel).',
        modelRule: 'English: sentences of 5–9 words, simple present only, the 1000 most common words. Guidance text: the simplest everyday words, very short sentences, NO grammar jargon. Describe each part by what the user will TALK ABOUT (e.g. "Giới thiệu một người trong nhà"), never by essay terms.'
      },
      B: {
        code: 'B1–B2',
        struggle: 'ideas feel thin, sentences repeat the same pattern, and paragraphs do not connect',
        topicRule: 'If the topic is a general noun or an open question, choose the angle that matches the tone (personal story, opinion, argument) and keep a personal anchor the user can supply from their own experience.',
        modelRule: 'English: sentences of 10–18 words, natural and varied, with a connector where it fits. Guidance text: clear and friendly; explain any writing term in a few plain words.'
      },
      C: {
        code: 'C1–C2',
        struggle: 'getting past the obvious points, finding an original angle, and analysing instead of just describing',
        topicRule: 'Push beyond the obvious: offer genuinely distinct angles, including at least one less common one, and keep a personal anchor or concrete case the user can supply.',
        modelRule: 'English: sentences of 18–30 words, sophisticated structure and precise collocations, like strong published prose. Guidance text: precise and respectful of the user\'s ability; technical terms are fine.'
      }
    };

    const OUTLINE_TONES = {
      storytelling: `Narrative arc. Body paragraphs are STORY MOMENTS (opening scene → what happened → turning point → what I learned), not abstract reasons. "Developing an idea" means adding action, sensory detail and feeling. Use time connectors (one day, suddenly, in the end).`,
      casual: `Friendly personal talk. Body paragraphs are personal reasons or experiences told like chatting to someone. Ideas grow from "what happened to me / what I do". Contractions and direct address are fine.`,
      humorous: `Each body paragraph is one FUNNY ANGLE (exaggeration, surprise, self-mockery, unexpected comparison). For each, show where the setup goes and where the punchline goes. Still keep a clear idea underneath.`,
      professional: `Formal argument. Body paragraphs follow claim → reason → evidence → implication. Impersonal voice, avoid "I" and slang. Ideas grow from facts, data, institutions and cause-effect logic.`,
      persuasive: `Persuasive argument. Choose a clear position, order the reasons from strongest to supporting, include one counter-argument that the user answers, and end with a call to action. Ideas grow from reason → proof → rebuttal.`,
      emotional: `Emotional, personal writing. Body paragraphs are meaningful MOMENTS or feelings. Ideas grow by showing instead of telling: what I saw, heard and felt, and why it mattered.`
    };

    const OUTLINE_AUDIENCES = {
      children: `The reader is a young child. Ideas must be concrete and easy to picture (animals, games, family, school). Very short sentences, simple words, a playful voice, maybe one question to the reader.`,
      friends: `The reader is a close friend or family member. Warm, direct, personal. Examples come from shared everyday life and real stories. Informal expressions are welcome.`,
      public: `The reader is the general public. Clear, polite and neutral. Use everyday examples most people know and explain any special word.`,
      pro: `The reader is a teacher or professional. Precise, well-organised, formal. Examples should come from evidence, research, institutions or real cases. No slang.`
    };

    function outlineKeys() {
      const lvl = (lvlSel.value.match(/^[ABC]/) || ['B'])[0];
      const toneWord = (toneSel.value.split(/[\s—]/)[0] || 'casual').toLowerCase();
      const tone = OUTLINE_TONES[toneWord] ? toneWord : 'casual';
      const a = audSel.value;
      const aud = /children/i.test(a) ? 'children'
        : /friends|family/i.test(a) ? 'friends'
          : /teachers|professionals/i.test(a) ? 'pro' : 'public';
      return { lvl, tone, aud };
    }

    const OUTLINE_PLAN = {
      A: { parts: ['intro', 'body', 'body', 'concl'], sentences: { intro: 1, body: 3, concl: 1 }, maxFixed: { intro: 5, body: 10, concl: 5 }, tips: 2, minutes: '10–15', partTokens: 750 },
      B: { parts: ['intro', 'body', 'body', 'body', 'concl'], sentences: { intro: 3, body: 4, concl: 2 }, maxFixed: { intro: 10, body: 16, concl: 8 }, tips: 3, minutes: '25–35', partTokens: 1050 },
      C: { parts: ['intro', 'body', 'body', 'body', 'concl'], sentences: {}, maxFixed: {}, tips: 3, minutes: '40–60', partTokens: 1050 }
    };
    const OUTLINE_PLAN_TOKENS = 1000;
    // Parts are small and mostly mechanical: a fast model with a large per-minute allowance lets them run in parallel
    const OUTLINE_FAST_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
    const outlineModels = () => [OUTLINE_FAST_MODEL, ...(typeof MODEL_CHAIN !== 'undefined' ? MODEL_CHAIN : []).filter(m => m !== OUTLINE_FAST_MODEL)];

    const OUTLINE_TXT = {
      vi: {
        start: 'Trước khi bắt đầu', roadmap: 'Bản đồ bài viết', intro: 'Mở bài', body: 'Thân bài', concl: 'Kết bài', check: 'Tự kiểm tra',
        moves: 'Chọn nước đi', extra: 'Cụm từ nên có thêm', tip: 'Mẹo nhỏ',
        countLine: (n, m) => `Bạn sẽ viết **${n} câu** trong khoảng **${m} phút**.`,
        timeLine: m => `Thời gian viết: khoảng **${m} phút**.`,
        optNote: 'Các lựa chọn chỉ là gợi ý. Nếu chuyện thật của bạn khác, cứ giữ khung câu và điền chi tiết của riêng bạn.',
        vocabNote: 'Cần thêm từ về chủ đề này? Bấm nút “Từ vựng”.',
        readAll: 'Các ví dụ dưới đây, đọc từ trên xuống, tạo thành một bài hoàn chỉnh.',
        checkDefault: ['Mỗi câu mình viết có thật sự nói về chuyện của mình không?', 'Mình đã thay các gợi ý bằng chi tiết thật của mình chưa?', 'Đọc to cả bài một lần: có chỗ nào đọc vấp không?'],
        closingDefault: 'Giờ hãy viết câu đầu tiên nhé, bạn làm được!',
        fail: 'Chưa lấy được dàn ý. Máy chủ AI đang quá tải hoặc tạm hết lượt. Bạn đợi 1–2 phút rồi thử lại nhé.',
        quota: m => `Hạn mức AI đã dùng hết nên chưa tạo được dàn ý. Bạn thử lại sau khoảng ${m >= 90 ? Math.round(m / 60) + ' giờ' : m + ' phút'} nhé (các chức năng khác cũng dùng chung hạn mức này).`,
        retry: 'Thử lại', writing: 'Đang viết phần này…', writingSlow: 'AI chính đang bận nên hơi chậm, bạn đợi một chút nhé…', partFail: 'Chưa tạo được phần này.',
        preview: 'Câu của bạn', insert: 'Chèn vào bài', ownHint: '✏️ Muốn nói điều khác? Cứ giữ khung câu và gõ chuyện của riêng bạn vào bài.'
      },
      en: {
        start: 'Before you start', roadmap: 'Your roadmap', intro: 'Introduction', body: 'Body', concl: 'Conclusion', check: 'Final check',
        moves: 'Choose your move', extra: 'More phrases to use', tip: 'Tip',
        countLine: (n, m) => `You will write **${n} sentences** in about **${m} minutes**.`,
        timeLine: m => `Writing time: about **${m} minutes**.`,
        optNote: 'The options are only suggestions. If your real story is different, keep the sentence frame and fill it with your own details.',
        vocabNote: 'Need more words about this topic? Press the “Vocabulary” button.',
        readAll: 'The examples below, read from top to bottom, make one complete sample.',
        checkDefault: ['Is every sentence really about my own story?', 'Did I replace the suggestions with my own real details?', 'Read the whole text aloud once: does anything sound awkward?'],
        closingDefault: 'Now write your first sentence. You can do this!',
        fail: 'Could not get the outline. The AI service is busy or temporarily out of quota. Please wait 1–2 minutes and try again.',
        quota: m => `The AI quota has run out, so the outline could not be created. Please try again in about ${m >= 90 ? Math.round(m / 60) + ' hours' : m + ' minutes'} (other features share this quota).`,
        retry: 'Try again', writing: 'Writing this part…', writingSlow: 'The main AI is busy, so this takes a little longer…', partFail: 'This part could not be created.',
        preview: 'Your sentences', insert: 'Insert into text', ownHint: '✏️ Want to say something else? Keep the frame and type your own story into the text.'
      }
    };

    // One part per level in the plain-text answer format (title and purpose come from the plan)
    const OUTLINE_SAMPLE = {
      A: `TALK: Nghĩ đến lúc bạn vui nhất trong năm. Lúc đó trời thế nào, bạn đang làm gì? Chỉ cần chọn 3 mảnh ghép là có ngay 3 câu.
PATTERN: My favourite season is {A}. It is {B}. I like to {C} in this season.
ASK A: Mùa nào?
OPTIONS A: mùa xuân = spring | mùa hè = summer | mùa thu = autumn
ASK B: Trời thế nào?
OPTIONS B: ấm áp = warm | mát mẻ = cool | nóng = hot
ASK C: Bạn thích làm gì?
OPTIONS C: đi dạo = walk outside | chơi với bạn = play with friends | uống trà nóng = drink hot tea
EXTRA: none
TIP: Sau like to ta dùng động từ nguyên mẫu: like to walk, đừng viết like to walking.`,
      B: `TALK: Đây là đoạn bạn giải thích trái tim. Một chi tiết cụ thể (một mùi, một âm thanh, một buổi chiều) thuyết phục hơn mười tính từ.
PATTERN: The main reason I love autumn is that {A}. For example, {B}. This is why {C}.
ASK A: Lý do chính của bạn?
OPTIONS A: mọi thứ chậm lại = everything seems to slow down | có thời gian suy nghĩ = I finally have time to think | không khí dễ chịu = the air feels fresh
ASK B: Một chi tiết cụ thể?
OPTIONS B: đường về nhà thơm mùi hạt dẻ = the streets smell like roasted chestnuts on my way home | lá đổi màu trà = the leaves turn the colour of tea
ASK C: Điều đó nghĩa là gì với bạn?
OPTIONS C: mùa thu như nút tạm dừng = autumn feels like a pause button for me | mùa thu cho tôi thở = autumn gives me room to breathe
EXTRA: thư thả = at a relaxed pace | lấy lại năng lượng = recharge | thật sự = genuinely
TIP: none`,
      C: `TALK: Bạn đã nêu quan điểm. Giờ hãy thừa nhận phần đúng của phía bên kia, rồi cho thấy vì sao bạn vẫn đứng vững.
MOVE: nhượng bộ rồi phản biện
OPTION: Họ cho rằng đó là chiều chuộng bản thân => Admittedly, critics may call it indulgent. Yet this objection overlooks what it protects: the quiet that makes reflection possible.
OPTION: Họ cho rằng thiếu thực tế => To some extent, it is impractical. That said, practicality is a poor measure of what keeps people steady.
OPTION: Họ cho rằng lãng phí thời gian => It is easy to dismiss it as wasted time. Yet the hours it takes are precisely what the rest of the week depends on.
EXTRA: to some extent | tuy vậy = that said | is a poor measure of
TIP: Nói họ đúng ở đâu trước, rồi mới chỉ ra họ chưa nhìn thấy gì.`
    };

    const OL_PREFIX = '@@ol1:';
    const OL_S = '\u0001', OL_E = '\u0002';
    let _olState = null;
    let _olRun = 0;
    const _vnChars = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
    const _normTxt = x => String(x || '').toLowerCase().replace(/[^\p{L}]/gu, '');
    const _countSentences = x => String(x || '').split(/[.!?]+(?:\s|$)/).filter(z => z.trim()).length;
    const _esc = x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _mdBold = x => x.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const _capMarked = x => x.replace(/(^|[.!?]\s+)([\u0001]*)([a-z])/g, (m, a, b, c) => a + b + c.toUpperCase());

    function olFill(p, picks) {
      return _capMarked(p.pattern.replace(/\{([A-C])\}/g, (m, id) => {
        const s = p.slots.find(z => z.id === id);
        const o = s && (s.options[picks[id] || 0] || s.options[0]);
        return OL_S + (o ? o.en : '…') + OL_E;
      }));
    }
    const olPlain = (p, picks) => olFill(p, picks).replace(/[\u0001\u0002]/g, '');
    const olPreviewHtml = (p, picks) => _esc(olFill(p, picks)).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');

    // ── plain-text answers ──
    // The AI answers with "KEY: value" lines. Small models follow this far more reliably than JSON
    // (no quotes to escape, nothing to close), and a cut-off answer only loses its last lines.
    const OL_KEYS = /^(TALK|PATTERN|EXTRA|TIP|MOVE|OPTION|KIND|OPENING|STORYLINE|CHECK|CLOSING|(?:ASK|OPTIONS) [A-C]|PART \d+ (?:TITLE|PURPOSE|BEAT))$/;
    const olIsNone = v => /^(none|n\/a|không có|không|-+|\[\])\.?$/i.test(String(v).trim());

    function olParse(text) {
      const clean = strip(String(text || '')).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '');
      const out = [];
      clean.split('\n').forEach(raw => {
        const line = raw.replace(/^[\s>*•\-–#]+/, '').replace(/\*\*/g, '').trim();
        if (!line) return;
        const m = line.match(/^([A-Za-z][A-Za-z0-9 ]{1,20}?)\s*:\s*(.*)$/);
        const key = m && m[1].toUpperCase().replace(/\s+/g, ' ').trim();
        if (key && OL_KEYS.test(key)) out.push({ key, val: m[2].trim() });
        else if (out.length) out[out.length - 1].val += ' ' + line;
      });
      return out;
    }

    // "meaning = english | meaning = english"; without "=" the item is English only
    const olPairs = val => olIsNone(val) ? [] : String(val).split('|').map(x => x.trim()).filter(Boolean).map(x => {
      const [g, ...r] = x.split(/\s*=\s*/);
      return r.length ? { gloss: g.trim(), en: r.join('=').trim() } : { gloss: '', en: x };
    });

    // One part → { talk, pattern, slots, move, moves, extra, tip }, or null when nothing usable was found
    function parseOutlinePart(text) {
      const p = { talk: '', pattern: '', slots: [], move: '', moves: [], extra: [], tip: '' };
      const slots = {};
      olParse(text).forEach(({ key, val }) => {
        if (key === 'TALK') p.talk = val;
        else if (key === 'PATTERN') p.pattern = val;
        else if (key === 'EXTRA') p.extra = olPairs(val);
        else if (key === 'TIP') p.tip = olIsNone(val) ? '' : val;
        else if (key === 'MOVE') p.move = olIsNone(val) ? '' : val;
        else if (key === 'OPTION') {
          const [angle, ...r] = val.split(/\s*=>\s*/);
          p.moves.push(r.length ? { angle: angle.trim(), text: r.join(' => ').trim() } : { angle: '', text: val });
        } else {
          const m = key.match(/^(ASK|OPTIONS) ([A-C])$/);
          if (m) {
            const sl = slots[m[2]] || (slots[m[2]] = { id: m[2], ask: '', options: [] });
            if (m[1] === 'ASK') sl.ask = val; else sl.options = olPairs(val);
          }
        }
      });
      p.slots = Object.keys(slots).sort().map(k => slots[k]);
      return p.talk || p.pattern || p.moves.length ? p : null;
    }

    // The plan → { kind, opening, storyline, parts: [{ title, purpose, beat }], checklist, closing }, or null
    function parseOutlinePlan(text, n) {
      const plan = { kind: '', opening: '', storyline: '', closing: '', checklist: [], parts: Array.from({ length: n }, () => ({ title: '', purpose: '', beat: '' })) };
      olParse(text).forEach(({ key, val }) => {
        if (key === 'KIND') plan.kind = val;
        else if (key === 'OPENING') plan.opening = val;
        else if (key === 'STORYLINE') plan.storyline = val;
        else if (key === 'CLOSING') plan.closing = val;
        else if (key === 'CHECK') plan.checklist.push(val);
        else {
          const m = key.match(/^PART (\d+) (TITLE|PURPOSE|BEAT)$/);
          if (m && plan.parts[+m[1] - 1]) plan.parts[+m[1] - 1][m[2].toLowerCase()] = olIsNone(val) ? '' : val;
        }
      });
      return plan.kind && plan.opening ? plan : null;
    }

    // One answer holding every part, each introduced by a "=== PART n ===" line → array of n text chunks
    function splitOutlineParts(text, n) {
      const t = strip(String(text || '')).replace(/<think>[\s\S]*?<\/think>/gi, '');
      const pieces = t.split(/^[ \t=#*\-]*PART[ \t]*(\d+)[ \t=#*\-:]*$/gim);
      const out = Array(n).fill('');
      for (let k = 1; k < pieces.length; k += 2) {
        const i = +pieces[k] - 1;
        if (i >= 0 && i < n) out[i] = pieces[k + 1];
      }
      return out;
    }

    // Drops unusable options (no real translation, Vietnamese inside English, duplicates) instead of rejecting the whole part
    function sanitizeOutlinePart(p, vi, lvl) {
      const needGloss = lvl !== 'C';
      const maxWords = { A: 6, B: 14 }[lvl] || 0;
      const words = x => x.trim().split(/\s+/).length;
      const ok = o => o && typeof o.en === 'string' && o.en.trim() && !_vnChars.test(o.en)
        && (!needGloss || (typeof o.gloss === 'string' && o.gloss.trim() && !(vi && _normTxt(o.gloss) === _normTxt(o.en))));
      const clean = (arr, limit) => {
        const seen = new Set();
        const base = (Array.isArray(arr) ? arr : []).filter(ok).filter(o => {
          const k = _normTxt(o.en);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }).map(o => ({ gloss: String(o.gloss || '').trim(), en: o.en.trim() }));
        const short = limit ? base.filter(o => words(o.en) <= limit) : base;
        return short.length >= 2 ? short : base;
      };
      if (Array.isArray(p.slots)) p.slots = p.slots.map(s => ({ id: String((s && s.id) || '').toUpperCase(), ask: String((s && s.ask) || '').trim(), options: clean(s && s.options, maxWords) }));
      if (Array.isArray(p.moves)) p.moves = p.moves.filter(m => m && typeof m.text === 'string' && m.text.trim() && !_vnChars.test(m.text)).map(m => ({ angle: String(m.angle || '').trim(), text: m.text.trim() }));
      p.extra = clean(p.extra, 0).slice(0, 4);
      p.tip = typeof p.tip === 'string' && !/[{}\[\]]|slot|placeholder/i.test(p.tip) ? p.tip.trim() : '';
      return p;
    }

    // Only structural problems are reported: a report costs one more AI call, so style rules live in the prompt only
    function validateOutlinePart(p, type, lvl) {
      const bad = [];
      if (!p || typeof p !== 'object') return ['no usable answer was found'];
      if (String(p.talk || '').trim().length < 10) bad.push('TALK is missing or too short');
      if (lvl === 'C') {
        if (!Array.isArray(p.moves) || p.moves.length < 2) bad.push('this part needs 3 or 4 OPTION lines, each "description => complete English sentences"');
      } else {
        const pattern = String(p.pattern || '');
        const ids = [...new Set([...pattern.matchAll(/\{([A-C])\}/g)].map(m => m[1]))];
        const slots = Array.isArray(p.slots) ? p.slots : [];
        if (!ids.length || ids.length > 3) bad.push('PATTERN must contain 1 to 3 different slots written {A} {B} {C}');
        if (ids.slice().sort().join() !== slots.map(s => s.id).sort().join()) bad.push('every slot used in PATTERN needs its own ASK and OPTIONS lines (and no others)');
        slots.forEach(s => {
          if (s.options.length < 2) bad.push(`OPTIONS ${s.id} needs at least 3 valid options written "meaning = english" (short English fragment on the right, and on the left a real translation in the guidance language, never the same word)`);
        });
      }
      return bad;
    }

    // ── prompts ──
    function outlineuserBlock(c) {
      const { tp, tone, aud, L, lang } = c;
      return `user
- Topic: "${tp}"
- Level: ${L.code}. users at this level are often: ${L.struggle}.
- Tone / style: ${toneSel.value}
- Audience (the reader): ${audSel.value}
- Guidance language: ${lang}. Everything you write is in ${lang}, EXCEPT the English text the user will write (PATTERN, the English side of every option, BEAT, STORYLINE, and the text of OPTION lines).

CONTENT DIRECTION
${L.topicRule}
Level: ${L.modelRule}
Tone: ${OUTLINE_TONES[tone]}
Audience: ${OUTLINE_AUDIENCES[aud]}
Every idea, word and example must be specific to "${tp}". Never assume facts about the user's life (a brother, a pet, a trip): offer them as options.`;
    }

    function outlineSlotRules(c, type) {
      const { lvl, L, lang } = c;
      const plan = OUTLINE_PLAN[lvl];
      if (lvl === 'C') {
        return `MOVES (this level has no slots)
- MOVE: the rhetorical move at work, in a few words.
- 3 or 4 DIFFERENT OPTION lines, each "description of the line of argument in ${lang} => 1–2 polished English sentences of 18–30 words".
- Do not write PATTERN, ASK or OPTIONS lines.`;
      }
      return `SLOT RULES
- PATTERN: English with slots written {A} {B} {C} (1 to 3 slots), about ${plan.sentences[type]} sentence(s).
- Fixed text outside slots: grammar words only (a, the, in, at, my, we, I, is, to, and, because…), at most ${plan.maxFixed[type]} words. EVERY content word (noun, verb, adjective, place, time) must be inside a slot.
- A slot is ONE complete unit. NEVER put a verb in one slot and its object in another: use a full predicate in one slot ("cooks dinner", "plays soccer"). If a subject slot exists, all its options are singular (mother, father, brother), so every verb option agrees. The same slot may appear twice in the pattern.
- Every slot used in the PATTERN has an "ASK X:" line (a short question in ${lang}) and an "OPTIONS X:" line with 3 or 4 options separated by " | ", each written "meaning in ${lang} = english".
- Options are SHORT fragments (at most ${lvl === 'A' ? 5 : 12} words), never whole sentences. The meaning on the left is a REAL translation in ${lang} (WRONG: "small = small"; RIGHT: ${lang === 'Vietnamese' ? '"nhỏ = small"' : '"not big = small"'}). The English on the right is in the exact form the pattern needs, and its words must suit ${L.code}.
- All options of a slot have the same grammatical form, and slots never depend on each other: EVERY combination must be correct and sensible. Mentally put EVERY option into the pattern and read it aloud.
- All sentences of the part share ONE time frame (present habits, or past simple for a story).`;
    }

    const OUTLINE_PART_FORMAT = lvl => lvl === 'C'
      ? `TALK: <2-3 short sentences on one line>
MOVE: <name of the move>
OPTION: <description> => <English sentences>
OPTION: <description> => <English sentences>
OPTION: <description> => <English sentences>
EXTRA: <english> | <meaning> = <english> | <english>      (or: EXTRA: none)
TIP: <one short sentence>      (or: TIP: none)`
      : `TALK: <2-3 short sentences on one line>
PATTERN: <English pattern with {A} {B} {C}>
ASK A: <question>
OPTIONS A: <meaning> = <english> | <meaning> = <english> | <meaning> = <english>
ASK B: <question>
OPTIONS B: <meaning> = <english> | <meaning> = <english> | <meaning> = <english>
EXTRA: <meaning> = <english> | <meaning> = <english>      (or: EXTRA: none)
TIP: <one short sentence>      (or: TIP: none)`;

    function outlineExtraRule(lvl, type) {
      if (lvl === 'A' || type !== 'body') return 'EXTRA: none';
      return lvl === 'B'
        ? 'EXTRA: exactly 3 useful collocations or connectors NOT used in the options, each "meaning = english", separated by " | "'
        : 'EXTRA: 3 or 4 precise collocations or discourse markers NOT used in the options, separated by " | " (write "meaning = english" only for rare ones, otherwise just the English)';
    }

    function buildOutlinePlanPrompt(c) {
      const { lvl, lang } = c;
      const types = OUTLINE_PLAN[lvl].parts;
      const lines = types.map((t, i) => `PART ${i + 1} TITLE: <${t === 'body' ? 'short inviting title' : 'none'}>\nPART ${i + 1} PURPOSE: <...>\nPART ${i + 1} BEAT: <...>`).join('\n');
      return `You are a warm writing coach. Write the PLAN of a write-along guide for this user. Answer in plain text, one item per line, using exactly these keys. No JSON, no markdown, no extra text.

${outlineuserBlock(c)}

The guide has ${types.length} parts in exactly this order: ${types.map((t, i) => `${i + 1}. ${t}`).join(', ')}  (intro = introduction, body = body paragraph, concl = conclusion).

ANSWER FORMAT
KIND: <...>
OPENING: <...>
STORYLINE: <...>
${lines}
CHECK: <...>
CHECK: <...>
CHECK: <...>
CLOSING: <...>

RULES
- KIND: one plain line on what kind of writing this is${lvl === 'A' ? ' (never essay terms such as narrative, overview or thesis)' : ''}.
- OPENING: 3 sentences speaking to the user: name the exact feeling a user like them has about THIS topic and give one concrete reason this topic is easier or more interesting than it looks. No numbers, no generic praise.
- STORYLINE: ONE English sentence describing the thread of the sample text (who or what it is about, then what happens or what they do, then how the user feels), written as the user would.
- PART n TITLE: a short inviting title naming the KIND of moment, not fixed facts. It MUST be written in ${lang}${lang === 'Vietnamese' ? ' (for example "Một khoảnh khắc buổi sáng"), never in English' : ''}. Write "none" for intro and concl parts.
- PART n PURPOSE: what the user will talk about in this part, in plain words, written in ${lang}.
- PART n BEAT: what the sample (the first option of everything) says in this part, in English, at most 12 words. Together the beats tell the storyline.
- CHECK: 3 questions the user asks about THEIR OWN text. Never mention counts, slots, letters or rules.
- CLOSING: one warm sentence inviting the user to write the first sentence now.`;
    }

    function outlinePartList(lvl, parts) {
      const types = OUTLINE_PLAN[lvl].parts;
      return parts.map((p, i) => `${i + 1}. ${types[i]}${p.title ? ` – "${p.title}"` : ''}${p.beat ? ` – sample says: ${p.beat}` : ''}`).join('\n');
    }

    function buildOutlinePartPrompt(c, data, i) {
      const { lvl, L, lang } = c;
      const plan = OUTLINE_PLAN[lvl], type = plan.parts[i], part = data.parts[i];
      return `You are a warm writing coach writing ONE part of a write-along guide. Answer in plain text, one item per line, using exactly these keys. No JSON, no markdown, no extra text.

${outlineuserBlock(c)}

THE WHOLE GUIDE (so all parts fit together)
Storyline of the sample: ${data.storyline || 'a coherent small story or description'}
${outlinePartList(lvl, data.parts)}

YOU WRITE PART ${i + 1} of ${plan.parts.length}: ${type}${part.title ? ` – "${part.title}"` : ''}${part.purpose ? ` – ${part.purpose}` : ''}.
${part.beat ? `The FIRST option of each slot (or the first OPTION line) must say: ${part.beat}.` : ''}

ANSWER FORMAT
${OUTLINE_PART_FORMAT(lvl)}

RULES
- TALK: 2–3 human lines in ${lang}: what this part is for and one concrete thing to imagine so ideas come easily. It must describe exactly what the example built from the FIRST options does.
- TIP: "none" unless users at ${L.code} really make a mistake with THESE patterns; then one short sentence.
- ${outlineExtraRule(lvl, type)}

${outlineSlotRules(c, type)}

Example of ONE part (different topic, shows the format only; do NOT copy its content):
${OUTLINE_SAMPLE[lvl]}`;
    }

    // The same instructions as one part, for every part at once
    function buildOutlineAllPartsPrompt(c, data) {
      const { lvl, L, lang } = c;
      const plan = OUTLINE_PLAN[lvl], n = plan.parts.length;
      const list = data.parts.map((p, i) => `=== PART ${i + 1} ===  ${plan.parts[i]}${p.title ? ` – "${p.title}"` : ''}${p.purpose ? ` – ${p.purpose}` : ''}${p.beat ? ` – the FIRST option of each slot (or the first OPTION line) must say: ${p.beat}` : ''}`).join('\n');
      const sizes = lvl === 'C' ? '' : `\nPattern size: intro about ${plan.sentences.intro} sentence(s) with at most ${plan.maxFixed.intro} fixed words; body about ${plan.sentences.body} with at most ${plan.maxFixed.body}; conclusion about ${plan.sentences.concl} with at most ${plan.maxFixed.concl}.`;
      return `You are a warm writing coach writing ALL ${n} parts of a write-along guide. Answer in plain text. Start each part with a line "=== PART n ===" (n = 1 to ${n}), then that part's lines. Use exactly these keys. No JSON, no markdown, no extra text.

${outlineuserBlock(c)}

THE GUIDE
Storyline of the sample: ${data.storyline || 'a coherent small story or description'}
${list}

ANSWER FORMAT FOR EACH PART
${OUTLINE_PART_FORMAT(lvl)}

RULES
- TALK: 2–3 human lines in ${lang}: what the part is for and one concrete thing to imagine so ideas come easily. It must describe exactly what the example built from the FIRST options does.
- TIP: "none" unless users at ${L.code} really make a mistake with THESE patterns; then one short sentence. At most ${plan.tips} real tips in total.
- EXTRA: ${lvl === 'A' ? 'always none' : lvl === 'B' ? 'body parts only: exactly 3 useful collocations or connectors NOT used in the options, each "meaning = english", separated by " | "; none for intro and conclusion' : 'body parts only: 3 or 4 precise collocations or discourse markers NOT used in the options, separated by " | " ("meaning = english" only for rare ones, otherwise just the English); none for intro and conclusion'}.

${outlineSlotRules(c, 'body')}${sizes}

Example of ONE part (different topic, shows the format only; do NOT copy its content):
${OUTLINE_SAMPLE[lvl]}`;
    }

    // ── rendering ──
    const olIcon = (lvl, i) => {
      const types = OUTLINE_PLAN[lvl].parts;
      if (types[i] === 'intro') return '🚪';
      if (types[i] === 'concl') return '🏁';
      return ['🌱', '🌿', '🍃', '🌟'][types.slice(0, i).filter(x => x === 'body').length % 4];
    };
    const olName = (X, lvl, p, i) => {
      const type = OUTLINE_PLAN[lvl].parts[i];
      return type === 'intro' ? X.intro : type === 'concl' ? X.concl : (String(p.title || '').trim() || X.body);
    };
    const olStatus = p => p.status || (p.talk ? 'ready' : 'pending');

    function olPartBody(state, i) {
      const { lvl, vi, data } = state, p = data.parts[i];
      const X = OUTLINE_TXT[vi ? 'vi' : 'en'], type = OUTLINE_PLAN[lvl].parts[i];
      const st = olStatus(p);
      if (st === 'pending') return `<div class="ol-skel"><i></i><i></i><i></i></div><p class="ol-note">${_esc(state.slow ? X.writingSlow : X.writing)}</p>`;
      if (st === 'failed') return `<p class="ol-note">${_esc(X.partFail)}</p><button type="button" class="ol-ins ol-retry" data-i="${i}">${_esc(X.retry)}</button>`;
      let h = `<p class="ol-talk">${_esc(p.talk)}</p>`;
      if (lvl === 'C') {
        h += `<div class="ol-q">🧩 ${_esc(X.moves)}${p.move ? ` <small>(${_esc(p.move)})</small>` : ''}</div>`;
        p.moves.forEach(m => {
          h += `<div class="ol-move">${m.angle ? `<span class="ol-gl">${_esc(m.angle)}</span>` : ''}<span class="ol-en ol-move-t">${_esc(m.text)}</span><button type="button" class="ol-ins ol-ins-s">${_esc(X.insert)}</button></div>`;
        });
      } else {
        p.slots.forEach(s => {
          h += `<div class="ol-slot" data-id="${_esc(s.id)}"><div class="ol-q"><i>${_esc(s.id)}</i>${_esc(s.ask)}</div><div class="ol-opts">`;
          s.options.forEach((o, k) => {
            h += `<button type="button" class="ol-opt${k === 0 ? ' on' : ''}" data-k="${k}"><span class="ol-en">${_esc(o.en)}</span><span class="ol-gl">${_esc(o.gloss)}</span></button>`;
          });
          h += '</div></div>';
        });
        h += `<div class="ol-prev"><div class="ol-prev-l">${_esc(X.preview)}</div><div class="ol-prev-t">${olPreviewHtml(p, {})}</div><button type="button" class="ol-ins">${_esc(X.insert)}</button></div>`;
        h += `<p class="ol-own">${_esc(X.ownHint)}</p>`;
      }
      if (type === 'body' && Array.isArray(p.extra) && p.extra.length) {
        h += `<div class="ol-extra"><b>🧰 ${_esc(X.extra)}</b><div>${p.extra.map(o => `<span class="ol-chip">${_esc(o.en)}${o.gloss ? ` <small>${_esc(o.gloss)}</small>` : ''}</span>`).join('')}</div></div>`;
      }
      if (p.tip) h += `<div class="ol-tip">💬 <b>${_esc(X.tip)}:</b> ${_esc(p.tip)}</div>`;
      return h;
    }

    function olMetaHtml(state) {
      const { lvl, vi, data } = state, X = OUTLINE_TXT[vi ? 'vi' : 'en'], plan = OUTLINE_PLAN[lvl];
      if (!data.parts.every(p => olStatus(p) === 'ready')) return _mdBold(_esc(X.timeLine(plan.minutes)));
      const total = data.parts.reduce((n, p) => n + (lvl === 'C' ? _countSentences(p.moves[0].text) : _countSentences(olPlain(p, {}))), 0);
      return _mdBold(_esc(X.countLine(total, plan.minutes)));
    }

    function renderOutlineHtml(state) {
      const { lvl, vi, data } = state, X = OUTLINE_TXT[vi ? 'vi' : 'en'];
      let h = '<div class="ol">';
      h += `<h2>💌 ${_esc(X.start)}</h2><p class="ol-lead">${_esc(data.opening)}</p>`;
      h += `<p class="ol-meta">${olMetaHtml(state)}</p><p class="ol-note">${_esc(X.optNote)} ${_esc(X.vocabNote)}</p>`;
      h += `<h2>🗺️ ${_esc(X.roadmap)}</h2><p>${_esc(data.kind)}</p><ol class="ol-road">`;
      data.parts.forEach((p, i) => { h += `<li><b>${_esc(olName(X, lvl, p, i))}</b>${p.purpose ? `<span>${_esc(p.purpose)}</span>` : ''}</li>`; });
      h += `</ol><p class="ol-note">${_esc(X.readAll)}</p>`;
      data.parts.forEach((p, i) => {
        h += `<article class="ol-part" data-i="${i}"><div class="ol-part-h"><span class="ol-num">${i + 1}</span><h3>${olIcon(lvl, i)} ${_esc(olName(X, lvl, p, i))}</h3></div><div class="ol-part-body">${olPartBody(state, i)}</div></article>`;
      });
      let items = (Array.isArray(data.checklist) ? data.checklist : []).map(x => String(x).trim()).filter(x => x.length >= 8 && x.length <= 160 && !/[\d\[\]{}]/.test(x));
      if (items.length < 3) items = X.checkDefault;
      h += `<h2>☑️ ${_esc(X.check)}</h2><ul class="ol-check">${items.slice(0, 3).map(x => `<li><label><input type="checkbox"> <span>${_esc(x)}</span></label></li>`).join('')}</ul>`;
      const closing = String(data.closing || '').trim();
      h += `<p class="ol-lead">${_esc(closing.length >= 8 && closing.length <= 200 ? closing : X.closingDefault)}</p></div>`;
      return h;
    }

    function olUpdatePart(state, i) {
      if (_olState !== state) return;
      const root = document.getElementById('pContent');
      const body = root && root.querySelector(`.ol-part[data-i="${i}"] .ol-part-body`);
      if (body) body.innerHTML = olPartBody(state, i);
      const meta = root && root.querySelector('.ol-meta');
      if (meta) meta.innerHTML = olMetaHtml(state);
    }

    function showOutlineState(state) {
      _olState = state;
      document.getElementById('pCards').style.display = 'none';
      openPanel(t('panel-outline'), '', null);
      document.getElementById('pContent').innerHTML = renderOutlineHtml(state);
    }

    function showOutline(stored) {
      let obj = null;
      try { obj = JSON.parse(String(stored).slice(OL_PREFIX.length)); } catch { obj = null; }
      if (obj && obj.data) showOutlineState({ lvl: obj.lvl, vi: obj.vi, data: obj.data, c: obj.c }); // Truyền lại c
    }

    function showOutlineError(vi, outage) {
      const gate = document.getElementById('licenseGate');
      if (gate && !gate.classList.contains('hidden')) return;
      const X = OUTLINE_TXT[vi ? 'vi' : 'en'];
      _olState = null;
      document.getElementById('pCards').style.display = 'none';
      openPanel(t('panel-outline'), '', null);
      document.getElementById('pContent').innerHTML = `<div class="ol"><p class="ol-lead">${_esc(outage ? X.quota(outage.minutes) : X.fail)}</p><button type="button" class="ol-ins" onclick="callOutline()">${_esc(X.retry)}</button></div>`;
    }

    // ── interaction ──
    function olReadPicks(part) {
      const picks = {};
      part.querySelectorAll('.ol-slot').forEach(s => {
        const on = s.querySelector('.ol-opt.on');
        picks[s.dataset.id] = on ? +on.dataset.k : 0;
      });
      return picks;
    }
    function insertOutlineText(txt) {
      const l = editor.innerText.trimEnd();
      insertAt((!l ? '' : /[.!?]$/.test(l) ? ' ' : '. ') + txt);
      editor.dispatchEvent(new Event('input'));
      toast(t('toast-inserted'), 's');
    }
    function onOutlineClick(e) {
      if (!_olState || !e.target || !e.target.closest) return;
      const retry = e.target.closest('.ol-retry');
      if (retry) { retryOutlinePart(+retry.dataset.i); return; }
      const opt = e.target.closest('.ol-opt');
      const part = e.target.closest('.ol-part');
      if (opt && part) {
        opt.parentNode.querySelectorAll('.ol-opt').forEach(b => b.classList.remove('on'));
        opt.classList.add('on');
        part.querySelector('.ol-prev-t').innerHTML = olPreviewHtml(_olState.data.parts[+part.dataset.i], olReadPicks(part));
        return;
      }
      const ins = e.target.closest('.ol-ins');
      if (ins) {
        const src = ins.closest('.ol-move') ? ins.closest('.ol-move').querySelector('.ol-move-t') : ins.parentNode.querySelector('.ol-prev-t');
        if (src) insertOutlineText(src.textContent.trim());
      }
    }
    const _olPanel = document.getElementById('pContent');
    if (_olPanel && _olPanel.addEventListener) _olPanel.addEventListener('click', onOutlineClick);

    // ── orchestration ──
    // Runs worker(item) for every item, at most `limit` at a time
    async function runLimited(items, limit, worker) {
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) await worker(items[next++]);
      }));
    }

    // Turns one parsed part into { ok } or { problems }. `why` explains a missing part.
    function checkOutlinePart(state, i, o, why) {
      const { lvl, vi } = state;
      if (!o || typeof o !== 'object') return { problems: [why || 'no usable answer was found for this part'] };
      sanitizeOutlinePart(o, vi, lvl);
      const problems = validateOutlinePart(o, OUTLINE_PLAN[lvl].parts[i], lvl);
      return problems.length ? { problems } : { ok: o };
    }

    // Reads one raw answer; when it cannot be used, the console shows what the AI actually wrote
    function readOutlinePart(state, i, raw) {
      if (!raw) return checkOutlinePart(state, i, null, 'no answer was received from the AI service');
      const o = parseOutlinePart(raw);
      if (!o) console.info(`[outline] part ${i + 1} answer not in the required format: "${String(raw).replace(/\s+/g, ' ').slice(0, 200)}"`);
      return checkOutlinePart(state, i, o, 'the answer did not follow the required format: plain lines such as "TALK: …", "PATTERN: …", "OPTIONS A: meaning = english | …"');
    }

    // One AI call for one part: { ok } with a usable part, or { problems } explaining what was wrong
    async function tryOutlinePart(state, i, note) {
      const { c, lvl, data } = state;
      const raw = await callAI(buildOutlinePartPrompt(c, data, i) + (note || ''), 'btn-outline', true, true, OUTLINE_PLAN[lvl].partTokens, null, outlineModels());
      return readOutlinePart(state, i, raw);
    }
    const outlineRetryNote = problems => '\n\nYOUR PREVIOUS ANSWER WAS REJECTED. Answer again in the required plain-text format and fix these problems:\n' + problems.map(x => '- ' + x).join('\n');

    function setOutlinePart(state, i, r) {
      const { lvl, data } = state, part = data.parts[i], plan = OUTLINE_PLAN[lvl];
      if (r.ok) {
        ['talk', 'pattern', 'slots', 'move', 'moves', 'extra', 'tip'].forEach(k => { if (r.ok[k] !== undefined) part[k] = r.ok[k]; });
        if (data.parts.filter((q, k) => k !== i && olStatus(q) === 'ready' && q.tip).length >= plan.tips) part.tip = '';
        part.status = 'ready';
      } else {
        part.status = 'failed';
        console.info(`[outline] part ${i + 1} failed: ${r.problems.join('; ')}`);
      }
      olUpdatePart(state, i);
    }

    // Used by a card's "try again" button: up to two calls, for that part only
    async function fillOutlinePart(state, i, run) {
      let r = await tryOutlinePart(state, i);
      if (!r.ok && run === _olRun) r = await tryOutlinePart(state, i, outlineRetryNote(r.problems));
      if (run !== _olRun) return;
      setOutlinePart(state, i, r);
    }

    function olFinalize(state) {
      const { lvl, vi, data, d, cacheKey, c } = state;
      if (data.parts.every(p => olStatus(p) === 'ready') && d) {
        d.outline = OL_PREFIX + JSON.stringify({ lvl, vi, data, c }); // Lưu thêm c
        d.outlineKey = cacheKey;
        saveDocs();
      }
    }

    async function retryOutlinePart(i) {
      const st = _olState;
      if (!st || !st.c) return;
      const run = _olRun;
      st.data.parts[i].status = 'pending';
      olUpdatePart(st, i);
      setBusy('btn-outline', true, false);
      await fillOutlinePart(st, i, run);
      setBusy('btn-outline', false, false);
      if (run === _olRun) olFinalize(st);
    }

    // 1. HÀM TẠO PROMPT GỘP MỚI
    function buildUnifiedOutlinePrompt(c) {
      const { tp, lvl, lang, L } = c;
      const types = OUTLINE_PLAN[lvl].parts;
      const partFmt = lvl === 'C'
        ? `TITLE: <tên đoạn>\nPURPOSE: <1 câu ý chính bằng ${lang}>\nTALK: <1 câu hướng dẫn ngắn bằng ${lang}>\nMOVE: <tên biện pháp>\nOPTION: <mô tả> => <1-2 câu tiếng Anh>\nOPTION: <mô tả> => <1-2 câu tiếng Anh>\nOPTION: <mô tả> => <1-2 câu tiếng Anh>`
        : `TITLE: <tên đoạn>\nPURPOSE: <1 câu ý chính bằng ${lang}>\nTALK: <1 câu hướng dẫn ngắn bằng ${lang}>\nPATTERN: <Mẫu câu tiếng Anh có ô trống {A} {B}>\nASK A: <câu hỏi bằng ${lang}>\nOPTIONS A: <nghĩa ${lang}> = <từ tiếng Anh> | <nghĩa> = <từ>\nASK B: <câu hỏi bằng ${lang}>\nOPTIONS B: <nghĩa ${lang}> = <từ tiếng Anh> | <nghĩa> = <từ>`;

      return `Write a COMPLETE write-along outline guide for "${tp}" in ONE single response. No JSON, plain text only.
Level: ${L.code}. Guidance in ${lang}, English sentences natural.
Keep it SHORT: 1-sentence TALK, exactly 2 options per slot, no EXTRA or TIP lines.

KIND: <loại bài viết bằng ${lang}>
OPENING: <2 câu động viên bằng ${lang}>
STORYLINE: <1 câu tiếng Anh tóm tắt>
CHECK: <câu hỏi kiểm tra 1>
CHECK: <câu hỏi 2>
CLOSING: <1 câu kết động viên>

${types.map((t, i) => `=== PART ${i + 1} ===\n${partFmt}`).join('\n\n')}`;
    }

    // 2. HÀM PHÂN TÍCH KẾT QUẢ GỘP
    function parseUnifiedOutline(raw, c) {
      const { lvl, vi } = c;
      const expectedCount = OUTLINE_PLAN[lvl].parts.length;
      const text = strip(String(raw || '')).replace(/<think>[\s\S]*?<\/think>/gi, '');

      const matches = [...text.matchAll(/(?:===|\#\#\#)?\s*PART\s*(\d+)/gi)];
      let planText = text;
      const partTexts = Array(expectedCount).fill('');

      if (matches.length > 0) {
        planText = text.slice(0, matches[0].index);
        for (let m = 0; m < matches.length; m++) {
          const pNum = parseInt(matches[m][1], 10) - 1;
          const start = matches[m].index + matches[m][0].length;
          const end = (m + 1 < matches.length) ? matches[m + 1].index : text.length;
          if (pNum >= 0 && pNum < expectedCount) partTexts[pNum] = text.slice(start, end);
        }
      }

      const parsedPlan = parseOutlinePlan(planText, expectedCount) || {
        kind: vi ? 'Bài viết cá nhân' : 'Personal Writing',
        opening: vi ? 'Cùng lập dàn ý nhé!' : "Let's build an outline!",
        checklist: [], closing: vi ? 'Viết câu đầu tiên nào!' : 'Start writing!'
      };

      const parts = partTexts.map((rawPart, i) => {
        const titleMatch = rawPart ? rawPart.match(/^TITLE\s*:\s*(.*)$/im) : null;
        const title = titleMatch ? titleMatch[1].trim() : 'none';
        const parsedP = parseOutlinePart(rawPart);
        const check = checkOutlinePart({ lvl, vi }, i, parsedP, 'Lỗi định dạng');
        return check.ok ? { title, status: 'ready', ...check.ok } : { title, status: 'failed', problems: check.problems };
      });

      return { ...parsedPlan, parts };
    }

