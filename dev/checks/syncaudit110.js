// (round 110, syncaudit110) Sync as the owner meets it, end to end by clicks, after rounds 92–105 changed a lot
// underneath. Part 1 (this file): the real sync engine and a temp "OneDrive" folder in the run's own scratch space, with
// a made-up "Studio Mac" (its machine record; it writes its versions straight into the cloud copy, as its Hearth would):
//   1. first-time setup on a new computer: Settings › Turn on sync… → "Use this Hearth?" (the Mac's Hearth is already
//      in the drive) → Use this Hearth → the first sync, and what the chip / panel / notes say at each step
//   2. day to day: a change on the PC reaches the cloud copy; the Mac's change and new title reach this PC (no reload)
//   3. both at once: a chat (the note's Choose → the panel → Compare… → Keep the Mac's → Undo) and a note (Compare… →
//      Keep this one → "Use the Mac's instead"); the chip / tooltip agree at each step
//   4. deleted on one computer: the Mac deletes a chat → it leaves here, Deleted files says so → Restore; this PC deletes
//      one → it leaves the cloud copy → Deleted files (the synced list both computers read) → Restore
//   5. trouble: the cloud folder emptied (Start the cloud copy again from here); the drive unplugged (Offline, the note,
//      Pick the folder again…) and plugged back; an old laptop not seen for 20 days (Your computers… → Forget it) that
//      comes back; "Send very long chats in pieces" turned on by click with the Mac reading pieces, then without
// Part 2 (syncaudit110-states.js): the states only a made-up status can show here (a file held by another program
// that recovers by itself, disk full, an older / newer Hearth, a long folder path on the PC…) and every fix button.
// This computer acts as a Windows PC for the words. Nothing outside the run's scratch folder is read or written, except
// what the app's own Delete puts in the Trash; nothing is uploaded anywhere.
//   node dev/smoke.js --check-timeout 600000 --lib dev/checks/journey-lib.js --script dev/checks/syncaudit110.js
const { step, wait, until, click } = J;
const real = window.hub.sync;
const T0 = Date.now();
const DAY = 864e5;
const DRIVE = `${window.SMOKE_TMP || '/tmp'}/sa110-${T0}/OneDrive`;
const HEARTH = `${DRIVE}/Hearth`; const FILES = `${HEARTH}/files`; const MD = `${HEARTH}/.sync/machines`;
const audit = J.out.audit = {}; const times = J.out.times = {};
Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
const dot = () => document.getElementById('sync-dot');
const chip = () => dot()?.querySelector('.sync-chip')?.textContent || '';
const tip = () => dot()?.title || '';
const panel = () => document.querySelector('.sync-panel');
const h2 = () => panel()?.querySelector('h2')?.textContent || '';
const text = (n) => (n?.textContent || '').replace(/\s+/g, ' ').trim();
const mainText = () => { const p = panel()?.cloneNode(true); if (!p) return ''; for (const d of p.querySelectorAll('details')) d.remove(); return text(p); };
const btn = (re, root = panel()) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const toasts = () => [...document.querySelectorAll('.toast')];
const toastBtn = (re) => { for (const t of toasts().reverse()) { const b = [...t.querySelectorAll('button')].find((x) => re.test(x.textContent.trim())); if (b) return b; } return null; };
const said = (since) => recentToasts().filter((t) => t.at >= since).map((t) => t.message);
const clearToasts = () => { for (const t of toasts()) t.querySelector('.toast-x')?.click(); };
const view = () => document.querySelector('dialog.ka-view[open]');
const JARGON = /(\/tmp\/|[A-Z]:\\|\/Users\/|\.json\b|\bmanifest\b|\bkv\/|\bchats\/|studio-mac-|old-laptop-|\bE[A-Z]{3,}\b|\bundefined\b|\bnull\b|\bNaN\b)/;
const see = (name, extra = {}) => { audit[name] = { chip: chip(), title: h2(), tip: tip().split('\n').slice(0, 2).join(' / '), text: mainText().slice(0, 500), buttons: [...(panel()?.querySelectorAll('button') || [])].map((b) => b.textContent.trim()).filter(Boolean), ...extra }; console.log(`[SA110] ${name} ${JSON.stringify(audit[name])}`); return audit[name]; };
// the chip as it changes (each distinct text, in order) while `fn` runs
async function chips(fn) {
  const seen = [chip()]; const mo = new MutationObserver(() => { const c = chip(); if (c && c !== seen.at(-1)) seen.push(c); });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  try { await fn(); } finally { await wait(150); mo.disconnect(); }
  return seen;
}
const section = async (name, fn) => {
  const t = Date.now();
  try { await fn(); } catch (err) { step(`${name}: ran to the end`, false, String(err?.stack || err).slice(0, 400)); } finally {
    times[name] = Date.now() - t;
    document.querySelectorAll('dialog.ka-view, dialog.sync-list, dialog.sync-setup').forEach((d) => d.close());
    document.querySelector('dialog.settings-dialog')?.close();
    SyncPanel?.close?.(); clearToasts(); await wait(200);
  }
};
async function openPanel() {
  if (panel()) return panel();
  await until(() => J.visible(dot()), 8000);
  await click('#sync-dot');
  await until(() => panel()?.querySelector('h2'), 15000);
  return panel();
}
// a click on a panel button found again right before (the panel redraws when a status arrives)
async function tap(re, what = String(re)) {
  let b = null; let prev = null;
  for (let i = 0; i < 20; i++) { await wait(80); b = btn(re); if (b && b === prev) break; prev = b; }
  if (!b) { step(`there is a button to click: ${what}`, false, see(`missing ${what}`)); return false; }
  await click(b); return true;
}
const cloudOf = (rel) => `${FILES}/${rel}`;
const cloudJson = async (rel) => { try { if (!(await window.hub.fs.stat(cloudOf(rel)))) return null; return JSON.parse(await window.hub.fs.read(cloudOf(rel))); } catch { return null; } }; // (stat first: a read of a missing file is an error in the main log)
const macWrite = async (rel, v) => window.hub.fs.write(cloudOf(rel), JSON.stringify(v, null, 2));
const syncNow = async () => { await Sync.now({ quiet: true }); await wait(400); };
const kv = async (name) => { const r = await window.hub.kvGet(name, null, { status: true }); return r?.state === 'ok' ? r.value : null; };
const chatHere = async (id) => { try { return await window.hub.getChat(id); } catch { return null; } };
// each section starts from its own chats (a failed step before doesn't take the rest down with it)
async function ensure(c) { if (!(await chatHere(c.id))) { await window.hub.saveChat({ ...c, updatedAt: Date.now() }); H.chats = await window.hub.listChats(); } }
// Deleted files' rows: { name, hint } (a deleted thing's row says "deleted or replaced …"; "the version before …" is an
// earlier version kept when something arrived)
const dRows = (dlg) => [...(dlg?.querySelectorAll('.sync-row') || [])].map((r) => ({ r, name: text(r.querySelector('b')), hint: text(r.querySelector('.hint')) }));
const deletedRow = (dlg, re) => dRows(dlg).find((x) => re.test(x.name) && /^deleted or replaced|deleted/.test(x.hint) && !/version before/.test(x.hint));
const restoreRow = async (dlg, re) => { const r = deletedRow(dlg, re)?.r; const b = r && [...r.querySelectorAll('button')].find((x) => /^Restore/.test(x.textContent.trim())); if (b) await click(b); return Boolean(b); };
// both changed while no pass can run (round 96): this computer's change, then the Mac's in the cloud copy
async function both(rel, here, mac) {
  await real.pause(true);
  try { await real.now(); await here(); await wait(300); await macWrite(rel, mac(await cloudJson(rel))); } finally { await real.pause(false); }
  let got = null;
  await until(async () => { await syncNow(); const c = (await real.conflicts()).find((x) => x.rel === rel); const a = (Sync.status().aside || []).find((x) => x.rel === rel); got = c ? { conflict: c.id } : a ? { aside: a.id } : null; return got; }, 25000);
  return got;
}
// the cloud folder's files, to put back when the drive is "plugged in" again
async function snapshot(dir) {
  const list = (await window.hub.fs.list(dir, { recursive: true, depth: 12 })) || [];
  const out = [];
  for (const f of list.filter((x) => !x.isDir)) out.push({ path: f.path, b64: await window.hub.fs.read(f.path, { encoding: 'base64' }) });
  return out;
}
const claude = H.claudeAgent();
const MAC = { id: 'studio-mac-110a1b2c', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: T0 - 60000, lastOk: T0 - 60000, format: 74, app: '0.109.0', packs: 1 };
const MACCHAT = { id: 'sa110-macchat', agentId: claude.id, title: 'Mac sketchbook', updatedAt: T0 - 120000, messages: [{ id: 'm1', role: 'user', at: T0 - 120000, text: 'Written on the Mac before this PC joined' }] };
const PCCHAT = { id: 'sa110-pcchat', agentId: claude.id, title: 'Tour setlist', updatedAt: T0, messages: [{ id: 'p1', role: 'user', at: T0, text: 'Written on this PC before sync was on' }] };

