    function closePwaGuideModal() {
      document.getElementById('pwaGuideModal').classList.remove('open');
    }

    function showPwaGuideModal() {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      document.getElementById('pwaGuideChrome').style.display = isIOS ? 'none' : 'block';
      document.getElementById('pwaGuideIOS').style.display = isIOS ? 'block' : 'none';
      document.getElementById('pwaGuideModal').classList.add('open');
    }

    // ── PWA INSTALL BANNER ──
    (function () {
      // already installed as PWA — don't show
      if (window.matchMedia('(display-mode: standalone)').matches) return;
      if (window.navigator.standalone) return; // iOS PWA
      // user permanently dismissed
      if (localStorage.getItem('pwa_dismissed') === 'forever') return;

      let deferredPrompt = null;
      const banner = document.getElementById('pwaBanner');
      const btnInstall = document.getElementById('pwaBannerInstall');
      const btnDismiss = document.getElementById('pwaBannerDismiss');
      const lkInstallBtn = document.getElementById('lkInstallBtn');

      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

      // detect install button text by platform
      function updateInstallBtn() {
        if (!lkInstallBtn) return;
        if (isStandalone) {
          lkInstallBtn.textContent = 'Đã cài ✓';
          lkInstallBtn.style.background = '#22c55e';
          lkInstallBtn.disabled = true;
        } else if (isIOS) {
          lkInstallBtn.textContent = 'Xem hướng dẫn';
        } else if (deferredPrompt) {
          lkInstallBtn.textContent = 'Cài ngay';
        } else {
          lkInstallBtn.textContent = 'Cài ngay';
        }
      }
      updateInstallBtn();

      // Chrome/Edge: capture beforeinstallprompt
      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        setTimeout(() => banner.classList.add('show'), 2000);
        updateInstallBtn();
      });

      if (lkInstallBtn) {
        lkInstallBtn.addEventListener('click', async () => {
          if (isStandalone) return;
          if (isIOS) {
            toast('Safari: bấm nút Chia sẻ → "Thêm vào màn hình chính"', '');
            return;
          }
          if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            if (outcome === 'accepted') {
              lkInstallBtn.textContent = 'Đã cài ✓';
              lkInstallBtn.style.background = '#22c55e';
              lkInstallBtn.disabled = true;
            }
          } else {
            showPwaGuideModal();
          }
        });
      }

      btnInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          deferredPrompt = null;
          if (outcome === 'accepted') localStorage.setItem('pwa_dismissed', 'forever');
        } else {
          showPwaGuideModal();
        }
        banner.classList.remove('show');
      });

      btnDismiss.addEventListener('click', () => {
        banner.classList.remove('show');
        localStorage.setItem('pwa_dismissed', 'forever');
      });

      // Samsung Internet / iOS: no beforeinstallprompt — show banner after 3s
      setTimeout(() => {
        if (!window.matchMedia('(display-mode: standalone)').matches &&
          localStorage.getItem('pwa_dismissed') !== 'forever') {
          banner.classList.add('show');
        }
      }, 3000);
    })();

    // ── PWA SETTINGS SECTION ──
    (function () {
      const isPwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      const installed = document.getElementById('sdPwaInstalled');
      const guide = document.getElementById('sdPwaGuide');
      const installBtn = document.getElementById('sdPwaInstallBtn');
      const manualDiv = document.getElementById('sdPwaManual');
      const manualChrome = document.getElementById('sdPwaManualChrome');
      const manualSamsung = document.getElementById('sdPwaManualSamsung');
      const manualSafari = document.getElementById('sdPwaManualSafari');
      const manualGeneric = document.getElementById('sdPwaManualGeneric');

      if (isPwa) {
        if (installed) installed.style.display = 'block';
        if (guide) guide.style.display = 'none';
        return;
      }

      // detect browser for manual instructions
      const ua = navigator.userAgent;
      const isSamsung = /SamsungBrowser/i.test(ua);
      const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);

      if (manualDiv) {
        manualDiv.style.display = 'block';
        if (isSamsung && manualSamsung) { manualSamsung.style.display = 'block'; if (manualGeneric) manualGeneric.style.display = 'none'; }
        else if (isSafari && manualSafari) { manualSafari.style.display = 'block'; if (manualGeneric) manualGeneric.style.display = 'none'; }
        else if (manualChrome) { manualChrome.style.display = 'block'; if (manualGeneric) manualGeneric.style.display = 'none'; }
      }

      // Chrome/Edge: show install button when beforeinstallprompt fires
      let _prompt = null;
      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        _prompt = e;
        if (installBtn) installBtn.style.display = 'flex';
      });

      window.sdTriggerPwaInstall = async function () {
        if (!_prompt) return;
        _prompt.prompt();
        const { outcome } = await _prompt.userChoice;
        _prompt = null;
        if (outcome === 'accepted') {
          if (installed) installed.style.display = 'block';
          if (guide) guide.style.display = 'none';
        }
      };
    })();

    // ── GRAMMAR BOTTOM SHEET (touch) ──
    let geSheetTarget = null;

    function openGeSheet(el) {
      geSheetTarget = el;
      document.getElementById('geSheetWrong').textContent = el.textContent;
      document.getElementById('geSheetFix').textContent = el.getAttribute('data-fix');
      document.getElementById('geSheetApply').onclick = () => {
        window.applyFix(geSheetTarget);
        closeGeSheet();
      };
      document.getElementById('geSheet').classList.add('show');
      document.getElementById('geSheetOverlay').classList.add('show');
    }

    function closeGeSheet() {
      document.getElementById('geSheet').classList.remove('show');
      document.getElementById('geSheetOverlay').classList.remove('show');
      geSheetTarget = null;
    }

    function toast(msg, type = '', onClick = null) {
      const d = document.createElement('div');
      d.className = 'ti' + (type ? ' ' + type : '');
      d.textContent = msg;
      if (onClick) {
        d.style.cursor = 'pointer';
        d.addEventListener('click', () => { onClick(); d.remove(); });
      }
      document.getElementById('toastWrap').appendChild(d);
      setTimeout(() => d.remove(), onClick ? 5000 : 2900);
    }

    // ── PWA Service Worker ──
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(r => console.log('SW registered:', r.scope))
          .catch(e => console.log('SW error:', e));
      });
    }

    // ── DIỄN ĐẠT (Express in English) ──
    function openExpressModal() {
      document.getElementById('expressModal').classList.add('open');
      setTimeout(() => document.getElementById('expressInput').focus(), 100);
    }
    function closeExpressModal() {
      document.getElementById('expressModal').classList.remove('open');
      document.getElementById('expressInput').value = '';
    }
    async function submitExpress() {
      const input = document.getElementById('expressInput');
      const vi = input.value.trim();
      if (!vi) return;
      const btn = document.getElementById('expressSubmitBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Đang tra...';
      closeExpressModal();

      const tone = document.getElementById('toneSel').value;
      const level = document.getElementById('lvlSel').value;
      const tp = topic();

      const aud = document.getElementById('audSel').value;

      const isVi = uiLang !== 'en';
      const prompt =
        `You are a vocabulary assistant for an ESL user writing in English.
The user wants to express this idea but doesn't know the right words:
"${vi}"
${tp ? `Writing topic: "${tp}"` : ''}Level: ${level} | Tone: ${tone} | Audience: ${aud}
Interface language: ${isVi ? 'Vietnamese' : 'English'}

LANGUAGE RULE: Write ALL labels, headings, meanings, and examples in ${isVi ? 'Vietnamese' : 'English'}.

Give PRACTICAL vocabulary they can use RIGHT NOW in their writing. Output EXACTLY:

## ✏️ ${isVi ? 'Từ / Cụm từ chính' : 'Key words / phrases'}
**word or phrase** — *${isVi ? 'nghĩa tiếng Việt' : 'meaning'}* | *${isVi ? 'ví dụ ngắn dùng ngay' : 'short example'}*
(4–6 items: single words, collocations, phrasal verbs — most useful first)

## 💡 ${isVi ? 'Cách diễn đạt tự nhiên' : 'Natural ways to say it'}
> Natural English sentence 1
> Natural English sentence 2
> Natural English sentence 3
(3 ready-to-use sentences matching their level, tone and audience)

## 🔗 ${isVi ? 'Thêm lựa chọn' : 'More options'}
**alternative word/phrase** — *${isVi ? 'nghĩa' : 'meaning'}* | *${isVi ? 'ví dụ' : 'example'}*
(2–3 synonyms or related expressions)

Rules: NO long explanations. Every example must be copy-paste ready. Match level (${level}) exactly — simple vocab for A/B levels, richer for C. Tone: ${tone}. Write for audience: ${aud}.`;

      const r = await callAI(prompt, 'btn-express');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-search"></i> Tra cứu';
      if (r) openPanel('💡 Diễn đạt tiếng Anh', r, null);
    }

