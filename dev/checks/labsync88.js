// (round 88, labsync88) The rest of the Lab between the two computers, in the app, through the real sync engine (a temp
// cloud folder; "the Mac" writes its version into the cloud copy as its sync would, then Sync now pulls it):
//  1. History one file per scene: versions an older Hearth kept in kv/three-history.json move into
//     kv/three-hv-<scene>.json (the old file keeps the trash, no versions); a scene that runs writes its own file only
//  2. what you make in the Lab: a pin, a favourite effect, the stage set list and a song's ⚡ triggers saved on the Mac are
//     here (the song under this computer's own path); a scene pinned here reaches the cloud copy; one unpinned on the
//     Mac is unpinned here
//  3. a scene's picture: the same picture again saves nothing; a different one is saved
//  4. a song loaded from outside Hearth's folder: nothing is copied by itself; the offer "Keep a copy with this scene so
//     it plays on your other computer (size)" shows; one click copies it into Hearth's references (the original stays),
//     the timeline plays the copy, and the copy reaches the cloud folder
//   node dev/smoke.js --check-timeout 240000 --lib dev/checks/journey-lib.js --script dev/checks/labsync88.js
const { step, wait, until } = J;
const ls = (k, d) => { try { const v = localStorage.getItem(`hub.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } }; // the Lab's storage (ui.js store)
const api = window.hub.sync;
const T0 = Date.now();
const CLOUD = `/tmp/hearth-labsync88-${T0}`;
const SONGDIR = `/tmp/hearth-labsync88-song-${T0}`; // outside Hearth's folder, the home folder and any cloud drive
const MAC = { id: 'studio-mac-88c4d5e6', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
// History as an older Hearth left it: versions inside three-history.json (added to what's there: a temp profile anyway)
const h0 = (await window.hub.kvGet('three-history', {})) || {};
await window.hub.kvSet('three-history', { ...h0, versions: { ...(h0.versions || {}), oldscene88: [{ at: 2, code: '// v2 of an old scene' }, { at: 1, code: '// v1 of an old scene' }] }, trash: h0.trash || [] });
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
await api.on({ root: CLOUD });
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 20000);
await wait(1200);
const gotIt = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { gotIt.click(); await wait(300); }
const syncNow = async () => { await Sync.now(); await wait(600); };
const cloudOf = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const cloudJson = async (rel) => { try { if (!(await window.hub.fs.stat(cloudOf(rel)).catch(() => null))?.size) return null; return JSON.parse(await window.hub.fs.read(cloudOf(rel))); } catch { return null; } };
const macEdit = async (rel, fn) => { const v = fn(await cloudJson(rel)); await window.hub.fs.write(cloudOf(rel), JSON.stringify(v, null, 2)); };
const info = await window.hub.two.info();
const DATA = info.roots.data;
const kvFile = (n) => `${DATA}/kv/${n}.json`;

// the Lab
activate('tool:three');
await until(() => window.ThreeLab?.scenes?.all?.().length > 0 && ThreeLab.scenes.currentId() && ThreeLab.director, 40000);
const S = ThreeLab.scenes;
await until(() => window.LabPresets && ls('three.mineKnown', null) !== null, 15000);

// ---------- 1. History: one file per scene ----------
await until(async () => ((await window.hub.kvGet('three-hv-oldscene88', null))?.versions?.oldscene88 || []).length === 2, 15000);
const seg = await window.hub.kvGet('three-hv-oldscene88', null);
const main = await window.hub.kvGet('three-history', {});
step('History: versions in the old whole file moved into the scene\'s own file (both kept)', (seg?.versions?.oldscene88 || []).map((v) => v.code).join('|') === '// v2 of an old scene|// v1 of an old scene', seg);
step('…and taken out of the old file, which keeps the trash', main?.v === 2 && !main.versions?.oldscene88 && Array.isArray(main.trash), { v: main?.v, keys: Object.keys(main?.versions || {}) });
const mainAt = (await window.hub.fs.stat(kvFile('three-history')).catch(() => null))?.mtime || 0;
const base = S.get(S.currentId()).code;
const made = S.create({ name: 'Runs on both', code: `${base}\n// labsync88`, open: true });
await until(() => S.currentId() === made.id, 8000);
await until(async () => ((await window.hub.kvGet(SceneSafeCore.histSegName(made.id), null))?.versions?.[made.id] || []).length > 0, 15000);
const madeSeg = await window.hub.kvGet(SceneSafeCore.histSegName(made.id), null);
const mainAt2 = (await window.hub.fs.stat(kvFile('three-history')).catch(() => null))?.mtime || 0;
step('a scene that runs writes its own versions file…', (madeSeg?.versions?.[made.id] || []).some((v) => /labsync88/.test(v.code)), madeSeg);
step('…and not the old whole file', mainAt && mainAt2 === mainAt, { mainAt, mainAt2 });
step('History shows the scene\'s versions (read from its file)', ((await S.versionsOf(made.id))[made.id] || []).length > 0);
const other = S.create({ name: 'Pinned here', code: `${base}\n// pinned here` });
await wait(1500); await syncNow();
await until(async () => Boolean(await cloudJson(`kv/${SceneSafeCore.histSegName(made.id)}.json`)), 20000);
step('the scene\'s versions file reaches the cloud folder (for the other computer)', Boolean(await cloudJson(`kv/${SceneSafeCore.histSegName(made.id)}.json`)));

// ---------- 2. what you make in the Lab ----------
const now = Date.now();
await macEdit('kv/lab-presets.json', (x) => ({ ...(x || { v: 1 }), items: { ...(x?.items || {}),
  mpin88: { kind: 'pin', key: made.id, data: 'true', at: now },
  mfav88: { kind: 'fxfav', key: 'fx:mac-glitch', data: 'true', at: now },
  mset88: { kind: 'setlist', key: 'main', data: JSON.stringify([{ id: made.id }, { id: other.id }]), at: now },
  msong88: { kind: 'song', key: 'hearth-home:/Music/Mac song.mp3', data: JSON.stringify({ kick: { lo: 41, hi: 120 } }), at: now },
} }));
await syncNow();
await until(() => (ls('three.sketchPins', []) || []).includes(made.id), 20000);
step('a scene pinned on the Mac is pinned here', ls('three.sketchPins', []).includes(made.id), ls('three.sketchPins', []));
step('a favourite effect and the stage set list made on the Mac are here', ls('three.fx.favs', []).includes('fx:mac-glitch') && ls('three.stage.setlist', []).map((x) => x.id).join() === `${made.id},${other.id}`, { favs: ls('three.fx.favs', []), set: ls('three.stage.setlist', []) });
const songKey = Object.keys(ls('three.triggersBySong', {})).find((k) => /Music[\\/]Mac song\.mp3$/.test(k));
const fwd = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
step('a song\'s ⚡ triggers set on the Mac are here, under this computer\'s own path for it', Boolean(songKey) && fwd(songKey).startsWith(fwd(info.roots.home)) && ls('three.triggersBySong', {})[songKey]?.kick?.lo === 41, { songKey, home: info.roots.home });
localStorage.setItem('hub.three.sketchPins', JSON.stringify([...ls('three.sketchPins', []), other.id])); window.LabPresets.changed();
await wait(900); await syncNow();
await until(async () => Object.values((await cloudJson('kv/lab-presets.json'))?.items || {}).some((it) => it.kind === 'pin' && it.key === other.id), 20000);
step('a scene pinned here reaches the cloud copy', Object.values((await cloudJson('kv/lab-presets.json'))?.items || {}).some((it) => it.kind === 'pin' && it.key === other.id));
await macEdit('kv/lab-presets.json', (x) => { const items = { ...x.items }; delete items.mpin88; return { ...x, items }; });
await syncNow();
await until(() => !ls('three.sketchPins', []).includes(made.id), 20000);
step('a scene unpinned on the Mac is unpinned here (the one pinned here stays)', !ls('three.sketchPins', []).includes(made.id) && ls('three.sketchPins', []).includes(other.id), ls('three.sketchPins', []));

// ---------- 3. a scene's picture ----------
const picture = (flip) => { const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, flip ? '#fff' : '#000'); gr.addColorStop(1, flip ? '#000' : '#fff'); g.fillStyle = gr; g.fillRect(0, 0, 64, 36); return c.toDataURL('image/jpeg', 0.8); };
const st0 = S.thumbStats();
const first = await S.keepThumb(other.id, picture(false));
const again = await S.keepThumb(other.id, picture(false));
const changed = await S.keepThumb(other.id, picture(true));
step('a scene\'s picture: saved the first time, the same picture again saves nothing, a different one is saved', first === true && again === false && changed === true && S.thumbStats().same === st0.same + 1, { first, again, changed, st: S.thumbStats() });

// ---------- 4. a song from outside Hearth's folder ----------
const wav = (() => { const n = 8000; const b = new ArrayBuffer(44 + n * 2); const v = new DataView(b); const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 8000), true);
  let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); })();
