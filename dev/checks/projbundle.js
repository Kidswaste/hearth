// Project bundles (round 75, projbundle75), by clicks: a project made in the app (its chat with a message holding an API
// key, its scene with a second layer, a reference, a note and a look, a second scene, its board with a note and a
// picture, a capture, a folder, project notes) is exported from its card's right-click › ⇪ Export project… (the card
// says what always goes, the chats and the files with their sizes), imported back from Projects ⋯ › ⇩ Import project…
// (the card says what it will add) as a NEW project that is the same project minus ids (deep compare of what each is
// made of; the key removed; the files in Hearth's own folder), then duplicated from the card's ⧉ Duplicate project
// (copies, not shared: scenes, board, chat, references). A crafted zip-slip file dropped on Projects is refused on its
// card with nothing added. The projbundle group stays unloaded until the first click.
//   node dev/smoke.js --check-timeout 300000 --save-dir /tmp/hearth-projbundle-saves --open /tmp/hearth-projbundle-saves/Bundletrip.hearthproject --script dev/checks/projbundle.js --shot /tmp/projbundle.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(50); } return null; };
const lazyState = () => Lazy.state().find((g) => g.name === 'projbundle')?.state;
const SRC = `${window.SMOKE_TMP || '/tmp/hearth-projbundle-src'}/projbundle-src`;
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
const png = (color) => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 8, 8); return c.toDataURL('image/png').split(',')[1]; };
const menuRow = (label) => [...document.querySelectorAll('#menu button')].find((b) => b.textContent.includes(label));
const rightClick = (node) => { const r = node.getBoundingClientRect(); node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 })); };
const card = () => document.querySelector('dialog.pb-card[open]');
const strip = (b) => { const c = ProjBundleCore.prepare({ ...b, away: undefined, files: undefined }).body; delete c.files; return ProjBundleCore.canon(c); };
// where two canons differ: the key paths and both values (the first 8)
const diff = (a, b, at = '', out = []) => { if (out.length >= 8) return out; if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}.${k}`, out); return out; } if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${at}: ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`); return out; };
// the Lab's own view state (the frame fit it sets when a scene is shown, and the timeline's playhead, which moves while a scene plays) isn't the project's content
const noView = (c) => { for (const s of c.scenes || []) if (s.extras) { delete s.extras.frame; if (s.extras.timeline) delete s.extras.timeline.time; } return c; };

