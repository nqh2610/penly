    // ── CONFIG ──
    // Replace with your deployed Cloudflare Worker URL after deployment
    const WORKER_URL = "https://penly-proxy.nqh2610.workers.dev";

    // ── LICENSE SYSTEM ──
    const LK_STORE = 'penly_lk';
    const _lkCache = {}; // key -> { ok, ts }
    const LK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    async function isValidKey(raw) {
      const key = raw.trim().toUpperCase();
      if (!/^PENLY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) return false;
      const cached = _lkCache[key];
      if (cached && Date.now() - cached.ts < LK_CACHE_TTL) return cached.ok;
      try {
        const res = await fetch(WORKER_URL + '/validate?key=' + encodeURIComponent(key));
        const data = await res.json();
        _lkCache[key] = { ok: !!data.valid, ts: Date.now() };
        return !!data.valid;
      } catch {
        // network error — fall back to format-only check so app still works offline
        return true;
      }
    }

    function getLicenseKey() { return localStorage.getItem(LK_STORE) || ''; }
    function setLicenseKey(k) { localStorage.setItem(LK_STORE, k); }

    async function checkLicenseGate() {
      const stored = getLicenseKey();
      if (stored && await isValidKey(stored)) {
        document.getElementById('licenseGate').classList.add('hidden');
        return true;
      }
      // show gate
      document.getElementById('licenseGate').classList.remove('hidden');
      return false;
    }

    async function submitLicense() {
      const input = document.getElementById('lkInput');
      const errEl = document.getElementById('lkErr');
      const btn = document.getElementById('lkSubmit');
      const raw = input.value.trim();

      btn.disabled = true;
      btn.textContent = 'Đang kiểm tra...';
      errEl.classList.remove('show');
      input.classList.remove('err');

      const ok = await isValidKey(raw);
      if (ok) {
        setLicenseKey(raw.trim().toUpperCase());
        document.getElementById('licenseGate').classList.add('hidden');
        btn.textContent = 'Kích hoạt';
        btn.disabled = false;
      } else {
        input.classList.add('err');
        errEl.classList.add('show');
        btn.textContent = 'Kích hoạt';
        btn.disabled = false;
        setTimeout(() => input.classList.remove('err'), 400);
      }
    }

    // Format input as user types: auto-insert hyphens, uppercase
    document.addEventListener('DOMContentLoaded', () => {
      const inp = document.getElementById('lkInput');
      if (!inp) return;
      inp.addEventListener('input', () => {
        // strip everything except letters/digits, uppercase
        const raw = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
        // rebuild PENLY-XXXX-XXXX-XXXX
        let out = raw.slice(0, 5);
        if (raw.length > 5) out += '-' + raw.slice(5, 9);
        if (raw.length > 9) out += '-' + raw.slice(9, 13);
        if (raw.length > 13) out += '-' + raw.slice(13, 17);
        inp.value = out;
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') submitLicense(); });
      // check license on load
      checkLicenseGate();
    });

    // ── STATE ──
    let docs = [], currentId = null;
    let saveTimer, pendingAC = "", acSeq = 0;
    let improveOriginalText = null; // bản gốc trước khi nâng cấp lần đầu
    let savedRange = null;

    function triggerAC() {
      const txt = editor.innerText.trim();
      if (txt.length > 3) { acSeq++; doAC(txt); }
    }

    // ── ELEMENTS ──
    const editor = document.getElementById('editor');
    const topicInput = document.getElementById('topicInput');
    const titleInput = document.getElementById('titleInput');
    const saveStatus = document.getElementById('saveStatus');
    const saveIcon = document.getElementById('saveIcon');
    const wcEl = document.getElementById('wc');
    const acChip = document.getElementById('acChip');
    const acText = document.getElementById('acText');
    const tooltip = document.getElementById('ge-tooltip');
    const audSel = document.getElementById('audSel');
    const toneSel = document.getElementById('toneSel');
    const lvlSel = document.getElementById('lvlSel');

    function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

    // ── INIT ──
    window.addEventListener('load', () => { loadUI(); loadDocs(); document.getElementById('editorPane').style.visibility = ''; });

