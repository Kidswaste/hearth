// ▶ Play's playtest notes (round 62, playnotes62), the hub side (lazy group "gamemode", after playloop.js). While
// Clink plays, F8 (WinMac.keyLabel: the same on both; /playtest key to change it) drops a note at that moment: the
// frame's picture, the time into the session, what the game saves (a Lab layer's saveState(), an HTML build's
// window.hearthState()), its camera / the player's position, the frame rate then (the performance probe when it's
// attached, else the budget watch's last second), and words if you want: Shift+F8 opens a small box over the game
// (typed, or 🎤 Hearth's voice input, only when pressed). The key is read main-side with Esc / F (playnotesmain.js):
// nothing of this runs in the game window until it's pressed.
// After the session (Ctrl/⌘+P back to editing, or leaving) "3 notes from this playtest" opens the Playtest log: each
// note's picture and line; a click jumps the Lab's scene back to that moment (the layers' restoreState(), their
// cameras); "Fix this" drafts it for the Three Director with its picture attached (never sent: you press Enter).
// Chat: /playtest notes [game] · /playtest note <n> · /playtest fix <n> · /playtest clear [game] · /playtest key <F1–F10>.
// Notes: data/game-cache/<game>/notes (log.json + a JPEG each); the game's own files are never touched. 0 tokens until
// you send a draft.
const PlayNotes = (() => {
  const C = PlayNotesCore;
  const KEY = 'playnotes.key';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const GM = () => GameMode;
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const label = (t) => (typeof WinMac !== 'undefined' && WinMac.keyLabel ? WinMac.keyLabel(t) : t);
  const fail = (err) => toast(window.calmError ? calmError(err) : String(err?.message || err), { type: 'error', raw: err });
  const S = { session: null, source: null, n: 0, told: 0, view: null, stats: { jumps: 0, drafts: 0, voice: 0 }, last: null };
  const N = (req) => window.hub.game.notes(req);

  // ---------- the key (a setting; the window reads it main-side) ----------
  const keyText = () => (C.combo(store.get(KEY, C.DEFAULT_KEY)) || C.combo(C.DEFAULT_KEY)).text;
  function prefs() { const k = keyText(); return { key: k, label: label(k) }; }
  async function setKey(text) {
    const c = C.combo(text);
    if (!c) return null;
    store.set(KEY, c.text);
    await N({ op: 'key', key: c.text, label: label(c.text) }).catch(() => null);
    return c.text;
  }

  // ---------- the session: what this playtest noted ----------
  GM().on((e) => {
    if (e.type === 'start') { S.session = e.info?.started || null; S.source = e.source; S.n = 0; S.told = 0; }
    else if (e.type === 'end') { const n = S.n; const src = e.source; if (n) setTimeout(() => tell(src, n, S.session), 400); }
  });
  window.hub.game?.onLoop?.((d = {}) => { if (d.type === 'rested' && S.n > S.told && S.source) tell(S.source, S.n, S.session); });
  function tell(source, n, session) {
    S.told = n;
    toast(`✎ ${n} note${n === 1 ? '' : 's'} from this playtest`, { timeout: 9000, action: { label: 'Open the log', fn: () => open({ source, session }).catch(fail) } });
  }
  window.hub.game?.onNotes?.((d = {}) => {
    if (d.type === 'added') {
      if (S.source && GameCore.sameSource(S.source, d.source)) { S.n = d.n || S.n + 1; S.session = d.session || S.session; }
      S.last = d.note || null;
      if (S.view && GameCore.sameSource(S.view.source, d.source)) S.view.refresh();
    } else if (d.type === 'voice') voice(d).catch(fail);
    else if (d.type === 'text' && S.view && GameCore.sameSource(S.view.source, d.source)) S.view.textOf(d.id, d.text);
  });

  // ---------- words said (Hearth's voice input, only when 🎤 is pressed in the box) ----------
  async function voice(d) {
    S.stats.voice += 1;
    const say = (status) => N({ op: 'box', status }).catch(() => {});
    if (typeof Voice === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('voice').catch(() => {});
    if (typeof Voice === 'undefined') { say('🎤 Voice input isn\'t in this Hearth: type instead'); return; }
    if (Voice.state().state !== 'off') Voice.cancel();
    const started = await Voice.start({ mode: 'toggle', into: (text) => {
      if (text) N({ op: 'text', source: d.source, id: d.id, text, append: true, echo: true }).catch(() => {});
      else say('🎤 Didn\'t catch anything: try again, or type');
    } });
    say(started ? '🎤 Listening… (stops when you stop talking)' : '🎤 Voice input isn\'t set up (/voice): type instead');
  }

  // ---------- jump back to a note ----------
  const camsCode = (cams) => `const cams = ${JSON.stringify(cams || {})}; let c = 0; const sc = globalThis.__scenes || {};
    for (const k of Object.keys(cams)) { const v = sc[k] || (k === 'camera' && globalThis.camera ? { camera: globalThis.camera } : null); const cam = v && v.camera; const s = cams[k];
      if (!cam || !cam.isCamera) continue; cam.position.fromArray(s.p); if (s.q) cam.quaternion.fromArray(s.q); if (s.z && cam.zoom !== s.z) { cam.zoom = s.z; cam.updateProjectionMatrix(); } cam.updateMatrixWorld(true); c += 1; }`;
  async function full(source, id) { const r = await N({ op: 'get', source, id }); if (!r?.ok) throw new Error('That note is gone.'); return r; }
  // a Lab scene: open it in the Lab, its layers' restoreState() with what they saved then, their cameras where they were
  async function jump(source, id) {
    const { note } = await full(source, id);
    if (!note.state && !note.cams) return { ok: false, why: note.stateBig ? 'its saved state was too big to keep' : 'the game saved nothing then (no saveState() / hearthState())' };
    S.stats.jumps += 1;
    if (source.kind === 'lab') {
      if (H.activeId !== 'tool:three') activate('tool:three');
      for (let i = 0; i < 100 && !(Lab()?.scenes && Lab()?.director); i += 1) await sleep(100);
      const L = Lab();
      if (!L?.director) throw new Error('The Lab isn\'t ready yet.');
      if (L.scenes.currentId() !== source.id) {
        if (!L.scenes.get?.(source.id) && !L.scenes.all().some((s) => s.id === source.id)) throw new Error('That Lab scene is gone.');
        L.scenes.open(source.id);
      }
      // the scene's layers running (and their hooks in) before their state goes back
      const want = Object.keys(note.state || {});
      let r = null;
      for (let i = 0; i < 60; i += 1) {
        r = await L.director.evalInSketch(`return JSON.stringify(window.__labHot ? window.__labHot.info().hooks : null)`).catch(() => null);
        const hooks = r?.ok ? JSON.parse(r.value || 'null') : null;
        if (hooks && want.every((x) => hooks.includes(x))) break;
        await sleep(150);
      }
      const code = `const st = ${JSON.stringify(note.state || {})}; const n = window.__labHot ? window.__labHot.restore(st) : 0; ${camsCode(note.cams)} return JSON.stringify({ n, c });`;
      const out = await L.director.evalInSketch(code);
      if (!out?.ok) throw new Error(out?.error || 'The Lab preview did not answer.');
      const v = JSON.parse(out.value || '{}');
      return { ok: v.n > 0 || v.c > 0, where: 'lab', layers: v.n, cameras: v.c };
    }
    // an HTML build: it plays (▶ Play, if it isn't), then window.hearthRestore(state) and its camera, in the game window
    let st = GM().state();
    if (!st.playing || st.live || !GameCore.sameSource(st.source, source)) {
      await GM().play(source);
      for (let i = 0; i < 80; i += 1) { if ((await window.hub.game.eval('Boolean(document.querySelector("canvas"))').catch(() => null))?.value) break; await sleep(150); }
      await sleep(800);
      st = GM().state();
    } else if (st.resting && typeof PlayLoop !== 'undefined') await PlayLoop.wake();
    const code = `(() => { const st = ${JSON.stringify(note.state ?? null)}; let n = 0; if (st != null && typeof window.hearthRestore === 'function') { window.hearthRestore(st); n = 1; } ${camsCode(note.cams)} return JSON.stringify({ n, c }); })()`;
    const r = await window.hub.game.eval(code);
    if (r?.error) throw new Error(r.error);
    const v = JSON.parse(r?.value || '{}');
    return { ok: v.n > 0 || v.c > 0, where: 'game', layers: v.n, cameras: v.c, why: v.n ? '' : 'the game has no window.hearthRestore(state)' };
  }

  // ---------- hand it to the Three Director: a draft, never sent ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function director() {
    if (directorOf()) return directorOf();
    await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'playnotes', say: () => {}, note: () => {} });
    for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
    return directorOf();
  }
  async function fix(source, id) {
    const { note, game } = await full(source, id);
    const text = C.draft(note, { title: game?.title || source.title });
    if (source.kind === 'lab') await jump(source, id).catch(() => null); // (the director's preview shows that moment)
    const shot = note.shot ? await N({ op: 'shot', source, id, path: true }).catch(() => null) : null;
    const dir = await director().catch(() => null);
    S.stats.drafts += 1;
    if (dir) {
      if (H.activeId !== 'tool:three' && source.kind === 'lab') activate('tool:three');
      Tools.openDock?.('three');
      const there = () => [...document.querySelectorAll('.composer textarea')].some((t) => t.value === text);
      for (let i = 0; i < 14 && !there(); i += 1) { Native.setDraft?.(dir.id, text); if (!there()) await sleep(150); }
      if (there()) {
        if (shot?.ok && shot.path) await Native.attachPaths?.(dir.id, [shot.path]).catch(() => {});
        toast(`In ${dir.name}'s box with the picture, not sent: press Enter when it reads right`, { timeout: 4500 });
        S.lastDraft = text;
        return { drafted: true, text, picture: Boolean(shot?.ok) };
      }
    }
    navigator.clipboard?.writeText(text).catch(() => {});
    toast('Copied the note for the director (its chat isn\'t open): paste it there', { timeout: 4000 });
    S.lastDraft = text;
    return { drafted: false, text };
  }

  // ---------- the Playtest log ----------
  async function gameFor(arg) {
    const a = String(arg || '').trim();
    if (a) return GM().resolve(a);
    const st = GM().state();
    return (st.playing && !st.live && st.source) || S.source || GM().last() || null;
  }
  async function open({ source = null, session = null } = {}) {
    const s = source || (await gameFor(''));
    if (!s) { toast('No game yet: ▶ Play one, then F8 drops a note'); return null; }
    S.view?.close();
    const r = await N({ op: 'list', source: s });
    if (!r?.ok) throw new Error(r?.why || 'The notes couldn\'t be read.');
    let only = session && r.notes.some((n) => n.session === session) ? session : null;
    const dialog = el('dialog', { class: 'ui-modal pn-log', attrs: { 'aria-label': 'Playtest log' } });
    const list = el('div', { class: 'pn-list', attrs: { role: 'list' } });
    const sub = el('div', { class: 'pn-sub' });
    const scope = el('button', { type: 'button', class: 'ghost small pn-scope' });
    const close = () => { try { dialog.close(); } catch { /* gone */ } };
    let notes = r.notes;
    const thumbs = new Map();
    function paint() {
      const shown = only ? notes.filter((n) => n.session === only) : notes;
      const k = prefs().label;
      sub.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}${only ? ` · this playtest: ${shown.length}` : ''} · ${k} in ▶ Play drops one · a click jumps there`;
      scope.textContent = only ? 'All notes' : 'This playtest';
      scope.hidden = !session || !notes.some((n) => n.session === session) || notes.every((n) => n.session === session);
      list.replaceChildren(...(shown.length ? shown.map(row) : [el('div', { class: 'pn-empty', text: `No notes yet. While ${s.title || 'the game'} plays, ${k} drops one (Shift+${k}: with words).` })]));
    }
    function row(n) {
      const img = el('img', { class: 'pn-shot', alt: '', attrs: { loading: 'lazy' } });
      if (n.shot) { const t = thumbs.get(n.id); if (t) img.src = t; else N({ op: 'shot', source: s, id: n.id, width: 240 }).then((x) => { if (x?.ok) { const u = `data:${x.mime};base64,${x.data}`; thumbs.set(n.id, u); img.src = u; } }).catch(() => {}); } else img.classList.add('none');
      const words = el('input', { class: 'pn-words', value: n.text || '', placeholder: 'Words for this note…', attrs: { 'aria-label': `Words for note ${n.i}` },
        on: { click: (e) => e.stopPropagation(), keydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); words.blur(); } },
          change: () => N({ op: 'text', source: s, id: n.id, text: words.value }).then(() => { n.text = words.value; }).catch(fail) } });
      const meta = el('div', { class: 'pn-meta', text: [C.clock(n.secs), C.perfText(n.perf, n.hz), C.posText(n.pos)].filter(Boolean).join(' · ') });
      const act = (text, title, fn) => el('button', { type: 'button', class: 'ghost small', text, title, on: { click: (e) => { e.stopPropagation(); fn(); } } });
      const node = el('div', { class: `pn-row${n.canJump ? '' : ' nojump'}`, tabIndex: 0, attrs: { role: 'listitem', 'data-id': n.id }, title: n.canJump ? 'Jump the Lab back to this moment' : 'The game saved nothing then: picture and numbers only',
        on: { click: () => go(n), keydown: (e) => { if (e.key === 'Enter' && e.target === node) go(n); } } },
      el('span', { class: 'pn-i', text: String(n.i) }), img,
      el('div', { class: 'pn-body' }, meta, words),
      el('div', { class: 'pn-acts' },
        act('Fix this', 'Hand it to the Three Director as a task (drafted with its picture, not sent)', () => { close(); fix(s, n.id).catch(fail); }),
        act('✕', 'Remove this note (its picture goes to the Trash)', async () => { const x = await N({ op: 'remove', source: s, id: n.id }); if (x?.ok) { notes = notes.filter((y) => y.id !== n.id); notes.forEach((y, i) => { y.i = i + 1; }); paint(); } })));
      return node;
    }
    async function go(n) {
      if (!n.canJump) { toast('That note has the picture and numbers only (the game saved nothing then)', { timeout: 3500 }); return; }
      close();
      const x = await jump(s, n.id).catch((err) => ({ ok: false, why: err.message }));
      toast(x.ok ? `↺ ${s.title || 'The game'} at ${C.clock(n.secs)}${x.where === 'lab' ? ` in the Lab (${x.layers} layer${x.layers === 1 ? '' : 's'} restored${x.cameras ? `, ${x.cameras} camera${x.cameras === 1 ? '' : 's'}` : ''})` : ''}` : `Couldn't jump there: ${x.why || 'nothing to restore'}`, { timeout: 4000 });
    }
    scope.addEventListener('click', () => { only = only ? null : session; paint(); });
    const clear = el('button', { type: 'button', class: 'ghost small danger', text: 'Clear…', title: 'Move every note of this game to the Trash',
      on: { click: async () => { if (!(await Modal.confirm('Clear the playtest log?', `Every note of ${s.title || 'this game'} and its pictures go to the Trash.`, { ok: 'Move to Trash', danger: true }))) return; await N({ op: 'clear', source: s }); notes = []; paint(); } } });
    dialog.append(el('form', { method: 'dialog' },
      el('div', { class: 'pn-head' }, el('h2', { text: `Playtest log · ${s.title || r.game?.title || 'game'}` }), scope),
      sub, list,
      el('div', { class: 'dialog-actions' }, clear, el('span', { class: 'spacer' }), el('button', { type: 'submit', class: 'primary', text: 'Close' }))));
    dialog.addEventListener('close', () => { if (S.view?.dialog === dialog) S.view = null; setTimeout(() => dialog.remove(), 0); });
    document.body.append(dialog);
    paint();
    dialog.showModal();
    S.view = {
      dialog, source: s, close,
      refresh: async () => { const x = await N({ op: 'list', source: s }).catch(() => null); if (x?.ok) { notes = x.notes; paint(); } },
      textOf: (id, text) => { const n = notes.find((y) => y.id === id); if (n) n.text = text; const inp = list.querySelector(`[data-id="${CSS.escape(id)}"] .pn-words`); if (inp && document.activeElement !== inp) inp.value = text; },
    };
    return S.view;
  }

  // ---------- chat: /playtest notes | note <n> | fix <n> | clear | key ----------
  async function command(a) {
    const m = String(a || '').trim().match(/^(notes?|log|clear|fix|jump|key)\b\s*(.*)$/i);
    if (!m) return null;
    const verb = m[1].toLowerCase(); const rest = m[2].trim();
    if (verb === 'key') {
      if (!rest) return `Playtest notes: ${prefs().label} drops a note in ▶ Play, Shift+${prefs().label} with words. /playtest key F9 changes it (F1–F10, or a letter with Ctrl / Alt / ⌘).`;
      const k = await setKey(rest);
      return k ? `Playtest notes on ${label(k)} (Shift+${label(k)}: with words), from now on.` : `“${rest}” can't be the note key: F1–F10, or a letter / digit with Ctrl, Alt or ⌘ (not the game's plain keys, F, Esc or ${label('Ctrl+P')}).`;
    }
    // "note 2" / "fix 2" (a number in this game's log), else a game's name
    const num = /^\d+$/.test(rest) ? Number(rest) : null;
    const s = await gameFor(num == null ? rest : '');
    if (!s) return 'No game yet: ▶ Play one, then F8 drops a note.';
    const r = await N({ op: 'list', source: s });
    if (!r?.ok) return `Couldn't read ${s.title}'s notes: ${r?.why || 'unknown'}`;
    if (verb === 'clear') {
      if (!r.notes.length) return `${s.title} has no playtest notes.`;
      const x = await N({ op: 'clear', source: s });
      if (S.view && GameCore.sameSource(S.view.source, s)) S.view.close();
      return x?.ok ? `Moved ${x.n} playtest note${x.n === 1 ? '' : 's'} of ${s.title} (and their pictures) to the Trash.` : `Nothing cleared: ${x?.why || 'unknown'}`;
    }
    if (verb === 'fix' || verb === 'jump' || (verb === 'note' && num != null)) {
      const n = num != null ? r.notes[num - 1] : r.notes[r.notes.length - 1];
      if (!n) return `${s.title} has ${r.notes.length} note${r.notes.length === 1 ? '' : 's'}: /playtest notes lists them.`;
      if (verb === 'fix') { const x = await fix(s, n.id); return x.drafted ? `Note ${n.i} is in the director's box with its picture, not sent.` : 'Copied the note for the director (its chat isn\'t open).'; }
      const x = await jump(s, n.id).catch((err) => ({ ok: false, why: err.message }));
      return x.ok ? `↺ ${s.title} at ${C.clock(n.secs)} (note ${n.i}).` : `Couldn't jump to note ${n.i}: ${x.why || 'nothing to restore'}`;
    }
    // notes / log: the list here, and the log opened
    const k = prefs().label;
    if (!r.notes.length) return `${s.title} has no playtest notes yet: while it plays in ▶ Play, ${k} drops one (Shift+${k}: with words).`;
    const mine = S.session && GameCore.sameSource(S.source, s) ? r.notes.filter((n) => n.session === S.session).length : 0;
    open({ source: s, session: mine ? S.session : null }).catch(() => {});
    const shown = r.notes.slice(-12);
    return [`${s.title} — ${r.notes.length} playtest note${r.notes.length === 1 ? '' : 's'}${mine ? ` (this playtest: ${mine})` : ''}:`,
      ...shown.map((n) => `${n.i}. ${n.line || C.clock(n.secs)}`),
      r.notes.length > shown.length ? `(+${r.notes.length - shown.length} earlier in the log)` : '',
      '/playtest note <n> jumps the Lab there · /playtest fix <n> drafts it for the director · /playtest clear'].filter(Boolean).join('\n');
  }

  // ---------- menus, palette, keys ----------
  function menuItems() {
    const s = GM().state().source || S.source || GM().last();
    return s ? [{ label: '✎ Playtest log', hint: `${prefs().label} in ▶ Play drops a note`, action: () => open({ source: s, session: S.session }).catch(fail) }] : [];
  }
  try { Keys.add({ area: '▶ Play', keys: C.DEFAULT_KEY, what: 'In the game: a playtest note (picture, time, state, fps); Shift+F8 with words · /playtest key changes it' }); } catch { /* no keys sheet */ }
  try { AppUI.addAction?.('✎ Playtest log', () => open({ session: S.session }).catch(fail)); } catch { /* no palette */ }

  return { prefs, setKey, open, jump, fix, command, menuItems, take: (box = false) => N({ op: 'take', box }), state: () => ({ session: S.session, n: S.n, told: S.told, source: S.source, key: keyText(), view: Boolean(S.view), stats: { ...S.stats }, last: S.last, lastDraft: S.lastDraft || null }) };
})();
