// 🩺 "Fix my scene" (round 34, scenedoctor): what loads with the Lab. The doctor itself (three-doctor*.js, lazy group
// "scenedoctor") loads on first use; this small part gives it its ways in and the calm hint:
//   · ✦ More › 🩺 Fix my scene and the toolbar's ⋯ row (tools/three-easy.js asks item() / toolbarRow())
//   · a small hint in the preview's corner, by itself, when the Lab catches a layer error (hearth:lab-error) or the
//     frame comes out blank a few seconds after a run (hearth:lab-ran: one 48 px picture, only while the Lab is on
//     screen). Once per problem: the same sketch's blank frame or the same error never hints twice (remembered).
// (store three.doctorHints = false turns the hint off; nothing on screen asks for it: it shows rarely and goes by itself)
const SceneDoctorHook = (() => {
  const KEY = 'three.doctorSeen';
  let seen = null;
  const seenSet = () => (seen ||= new Set(store.get(KEY, [])));
  const remember = (k) => { const s = seenSet(); s.add(k); store.set(KEY, [...s].slice(-80)); };
  let hintEl = null; let hideTimer = 0; let blankTimer = 0; let errTimer = 0;
  const last = { hint: null, checks: 0 }; // (dev/checks/scenedoctor.js)

  async function doctor(fn = (D) => D.open()) {
    if (typeof SceneDoctor === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('scenedoctor');
    if (typeof SceneDoctor === 'undefined') throw new Error('Fix my scene did not load');
    return fn(SceneDoctor);
  }
  const openIt = () => doctor().catch((e) => toast(e.message, { type: 'error' }));
  const item = () => ({ label: '🩺 Fix my scene', hint: 'finds what\'s wrong and fixes it here (no tokens)', cmd: 'fix-scene', action: openIt });
  const toolbarRow = () => ['🩺 Fix my scene', 'Finds what\'s wrong and fixes it here (no tokens)', openIt, false, 'Fix my scene'];

  // ---------- the calm hint ----------
  const host = () => ThreeLab.stageHooks?.host || null;
  const onScreen = () => { const h = host(); return Boolean(h && !document.hidden && h.checkVisibility?.({ visibilityProperty: true })); };
  const sketchId = () => ThreeLab.stageHooks?.sketchId?.() || '';
  function hideHint() { clearTimeout(hideTimer); hintEl?.remove(); hintEl = null; }
  // (round 38, hintcalm) in turn with the other tips (hints.js: one at a time, never while you type or drag, Don't
  // show tips): offered here, drawn by show() below; the same problem is remembered once it showed
  function hint(key, text) {
    if (store.get('three.doctorHints', true) === false || seenSet().has(key) || !onScreen()) return false;
    if (typeof SceneDoctor !== 'undefined' && SceneDoctor.card?.isConnected) return false; // the card is open: it already says
    if (!window.Hints) return show(key, text);
    const sk = sketchId();
    Hints.offer({ id: 'scenedoctor', place: 'lab', rank: 10, once: false, ttl: 30000, still: () => sketchId() === sk && onScreen() && !seenSet().has(key), show: () => (show(key, text) ? hintEl : null) });
    return true;
  }
  function show(key, text) {
    if (seenSet().has(key) || !onScreen() || (typeof SceneDoctor !== 'undefined' && SceneDoctor.card?.isConnected)) return false;
    remember(key);
    hideHint();
    const h = host();
    hintEl = el('div', { class: 'sd-hint', attrs: { role: 'status' } },
      el('span', { text: `🩺 ${text}` }),
      el('button', { type: 'button', class: 'lm-btn sd-hint-go', text: 'Fix my scene', title: 'Check the scene here and fix it (no tokens)', on: { click: () => { hideHint(); openIt(); } } }),
      el('button', { type: 'button', class: 'lm-btn lm-x', text: '✕', title: 'Dismiss', on: { click: hideHint } }));
    hintEl.addEventListener('contextmenu', (e) => e.stopPropagation());
    if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
    h.append(hintEl);
    hideTimer = setTimeout(hideHint, 14000);
    last.hint = { key, text, at: Date.now() };
    return true;
  }
  // a layer error: once per sketch + layer + message
  function onError(e) {
    const d = e.detail || {};
    clearTimeout(errTimer);
    errTimer = setTimeout(() => hint(`${sketchId()}|err|${d.layer || ''}|${String(d.message || '').slice(0, 80)}`, 'A layer stopped with an error.'), 900);
  }
  // a blank frame: a 48 px picture a few seconds after a run (after the thumbnail's own shot), once per sketch
  async function blankCheck() {
    const id = sketchId();
    const d = ThreeLab.director; const st = ThreeLab.stageHooks;
    if (!id || !d || !onScreen() || st?.frozen || seenSet().has(`${id}|blank`) || (typeof ThreeSeq !== 'undefined' && ThreeSeq.active)) return;
    last.checks += 1;
    const url = await d.shotSmall(48).catch(() => null);
    if (!url || sketchId() !== id) return;
    const img = new Image(); img.src = url;
    try { await img.decode(); } catch { return; }
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    // (the same test as DoctorCore.isBlank, kept here so the doctor's files stay unloaded)
    let s = 0; let s2 = 0; const n = c.width * c.height;
    for (let i = 0; i < px.length; i += 4) { const y = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255; s += y; s2 += y * y; }
    const m = s / n;
    if (Math.sqrt(Math.max(0, s2 / n - m * m)) < 0.012) hint(`${id}|blank`, m < 0.06 ? 'The frame is all black.' : 'The frame is blank.');
  }
  function onRan() { clearTimeout(blankTimer); blankTimer = setTimeout(() => { blankCheck().catch(() => {}); }, 6000); }
  addEventListener('hearth:lab-error', onError);
  addEventListener('hearth:lab-ran', onRan);
  addEventListener('hearth:sketch', hideHint);

  return { item, toolbarRow, doctor, hint, hideHint, blankCheck, last, forget: () => { seen = new Set(); store.set(KEY, []); } };
})();
