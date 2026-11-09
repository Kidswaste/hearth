// (round 153c, labwin153) ⧉ the Lab in its own lean window (docs/upgrades/labwin153.md), ONE check. Its own temp data
// and a fixture scene; never an owner's scene.
//   open      the Lab ⋯ › View & help › "⧉ Open in its own window" opens lab-window.html on that scene (its first frame
//             timed from the click)
//   lean      the Lab window has no chat / board / project / usage groups at all (not even stand-ins), loads none of
//             the chat app's scripts (native.js, panel.js, usage.js…), and its loaded groups are the Lab's
//   paused    Hearth's Lab let go of the scene (its preview page released) and shows "Open in Lab window ↗"
//   edits     an AI call made from Hearth's side (its chat) lands in the Lab window; a rename there is on disk at once;
//             Hearth's Lab has both after the Lab window closes, back on that scene, its preview running again
//   secure    the Lab window: contextIsolation on, no node integration, no <webview>, same as Hearth's window; no
//             require / process in the page; the same CSP
//   unfocused the Lab window keeps drawing at full rate while Hearth's window is in front (unless Lite mode is on)
//   hide      "Hide Hearth while the Lab window is open": Hearth hidden, back when the Lab window closes
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/labwin153.js
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
// an expression in the Lab window (its page): the value, or undefined when it isn't there / threw
const lw = async (expr) => { const r = await smoke({ pageEval: 'lab-window\\.html', expr: `(async () => JSON.stringify(await (async () => (${expr}))()))()` }); return r?.value === undefined ? undefined : JSON.parse(r.value); };
const CHAT_GROUPS = ['board', 'chatcmds', 'chatrest', 'chatwin', 'projects', 'projmenu', 'budget', 'routines', 'memory', 'notes', 'usagelimits', 'costcoach', 'directordock', 'directortask', 'capture', 'assets', 'context', 'syncpanel', 'astraconnect', 'apps', 'cmdpage', 'flows', 'hooks', 'meterdash'];
const CHAT_SCRIPTS = ['native.js', 'panel.js', 'usage.js', 'meter.js', 'astra.js', 'chat-live.js', 'missions.js', 'manager.js', 'sync.js', 'chat-scenes.js', 'collab-eyes.js', 'start.js'];

