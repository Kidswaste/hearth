// Sync, renderer side: a calm status dot at the bottom of the rail (only while sync is on), its right-click menu
// (sync now, pause, open the cloud folder, conflicts, deleted files…), Settings → Sync, the one-click setup and
// /sync. The engine runs in the main process (syncmain.js + sync-engine.js); nothing here costs tokens.
const Sync = (() => {
  let st = { on: false, state: 'off' };
  let dot = null;
  let fresh = null; // { from, at }: stores that arrived while the app had them open (a reload shows them)
  const MAC = /Mac/.test(navigator.platform);
  const api = () => window.hub?.sync;

  // ---------- words ----------
  const ago = (t) => (t ? timeAgo(t) : 'not yet');
  const where = () => st.label || 'the cloud drive';
  const STATE_WORD = { synced: 'Synced', syncing: 'Syncing…', pending: 'Waiting for files', offline: 'Offline', conflict: 'Synced, with a conflict', held: 'Waiting for you', paused: 'Paused', error: 'Sync error', starting: 'Starting…', off: 'Off', idle: 'Starting…' };
  function line() {
    if (!st.on) return 'Sync is off.';
    const s = st.state;
    if (s === 'offline') return st.error === 'missing' ? `The Hearth folder in ${where()} is missing. Nothing here was touched.` : `Offline: ${where()} isn't reachable. Everything keeps working here and catches up when it's back.`;
    if (s === 'paused') return `Paused. Last synced ${ago(st.lastOk)}.`;
    if (s === 'held') return `${st.held?.deletes || 'Many'} files were deleted at once: waiting for your yes before syncing that.`;
    if (s === 'syncing' || s === 'starting' || s === 'idle') return `Syncing with ${where()}…`;
    const bits = [];
    if (s === 'pending' && st.pending) bits.push(`${st.pending} file${st.pending === 1 ? '' : 's'} on the way${st.cloudOnly?.length ? ` (${st.cloudOnly.length} only in the cloud for now)` : ''}`);
    if (st.conflicts) bits.push(`${st.conflicts} conflict${st.conflicts === 1 ? '' : 's'} to look at`);
    if (st.skippedBig?.length) bits.push(`${st.skippedBig.length} big video${st.skippedBig.length === 1 ? '' : 's'} kept on this computer`);
    if (st.unreadable?.length) bits.push(`${st.unreadable.length} unreadable file${st.unreadable.length === 1 ? '' : 's'} skipped`);
    if (s === 'error') bits.push(st.error || 'something went wrong');
    return `${s === 'synced' || s === 'conflict' ? 'Everything is synced' : 'Syncing'} with ${where()} (checked ${ago(st.at)})${bits.length ? `: ${bits.join(', ')}` : '.'}`;
  }
  function peersLine() {
    const p = (st.peers || []).filter((x) => x.lastSeen);
    return p.length ? p.map((x) => `${x.name} (${x.platform === 'darwin' ? 'Mac' : x.platform === 'win32' ? 'Windows' : x.platform}) last synced ${ago(x.lastOk || x.lastSeen)}`).join(' · ') : '';
  }
  const dotState = () => (!st.on ? 'off' : st.paused ? 'paused' : st.state === 'pending' || st.state === 'starting' || st.state === 'idle' ? 'syncing' : st.state === 'held' || st.state === 'error' ? 'conflict' : st.state);
  const KV_NAMES = { 'three-sketches': 'Lab scenes', boards: 'Mood boards', notes: 'Notes', prompts: 'Prompts', 'video-cuts': 'Video edits', 'chat-scenes': 'Chat scenes', 'three-lab-extras': 'Lab looks and songs', 'chat-meta': 'Chat tags and folders', 'three-beatmaps': 'Beat grids', 'video-notes': 'Video notes' };
  function nameOf(rel) {
    let m = /^chats\/(.+)\.json$/.exec(rel);
    if (m) { const c = (H.chats || []).find((x) => x.id === m[1]); return c ? `Chat “${c.title}”` : `A chat (${m[1]})`; }
    m = /^kv\/(.+)\.json$/.exec(rel);
    if (m) return KV_NAMES[m[1]] || `Tool data “${m[1]}”`;
    if (rel === 'app/config.json') return 'Settings (agents, look)';
    if (rel === 'app/theme.css') return 'theme.css';
    if (rel === 'memory.json') return 'Memory';
    return rel.split('/').pop();
  }

  // ---------- the dot ----------
  function mountDot() {
    const rail = document.getElementById('rail');
    if (!rail) return;
    if (!st.on) { dot?.remove(); dot = null; return; }
    if (!dot) {
      dot = el('button', { class: 'tool-btn sync-dot', id: 'sync-dot', type: 'button', dataset: { feature: 'Sync dot' }, 'aria-label': 'Sync' }, el('i'));
      dot.addEventListener('click', (e) => menu(e));
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
    const t = `${STATE_WORD[st.paused ? 'paused' : st.state] || 'Sync'}: ${line()}${fresh ? `\nChanges from ${fresh.from} arrived: reload to see them.` : ''}\nClick or right-click: sync now, pause, conflicts…`;
    if (dot.title !== t) dot.title = t;
  }

  // ---------- the menu (the dot, Settings ⋯, /sync menu) ----------
  function items() {
    if (!st.on) return [{ label: 'Turn on sync…', action: () => setup() }];
    const out = [line().length > 70 ? `${STATE_WORD[st.paused ? 'paused' : st.state] || 'Sync'} · ${where()}` : line()];
    if (fresh) out.push({ label: `Reload to see changes from ${fresh.from}`, action: () => reload() });
    if (st.held) {
      out.push({ label: `Delete those ${st.held.deletes} files (to the trash)`, action: () => now({ mass: 'apply' }) });
      out.push({ label: 'Keep them (bring them back)', action: () => now({ mass: 'keep' }) });
    }
    if (st.state === 'offline' && st.error === 'missing') out.push({ label: 'Start the cloud copy again from this computer', action: () => now({ fresh: true }) });
    out.push({ label: 'Sync now', action: () => now() });
    if (st.conflicts) out.push({ label: `Conflicts…`, hint: String(st.conflicts), action: () => conflicts() });
    if (st.cloudOnly?.length) out.push({ label: `Download ${st.cloudOnly.length} file${st.cloudOnly.length === 1 ? '' : 's'} only in the cloud`, action: () => download() });
    out.push({ label: st.paused ? 'Resume sync' : 'Pause sync', action: () => pause(!st.paused) });
    out.push({ label: MAC ? 'Show the cloud folder in Finder' : 'Open the cloud folder', action: () => api().open() });
    out.push({ label: 'Sync big videos', checked: st.big !== false, hint: st.skippedBig?.length ? `${st.skippedBig.length} kept here` : '', action: () => big(st.big === false) });
    out.push({ label: 'Deleted files…', more: true, action: () => trash() });
    if (!st.conflicts) out.push({ label: 'Conflicts…', more: true, action: () => conflicts() });
    out.push({ label: 'Other drive or folder…', more: true, action: () => setup({ change: true }) });
    out.push({ label: 'Turn sync off', more: true, danger: true, action: () => off() });
    return out;
  }
  function menu(e) {
    const r = (e?.currentTarget || dot)?.getBoundingClientRect?.();
    showMenu(r ? r.right + 6 : (e?.clientX || 60), r ? r.top - 120 : (e?.clientY || 300), items());
  }

  // ---------- actions ----------
  async function refresh() { try { st = await api().status(); } catch { /* not ready */ } mountDot(); return st; }
  async function now(o = {}) {
    st = { ...st, state: 'syncing' }; paintDot();
    st = await api().now(o);
    mountDot();
    toast(line(), { timeout: 3500 });
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
        el('p', { class: 'hint', text: `Hearth keeps working from this computer (fast, offline too) and copies changes to ${p.root}${p.root.endsWith('/') || p.root.endsWith('\\') ? '' : MAC ? '/' : '\\'}Hearth and back. Engine paths and window sizes stay per computer.` }))
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

  // conflicts: what didn't merge by itself; keep the version in place, or use the other one
  async function conflicts() {
    const list = await api().conflicts();
    const dialog = el('dialog', { class: 'ui-modal sync-list' });
    const rows = el('div', { class: 'sync-rows' });
    const draw = (l) => {
      rows.replaceChildren(...(l.length ? l.map((c) => el('div', { class: 'sync-row' },
        el('div', { class: 'sync-row-main' },
          el('b', { text: nameOf(c.rel) }),
          el('span', { class: 'hint', text: `${timeAgo(c.at)} · ${c.kind === 'file' ? `both computers changed it; the other version (from ${c.from || 'another computer'}) is kept as a copy` : `changed here and on ${c.from || 'your other computer'}; this version stayed in place`}` }),
          c.fields?.length ? el('div', { class: 'sync-fields' }, c.fields.slice(0, 4).map((f) => el('div', { text: `${f.path}: “${f.ours}” here, “${f.theirs}” there` }))) : null),
        el('div', { class: 'sync-row-acts' },
          el('button', { type: 'button', class: 'ghost small', text: 'Keep this one', title: 'The version in place stays (the other copy goes to the synced trash)', on: { click: async () => { await api().resolve(c.id, 'mine'); draw(await api().conflicts()); refresh(); } } }),
          el('button', { type: 'button', class: 'ghost small', text: 'Use the other one', on: { click: async () => { const r = await api().resolve(c.id, 'theirs'); if (!r.ok) toast(r.error, { type: 'error' }); draw(await api().conflicts()); refresh(); } } }))))
        : [el('p', { class: 'modal-text', text: 'No conflicts. Changes made on both computers merged by themselves.' })]));
    };
    draw(list);
    dialog.append(el('form', { method: 'dialog' }, el('h2', { text: 'Sync conflicts' }),
      el('p', { class: 'hint', text: 'A conflict is one thing changed two different ways on two computers. Both versions are kept until you choose.' }),
      rows, el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'primary', text: 'Done', on: { click: () => dialog.close() } }))));
    dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 0));
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

  // deleted files (from any computer): restorable for 30 days
  async function trash() {
    const list = await api().trash();
    const dialog = el('dialog', { class: 'ui-modal sync-list' });
    const q = el('input', { type: 'search', placeholder: 'Filter…', class: 'sync-filter' });
    const rows = el('div', { class: 'sync-rows' });
    const draw = () => {
      const f = q.value.trim().toLowerCase();
      const l = list.filter((t) => !f || t.rel.toLowerCase().includes(f) || nameOf(t.rel).toLowerCase().includes(f)).slice(0, 200);
      rows.replaceChildren(...(l.length ? l.map((t) => el('div', { class: 'sync-row' },
        el('div', { class: 'sync-row-main' }, el('b', { text: nameOf(t.rel) }), el('span', { class: 'hint', text: `${t.rel} · deleted ${t.day}${t.where === 'here' ? ' (removed here because the other computer deleted it)' : ''}` })),
        el('div', { class: 'sync-row-acts' }, el('button', { type: 'button', class: 'ghost small', text: 'Restore', on: { click: async (e) => {
          const r = await api().restore(t.id);
          if (!r.ok) { toast(r.error, { type: 'error' }); return; }
          e.target.disabled = true; e.target.textContent = 'Restored';
          toast(`Restored ${nameOf(r.rel)}`, { timeout: 2500 });
        } } }))))
        : [el('p', { class: 'modal-text', text: 'Nothing deleted lately.' })]));
    };
    q.addEventListener('input', draw);
    draw();
    dialog.append(el('form', { method: 'dialog' }, el('h2', { text: 'Deleted files (synced trash)' }), list.length > 10 ? q : null, rows,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'primary', text: 'Done', on: { click: () => dialog.close() } }))));
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
    const sec = section('Sync (Mac and PC, through your cloud drive)', text, el('div', { class: 'button-row' }, btn, more), bigRow);
    sec.classList.add('sync-settings');
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
    const other = list.filter((x) => !/^chats\//.test(x.rel) && !['config', 'theme', 'file', 'file-deleted'].includes(x.kind));
    if (other.length) {
      const from = other.find((x) => x.from && x.from !== 'trash')?.from || 'your other computer';
      const first = !fresh;
      fresh = { from, at: Date.now() };
      paintDot();
      if (first) toast(`Changes from ${from} arrived (${[...new Set(other.map((x) => nameOf(x.rel)))].slice(0, 3).join(', ')}).`, { action: { label: 'Reload', fn: reload }, timeout: 8000 });
    }
    window.dispatchEvent(new CustomEvent('hearth:synced', { detail: { files: list } }));
  }

  // ---------- /sync ----------
  function registerCommands() {
    if (typeof Commands === 'undefined' || Commands.get?.('sync')) return;
    const SUBS = ['status', 'now', 'on', 'off', 'pause', 'resume', 'conflicts', 'trash', 'restore', 'open', 'big', 'download', 'menu'];
    Commands.register({
      name: 'sync', args: '[status|now|on|pause|resume|conflicts|trash|restore <name>|open|big on/off|off]', area: 'App',
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
        if (sub === 'status') { say(st.on ? `${line()}${peersLine() ? `\n${peersLine()}` : ''}` : 'Sync is off. /sync turns it on (one click).'); return null; }
        if (sub === 'on') { if (rest.length) { const r = await api().on({ root: rest.join(' ') }); await refresh(); say(r.ok ? `Sync is on: ${r.label}${r.joined ? ' (joined the Hearth already there; merging)' : ''}.` : r.error); } else if (!st.on) await setup(); else say(line()); return null; }
        if (!st.on) { say('Sync is off. /sync turns it on (one click).'); return null; }
        if (sub === 'now') { await now(); say(line()); return null; }
        if (sub === 'off') { await off(); return null; }
        if (sub === 'pause' || sub === 'resume') { await pause(sub === 'pause'); return null; }
        if (sub === 'conflicts') { await conflicts(); return null; }
        if (sub === 'trash') { await trash(); return null; }
        if (sub === 'open') { await api().open(); return null; }
        if (sub === 'download') { await download(); return null; }
        if (sub === 'menu') { menu(); return null; }
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

  // ---------- start ----------
  async function init() {
    if (!api()) return;
    api().onStatus((s) => { st = s; mountDot(); for (const f of listeners) { try { f(); } catch { listeners.delete(f); } } });
    api().onPulled((list) => onPulled(list).catch(() => {}));
    api().ack(); // this window just read everything fresh
    registerCommands();
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

  return { status: () => st, refresh, now, setup, conflicts, trash, menu, items, line, settingsSection, pause, off, big };
})();
