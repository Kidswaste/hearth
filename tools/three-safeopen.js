// 🛟 Safe open (round 147, safeopen147): a heavy scene that crashes the Lab preview never locks the owner out.
// What existed: the graphics card's contexts coming back in place (round 43, glrecover), a page made again when they don't
// or when its process died (round 50/51, crashsafe), the "stopped responding" banner (no stats for 8 s) and ⚡ Speed check's
// "Reopen in safe mode" (which SAVES 1× pixels / no AA / no shadows into the scene). What was missing, here:
//   · notice   a lost graphics context, the page's process dying, an out-of-memory error while a layer builds, or the page
//              not answering at all while it should draw (no message for 15 s, a ping after 2.5 s of quiet): the page's
//              process is then ended (crashsafe:unstick) so the crash path makes it again
//   · marker   per scene, in the app's own state (localStorage hub.three.safeopen, never the scene): "the last open of X
//              crashed / hung at step Y (layer Z)"; an open still pending (never drew healthy for 5 s) at the next start
//              means Hearth itself went down with it
//   · recover  the first crash of an open: the existing recovery (in place / a new page). A second one, or a scene whose
//              last open crashed: Safe open: the preview at its lowest quality step, 1× pixels, no antialias or shadows,
//              filters at half, every layer held back (the preview only: nothing is written into the scene), one compact
//              banner: "vizualizer2 crashed last time · opened safely · [Bring layers back one by one] [Open normally]".
//              Layers come back lightest first (by the last known cost), the suspected one last, with the cost view on; a
//              layer whose return crashes the preview again is kept off and named. Open normally puts everything back.
//   · AIs      one "health:" line in the next Lab tool answer of a chat on that scene (tools/three-health.js) while it's on
// LabSafe.on(id) · held(id) · opening(sk, o) · msg(m) · tick() · next() · openNormally() · fold(v) · state() · _reset()
const LabSafe = (() => {
  const KEY = 'hub.three.safeopen';
  const HEALTHY_MS = 5000;
  const A = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.safe : null);
  const st = { opens: 0, crashes: 0, hangs: 0, safe: 0, back: 0, normal: 0, unsticks: 0, marks: 0 };
  const S = { openId: null, crashed: 0, recovered: true, lastCrashAt: 0, healthyT: 0, drawn: new Set(), lastMsgAt: Date.now(), pingAt: 0, safe: null, el: null };
  const hangMs = () => { try { return Number(JSON.parse(localStorage.getItem('hub.safeopen.hangMs') || 'null')) || 15000; } catch { return 15000; } };
  const clip = (t, n) => { t = String(t ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const OOM = /out of memory|allocation failed|Array buffer allocation|Invalid typed array length|Invalid array length|CONTEXT_LOST_WEBGL/i;
  const WORD = { gpu: 'crashed', crash: 'crashed', oom: 'ran out of memory', hang: 'stopped responding', closed: 'crashed' };

  // ---------- the marker (the app's state; a read that fails writes nothing) ----------
  function read() {
    try { const v = localStorage.getItem(KEY); if (v == null) return { ok: true, v: {} }; const o = JSON.parse(v); return o && typeof o === 'object' ? { ok: true, v: o } : { ok: false, v: {} }; } catch { return { ok: false, v: {} }; }
  }
  function mark(id, fn) {
    const r = read(); if (!r.ok || !id) return null;
    const m = fn(r.v[id] ? { ...r.v[id] } : null);
    if (m) r.v[id] = m; else delete r.v[id];
    const ids = Object.keys(r.v); if (ids.length > 30) for (const k of ids.sort((a, b) => (r.v[a].at || r.v[a].open || 0) - (r.v[b].at || r.v[b].open || 0)).slice(0, ids.length - 30)) delete r.v[k];
    try { localStorage.setItem(KEY, JSON.stringify(r.v)); st.marks += 1; } catch { /* storage full: the next open is just normal */ }
    return m;
  }
  const letGo = (id) => { const m = marker(id); if (m?.open) mark(id, (x) => (x && !x.n ? null : x && { ...x, open: 0 })); };
  const marker = (id) => { const r = read(); return r.ok ? r.v[id] || null : null; };

  // ---------- the open ----------
  function opening(sk, { again = false } = {}) {
    if (!sk?.id || again) return; // (a page made again after a crash: the same open)
    if (sk.id === S.openId) { S.drawn.clear(); return; } // (▶ Run again, the same scene)
    if (S.safe && S.safe.id !== sk.id) end(); // (Safe open is that scene's, the preview only)
    if (S.openId && !S.crashed && !S.safe) letGo(S.openId); // (the scene before, left without a crash: not pending any more)
    S.openId = sk.id; S.crashed = 0; S.recovered = true; S.drawn = new Set(); S.lastMsgAt = Date.now(); clearTimeout(S.healthyT); S.healthyT = 0;
    st.opens += 1;
    const m = marker(sk.id);
    if (m && (m.open || m.n > 0)) start(sk.id, sk.name, m.open && !m.n ? { ...m, kind: 'closed' } : m, 'last');
    mark(sk.id, (x) => ({ ...(x || {}), name: sk.name, open: Date.now() }));
  }
  function healthySoon() {
    if (S.healthyT || !S.openId) return;
    const id = S.openId; const at = Date.now();
    S.healthyT = setTimeout(() => {
      S.healthyT = 0;
      if (S.openId !== id || S.lastCrashAt > at) return;
      mark(id, (x) => (!x ? null : !S.crashed && !S.safe ? null : { ...x, open: 0 })); // a clean open forgets the scene's crashes
    }, HEALTHY_MS);
  }

  // ---------- what the preview says ----------
  function msg(m) {
    if (!m?.type) return;
    S.lastMsgAt = Date.now();
    switch (m.type) {
      case 'ready': S.drawn.clear(); S.recovered = true; break;
      case 'drawn': if (m.layer) S.drawn.add(m.layer); break;
      case 'stack-drawn': S.recovered = true; healthySoon(); if (S.safe?.reload) { S.safe.reload = false; A()?.glDone?.(); } break;
      case 'gpu-restored': S.recovered = true; break;
      case 'gpu-lost': if (document.visibilityState === 'visible') crash('gpu'); break; // (a GPU reset while the window is away, sleep / wake: not the scene's)
      case 'gpu-stuck': if (m.crashed) crash('crash'); break;
      case 'error': if (OOM.test(String(m.message || ''))) crash('oom', m.layer || null); break;
      default:
    }
  }
  // a page that answers nothing while it should draw: hung (asked by a ping after a quiet stretch; the stall timer's beat)
  function tick() {
    const a = A(); const now = Date.now();
    if (!a || !S.openId || !a.watching()) { S.lastMsgAt = now; return; }
    const quiet = now - S.lastMsgAt;
    if (quiet > hangMs()) { S.lastMsgAt = now; st.hangs += 1; crash('hang'); return; }
    if (quiet > 2500 && now - S.pingAt > 2500) { S.pingAt = now; a.box.send({ type: 'ping' }); }
  }
  async function unstick() {
    st.unsticks += 1;
    const ok = await A()?.unstick?.();
    if (!ok) A()?.run({ reload: true }); // (no process to end: a fresh page at least)
  }

  function crash(kind, layer = null) {
    const a = A(); const id = S.openId;
    if (!a || !id || a.sceneId() !== id || !S.recovered) return; // (the same crash, still on its way back)
    S.recovered = false; S.crashed += 1; S.lastCrashAt = Date.now(); st.crashes += 1;
    const lays = a.layers(); const s = S.safe;
    const building = lays.filter((L) => !s?.held.has(L.id) && !S.drawn.has(L.id)).map((L) => L.id);
    const culprit = layer ? [layer] : s?.lastBack && Date.now() - s.backAt < 30000 ? [s.lastBack] : building.length && building.length < lays.length ? building : [];
    const costs = costsNow();
    const m = mark(id, (x) => ({ ...(x || {}), name: a.sceneName(), open: x?.open || Date.now(), n: (x?.n || 0) + 1, kind, step: culprit.length ? (building.length ? 'building' : 'drawing') : x?.step || (building.length ? 'building' : 'drawing'), layers: culprit.length ? culprit : x?.layers || [], at: Date.now(), ...(costs ? { costs } : {}) }));
    if (s) { // a layer brought back crashed it again: kept off, named
      for (const c of culprit) { s.held.add(c); s.back = s.back.filter((b) => b !== c); }
      if (culprit.length) { s.culprit = culprit; s.hit = true; }
      s.kind = kind; s.lastBack = null;
      again(kind); paint(); note();
    } else if (S.crashed >= 2) { start(id, a.sceneName(), m || { kind, layers: culprit }, 'again'); again(kind); } else if (kind === 'hang') unstick();
  }
  // the preview made again for Safe open (a hung page: its process ended, the crash path makes it again)
  function again(kind) { if (S.safe) S.safe.reload = true; if (kind === 'hang') unstick(); else A()?.run({ reload: true }); }
  function costsNow() {
    try { const c = typeof LabCost !== 'undefined' ? LabCost.state?.() : null; const rows = c && c.scene === S.openId ? c.rows || [] : []; return rows.length ? Object.fromEntries(rows.filter((r) => r.id && r.cost != null).map((r) => [r.id, Math.round(r.cost * 10) / 10])) : null; } catch { return null; }
  }

  // ---------- Safe open ----------
  function start(id, name, m, why) {
    const lays = A()?.layers() || [];
    S.safe = { id, name: name || 'This scene', why, kind: m?.kind || 'gpu', step: m?.step || null, culprit: (m?.layers || []).filter((x) => lays.some((L) => L.id === x)), costs: m?.costs || null, held: new Set(lays.map((L) => L.id)), total: lays.length, back: [], lastBack: null, backAt: 0, folded: false, hit: false, cost: false, reload: false, at: Date.now() };
    st.safe += 1;
    try { if (typeof LabSpeedHook !== 'undefined') LabSpeedHook.hideChip(); } catch { /* not loaded */ }
    paint(); note();
  }
  function order() {
    const s = S.safe; if (!s) return [];
    const lays = A()?.layers() || []; const pos = new Map(lays.map((L, i) => [L.id, i]));
    const c = s.costs || {};
    return [...s.held].filter((id) => pos.has(id)).sort((x, y) => (s.culprit.includes(x) - s.culprit.includes(y)) || ((c[x] ?? 1e9) - (c[y] ?? 1e9)) || pos.get(x) - pos.get(y));
  }
  function next() {
    const s = S.safe; if (!s) return null;
    const id = order()[0]; if (!id) return null;
    s.held.delete(id); s.back.push(id); s.lastBack = id; s.backAt = Date.now(); st.back += 1;
    A()?.run({ sync: true });
    costView(); paint(); note();
    return id;
  }
  // the cost view on as layers come back, so the heavy one shows on its row (round 146's ▦; measured again after each)
  function costView() {
    const s = S.safe;
    const go = () => {
      if (typeof LabCost === 'undefined') return;
      if (!LabCost.on) { LabCost.toggle(true).catch(() => {}); return; }
      setTimeout(() => { if (S.safe === s && LabCost.on && LabSpeed.isOpen() && !LabSpeed.state().busy) LabSpeed.measure().catch(() => {}); }, 1500);
    };
    if (!s.cost) { s.cost = true; (window.Lazy ? Lazy.load('speedcheck') : Promise.resolve()).then(go, () => {}); } else go();
  }
  function openNormally() {
    const s = S.safe; const a = A(); if (!s || !a) return;
    S.safe = null; st.normal += 1;
    mark(s.id, () => ({ name: s.name, open: Date.now() })); // (a fresh slate: one crash recovers by itself again, two reopen safely)
    S.crashed = 0; S.recovered = true; S.lastCrashAt = 0; clearTimeout(S.healthyT); S.healthyT = 0;
    paint(); clearNote(s.id);
    a.box.send({ type: 'safe-open', on: false }); a.resend();
    a.run({ reload: true });
  }
  function end() {
    const s = S.safe; if (!s) return;
    S.safe = null; paint(); clearNote(s.id);
    A()?.box.send({ type: 'safe-open', on: false });
  }

  // ---------- the AIs: one line in the next Lab answer (tools/three-health.js), never in a prompt ----------
  const nameOf = (id) => A()?.layers().find((L) => L.id === id)?.name || null;
  function note() {
    const s = S.safe; if (!s || typeof LabHealth === 'undefined') return;
    clearNote(s.id, true);
    const who = s.culprit.map(nameOf).filter(Boolean).map((n) => `"${clip(n, 24)}"`).join(', ');
    const message = `last open ${WORD[s.kind] || 'crashed'}${who ? ` (suspect ${who})` : ''}; Safe open is on: ${s.held.size} of ${s.total} layers held back in the preview only. Don't re-run heavy code as is: lighten it first or ask.`;
    s.noteMsg = message;
    LabHealth.fromBox({ type: 'error', kind: 'safe', layer: null, line: null, message }, s.id, 'screen');
  }
  function clearNote(id, keepState = false) {
    if (typeof LabHealth === 'undefined') return;
    try { const recs = LabHealth.state(id); if (recs.some((r) => r.kind === 'safe')) LabHealth.fromBox({ type: 'health-clear', layer: null }, id, 'screen'); } catch { /* fine */ }
    if (!keepState && S.safe?.id === id) S.safe.noteMsg = null;
  }

  // ---------- the banner (folded to a pill with –; Forgeheart, round 143's look) ----------
  function fold(v = !S.safe?.folded) { if (S.safe) { S.safe.folded = Boolean(v); paint(); } }
  function paint() {
    const s = S.safe; const host = A()?.host;
    if (!s || !host) { S.el?.remove(); S.el = null; return; }
    if (!S.el || S.el.parentNode !== host) { S.el?.remove(); S.el = el('div', { class: 'lab-safe', role: 'status', dataset: { feature: 'Safe open' } }); host.append(S.el); }
    const on = s.total - s.held.size;
    S.el.classList.toggle('folded', s.folded);
    if (s.folded) {
      S.el.replaceChildren(el('button', { type: 'button', class: 'ls-pill', title: 'Safe open: the preview is light and some layers are held back (not saved). Click for the choices', on: { click: () => fold(false) } }, el('span', { class: 'ls-ic', text: '🛟' }), `Safe open · ${on}/${s.total}`));
      return;
    }
    const nx = order()[0]; const nxName = nx ? nameOf(nx) : null;
    const who = s.culprit.map(nameOf).filter(Boolean);
    const head = s.hit && who.length ? `${clip(who.join(', '), 30)} ${WORD[s.kind] || 'crashed'} the preview when it came back · kept off`
      : `${s.why === 'again' ? `${WORD[s.kind] || 'crashed'} again` : `${WORD[s.kind] || 'crashed'} last time`} · opened safely`;
    const sub = [`${on} of ${s.total} layer${s.total === 1 ? '' : 's'} on`, 'lowest quality, 1× pixels, no shadows (preview only)'];
    if (!s.hit && who.length) sub.push(`${clip(who.join(', '), 30)} ${who.length > 1 ? 'were' : 'was'} ${s.step === 'building' ? 'building' : 'drawing'} when it ${s.kind === 'hang' ? 'hung' : 'crashed'}`);
    const goTxt = !nx ? null : !s.back.length ? 'Bring layers back one by one' : `Bring back ${clip(nxName || 'the next layer', 22)}`;
    S.el.replaceChildren(
      el('span', { class: 'ls-ic', text: '🛟', attrs: { 'aria-hidden': 'true' } }),
      el('div', { class: 'ls-txt' }, el('div', { class: 'ls-head' }, el('b', { text: clip(s.name, 28) }), ` ${head}`), el('div', { class: 'ls-sub', text: sub.join(' · ') })),
      el('div', { class: 'ls-acts' },
        goTxt ? el('button', { type: 'button', class: 'ls-go', text: goTxt, title: `Turns the next layer back on in the preview (the lightest first${who.length ? ', the suspect last' : ''}), with each layer's cost shown on its row`, on: { click: () => next() } }) : el('span', { class: 'ls-all', text: `All ${s.total} back` }),
        el('button', { type: 'button', class: 'ls-norm', text: 'Open normally', title: 'Full quality and every layer, as the scene is saved (it can crash again)', on: { click: () => openNormally() } }),
        el('button', { type: 'button', class: 'ls-fold', text: '–', title: 'Fold this note (Safe open stays on)', attrs: { 'aria-label': 'Fold' }, on: { click: () => fold(true) } })));
  }

  const state = () => ({ open: S.openId, crashed: S.crashed, recovered: S.recovered, safe: S.safe ? { id: S.safe.id, why: S.safe.why, kind: S.safe.kind, held: [...S.safe.held], back: [...S.safe.back], total: S.safe.total, culprit: [...S.safe.culprit], hit: S.safe.hit, folded: S.safe.folded, note: S.safe.noteMsg || null } : null, marks: read().v, stats: { ...st }, hangMs: hangMs() });
  // a normal close isn't a crash: an open still pending is let go (a crash never gets here)
  addEventListener('pagehide', () => { if (S.openId && !S.crashed && !S.safe) letGo(S.openId); });
  // (round 153c, labwin153) the scene handed to the Lab window (this window let go of it without a crash): its open is
  // not pending any more here, so the Lab window doesn't take it for a crash of the last open
  function handOff(id) { if (!id || S.openId !== id || S.crashed || S.safe) return false; letGo(id); S.openId = null; clearTimeout(S.healthyT); S.healthyT = 0; return true; }
  return { on: (id) => Boolean(S.safe && S.safe.id === id), held: (id) => (S.safe && S.safe.id === id ? S.safe.held : null), opening, handOff, msg, tick, next, openNormally, fold, state, marker, _reset() { end(); S.openId = null; S.crashed = 0; S.recovered = true; } };
})();
window.LabSafe = LabSafe;