try {
  await smoke({ cdnFor: 'lab-window\\.html' }); // (its preview's three.js from the local copy, as the main window's)
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && window.LabWinHost, 60000);
  await ThreeLab.cmd();
  await ThreeLab.director.newSketch('Lab window fixture (labwin153)', `import * as THREE from 'three';
const r = new THREE.WebGLRenderer({ antialias: false }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);
const s = new THREE.Scene(); s.background = new THREE.Color('#0b0b0c'); const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); cam.position.z = 5;
const m = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 96, 12), new THREE.MeshNormalMaterial()); s.add(m);
r.setAnimationLoop((t) => { m.rotation.y = t / 900; m.rotation.x = t / 1700; r.render(s, cam); });`, 1);
  await until(() => ThreeLab.workspace.state().ready, 30000);
  await wait(1500);
  const id = ThreeLab.scenes.currentId();

  // ---------- open: the Lab ⋯ › View & help row ----------
  const more = ThreeLab.search.menus().more;
  const view = more.find((r) => Array.isArray(r) && r[0] === 'View & help');
  const row = view?.[2]?.find((r) => Array.isArray(r) && /Open in its own window/.test(r[0]));
  step('the Lab ⋯ › View & help has "⧉ Open in its own window" (and "Hide Hearth while the Lab window is open")', Boolean(row) && view[2].some((r) => Array.isArray(r) && /Hide Hearth/.test(r[0])), view?.[2]?.slice(0, 3).map((r) => r[0]));
  step('…and Ctrl/⌘+; knows it: /labwin, found by "open lab window"', Boolean(Commands.get('labwin')) && (Commands.suggest?.('open lab window') || []).some((x) => /labwin/.test(JSON.stringify(x))), (Commands.suggest?.('open lab window') || []).slice(0, 3));
  const t0 = performance.now();
  row[2]();
  const opened = await until(async () => (await lw('typeof LabWin !== "undefined" && LabWin.times().frame ? LabWin.times() : null')) || null, 60000);
  const st = await window.hub.labwin.state();
  out.measure.open = { clickToWindowMs: null, times: opened, pid: st.pid, mainPid: st.mainPid };
  if (opened) out.measure.open.firstFrameAfterPageStartMs = opened.frame - opened.start;
  out.measure.open.clickToFirstFrameMs = Math.round(performance.now() - t0); // (an upper bound: polled every 200 ms)
  step('open: a window of its own (its own renderer process) on that scene, its first frame drawn', Boolean(opened) && st.open && st.scene === id && st.pid && st.pid !== st.mainPid && (await lw('ThreeLab.scenes.currentId()')) === id, { st: { open: st.open, scene: st.scene, pid: st.pid, mainPid: st.mainPid }, opened });

  // ---------- lean ----------
  const lean = await lw(`({ groups: Lazy.state().map((g) => [g.name, g.state]), scripts: [...document.scripts].map((s) => s.src.split('/').pop()), errs: window.__lwErrs, chats: H.chats.length, surfaces: [...H.surfaces.keys()], natives: document.querySelectorAll('.native-chat, webview').length })`);
  const names = lean.groups.map(([n]) => n);
  const loaded = lean.groups.filter(([, s]) => s === 'loaded').map(([n]) => n);
  out.measure.lean = { listed: names.length, loaded, scripts: lean.scripts.length };
  step('lean: no chat / board / project / usage group exists in the Lab window (not even a stand-in)', !CHAT_GROUPS.some((g) => names.includes(g)), CHAT_GROUPS.filter((g) => names.includes(g)));
  step('lean: none of the chat app\'s scripts load there (native.js, panel.js, usage.js, meter.js…), one surface (the Lab), no chat view or <webview>', !CHAT_SCRIPTS.some((f) => lean.scripts.includes(f)) && lean.surfaces.length === 1 && lean.surfaces[0] === 'tool:three' && !lean.natives && !lean.chats, { scripts: lean.scripts.filter((f) => CHAT_SCRIPTS.includes(f)), surfaces: lean.surfaces });
  step('lean: what loaded is the Lab\'s (lab, nodes, kit…), and the window threw nothing', loaded.includes('lab') && loaded.includes('nodes') && loaded.every((n) => !CHAT_GROUPS.includes(n)) && !lean.errs.length, { loaded, errs: lean.errs });

  // ---------- paused: Hearth's Lab ----------
  await wait(500);
  const away = document.querySelector('.surface.active .labwin-away');
  step('paused: Hearth\'s Lab let go of the scene (its preview page released) and shows "Open in Lab window ↗"', ThreeLab.workspace.state().released && Boolean(away?.checkVisibility()) && /Open in Lab window ↗/.test(away?.textContent || '') && LabWinHost.away() === id, { ws: ThreeLab.workspace.state(), card: away?.textContent?.slice(0, 80) });
  ThreeLab.workspace.resume(); await wait(600); // (Hearth's Lab coming back on screen does not run it here)
  step('paused: Hearth\'s Lab coming back on screen still runs nothing of it (one preview of a scene, ever)', ThreeLab.workspace.state().released, ThreeLab.workspace.state());

  // ---------- edits ----------
  const call = await HubBridge.call('three_add_layer', { name: 'Added from Hearth', code: "import * as THREE from 'three';\nconst r = new THREE.WebGLRenderer({ alpha: true }); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);" }, {});
  const inLw = await until(async () => { const v = await lw(`ThreeLab.scenes.get(${JSON.stringify(id)}).layers.map((l) => l.name)`); return v?.includes('Added from Hearth') ? v : null; }, 15000);
  step('edits: an AI call made from Hearth (its chat stays there) runs in the Lab window, on its scene', call?.ok !== false && Boolean(inLw) && LabWinHost.state().forwarded >= 1, { call: call?.ok === false ? call.error : 'ok', layers: inLw, host: LabWinHost.state() });
  await lw(`ThreeLab.scenes.rename(${JSON.stringify(id)}, 'Renamed in the Lab window')`);
  const disk = await until(async () => { const d = await window.hub.kvGet('three-sketches', null); const x = (d || []).find((s) => s.id === id); return x?.name === 'Renamed in the Lab window' && x.layers?.some((l) => l.name === 'Added from Hearth') ? x : null; }, 10000);
  step('edits: saved through the same path (the scenes file on disk has them at once)', Boolean(disk), disk ? { name: disk.name, layers: disk.layers.map((l) => l.name) } : null);
  // Hearth's window saving its scenes meanwhile (another scene's change) never writes its old copy of this one back
  ThreeLab.scenes.rename(ThreeLab.scenes.all().find((s) => s.id !== id)?.id || id, `Other scene ${Date.now() % 1000}`);
  await wait(1500);
  const disk2 = ((await window.hub.kvGet('three-sketches', null)) || []).find((s) => s.id === id);
  step('edits: a save from Hearth\'s window meanwhile keeps the Lab window\'s version of its scene', disk2?.name === 'Renamed in the Lab window', disk2?.name);

  // ---------- secure ----------
  const sec = await lw(`({ require: typeof require, process: typeof process, module: typeof module, csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '', hub: typeof window.hub })`);
  const mainCsp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
  const P = st.prefs || {}; const M = st.mainPrefs || {};
  out.measure.prefs = { lab: P, main: M };
  step('secure: contextIsolation on, no node integration (sub-frames too), no <webview>, web security on; same as Hearth\'s window', P.contextIsolation === true && P.nodeIntegration === false && P.nodeIntegrationInSubFrames === false && P.webviewTag === false && P.webSecurity !== false && M.contextIsolation === true && M.nodeIntegration === false, out.measure.prefs);
  step('secure: no require / process / module in its page, only the preload bridge (hub); the same CSP as Hearth\'s window', sec.require === 'undefined' && sec.process === 'undefined' && sec.module === 'undefined' && sec.hub === 'object' && sec.csp === mainCsp && /default-src 'self'/.test(sec.csp), sec);
  step('secure: backgroundThrottling off for the Lab window only (Hearth\'s window keeps resting when unseen)', P.backgroundThrottling === false && st.mainThrottled !== false && M.backgroundThrottling !== false, { lab: P.backgroundThrottling, main: st.mainThrottled });

  // ---------- unfocused: Hearth's window in front ----------
  const lite = Boolean(await lw('window.LabWinHost.lite()'));
  await lw('window.hub.labwin.showMain({})');
  await wait(3500);
  const un = await lw(`({ stats: LabWin.stats(), focused: document.hasFocus(), visible: document.visibilityState })`);
  const un2 = await (async () => { await wait(2500); return lw('LabWin.stats()'); })();
  out.measure.unfocused = { first: un, later: un2, lite };
  const drawing = un?.stats && un2 && un2.fps > 0 && un2.ago < 3000 && un.visible === 'visible';
  step(`unfocused: the Lab window keeps drawing while Hearth's window is in front${lite ? ' (Lite mode on: its 30 fps cap)' : ' at full rate (no 30 fps background cap)'}`, Boolean(drawing) && (lite ? un2.cap === 30 : un2.cap !== 30), out.measure.unfocused);

  // ---------- close: back to Hearth on that scene ----------
  await lw('(window.LabWinHost.rows()[0][2](), true)'); // ↩ Back to Hearth
  await until(() => !LabWinHost.away(), 15000);
  const back = await until(() => { const s = ThreeLab.scenes.get(id); return s?.name === 'Renamed in the Lab window' && s.layers?.some((l) => l.name === 'Added from Hearth') && ThreeLab.workspace.state().ready && !ThreeLab.workspace.state().released ? s : null; }, 30000);
  const st2 = await window.hub.labwin.state();
  step('close: Hearth\'s Lab is back on that scene with everything changed there, its preview running again, the card gone', Boolean(back) && ThreeLab.scenes.currentId() === id && !document.querySelector('.labwin-away') && !st2.open && H.surfaceIdFor(H.activeId) === 'tool:three', { name: ThreeLab.scenes.get(id)?.name, layers: ThreeLab.scenes.get(id)?.layers?.map((l) => l.name), ws: ThreeLab.workspace.state(), cur: ThreeLab.scenes.currentId() === id });

  // ---------- hide Hearth meanwhile ----------
  LabWinHost.hideMain(true);
  const h1 = await LabWinHost.open(id);
  await until(async () => (await window.hub.labwin.state()).open, 20000);
  await wait(800);
  const hs = await window.hub.labwin.state();
  await window.hub.labwin.close();
  await until(async () => !(await window.hub.labwin.state()).open, 15000);
  await wait(800);
  const hs2 = await window.hub.labwin.state();
  LabWinHost.hideMain(false);
  step('hide: "Hide Hearth while the Lab window is open" hides Hearth, and it comes back when the Lab window closes', h1?.ok && hs.open && hs.mainVisible === false && hs2.mainVisible === true && !hs2.open, { open: hs.mainVisible, closed: hs2.mainVisible });
} catch (err) { step(`threw: ${err.message}`, false, String(err.stack || '').split('\n').slice(0, 4).join(' | ')); }

const fails = out.steps.filter((s) => s.startsWith('✖'));
console.log(`[LABWIN153] ${JSON.stringify(out.measure)}`);
if (fails.length) throw new Error(`labwin153: ${fails.length} failed\n${out.steps.join('\n')}`);
return out.steps.join('\n');
