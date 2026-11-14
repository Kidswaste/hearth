// (round 128, aiprep128) The project brief, the window side (lazy group `projectbrief`, after `projects`). Before a director
// builds, the AI has already looked at the project: one cheap pass over its moodboard, Lab references, the song's
// analysis, the scene's outline and the owner's intent writes a short plan (projectbrief-core.js has the pure parts).
//   · the plan card at the top of a project's Lab chat / Three Director chat: mood, palette, the first steps as a
//     checklist, questions; ▶ Start with step N (sends that step as the owner's message, only on that click), ✎ Edit the
//     brief, ↻ Refresh (when the moodboard / refs / song / notes changed since), Hide, and "Let the AI look at the
//     moodboard" (the explicit per-project consent: without it no picture ever goes to the AI)
//   · the director knows it: its compact form rides along as the `brief` prompt part (engines.js, options.brief) and the
//     whole brief is three_do brief (this file's three_brief handler)
//   · /brief [prepare|refresh|edit|show|hide|look on|off] and a Ctrl/⌘+K line
// Contract (projcreate128's new-project wizard): ProjectBrief.prepare(projectId, opts) → Promise<brief> ·
// get(projectId) → brief | null · stale(projectId) → bool · card(projectId) → HTMLElement · open(projectId).
// Nothing is sent or uploaded by itself: prepare runs when the owner asks (a click, /brief, the wizard's tick).
const ProjectBrief = (() => {
  const C = ProjectBriefCore;
  const PERSONA = 'You plan music-visual projects for a three.js editor. Be concrete and brief. Reply with JSON only.';
  const HIDDEN = 'projectbrief.hidden'; // this computer's view choice: { projectId: the brief's time it was hidden at }
  let data = C.norm(null); let readOk = false; let readP = null;
  const now = new Map(); // projectId → { fp, t }: the latest fingerprints (stale())
  const checking = new Set();
  const preparing = new Map(); // projectId → its prepare() promise
  const listeners = new Set();
  const calm = (err) => (window.calmError ? calmError(err) : String(err?.message || err));

  // ---------- the store (kv 'project-briefs', synced with the projects) ----------
  function ready() {
    readP ||= (async () => {
      const r = await window.hub.kvGet(C.STORE, null, { status: true }).catch(() => null);
      // a read that failed is never "empty": nothing is saved over it (datasafe)
      if (r?.state === 'ok' || r?.state === 'missing') { data = C.norm(r.value); readOk = true; } else readOk = false;
      paintAll();
    })();
    return readP;
  }
  const write = async () => { if (!readOk) throw new Error('The project briefs couldn\'t be read, so nothing is saved over them.'); await window.hub.kvSet(C.STORE, data); };
  const saveSoon = saver(() => write().catch((err) => toast(calm(err), { type: 'error' })), 300);
  window.StoreAck?.hold(C.STORE, {
    name: 'Project briefs', saver: saveSoon, read: () => StoreAck.kv(C.STORE, null),
    apply: (d) => { if (!readOk) return false; data = C.norm(d); now.clear(); paintAll(); return true; },
  });
  const entry = (pid) => C.entry(data, pid);
  const set = (pid, patch) => { data = C.put(data, pid, patch); saveSoon(); emit(pid); };
  const emit = (pid) => { for (const fn of listeners) { try { fn(pid); } catch (err) { console.warn(err); } } paintAll(); };

  // ---------- the project and what it holds ----------
  const P = () => (typeof Projects !== 'undefined' ? Projects : null);
  const project = (pid) => P()?.get(pid) || null;
  const projectOfChat = (chatId) => P()?.projectOfChat?.(chatId) || null;
  const lastRef = (p, type) => p.items.filter((x) => x.type === type).sort((a, b) => (b.at || 0) - (a.at || 0))[0]?.ref || null;
  const sceneOf = (p) => p.workspace?.sceneId || lastRef(p, 'scene');
  const boardOf = (p) => p.workspace?.boardId || lastRef(p, 'board');
  const kv = async (name, d) => { try { return (await window.hub.kvGet(name, d)) ?? d; } catch { return d; } };
  const native = (a) => a && a.mode === 'native';
  const isDirector = (a) => Boolean(a && (a.threeTools || a.dock === 'three'));
  // the project's default AI: its Lab chat's, else a director's or any chat's in it, else Claude
  function agentOf(p) {
    const chats = p.items.filter((x) => x.type === 'chat').map((x) => (H.chats || []).find((c) => c.id === x.ref)).filter(Boolean);
    const ws = chats.find((c) => c.id === p.workspace?.chatId);
    const a = [ws, ...chats].map((c) => c && H.agent(c.agentId)).find(native);
    return a || H.claudeAgent?.() || H.agents().find(native) || null;
  }
  // the chat a plan card belongs in: the project's Lab chat, or a director's chat in the project
  const cardChat = (agentId, chat, p) => Boolean(p && chat && (p.workspace?.chatId === chat.id || isDirector(H.agent(agentId))));

  // opts: { moodboard, refs, song, scene, notes }: given → used as is, false → left out, none → read from the project.
  // light: a staleness check (no song analysis, nothing loaded for it)
  async function gather(pid, opts = {}, { light = false } = {}) {
    const p = project(pid);
    if (!p) throw new Error('That project isn\'t here.');
    const raw = { project: { name: p.name, notes: p.notes, workspace: p.workspace } };
    if (typeof opts.notes === 'string') raw.notes = opts.notes;
    const sid = sceneOf(p);
    if (opts.moodboard !== false) {
      if (opts.moodboard && typeof opts.moodboard === 'object') raw.board = opts.moodboard;
      else {
        const id = boardOf(p);
        if (id) {
          if (!light && window.Lazy && !Lazy.loaded('board')) await Lazy.load('board').catch(() => {});
          const b = (typeof Board !== 'undefined' ? await Board.load(id).catch(() => null) : null) || await kv(`board-${id}`, null);
          const name = (typeof Board !== 'undefined' ? Board.boards().find((x) => x.id === id)?.name : null) || b?.name || p.items.find((x) => x.type === 'board' && x.ref === id)?.name || 'Moodboard';
          if (b) raw.board = { id, name, items: b.items || [] };
          if (b && window.MoodRead) { await MoodRead.ready(); raw.moodRead = MoodRead.briefLines(id, b.items || []); } // (round 179, moodread179) the board's deep read: the brief is written from it
        }
      }
    }
    if (opts.refs !== false) raw.refs = Array.isArray(opts.refs) ? opts.refs : sid ? ((await kv('three-refs', {}))?.[sid] || []) : [];
    let sketch = null;
    if (opts.scene !== false && !light) { // (a check skips the scene: it doesn't make a brief stale, and the scenes store is big)
      if (opts.scene && typeof opts.scene === 'object') raw.scene = opts.scene;
      else if (sid) {
        const Lab = typeof ThreeLab !== 'undefined' ? ThreeLab : null;
        sketch = Lab?.scenes?.get?.(sid) || (await kv('three-sketches', [])).find?.((s) => s.id === sid) || null;
        if (sketch) raw.scene = { name: sketch.name, layers: sketch.layers || [], palette: sketch.palette || [], frame: sketch.size || sketch.frame || null };
      }
    }
    if (opts.song !== false) {
      if (opts.song && typeof opts.song === 'object') raw.song = opts.song.analysis || opts.song.name || opts.song.path ? opts.song : { analysis: opts.song };
      else if (sid) {
        const path = (await kv('three-lab-extras', {}))?.[sid]?.media?.path || null;
        if (path) {
          raw.song = { path };
          if (!light) {
            try {
              const lab = typeof ThreeLab !== 'undefined' ? ThreeLab.director?.media : null;
              if (lab?.path === path && lab.analysis) raw.song.analysis = lab.analysis;
              else {
                if (window.Lazy && !Lazy.loaded('lab')) await Lazy.load('lab');
                const got = await ThreeBackstage.songPrep.get(path);
                if (got?.analysis) raw.song.analysis = got.analysis;
              }
            } catch (err) { console.warn('brief: the song', err); }
          }
        }
      }
    }
    return raw;
  }
  // the moodboard as one overview picture (only reached with the project's consent: projectbrief-core.js request)
  async function picture(raw) {
    if (!raw.board?.id || typeof BoardEyes === 'undefined') return null;
    const b = await Board.load(raw.board.id);
    if (!b) return null;
    const { canvas } = await BoardEyes.overview(b, { size: 'small' });
    return window.hub.saveAttachment(`brief-${Date.now()}.jpg`, BoardEyes.jpeg(canvas, 0.75));
  }
  async function ask(p, rq) {
    const a = agentOf(p);
    if (!a) throw new Error('Add a native AI in Settings first.');
    if (window.Lazy && !Lazy.loaded('budget')) await Lazy.load('budget').catch(() => {});
    const cheap = window.Autocompact?.CHEAP?.[a.engine] || null; // the cheapest model + effort (autocompact.js), else the AI's own at low effort
    const r = await window.hub.askOnce({ agentId: a.id, text: rq.text, images: rq.images, options: { lean: true, helper: true, persona: PERSONA, ...(cheap ? { model: cheap.model, effort: cheap.effort } : { effort: 'low' }), ...(a.engine === 'codex' ? { verbosity: 'low' } : {}) } }).catch((err) => ({ ok: false, error: err.message }));
    if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'project brief' } }));
    return { ...r, by: a.name };
  }

  // ---------- the contract ----------
  // prepare(projectId, opts) → Promise<brief>: opts as gather's, plus eyes: true when the owner just ticked "Let the AI
  // look at the moodboard" (stored as this project's consent), quiet: no toasts
  function prepare(pid, opts = {}) {
    if (preparing.has(pid)) return preparing.get(pid);
    const task = (async () => {
      await ready();
      if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
      const p = project(pid);
      if (!p) throw new Error('That project isn\'t here.');
      paintAll();
      const t = opts.quiet ? null : toast(`✦ Looking at “${p.name}” and writing its brief…`, { timeout: 120000 });
      try {
        const out = await C.prepare(pid, opts, {
          read: async () => data, write: async (d) => { data = d; await write(); },
          gather: (id, o) => gather(id, o), picture, ask: (rq) => ask(p, rq),
        });
        now.set(pid, { fp: entry(pid)?.fp, t: Date.now() });
        unhide(pid);
        emit(pid);
        if (!opts.quiet) toast(`✦ The brief for “${p.name}” is ready: ${out.steps.length} first steps${out.pictures ? ' (it looked at the moodboard)' : ''}`, { timeout: 5000, action: { label: 'Show', fn: () => open(pid) } });
        return out;
      } finally { t?.remove?.(); }
    })();
    preparing.set(pid, task);
    task.finally(() => { preparing.delete(pid); paintAll(); }).catch(() => {});
    return task;
  }
  // (round 129, draft129) seed(projectId, { look, steps, mood?, palette? }) → Promise<brief>: a brief stored without the AI
  // (next129's "new project from a saved template"), by: 'template', no step done. Stored like any brief: synced, its
  // inputs' fingerprints taken now (so stale() works), the plan card shows it.
  async function seed(pid, { look = '', steps = [], mood = '', palette = [], tempo = [], risks = [], questions = [] } = {}) {
    await ready();
    if (!readOk) throw new Error('The project briefs couldn\'t be read, so nothing is saved over them.');
    if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
    const p = project(pid);
    if (!p) throw new Error('That project isn\'t here.');
    const b = C.fromText(C.toText({ mood, look, palette, tempo, steps, risks, questions }));
    if (!b) throw new Error('A brief needs at least one step.');
    let fp = null;
    try { fp = C.fingerprints(C.inputs(await gather(pid, {}, { light: true }))); } catch { /* none: never stale */ }
    set(pid, { brief: b, compact: C.compact(b, p.name), fp, at: Date.now(), by: 'template', done: [], pictures: 0 });
    if (fp) now.set(pid, { fp, t: Date.now() });
    unhide(pid);
    await write();
    return get(pid);
  }
  function get(pid) { if (!readP) ready(); return C.view(entry(pid)); }
  // stale(projectId) → bool: something the brief read changed since (checked in the background, at most every 15 s)
  function stale(pid) { return staleWhat(pid).length > 0; }
  function staleWhat(pid) {
    const e = entry(pid);
    if (!e?.fp) return [];
    const n = now.get(pid);
    if (!n || Date.now() - n.t > 15000) check(pid);
    return n?.fp ? C.changed(e.fp, n.fp) : [];
  }
  async function check(pid) {
    if (checking.has(pid)) return;
    checking.add(pid);
    try {
      const was = JSON.stringify(now.get(pid)?.fp || null);
      const fp = C.fingerprints(C.inputs(await gather(pid, {}, { light: true })));
      now.set(pid, { fp, t: Date.now() });
      if (JSON.stringify(fp) !== was) paintAll();
    } catch { now.set(pid, { fp: now.get(pid)?.fp || null, t: Date.now() }); } finally { checking.delete(pid); }
  }
  // open(projectId): the project's Lab chat on screen, with the plan card at its top
  async function open(pid) {
    if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
    const p = project(pid);
    if (!p) throw new Error('That project isn\'t here.');
    unhide(pid);
    if (p.workspace && window.ProjectWorkspace) await ProjectWorkspace.open(pid, 'chat');
    else {
      const chat = p.items.filter((x) => x.type === 'chat').map((x) => (H.chats || []).find((c) => c.id === x.ref)).filter((c) => c && native(H.agent(c.agentId)))
        .sort((a, b) => Number(isDirector(H.agent(b.agentId))) - Number(isDirector(H.agent(a.agentId))) || (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      if (!chat) throw new Error(`“${p.name}” has no chat yet: open the project and start one.`);
      await P().openChat(chat.id);
    }
    paintAll();
    requestAnimationFrame(() => document.querySelector(`.pb-card[data-pid="${CSS.escape(pid)}"]`)?.scrollIntoView?.({ block: 'nearest' }));
  }

  // ---------- the owner's choices ----------
  const hidden = (pid) => { const h = store.get(HIDDEN, {})?.[pid]; const e = entry(pid); return h != null && (!e || h >= (e.at || 0)); };
  const hide = (pid) => { const h = { ...store.get(HIDDEN, {}) }; h[pid] = entry(pid)?.at || Date.now(); store.set(HIDDEN, h); paintAll(); };
  function unhide(pid) { const h = { ...store.get(HIDDEN, {}) }; if (pid in h) { delete h[pid]; store.set(HIDDEN, h); } }
  // "Let the AI look at the moodboard": this project's explicit consent (synced with it; off by default)
  const setEyes = (pid, on) => { if (!readOk) { toast('The project briefs couldn\'t be read just now.', { type: 'error' }); return; } set(pid, { eyes: on === true }); };
  function toggleStep(pid, i) {
    const e = entry(pid); if (!e) return;
    const done = new Set(e.done || []); if (done.has(i)) done.delete(i); else done.add(i);
    set(pid, { done: [...done].sort((a, b) => a - b) });
  }
  async function edit(pid) {
    const e = entry(pid); const p = project(pid);
    if (!e?.brief || !p) { toast('No brief to edit yet.', { type: 'error' }); return; }
    const text = await Modal.prompt(`The brief · ${p.name}`, { value: C.toText(e.brief), multiline: true, label: 'Change anything; keep the headings (Mood, Look, Palette, Tempo, Steps, Risks, Questions). Steps: one per line starting with "- ".' });
    if (text == null) return;
    const b = C.fromText(text);
    if (!b) { toast('A brief needs at least one step: nothing changed.', { type: 'error' }); return; }
    set(pid, { brief: b, compact: C.compact(b, p.name), edited: Date.now(), done: (e.done || []).filter((i) => i < b.steps.length) });
    toast('Brief saved: the director gets it with your next message.', { timeout: 2600 });
  }
  // ▶ Start with step N: that step as the owner's message to the director (only on this click)
  async function start(pid, agentId = null) {
    const e = entry(pid); const b = e?.brief;
    if (!b) return;
    const i = b.steps.findIndex((_s, k) => !(e.done || []).includes(k));
    const k = i < 0 ? 0 : i;
    let a = agentId && H.agent(agentId);
    if (!a) { await open(pid); a = H.agent(project(pid)?.workspace && window.ProjectWorkspace?.currentChat?.()?.agentId) || agentOf(project(pid)); }
    if (!a) return;
    set(pid, { done: [...new Set([...(e.done || []), k])].sort((x, y) => x - y) });
    Native.sendText(a.id, `Let's start with step ${k + 1} of the project brief: ${b.steps[k]}`);
  }

  // ---------- the plan card ----------
  const ago = (t) => (typeof timeAgo === 'function' ? timeAgo(t) : new Date(t).toLocaleString());
  const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: async (ev) => { ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true; try { await fn(); } catch (err) { toast(calm(err), { type: 'error' }); } finally { b.disabled = false; } } } });
  const eyesBox = (pid, e) => {
    const box = el('input', { type: 'checkbox', checked: e?.eyes === true, on: { change: () => setEyes(pid, box.checked) } });
    return el('label', { class: 'pb-eyes', title: 'Off: the AI reads only words and numbers about the moodboard (colors, moods, notes). On: it also gets one small overview picture of it when the brief is prepared. Kept with this project.' }, box, ' Let the AI look at the moodboard');
  };
  // (round 179, moodread179) ◐ Mood read: the moodboard read deeply (moodread.js); the brief and the directors work from it
  const moodBtn = (p) => (boardOf(p) && window.MoodRead ? btn(`◐ Mood read${MoodRead.status(boardOf(p)) ? ` · ${MoodRead.status(boardOf(p))}` : ''}`, 'The moodboard read deeply: every picture at full size, the mood in precise words, checked against the measurements. The cost is shown first.', () => MoodRead.open(boardOf(p))) : null);
  // card(projectId, { agentId }) → HTMLElement: the plan (or, without a brief, the offer to prepare one)
  function card(pid, { agentId = null } = {}) {
    const p = project(pid);
    const e = entry(pid); const b = e?.brief;
    const node = el('section', { class: 'pb-card', dataset: { pid: String(pid), key: keyOf(pid), ...(agentId ? { agent: agentId } : {}) }, attrs: { 'aria-label': 'Project plan' } });
    if (!p) { node.append(el('p', { class: 'pb-note', text: 'That project isn\'t here.' })); return node; }
    const busy = preparing.has(pid);
    if (!b) {
      node.classList.add('pb-offer');
      node.append(el('div', { class: 'pb-head' }, el('b', { text: '✦ Plan before building' }), el('span', { class: 'pb-note', text: busy ? 'Looking at the project…' : 'The AI reads this project\'s moodboard, references, song and notes once (lightest model) and writes a short plan.' })),
        el('div', { class: 'pb-acts' }, btn(busy ? 'Preparing…' : '✦ Prepare a brief', 'One short AI pass on the cheapest model; nothing is built', () => prepare(pid), 'small primary'), moodBtn(p), eyesBox(pid, e), btn('Hide', 'Hide this for this project', () => hide(pid))));
      if (busy) node.querySelector('button').disabled = true;
      return node;
    }
    const what = staleWhat(pid);
    const done = new Set(e.done || []);
    const next = b.steps.findIndex((_s, k) => !done.has(k));
    const det = el('details', { class: 'pb-body', open: !store.get(`projectbrief.folded.${pid}`, false) });
    det.addEventListener('toggle', () => store.set(`projectbrief.folded.${pid}`, !det.open));
    det.append(el('summary', {}, el('b', { text: '✦ Plan' }), el('span', { class: 'pb-mood', text: b.mood || p.name }),
      el('span', { class: 'pb-swatches' }, (b.palette || []).map((h) => el('span', { class: 'pb-sw', title: h, attrs: { style: `background:${h}` } }))),
      el('span', { class: 'pb-note', text: `${done.size}/${b.steps.length} steps${e.at ? ` · ${ago(e.at)}${e.by ? ` by ${e.by}` : ''}` : ''}` })));
    if (what.length) det.append(el('p', { class: 'pb-stale', text: `${what.join(', ').replace(/^./, (c) => c.toUpperCase())} changed since the brief.` }));
    if (b.look) det.append(el('p', { class: 'pb-look', text: b.look }));
    if (b.palette?.length) det.append(el('div', { class: 'pb-palette' }, b.palette.map((h) => el('button', { type: 'button', class: 'pb-chip', title: `Copy ${h}`, on: { click: () => window.copyText?.(h) } }, el('span', { class: 'pb-sw', attrs: { style: `background:${h}` } }), h))));
    det.append(el('ol', { class: 'pb-steps' }, b.steps.map((s, k) => {
      const box = el('input', { type: 'checkbox', checked: done.has(k), on: { change: () => toggleStep(pid, k) } });
      return el('li', { class: done.has(k) ? 'done' : '' }, el('label', {}, box, ' ', s));
    })));
    if (b.tempo?.length) det.append(el('details', { class: 'pb-more' }, el('summary', { text: 'Tempo plan' }), el('ul', {}, b.tempo.map((t) => el('li', {}, t.section ? el('b', { text: `${t.section}: ` }) : null, t.plan)))));
    if (b.risks?.length) det.append(el('p', { class: 'pb-risks', text: `Watch out: ${b.risks.join(' · ')}` }));
    if (b.questions?.length) det.append(el('div', { class: 'pb-questions' }, el('b', { text: 'Questions for you first' }), el('ul', {}, b.questions.map((q) => el('li', { text: q })))));
    det.append(el('div', { class: 'pb-acts' },
      next >= 0 ? btn(`▶ Start with step ${next + 1}`, `Sends “${b.steps[next]}” to the director as your message`, () => start(pid, agentId), 'small primary') : null,
      btn('✎ Edit the brief', 'Change the mood, palette, steps or questions', () => edit(pid)),
      what.length ? btn(busy ? 'Refreshing…' : '↻ Refresh', 'Write the brief again from what the project has now (one short AI pass)', () => prepare(pid)) : null,
      moodBtn(p),
      eyesBox(pid, e),
      btn('Hide', 'Hide the plan here (/brief show brings it back)', () => hide(pid))));
    node.append(det);
    const draft = window.BriefDraft?.row(pid, { agentId }); // (round 129, draft129) ✦ Build a first draft, its progress and ↶ Undo the draft (outside the fold: seen while it builds)
    if (draft) node.append(draft);
    return node;
  }
  // what a card shows, so a chat's redraw keeps the same card when nothing changed
  const keyOf = (pid) => { const e = entry(pid); return JSON.stringify([e?.at || 0, e?.edited || 0, e?.done || [], e?.eyes === true, preparing.has(pid), (now.get(pid)?.fp && e?.fp) ? C.changed(e.fp, now.get(pid).fp) : [], window.BriefDraft?.key(pid) || '', (project(pid) && window.MoodRead?.status(boardOf(project(pid)))) || '']); }; // (round 129, draft129: + the draft's state)

  // ---------- in the chats ----------
  function paintIn(agentId, v, chat) {
    if (!v?.root) return;
    const wrap = v.list?.closest?.('.messages-wrap') || v.root.querySelector('.messages-wrap');
    const was = v.root.querySelector(':scope > .pb-card');
    const p = chat && projectOfChat(chat.id);
    const show = p && cardChat(agentId, chat, p) && !hidden(p.id) && readOk && (entry(p.id)?.brief || (!chat.messages?.length && (boardOf(p) || sceneOf(p))));
    if (!show || !wrap) { was?.remove(); return; }
    if (was && was.dataset.pid === p.id && was.dataset.key === keyOf(p.id)) return;
    const c = card(p.id, { agentId });
    if (was) was.replaceWith(c); else wrap.before(c);
  }
  let paintT = 0;
  function paintAll() {
    if (paintT) return;
    paintT = requestAnimationFrame(() => {
      paintT = 0;
      hearBoard();
      if (typeof Native === 'undefined') return;
      for (const a of H.agents()) { const v = Native.view(a.id); if (v) paintIn(a.id, v, Native.current(a.id)); }
      for (const n of document.querySelectorAll('.pb-card[data-pid]:not([data-agent])')) if (n.dataset.key !== keyOf(n.dataset.pid)) n.replaceWith(card(n.dataset.pid)); // a card shown elsewhere (the wizard)
      // (round 129, draft129) a chat view the loop above doesn't reach (the project's own chat surface keeps one per agent too): its card kept up to date, so no stale "Preparing…" or progress is left
      for (const n of document.querySelectorAll('.pb-card[data-pid][data-agent]')) if (n.isConnected && n.dataset.key !== keyOf(n.dataset.pid)) n.replaceWith(card(n.dataset.pid, { agentId: n.dataset.agent }));
    });
  }
  if (typeof Native !== 'undefined' && Native.hooks) {
    Native.hooks.render.push((agentId, v, chat) => { try { paintIn(agentId, v, chat); } catch (err) { console.warn('brief card', err); } });
    // the director knows the brief: its compact form (≤ 600 characters, the same bytes until the brief changes)
    Native.hooks.options.push((agentId, chat, _raw, _last, options) => {
      if (!chat || options.lean || options.crew) return;
      const p = projectOfChat(chat.id); const e = p && entry(p.id);
      if (e?.compact && (isDirector(H.agent(agentId)) || options.asDirector === 'three' || p.workspace?.chatId === chat.id)) options.brief = e.compact;
    });
  }
  // a moodboard changed: the briefs check again when next asked (the card asks as it paints)
  // (the board's group may come in after this one: heard from the first paint after it's there)
  let boardHeard = false;
  const hearBoard = () => { if (boardHeard || typeof Board === 'undefined' || !Board.onChange) return; boardHeard = true; Board.onChange((what) => { if (['items', 'vibe', 'boards'].includes(what)) { now.clear(); paintAll(); } }); };
  window.Projects?.onChange?.(() => paintAll());
  window.MoodRead?.onChange?.(() => { now.clear(); paintAll(); }); // (round 179) a new or edited mood read: the card and the brief's staleness follow

  // ---------- three_do brief (three_brief): the whole brief, read on demand ----------
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_brief'], async (_tool, args, ctx = {}) => {
    await ready();
    if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects').catch(() => {});
    const p = projectOfChat(ctx.chatId);
    if (!p) { const mood0 = window.MoodRead ? await MoodRead.directorText(ctx.chatId).catch(() => '') : ''; return { ok: true, value: `This chat is in no project, so it has no brief. For a broad ask, look at the moodboard (board_vibe) and the references (three_do references) yourself and say a short plan first.${mood0 ? `\n\n${mood0}` : ''}` }; }
    const e = entry(p.id);
    // (round 129, draft129) {done: N}: the director ticks step N as it lands (✦ Build a first draft; any reply may)
    if (args?.done != null && window.BriefDraft) return { ok: true, value: [].concat(args.done).map((n) => BriefDraft.tick(p.id, n, ctx.chatId)).join('\n') };
    // (round 179, moodread179) the brief ends with the moodboard's deep read and the inspiration rule (moodread.js)
    const mood = window.MoodRead ? await MoodRead.directorText(ctx.chatId).catch(() => '') : '';
    return { ok: true, value: `${C.full(e?.brief || null, p.name, { at: e?.at, stale: staleWhat(p.id) })}${mood ? `\n\n${mood}` : ''}` };
  });

  // ---------- /brief and Ctrl/⌘+K ----------
  const here = (ctx) => projectOfChat(ctx?.chatId || (H.activeChat?.[H.activeId] || null)) || P()?.here?.() || null;
  if (typeof Commands !== 'undefined' && !Commands.get('brief')) {
    Commands.register({ name: 'brief', area: 'Projects', args: '[prepare|refresh|edit|show|hide|look on|look off]',
      desc: 'This project\'s brief: the AI looks at the moodboard, references, song and notes once and writes a plan (mood, palette, first steps)',
      keywords: 'plan project brief moodboard prepare precheck palette steps', run: async (args, ctx) => {
        await ready();
        const p = here(ctx);
        if (!p) return 'Open a project\'s chat first: a brief belongs to a project.';
        const a = String(args || '').trim().toLowerCase();
        if (/^look\s+(on|off)$/.test(a)) { setEyes(p.id, /on$/.test(a)); return `Let the AI look at the moodboard: ${/on$/.test(a) ? 'on (one small overview picture goes with the next brief)' : 'off (words and numbers only)'} for “${p.name}”.`; }
        if (a === 'edit') { await edit(p.id); return null; }
        if (a === 'hide') { hide(p.id); return 'Plan hidden (/brief show brings it back).'; }
        if (a === 'show' || (!a && entry(p.id)?.brief)) { await open(p.id); return null; }
        prepare(p.id).catch((err) => toast(calm(err), { type: 'error' }));
        return null;
      } });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('Prepare a project brief (the AI looks at the moodboard, song and notes first)', () => { const p = here(); if (!p) { toast('Open a project first.'); return; } prepare(p.id).catch((err) => toast(calm(err), { type: 'error' })); });

  ready();
  return { prepare, seed, get, stale, staleWhat, card, open, edit, hide, start, setEyes, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, _: { gather, check, entry, data: () => data, set, project, projectOfChat, agentOf, paint: paintAll } }; // (round 129, draft129: set … paint for projectbrief-draft.js)
})();
window.ProjectBrief = ProjectBrief;