// ---------- 1. first-time setup on a new computer ----------
await section('first-time setup', async () => {
  // the Mac's Hearth is already in the drive; this PC has its own chat
  await window.hub.fs.write(`${MD}/${MAC.id}.json`, JSON.stringify(MAC));
  await macWrite(`chats/${MACCHAT.id}.json`, MACCHAT);
  await window.hub.saveChat(PCCHAT);
  H.chats = await window.hub.listChats();
  step('first time: sync is off, no indicator in the rail', !Sync.status().on && !dot(), Sync.status().state);
  // the drive this PC finds: the temp "OneDrive" (only detect is answered here; turning on is the real engine's)
  const proposed = { id: 'onedrive', label: 'OneDrive', root: DRIVE, hearth: { machines: [{ name: MAC.name, lastSeen: MAC.lastSeen }], lastSeen: MAC.lastSeen } };
  Sync._setApi(() => new Proxy({}, { get: (t, k) => (k === 'detect' ? async () => ({ list: [proposed], proposed, dataDir: '', inside: null }) : typeof real[k] === 'function' ? (...a) => real[k](...a) : real[k]) }));
  try {
    await AppUI.openSettings('');
    const sdlg = () => document.querySelector('dialog.settings-dialog[open]');
    await until(() => btn(/^Turn on sync…$/, sdlg()), 15000);
    const sLine = text(sdlg()?.querySelector('.sync-settings-line'));
    step('Settings says sync is off, with "Turn on sync…"', /Sync is off/.test(sLine) && Boolean(btn(/^Turn on sync…$/, sdlg())), sLine);
    await click(btn(/^Turn on sync…$/, sdlg()));
    const setup = () => document.querySelector('dialog.sync-setup[open]');
    await until(setup, 6000);
    const sText = text(setup()?.querySelector('form'));
    audit['setup: the drive has the Mac\'s Hearth'] = { text: sText.slice(0, 400), buttons: [...(setup()?.querySelectorAll('button') || [])].map((b) => b.textContent.trim()) };
    console.log(`[SA110] setup ${JSON.stringify(audit['setup: the drive has the Mac\'s Hearth'])}`);
    step('setup: "Use this Hearth?", found in OneDrive from Studio Mac, merged, nothing overwritten', /Use this Hearth\?/.test(sText) && /OneDrive/.test(sText) && /Studio Mac/.test(sText) && /nothing is overwritten/.test(sText), sText.slice(0, 300));
    step('setup: no folder paths in its words', !JARGON.test(sText), sText.match(JARGON)?.[0]);
    const t0 = Date.now();
    let toastWords = [];
    const seq = await chips(async () => {
      await click(btn(/^Use this Hearth$/, setup()));
      await until(() => Sync.status().on, 10000);
      Sync._setApi(null);
      await until(() => Sync.status().state === 'synced', 40000);
      await until(() => /✓ Synced/.test(chip()), 5000);
      toastWords = said(t0);
    });
    times['first sync (click → ✓ Synced)'] = Date.now() - t0;
    audit['first sync'] = { chips: seq, said: toastWords };
    step('first sync: a note says what happened ("Using the Hearth in OneDrive (from Studio Mac): merging, nothing is overwritten")', toastWords.some((m) => /Using the Hearth in OneDrive \(from Studio Mac\)/.test(m)), toastWords);
    step('first sync: the chip shows it working, then "✓ Synced"', seq.at(-1) === '✓ Synced' && seq.some((c) => /↻/.test(c)), seq);
    step('first sync: no alarm on the way (no ⚠ or "Offline" while it was just syncing)', !seq.some((c) => /⚠|Offline/.test(c)), seq);
    const sLine2 = text(sdlg()?.querySelector('.sync-settings-line'));
    step('Settings › Sync now says it is synced', /synced with OneDrive/i.test(sLine2), sLine2);
  } finally { Sync._setApi(null); document.querySelector('dialog.settings-dialog')?.close(); }
  await real.autoResolve(false); // (choices wait for a click in this check)
  await until(async () => { H.chats = await window.hub.listChats(); return H.chats.some((c) => c.title === 'Mac sketchbook'); }, 15000);
  step('first sync: the Mac\'s chat is here, in the chat list, without a reload', (H.chats || []).some((c) => c.title === 'Mac sketchbook'), (H.chats || []).map((c) => c.title).slice(0, 8));
  step('first sync: this PC\'s chat went up to the cloud copy (merged, nothing overwritten)', (await cloudJson(`chats/${PCCHAT.id}.json`))?.title === 'Tour setlist');
  // the one-time welcome note on a new computer
  await until(() => document.querySelector('.two-welcome'), 10000);
  const wText = text(document.querySelector('.two-welcome'));
  audit['welcome note'] = { text: wText.slice(0, 400) };
  step('first sync: the welcome note says which computer this is and what needs a click', Boolean(wText) && !JARGON.test(wText), wText.slice(0, 300));
  const gotIt = [...document.querySelectorAll('.two-welcome button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
  if (gotIt) { await click(gotIt); await until(() => !document.querySelector('.two-welcome'), 3000); }
  await openPanel();
  const s = see('after the first sync');
  step('after the first sync: "✓ Synced" in the rail and "Synced just now" on the panel, Studio Mac named', s.chip === '✓ Synced' && /^Synced (just now|\d+ min ago)/.test(s.title) && /Studio Mac/.test(s.text), s);
  step('after the first sync: no paths or ids in the panel', !JARGON.test(s.text), s.text.match(JARGON)?.[0]);
});

// ---------- 2. day to day: PC → Mac, Mac → PC ----------
await section('day to day', async () => {
  await openPanel();
  // this PC: a new message
  const cur = await chatHere(PCCHAT.id);
  await window.hub.saveChat({ ...cur, updatedAt: Date.now(), messages: [...cur.messages, { id: 'p2', role: 'user', at: Date.now(), text: 'Added on the PC: bring the cables' }] });
  let t0 = Date.now();
  await tap(/^Sync now$/, 'Sync now');
  await until(async () => ((await cloudJson(`chats/${PCCHAT.id}.json`))?.messages || []).some((m) => /bring the cables/.test(m.text)), 15000);
  times['PC → cloud copy (Sync now → there)'] = Date.now() - t0;
  step('day to day: the PC\'s new message is in the cloud copy (what the Mac reads)', ((await cloudJson(`chats/${PCCHAT.id}.json`))?.messages || []).some((m) => /bring the cables/.test(m.text)), times['PC → cloud copy (Sync now → there)']);
  // the Mac: a new message and a new title
  const mc = await cloudJson(`chats/${MACCHAT.id}.json`);
  await macWrite(`chats/${MACCHAT.id}.json`, { ...mc, title: 'Mac sketchbook (renamed)', updatedAt: Date.now(), messages: [...mc.messages, { id: 'm2', role: 'user', at: Date.now(), text: 'Added on the Mac: call the venue' }] });
  t0 = Date.now();
  await until(async () => { await tap(/^Sync now$/, 'Sync now'); await wait(500); return ((await chatHere(MACCHAT.id))?.messages || []).some((m) => /call the venue/.test(m.text)); }, 25000);
  times['Mac → this PC (Sync now → here)'] = Date.now() - t0;
  step('day to day: the Mac\'s new message is in the chat here', ((await chatHere(MACCHAT.id))?.messages || []).some((m) => /call the venue/.test(m.text)), times['Mac → this PC (Sync now → here)']);
  await until(() => (H.chats || []).some((c) => c.title === 'Mac sketchbook (renamed)'), 5000);
  step('day to day: …and its new title is in the chat list, without a reload', (H.chats || []).some((c) => c.title === 'Mac sketchbook (renamed)'), (H.chats || []).map((c) => c.title).slice(0, 8));
  await until(() => chip() === '✓ Synced', 8000);
  const s = see('day to day');
  step('day to day: still "✓ Synced", and the panel agrees', s.chip === '✓ Synced' && /^Synced/.test(s.title) && /^Synced/.test(s.tip), s);
});

// ---------- 3. both at once ----------
await section('both at once: chat', async () => {
  const t = Date.now();
  const src = await both(`chats/${PCCHAT.id}.json`,
    async () => { const c = await chatHere(PCCHAT.id); await window.hub.saveChat({ ...c, title: 'Tour setlist (PC)', updatedAt: Date.now() }); },
    (v) => ({ ...v, title: 'Tour setlist (Mac)', updatedAt: Date.now() }));
  step('chat changed on both: waits for a choice', Boolean(src?.conflict), src);
  await until(() => /⚠ 1 conflict/.test(chip()), 6000);
  step('chat changed on both: "⚠ 1 conflict" in the rail; the tooltip doesn\'t say everything is synced', chip() === '⚠ 1 conflict' && !/Everything is synced/.test(tip()), { chip: chip(), tip: tip().split('\n').slice(0, 2) });
  await until(() => toastBtn(/^Choose$/), 6000);
  step('…a note says so, with "Choose"', said(t).some((m) => /changed on both computers/.test(m)) && Boolean(toastBtn(/^Choose$/)), said(t));
  if (toastBtn(/^Choose$/)) await click(toastBtn(/^Choose$/)); else await openPanel();
  await until(() => panel()?.querySelector('.sp-conflict .sp-compare'), 15000);
  const s = see('conflict (from the note\'s Choose)');
  step('"Choose" opens the panel at the conflict: both titles, Keep PC / Keep Mac / Keep both / Compare…', /Tour setlist \(PC\)/.test(s.text) && /Tour setlist \(Mac\)/.test(s.text) && ['Keep PC', 'Keep Mac', 'Keep both', 'Compare…'].every((b) => s.buttons.includes(b)), s);
  step('the panel\'s title and the chip agree ("1 conflict — choose")', /1 conflict — choose/.test(s.title) && s.chip === '⚠ 1 conflict', s);
  await click(panel().querySelector('.sp-conflict .sp-compare'));
  await until(() => view() && !/Looking at both/.test(view().querySelector('.ka-main')?.textContent || ''), 15000);
  const heads = [...(view()?.querySelectorAll('.ka-h b') || [])].map(text);
  step('Compare…: "This PC" and "Mac" side by side, the title both ways', /This PC/.test(heads[0] || '') && /Mac/.test(heads[1] || '') && /Tour setlist \(PC\)/.test(text(view())) && /Tour setlist \(Mac\)/.test(text(view())), heads);
  await click(view().querySelector('.ka-keep-b'));
  await until(() => !view(), 10000);
  await until(async () => (await chatHere(PCCHAT.id))?.title === 'Tour setlist (Mac)', 10000);
  step('Keep this one (the Mac\'s): its title here', (await chatHere(PCCHAT.id))?.title === 'Tour setlist (Mac)');
  await until(() => toastBtn(/^Undo$/), 5000);
  step('…said, with Undo', said(t).some((m) => /Mac's version/.test(m)) && Boolean(toastBtn(/^Undo$/)), said(t).slice(-2));
  await Sync.refresh();
  await until(() => chip() === '✓ Synced', 8000);
  step('…the rail is back to "✓ Synced"', chip() === '✓ Synced', chip());
  const u = Date.now();
  await click(toastBtn(/^Undo$/));
  await until(async () => (await chatHere(PCCHAT.id))?.title === 'Tour setlist (PC)', 15000);
  step('Undo: this PC\'s title again', (await chatHere(PCCHAT.id))?.title === 'Tour setlist (PC)', said(u));
  await syncNow(); await Sync.refresh();
  await until(() => chip() === '✓ Synced', 8000);
  step('…and the rail says "✓ Synced"', chip() === '✓ Synced', { chip: chip(), tip: tip().split('\n')[1] });
});

await section('both at once: note', async () => {
  const id = 'sa110-note';
  const list = (await kv('notes')) || [];
  await window.hub.kvSet('notes', [...list.filter((n) => n.id !== id), { id, title: 'Rider', text: '# Rider\n- water\n- two towels\n- a fan', updatedAt: Date.now() }]);
  await StoreAck.arrived([{ rel: 'kv/notes.json' }]);
  await until(async () => { await syncNow(); return ((await cloudJson('kv/notes.json')) || []).some?.((n) => n.id === id); }, 15000);
  const src = await both('kv/notes.json',
    async () => { const l = await kv('notes'); await window.hub.kvSet('notes', l.map((n) => (n.id === id ? { ...n, text: n.text.replace('two towels', 'three towels (PC)'), updatedAt: Date.now() } : n))); await StoreAck.arrived([{ rel: 'kv/notes.json' }]); },
    (l) => l.map((n) => (n.id === id ? { ...n, text: n.text.replace('two towels', 'four towels (Mac)'), updatedAt: Date.now() } : n)));
  step('note changed on both: waits for a choice', Boolean(src), src);
  await Sync.refresh(); await openPanel(); await SyncPanel.render();
  const sel = src?.conflict ? `.sp-conflict[data-id="${src.conflict}"] .sp-compare` : `.sp-aside[data-id="${src?.aside}"] .sp-aside-compare`;
  await until(() => panel()?.querySelector(sel), 10000);
  const s = see('note conflict');
  step('note: the panel names it ("Notes") and the chip agrees with the title', /Notes/.test(s.text) && (s.chip === '⚠ 1 conflict' ? /1 conflict/.test(s.title) : /kept aside|compare/.test(s.title)), s);
  await click(panel().querySelector(sel));
  await until(() => view() && !/Looking at both/.test(view().querySelector('.ka-main')?.textContent || ''), 15000);
  const del = [...view().querySelectorAll('.ka-l.ka-del')].map(text); const add = [...view().querySelectorAll('.ka-l.ka-add')].map(text);
  step('note: Compare… shows the line that differs on each side', del.some((x) => /three towels/.test(x)) && add.some((x) => /four towels/.test(x)), { del, add });
  await click(view().querySelector('.ka-keep-a'));
  await until(() => !view(), 10000);
  const t = Date.now();
  await until(() => toastBtn(/^Use .*Mac's instead$|^Undo$/), 5000);
  step('note: Keep this one (this PC\'s): said, with a way back ("Use the Mac\'s instead")', Boolean(toastBtn(/^Use .*Mac's instead$/)), said(t - 3000).slice(-2));
  await until(async () => { await syncNow(); return /three towels/.test(((await cloudJson('kv/notes.json')) || []).find?.((n) => n.id === id)?.text || ''); }, 15000);
  step('note: this PC\'s text is in the cloud copy (the Mac gets it)', /three towels/.test(((await cloudJson('kv/notes.json')) || []).find?.((n) => n.id === id)?.text || ''));
  if (toastBtn(/^Use .*Mac's instead$/)) {
    await click(toastBtn(/^Use .*Mac's instead$/));
    await until(async () => /four towels/.test((await kv('notes'))?.find((n) => n.id === id)?.text || ''), 15000);
    step('note: "Use the Mac\'s instead" → the Mac\'s text here', /four towels/.test((await kv('notes'))?.find((n) => n.id === id)?.text || ''), (await kv('notes'))?.find((n) => n.id === id)?.text);
  }
  await syncNow(); await Sync.refresh();
  await until(() => chip() === '✓ Synced', 8000);
  step('note: the rail is back to "✓ Synced"', chip() === '✓ Synced', chip());
});

// ---------- 4. deleted on one computer ----------
await section('deleted on the Mac', async () => {
  const rel = `chats/${MACCHAT.id}.json`;
  const body = await window.hub.fs.read(cloudOf(rel));
  // the Mac's Delete: the chat moves to Hearth's trash/ (Recently deleted), in the cloud copy
  await window.hub.fs.write(cloudOf(`trash/${MACCHAT.id}.json`), body);
  await window.hub.fs.trash([cloudOf(rel)]);
  const t0 = Date.now();
  await until(async () => { await syncNow(); H.chats = await window.hub.listChats(); return !H.chats.some((c) => c.id === MACCHAT.id); }, 30000);
  times['deleted on the Mac → gone here'] = Date.now() - t0;
  step('deleted on the Mac: the chat leaves this PC\'s chat list', !(H.chats || []).some((c) => c.id === MACCHAT.id), times['deleted on the Mac → gone here']);
  await until(() => chip() === '✓ Synced', 8000);
  step('…the rail stays calm ("✓ Synced")', chip() === '✓ Synced', chip());
  await openPanel();
  await tap(/^Deleted files…$/, 'Deleted files…');
  const dlg = () => [...document.querySelectorAll('dialog.sync-list[open]')].pop();
  await until(dlg, 8000);
  const row = () => deletedRow(dlg(), /Mac sketchbook/);
  await until(row, 5000);
  const dText = text(dlg());
  audit['Deleted files (deleted on the Mac)'] = { rows: dRows(dlg()).map((x) => `${x.name} · ${x.hint}`) };
  step('Deleted files: the chat by name, "deleted today", kept 30 days; no paths', Boolean(row()) && /30 days/.test(dText) && !/chats\/|\.json/.test(dText), dText.slice(0, 300));
  if (await restoreRow(dlg(), /Mac sketchbook|^A chat$/)) {
    await until(async () => { H.chats = await window.hub.listChats(); return H.chats.some((c) => c.id === MACCHAT.id); }, 10000);
    step('Restore: the chat is back here', (H.chats || []).some((c) => c.id === MACCHAT.id), said(t0).slice(-2));
    await until(async () => { await syncNow(); return Boolean(await cloudJson(rel)); }, 20000);
    step('…and sync takes it back to the cloud copy (the Mac gets it again)', Boolean(await cloudJson(rel)));
    const rd = (await window.hub.listChatTrash().catch(() => null)) || [];
    audit['Recently deleted after Restore'] = { stillThere: rd.some((c) => c.id === MACCHAT.id) };
    step('…and it isn\'t also left in Recently deleted', !rd.some((c) => c.id === MACCHAT.id), rd.map((c) => c.title));
  }
  dlg()?.close();
  await ensure(MACCHAT);
});

await section('deleted on this PC', async () => {
  const rel = `chats/${PCCHAT.id}.json`;
  await until(async () => { await syncNow(); return Boolean(await cloudJson(rel)); }, 10000);
  await ensure(PCCHAT); await until(async () => { await syncNow(); return Boolean(await cloudJson(rel)); }, 10000);
  const r0 = await window.hub.deleteChat(PCCHAT.id);
  H.chats = await window.hub.listChats();
  const t0 = Date.now();
  await until(async () => { await syncNow(); return !(await cloudJson(rel)); }, 30000);
  times['deleted here → gone from the cloud copy'] = Date.now() - t0;
  step('deleted on this PC: it leaves the cloud copy (the Mac\'s copy goes too)', !(await cloudJson(rel)), { r0, ms: times['deleted here → gone from the cloud copy'] });
  const list = await real.trash();
  const mine = list.filter((x) => x.rel.replace(/(^|\/)[0-9a-f]{8}-([^/]+)$/, '$1$2') === rel && x.where === 'cloud');
  step('…its cloud copy waits in the synced Deleted files (the list both computers read)', mine.length >= 1, list.map((x) => `${x.where}:${x.rel}`).slice(0, 8));
  await openPanel();
  await tap(/^Deleted files…$/, 'Deleted files…');
  const dlg = () => [...document.querySelectorAll('dialog.sync-list[open]')].pop();
  await until(dlg, 8000);
  const row = () => deletedRow(dlg(), /Tour setlist/);
  await until(row, 5000);
  audit['Deleted files (deleted on this PC)'] = { rows: dRows(dlg()).map((x) => `${x.name} · ${x.hint}`) };
  step('Deleted files: the chat by name, and that it was deleted, in plain words', Boolean(row()) && !/chats\/|\.json/.test(`${row()?.name} ${row()?.hint}`), audit['Deleted files (deleted on this PC)']);
  if (await restoreRow(dlg(), /Tour setlist|^A chat$/)) {
    await until(async () => { H.chats = await window.hub.listChats(); return H.chats.some((c) => c.id === PCCHAT.id); }, 10000);
    step('Restore: the chat is back here', (H.chats || []).some((c) => c.id === PCCHAT.id), said(t0).slice(-3));
    await until(async () => { await syncNow(); return Boolean(await cloudJson(rel)); }, 20000);
    step('…and in the cloud copy again', Boolean(await cloudJson(rel)));
    const rd = (await window.hub.listChatTrash().catch(() => null)) || [];
    audit['Recently deleted after Restore (here)'] = { stillThere: rd.some((c) => c.id === PCCHAT.id) };
    step('…and it isn\'t also left in Recently deleted', !rd.some((c) => c.id === PCCHAT.id), rd.map((c) => c.title));
  }
  dlg()?.close();
  await ensure(PCCHAT);
});

// ---------- 5. trouble ----------
await section('cloud folder emptied', async () => {
  await ensure(PCCHAT); await ensure(MACCHAT);
  await syncNow();
  const kids = (await window.hub.fs.list(FILES)) || [];
  await window.hub.fs.trash(kids.map((k) => k.path));
  await Sync.now({ quiet: true });
  await until(() => Sync.status().state === 'offline' && Sync.status().error === 'emptied', 15000);
  await openPanel(); await SyncPanel.render();
  const s = see('cloud folder emptied (real engine)');
  step('emptied: "⚠ Folder" / "The cloud folder is empty · paused"; nothing here was deleted', s.chip === '⚠ Folder' && /cloud folder is empty/.test(s.title) && /nothing here was deleted/i.test(s.text), s);
  H.chats = await window.hub.listChats();
  step('…and indeed: this PC\'s chats are all still here', [PCCHAT.id, MACCHAT.id].every((id) => H.chats.some((c) => c.id === id)), H.chats.length);
  const t0 = Date.now();
  await tap(/^Start the cloud copy again from here$/, 'Start the cloud copy again from here');
  await until(() => Sync.status().state === 'synced', 30000);
  times['emptied → Start again → ✓ Synced'] = Date.now() - t0;
  await until(() => chip() === '✓ Synced', 5000);
  step('one click: the cloud copy is made again from here, "✓ Synced"', chip() === '✓ Synced' && Boolean(await cloudJson(`chats/${PCCHAT.id}.json`)) && Boolean(await cloudJson(`chats/${MACCHAT.id}.json`)), { chip: chip(), ms: times['emptied → Start again → ✓ Synced'] });
});

await section('drive unplugged', async () => {
  await ensure(PCCHAT);
  await syncNow();
  const snap = await snapshot(DRIVE);
  await window.hub.fs.trash([DRIVE]);
  const t = Date.now();
  await Sync.now();
  await until(() => Sync.status().state === 'offline' && !Sync.status().error, 10000);
  await openPanel(); await SyncPanel.render();
  const s = see('drive unplugged (real engine)', { said: said(t) });
  step('unplugged: "○ Offline", it keeps working here and catches up, with "Pick the folder again…"', s.chip === '○ Offline' && /keeps working here/.test(s.text) && Boolean(btn(/^Pick the folder again/)), s);
  step('…Sync now\'s note says the same', said(t).some((m) => /isn't reachable/.test(m)), said(t));
  // a chat written while offline goes up once the drive is back
  const c = await chatHere(PCCHAT.id);
  await window.hub.saveChat({ ...c, updatedAt: Date.now(), messages: [...c.messages, { id: 'p9', role: 'user', at: Date.now(), text: 'Written while the drive was away' }] });
  if (await tap(/^Pick the folder again/, 'Pick the folder again…')) {
    await until(() => document.querySelector('dialog.sync-setup[open]'), 6000);
    const d = document.querySelector('dialog.sync-setup[open]');
    audit['Pick the folder again… (drive unplugged)'] = { title: text(d?.querySelector('h2')), text: text(d?.querySelector('form')).slice(0, 400), buttons: [...(d?.querySelectorAll('button') || [])].map((b) => b.textContent.trim()) };
    console.log(`[SA110] pick again ${JSON.stringify(audit['Pick the folder again… (drive unplugged)'])}`);
    step('"Pick the folder again…": says the drive in use isn\'t reachable, not "no cloud drive found"', Boolean(d) && !/No cloud drive found/.test(text(d)) && /OneDrive|isn't (there|reachable)|not (there|reachable)/.test(text(d)), audit['Pick the folder again… (drive unplugged)']);
    d?.close();
  }
  // plugged back in
  for (const f of snap) await window.hub.fs.write(f.path, f.b64, { base64: true });
  const t0 = Date.now();
  await until(async () => { await syncNow(); return Sync.status().state === 'synced'; }, 30000);
  times['drive back → ✓ Synced'] = Date.now() - t0;
  await until(() => chip() === '✓ Synced', 5000);
  step('plugged back in: "✓ Synced" by itself after a pass', chip() === '✓ Synced', { chip: chip(), state: Sync.status().state });
  await until(async () => { await syncNow(); return ((await cloudJson(`chats/${PCCHAT.id}.json`))?.messages || []).some((m) => /while the drive was away/.test(m.text)); }, 20000);
  step('…the message written while it was away is in the cloud copy', ((await cloudJson(`chats/${PCCHAT.id}.json`))?.messages || []).some((m) => /while the drive was away/.test(m.text)));
});

await section('an old laptop: forgotten, then back', async () => {
  const OLD = { id: 'old-laptop-110d4e5f', name: 'Old laptop', platform: 'win32', dataDir: 'C:\\Users\\q\\AppData\\Roaming\\Hearth\\data', home: 'C:\\Users\\q', lastSeen: Date.now() - 20 * DAY, lastOk: Date.now() - 20 * DAY, format: 74, app: '0.80.0' };
  await window.hub.fs.write(`${MD}/${OLD.id}.json`, JSON.stringify(OLD));
  await syncNow(); await Sync.refresh();
  await openPanel(); await SyncPanel.render();
  const s = see('an old laptop not seen for 20 days');
  step('a computer not seen for 20 days: said, with "Your computers…"', /Old laptop hasn't synced for 20 days/.test(s.text) && Boolean(btn(/^Your computers/)), s);
  await tap(/^Your computers/, 'Your computers…');
  const fold = () => document.querySelector('dialog.settings-dialog[open] .dv-fold');
  const row = () => [...(fold()?.querySelectorAll('.dv-row') || [])].find((r) => /Old laptop/.test(r.textContent));
  await until(() => fold()?.open && row()?.querySelector('.dv-forget'), 15000);
  step('"Your computers…" opens Settings there, with "Forget this computer…" on the old laptop', Boolean(row()?.querySelector('.dv-forget')), text(fold()).slice(0, 200));
  if (row()?.querySelector('.dv-forget')) {
    await click(row().querySelector('.dv-forget'));
    await until(() => row()?.querySelector('.dv-yes'), 3000);
    // the list may repaint right after it opened: the question must still be there a moment later
    await wait(1500);
    const q = row()?.querySelector('.dv-yes');
    step('Forget this computer…: the question stays on screen until answered', Boolean(q && J.visible(q)), text(row()?.querySelector('.dv-confirm')).slice(0, 120));
    if (!q) { await click(row().querySelector('.dv-forget')); await until(() => row()?.querySelector('.dv-yes'), 3000); }
    await click(row().querySelector('.dv-yes'));
    await until(() => /Old laptop/.test(fold()?.querySelector('.dv-gone')?.textContent || ''), 8000);
    step('…"Forget it": the old laptop is listed as forgotten', /Old laptop/.test(fold()?.querySelector('.dv-gone')?.textContent || ''), text(fold()?.querySelector('.dv-gone')));
  }
  document.querySelector('dialog.settings-dialog')?.close();
  await syncNow(); await Sync.refresh(); SyncPanel.close(); await openPanel();
  step('forgotten: no longer in the panel', !/Old laptop/.test(mainText()), mainText().slice(0, 300));
  // it comes back: its Hearth writes its record again
  await window.hub.fs.write(`${MD}/${OLD.id}.json`, JSON.stringify({ ...OLD, lastSeen: Date.now(), lastOk: Date.now() }));
  await syncNow(); await Sync.refresh(); await SyncPanel.render();
  const s2 = see('the old laptop back');
  step('back: named again in the panel ("Old laptop … last synced just now"), no "hasn\'t synced" line', /Old laptop/.test(s2.text) && !/hasn't synced/.test(s2.text) && s2.chip === '✓ Synced', s2);
  await AppUI.openSettings('');
  await until(() => document.querySelector('dialog.settings-dialog[open] .dv-fold') && !/Looking/.test(fold()?.querySelector('.sc-state')?.textContent || 'Looking'), 15000);
  if (fold()) fold().open = true;
  await until(() => row(), 8000);
  const ft = text(fold());
  audit['Your computers after it came back'] = { text: ft.slice(0, 400) };
  step('Settings › Your computers: listed again, and the forgotten line says it came back', Boolean(row()) && /came back/.test(ft), ft.slice(0, 300));
  document.querySelector('dialog.settings-dialog')?.close();
  // the old laptop leaves for good again (so the rest of the run has only the Mac)
  await window.hub.fs.trash([`${MD}/${OLD.id}.json`]);
});

await section('very long chats in pieces', async () => {
  await AppUI.openSettings('');
  const rowP = () => document.querySelector('dialog.settings-dialog[open] label.sync-packs');
  await until(() => rowP() && !rowP().hidden, 10000);
  const box = () => rowP()?.querySelector('input');
  step('Settings › Sync: "Send very long chats in pieces", off by default', Boolean(box()) && !box().checked, text(rowP()));
  await click(box());
  await until(() => Sync.status().packs?.on, 8000);
  await syncNow(); await Sync.refresh();
  const h1 = text(rowP());
  audit['pieces: turned on (the Mac reads pieces)'] = { settings: h1, gate: Sync.status().packs?.gate };
  step('on, with the Mac reading pieces: on by one click, sync goes on', Sync.status().packs?.on === true && ['synced', 'pending'].includes(Sync.status().state), { packs: Sync.status().packs, state: Sync.status().state });
  document.querySelector('dialog.settings-dialog')?.close();
  await AppUI.openSettings('');
  await until(() => rowP(), 10000); await wait(800);
  const h2s = text(rowP());
  step('Settings says it is in use', /in use/.test(h2s), h2s);
  document.querySelector('dialog.settings-dialog')?.close();
  // the Mac on a Hearth that doesn't read pieces
  await window.hub.fs.write(`${MD}/${MAC.id}.json`, JSON.stringify({ ...MAC, packs: 0, lastSeen: Date.now() }));
  await syncNow(); await Sync.refresh();
  await AppUI.openSettings('');
  await until(() => rowP(), 10000); await wait(800);
  const h3 = text(rowP());
  audit['pieces: the Mac doesn\'t read them'] = { settings: h3, gate: Sync.status().packs?.gate };
  step('the Mac without it: Settings says it waits for that computer, by name', /waiting for/.test(h3) && /Studio Mac/.test(h3), h3);
  document.querySelector('dialog.settings-dialog')?.close(); await wait(300);
  await openPanel(); await SyncPanel.render();
  const s = see('pieces waiting for the Mac');
  step('…and the panel stays calm ("✓ Synced": everything syncs as before)', s.chip === '✓ Synced', s);
  document.querySelector('dialog.settings-dialog')?.close();
  await real.packs?.(false);
  await window.hub.fs.write(`${MD}/${MAC.id}.json`, JSON.stringify({ ...MAC, lastSeen: Date.now() }));
});

step('every panel shown had no paths or ids in its main text', Object.entries(audit).filter(([, a]) => a.text && a.title !== undefined && JARGON.test(a.text)).length === 0, Object.entries(audit).filter(([, a]) => a.text && a.title !== undefined && JARGON.test(a.text)).map(([k, a]) => `${k}: ${a.text.match(JARGON)?.[0]}`));
step('nothing covered a button while it was clicked', !(J.out.misses || []).length, J.out.misses);
await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/sa110-last.png` }).catch(() => null);
SyncPanel?.close?.();
await real.off();
return J.done();
