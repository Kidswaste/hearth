// Errors in plain words (round 45, errorcalm), on a throwaway copy with throwaway data: a handful of REAL errors are
// provoked and each must reach the owner as one plain sentence + one action, the raw text only behind "Details":
//  1. a real IPC failure shown the old way (toast(err.message, { type: 'error' })): a file that isn't there → plain
//     sentence naming it, Show folder (runs: no error), Details holds "ENOENT"; Details opens and the toast stays
//  2. a song that isn't there (the Lab's Load audio path) → plain note, Find this file / Show folder, Details: ENOENT
//  3. an ffmpeg failure (a damaged .mp4 through the render queue) → plain reason + Retry, Details: what ffmpeg said
//  4. the sync folder gone (a temp "cloud drive" removed) → plain line + "Pick the folder again…", Details: the folder
//  5. the engine's program missing (Settings → Engines points at a text file, not Claude Code: a real spawn EACCES) →
//     the failed reply is one plain sentence with a fix button, nothing raw outside Details
//  6. a Lab scene's code error → one plain line above the console (🩺 Fix my scene); the console keeps the raw line
//  7. a command's raw one-line note in a chat → calmed, Details
//  8. a fix that opens a place (a refused key → "Meshy key…") really opens Settings on that row
//  9. no jargon in any sentence shown; no page errors
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/errorcalm.js --shot /tmp/errorcalm.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const steps = []; const problems = [];
const step = (name, ok, info) => { steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); if (!ok) problems.push(name); return Boolean(ok); };
const DIR = `/tmp/hearth-errorcalm-${Date.now()}`;
const JARGON = /\bE(NOENT|ACCES|PERM|BUSY|NOTDIR|INVAL)\b|\bspawn\b|\bIPC\b|\bundefined\b|\bMCP\b|\bJSON\b|invoking remote|at \S+ \(|\bstderr\b|exit code/;
// what a toast says on screen without its Details fold
const shown = (n) => { const c = n.cloneNode(true); c.querySelectorAll('.ec-details, button').forEach((x) => x.remove()); return c.textContent.trim(); };
const rawOf = (n) => n.querySelector('.ec-details .ec-raw')?.textContent || '';
const toastsNow = () => [...document.querySelectorAll('#toasts > .toast')];
async function newToast(fn, test = () => true, ms = 15000) {
  const before = new Set(toastsNow());
  await fn();
  return until(() => toastsNow().find((t) => !before.has(t) && test(t)), ms);
}
const C = H.claudeAgent();
const AS = () => (window.Lazy?.isIn?.('appsearch') && typeof AppSearch !== 'undefined' ? AppSearch : null);
const savedPaths = { ...(H.settings().enginePaths || {}) };
const out = {};
try {
  await window.hub.fs.write(`${DIR}/.keep`, '');
  step('errorcalm loads right after the first frame', await until(() => window.Lazy?.isIn?.('errorcalm') && window.errorCalm?.toast, 15000));

  // ---------- 1. a real IPC failure, shown the old way ----------
  const t1 = await newToast(() => window.hub.fs.read(`${DIR}/notes/none.txt`).catch((err) => toast(err.message, { type: 'error' })), (t) => t.classList.contains('error'));
  out.ipc = t1 && { text: shown(t1), raw: rawOf(t1).slice(0, 160) };
  step('1. a missing file: one plain sentence naming it', t1 && /“none\.txt” isn't there any more/.test(shown(t1)) && !JARGON.test(shown(t1)), out.ipc);
  step('1. Details holds the raw text (ENOENT, the IPC wrapper)', t1 && /ENOENT/.test(rawOf(t1)), out.ipc?.raw);
  const act1 = t1 && [...t1.querySelectorAll('button')].find((b) => b.textContent === 'Show folder');
  step('1. one action: Show folder', Boolean(act1));
  const d1 = t1?.querySelector('.ec-details');
  d1?.querySelector('summary')?.click(); await wait(200);
  step('1. Details opens (the toast stays while it is open)', d1?.open && d1.querySelector('.ec-raw')?.checkVisibility?.());
  await wait(4800);
  step('1. … still there after its usual 4.5 s', t1?.isConnected);
  const errsBefore = (window.__smokeErrors || []).length;
  act1?.click(); await wait(600); // the folder above it ($DIR) is opened (xdg-open in the test copy)
  step('1. Show folder runs without an error', !t1?.isConnected && (window.__smokeErrors || []).length === errsBefore);

  // ---------- 2. a song that isn't there ----------
  activate('tool:three');
  const lab = await ThreeLab.cmd();
  await wait(800);
  const SONG = `${DIR}/music/gone-song.wav`;
  const t2 = await newToast(() => lab.loadSong(SONG).catch(() => null), (t) => /gone-song/.test(t.textContent));
  out.song = t2 && { text: shown(t2), raw: rawOf(t2).slice(0, 160), buttons: [...t2.querySelectorAll('button')].map((b) => b.textContent) };
  step('2. a missing song: a plain sentence', t2 && /gone-song\.wav/.test(shown(t2)) && !JARGON.test(shown(t2)), out.song);
  step('2. … with one fix (Find this file or Show folder)', t2 && [...t2.querySelectorAll('button')].some((b) => /Find this file|Show folder/.test(b.textContent)), out.song?.buttons);
  step('2. Details holds the raw text', t2 && /ENOENT|no such file/i.test(rawOf(t2)), out.song?.raw);
  t2?.remove();

  // ---------- 3. an ffmpeg failure ----------
  await window.Lazy?.load?.('renders');
  await window.hub.fs.write(`${DIR}/bad.mp4`, 'this is not a video at all');
  const t3 = await newToast(() => Renders.transcode({ id: `ec${Date.now()}`, input: `${DIR}/bad.mp4`, output: `${DIR}/out/bad-copy.mp4`, args: ['-y', '-i', 'INPUT', '-c:v', 'libx264', 'OUTPUT'], duration: 1 }, undefined, { title: 'Bad copy' }).catch((err) => toast(err.message, { type: 'error' })),
    (t) => t.classList.contains('rq-fail') || t.classList.contains('error'), 30000);
  out.ffmpeg = t3 && { text: shown(t3), raw: rawOf(t3).slice(0, 200), buttons: [...t3.querySelectorAll('button')].map((b) => b.textContent) };
  step('3. ffmpeg failed: a plain reason', t3 && !JARGON.test(shown(t3)) && /damaged|couldn't|isn't/.test(shown(t3)), out.ffmpeg);
  step('3. … with Retry', t3 && [...t3.querySelectorAll('button')].some((b) => /Retry/.test(b.textContent)), out.ffmpeg?.buttons);
  step('3. Details holds what ffmpeg said', t3 && /Invalid data|moov|End of file|could not find|Error/i.test(rawOf(t3)), out.ffmpeg?.raw);
  t3?.remove();

  // ---------- 4. the sync folder gone ----------
  const CLOUD = `${DIR}/cloud`;
  await window.hub.fs.write(`${CLOUD}/.keep`, '');
  const on = await window.hub.sync.on({ root: CLOUD });
  await Sync.refresh();
  step('4. sync on with a temp "cloud drive"', on?.ok, on);
  await until(() => !/syncing|starting|idle/.test(Sync.status().state), 20000);
  await window.hub.fs.trash?.([CLOUD]).catch(() => null);
  if (await window.hub.fs.stat(CLOUD)) await window.hub.fs.trash([CLOUD]).catch(() => null);
  const t4 = await newToast(() => Sync.now(), () => true, 20000);
  out.syncGone = t4 && { text: shown(t4), buttons: [...t4.querySelectorAll('button')].map((b) => b.textContent), state: Sync.status().state, error: Sync.status().error };
  step('4. the folder gone: a plain line', t4 && !JARGON.test(shown(t4)) && /isn't reachable|missing/.test(shown(t4)), out.syncGone);
  step('4. … with the one fix (pick the folder again / start it again)', t4 && [...t4.querySelectorAll('button')].some((b) => /Pick the folder again|Start it again/.test(b.textContent)), out.syncGone?.buttons);
  step('4. … Details holds what was looked for', t4 && new RegExp(`cloud`).test(rawOf(t4)), rawOf(t4));
  t4?.remove();
  await window.hub.sync.off(); await Sync.refresh();

  // ---------- 5. the engine's program missing (Settings → Engines points at something that isn't it) ----------
  await window.hub.fs.write(`${DIR}/not-a-program/claude`, 'just some text, not Claude Code');
  H.config.settings = { ...H.settings(), enginePaths: { ...savedPaths, claude: `${DIR}/not-a-program/claude` } };
  await saveConfig(); await wait(400);
  activate(C.id); await wait(300);
  await Native.send(C.id, 'hello from the errorcalm check').catch(() => null);
  const err5 = await until(() => [...(Native.view(C.id)?.list.querySelectorAll('.msg.error') || [])].pop(), 30000);
  const body5 = err5?.querySelector(':scope > .body')?.textContent || '';
  out.engine = err5 && { text: body5.slice(0, 300), raw: rawOf(err5).slice(0, 200), buttons: [...err5.querySelectorAll('button')].map((b) => b.textContent).slice(0, 8) };
  step('5. the engine missing: the failed reply is one plain sentence (nothing raw outside Details)', err5 && /couldn't start/i.test(body5) && !JARGON.test(body5), out.engine);
  step('5. … with a fix button (Run /doctor / Claude program / Check this AI)', err5 && [...err5.querySelectorAll('button')].some((b) => /Check this AI|doctor|Install|Claude program/i.test(b.textContent)), out.engine?.buttons);
  step('5. … Details holds the raw text', err5 && /EACCES|spawn/.test(rawOf(err5)), out.engine?.raw);
  H.config.settings = { ...H.settings(), enginePaths: savedPaths };
  await saveConfig(); await wait(300);
  // a fix that opens its place: an app's key refused → "Meshy key…" opens Settings on that row
  const t8 = await newToast(() => toast('Couldn\'t start the model', { type: 'error', raw: new Error('HTTP 401'), calm: { app: 'Meshy' } }), (t) => t.classList.contains('error'));
  const k8 = t8 && [...t8.querySelectorAll('button')].find((b) => b.textContent === 'Meshy key…');
  step('8. a refused key: plain sentence + "Meshy key…"', t8 && /Meshy didn't accept your key/.test(shown(t8)) && k8, t8 && shown(t8));
  k8?.click();
  const dlg8 = await until(() => document.querySelector('dialog.settings-dialog[open]'), 8000);
  await until(() => AS()?.last?.jumped, 4000);
  step('8. … the button opens Settings at that row', dlg8 && AS()?.last?.jumped?.id === 'set:meshy-key' && AS().last.jumped.found, AS()?.last?.jumped);
  dlg8?.close(); await wait(200);

  // ---------- 6. a Lab scene's code error ----------
  activate('tool:three'); await wait(400);
  ThreeLab.openCode(`import * as THREE from 'three';\nconst r = new THREE.WebGLRenderer();\ndocument.body.append(r.domElement);\nconst x = THREEE.Color;\n`);
  const line6 = await until(() => { const n = document.querySelector('.surface.active .ec-lab:not([hidden])') || document.querySelector('.ec-lab:not([hidden])'); return n && /THREEE/.test(n.textContent) ? n : null; }, 20000);
  out.lab = line6 && { text: line6.querySelector('.ec-text')?.textContent, buttons: [...line6.querySelectorAll('button')].map((b) => b.textContent) };
  step('6. a scene error: one plain line above the console', line6 && /Your scene uses “THREEE”/.test(out.lab.text) && !JARGON.test(out.lab.text), out.lab);
  step('6. … with 🩺 Fix my scene', line6 && out.lab.buttons.some((b) => /Fix my scene/.test(b)), out.lab?.buttons);
  step('6. the console keeps the raw line for code work', [...document.querySelectorAll('.three-console .console-row.error')].some((r) => /THREEE is not defined/.test(r.textContent)));

  // ---------- 7. a command's raw one-line note ----------
  activate(C.id); await wait(300);
  const box = Native.note(C.id, `Couldn't save the preset: EACCES: permission denied, open '${DIR}/locked/preset.json'`);
  await wait(100);
  const nb = box?.querySelector(':scope > .body')?.textContent || '';
  out.note = { text: nb, raw: box ? rawOf(box) : '' };
  step('7. a raw note in a chat is calmed', /^Couldn't save the preset: hearth wasn't allowed|^Couldn't save the preset: Hearth wasn't allowed/.test(nb) && !JARGON.test(nb), out.note);
  step('7. … Details holds the raw text', /EACCES/.test(out.note.raw));
  box?.remove();

  // ---------- 9. every sentence shown: no jargon ----------
  const all = (ErrorCalm.last?.shown || []).map((x) => x.text);
  out.shownCount = all.length;
  step('8. no calmed sentence carries jargon', all.length > 3 && all.every((t) => !JARGON.test(t)), all.filter((t) => JARGON.test(t)).slice(0, 3));
  step('no page errors', !(window.__smokeErrors || []).length, (window.__smokeErrors || []).slice(0, 3));
} catch (err) {
  problems.push(`threw: ${err.message}`);
} finally {
  try { H.config.settings = { ...H.settings(), enginePaths: savedPaths }; await saveConfig(); } catch { /* fine */ }
  try { await window.hub.sync.off(); } catch { /* fine */ }
  try { await window.hub.fs.trash([DIR]); } catch { /* fine */ }
}
return JSON.stringify({ ok: !problems.length, problems, steps, ...out }, null, 1);