try {
  step('first screen: the projbundle group is not loaded (loaded on first use)', lazyState() === 'stub', lazyState());
  await Lazy.load('projects'); await Projects.ready();
  const P = Projects;

  // ---------- a project with a bit of everything ----------
  await hub.fs.write(`${SRC}/brick.png`, png('#c84'), { base64: true });
  await hub.fs.write(`${SRC}/shot 1.png`, png('#48c'), { base64: true });
  await hub.fs.write(`${SRC}/site/index.html`, '<h1>Bundletrip</h1>');
  await hub.fs.write(`${SRC}/site/.env`, 'TOKEN=nope');
  const p = await ProjectWorkspace.create({ name: 'Bundletrip', persona: 'builder', plugins: [] });
  const S = ThreeLab.scenes; const sid = p.workspace.sceneId;
  await until(() => S.currentId() === sid, 8000);
  const sk = S.get(sid);
  sk.layers = [...(S.layersOf(sk) || []), ThreeLayers.defaults({ name: 'Glow on top', code: '// glow\n', opacity: 0.6, blend: 'screen' })]; S.changed(sid);
  await ThreeLab.director.refs.add(`${SRC}/brick.png`, 'brick');
  ThreeLab.director.notes.add(1.5, 'more glow here');
  S.setExtras(sid, { looks: [{ name: 'Hot', values: [3, 1] }] });
  const s2 = S.create({ name: 'Bundletrip dusk', code: '// dusk\n' }); P.add(p, 'scene', s2.id, s2.name);
  const board = await Board.load(p.workspace.boardId);
  Board.addNote('Bundle note', { x: 10, y: 10 }, {}, board);
  await Board.addFiles([`${SRC}/brick.png`], { x: 300, y: 10 }, board);
  const chat = await Native.load(p.workspace.chatId);
  chat.messages.push({ role: 'user', text: `make it glow, my key is ${KEY}`, at: Date.now() }, { role: 'assistant', text: 'Glowing now.', at: Date.now() });
  Native.save(chat);
  P.add(p, 'capture', `${SRC}/shot 1.png`, 'shot 1.png'); P.add(p, 'file', `${SRC}/site`, 'site'); P.setNotes(p, 'Bundle notes: for the launch');
  await P.flush();
  await ProjectWorkspace.home();
  await wait(1500); // (the stores' debounced saves)
  step('a project: chat with a key, 2 scenes (layers, a reference, a note, a look), a board (note + picture), a capture, a folder, notes', S.get(sid) && ThreeLab.refsOf(sid).length === 1 && board.items.length >= 2 && chat.messages.length >= 2, { items: P.get(p.id).items.map((x) => x.type) });

  // ---------- Export: the card's right-click › ⇪ Export project… ----------
  const pcard = await until(() => document.querySelector(`.pj-card[data-project="${p.id}"]`), 8000);
  rightClick(pcard);
  const exRow = await until(() => menuRow('Export project'), 3000);
  step('right-click a project card: ⇪ Export project… and ⧉ Duplicate project are in its menu', exRow && menuRow('Duplicate project'), [...document.querySelectorAll('#menu button')].map((b) => b.textContent));
  exRow.click();
  const c1 = await until(() => card()?.querySelector('.pb-chats') && card(), 20000);
  const chatsLbl = c1?.querySelector('.pb-chats')?.parentElement.textContent || '';
  const filesLbl = c1?.querySelector('.pb-files')?.parentElement.textContent || '';
  step('the export card: what always goes, the chats (count + size) and the files and captures (count + size), both chosen', c1 && lazyState() === 'loaded' && /1 chat · \d/.test(chatsLbl) && /files and captures · 2 files · /.test(filesLbl) && c1.querySelector('.pb-chats').checked && c1.querySelector('.pb-files').checked, { lines: [...c1.querySelectorAll('.pb-line, .pb-check')].map((x) => x.textContent) });
  await smoke({ shot: `${window.SMOKE_SAVES}/projbundle-export-card.png` });
  const A = await ProjBundle.gather(P.get(p.id)); // what the project is made of (before: the comparison's left side)
  c1.querySelector('.pb-go').click();
  const exported = await until(() => ProjBundle.last.exported, 60000);
  const st = exported && await hub.fs.stat(exported);
  step('Export… writes one .hearthproject (save dialog → test folder), the card closes, a toast says so', exported && /Bundletrip\.hearthproject$/.test(exported) && st?.size > 1000 && !card(), { exported, size: st?.size });

  // ---------- Import: Projects ⋯ › ⇩ Import project… ----------
  const before = P.all().length;
  document.querySelector('.pj-quick-more').click();
  const imRow = await until(() => menuRow('Import project'), 3000);
  step('Projects ⋯ has ⇩ Import project…', imRow);
  imRow.click();
  const c2 = await until(() => card()?.querySelector('.pb-adds') && card(), 20000);
  const adds = [...(c2?.querySelectorAll('.pb-adds li') || [])].map((x) => x.textContent);
  step('the import card: what it will add (scenes, chat, files, notes, the removed key), where it came from; nothing added yet', c2 && /Import “Bundletrip”/.test(c2.querySelector('.pb-title').textContent) && adds.some((l) => /2 scenes/.test(l)) && adds.some((l) => /1 chat/.test(l)) && adds.some((l) => /secret/.test(l)) && P.all().length === before, { adds, from: c2?.querySelector('.pb-line')?.textContent });
  await smoke({ shot: `${window.SMOKE_SAVES}/projbundle-import-card.png` });
  c2.querySelector('.pb-go').click();
  const bid = await until(() => ProjBundle.last.imported, 60000);
  const B = bid && P.get(bid);
  const stamps0 = ThreeLab.scenes.all().slice(-3).map((x) => [x.name, x.updatedAt]);
  await wait(1500);
  step('Import as a new project: one more project, a fresh id, the same name, the card closed, nothing skipped', B && B.id !== p.id && B.name === 'Bundletrip' && P.all().length === before + 1 && !card() && ProjBundle.last.skipped.length === 0, { id: bid, skipped: ProjBundle.last.skipped, items: B?.items.map((x) => x.type) });
  const gB = await ProjBundle.gather(B);
  const cA = noView(strip(A)); const cB = noView(strip(gB));
  step('round trip: the imported project is the same project (deep compare minus ids; files by name)', JSON.stringify(cA) === JSON.stringify(cB), [...diff(cA, cB), JSON.stringify({ stamps0, a: A.scenes.map((x) => [x.sketch.name, x.sketch.updatedAt]), b: gB.scenes.map((x) => [x.sketch.name, x.sketch.updatedAt]), cur: ThreeLab.scenes.currentId() })]);
  const ids = (b) => [b.project.id, ...b.scenes.map((s) => s.id), ...b.boards.map((x) => x.id), ...b.chats.map((c) => c.id), ...b.scenes.flatMap((s) => s.refs.map((r) => r.id))];
  step('every id is fresh: project, scenes, board, chat, references (nothing overwritten)', ids(gB).every((id) => !ids(A).includes(id)) && S.get(sid) && P.get(p.id), { a: ids(A), b: ids(gB) });
  const bChat = gB.chats[0];
  step('relinked: the chat ↔ its scene and its board; the workspace points at the new ones', bChat && bChat.scene === B.workspace.sceneId && bChat.board === B.workspace.boardId && B.workspace.chatId === bChat.id && gB.scenes.some((s) => s.id === bChat.scene), { chat: bChat?.id, scene: bChat?.scene, ws: B.workspace });
  const info = await hub.reach.info();
  const ref = gB.scenes.find((s) => s.refs.length)?.refs[0];
  step('its files are in Hearth\'s own folder (data/assets/projects/…), the key is gone, the .env never went', ref && ref.path.startsWith(`${info.dataDir}/assets/projects/`) && (await hub.fs.stat(ref.path))?.size > 0 && JSON.stringify(gB.chats).includes('[secret removed]') && !JSON.stringify(gB.chats).includes(KEY) && !(await hub.fs.stat(`${B.items.find((x) => x.type === 'file')?.ref}/.env`).catch(() => null)), { ref: ref?.path });

  // ---------- Duplicate: the card's right-click › ⧉ Duplicate project ----------
  await P.openHome();
  const pcard2 = await until(() => document.querySelector(`.pj-card[data-project="${p.id}"]`), 8000);
  rightClick(pcard2);
  (await until(() => menuRow('Duplicate project'), 3000))?.click();
  const did = await until(() => ProjBundle.last.duplicated, 60000);
  const D = did && P.get(did);
  await wait(1200);
  const gD = D && await ProjBundle.gather(D);
  const A2 = await ProjBundle.gather(P.get(p.id));
  step('Duplicate project: “Bundletrip copy”, fresh ids, scenes and board named “… copy”', D && D.name === 'Bundletrip copy' && gD.scenes.length === 2 && gD.scenes.every((s) => / copy$/.test(s.sketch.name) && !A.scenes.some((a) => a.id === s.id)) && gD.boards.length === 1 && / copy$/.test(gD.boards[0].board.name) && gD.boards[0].id !== A.boards[0].id, { name: D?.name, scenes: gD?.scenes.map((s) => s.sketch.name) });
  const dRef = gD?.scenes.find((s) => s.refs.length)?.refs[0];
  step('the copy has its own scenes, board, chat and reference files (not shared); its chat is linked to its own scene', dRef && dRef.path !== A.scenes.find((s) => s.refs.length).refs[0].path && (await hub.fs.stat(dRef.path))?.size > 0 && gD.chats.length === 1 && gD.chats[0].id !== A.chats[0].id && gD.chats[0].scene === D.workspace.sceneId && gD.chats[0].board === D.workspace.boardId, { ref: dRef?.path, chat: gD?.chats[0]?.id });
  step('the original is unchanged by the export, the import and the copy', JSON.stringify(noView(strip(A))) === JSON.stringify(noView(strip(A2))), diff(noView(strip(A)), noView(strip(A2))));

  // ---------- a crafted zip-slip file dropped on Projects ----------
  const enc = new TextEncoder();
  const crcT = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i += 1) { let c = i; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
  const crc = (u) => { let c = 0xffffffff; for (const b of u) c = crcT[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const zip = (entries) => { const parts = []; const cd = []; let off = 0; for (const [name, text] of entries) { const nm = enc.encode(name); const d = enc.encode(text); const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, crc(d), true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true); parts.push(new Uint8Array(h.buffer), nm, d); const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, crc(d), true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true); cd.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + d.length; } const cdLen = cd.reduce((n, x) => n + x.length, 0); const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, cdLen, true); e.setUint32(16, off, true); const all = [...parts, ...cd, new Uint8Array(e.buffer)]; const u = new Uint8Array(all.reduce((n, x) => n + x.length, 0)); let at = 0; for (const x of all) { u.set(x, at); at += x.length; } let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
  const evil = `${SRC}/evil.hearthproject`;
  await hub.fs.write(evil, zip([['manifest.json', JSON.stringify(ProjBundleCore.makeManifest({ name: 'Evil' }))], ['project.json', JSON.stringify({ project: { id: 'p', name: 'Evil', items: [] } })], ['../../escaped.txt', 'gotcha']]), { base64: true });
  const n0 = P.all().length;
  await P.openHome();
  const dropped = ProjBundle.dropFiles([{ name: 'evil.hearthproject', path: evil }]);
  const c3 = await until(() => card()?.querySelector('.pb-problems') && card(), 15000);
  const probs = [...(c3?.querySelectorAll('.pb-problems li') || [])].map((x) => x.textContent);
  step('a zip-slip .hearthproject dropped on Projects: refused on its card with the reason, nothing added or written', dropped && c3 && probs.some((t) => /isn't a name/.test(t)) && P.all().length === n0 && !(await hub.fs.stat(`${SRC}/../escaped.txt`).catch(() => null)) && !(await hub.fs.stat(`${info.dataDir}/assets/escaped.txt`).catch(() => null)), probs);
  c3?.querySelector('.pb-actions button')?.click();
  // the drop target itself: a file that isn't a project says so (no navigation away)
  const home = document.querySelector('.pj-home');
  const dt = new DataTransfer(); dt.items.add(new File(['x'], 'notes.txt', { type: 'text/plain' }));
  const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
  home.dispatchEvent(ev);
  step('dropping another kind of file on Projects is caught (a calm note, the page stays)', ev.defaultPrevented && document.querySelector('.pj-home'), null);
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 600));
}
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
