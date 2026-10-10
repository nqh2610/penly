// ── LANGUAGETOOL REALTIME GRAMMAR CHECK ──
// Debounces on editor input, calls LanguageTool public API (per-IP, no key needed),
// injects .ge-lt spans using same UI as AI grammar check (.ge).
// Uses a separate class to avoid conflict with callGrammar() which manages .ge spans.
// Rate limit: 20 req/min per IP → debounce 3s ensures we never exceed it.

(function () {
  const LT_API = 'https://api.languagetool.org/v2/check';
  const DEBOUNCE_MS = 3000; // 3s = max 20 req/min, stays within free tier
  const MAX_CHARS = 20000;

  let _debounceTimer = null;
  let _lastText = '';

  // Wait for editor to be available
  function init() {
    const editor = document.getElementById('editor');
    if (!editor) { setTimeout(init, 500); return; }

    editor.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => runCheck(editor), DEBOUNCE_MS);
    });
  }

  async function runCheck(editor) {
    const rawText = getPlainText(editor);

    // Skip if text unchanged or too short
    if (rawText === _lastText) return;
    if (rawText.trim().length < 5) { clearLtSpans(editor); return; }
    _lastText = rawText;

    // Skip if text is predominantly Vietnamese
    if (viRatio(rawText) > 0.20) { clearLtSpans(editor); return; }

    const text = rawText.length > MAX_CHARS ? rawText.slice(0, MAX_CHARS) : rawText;

    let matches;
    try {
      const body = new URLSearchParams({ text, language: 'en-US', disabledRules: 'WHITESPACE_RULE,COMMA_PARENTHESIS_WHITESPACE' });
      const res = await fetch(LT_API, { method: 'POST', body });
      if (!res.ok) return;
      const data = await res.json();
      matches = data.matches || [];
    } catch {
      return;
    }

    // Only inject if text hasn't changed while we were fetching
    if (getPlainText(editor) !== rawText) return;

    clearLtSpans(editor);

    // Filter: skip if replacement is empty (informational rules), skip spelling of proper nouns
    const filtered = matches.filter(m =>
      m.replacements && m.replacements.length > 0 &&
      m.replacements[0].value !== undefined
    );

    if (filtered.length === 0) return;

    injectSpans(editor, rawText, filtered);
  }

  // Get plain text from editor, stripping existing .ge and .ge-lt spans
  function getPlainText(editor) {
    const tmp = document.createElement('div');
    tmp.innerHTML = editor.innerHTML;
    tmp.querySelectorAll('span.ge, span.ge-lt').forEach(s =>
      s.replaceWith(document.createTextNode(s.textContent))
    );
    // Normalize block elements to newlines for accurate offset mapping
    tmp.querySelectorAll('div, p, br').forEach(el => {
      if (el.tagName === 'BR') el.replaceWith(document.createTextNode('\n'));
      else el.insertAdjacentText('afterend', '\n');
    });
    return (tmp.innerText || tmp.textContent || '').replace(/\n+$/, '');
  }

  // Inject .ge-lt spans at the correct DOM positions using a TreeWalker
  function injectSpans(editor, plainText, matches) {
    // Sort matches by offset descending so later offsets don't shift earlier ones
    const sorted = [...matches].sort((a, b) => b.offset - a.offset);

    for (const match of sorted) {
      const { offset, length } = match;
      const fix = match.replacements[0].value;
      const message = match.message || '';

      const range = offsetToRange(editor, offset, length);
      if (!range) continue;

      // Don't wrap if selection already inside a .ge or .ge-lt span
      const ancestor = range.commonAncestorContainer;
      if (ancestor.nodeType === Node.TEXT_NODE && ancestor.parentElement.closest('.ge, .ge-lt')) continue;

      try {
        const span = document.createElement('span');
        span.className = 'ge ge-lt';
        span.setAttribute('data-fix', fix);
        span.setAttribute('data-lt-msg', message);
        span.setAttribute('onclick', 'applyFix(this)');
        range.surroundContents(span);
      } catch {
        // surroundContents fails if range crosses element boundaries — skip
      }
    }
  }

  // Convert a plain-text offset+length to a DOM Range inside editor
  function offsetToRange(editor, offset, length) {
    let charCount = 0;
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      // Skip text inside existing .ge / .ge-lt — already accounted for in plainText
      if (node.parentElement.closest('.ge, .ge-lt')) continue;

      const len = node.textContent.length;

      if (!startNode && charCount + len > offset) {
        startNode = node;
        startOffset = offset - charCount;
      }
      if (!endNode && charCount + len >= offset + length) {
        endNode = node;
        endOffset = offset + length - charCount;
        break;
      }
      charCount += len;
    }

    if (!startNode || !endNode) return null;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  // Remove all .ge-lt spans, restoring plain text
  function clearLtSpans(editor) {
    editor.querySelectorAll('span.ge-lt').forEach(s =>
      s.replaceWith(document.createTextNode(s.textContent))
    );
  }

  // Reuse vi ratio logic (mirrors _viRatio in ai-features.js)
  const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g;
  function viRatio(s) {
    return ((s.match(VI_CHARS) || []).length) / Math.max(s.length, 1);
  }

  init();
})();
