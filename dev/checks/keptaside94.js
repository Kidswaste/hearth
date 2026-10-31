// (round 94, keptaside94) When sync keeps two versions, choosing is easy and safe: every kind of thing, by clicks, through
// the real sync engine and a temp cloud folder in the run's own scratch space ("the Mac" is a made-up machine record and
// writes its version straight into the cloud copy; Sync now brings it). Auto-settling is off, so each one waits for a
// choice; the last one has it on, so sync keeps one version and puts the other aside by itself.
//   chat · very long chat (over 6 MB: compared on the store thread) · note · board · project · Lab scene (code) · Lab
//   preset · settings · picture · sound · a version kept aside by itself
// For each: is it said (the chip in the rail, a note at the time, the panel), both versions side by side in plain form
// (the messages, the lines highlighted, the pictures, "this PC says X, the Mac says Y"), the choice by click (Keep this
// one / Keep both / Combine…), the result saved (and in the cloud copy), the other version in Deleted files, and Undo.
// This computer acts as a Windows PC for the words. Nothing real is read or written; nothing is uploaded anywhere else.
//   node dev/smoke.js --check-timeout 600000 --lib dev/checks/journey-lib.js --script dev/checks/keptaside94.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const CLOUD = `${window.SMOKE_TMP || '/tmp'}/ka94-${Date.now()}`;
const FILES = `${CLOUD}/Hearth/files`;
const audit = J.out.audit = {};
Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
const MAC = { id: 'studio-mac-94a1b2c3', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000, format: 74, app: '0.93.0' };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${FILES}/.keep-folder`, '');
const dataDir = (await api.detect()).dataDir;
await api.on({ root: CLOUD });
await api.autoResolve(false);
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 30000);
await until(() => document.querySelector('.two-welcome'), 6000);
const gotIt = [...document.querySelectorAll('.two-welcome button, button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await wait(300); }

const cloudOf = (rel) => `${FILES}/${rel}`;
const cloudJson = async (rel) => { try { return JSON.parse(await window.hub.fs.read(cloudOf(rel))); } catch { return null; } };
const macEdit = async (rel, fn) => { const v = fn(await cloudJson(rel)); await window.hub.fs.write(cloudOf(rel), JSON.stringify(v, null, 2)); };
const syncNow = async () => { await Sync.now({ quiet: true }); await wait(600); };
const kv = async (name) => { const r = await window.hub.kvGet(name, null, { status: true }); return r?.state === 'ok' ? r.value : null; };
const chip = () => document.querySelector('#sync-dot .sync-chip')?.textContent || '';
const view = () => document.querySelector('dialog.ka-view[open]');
const toasts = () => [...document.querySelectorAll('.toast')];
const toastBtn = (re) => { for (const t of toasts().reverse()) { const b = [...t.querySelectorAll('button')].find((x) => re.test(x.textContent.trim())); if (b) return b; } return null; };
const lastToastText = () => recentToasts()[0]?.message || '';
const trash = async () => (await api.trash()) || [];
const plain = (rel) => String(rel).replace(/(^|\/)[0-9a-f]{6,8}-([^/]+)$/, '$1$2');
const inTrash = async (rel) => (await trash()).filter((t) => plain(t.rel) === rel);
async function synced(rel, test, ms = 15000) { return until(async () => { await syncNow(); return test(await cloudJson(rel)); }, ms); }
// both changed: this computer's change first, the Mac's in the cloud copy, then Sync now → a conflict (or a version kept aside)
// (round 96, checkfix96) both changes are made while no pass can run (sync paused, the pass in flight over first): on a
// busy box a pass started by the watcher between the two pushed this computer's change first, the Mac's edit was then
// made on top of it, and there was nothing to choose ("… waits for a choice · null", the base check too)
async function still(fn) { await api.pause(true); try { await api.now(); await fn(); } finally { await api.pause(false); } }
async function both(rel, here, mac) {
  await still(async () => { await here(); await wait(300); await macEdit(rel, mac); });
  let got = null;
  await until(async () => { await syncNow(); const c = (await api.conflicts()).find((x) => x.rel === rel); const a = (Sync.status().aside || []).find((x) => x.rel === rel); got = c ? { conflict: c.id } : a ? { aside: a.id } : null; return got; }, 20000);
  return got;
}
const panel = () => document.querySelector('.sync-panel');
async function openPanel() { if (!panel()) await click('#sync-dot'); await until(() => panel()?.querySelector('h2'), 15000); return panel(); }
// opens the compare view by clicks: the panel, then the thing's Compare…
async function compare(src) {
  await Sync.refresh();
  await openPanel();
  const sel = src.conflict ? `.sp-conflict[data-id="${src.conflict}"] .sp-compare` : `.sp-aside[data-id="${src.aside}"] .sp-aside-compare`;
  await until(() => panel()?.querySelector(sel), 10000);
  await click(panel().querySelector(sel));
  await until(() => view() && !view().querySelector('.ka-main')?.textContent.includes('Looking at both'), 20000);
  await wait(200);
  return view();
}
const text = (n) => (n?.textContent || '').replace(/\s+/g, ' ').trim();
const see = (name, extra = {}) => { const v = view(); audit[name] = { chip: chip(), title: text(v?.querySelector('h2')), heads: [...(v?.querySelectorAll('.ka-h b') || [])].map(text), body: text(v?.querySelector('.ka-main')).slice(0, 400), buttons: [...(v?.querySelectorAll('button') || [])].map(text).filter(Boolean), ...extra }; console.log(`[KA94] ${name} ${JSON.stringify(audit[name])}`); return audit[name]; };
const JARGON = /(\/tmp\/|\.json\b|\bkv\/|\bchats\/|studio-mac-|\bundefined\b|\bnull\b|\bNaN\b|\[object)/;
async function choose(sel) { await click(view().querySelector(sel)); await until(() => !view(), 15000); await wait(400); }
// (round 96, checkfix96) the Undo is judged once it is done: its own note ("Back as it was…", "That copy is in…") or its
// error, not after a fixed 1.2 s (on a busy box the restore could still be on its way: the preset read its 8 bars once)
const undone = J.out.undone = [];
async function undo(re = /^Undo$/) {
  await until(() => toastBtn(re), 6000); const b = toastBtn(re); if (!b) return false;
  const t0 = Date.now();
  await click(b);
  const outcome = () => recentToasts().find((x) => x.at >= t0 && (/^(Back as it was|That copy is in)/.test(x.message) || x.type === 'error'));
  await wait(1200); // (as before: the pass the restore asks for runs before what comes next)
  await until(outcome, 20000);
  undone.push({ label: b.textContent.trim(), ms: Date.now() - t0, said: outcome()?.message?.slice(0, 80) || null, labHolder: Boolean(window.LabPresets) });
  await Sync.refresh(); return true;
}
const section = async (name, fn) => { try { await fn(); } catch (err) { step(`${name}: ran to the end`, false, String(err?.stack || err).slice(0, 400)); } finally { document.querySelectorAll('dialog.ka-view').forEach((d) => d.close()); SyncPanel?.close?.(); for (const t of toasts()) t.querySelector('.toast-x')?.click(); await wait(200); } };

// ---------- a chat ----------
await section('chat', async () => {
  const id = 'ka94-chat';
  const agentId = H.claudeAgent().id;
  const base = { id, agentId, title: 'Tour diary', updatedAt: Date.now(), messages: [{ id: 'm1', role: 'user', at: 1, text: 'Soundcheck at five' }] };
  await window.hub.saveChat(base);
  H.chats = await window.hub.listChats();
  await synced(`chats/${id}.json`, (v) => v?.title === 'Tour diary');
  const src = await both(`chats/${id}.json`,
    () => window.hub.saveChat({ ...base, title: 'Tour diary (PC)', updatedAt: Date.now(), messages: [...base.messages, { id: 'm2', role: 'user', at: 2, text: 'Written on the PC: bring the cables' }] }),
    (v) => ({ ...v, title: 'Tour diary (Mac)', updatedAt: Date.now(), messages: [...v.messages, { id: 'm3', role: 'user', at: 3, text: 'Written on the Mac: call the venue' }] }));
  step('chat: changed on both → waits for a choice', Boolean(src?.conflict), src);
  await until(() => /conflict/.test(chip()), 5000);
  step('chat: the rail says so ("⚠ 1 conflict")', /⚠ 1 conflict/.test(chip()), chip());
  step('chat: a note says so at the time, with Choose', /changed on both computers/.test(recentToasts().map((t) => t.message).join(' | ')), recentToasts().slice(0, 3).map((t) => t.message));
  const v = await compare(src);
  const s = see('chat');
  const cols = [...v.querySelectorAll('.ka-msgs .ka-c')].map(text);
  step('chat: both side by side: the title both ways; the message only this PC has, in its column (the Mac\'s new message is already in both: messages merge)', /Tour diary \(PC\)/.test(s.body) && /Tour diary \(Mac\)/.test(s.body) && /bring the cables/.test(cols[0] || '') && /none/.test(cols[1] || '') && /the same in both/.test(s.body), cols);
  step('chat: …the Mac\'s message is in the chat here', ((await window.hub.getChat?.(id))?.messages || []).some((x) => /call the venue/.test(x.text)));
  step('chat: "This PC" and "Mac", each with Keep this one; Keep both; no Combine for a chat', /This PC/.test(s.heads[0]) && /Mac/.test(s.heads[1]) && v.querySelectorAll('.ka-keep').length === 2 && Boolean(v.querySelector('.ka-both')) && !v.querySelector('.ka-comb'), s);
  step('chat: no paths or ids in the view', !JARGON.test(text(v)), text(v).match(JARGON)?.[0]);
  await choose('.ka-both');
  H.chats = await window.hub.listChats();
  const copy = (H.chats || []).find((c) => /Tour diary \(Mac\) \(from (Mac|Studio Mac)\)/.test(c.title));
  step('chat: Keep both → the Mac\'s is its own chat, this one stays', Boolean(copy) && (H.chats || []).some((c) => c.id === id && c.title === 'Tour diary (PC)'), (H.chats || []).filter((c) => /Tour diary/.test(c.title)).map((c) => c.title));
  step('chat: …said, with Undo', /Kept both/.test(lastToastText()) && Boolean(toastBtn(/^Undo$/)), lastToastText());
  await undo();
  H.chats = await window.hub.listChats();
  step('chat: Undo → that copy is in the Trash (Recently deleted), the chat itself untouched', !(H.chats || []).some((c) => c.id === copy?.id) && (H.chats || []).some((c) => c.id === id), (H.chats || []).filter((c) => /Tour diary/.test(c.title)).map((c) => c.title));
});

// ---------- a very long chat (over 6 MB) ----------
await section('giant chat', async () => {
  const id = 'ka94-giant';
  const agentId = H.claudeAgent().id;
  const msgs = Array.from({ length: 1900 }, (_, i) => ({ id: `g${i}`, role: i % 2 ? 'assistant' : 'user', at: 1000 + i, text: `Part ${i}: ${'la '.repeat(1200)}` }));
  const base = { id, agentId, title: 'Long tour log', updatedAt: Date.now(), messages: msgs };
  await window.hub.saveChat(base);
  await synced(`chats/${id}.json`, (v) => v?.title === 'Long tour log', 40000);
  const src = await both(`chats/${id}.json`,
    () => window.hub.saveChat({ ...base, title: 'Long tour log (PC)', updatedAt: Date.now() }),
    (v) => ({ ...v, title: 'Long tour log (Mac)', updatedAt: Date.now(), messages: [...v.messages, { id: 'gmac', role: 'user', at: 99999, text: 'The Mac\'s last word' }] }));
  step('giant chat: changed on both → waits for a choice', Boolean(src?.conflict), src);
  const t0 = Date.now();
  const v = await compare(src);
  const s = see('giant chat', { ms: Date.now() - t0 });
  step('giant chat: compared anyway (on the store thread): the titles both ways, how many messages each has and share', /Long tour log \(PC\)/.test(s.body) && /Long tour log \(Mac\)/.test(s.body) && /19\d\d messages on one side, 19\d\d on the other; 19\d\d the same in both/.test(s.body), s.body.slice(0, 300));
  await choose('.ka-keep-a');
  const c = await kv('nothing'); void c;
  step('giant chat: Keep this one (this PC\'s), said, with "Use the Mac\'s instead"', /Kept this PC's version/.test(lastToastText()) && Boolean(toastBtn(/^Use .*Mac's instead$/)), lastToastText());
  step('giant chat: the Mac\'s version is in Deleted files', (await inTrash(`chats/${id}.json`)).length >= 1, (await inTrash(`chats/${id}.json`)).map((t) => t.id));
});

// ---------- a note: the same line both ways → Combine ----------
await section('note', async () => {
  const id = 'ka94-note';
  const list = (await kv('notes')) || [];
  const text0 = '# Set list\n- intro\n- drop at 1:00\n- outro';
  await window.hub.kvSet('notes', [...list.filter((n) => n.id !== id), { id, title: 'Set list', text: text0, updatedAt: Date.now() }]);
  await StoreAck.arrived([{ rel: 'kv/notes.json' }]);
  await synced('kv/notes.json', (v) => v?.some?.((n) => n.id === id));
  const src = await both('kv/notes.json',
    async () => { const l = await kv('notes'); await window.hub.kvSet('notes', l.map((n) => (n.id === id ? { ...n, text: n.text.replace('drop at 1:00', 'drop at 1:12 (PC)'), updatedAt: Date.now() } : n))); await StoreAck.arrived([{ rel: 'kv/notes.json' }]); },
    (l) => l.map((n) => (n.id === id ? { ...n, text: n.text.replace('drop at 1:00', 'drop at 1:30 (Mac)'), updatedAt: Date.now() } : n)));
  step('note: the same line both ways → waits for a choice', Boolean(src), src);
  const v = await compare(src);
  const s = see('note');
  const del = [...v.querySelectorAll('.ka-l.ka-del')].map(text); const add = [...v.querySelectorAll('.ka-l.ka-add')].map(text);
  step('note: the text line by line, the line that differs highlighted on each side', del.some((x) => /1:12 \(PC\)/.test(x)) && add.some((x) => /1:30 \(Mac\)/.test(x)) && [...v.querySelectorAll('.ka-l')].some((x) => /intro/.test(x.textContent)), { del, add });
  step('note: Combine… offered', Boolean(v.querySelector('.ka-comb')), s.buttons);
  await click(v.querySelector('.ka-comb'));
  await until(() => view()?.querySelector('.ka-ed'), 4000);
  const ed = view().querySelector('.ka-ed');
  step('note: Combine starts with both versions\' lines', /1:12 \(PC\)/.test(ed.value) && /1:30 \(Mac\)/.test(ed.value) && /intro/.test(ed.value), ed.value);
  await click(ed);
  ed.select(); await J.type('# Set list\n- intro\n- drop at 1:20 (both)\n- outro');
  await click(view().querySelector('.ka-save'));
  await until(() => !view(), 10000); await wait(500);
  const now = (await kv('notes')).find((n) => n.id === id)?.text;
  step('note: the combined text is saved', now === '# Set list\n- intro\n- drop at 1:20 (both)\n- outro', now);
  step('note: …and synced (in the cloud copy)', await synced('kv/notes.json', (l) => l?.find?.((n) => n.id === id)?.text === now), (await cloudJson('kv/notes.json'))?.find?.((n) => n.id === id)?.text);
  step('note: both earlier versions are in Deleted files', (await inTrash('kv/notes.json')).length >= 2, (await inTrash('kv/notes.json')).map((t) => t.id));
  await undo();
  const back = (await kv('notes')).find((n) => n.id === id)?.text;
  step('note: Undo brings back the text that was there before', /1:12 \(PC\)/.test(back || '') && !/both/.test(back || ''), back);
});

// ---------- a board: renamed both ways → Keep both ----------
await section('board', async () => {
  const id = 'ka94-board';
  const list = (await kv('boards')) || [];
  await window.hub.kvSet('boards', [...(Array.isArray(list) ? list : []).filter((b) => b.id !== id), { id, name: 'Moods', items: [], updatedAt: Date.now() }]);
  await StoreAck.arrived([{ rel: 'kv/boards.json' }]);
  await synced('kv/boards.json', (v) => Array.isArray(v) && v.some((b) => b.id === id));
  const src = await both('kv/boards.json',
    async () => { const l = await kv('boards'); await window.hub.kvSet('boards', l.map((b) => (b.id === id ? { ...b, name: 'Moods (PC)' } : b))); await StoreAck.arrived([{ rel: 'kv/boards.json' }]); },
    (l) => l.map((b) => (b.id === id ? { ...b, name: 'Moods (Mac)' } : b)));
  step('board: renamed both ways → waits for a choice', Boolean(src), src);
  const v = await compare(src);
  const s = see('board');
  const pairs = [...v.querySelectorAll('.ka-pair')].map((p) => [...p.querySelectorAll('.ka-c')].map(text));
  step('board: the name both ways, in words', pairs.some(([a, b]) => /Moods \(PC\)/.test(a) && /Moods \(Mac\)/.test(b)), pairs);
  step('board: no paths or ids', !JARGON.test(text(v)), text(v).match(JARGON)?.[0]);
  await choose('.ka-both');
  const names = (await kv('boards')).filter((b) => /^Moods/.test(b.name)).map((b) => b.name).sort();
  step('board: Keep both → both boards', names.length === 2 && names.includes('Moods (PC)') && names.some((n) => /Moods \(Mac\) \(from/.test(n)), names);
  await undo();
  const after = (await kv('boards')).filter((b) => /^Moods/.test(b.name)).map((b) => b.name);
  step('board: Undo → one board again (this one), the other version in Deleted files', after.length === 1 && after[0] === 'Moods (PC)' && (await inTrash('kv/boards.json')).length >= 2, { after, trash: (await inTrash('kv/boards.json')).map((t) => t.id) });
});

// ---------- a project: renamed both ways → Keep the other ----------
await section('project', async () => {
  const p = Projects.create({ name: 'Neon' });
  await Projects.flush?.();
  await synced('kv/projects.json', (v) => v?.list?.some((x) => x.id === p.id));
  const src = await both('kv/projects.json',
    async () => { Projects.rename(p, 'Neon (PC)'); await Projects.flush?.(); },
    (d) => ({ ...d, list: d.list.map((x) => (x.id === p.id ? { ...x, name: 'Neon (Mac)', updated: Date.now() } : x)) }));
  step('project: renamed both ways → a choice (or a version kept aside)', Boolean(src), src);
  const v = await compare(src);
  const s = see('project', { src: Object.keys(src)[0] });
  step('project: the name both ways, in words', /Neon \(PC\)/.test(s.body) && /Neon \(Mac\)/.test(s.body), s.body);
  await choose('.ka-keep-b');
  await until(() => Projects.get(p.id)?.name === 'Neon (Mac)', 8000);
  step('project: Keep the other (the Mac\'s) → its name here', Projects.get(p.id)?.name === 'Neon (Mac)', Projects.get(p.id)?.name);
  await undo();
  await until(() => Projects.get(p.id)?.name === 'Neon (PC)', 8000);
  step('project: Undo → this PC\'s name again', Projects.get(p.id)?.name === 'Neon (PC)', Projects.get(p.id)?.name);
});

// ---------- a Lab scene: the same line of code both ways → Combine ----------
await section('scene', async () => {
  const id = 'ka94scene';
  const list = (await kv('three-sketches')) || [];
  const code0 = 'const speed = 1;\nconst hue = 0.5;\nfunction tick(t) {\n  return t * speed;\n}';
  await window.hub.kvSet('three-sketches', [...list.filter((x) => x.id !== id), { id, name: 'Neon Rose', code: code0, updatedAt: Date.now() }]);
  await StoreAck.arrived([{ rel: 'kv/three-sketches.json' }]);
  await synced('kv/three-sketches.json', (v) => Array.isArray(v) && v.some((x) => x.id === id));
  const src = await both('kv/three-sketches.json',
    async () => { const l = await kv('three-sketches'); await window.hub.kvSet('three-sketches', l.map((x) => (x.id === id ? { ...x, code: x.code.replace('hue = 0.5', 'hue = 0.62; // PC'), updatedAt: Date.now() } : x))); await StoreAck.arrived([{ rel: 'kv/three-sketches.json' }]); },
    (l) => l.map((x) => (x.id === id ? { ...x, code: x.code.replace('hue = 0.5', 'hue = 0.9; // Mac'), updatedAt: Date.now() } : x)));
  step('scene: the same line of code both ways → waits for a choice', Boolean(src), src);
  const v = await compare(src);
  const s = see('scene');
  const h4 = [...v.querySelectorAll('h4')].map(text);
  const del = [...v.querySelectorAll('.ka-l.ka-del')].map(text); const add = [...v.querySelectorAll('.ka-l.ka-add')].map(text);
  step('scene: the code line by line, named by scene, the changed line highlighted on each side, line numbers', h4.some((x) => /Neon Rose/.test(x) && /code/.test(x)) && del.some((x) => /0\.62/.test(x)) && add.some((x) => /0\.9/.test(x)) && [...v.querySelectorAll('.ka-n')].some((x) => x.textContent === '2'), { h4, del, add });
  await click(v.querySelector('.ka-comb'));
  await until(() => view()?.querySelector('.ka-ed'), 4000);
  const ed = view().querySelector('.ka-ed');
  // the owner keeps the Mac's line and drops this PC's (the editor's own button, then a small edit)
  await click([...view().querySelectorAll('.ka-combine button')].find((b) => /^Only the Mac's$/.test(text(b))));
  step('scene: "Only the Mac\'s" puts its code in the editor', /0\.9; \/\/ Mac/.test(ed.value) && !/0\.62/.test(ed.value), ed.value);
  await click(ed); ed.setSelectionRange(ed.value.length, ed.value.length); await J.type('\n// combined on the PC');
  await click(view().querySelector('.ka-save'));
  await until(() => !view(), 10000); await wait(500);
  const code = (await kv('three-sketches')).find((x) => x.id === id)?.code;
  step('scene: the combined code is saved', /0\.9; \/\/ Mac/.test(code || '') && /combined on the PC/.test(code || ''), code);
  step('scene: …and synced', await synced('kv/three-sketches.json', (l) => /combined on the PC/.test(l?.find?.((x) => x.id === id)?.code || '')));
  await undo();
  const back = (await kv('three-sketches')).find((x) => x.id === id)?.code;
  step('scene: Undo brings this PC\'s code back', /0\.62; \/\/ PC/.test(back || '') && !/combined/.test(back || ''), back);
});

// ---------- a Lab preset (trigger setup) ----------
await section('preset', async () => {
  const pid = 'pka94';
  const cur = (await kv('lab-presets')) || { v: 1, items: {} };
  const item = (bars) => ({ kind: 'trig', name: 'Drop hits', data: JSON.stringify({ bars, every: 2, flash: true }), at: Date.now() });
  await window.hub.kvSet('lab-presets', { ...cur, v: 1, items: { ...(cur.items || {}), [pid]: item(4) } });
  await StoreAck.arrived([{ rel: 'kv/lab-presets.json' }]);
  await synced('kv/lab-presets.json', (v) => Boolean(v?.items?.[pid]));
  const src = await both('kv/lab-presets.json',
    async () => { const d = await kv('lab-presets'); await window.hub.kvSet('lab-presets', { ...d, items: { ...d.items, [pid]: item(8) } }); await StoreAck.arrived([{ rel: 'kv/lab-presets.json' }]); },
    (d) => ({ ...d, items: { ...d.items, [pid]: item(16) } }));
  step('preset: its setup changed both ways → waits for a choice', Boolean(src), src);
  const v = await compare(src);
  const s = see('preset');
  const pairs = [...v.querySelectorAll('.ka-pair')].map((x) => [...x.querySelectorAll('.ka-c')].map(text));
  step('preset: named, and what differs in words (“Drop hits” › setup › bars: 8 · 16), no raw setup text', /Lab preset “Drop hits”/.test(s.title) && [...v.querySelectorAll('h4')].some((h) => /Drop hits.*bars/.test(text(h))) && pairs.some(([a, b]) => a === '8' && b === '16') && !/\{"bars"/.test(text(v)), { title: s.title, pairs });
  await choose('.ka-keep-a');
  step('preset: Keep this one (8 bars) — said, with "Use the Mac\'s instead"', JSON.parse((await kv('lab-presets')).items[pid].data).bars === 8 && Boolean(toastBtn(/^Use .*Mac's instead$/)), lastToastText());
  await undo(/^Use .*Mac's instead$/);
  step('preset: "Use the Mac\'s instead" → 16 bars', JSON.parse((await kv('lab-presets')).items[pid].data).bars === 16, { item: (await kv('lab-presets')).items[pid], undo: undone[undone.length - 1] });
});

// ---------- settings ----------
await section('settings', async () => {
  const was = H.config.theme?.accent;
  H.config.theme = { ...(H.config.theme || {}), accent: '#3366ff' }; await window.hub.saveConfig(H.config);
  await synced('app/config.json', (v) => v?.theme?.accent === '#3366ff');
  const src = await both('app/config.json',
    async () => { H.config.theme = { ...H.config.theme, accent: '#ff3366' }; await window.hub.saveConfig(H.config); },
    (c) => ({ ...c, theme: { ...c.theme, accent: '#33cc66' } }));
  step('settings: the same option both ways → waits for a choice', Boolean(src), src);
  const v = await compare(src);
  const s = see('settings');
  const say = [...v.querySelectorAll('.ka-say')].map(text);
  step('settings: in words: "… this PC says “#ff3366”, the Mac says “#33cc66”", and only that (each computer\'s own window layout is not a difference)', say.length === 1 && /^Theme › accent: this PC says “#ff3366”, the Mac says “#33cc66”\.$/.test(say[0]), say);
  step('settings: no Keep both (settings are one or the other), no Combine', !v.querySelector('.ka-both') && !v.querySelector('.ka-comb'), s.buttons);
  await choose('.ka-keep-b');
  await until(async () => (await window.hub.getConfig?.())?.theme?.accent === '#33cc66' || H.config.theme?.accent === '#33cc66', 8000);
  step('settings: Keep the other → the Mac\'s', H.config.theme?.accent === '#33cc66', H.config.theme);
  await undo();
  await until(() => H.config.theme?.accent === '#ff3366', 8000);
  step('settings: Undo → this PC\'s again', H.config.theme?.accent === '#ff3366', H.config.theme);
  H.config.theme = { ...H.config.theme, accent: was }; await window.hub.saveConfig(H.config);
});

// ---------- a picture ----------
const PNG_RED = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4o6FBEmIY1TCqYfhqAAAyBCwQhvh37QAAAABJRU5ErkJggg==';
const PNG_BLUE = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGPQCLhDEmIY1TCqYfhqAAANiFQQvOkcpQAAAABJRU5ErkJggg==';
const PNG_GREEN = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGPQ2BJFEmIY1TCqYfhqAACc1jYQRysVrQAAAABJRU5ErkJggg==';
await section('picture', async () => {
  const rel = 'refs/ka94-cover.png';
  await window.hub.fs.write(`${dataDir}/${rel}`, PNG_RED, { base64: true });
  await until(async () => { await syncNow(); return Boolean(await window.hub.fs.stat?.(cloudOf(rel)).catch(() => null)); }, 20000);
  await still(async () => { // (round 96, checkfix96: see still())
    await window.hub.fs.write(`${dataDir}/${rel}`, PNG_BLUE, { base64: true }); await wait(1100);
    await window.hub.fs.write(cloudOf(rel), PNG_GREEN, { base64: true });
  });
  let src = null;
  await until(async () => { await syncNow(); const c = (await api.conflicts()).find((x) => x.rel === rel); src = c ? { conflict: c.id } : null; return src; }, 20000);
  step('picture: changed on both → waits for a choice', Boolean(src), src);
  const v = await compare(src);
  const imgs = [...v.querySelectorAll('.ka-files img')];
  await until(() => imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0), 5000);
  see('picture', { pictures: imgs.map((i) => i.naturalWidth) });
  step('picture: both pictures, side by side', imgs.length === 2 && imgs.every((i) => i.naturalWidth === 16), imgs.map((i) => [i.naturalWidth, i.src.slice(-30)]));
  await choose('.ka-both');
  const made = 'refs/ka94-cover (from Studio Mac).png';
  const madeAlt = 'refs/ka94-cover (from Mac).png';
  const has = async (r) => Boolean(await window.hub.fs.stat?.(`${dataDir}/${r}`).catch(() => null));
  step('picture: Keep both → the Mac\'s next to it', (await has(made)) || (await has(madeAlt)), lastToastText());
  await undo();
  step('picture: Undo → that copy in Deleted files, the original stays', !(await has(made)) && !(await has(madeAlt)) && (await has(rel)) && (await trash()).some((t) => /ka94-cover \(from/.test(t.rel)), (await trash()).map((t) => t.rel).filter((r) => /ka94/.test(r)));
});

// ---------- a sound ----------
const WAV = (n) => { const b = new Uint8Array(44 + n); const s = 'RIFF'; for (let i = 0; i < 4; i++) b[i] = s.charCodeAt(i); const dv = new DataView(b.buffer); dv.setUint32(4, 36 + n, true); 'WAVEfmt '.split('').forEach((c, i) => { b[8 + i] = c.charCodeAt(0); }); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); 'data'.split('').forEach((c, i) => { b[36 + i] = c.charCodeAt(0); }); dv.setUint32(40, n, true); for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(60 * Math.sin(i / (n % 7 + 3))); return b; };
await section('sound', async () => {
  const rel = 'stems/ka94-loop.wav';
  await window.hub.fs.write(`${dataDir}/${rel}`, WAV(800));
  await until(async () => { await syncNow(); return Boolean(await window.hub.fs.stat?.(cloudOf(rel)).catch(() => null)); }, 20000);
  await still(async () => { // (round 96, checkfix96: see still())
    await window.hub.fs.write(`${dataDir}/${rel}`, WAV(1600)); await wait(1100);
    await window.hub.fs.write(cloudOf(rel), WAV(3200));
  });
  let src = null;
  await until(async () => { await syncNow(); const c = (await api.conflicts()).find((x) => x.rel === rel); src = c ? { conflict: c.id } : null; return src; }, 20000);
  step('sound: changed on both → waits for a choice', Boolean(src), src);
  const v = await compare(src);
  const auds = [...v.querySelectorAll('.ka-files audio')];
  see('sound', { players: auds.length });
  step('sound: both, each with a player to listen', auds.length === 2 && auds.every((a) => a.controls), auds.length);
  const sizeBefore = (await window.hub.fs.stat(`${dataDir}/${rel}`))?.size;
  await choose('.ka-keep-b');
  const sizeAfter = (await window.hub.fs.stat(`${dataDir}/${rel}`))?.size;
  step('sound: Keep the other → the Mac\'s sound here', sizeAfter === 3244 && sizeBefore === 1644, { sizeBefore, sizeAfter });
  await undo();
  step('sound: Undo → this PC\'s again; the Mac\'s in Deleted files', (await window.hub.fs.stat(`${dataDir}/${rel}`))?.size === 1644 && (await inTrash(rel)).length >= 1, (await inTrash(rel)).map((t) => t.id));
});

// ---------- kept aside by itself (auto-settle on) ----------
await section('kept aside', async () => {
  await api.autoResolve(true);
  const id = 'ka94-board2';
  const list = (await kv('boards')) || [];
  await window.hub.kvSet('boards', [...list.filter((b) => b.id !== id), { id, name: 'Flyers', items: [], updatedAt: Date.now() }]);
  await StoreAck.arrived([{ rel: 'kv/boards.json' }]);
  await synced('kv/boards.json', (v) => Array.isArray(v) && v.some((b) => b.id === id));
  for (const t of toasts()) t.querySelector('.toast-x')?.click();
  const src = await both('kv/boards.json',
    async () => { const l = await kv('boards'); await window.hub.kvSet('boards', l.map((b) => (b.id === id ? { ...b, name: 'Flyers (PC)', updatedAt: Date.now() } : b))); await StoreAck.arrived([{ rel: 'kv/boards.json' }]); },
    (l) => l.map((b) => (b.id === id ? { ...b, name: 'Flyers (Mac)', updatedAt: Date.now() + 5000 } : b)));
  step('kept aside: settled by itself, one version kept aside', Boolean(src?.aside), src);
  await Sync.refresh(); await wait(300);
  step('kept aside: the rail says so ("◐ 1 to compare")', /◐ \d+ to compare/.test(chip()), chip());
  const note = recentToasts().find((t) => /at the same time/.test(t.message));
  step('kept aside: a note says so at the time, with Compare', Boolean(note) && Boolean(toastBtn(/^Compare$/)), recentToasts().slice(0, 3).map((t) => t.message));
  // the note's Compare opens the same view
  if (toastBtn(/^Compare$/)) { await click(toastBtn(/^Compare$/)); await until(() => view() && !view().querySelector('.ka-main')?.textContent.includes('Looking at both'), 10000); } else await compare(src);
  const v = view();
  const s = see('kept aside');
  step('kept aside: "In use now" and "Kept aside", whose each is, both names', /In use now/.test(s.heads[0]) && /Kept aside/.test(s.heads[1]) && /Flyers \(PC\)/.test(text(v)) && /Flyers \(Mac\)/.test(text(v)), s);
  const inUse = (await kv('boards')).find((b) => b.id === id)?.name;
  await choose('.ka-keep-b');
  const after = (await kv('boards')).find((b) => b.id === id)?.name;
  step('kept aside: Keep this one under "Kept aside" → it is back', after && after !== inUse && /Flyers \((PC|Mac)\)/.test(after), { inUse, after });
  await undo();
  step('kept aside: Undo → the one that was in use', (await kv('boards')).find((b) => b.id === id)?.name === inUse, (await kv('boards')).find((b) => b.id === id)?.name);
  await api.autoResolve(false);
});

const shotDir = window.SMOKE_TMP || '/tmp';
await smoke({ shot: `${shotDir}/ka94-last.png` }).catch(() => null);
step('nothing covered a button while it was clicked', !(J.out.misses || []).length, J.out.misses);
await api.off();
return J.done();
