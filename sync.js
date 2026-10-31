// Sync, renderer side: a calm status dot at the bottom of the rail (only while sync is on), its right-click menu
// (sync now, pause, open the cloud folder, conflicts, deleted files…), Settings → Sync, the one-click setup and
// /sync. The engine runs in the main process (syncmain.js + sync-engine.js); nothing here costs tokens.
const Sync = (() => {
  let st = { on: false, state: 'off' };
  let dot = null;
  let fresh = null; // { from, at }: stores that arrived while the app had them open (a reload shows them)
  const MAC = /Mac/.test(navigator.platform);
  let api = () => window.hub?.sync; // (round 92, syncpanel92) checks swap it (_setApi): the bridge object is read-only

  // ---------- words ----------
  const ago = (t) => (t ? timeAgo(t) : 'not yet');
  const where = () => st.label || 'the cloud drive';
  function line() {
    if (!st.on) return 'Sync is off.';
    const s = st.state;
    if (s === 'offline') return offlineLine();
    if (s === 'paused' || st.paused) return `Paused: changes stay on this computer until you resume. Last synced ${ago(st.lastOk)}.`;
    if (s === 'held') return `${st.held?.deletes || 'Many'} files were deleted at once: waiting for your yes before syncing that.`;
    if (s === 'syncing' || s === 'starting' || s === 'idle') return `Syncing with ${where()}…`;
    // (round 92, syncpanel92) a fault is never "Everything is synced": files that can't sync, conflicts and unreadable
    // files make it "Synced …, but …"; an error says it couldn't finish (it said "Syncing with …")
    const bits = []; let fault = false;
    if (s === 'pending' && st.pending) bits.push(`${st.pending} file${st.pending === 1 ? '' : 's'} on the way${st.cloudOnly?.length ? ` (${st.cloudOnly.length} only in the cloud for now)` : ''}`);
    if (st.conflicts) { fault = true; bits.push(`${st.conflicts} conflict${st.conflicts === 1 ? '' : 's'} to choose`); }
    if (blockedN()) { fault = true; bits.push(`${blockedN()} file${blockedN() === 1 ? '' : 's'} can't sync (see why in the sync panel)`); }
    if (asideN()) bits.push(`${asideN()} version${asideN() === 1 ? '' : 's'} kept aside to compare`); // (round 78, guardloss78)
    if (st.skippedBig?.length) bits.push(`${st.skippedBig.length} big video${st.skippedBig.length === 1 ? '' : 's'} kept on this computer`);
    if (st.unreadable?.length) { fault = true; bits.push(`${st.unreadable.length} unreadable file${st.unreadable.length === 1 ? '' : 's'} skipped`); }
    if (s === 'error') return `Sync couldn't finish with ${where()}: ${st.error ? calmError(st.error, { where: 'sync', what: 'the sync folder' }).replace(/\.$/, '') : 'something went wrong'}.`; // (round 45, errorcalm) the raw reason: Sync now's note has it under Details
    const head = s !== 'synced' && s !== 'conflict' ? 'Syncing with' : fault ? 'Synced with' : 'Everything is synced with';
    return `${head} ${where()} (checked ${ago(st.at)})${bits.length ? `${fault ? ', but' : ':'} ${bits.join(', ')}.` : '.'}`;
  }
  // (round 74, synchard74) why sync is paused by itself, in plain words: the folder moved / unmounted, emptied by the
  // cloud client starting over, or a newer Hearth on the other computer this one must catch up with
  function offlineLine() {
    if (st.error === 'missing') return `The Hearth folder in ${where()} isn't there (moved, renamed or the drive isn't connected). Sync is paused; nothing here was touched.`;
    if (st.error === 'emptied') return `The Hearth folder in ${where()} is empty right now (your cloud drive may be starting over). Sync is paused; nothing here was deleted.`;
    if (st.error === 'old-version') return 'Update Hearth on this computer: your other computer has a newer Hearth that keeps things in a way this one can\'t read yet. Sync waits; nothing is lost.';
    if (st.error === 'held') return 'Sync is waiting: Hearth can\'t read its own sync records on this computer right now. Nothing was changed; it tries again by itself.'; // (round 92) a read failure is never "offline" (nor empty)
    return `Offline: ${where()} isn't reachable (the drive isn't connected, or the folder moved). Everything keeps working here and catches up when it's back.`;
  }
  // (round 74, synchard74) files sync can't move for a reason the owner can fix (the panel lists them, with a button)
  const blockedN = () => (st.on && !st.paused ? (st.blocked || []).length : 0);
  function peersLine() {
    const p = (st.peers || []).filter((x) => x.lastSeen);
    return p.length ? p.map((x) => `${x.name} (${x.platform === 'darwin' ? 'Mac' : x.platform === 'win32' ? 'Windows' : x.platform}) last synced ${ago(x.lastOk || x.lastSeen)}`).join(' · ') : '';
  }
  const dotState = () => (!st.on ? 'off' : st.paused || (st.state === 'offline' && st.error === 'held') ? 'paused' : st.state === 'offline' && st.error ? 'conflict' : (st.state === 'synced' || st.state === 'pending') && (st.blocked || []).length ? 'conflict' : st.state === 'pending' || st.state === 'starting' || st.state === 'idle' ? 'syncing' : st.state === 'held' || st.state === 'error' ? 'conflict' : st.state); // (round 74) a file that can't sync: looked at like a conflict
  // (round 72, sync72) the indicator in words: "Synced 2 min ago" · "12 waiting" · "1 conflict — choose" (its chip shows
  // ✓ / ↻ 12 / ⚠ 1; the words are its name, its tooltip and the panel's title). Worked out when a status arrives or the
  // pointer comes over it: no timer of its own.
  function shortLine() {
    if (!st.on) return 'Sync is off';
    if (st.paused) return `Sync paused · last synced ${ago(st.lastOk)}`;
    const s = st.state; const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
    if (s === 'offline') return st.error === 'missing' ? 'The cloud folder isn\'t there · paused' : st.error === 'emptied' ? 'The cloud folder is empty · paused' : st.error === 'old-version' ? 'Update Hearth here to keep syncing' : st.error === 'held' ? 'Sync waits · can\'t read its records here' : `Offline · catches up when ${where()} is back`; // (round 74) · (round 92) held
    if (s === 'held') return `${n(st.held?.deletes || 0, 'deletion')} wait for your yes`;
    if (s === 'conflict') return `${n(st.conflicts, 'conflict')} — choose`;
    if (s === 'error') return 'Sync hit a problem — see why';
    if (blockedN() && (s === 'pending' || s === 'synced')) return `${n(blockedN(), 'file')} can't sync — see why`; // (round 74)
    if (s === 'pending' && st.pending) return `${st.pending} waiting`;
    if (s === 'synced') return `Synced ${ago(st.lastOk || st.at)}${asideN() ? ` · ${asideN()} kept aside — compare` : ''}`; // (round 78, guardloss78)
    return 'Syncing…';
  }
  // (round 78, guardloss78) versions sync kept aside in the last day (one side of a conflict it settled by itself)
  const asideN = () => (st.aside || []).filter((n) => Date.now() - n.at < 864e5).length;
  const chipOf = () => {
    const s = dotState(); const n = st.pending > 99 ? '99+' : st.pending;
    if (st.state === 'offline' && !st.paused) return st.error === 'held' ? '‖ Waiting' : st.error === 'old-version' ? '⚠ Update' : st.error ? '⚠ Folder' : '○ Offline'; // (round 92, syncpanel92) the chip says what the panel says
    if (s === 'paused') return '‖ Paused';
    if (blockedN() && !st.conflicts && (st.state === 'synced' || st.state === 'pending')) return `⚠ ${blockedN()} to fix`; // (round 74, synchard74) (short: the rail is narrow; its name says "can't sync — see why")
    if (s === 'conflict') return st.conflicts ? `⚠ ${st.conflicts} conflict${st.conflicts === 1 ? '' : 's'}` : st.state === 'held' ? '⚠ Review' : '⚠ Problem';
    if (s === 'syncing') return st.state === 'pending' && st.pending ? `↻ ${n} waiting` : '↻ Syncing';
    return asideN() ? `◐ ${asideN()} to compare` : '✓ Synced'; // (round 94, keptaside94) a version kept aside shows in the rail too
  };
  const glyphOf = () => chipOf().slice(0, 1);
  const KV_NAMES = { 'three-sketches': 'Lab scenes', boards: 'Mood boards', notes: 'Notes', prompts: 'Prompts', 'video-cuts': 'Video edits', 'chat-scenes': 'Chat scenes', 'three-lab-extras': 'Lab looks and songs', 'chat-meta': 'Chat tags and folders', projects: 'Projects', 'three-beatmaps': 'Beat grids', 'video-notes': 'Video notes', 'lab-presets': 'Lab presets and trigger setups' }; // (round 94) + lab-presets
  function nameOf(rel) {
    let m = /^chats\/(.+)\.json$/.exec(rel);
    if (m) { const c = (H.chats || []).find((x) => x.id === m[1]); return c ? `Chat “${c.title}”` : 'A chat'; } // (round 92) never its id
    m = /^kv\/(.+)\.json$/.exec(rel);
    if (m) return KV_NAMES[m[1]] || `Tool data “${m[1]}”`;
    if (rel === 'app/config.json') return 'Settings (agents, look)';
    if (rel === 'app/theme.css') return 'theme.css';
    if (rel === 'memory.json') return 'Memory';
    m = /^(refs|templates)\/(?:.*\/)?([^/]+)$/.exec(rel); if (m) return `Lab ${m[1] === 'refs' ? 'file' : 'template'} “${m[2]}”`; // (round 92) a Lab scene's file
    return rel.split('/').pop();
  }

  // ---------- the dot ----------
  function mountDot() {
    const rail = document.getElementById('rail');
    if (!rail) return;
    if (!st.on) { dot?.remove(); dot = null; return; }
    if (!dot) {
      dot = el('button', { class: 'tool-btn sync-dot', id: 'sync-dot', type: 'button', dataset: { feature: 'Sync dot' }, attrs: { 'aria-label': 'Sync', 'aria-haspopup': 'dialog' } }, el('i'), el('span', { class: 'sync-chip' }));
      // (round 72, sync72) a click opens the sync panel (plain words, what waits, conflicts side by side, Sync now);
      // right-click keeps the menu. The panel's code loads on that first click (lazy group syncpanel).
      dot.addEventListener('click', () => panel());
      dot.addEventListener('pointerenter', () => { paintDot(); if (typeof SyncPanel === 'undefined' && window.Lazy) Lazy.load('syncpanel').catch(() => {}); }); // (the panel's code starts loading on the way to the click)
      dot.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e); });
    }
    const keys = document.getElementById('keys-btn');
    if (dot.parentElement !== rail) (keys ? keys.before(dot) : rail.append(dot));
    paintDot();
  }
  function paintDot() {
    if (!dot) return;
    const s = dotState();
    if (dot.dataset.state !== s) dot.dataset.state = s;
    dot.classList.toggle('fresh', Boolean(fresh));
    const words = shortLine();
    const t = `${words}\n${line()}${fresh ? `\nChanges from ${fresh.from} arrived: reload to see them.` : ''}\nClick: what's waiting, conflicts, Sync now · right-click: the menu`;
    if (dot.title !== t) dot.title = t;
    const chip = dot.querySelector('.sync-chip'); const c = chipOf();
    if (chip && chip.textContent !== c) chip.textContent = c;
    const name = `Sync: ${words}`;
    if (dot.getAttribute('aria-label') !== name) dot.setAttribute('aria-label', name);
  }

  // ---------- the menu (the dot, Settings ⋯, /sync menu) ----------
  function items() {
    if (!st.on) return [window.TwoComputers?.hereLine?.(), window.TwoComputers?.menuItem?.(), { label: 'Turn on sync…', action: () => setup() }].filter(Boolean);
    const out = [line().length > 70 ? shortLine() : line()];
    // (round 35, twocomputers) which computer this is, and what needs a click here after a switch
    const here = window.TwoComputers?.hereLine?.(); if (here) out.push(here);
    const todo = window.TwoComputers?.menuItem?.(); if (todo) out.push(todo);
    if (fresh) out.push({ label: `Reload to see changes from ${fresh.from}`, action: () => reload() });
    if (st.held) {
      out.push({ label: `Review the ${st.held.deletes} deleted files by name…`, action: () => held() });
      out.push({ label: `Delete those ${st.held.deletes} files (to the trash)`, action: () => now({ mass: 'apply' }) });
      out.push({ label: 'Keep them (bring them back)', action: () => now({ mass: 'keep' }) });
    }
    if (st.state === 'offline' && (st.error === 'missing' || st.error === 'emptied')) out.push({ label: 'Start the cloud copy again from here', action: () => now({ fresh: true }) }); // (round 74) + emptied
    if (blockedN()) out.push({ label: `${blockedN()} file${blockedN() === 1 ? '' : 's'} can't sync — see why…`, action: () => panel() }); // (round 74, synchard74)
    out.push({ label: 'Sync now', action: () => now() });
    if (st.conflicts) out.push({ label: `Conflicts…`, hint: String(st.conflicts), action: () => conflicts() });
    if (st.conflicts) out.push({ label: 'Settle all conflicts for me', action: async () => { const r = await api().resolveAll('auto'); if (r?.ok) toast(`Settled ${r.done} conflict${r.done === 1 ? '' : 's'}${r.failed ? ` (${r.failed} need you)` : ''}. Undo from Deleted files.`, { timeout: 5000, action: { label: 'Deleted files', fn: () => trash() } }); refresh(); } });
    if (st.cloudOnly?.length) out.push({ label: `Download ${st.cloudOnly.length} file${st.cloudOnly.length === 1 ? '' : 's'} only in the cloud`, action: () => download() });
    out.push({ label: st.paused ? 'Resume sync' : 'Pause sync', action: () => pause(!st.paused) });
    out.push({ label: MAC ? 'Show the cloud folder in Finder' : 'Open the cloud folder', action: () => api().open() });
    out.push({ label: 'Sync big videos', checked: st.big !== false, hint: st.skippedBig?.length ? `${st.skippedBig.length} kept here` : '', action: () => big(st.big === false) });
    out.push({ label: 'What syncs…', more: true, hint: (st.kinds || []).some((k) => !k.on && !k.perComputer) ? 'some off' : '', action: () => panelAt('kinds') }); // (round 73, syncmedia73)
    out.push({ label: 'Free up space on this computer…', more: true, action: () => panelAt('free') });
    out.push({ label: 'Deleted files…', more: true, action: () => trash() });
    if (!st.conflicts) out.push({ label: 'Conflicts…', more: true, action: () => conflicts() });
    out.push({ label: 'Other drive or folder…', more: true, action: () => setup({ change: true }) });
    out.push({ label: 'Turn sync off', more: true, danger: true, action: () => off() });
    return out;
  }
  // (round 72, sync72) the sync panel (sync-panel.js, loaded on the first click)
  const panelListeners = new Set();
  let panelLoading = false; // a second click while its code still loads doesn't open-then-close it
  async function panel() {
    if (panelLoading) return;
    try { if (typeof SyncPanel === 'undefined' && window.Lazy) { panelLoading = true; await Lazy.load('syncpanel'); } SyncPanel.toggle(dot); } catch (err) { console.warn('sync panel:', err); menu(); } finally { panelLoading = false; }
  }
  // (round 73, syncmedia73) the panel opened at What syncs / Free up space (the ⋯ menu, /sync what, /sync space)
  async function panelAt(mode) {
    try { if (typeof SyncPanel === 'undefined' && window.Lazy) await Lazy.load('syncpanel'); await SyncPanel.open(dot, { mode }); } catch (err) { console.warn('sync panel:', err); }
  }
  let lastAuto = null; // the last conflicts settled by themselves: { done, at } (the panel says so)
  function menu(e) {
    const r = (e?.currentTarget || dot)?.getBoundingClientRect?.();
    showMenu(r ? r.right + 6 : (e?.clientX || 60), r ? r.top - 120 : (e?.clientY || 300), items());
  }

  // ---------- actions ----------
  async function refresh() { try { st = await api().status(); } catch { /* not ready */ } mountDot(); notice(); return st; }
  async function now(o = {}) {
    st = { ...st, state: 'syncing' }; paintDot();
    st = await api().now({ mass: o.mass, fresh: o.fresh });
    mountDot();
    if (st.state === 'error' && st.error) toast(`Sync couldn't finish with ${where()}`, { type: 'error', timeout: 9000, raw: st.error, calm: { where: 'sync', what: 'The sync folder' }, retry: () => now() }); // (round 45, errorcalm)
    // (round 45, errorcalm) the folder gone: the line says it plainly, the one fix is a click away
    else if (st.state === 'offline' && st.error === 'old-version') toast(line(), { timeout: 9000, action: { label: 'Check for updates…', fn: () => Lazy.load('updater').then(() => Updater.check({ loud: true })) } }); // (round 74, synchard74) · (round 92) + its button
    else if (st.state === 'offline' && st.error !== 'held') toast(line(), { timeout: 9000, raw: `${st.error === 'missing' || st.error === 'emptied' ? `Hearth/files ${st.error} in` : 'Not reachable:'} ${st.root || where()}`, action: st.error === 'missing' || st.error === 'emptied' ? { label: 'Start the cloud copy again from here', fn: () => now({ fresh: true }) } : { label: 'Pick the folder again…', fn: () => setup({ change: true }) } });
    else if (!o.quiet) toast(line(), { timeout: 3500 }); // (round 72) the sync panel says it itself
    return st;
  }
  async function pause(on) { st = await api().pause(on); mountDot(); toast(on ? 'Sync paused. Hearth keeps everything here meanwhile.' : 'Sync resumed.', { timeout: 2500 }); }
  async function big(on) { st = await api().big(on); mountDot(); toast(on ? 'Big videos sync too (in resumable pieces; files only in the cloud aren\'t downloaded unless you ask).' : 'Big videos (over 100 MB) stay on each computer.', { timeout: 4000 }); }
  async function download() { toast('Downloading the files that were only in the cloud…', { timeout: 2500 }); st = await api().download(); mountDot(); toast(line(), { timeout: 3500 }); }
  async function off() {
    if (!await Modal.confirm('Turn sync off?', `Hearth stops syncing with ${where()}. Nothing is deleted: this computer keeps its data, the cloud copy stays as it is, and turning it on again picks up from there.`, { ok: 'Turn off' })) return;
    st = await api().off(); mountDot(); toast('Sync is off.', { timeout: 2000 });
  }
  function reload() { window.hub.reloadWindow(); }

  // setup: the obvious drive proposed, one click. A drive that already has a Hearth: "Use this Hearth" (merge).
  async function setup({ change = false } = {}) {
    const d = await api().detect();
    if (d.inside) { await Modal.alert('Sync', `Hearth's data folder is inside ${d.inside.label} (${d.dataDir}). Cloud clients lock and half-download files, so Hearth should run from a local folder and sync to the drive. Move Hearth out of the drive first.`); return null; }
    const others = d.list.filter((x) => x !== d.proposed && x.root !== d.proposed?.root);
    const dialog = el('dialog', { class: 'ui-modal sync-setup' });
    const p = d.proposed;
    const close = () => dialog.close();
    const turnOn = async (root) => {
      close();
      const r = await api().on(root ? { root } : {});
      if (!r.ok) { toast(r.error, { type: 'error', timeout: 8000 }); return; }
      await refresh();
      const who = (r.machines || []).map((m) => m.name).filter(Boolean).join(', ');
      toast(r.joined ? `Using the Hearth in ${r.label}${who ? ` (from ${who})` : ''}: merging, nothing is overwritten.` : `Sync is on: ${r.label}. Look for the dot at the bottom of the rail.`, { timeout: 6000 });
    };
    const chooseFolder = async () => { const f = await window.hub.pickFolder('', 'A folder your cloud drive syncs (Hearth makes a "Hearth" folder in it)'); if (f) turnOn(f); };
    const machines = (h) => (h?.machines || []).map((m) => `${m.name}${m.lastSeen ? ` (${timeAgo(m.lastSeen)})` : ''}`).join(', ');
    const body = p
      ? el('div', { class: 'sync-setup-body' },
        el('p', { class: 'modal-text', text: p.hearth
          ? `Found Hearth in ${p.label}${machines(p.hearth) ? `, from ${machines(p.hearth)}` : ''}. Use it: this computer's chats, scenes, boards and notes are merged with it, nothing is overwritten.`
          : `Keep your chats, scenes, sketches, boards, video projects, notes, memory, prompts, captures and settings in sync through ${p.label}, on your Mac and your PC.` }),
        el('p', { class: 'hint', title: p.root, text: `Hearth keeps working from this computer (fast, offline too) and copies changes to a “Hearth” folder in ${p.label}, and back. Each computer keeps its own AI programs and window sizes.` }))
      : el('p', { class: 'modal-text', text: 'No cloud drive found on this computer (iCloud Drive, Google Drive, Dropbox or OneDrive desktop app). Install one, or choose a folder that a cloud drive syncs.' });
    const actions = el('div', { class: 'dialog-actions' },
      el('button', { type: 'button', class: 'ghost', text: p ? 'Other drive…' : 'Choose a folder…', on: { click: (e) => {
        if (!p) { close(); chooseFolder(); return; }
        showMenuAt(e.currentTarget, [...others.map((x) => ({ label: `${x.label}${x.hearth ? ' · has Hearth' : ''}`, hint: x.root, action: () => turnOn(x.root) })), '-', { label: 'Choose a folder…', action: () => { close(); chooseFolder(); } }]);
      } } }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', text: 'Cancel', on: { click: close } }),
      p ? el('button', { type: 'button', class: 'primary', text: p.hearth ? 'Use this Hearth' : change ? `Switch to ${p.label}` : 'Turn on sync', on: { click: () => turnOn(p.root) } }) : null);
    dialog.append(el('form', { method: 'dialog' }, el('h2', { text: p?.hearth ? 'Use this Hearth?' : 'Sync Hearth' }), body, actions));
    dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 0));
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

  // ---------- conflicts (round 19): what it is, both sides by computer and time, the difference, plain choices ----------
  const HERE_NAME = MAC ? 'this Mac' : /Win/.test(navigator.platform) ? 'this PC' : 'this computer';
  // the items a conflict's fields point at ("Neon Rose", "Refs"), from the version in place
  function itemNames(value, fields) {
    const out = [];
    for (const f of fields || []) {
      let cur = value;
      for (const seg of String(f.path || '').split('.')) {
        if (Array.isArray(cur)) cur = cur.find((x) => x && typeof x === 'object' && String(x.id) === seg);
        else if (cur && typeof cur === 'object') cur = cur[seg];
        else break;
        const n = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur.name || cur.title : null;
        if (typeof n === 'string' && n && !out.includes(n)) { out.push(n); break; }
      }
    }
    return out.slice(0, 4);
  }
  // what it IS, in plain words (the path stays under Details)
  function whatIs(c) {
    const kv = /^kv\/(.+)\.json$/.exec(c.rel)?.[1];
    const names = itemNames(c.ours, c.fields);
    const q = (list) => list.map((n) => `“${n}”`).join(', ');
    if (/^chats\//.test(c.rel)) return `The chat “${c.ours?.title || c.theirs?.title || nameOf(c.rel).replace(/^Chat “|”$/g, '')}”`;
    if (kv === 'three-sketches') return names.length ? `The Lab scene${names.length > 1 ? 's' : ''} ${q(names)}` : 'Lab scenes';
    if (kv === 'boards') return names.length ? `The board ${q(names)}` : 'Mood boards';
    if (c.rel === 'app/config.json') return 'Settings (agents, look)';
    const m = /^(workspace|projects)\/([^/]+)\/(.+)$/.exec(c.rel);
    if (m) return `“${m[3].split('/').pop()}” in the project ${m[2]}`;
    return `${nameOf(c.rel)}${names.length ? `: ${q(names)}` : ''}`;
  }
  // (round 83, firstscreen83) the conflicts list (both sides, the difference, plain choices) and Deleted files are in
  // sync-conflicts.js, out of the first screen: lazy group 'syncconflicts', loaded in an idle moment after it or when
  // one first opens. Same code; what they read from here comes through Sync._conflicts.
  const conflictsPart = (name) => async (...args) => { if (window.Lazy) await Lazy.load('syncconflicts'); return SyncConflicts[name](...args); };
  const conflicts = conflictsPart('conflicts');
  const trash = conflictsPart('trash');

  // the big-change guard: what would be removed, by name, before the yes
  function held() {
    const h = st.held;
    if (!h) { toast('Nothing is waiting for you.', { timeout: 2000 }); return null; }
    const list = h.list || (h.sample || []).map((rel) => ({ rel, where: 'here' }));
    const dialog = el('dialog', { class: 'ui-modal sync-list' });
    const group = (where, title) => {
      const l = list.filter((x) => x.where === where);
      if (!l.length) return null;
      return el('div', { class: 'sync-held-group' }, el('b', { text: `${title} (${l.length})` }),
        el('div', { class: 'sync-rows' }, l.slice(0, 120).map((x) => el('div', { class: 'sync-row' }, el('div', { class: 'sync-row-main' }, el('span', { text: whatIs({ rel: x.rel }) }), el('span', { class: 'hint', text: `${x.rel}${x.size != null ? ` · ${fmtBytes(x.size)}` : ''}` }))))),
        l.length > 120 ? el('p', { class: 'hint', text: `…and ${l.length - 120} more` }) : null);
    };
    const go = (mass) => { dialog.close(); now({ mass }); };
    const by = list.find((x) => x.where === 'here')?.by || 'your other computer';
    dialog.append(el('form', { method: 'dialog' }, el('h2', { text: `${h.deletes} files deleted at once: delete them everywhere?` }),
      el('p', { class: 'hint', text: 'A folder emptied or the wrong drive can look like this, so sync waits for you. Deleted files go to the trash (30 days) either way.' }),
      group('here', `Would be removed from ${HERE_NAME} (deleted on ${by})`),
      group('cloud', `Would be removed from the cloud copy and your other computer (deleted on ${HERE_NAME})`),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
        el('button', { type: 'button', text: 'Keep them (bring them back)', on: { click: () => go('keep') } }),
        el('button', { type: 'button', class: 'primary danger', text: `Delete those ${h.deletes} (to the trash)`, on: { click: () => go('apply') } }))));
    dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 0));
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

  // ---------- Settings → Sync (one line, one button) ----------
  function settingsSection(section) {
    const text = el('p', { class: 'hint sync-settings-line', text: line() });
    const btn = el('button', { type: 'button', class: st.on ? 'ghost' : 'primary', text: st.on ? 'Sync now' : 'Turn on sync…', dataset: { feature: 'Settings › Sync' }, on: { click: () => (st.on ? now().then(upd) : setup()) } });
    const more = el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'Pause, open the cloud folder, conflicts, deleted files, big videos, turn off', on: { click: (e) => showMenuAt(e.currentTarget, items()) } });
    const bigIn = el('input', { type: 'checkbox', checked: st.big !== false });
    bigIn.addEventListener('change', () => big(bigIn.checked).then(upd));
    const bigRow = el('label', { class: 'check' }, bigIn, 'Sync big videos (captures and renders over 100 MB, in resumable pieces)');
    function upd() { text.textContent = line(); btn.textContent = st.on ? 'Sync now' : 'Turn on sync…'; btn.className = st.on ? 'ghost' : 'primary'; bigRow.hidden = !st.on; more.hidden = !st.on; }
    upd();
    const here = window.TwoComputers?.hereEl?.() || ''; // (round 35) "This computer: Mac (name)"
    const sec = section('Sync (Mac and PC, through your cloud drive)', here, text, el('div', { class: 'button-row' }, btn, more), bigRow);
    sec.classList.add('sync-settings');
    // (round 72, longrun72) a closed Settings' line goes when the next one is made, or on the next status: it kept that
    // whole Settings alive for as long as Hearth ran
    const made = Date.now(); upd.gone = () => !text.isConnected && Date.now() - made > 10000; // (not one still being built)
    for (const f of listeners) if (f.gone?.()) listeners.delete(f);
    listeners.add(upd);
    return sec;
  }
  const listeners = new Set();
  let configArrived = false;

  // ---------- arrivals from the other computer ----------
  async function onPulled(list) {
    const chatIds = [...new Set(list.filter((x) => /^chats\/.+\.json$/.test(x.rel)).map((x) => x.rel.slice(6, -5)))];
    if (chatIds.length) {
      try { H.chats = await window.hub.listChats(); Panel.render(); } catch { /* the panel isn't up */ }
      const done = [];
      for (const id of chatIds) if (Native.forget?.(id)) done.push(`chats/${id}.json`);
      for (const a of H.agents?.() || []) if (chatIds.includes(H.activeChat?.[a.id]) && Native.hasView(a.id)) Native.refresh(a.id, { keepScroll: true });
      if (done.length) api().ack(done);
    }
    if (list.some((x) => x.kind === 'config')) configArrived = true; // config.json hot-reloads by itself: acked once the app has it
    // (round 77, storeack77) no "Reload" toast when every store that arrived is one this window updates by itself
    const other = list.filter((x) => !/^chats\//.test(x.rel) && !['config', 'theme', 'file', 'file-deleted'].includes(x.kind));
    if (other.length) {
      const from = other.find((x) => x.from && x.from !== 'trash')?.from || 'your other computer';
      const first = !fresh;
      fresh = { from, at: Date.now() };
      paintDot();
      if (first && other.some((x) => !window.StoreAck?.held(x.rel))) toast(`Changes from ${from} arrived (${[...new Set(other.map((x) => nameOf(x.rel)))].slice(0, 3).join(', ')}).`, { action: { label: 'Reload', fn: reload }, timeout: 8000 });
    }
    window.dispatchEvent(new CustomEvent('hearth:synced', { detail: { files: list } }));
  }

  // ---------- /sync ----------
  function registerCommands() {
    if (typeof Commands === 'undefined' || Commands.get?.('sync')) return;
    const SUBS = ['status', 'now', 'on', 'off', 'pause', 'resume', 'conflicts', 'review', 'trash', 'restore', 'open', 'big', 'download', 'menu', 'what', 'space'];
    Commands.register({
      name: 'sync', args: '[status|now|on|pause|resume|conflicts|review|trash|restore <name>|open|big on/off|off]', area: 'App',
      desc: 'Sync with your cloud drive (Mac ⇄ PC): is everything synced?, sync now, conflicts, deleted files',
      keywords: 'cloud icloud dropbox google drive onedrive backup other computer mac pc offline synced is everything synced up to date',
      examples: ['/sync status', '/sync now', '/sync conflicts'],
      complete: (a) => SUBS.filter((s) => s.startsWith(String(a || '').trim().split(/\s+/)[0] || '')).map((value) => ({ value })),
      run: async (args, ctx) => {
        const [sub0, ...rest] = String(args || '').trim().split(/\s+/);
        const sub = (sub0 || '').toLowerCase();
        const say = (t) => (ctx?.say ? ctx.say(t) : toast(t));
        await refresh();
        if (!sub) { if (!st.on) { await setup(); return null; } say(`${line()}${peersLine() ? `\n${peersLine()}` : ''}`); return null; }
        if (sub === 'status') { const here = window.TwoComputers?.hereLine?.(); say(`${here ? `${here}\n` : ''}${st.on ? `${line()}${peersLine() ? `\n${peersLine()}` : ''}` : 'Sync is off. /sync turns it on (one click).'}`); return null; }
        if (sub === 'on') { if (rest.length) { const r = await api().on({ root: rest.join(' ') }); await refresh(); say(r.ok ? `Sync is on: ${r.label}${r.joined ? ' (joined the Hearth already there; merging)' : ''}.` : r.error); } else if (!st.on) await setup(); else say(line()); return null; }
        if (!st.on) { say('Sync is off. /sync turns it on (one click).'); return null; }
        if (sub === 'now') { await now(); say(line()); return null; }
        if (sub === 'off') { await off(); return null; }
        if (sub === 'pause' || sub === 'resume') { await pause(sub === 'pause'); return null; }
        if (sub === 'conflicts') { await conflicts(); return null; }
        if (sub === 'review') { if (!held()) say('Nothing is waiting for your yes.'); return null; }
        if (sub === 'trash') { await trash(); return null; }
        if (sub === 'open') { await api().open(); return null; }
        if (sub === 'download') { await download(); return null; }
        if (sub === 'menu') { menu(); return null; }
        if (sub === 'what' || sub === 'space') { await panelAt(sub === 'what' ? 'kinds' : 'free'); return null; } // (round 73, syncmedia73) What syncs · Free up space (in the sync panel)
        if (sub === 'big') { await big(!/^(off|no|0)$/i.test(rest[0] || 'on')); return null; }
        if (sub === 'restore') {
          const q = rest.join(' ').toLowerCase();
          const list = await api().trash();
          const hit = list.find((t) => t.rel.toLowerCase().includes(q) || nameOf(t.rel).toLowerCase().includes(q));
          if (!q || !hit) { await trash(); return null; }
          const r = await api().restore(hit.id);
          say(r.ok ? `Restored ${nameOf(r.rel)}.` : r.error);
          return null;
        }
        say(`/sync ${SUBS.join(' | ')}`);
        return null;
      },
    });
  }

  // ---------- /background (round 16, bgperf): what runs while nobody looks, and what each part of Hearth costs ----------
  async function background(sub = '') {
    const b = await window.hub.bgState?.().catch(() => null);
    if (!b) return 'The background report needs the desktop app.';
    if (sub === 'free') { const r = await Commands.exec?.('/apps free', H.claudeAgent?.()?.id); return typeof r === 'string' ? r : 'Hidden app windows freed.'; }
    const wins = (await window.hub.apps?.windows?.().catch(() => [])) || [];
    const mb = b.procs.reduce((a, p) => a + p.mb, 0); const cpu = b.procs.reduce((a, p) => a + p.cpu, 0);
    const by = {}; for (const p of b.procs) { const k = p.type === 'Tab' ? 'pages' : p.type === 'GPU' ? 'graphics' : p.type === 'Browser' ? 'main' : 'helpers'; (by[k] ||= { mb: 0, n: 0 }).mb += p.mb; by[k].n += 1; }
    const min = (ms) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 1000)} s`);
    const lines = [
      `**Hearth now:** ${Math.round(mb)} MB in ${b.procs.length} processes (${Object.entries(by).map(([k, v]) => `${k} ${Math.round(v.mb)} MB`).join(' · ')}), ${Math.round(cpu * 10) / 10} % CPU`,
      `- ${b.hidden ? 'Minimized: background checks run at half pace' : 'On screen'} · ${b.battery ? 'on battery: sync checks 3× calmer' : 'plugged in'}${b.asleep ? ' · the computer is asleep / locked: no checks' : ''}`,
      `- Sync: ${st.on ? (b.sync ? `a calm check every ${min(b.sync.every)} (changes still sync within seconds)` : 'on') : 'off'}`,
      `- App windows: ${wins.filter((w) => w.visible).length} on screen, ${wins.filter((w) => !w.visible).length} hidden (a hidden one goes away after 3 min, at most 2 wait; /background free now)`,
      `- Replies running: ${b.replies}`,
      `- The chat box's cursor stops blinking after ${Math.round(b.calmMs / 1000)} s without a key (it redraws the whole window twice a second otherwise)`,
    ];
    return lines.join('\n');
  }
  function registerBackground() {
    if (typeof Commands === 'undefined' || Commands.get?.('background')) return;
    Commands.register({
      name: 'background', area: 'App', args: '[free]',
      desc: 'What Hearth does in the background now (sync pace, app windows, replies) and the memory / CPU of each part',
      keywords: 'background idle cpu memory ram battery slow lightweight processes heavy performance free app windows',
      examples: ['/background', '/background free'],
      complete: () => [{ value: 'free', label: 'free the hidden app windows now' }],
      run: async (args, ctx) => { const t = await background(String(args || '').trim().toLowerCase()); if (ctx?.say) { ctx.say(t); return null; } return t; },
    });
  }

  // (round 94, keptaside94) said when it happens (once each): a version kept aside → Compare; a new conflict → Choose
  let seen = null;
  function notice() {
    const ids = (st.aside || []).map((x) => x.id); const was = seen; seen = { ids: new Set(ids), n: st.conflicts || 0 };
    if (!was) return;
    const n = (st.aside || []).find((x) => !was.ids.has(x.id) && Date.now() - x.at < 6e5);
    if (n) toast(`Both computers changed ${whatIs({ rel: n.rel, fields: n.fields }).replace(/^The /, 'the ')} at the same time. One version is in use; the other is kept aside, nothing is lost.`, { timeout: 12000, action: { label: 'Compare', fn: () => Lazy.load('keptaside').then(() => KeptAside.open({ aside: n.id })) } });
    else if (seen.n > was.n) toast(`${seen.n - was.n === 1 ? 'Something was' : `${seen.n - was.n} things were`} changed on both computers: choose which version to keep.`, { timeout: 12000, action: { label: 'Choose', fn: () => panel() } });
  }

  // ---------- start ----------
  async function init() {
    if (!api()) return;
    api().onStatus((s) => { st = s; mountDot(); notice(); for (const f of [...listeners, ...panelListeners]) { if (f.gone?.()) { listeners.delete(f); panelListeners.delete(f); continue; } try { f(); } catch { listeners.delete(f); panelListeners.delete(f); } } }); // (round 72) + the open sync panel; (longrun72) drop rows that left the page
    api().onPulled((list) => onPulled(list).catch(() => {}));
    // (round 26) conflicts settled by themselves after a sync: one quiet line, undo one click away
    api().onAutoResolved?.((r) => { if (r?.done) lastAuto = { done: r.done, at: Date.now() }; if (r?.done) toast(`Sync settled ${r.done} conflict${r.done === 1 ? '' : 's'} by itself (data merged, files: the newer one). Undo from Deleted files.`, { timeout: 5000, action: { label: 'Deleted files', fn: () => trash() } }); refresh(); });
    api().ack(); // this window just read everything fresh
    registerCommands();
    registerBackground();
    AppUI.addAction?.('Background: what runs now, memory per part', () => Commands.exec?.('/background', H.claudeAgent?.()?.id));
    AppUI.addAction?.('Sync now (cloud drive)', () => (st.on ? now() : setup()));
    AppUI.addAction?.('Sync: turn on / choose a drive…', () => setup({ change: st.on }));
    AppUI.addAction?.('Sync: conflicts…', () => conflicts());
    AppUI.addAction?.('Sync: deleted files…', () => trash());
    Keys.add({ area: 'Everywhere', keys: 'Right-click the sync dot', what: 'sync now, pause, open the cloud folder, conflicts, deleted files, big videos', sel: '#sync-dot', run: () => menu() });
    await refresh();
    // the rail is rebuilt now and then (config changes): put the dot back
    window.hub.onConfigChanged?.(() => {
      setTimeout(mountDot, 60);
      if (configArrived) { configArrived = false; setTimeout(() => api().ack(['app/config.json']), 300); }
    });
    offerJoin();
  }
  // the second computer: a Hearth is already in one of its drives and sync is off here → offered once, one click
  async function offerJoin() {
    if (st.on || store.get('sync.joinOffered', false)) return;
    const d = await api().detect().catch(() => null);
    const p = d?.proposed;
    if (!p?.hearth || d.inside) return;
    store.set('sync.joinOffered', true);
    const who = (p.hearth.machines || []).map((m) => m.name).filter(Boolean).join(', ');
    toast(`Found Hearth in ${p.label}${who ? ` (from ${who})` : ''}. Use it to keep this computer in sync (merged, nothing overwritten).`, { action: { label: 'Use this Hearth', fn: () => setup() }, timeout: 15000 });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  else setTimeout(init, 0);
  // (round 95, aside95) a conflict's two sides as this computer sees them (the record syncs: both computers list it):
  // a: the version in place (the noticing computer's) is this computer's · b: the copy is · third: neither (a third
  // computer). The status names this computer: machine (its name), machineId. New records name the noticing computer by id (byId); older
  // ones by name only (by): guessed from it
  const whose = (c) => { const m = st?.machine; const me = { id: st?.machineId || m?.id || null, name: typeof m === 'string' ? m : m?.name }; const b = Boolean(c?.fromId && me.id && c.fromId === me.id); const a = c?.byId && me.id ? c.byId === me.id : !b && (!c?.by || !me.name || c.by === me.name); return { a, b, flip: b && !a, third: Boolean(c?.byId && me.id) && !a && !b }; };

  return { status: () => st, whose, refresh, now, setup, conflicts, held, whatIs, trash, menu, items, line, settingsSection, pause, off, big, background,
    shortLine, glyph: glyphOf, nameOf, peersLine, download, panel, panelAt, lastAuto: () => lastAuto, where, listen: (f) => { panelListeners.add(f); return () => panelListeners.delete(f); },
    _setApi: (fn) => { api = fn || (() => window.hub?.sync); }, _conflicts: { MAC, api: () => api(), nameOf, refresh, now, HERE_NAME, itemNames, whatIs } }; // (round 72) for the panel · (round 83) _conflicts: for sync-conflicts.js
})();