const songPath = `${SONGDIR}/Owner song.wav`;
await window.hub.fs.write(songPath, wav, { base64: true });
const refNames = async () => { const x = await window.hub.fs.list(`${DATA}/refs`).catch(() => null); const a = Array.isArray(x) ? x : x?.items || x?.entries || []; return a.map((y) => (typeof y === 'string' ? y : y?.name || '')); };
const r = await ThreeLab.peek().loadSong(songPath);
await until(() => [...document.querySelectorAll('#toasts .toast button')].some((b) => /Keep a copy with this scene/.test(b.textContent)), 12000);
const offer = [...document.querySelectorAll('#toasts .toast button')].find((b) => /Keep a copy with this scene/.test(b.textContent));
step('a song from outside Hearth\'s folder: the offer shows, with its size', r?.ok && Boolean(offer) && /\(\d+ KB\)/.test(offer?.textContent || ''), { r, offer: offer?.textContent });
step('…and nothing was copied by itself', !(await refNames()).some((n) => /Owner song/.test(n)) && fwd(ThreeLab.peek().state?.song) === fwd(songPath), { song: ThreeLab.peek().state?.song });
offer?.click();
await until(() => /[\\/]refs[\\/]\d+-Owner song\.wav$/.test(ThreeLab.peek().state?.song || ''), 15000);
const copy = ThreeLab.peek().state?.song || '';
step('one click: the timeline plays a copy kept in Hearth\'s references; the original stays where it was', /[\\/]refs[\\/]\d+-Owner song\.wav$/.test(copy) && (await window.hub.fs.stat(songPath).catch(() => null))?.size > 0, { copy });
await wait(1500); await syncNow();
const copyName = copy.split(/[\\/]/).pop();
await until(async () => (await window.hub.fs.stat(cloudOf(`refs/${copyName}`)).catch(() => null))?.size > 0, 20000);
step('…and the copy reaches the cloud folder (the other computer gets it)', (await window.hub.fs.stat(cloudOf(`refs/${copyName}`)).catch(() => null))?.size > 0, copyName);

await api.off();
return J.done();
