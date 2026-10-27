// (round 66, bouncelog66) Session log for music (docs/upgrades/bouncelog66.md). After 10 minutes really spent in the
// Sound desk (Serum 2 / Vital, the Live set, Arrange), a small strip under the desk's top row (it stays in view while
// you scroll the desk) says
// "Nice session — 23 min." with two buttons:
//   💾 Save a 30-second sketch   the last 30 s of what the desk played (the instrument + Live set clips, before the
//                                monitor volume), written by the instrument host as a 48 kHz WAV in
//                                <data>/creative-sketches/<the desk project>/ — only on click (creative-vst-sketch.py)
//   ✓ Log it                     the session goes in the Sessions list and My Paris, and is offered as proof to every
//                                active music quest whose current step it fits (Make music at the park, Finish a track,
//                                Go to an open mic, music place quests). No XP and no review happen by themselves.
// ✕ dismisses the strip; it never comes back for that session. "Sessions" in the desk's top row lists past sessions
// with ▶ play buttons for their sketches (Show file, Remove sketch → the Trash, Log it for a session not logged yet).
// Plugs into the desk through parkjam62's ParkJam.attach / ParkJam.pause (no edit of Codex's workbench-vst.js).
// Cost: nothing until the desk opens; while it is on screen, one 30-second timer and one tiny 'sketch-status' request
// (only with an instrument open); the clock itself is timestamps. The pure parts are tools/bouncelog-core.js.
const BounceLog = (() => {
  const K = BounceLogCore;
  let h = null, sess = null, timer = null, strip = null, deskEl = null, topRow = null, panel = null, saving = false, logging = false;
  let loaded = null, list = null, player = null, said = '';
  let offset = 0; const now = () => Date.now() + offset; // (checks) _test.advance moves the clock
  const A = () => (typeof WorkbenchVST !== 'undefined' ? WorkbenchVST.api : null);
  const project = () => { try { return WorkbenchUI.snapshot().title || 'Sound desk'; } catch { return 'Sound desk'; } };
  const visible = () => !!deskEl?.isConnected && !document.hidden && (deskEl.checkVisibility?.({ visibilityProperty: true }) ?? true);

  // ---------- the Sessions store (kv 'music-sessions', DataSafe: a failed read is never "empty") ----------
  async function load() {
    if (list) return list;
    loaded = typeof DataSafe !== 'undefined' ? await DataSafe.load(K.KV, null) : await window.hub.kvGet(K.KV, null, { status: true }).then((r) => ({ value: r?.value ?? null, ok: r?.state === 'ok' || r?.state === 'missing' }));
    list = K.validate(loaded.value); return list;
  }
  let chain = Promise.resolve();
  function saveRow(st = sess) {
    if (!st) return chain;
    const row = K.entry(st, now());
    chain = chain.catch(() => {}).then(async () => {
      await load(); list = K.upsert(list, row);
      const r = typeof DataSafe !== 'undefined' ? await DataSafe.save(K.KV, list, loaded) : await window.hub.kvSet(K.KV, list);
      if (r?.refused) throw Error('Your sessions list could not be read just now, so nothing was changed.');
    });
    return chain;
  }

  // ---------- the clock ----------
  const onInput = () => { if (sess && visible()) K.activity(sess, now()); };
  function begin() {
    const r = K.enter(sess, now()); if (r.ended?.offered) saveRow(r.ended).catch(() => {}); sess = r.st;
    if (!timer) timer = setInterval(() => tick().catch(() => {}), 30000);
    document.addEventListener('pointerdown', onInput, true); document.addEventListener('keydown', onInput, true);
    document.addEventListener('visibilitychange', onVisibility);
  }
  function onVisibility() { if (!sess) return; if (document.hidden) K.leave(sess, now()); else if (deskEl?.isConnected) begin(); paint(); }
  async function tick() {
    if (!sess) return;
    if (!visible()) { if (sess.inDesk) K.leave(sess, now()); return paint(); }
    if (!sess.inDesk) { const r = K.enter(sess, now()); if (r.ended?.offered) saveRow(r.ended).catch(() => {}); sess = r.st; }
    const c = A()?.current?.(), park = typeof ParkJam !== 'undefined' ? ParkJam.state?.() : null;
    const ls = document.documentElement.classList.contains('liveset-open'), ar = !!deskEl?.querySelector('.ls-view');
    // (round 67, sketchpads67) the tempo being played: the Live set's song, Arrange's song, the last park take
    let bpm = null; try { bpm = ls && typeof LiveSet !== 'undefined' ? LiveSet._test.scene()?.bpm : ar ? h?.state?.song?.bpm : park?.on ? h?.state?.park?.takes?.[0]?.bpm : null; } catch { /* no tempo this tick */ }
    K.use(sess, { instrument: c?.name, park: !!park?.on, place: park?.place, liveset: ls, arrange: ar, bpm });
    // sound from the host counts as activity (a jam on the controller makes no clicks in the window)
    if (c?.path) {
      try { const r = await hub.vst.request({ action: 'sketch-status', plugin: c.path, name: c.name }); if (r?.ok && r.soundAgo != null && r.soundAgo < 60) K.activity(sess, now() - r.soundAgo * 1000, now()); } catch { /* no host yet */ }
    }
    K.tick(sess, now());
    if (K.shouldOffer(sess) && !sess.offered) { sess.offered = true; saveRow().catch(() => {}); }
    paint();
  }

  // ---------- the strip ----------
  function paint() {
    const show = !!sess && !!deskEl?.isConnected && (K.shouldOffer(sess) || said);
    if (!show) { if (strip) { strip.remove(); strip = null; } return; }
    if (!strip || !strip.isConnected) strip = build();
    const text = said || K.stripText(K.minutes(sess)), t = strip.querySelector('.bl-text');
    if (t.textContent !== text) t.textContent = text;
    strip.querySelector('.bl-save').hidden = !!said && sess.logged; strip.querySelector('.bl-log').hidden = sess.logged;
    const play = strip.querySelector('.bl-play'); play.hidden = !sess.sketches.length;
  }
  function build() {
    const { e, btn } = h, el = e('div', null, 'bl-strip'); el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Session log');
    el.append(e('span', '', 'bl-text'));
    const save = btn('💾 Save a 30-second sketch', () => saveSketch(), 'bl-save'); save.title = 'Keep the last 30 seconds of what the desk played, as a WAV in this project\'s sketches folder';
    const play = btn('▶ Play', () => playFile(sess.sketches[0]?.path, play), 'bl-play'); play.title = 'Listen to the sketch you just saved';
    const log = btn('✓ Log it', () => logIt(), 'bl-log'); log.title = 'Add this session to your Sessions list and My Paris, and offer it to the music quests it fits';
    const x = btn('✕', () => { K.dismiss(sess); said = ''; paint(); }, 'bl-x'); x.setAttribute('aria-label', 'Dismiss for this session'); x.title = 'Hide this for the rest of the session';
    el.append(save, play, log, x);
    if (topRow?.isConnected && topRow.parentElement === deskEl) topRow.after(el); else deskEl.prepend(el); // under the desk's top row, never over its controls
    return el;
  }
  const flash = (text, ms = 6000) => { said = text; paint(); const mine = text; setTimeout(() => { if (said === mine) { said = ''; paint(); } }, ms); return text; };

  // ---------- 💾 Save a 30-second sketch ----------
  async function saveSketch() {
    if (saving) return 'Saving…'; saving = true;
    try {
      const c = A()?.current?.(); if (!c) throw Error('Open Serum 2 or Vital in the Sound desk first.');
      const r = await hub.vst.request({ action: 'sketch-save', plugin: c.path, name: c.name, project: project() });
      if (!r?.ok) throw Error(r?.error || 'The sketch could not be saved.');
      if (!sess) sess = K.start(now());
      sess.sketches.unshift({ path: r.path, at: new Date(now()).toISOString(), seconds: r.seconds, ...(sess.bpm ? { bpm: sess.bpm } : {}) }); // (round 67) + the session's tempo, ✂ Trim loop's grid
      await saveRow();
      return flash(`Sketch saved · ${Math.round(r.seconds)} s in “${project()}” sketches.`, 8000);
    } catch (err) { flash(calmErr(err), 8000); throw err; } finally { saving = false; }
  }
  const calmErr = (err) => (typeof calmError === 'function' ? calmError(err) : err?.message || String(err));
  function playFile(file, button) {
    if (!file) return;
    if (player && player.dataset.file === file && !player.paused) { player.pause(); if (button) button.textContent = '▶ Play'; return; }
    player?.pause(); player = new Audio(WinMac.fileUrl(file)); player.dataset.file = file;
    player.addEventListener('ended', () => { if (button) button.textContent = '▶ Play'; }, { once: true });
    player.play().catch(() => {}); if (button) button.textContent = '■ Stop';
  }

  // ---------- ✓ Log it ----------
  const fromRow = (r) => ({ id: r.id, start: Date.parse(r.start), last: Date.parse(r.end), active: r.minutes * K.MIN, used: { desk: true, ...r.used }, instruments: r.instruments, place: r.place, sketches: r.sketches, logged: !!r.logged, ...(r.bpm ? { bpm: r.bpm } : {}) });
  async function credit(st) {
    if (typeof QuestHud === 'undefined' && window.Lazy) await Lazy.load('questhud').catch(() => {}); // the ✦ tracker's careful journal writer
    const Hud = typeof QuestHud !== 'undefined' ? QuestHud : null; if (!Hud?.write) return { quests: [], note: '' };
    await Hud.refresh?.().catch(() => {}); const j = Hud.journal?.(); if (j?.status !== 'ok' || !j.S) return { quests: [], note: '' };
    const C = j.C || (typeof QuestCore !== 'undefined' ? QuestCore : null); if (!C) return { quests: [], note: '' }; const fit = K.credits(C, j.S, st); if (!fit.length) return { quests: [], note: '' };
    // the proof: the newest sketch, else a short session note (Codex's proof contract needs a file)
    const sk = st.sketches[0] || null;
    let file = sk?.path, kind = 'audio/wav';
    if (!file) { const n = await hub.bouncelog.note(project(), K.noteText(st)); if (!n?.ok) throw Error(n?.error || 'The session note could not be written.'); file = n.path; kind = 'text/plain'; }
    const bytes = new Uint8Array(await hub.fs.read(file, { encoding: 'buffer', maxBytes: 80 * 1048576 }));
    if (!bytes.length) throw Error('The sketch file is gone; save another one.');
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((b) => b.toString(16).padStart(2, '0')).join('');
    const proof = { type: 'file', title: file.split(/[\\/]/).pop().slice(0, 200), path: await hub.importRef(file), kind, bytes: bytes.length, fingerprint, images: [], ...K.proofText(st, sk) };
    const done = [];
    await Hud.write((s) => { for (const f of fit) { try { const item = C.submit(s, f.quest, proof, K.intentOf(st, f)); done.push({ ...f, submission: item.id }); } catch { /* that step changed meanwhile */ } } }, 'Session offered as proof. Review it from the quest when you like.');
    return { quests: done.map((f) => ({ campaign: f.campaign, quest: f.quest, step: f.step, title: f.title, submission: f.submission })) };
  }
  async function logIt(st = sess, { quiet = false } = {}) {
    if (!st) throw Error('No session yet: play in the Sound desk first.');
    if (logging) return 'Logging…'; logging = true;
    try {
      const got = await credit(st);
      st.logged = true; st.loggedInfo = { at: new Date(now()).toISOString(), quests: got.quests };
      await saveRow(st);
      try { document.dispatchEvent(new CustomEvent('hearth:quest-week', { detail: { kind: 'music-session', at: new Date(st.start).toISOString(), title: `Music session · ${K.clock(st.active)}`, path: st.sketches[0]?.path || '' } })); } catch { /* a listener's problem never blocks a log */ }
      const n = got.quests.length, text = n ? `Logged ✓ · offered to ${n === 1 ? `“${got.quests[0].step}” (${got.quests[0].title})` : `${n} music quests`}. Review it from the quest when you like.` : 'Logged ✓ in your Sessions and My Paris. No music quest step fits this session right now.';
      if (!quiet && st === sess) flash(text, 7000);
      if (panel?.isConnected) drawPanel();
      return text;
    } catch (err) { if (!quiet && st === sess) flash(calmErr(err), 8000); throw err; } finally { logging = false; }
  }

  // ---------- Sessions (a panel over the desk, like Arrange) ----------
  function button(helpers) {
    if (helpers) h = helpers; const b = h.btn('Sessions', () => openPanel()); b.classList.add('bl-open');
    b.title = 'Your past music sessions: play their sketches, log one to your quests'; return b;
  }
  async function openPanel() {
    const host = document.querySelector('.wb-sound-desk'); if (!host || !h) throw Error('Open Creative Playground → Serum 2 / Vital first.');
    if (sess?.offered) await saveRow().catch(() => {});
    await load(); panel?.remove(); panel = h.e('section', null, 'bl-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Your music sessions');
    host.append(panel); drawPanel(); panel.scrollIntoView?.({ block: 'start' }); panel.querySelector('.bl-close')?.focus({ preventScroll: true });
    return `${list.sessions.length} session${list.sessions.length === 1 ? '' : 's'}.`;
  }
  function closePanel() { player?.pause(); if (window.Lazy?.loaded?.('sketchpads')) SketchPads.close(); panel?.remove(); panel = null; } // (round 67) + the trim's preview stops
  function drawPanel() {
    if (!panel || !h) return; const { e, btn } = h; if (window.Lazy?.loaded?.('sketchpads')) SketchPads.close(); panel.replaceChildren();
    const head = e('div', null, 'bl-head'); const close = btn('✕', () => closePanel(), 'bl-close'); close.setAttribute('aria-label', 'Close Sessions');
    head.append(e('strong', 'Sessions'), e('span', 'Every session of 10 minutes or more, newest first.', 'bl-dim'), close); panel.append(head);
    if (window.Lazy) Lazy.load('quickidea').then(() => QuickIdeas.sessionsSection(panel)).catch(() => {}); // (round 71, quickidea71) 💡 Ideas for music (saved with 💡 Quick idea → 🎵 Music), under the sessions
    const rows = list?.sessions || [];
    if (!rows.length) { panel.append(e('p', 'No sessions yet. Play in the Sound desk for 10 minutes and Hearth offers to keep it here, with a 30-second sketch if you want one.', 'bl-empty')); return; }
    const ul = e('ul', null, 'bl-list');
    for (const r of rows.slice(0, 60)) {
      const li = e('li', null, 'bl-row'); li.dataset.session = r.id;
      const top = e('div', null, 'bl-top'); top.append(e('strong', K.rowTitle(r)), e('span', K.rowWhat(r), 'bl-dim'));
      top.append(r.logged ? e('span', r.logged.quests?.length ? `✓ Logged · ${r.logged.quests.map((q) => q.title).join(', ')}` : '✓ Logged', 'bl-badge') : btn('✓ Log it', () => logIt(r.id === sess?.id ? sess : fromRow(r), { quiet: true }).then((t) => { h.say?.(t); }), 'bl-log-row'));
      li.append(top);
      for (const k of r.sketches) {
        const line = e('div', null, 'bl-sketch'); const play = btn('▶', () => playFile(k.path, play), 'bl-play-row'); play.setAttribute('aria-label', `Play the sketch of ${K.rowTitle(r)}`); play.title = 'Play the sketch';
        line.append(play, e('span', `Sketch · ${Math.round(k.seconds)} s · ${new Date(k.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`), btn('Show file', () => hub.fs.reveal(k.path), 'bl-quiet'), btn('Remove sketch', () => removeSketch(r, k), 'bl-quiet'));
        li.append(line);
      }
      if (!r.sketches.length) li.append(e('span', 'No sketch saved.', 'bl-dim'));
      ul.append(li);
    }
    panel.append(ul);
    // (round 67, sketchpads67) each sketch gets 🎛 Put on a pad and ✂ Trim loop (+ the loops trimmed from it): loaded on first open
    if (rows.some((r) => r.sketches.length) && window.Lazy) Lazy.load('sketchpads').then(() => SketchPads.decorate(panel, rows, h)).catch(() => {});
  }
  async function removeSketch(r, k) {
    if (!(await hub.bouncelog.ours(k.path))) throw Error('That file is not in the sketches folder; nothing was removed.');
    const t = await hub.fs.trash([k.path]); if (t?.failed?.length) throw Error(t.failed[0].error);
    const st = r.id === sess?.id ? sess : fromRow(r); st.sketches = st.sketches.filter((x) => x.path !== k.path); if (st.logged && !st.loggedInfo) st.loggedInfo = r.logged;
    await saveRow(st); drawPanel(); h?.say?.('Sketch moved to the Trash.');
  }

  // ---------- the desk hooks (parkjam62's attach / pause) ----------
  function attach(out, row, helpers) { h = helpers; deskEl = out; topRow = row; row.append(button(helpers)); begin(); paint(); }
  function pause() {
    if (sess) { K.leave(sess, now()); if (sess.offered) saveRow().catch(() => {}); }
    clearInterval(timer); timer = null; document.removeEventListener('pointerdown', onInput, true); document.removeEventListener('keydown', onInput, true); document.removeEventListener('visibilitychange', onVisibility);
    strip?.remove(); strip = null; closePanel(); deskEl = null; topRow = null; said = '';
  }

  // ---------- from chat (secondary: everything above is a click) ----------
  async function run(args = '') {
    const w = String(args).trim().toLowerCase();
    if (w === 'sketch' || w === 'save') return saveSketch();
    if (w === 'log') return logIt();
    if (/^(trim|pad)\b/.test(w)) { await Lazy.load('sketchpads'); return SketchPads.run(w); } // (round 67, sketchpads67) the newest sketch: ✂ Trim loop / 🎛 Put on a pad
    if (w === 'now' || w === 'status') return sess ? `This session: ${K.clock(sess.active)} (${K.what(sess)})${sess.logged ? ' · logged' : ''}.` : 'No session yet: open the Sound desk and play.';
    if (typeof ParkJam !== 'undefined') await ParkJam.desk();
    return openPanel();
  }
  if (typeof Commands !== 'undefined' && !Commands.get('sessions')) {
    Commands.register({ name: 'sessions', args: '[sketch | log | now | trim | pad]', area: 'Create', desc: 'Your music sessions in the Sound desk: the list with sketches to play, save the last 30 seconds, log this session to your music quests, trim a loop from a sketch, put a sketch on a Live set pad', run: (a, ctx) => run(a).then((t) => t && ctx?.say?.(t)),
      complete: (a) => [['sketch', 'save the last 30 seconds'], ['log', 'log this session'], ['now', 'this session so far'], ['trim', 'trim a loop from the newest sketch'], ['pad', 'put the newest sketch on a Live set pad']].filter(([v]) => v.startsWith(String(a || '').trim().toLowerCase())).map(([value, hint]) => ({ value, hint })),
      examples: ['/sessions', '/sessions sketch', '/sessions log'], keywords: 'session log music sketch bounce last 30 seconds serum vital sound desk journal quest trim loop pad live set bpm' });
  }
  try { AppUI.addAction?.('Sound desk: my music sessions', () => run('').catch((err) => toast(calmErr(err), { type: 'error' }))); } catch { /* no palette */ }

  return { attach, pause, button, openPanel, closePanel, saveSketch, logIt, run, session: () => sess, list: () => list,
    _test: { advance: (ms) => { offset += ms; }, tick, now, reset: () => { sess = null; said = ''; offset = 0; paint(); }, strip: () => strip, timer: () => !!timer } };
})();
