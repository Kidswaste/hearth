// 🩺 "Fix my scene" (round 34, scenedoctor): a free, local check of the Lab scene on screen (0 tokens), before anyone
// spends tokens asking the AI. It reads the scene (a small picture, the layers, their sliders and code, the errors the
// Lab caught, the console, the frame rate, what each layer's three.js scene holds: see DoctorCore.probe), and lists
// what's wrong in one plain sentence each (three-doctor-core.js), with a one-click fix where one exists:
//   hide a layer that throws (the layer menu's Hide) · show hidden layers · point the camera at the subject / step out
//   of an object (the layer's '@camera' placement, as the scene editor's "📷 Use this view" keeps it) · brighten /
//   tone down (✨ autopolish's exposure fixes alone) · reset a NaN slider · halve a count slider, 🪶 Light mode or
//   labadapt's ladder back on for slow frames · listen to the computer's sound for a layer that reacts to music
// Every fix is one undo step (the card's ↶ Undo, the toast's Undo). With no local fix, "Ask the director" fills the
// director's message box with one short, precise request (never sent by itself).
// Ways in: ✦ More › 🩺 Fix my scene (the preview's right-click), the toolbar's ⋯, ⌘/Ctrl+K "Lab: Fix my scene", and
// the calm hint tools/three-doctor-hook.js shows by itself once per problem (a blank frame, a layer error).
// The app's internal command: /fix-scene [check | undo | status].
//   SceneDoctor.open() · check() · read() · fix(id) · undo() · ask(id) · state() · card
const SceneDoctor = (() => {
  const C = () => DoctorCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => { toast(e?.message || String(e), { type: 'error' }); };
  const S = { findings: [], fixed: new Map(), undos: [], card: null, busy: false, at: 0, sketch: null, read: null };

  async function lab() {
    const cmd = await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100);
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return { d: ThreeLab.director, cmd };
  }

  // ---------- reading the scene (R, see three-doctor-core.js) ----------
  async function pixels(url) {
    const img = new Image(); img.src = url;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    return { px: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
  }
  async function read() {
    const { d, cmd } = await lab();
    if (typeof FormatsCore === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('multiformat').catch(() => null); // the subject box (▦ All formats' reading)
    const url = await d.shotSmall(160).catch(() => null);
    let pic = null; let subject = null;
    if (url) { try { const p = await pixels(url); pic = C().picture(p.px, p.w, p.h); subject = C().subject(p.px, p.w, p.h); } catch { /* unreadable: the rules go without the picture */ } }
    const rep = d.report();
    const layers = (d.layers().layers || []).map((L) => {
      let code = ''; try { code = d.codeOf(L.id).code || ''; } catch { /* gone */ }
      let sliders = []; try { sliders = d.sliders(L.id).sliders || []; } catch { /* none */ }
      return { id: L.id, name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, code, sliders };
    });
    let probe = null;
    const ev = await d.evalInSketch(C().probeSource()).catch(() => null);
    if (ev?.ok && typeof ev.value === 'string') { try { probe = JSON.parse(ev.value); } catch { probe = null; } }
    // (round 35, bugbash2) a look-around view moved off the scene's camera (Lab gestures): the picture shows the view,
    // the probe reads the scene's camera; a black frame there is the view's, not the scene's
    let moved = [];
    const mv = await d.evalInSketch('return JSON.stringify((window.__labGest?.state?.().views || []).filter((v) => !v.idle).map((v) => ({ id: v.id, yaw: v.yaw, pitch: v.pitch, s: v.s, px: v.px, py: v.py, pz: v.pz })))').catch(() => null);
    if (mv?.ok && typeof mv.value === 'string') { try { moved = JSON.parse(mv.value) || []; } catch { moved = []; } }
    const st = cmd.state;
    const p = (() => { try { return cmd.perf(); } catch { return null; } })();
    const pl = cmd.player;
    return {
      pic, subject, layers, probe, errors: rep.errors || [], console: (rep.console || []).slice(-30),
      perf: p ? { fps: p.fps ?? null, p50: p.frameMsP50 ?? null, parked: Boolean(p.parked || st.frozen), light: Boolean(p.light), adapt: p.adapt?.on !== false } : null,
      sound: Boolean(st.live || (pl?.loaded && !pl.isClock)), frozen: Boolean(st.frozen), shot: url, sketch: st.sketch || '', moved,
    };
  }
  async function check() {
    const R = await read();
    const findings = C().diagnose(R);
    return { R, findings };
  }

  // ---------- the fixes (each one undo step) ----------
  // the layer data as it was / put back (hide, show, the camera's placement): the Lab's own capture / restore
  async function viaRestore(d, change) {
    const before = d.capture();
    const next = JSON.parse(JSON.stringify(before));
    change(next.layers);
    await d.restore(next, { wait: 0.6 });
    return async () => { await d.restore(before, { wait: 0.4 }); };
  }
  const FIX = {
    async hide(d, f) { return viaRestore(d, (Ls) => { const L = Ls.find((x) => x.id === f.fix.layer); if (L) L.visible = false; }); },
    async show(d, f) { return viaRestore(d, (Ls) => { for (const L of Ls) if (f.fix.layers.includes(L.id)) { L.visible = true; if ((L.opacity ?? 1) <= 0.02) L.opacity = 1; } }); },
    async frame(d, f) {
      const fr = f.fix.frame;
      const back = await viaRestore(d, (Ls) => { const L = Ls.find((x) => x.id === f.fix.layer); if (L) L.overrides = { ...(L.overrides || {}), '@camera': { p: fr.p, q: fr.q, fov: fr.fov } }; });
      // undone, the layer runs again so a camera its code placed once goes back there (as the scene editor's Reset does)
      return async () => { await back(); try { await d.updateLayer(f.fix.layer, { code: d.codeOf(f.fix.layer).code }, 0.5); } catch { /* the layer went away */ } };
    },
    // (round 35, bugbash2) back to the scene's own camera (Shift+Z); undone: the view you had
    async view(d, f) {
      const views = f.fix.views || [];
      for (const v of views) await d.evalInSketch(`return __labGest.cmd(${JSON.stringify({ cmd: 'reset', layer: v.id })})?.ok`).catch(() => null);
      await sleep(600);
      return async () => { for (const v of views) await d.evalInSketch(`return __labGest.goTo(${JSON.stringify(v.id)}, ${JSON.stringify({ yaw: v.yaw, pitch: v.pitch, s: v.s, px: v.px, py: v.py, pz: v.pz })})`).catch(() => null); };
    },
    async light(d, f) {
      if (typeof AutoPolish === 'undefined') throw new Error('Make it look finished did not load.');
      const s = await AutoPolish.run({ quiet: true, only: f.fix.only, card: false });
      if (!s?.fixes?.length) { toast('The light looks deliberate here: nothing to change (✨ Make it look finished can still try)', { timeout: 3500 }); return null; }
      return async () => { await AutoPolish.undo(); };
    },
    async slider(d, f) {
      const was = {};
      const list = d.sliders(f.fix.layer).sliders || [];
      for (const k of Object.keys(f.fix.set)) was[k] = list.find((s) => s.key === k)?.value;
      d.sliders(f.fix.layer, f.fix.set);
      return async () => { const back = Object.fromEntries(Object.entries(was).filter(([, v]) => v !== undefined)); try { d.sliders(f.fix.layer, back); } catch { /* the layer went away */ } };
    },
    async lightmode(d, f, cmd) { cmd.light(true); return async () => { cmd.light(false); }; },
    async adapt(d, f, cmd) { cmd.adapt(true); return async () => { cmd.adapt(false); }; },
    async live(d, f, cmd) {
      const was = cmd.state.live || null;
      const now = await cmd.live('system');
      if (now === 'off') throw new Error('Live sound could not start (see the Lab\'s 🎧 Live menu).');
      return async () => { await cmd.live(was || 'off'); };
    },
  };
  async function fix(id) {
    const f = S.findings.find((x) => x.id === id);
    if (!f?.fix) throw new Error('No local fix for that one: Ask the director.');
    if (S.fixed.has(id)) return false;
    const { d, cmd } = await lab();
    const undo = await FIX[f.fix.kind](d, f, cmd);
    if (!undo) return false;
    const entry = { id, label: f.fix.label, text: f.text, undo, sketch: S.sketch, f };
    S.undos.push(entry);
    S.fixed.set(id, entry);
    paint();
    toast(`🩺 ${f.fix.label}`, { timeout: 4500, action: { label: 'Undo', fn: () => undo1(entry).catch(err) } });
    recheckSoon();
    return true;
  }
  // one undo step: the last fix (or the one given)
  async function undo1(entry) {
    const i = S.undos.indexOf(entry);
    if (i < 0) return false;
    S.undos.splice(i, 1);
    await entry.undo();
    S.fixed.delete(entry.id);
    S.findings = S.findings.map((x) => (x.id === entry.id ? entry.f : x)); // its row is a problem again (until the next look)
    paint();
    recheckSoon();
    return true;
  }
  async function undo() {
    const e = S.undos[S.undos.length - 1];
    if (!e) { toast('Nothing to undo.', { timeout: 1500 }); return false; }
    await undo1(e);
    toast(`↶ ${e.label}: undone`, { timeout: 1800 });
    return true;
  }
  let recheckTimer = 0;
  function recheckSoon(ms = 1400) {
    clearTimeout(recheckTimer);
    recheckTimer = setTimeout(() => { if (S.card?.isConnected) look({ keepFixed: true }).catch(() => {}); }, ms);
  }

  // ---------- ✦ the director, when no local fix exists (fills its box, never sends) ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function director() {
    let dir = directorOf();
    if (dir) return dir;
    await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'scenedoctor', say: () => {}, note: () => {} });
    for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
    dir = directorOf();
    if (!dir) throw new Error('No Three Director to ask (toolbar ⋯ › Director › Make the Three Director).');
    return dir;
  }
  async function ask(id) {
    const f = S.findings.find((x) => x.id === id);
    if (!f) throw new Error('That problem is gone.');
    const dir = await director();
    const text = C().askText(f, S.sketch);
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    // (the docked chat mounts its box a moment after the dock opens)
    const there = () => [...document.querySelectorAll('.composer textarea')].some((t) => t.value === text);
    for (let i = 0; i < 12 && !there(); i += 1) { Native.setDraft?.(dir.id, text); if (!there()) await sleep(150); }
    if (!there()) { navigator.clipboard?.writeText(text).catch(() => {}); toast('Copied the request for the director (its chat isn\'t open): paste it there', { timeout: 4000 }); return text; }
    toast(`In ${dir.name}'s box, not sent (≈${C().tokens(text)} tokens): press Enter when it reads right`, { timeout: 4000 });
    return text;
  }

  // ---------- the card over the preview ----------
  function close() { S.card?.remove(); S.card = null; }
  function row(f) {
    const done = S.fixed.get(f.id);
    const acts = el('span', { class: 'sd-acts' },
      done ? el('span', { class: 'sd-done', text: '✓ fixed' }) : null,
      done ? el('button', { type: 'button', class: 'lm-btn', text: '↶', title: 'Undo this fix', on: { click: () => undo1(done).catch(err) } }) : null,
      !done && f.fix ? el('button', { type: 'button', class: 'lm-btn sd-fix', text: f.fix.label, title: 'Fix it here (no tokens, one undo step)', on: { click: (e) => { e.currentTarget.disabled = true; fix(f.id).catch((x) => { err(x); paint(); }); } } }) : null,
      !done ? el('button', { type: 'button', class: `lm-btn${f.fix ? ' sd-ask-quiet' : ' lm-ask'} sd-ask`, text: f.fix ? '✦ Ask' : '✦ Ask the director', title: `Puts a short request in the director's box (≈${C().tokens(C().askText(f, S.sketch))} tokens), not sent`, on: { click: () => ask(f.id).catch(err) } }) : null);
    return el('div', { class: `sd-row sd-${f.kind}${done ? ' fixed' : ''}`, attrs: { 'data-id': f.id } }, el('span', { class: 'sd-text', text: f.text }), acts);
  }
  function paint() {
    const card = S.card;
    if (!card) return;
    const list = S.findings;
    const body = list.length ? list.map(row) : [el('div', { class: 'sd-ok', text: S.undos.length ? 'Nothing else wrong found.' : 'Nothing wrong found: no errors, the subject is in frame, light and speed look fine.' })];
    card.querySelector('.sd-body').replaceChildren(...body);
    const u = card.querySelector('.sd-undo'); if (u) u.hidden = !S.undos.length;
  }
  function showCard() {
    const host = ThreeLab.scenes?.previewHost?.() || ThreeLab.stageHooks?.host;
    if (!host) return;
    if (!S.card?.isConnected) {
      S.card = el('div', { class: 'sd-card', attrs: { role: 'dialog', 'aria-label': 'Fix my scene' }, on: { contextmenu: (e) => e.stopPropagation(), keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } } } },
        el('div', { class: 'lm-head' }, el('b', { text: '🩺 Fix my scene' }), el('span', { class: 'lm-src', text: 'checked here, no tokens' }),
          el('button', { type: 'button', class: 'lm-btn', text: '↻', title: 'Check again', on: { click: () => look({ keepFixed: true }).catch(err) } }),
          el('button', { type: 'button', class: 'lm-btn lm-x', text: '✕', title: 'Close (the fixes stay)', on: { click: () => close() } })),
        el('div', { class: 'sd-body' }),
        el('div', { class: 'lm-acts' }, el('button', { type: 'button', class: 'lm-btn sd-undo', text: '↶ Undo', title: 'Undo the last fix (one step)', hidden: true, on: { click: () => undo().catch(err) } })));
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.append(S.card);
    }
    paint();
  }
  // check and show (keepFixed: the rows already fixed stay listed with their ↶)
  async function look({ keepFixed = false, quiet = false } = {}) {
    if (S.busy) return state();
    S.busy = true;
    S.card?.classList.add('busy');
    try {
      const { R, findings } = await check();
      if (!keepFixed || R.sketch !== S.sketch) { S.fixed.clear(); if (R.sketch !== S.sketch) S.undos = []; }
      // what's still wrong, then what was fixed (each with its ↶)
      S.findings = [...findings.filter((f) => !S.fixed.has(f.id)), ...[...S.fixed.values()].map((e) => ({ id: e.id, kind: 'done', text: e.text, fix: { label: e.label } }))];
      S.read = R; S.sketch = R.sketch; S.at = Date.now();
      if (!quiet) showCard();
      return state();
    } finally { S.busy = false; S.card?.classList.remove('busy'); }
  }
  const open = () => look({ keepFixed: true });

  // ---------- ways in ----------
  const item = () => ({ label: '🩺 Fix my scene', hint: 'finds what\'s wrong and fixes it here (no tokens)', cmd: 'fix-scene', action: () => open().catch(err) });
  function state() {
    return { findings: S.findings.filter((f) => f.kind !== 'done').map((f) => ({ id: f.id, kind: f.kind, text: f.text, fix: f.fix ? { kind: f.fix.kind, label: f.fix.label } : null, ask: f.ask, layer: f.layerName || null })),
      fixed: [...S.fixed.keys()], undos: S.undos.map((e) => e.label), sketch: S.sketch, at: S.at };
  }
  function register() {
    if (typeof Commands === 'undefined' || Commands.get?.('fix-scene')) return;
    Commands.register({
      name: 'fix-scene', aliases: ['scene-doctor'], area: 'Three.js Lab',
      args: '[check | undo | status]',
      desc: 'Check the Lab scene here (no tokens): errors, a blank / too dark / blown-out frame, the subject off-screen or tiny, the camera inside an object, NaN values, slow frames, music layers with no sound, missing files; one-click fixes, one undo each; check: only list them',
      keywords: 'doctor fix broken black blank empty nothing shows dark bright error crash camera off screen tiny nan slow lag fps audio texture missing file diagnose',
      examples: ['/fix-scene', '/fix-scene check', '/fix-scene undo'],
      complete: (a) => ['check', 'undo', 'status'].filter((x) => x.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const w = String(args || '').trim().split(/\s+/)[0].toLowerCase();
        if (w === 'undo') return (await undo()) ? 'Undone.' : 'Nothing to undo.';
        const line = (s) => (s.findings.length ? s.findings.map((f) => `${f.text}${f.fix ? ` [fix: ${f.fix.label}]` : ''}`).join(' · ') : 'Nothing wrong found.');
        if (w === 'status') return line(state());
        if (w === 'check') return line(await look({ quiet: true }));
        return line(await open());
      },
    });
  }
  function actions() { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: Fix my scene (finds what\'s wrong, no tokens)', () => open().catch(err)); }
  function init() { register(); actions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { open, look, check, read, fix, undo, ask, item, state, close, get card() { return S.card; }, get busy() { return S.busy; } };
})();
