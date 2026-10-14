// Files changed outside Hearth (round 42, filewatch), the window side. The owner edits in Finder / Explorer, VS Code,
// Photoshop; Hearth follows the files it uses and absorbs each change quietly (the watching itself is one service in
// the main process, filewatchmain.js; the rules in filewatch-core.js):
//   · the Lab: the scene's song / video and its references (Hearth's copy and the original you added it from) and My
//     templates' folder. Saved again → the preview swaps that texture / song in place (same time, still playing) and
//     one small "Logo updated from disk" line comes through Hints (none while you type, one at a time). Renamed or
//     moved in Finder → followed (grid, markers, every scene using it). Deleted → found again by twocomputers (its
//     place / content) or its calm "Find this file". An original deleted: nothing (Hearth's copy stays).
//   · what the AIs changed (aiundo.js's file entries) and the folders they use: a file an AI wrote, changed again
//     outside → its undo says "changed outside Hearth since: not safely undoable" (Activity, Ctrl/⌘+Z's list) and asks
//     first; deleted outside → the entry says so (a file it created: nothing left to undo). A folder renamed / its disk
//     unplugged → only the state (FileWatch.folder(path)), no note.
//   · the files in the chat boxes: saved again before you send → the chip reads them again (what goes is what's on
//     disk now; attachlean's "same file again" then sends only the changed lines when it was sent before).
//   · data folders that sync: sync's own watch goes through the same service (main side, nothing here).
// No noisy notes: a change nobody would be surprised by is silent; at most one Hints line for the Lab. Nothing sent to
// any AI (0 tokens). /watching says what Hearth follows and how (also Ctrl/⌘+K "Files Hearth follows").
const FileWatch = (() => {
  const C = window.FileWatchCore;
  const api = () => window.hub?.fw;
  const isAbs = (p) => /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(String(p || ''));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const same = (a, b) => (/^[A-Za-z]:[\\/]|^\\\\/.test(String(a)) ? String(a).toLowerCase() === String(b).toLowerCase() : a === b);
  // a lazy group's global only once the group is in (touching it before would load it: Lazy's stand-ins)
  const inG = (group, get) => { try { return !window.Lazy || Lazy.isIn(group) ? get() : null; } catch { return null; } };
  const Lab = () => inG('lab', () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null));
  const Tpl = () => inG('labtemplates', () => (typeof LabTemplates !== 'undefined' ? LabTemplates : null));
  const Undo = () => inG('aiundo', () => window.AiUndo || null);
  const Two = () => inG('twocomputers', () => window.TwoComputers || null);
  const Lean = () => inG('attachlean', () => window.AttachLean || null);
  const log = []; // the last batches (tests, /watching)
  const counts = { batches: 0, lab: 0, refs: 0, songs: 0, followed: 0, missing: 0, ai: 0, attach: 0, templates: 0 };

  // ---------- what to follow, per topic (sent only when it changes) ----------
  const sent = new Map(); const sendT = new Map();
  function want(topic, items) {
    const list = (items || []).filter((x) => x && isAbs(x.path)).slice(0, 1500);
    const sig = JSON.stringify(list.map((x) => [x.path, x.kind || 'file', x.tag, x.presence ? 1 : 0]));
    if (sent.get(topic) === sig) return;
    sent.set(topic, sig);
    clearTimeout(sendT.get(topic));
    sendT.set(topic, setTimeout(() => { sendT.delete(topic); api()?.want(topic, list).catch(() => {}); }, 150));
  }
  const player = () => Lab()?.peek?.()?.player || null;
  // the Lab: the song / video on the timeline, the open scene's references and their originals, My templates
  async function gatherLab() {
    const L = Lab();
    if (!L?.director) { want('lab', []); return; }
    const items = [];
    const p = player()?.path;
    if (p && isAbs(p)) items.push({ path: p, tag: 'lab-song' });
    for (const r of L.director.refs?.list?.() || []) {
      if (r.path) items.push({ path: r.path, tag: `lab-ref:${r.id}` });
      if (r.src && r.src !== r.path) items.push({ path: r.src, tag: `lab-src:${r.id}` });
    }
    if (Tpl()) { try { const dir = await Tpl().root(); if (dir) items.push({ path: dir, kind: 'folder', tag: 'lab-templates' }); } catch { /* none yet */ } }
    want('lab', items);
  }
  // the AIs: the files they changed (still undoable) and the folders they use (there or not: presence only)
  function gatherAi() {
    const items = [];
    try {
      const L = (Undo()?.list?.() || []).filter((e) => e.area === 'file' && !e.undone && e.u?.path).sort((a, b) => b.at - a.at).slice(0, 300);
      for (const e of L) items.push({ path: e.u.path, tag: 'ai-file' });
    } catch { /* not loaded */ }
    for (const a of (typeof H !== 'undefined' && Array.isArray(H.config?.agents) ? H.config.agents : [])) {
      const fa = a.fileAccess;
      if (!fa || (fa.level || 'off') === 'off') continue;
      for (const f of fa.folders || []) { const p = typeof f === 'string' ? f : f?.path; if (isAbs(p)) items.push({ path: p, kind: 'folder', presence: true, tag: `ai-folder:${a.id}` }); }
    }
    want('ai', items);
  }
  // the chat box's attachments that came from a file (Native.hooks.chips)
  function onChips(agentId, atts) {
    const items = [];
    for (const a of atts || []) { const p = a.src || (a.kind === 'image' && !a.video ? a.original || a.path : null); if (isAbs(p)) items.push({ path: p, tag: `attach:${agentId}` }); }
    want(`attach:${agentId}`, items);
  }

  // ---------- what changed ----------
  const folders = new Map(); // an AI folder → 'gone' | 'unavailable' (renamed / deleted / its disk unplugged)
  let note = { names: [], t: 0 }; // the Lab's quiet line, one per moment
  async function onChanges(list) {
    if (!Array.isArray(list) || !list.length) return;
    counts.batches += 1;
    log.push({ at: Date.now(), n: list.length, changes: list.slice(0, 20) });
    if (log.length > 30) log.shift();
    const shown = [];
    for (const c of list) {
      for (const tag of c.tags || []) {
        try {
          if (tag === 'lab-song') { const w = await song(c); if (w) shown.push(w); } else if (tag.startsWith('lab-ref:')) { const w = await ref(tag.slice(8), c, false); if (w) shown.push(w); } else if (tag.startsWith('lab-src:')) { const w = await ref(tag.slice(8), c, true); if (w) shown.push(w); } else if (tag === 'lab-templates') templates(); else if (tag === 'ai-file') ai(c); else if (tag.startsWith('ai-folder:')) folder(c); else if (tag.startsWith('attach:')) await attach(tag.slice(7), c);
        } catch (err) { console.warn('filewatch', tag, err); }
      }
    }
    if (shown.length) labLine(shown);
    document.dispatchEvent(new CustomEvent('hearth:files', { detail: { changes: list } }));
  }
  const changedKinds = new Set(['change', 'add', 'available']);
  // the song / video on the timeline
  async function song(c) {
    const pl = player();
    if (!pl || !pl.path || !same(pl.path, c.path)) return null;
    if (changedKinds.has(c.kind)) {
      const r = await pl.reload();
      if (r?.ok) { counts.songs += 1; counts.lab += 1; return base(c.path); }
      return null;
    }
    if (c.kind === 'rename' && c.to) { const r = await pl.follow(c.to); if (r?.ok) { counts.followed += 1; gatherLab(); } return null; }
    if (c.kind === 'delete') {
      // found again by its place / content (twocomputers), else the calm "Find this file" note (once per file)
      counts.missing += 1;
      const tc = Two();
      if (!tc) return null; // what's playing keeps playing; the next load says it
      const alt = await tc.relink(c.path).catch(() => null);
      if (alt) { await pl.follow(alt); gatherLab(); return null; }
      tc.missingNote?.({ path: c.path, where: 'scene', retry: async (to) => { if (same(player()?.path || '', c.path)) await player().follow(to); gatherLab(); } });
      return null;
    }
    return null; // offloaded to iCloud, a disk unplugged: what's playing keeps playing
  }
  // a reference (its copy in Hearth's data, or the original it came from)
  async function ref(id, c, original) {
    const d = Lab()?.director?.refs;
    if (!d?.reload) return null;
    const r = Object.values(d.all?.() || {}).flat().find((x) => x.id === id);
    if (!r) return null;
    if (original) {
      if (c.kind === 'rename' && c.to) { r.src = c.to; await d.reload(id, { from: c.to }); gatherLab(); return null; }
      if (!changedKinds.has(c.kind)) return null; // the original deleted / offloaded: Hearth's copy stays, nothing to say
      const x = await d.reload(id, { from: c.path });
      if (x?.ok && !x.later) { counts.refs += 1; counts.lab += 1; return r.name; }
      return null;
    }
    if (changedKinds.has(c.kind)) {
      const x = await d.reload(id);
      if (x?.ok && !x.later) { counts.refs += 1; counts.lab += 1; return r.name; }
      return null;
    }
    if (c.kind === 'delete' || (c.kind === 'rename' && c.to)) {
      // Hearth's own copy went: its original (when it's still there) brings it back by itself, else "Find this file"
      if (r.src && (await window.hub.fs.stat(r.src).catch(() => null))) { await d.reload(id, { from: r.src }); return null; }
      if (c.to) { await d.reload(id, { from: c.to }); return null; }
      counts.missing += 1;
      Two()?.missingNote?.({ path: c.path, where: 'scene', retry: async (to) => { r.src = to; await d.reload(id, { from: to }); gatherLab(); } });
    }
    return null;
  }
  function templates() { if (!Tpl()) return; counts.templates += 1; clearTimeout(templates.t); templates.t = setTimeout(() => Tpl()?.list(true).catch?.(() => {}), 400); }
  function ai(c) {
    const n = Undo()?.outside?.(c.path, { gone: c.kind === 'delete' || c.kind === 'rename', to: c.to || null, size: c.size, mtime: c.mtime }) || 0;
    counts.ai += n;
  }
  function folder(c) {
    if (c.kind === 'delete' || c.kind === 'unavailable') folders.set(c.path, c.kind === 'delete' ? 'gone' : 'unavailable');
    else if (changedKinds.has(c.kind)) folders.delete(c.path);
  }
  // a chat box's attachment saved again before sending: read again (text) / measured again (picture)
  async function attach(agentId, c) {
    if (!changedKinds.has(c.kind) || typeof Native === 'undefined') return;
    const v = Native.view(agentId);
    if (!v?.attachments?.length) return;
    let n = 0;
    for (const a of v.attachments) {
      const p = a.src || (a.kind === 'image' && !a.video ? a.original || a.path : null);
      if (!p || !same(p, c.path)) continue;
      if (a.kind === 'text') {
        try { a.content = await window.hub.fs.read(p, { maxBytes: Lean()?.MAX_BYTES || 200 * 1024 }); } catch { continue; }
        delete a.full; delete a.wrapped;
      } else if (a.kind === 'image') {
        a.preview = `${WinMac.fileUrl(p)}?v=${Math.round(c.mtime || Date.now())}`;
      }
      delete a._lean; delete a.lean;
      n += 1;
    }
    if (n) { counts.attach += n; Native.renderChips(agentId); }
  }
  // the one quiet line: "Logo updated from disk" (Hints: never over your typing, one at a time; only in the Lab)
  function labLine(names) {
    const t = Date.now();
    note = t - note.t < 4000 ? { names: [...new Set([...note.names, ...names])], t } : { names: [...new Set(names)], t };
    const text = note.names.length === 1 ? `${note.names[0].replace(/^\d{10,}-/, '')} updated from disk` : `${note.names.length} files updated from disk`;
    if (typeof Hints === 'undefined' || document.hidden) return;
    Hints.offer({ id: 'filewatch.lab', kind: 'chip', place: 'lab', once: false, ttl: 8000, show: () => toast(`↻ ${text}`, { timeout: 2200 }) }).catch?.(() => {});
  }

  // ---------- /watching ----------
  async function summary() {
    const s = await api()?.state?.().catch(() => null);
    if (!s) return 'Hearth isn\'t following any files yet.';
    const t = s.topics || {};
    const attach = Object.entries(t).filter(([k]) => k.startsWith('attach:')).reduce((a, [, v]) => a + v, 0);
    const lines = ['**Files Hearth follows** (changes you make in other apps are picked up by themselves)'];
    if (t.lab) lines.push(`- The Lab: ${t.lab} (the song, the scene's references and their originals${Tpl() ? ', My templates' : ''})`);
    if (t.ai) lines.push(`- Your AIs: ${t.ai} (files they changed, folders they use)`);
    if (attach) lines.push(`- In chat boxes: ${attach} attachment${attach === 1 ? '' : 's'}`);
    if (s.trees) lines.push('- Sync: Hearth\'s data folder and the cloud copy');
    const slow = (s.roots || []).filter((r) => r.mode === 'poll' || r.mode === 'gone');
    lines.push(slow.length ? `- ${slow.length} folder${slow.length === 1 ? '' : 's'} the system can't watch right now (${slow.map((r) => base(r.dir)).slice(0, 3).join(', ')}): checked every 30 s or so instead` : `- Watching ${(s.roots || []).length} folder${(s.roots || []).length === 1 ? '' : 's'} through ${s.platform === 'darwin' ? 'macOS' : s.platform === 'win32' ? 'Windows' : 'the system'}; nothing runs while nothing changes`);
    const gone = [...folders].map(([p, k]) => `${base(p)} (${k === 'gone' ? 'renamed, moved or deleted' : 'its disk isn\'t plugged in'})`);
    if (gone.length) lines.push(`- Not there now: ${gone.join(', ')}`);
    if (counts.lab || counts.ai || counts.attach) lines.push(`- This session: ${counts.lab} Lab file${counts.lab === 1 ? '' : 's'} updated in place, ${counts.ai} AI change${counts.ai === 1 ? '' : 's'} marked as changed outside, ${counts.attach} attachment${counts.attach === 1 ? '' : 's'} read again`);
    return lines.join('\n');
  }

  // ---------- start ----------
  function boot() {
    if (!api()) return;
    api().onChanges((list) => { onChanges(list).catch((err) => console.warn('filewatch', err)); });
    const lab = () => { clearTimeout(lab.t); lab.t = setTimeout(() => gatherLab().catch(() => {}), 200); };
    addEventListener('hearth:lab-ready', () => { lab(); try { player()?.on?.('load', lab); player()?.on?.('relink', lab); } catch { /* fine */ } });
    addEventListener('hearth:sketch', lab);
    addEventListener('hearth:lab-refs', lab);
    if (Lab()?.director) { lab(); try { player()?.on?.('load', lab); player()?.on?.('relink', lab); } catch { /* fine */ } }
    const aiSoon = () => { clearTimeout(aiSoon.t); aiSoon.t = setTimeout(gatherAi, 300); };
    document.addEventListener('hearth:file-access', aiSoon);
    if (window.Lazy?.when) Lazy.when('aiundo', () => { Undo()?.onChange?.(aiSoon); aiSoon(); }); else Undo()?.onChange?.(aiSoon);
    window.Lazy?.when?.('labtemplates', lab);
    window.hub.onConfigChanged?.(aiSoon);
    aiSoon();
    if (typeof Native !== 'undefined' && Native.hooks?.chips) Native.hooks.chips.push(onChips);
    if (typeof Commands !== 'undefined' && !Commands.get('watching')) {
      Commands.register({
        name: 'watching', area: 'App', args: '', aliases: ['file-watch'].filter((n) => !Commands.get(n)),
        desc: 'Which files Hearth follows on disk (the Lab\'s media, your AIs\' files and folders, attachments, sync) and how',
        keywords: 'files changed outside finder explorer photoshop vs code reload disk watch follow',
        examples: ['/watching'],
        run: () => summary(),
      });
    }
    AppUI.addAction?.('Files Hearth follows (changed outside Hearth)', () => summary().then((t) => toast(t.replace(/\*\*/g, ''), { timeout: 9000 })));
  }
  boot();

  return { want, gatherLab, gatherAi, onChanges, summary, folder: (p) => folders.get(p) || null, state: () => api()?.state?.(), get log() { return log.slice(); }, get counts() { return { ...counts }; } };
})();
window.FileWatch = FileWatch;
