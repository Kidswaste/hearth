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
  const KV_NAMES = { 'three-sketches': 'Lab scenes', boards: 'Mood boards', notes: 'Notes', prompts: 'Prompts', 'video-cuts': 'Video edits', 'chat-scenes': 'Chat scenes', 'three-lab-extras': 'Lab looks and songs', 'chat-meta': 'Chat tags and folders', projects: 'Projects', 'three-beatmaps': 'Beat grids', 'video-notes': 'Video notes' };
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
      out.push({ label: `Review the ${st.held.deletes} deleted files by name…`, action: () => held() });
      out.push({ label: `Delete those ${st.held.deletes} files (to the trash)`, action: () => now({ mass: 'apply' }) });
      out.push({ label: 'Keep them (bring them back)', action: () => now({ mass: 'keep' }) });
    }
    if (st.state === 'offline' && st.error === 'missing') out.push({ label: 'Start the cloud copy again from this computer', action: () => now({ fresh: true }) });
    out.push({ label: 'Sync now', action: () => now() });
    if (st.conflicts) out.push({ label: `Conflicts…`, hint: String(st.conflicts), action: () => conflicts() });
    if (st.conflicts) out.push({ label: 'Settle all conflicts for me', action: async () => { const r = await api().resolveAll('auto'); if (r?.ok) toast(`Settled ${r.done} conflict${r.done === 1 ? '' : 's'}${r.failed ? ` (${r.failed} need you)` : ''}. Undo from Deleted files.`, { timeout: 5000, action: { label: 'Deleted files', fn: () => trash() } }); refresh(); } });
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

  // ---------- conflicts (round 19): what it is, both sides by computer and time, the difference, plain choices ----------
  const PLAT = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };
  const HERE_NAME = MAC ? 'this Mac' : /Win/.test(navigator.platform) ? 'this PC' : 'this computer';
  const hereLabel = () => `${HERE_NAME[0].toUpperCase()}${HERE_NAME.slice(1)}${MAC ? '' : /Win/.test(navigator.platform) ? ' (Windows)' : ''}`;
  const thereName = (c) => (!c.from || /^(another|your other) computer$/i.test(c.from) ? 'the other computer' : c.from);
  const thereLabel = (c) => { const n = thereName(c); return `${n[0].toUpperCase()}${n.slice(1)}${PLAT[c.fromPlatform] ? ` (${PLAT[c.fromPlatform]})` : ''}`; };
  function edited(t) {
    if (!t) return 'edited: time not known';
    const d = new Date(t);
    const today = d.toDateString() === new Date().toDateString();
    const clock = today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `edited ${clock}, ${timeAgo(t)}`;
  }
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
  const clip = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const IMG = /\.(png|jpe?g|webp|gif|bmp|avif)$/i; const VID = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const fileUrl = (p) => `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`;
  // the difference, in a few human lines (and pictures where there are some)
  function diffOf(c) {
    const box = el('div', { class: 'sync-diff' });
    const line = (text, cls = '') => box.append(el('div', { class: `sync-dl ${cls}`, text }));
    if (c.kind === 'file') {
      const pic = (p, label, size, at) => el('figure', { class: 'sync-pic' },
        IMG.test(c.rel) ? el('img', { src: fileUrl(p), alt: '', loading: 'lazy' }) : VID.test(c.rel) ? el('video', { src: `${fileUrl(p)}#t=0.1`, muted: true, preload: 'metadata' }) : el('span', { class: 'sync-pic-glyph', text: '📄' }),
        el('figcaption', { text: `${label}${size != null ? ` · ${fmtBytes(size)}` : ''}${at ? ` · ${timeAgo(at)}` : ''}` }));
      box.append(el('div', { class: 'sync-pics' }, pic(c.here, hereLabel(), c.size, c.oursAt), pic(c.there, thereLabel(c), c.theirsSize, c.theirsAt)));
      return box;
    }
    if (/^chats\//.test(c.rel) && c.ours && c.theirs) {
      const key = (m) => (m.id != null ? `id:${m.id}` : `${m.role}@${m.at}`);
      const mine = new Map((c.ours.messages || []).map((m) => [key(m), m]));
      const theirs = new Map((c.theirs.messages || []).map((m) => [key(m), m]));
      const onlyHere = [...mine.keys()].filter((k) => !theirs.has(k)).map((k) => mine.get(k));
      const onlyThere = [...theirs.keys()].filter((k) => !mine.has(k)).map((k) => theirs.get(k));
      if (c.ours.title !== c.theirs.title) line(`Title: “${c.ours.title}” here · “${c.theirs.title}” on ${thereName(c)}`);
      for (const [list, where] of [[onlyHere, `only on ${HERE_NAME}`], [onlyThere, `only on ${thereName(c)}`]]) {
        if (!list.length) continue;
        line(`${list.length} message${list.length === 1 ? '' : 's'} ${where}:`, 'sync-dh');
        for (const m of list.slice(-3)) line(`${m.role === 'user' ? 'You' : 'Reply'}: “${clip(m.text, 110)}”`, 'sync-dq');
      }
    }
    if (c.rel === 'kv/three-sketches.json') {
      const ids = new Set((c.fields || []).map((f) => String(f.path).split('.')[0]));
      for (const id of [...ids].slice(0, 2)) {
        const a = (Array.isArray(c.ours) ? c.ours : []).find((x) => String(x.id) === id); const b = (Array.isArray(c.theirs) ? c.theirs : []).find((x) => String(x.id) === id);
        if (!a && !b) continue;
        const thumb = (() => { try { return ThreeLab.scenes?.thumbOf?.(id); } catch { return null; } })();
        const layers = (s) => new Set((s?.layers || []).map((l) => l.name || l.id));
        const la = layers(a); const lb = layers(b);
        const diffL = [...new Set([...la, ...lb])].filter((n) => la.has(n) !== lb.has(n));
        const codeDiff = a?.code !== b?.code ? `the code differs (${(a?.code || '').split('\n').length} lines here, ${(b?.code || '').split('\n').length} there)` : '';
        box.append(el('div', { class: 'sync-pics' },
          el('figure', { class: 'sync-pic' }, thumb ? el('img', { src: thumb, alt: '' }) : el('span', { class: 'sync-pic-glyph', text: '◭' }), el('figcaption', { text: `${hereLabel()} · “${a?.name || '(gone)'}”` })),
          el('figure', { class: 'sync-pic' }, el('span', { class: 'sync-pic-glyph', text: '◭' }), el('figcaption', { text: `${thereLabel(c)} · “${b?.name || '(gone)'}” (its picture is on that computer)` }))));
        if (diffL.length) line(`Layers only on one side: ${diffL.slice(0, 6).join(', ')}`);
        if (codeDiff) line(`In “${a?.name || b?.name}”, ${codeDiff}`);
      }
    }
    // settings and other data: the changed options / fields with both values, ids turned into names
    if (!box.childElementCount || c.rel === 'app/config.json') {
      for (const f of (c.fields || []).slice(0, 5)) {
        const label = String(f.path).split('.').map((seg) => itemNames(c.ours, [{ path: seg }])[0] || seg).filter((s) => !/^(settings|value)$/.test(s)).join(' › ') || 'the whole thing';
        line(`${label}: ${clip(f.ours, 50)} here · ${clip(f.theirs, 50)} on ${thereName(c)}`);
      }
    }
    if (!box.childElementCount) line('Changed on both computers (not shown in detail).');
    return box;
  }
  async function conflicts() {
    const list = await api().conflicts();
    const full = (await Promise.all(list.slice(0, 30).map((c) => api().preview?.(c.id).catch(() => null)))).map((p, i) => p || list[i]);
    const dialog = el('dialog', { class: 'ui-modal sync-list sync-conflicts' });
    const rows = el('div', { class: 'sync-rows' });
    const picks = new Map(); // conflict id → 'mine' | 'theirs' | 'both' | 'merge'
    const summary = el('p', { class: 'sync-sum' });
    const apply = el('button', { type: 'button', class: 'primary', text: 'Apply', disabled: true });
    const paint = () => {
      const by = { theirs: 0, mine: 0, both: 0, merge: 0 }; const from = new Set();
      for (const [id, k] of picks) { by[k] += 1; if (k === 'theirs') from.add(thereName(full.find((c) => c.id === id) || {})); }
      const bits = [by.theirs && `${by.theirs} from ${[...from].join(' / ')}`, by.mine && `${by.mine} from ${HERE_NAME}`, by.both && `${by.both} kept both`, by.merge && `${by.merge} merged`].filter(Boolean);
      summary.textContent = picks.size ? `${bits.join(', ')}. Every choice can be undone: the version that loses waits in Deleted files for 30 days.` : 'Pick a version for each one, then Apply. Nothing changes until then.';
      apply.disabled = !picks.size; apply.textContent = picks.size > 1 ? `Apply ${picks.size} choices` : 'Apply';
    };
    const rowOf = (c) => {
      const newer = c.oursAt && c.theirsAt ? (c.oursAt > c.theirsAt ? 'here' : 'there') : null;
      const side = (label, t, isNewer) => el('div', { class: 'sync-side' }, el('b', { text: label }), el('span', { class: 'hint', text: `${edited(t)}${isNewer ? ' · newer' : ''}` }));
      const choice = (keep, text, title) => el('button', { type: 'button', class: 'ghost small sync-pick', text, title, dataset: { keep }, on: { click: (e) => {
        if (picks.get(c.id) === keep) picks.delete(c.id); else picks.set(c.id, keep);
        for (const b of e.currentTarget.parentElement.children) b.classList.toggle('on', picks.get(c.id) === b.dataset.keep);
        paint();
      } } });
      const there = thereName(c);
      return el('div', { class: 'sync-row sync-conflict', dataset: { id: c.id } },
        el('div', { class: 'sync-row-main' },
          el('b', { class: 'sync-what', text: whatIs(c) }),
          el('div', { class: 'sync-sides' }, side(hereLabel(), c.oursAt, newer === 'here'), side(thereLabel(c), c.theirsAt, newer === 'there')),
          diffOf(c),
          el('details', { class: 'sync-details' }, el('summary', { text: 'Details' }), el('div', { class: 'hint', text: `${c.rel} · noticed ${timeAgo(c.at)}${c.fields?.length ? ` · ${c.fields.length} field${c.fields.length === 1 ? '' : 's'} changed two ways` : ''}` }))),
        el('div', { class: 'sync-row-acts sync-choices' },
          choice('theirs', `Keep ${there}'s version`, `${there}'s version replaces the one on ${HERE_NAME} (${HERE_NAME}'s goes to Deleted files)`),
          choice('mine', `Keep ${HERE_NAME}'s version`, `${HERE_NAME}'s version stays everywhere (${there}'s goes to Deleted files)`),
          c.canBoth ? choice('both', 'Keep both', `${there}'s version is saved next to it as “… (from ${there})”`) : null,
          c.canMerge ? choice('merge', 'Merge', 'Everything from both; where they differ, the newer one wins (the current one goes to Deleted files first)') : null));
    };
    const draw = (l) => rows.replaceChildren(...(l.length ? l.map(rowOf) : [el('p', { class: 'modal-text', text: 'No conflicts. Changes made on both computers merged by themselves.' })]));
    apply.addEventListener('click', async () => {
      apply.disabled = true;
      const fails = [];
      for (const [id, keep] of picks) { const r = await api().resolve(id, keep).catch((err) => ({ ok: false, error: err.message })); if (!r?.ok) fails.push(r?.error || 'failed'); }
      const done = picks.size - fails.length;
      const said = summary.textContent.split('.')[0];
      picks.clear();
      const left = await api().conflicts();
      full.splice(0, full.length, ...(await Promise.all(left.slice(0, 30).map((c) => api().preview?.(c.id).catch(() => null)))).map((p, i) => p || left[i]));
      draw(full); paint(); setTitle(); bulk.hidden = !full.length; refresh();
      if (fails.length) toast(fails[0], { type: 'error' });
      if (done) toast(`Done: ${said}. Undo any of it from Deleted files.`, { timeout: 5000, action: { label: 'Deleted files', fn: () => trash() } });
    });
    // (round 26) all at once: settle them for me (data merged, files newest wins) / newest / this computer's; ↻ refresh
    const title = el('h2');
    const setTitle = () => { title.textContent = full.length ? `${full.length} thing${full.length === 1 ? ' was' : 's were'} changed on both computers` : 'Sync conflicts'; };
    const reload = async () => {
      const left = await api().conflicts();
      full.splice(0, full.length, ...(await Promise.all(left.slice(0, 30).map((c) => api().preview?.(c.id).catch(() => null)))).map((p, i) => p || left[i]));
      picks.clear(); draw(full); paint(); setTitle(); bulk.hidden = !full.length; refresh();
    };
    const all = async (mode, label) => {
      for (const b of bulk.querySelectorAll('button')) b.disabled = true;
      const r = await api().resolveAll(mode).catch((err) => ({ ok: false, error: err.message }));
      for (const b of bulk.querySelectorAll('button')) b.disabled = false;
      if (!r?.ok) { toast(r?.error || 'Could not settle them', { type: 'error' }); return; }
      await reload();
      toast(`${label}: ${r.done} settled${r.failed ? `, ${r.failed} left (pick those by hand)` : ''}. Undo any of it from Deleted files.`, { timeout: 6000, action: { label: 'Deleted files', fn: () => trash() } });
    };
    const autoBox = el('input', { type: 'checkbox' });
    api().autoResolve?.().then((on) => { autoBox.checked = on !== false; }).catch(() => {});
    autoBox.addEventListener('change', () => api().autoResolve?.(autoBox.checked));
    const bulk = el('div', { class: 'sync-bulk', hidden: !full.length },
      el('button', { type: 'button', class: 'primary', text: '✓ Settle all for me', title: 'Chats, scenes and settings: merged (everything from both, the newer one wins where they differ). Pictures and files: the newer one wins. The other versions wait in Deleted files for 30 days.', on: { click: () => all('auto', 'Settled') } }),
      el('button', { type: 'button', class: 'ghost small', text: 'Newest wins, all', title: 'For every conflict, keep the version edited last', on: { click: () => all('newest', 'Newest kept') } }),
      el('button', { type: 'button', class: 'ghost small', text: `${HERE_NAME}'s, all`, title: `For every conflict, keep the version on ${HERE_NAME}`, on: { click: () => all('mine', `${HERE_NAME}'s kept`) } }));
    const refreshBtn = el('button', { type: 'button', class: 'ghost small', text: '↻ Refresh', title: 'Sync now and list the conflicts again', on: { click: async () => { refreshBtn.disabled = true; try { await api().now?.({}); } catch { /* listed anyway */ } await reload(); refreshBtn.disabled = false; } } });
    draw(full); paint(); setTitle();
    dialog.append(el('form', { method: 'dialog' }, el('div', { class: 'sync-conf-head' }, title, refreshBtn),
      list.length ? el('p', { class: 'hint', text: `Both versions are kept until one wins, on ${HERE_NAME} and on ${[...new Set(full.map(thereName))].join(', ')}.` }) : null,
      bulk, rows, list.length ? summary : null,
      el('label', { class: 'hint sync-auto' }, autoBox, ' Settle new conflicts by themselves (data merged, files newest wins; undo from Deleted files)'),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', text: list.length ? 'Later' : 'Done', on: { click: () => dialog.close() } }), list.length ? apply : null)));
    dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 0));
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

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
          let r = await api().restore(t.id);
          // (round 19) undoing a conflict choice: the version in place goes to the trash, this one comes back
          if (!r.ok && r.exists && await Modal.confirm('Put this version back?', `${nameOf(t.rel)} is there now. Put this version back? The one in place goes to Deleted files (it can come back too).`, { ok: 'Put it back' })) r = await api().restore(t.id, { replace: true });
          if (!r.ok) { if (!r.exists) toast(r.error, { type: 'error' }); return; }
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
    const SUBS = ['status', 'now', 'on', 'off', 'pause', 'resume', 'conflicts', 'review', 'trash', 'restore', 'open', 'big', 'download', 'menu'];
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
        if (sub === 'status') { say(st.on ? `${line()}${peersLine() ? `\n${peersLine()}` : ''}` : 'Sync is off. /sync turns it on (one click).'); return null; }
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

  // ---------- start ----------
  async function init() {
    if (!api()) return;
    api().onStatus((s) => { st = s; mountDot(); for (const f of listeners) { try { f(); } catch { listeners.delete(f); } } });
    api().onPulled((list) => onPulled(list).catch(() => {}));
    // (round 26) conflicts settled by themselves after a sync: one quiet line, undo one click away
    api().onAutoResolved?.((r) => { if (r?.done) toast(`Sync settled ${r.done} conflict${r.done === 1 ? '' : 's'} by itself (data merged, files: the newer one). Undo from Deleted files.`, { timeout: 5000, action: { label: 'Deleted files', fn: () => trash() } }); refresh(); });
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

  return { status: () => st, refresh, now, setup, conflicts, held, whatIs, trash, menu, items, line, settingsSection, pause, off, big, background };
})();
