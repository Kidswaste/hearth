// opt-in: LONGRUN91
// (round 91, longrun91) Does Hearth stay fast after HOURS of real use? A working day squeezed into ~12 minutes on the
// bigchat84 fixture (dev/bigchat84-fixture.js: 40 chats, 4 projects with their scenes, one GIANT 6,000-message chat;
// made up, never real data), cycle after cycle (dev/longrun91.js runs it by hand and prints the table):
//   · a project opened (ProjectWorkspace.open, the 4 in turn), its Desk's Find in this project with a word, then left
//   · the giant chat opened (windowed), scrolled up, Alt+F a rare word, Escape; then two other chats opened
//   · a message sent in the day's chat (fake Claude) and answered; every 4th cycle that chat is deleted (to the Trash,
//     as the panel's Delete does) and a new one started
//   · the Lab opened, one scene then another drawn, the Lab left
//   · Settings, the Usage window and the sync panel opened and closed; Ctrl+K with "sync" and with "?<rare word>"
//   · a sync pass on the fake two-computer setup: "the Mac" (a machine record in a temp cloud folder) changes one of its
//     chats there, then Sync now
// Every LR91_EVERY cycles (default 3), in the same state (a small chat on screen, nothing open, the Lab hidden), after
// forced GCs everywhere:
//   heap: the window, the Lab page (its own process), the main process, the store thread and the files thread (each
//         thread's own v8 heap after its own GC: storework.js _mem, tests only), with each thread's cache sizes
//   DOM:  nodes (all / in the page), JS listeners, window + document listeners
//   timers: the window's pending timeouts / live intervals / observers (preload wrappers, this check only), the main
//         process's live timers by line (powerwisemain's test probe), IPC listeners both sides
//   idle CPU: a 10 s quiet window after the sample, every process's CPU time (app.getAppMetrics) and the store threads'
//         busy time
// Verdict on the post-GC numbers by CYCLE (never wall time): after LR91_WARM samples (default 2) the Theil–Sen slope per
// cycle of each heap and of DOM nodes must stay under its threshold (SLOPE below), and idle CPU must not climb.
//   LONGRUN91=1 node dev/run-checks.js --exact longrun91
//   by hand: node dev/longrun91.js [--cycles 24] [--every 3] [--snap <dir>] [--report]
//   node dev/smoke.js --fake-engines --data /tmp/hearth-bigchat84 --wait 1000 --check-timeout 2400000 --script dev/checks/longrun91.js
//   debug options: LR91_PARTS='project,lab' only those parts · LR91_TRACE=1 / 'raw' what draws during the quiet window ·
//   LR91_STORESNAP='<dir>' a store-thread heap snapshot at each sample · LR91_IDLE_PRE=<ms> the quiet window later
//   --eval "window.LR91_CYCLES=9" a short run · window.LR91_SNAP='<dir>' heap snapshots (window, main) after the warm-up
//   and at the end · window.LR91_REPORT=1 reports without failing
// ---------- part 1: the counters, in every frame before its own scripts (then the window reloads) ----------
const src = await hub.fs.read(`${SMOKE_DEV}/soak.js`);
const body = src.slice(src.indexOf('const PROBE = `') + 15, src.indexOf('})();`;', src.indexOf('const PROBE = `')) + 5);
const SOAK = body.replace(/\\\\/g, '\\');
// pending timeouts by the line that made them (a timeout that never fires and is never cleared is a pile-up too)
const LR = `(() => { if (window.__lr91) return; const L = window.__lr91 = { pend: new Map(), fires: new Map() };
  const st = window.setTimeout, ct = window.clearTimeout;
  const where = () => String(new Error().stack || '').split('\\n').slice(2, 4).map((x) => x.trim().replace(/^at /, '').replace(/\\(?(?:file|https?):\\/\\/[^)]*\\/([^/)]+:\\d+):\\d+\\)?/, '$1')).join(' < ').slice(0, 140);
  window.setTimeout = function (fn, ms, ...a) { if (typeof fn !== 'function') return st.call(this, fn, ms, ...a); const s = where(); let id = 0; id = st.call(this, function (...b) { L.pend.delete(id); L.fires.set(s, (L.fires.get(s) || 0) + 1); return fn.apply(this, b); }, ms, ...a); L.pend.set(id, s); return id; };
  window.clearTimeout = function (id) { L.pend.delete(id); return ct.call(this, id); };
  // animation frames by the line that asked for them (a loop that keeps asking while nothing changes keeps the GPU busy)
  L.raf = new Map(); const ra = window.requestAnimationFrame;
  window.requestAnimationFrame = function (fn) { const s = where(); return ra.call(window, function (t) { L.raf.set(s, (L.raf.get(s) || 0) + 1); return fn(t); }); };
  L.top = (n = 8) => { const by = {}; for (const v of L.pend.values()) by[v] = (by[v] || 0) + 1; return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, n); };
})();`;
// the look's ambient loops pause 3 s after the last input instead of a minute (idlecpu.js's own test knob, this throwaway
// profile only): the quiet window then measures Hearth left alone, not the minute after a click (round 91: that minute's
// loops cost 30–45 % of a CPU in the GPU process here, software GL, every sample alike, and 0.1 % once hushed)
try { localStorage.setItem('idlecpu.hushMs', '3000'); } catch { /* the full minute: idle reads higher */ }
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: SOAK } });
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: LR } });
localStorage.lr91 = JSON.stringify(Object.fromEntries(['LR91_CYCLES', 'LR91_EVERY', 'LR91_WARM', 'LR91_OUT', 'LR91_SNAP', 'LR91_REPORT', 'LR91_IDLE_MS', 'LR91_STORESNAP', 'LR91_TRACE', 'LR91_PARTS', 'LR91_IDLE_PRE'].filter((k) => window[k] != null).map((k) => [k, window[k]])));
return 'probes installed';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const cdp = (method, params = {}) => smoke({ cdp: method, params });
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const MB = (b) => (b == null ? null : Math.round(b / 10485.76) / 100);
try { Object.assign(window, JSON.parse(localStorage.lr91 || '{}')); } catch { /* defaults */ }
const CYCLES = Number(window.LR91_CYCLES) || 24;
const EVERY = Number(window.LR91_EVERY) || 3;
const WARM = window.LR91_WARM != null ? Number(window.LR91_WARM) : 2;
const IDLE_MS = Number(window.LR91_IDLE_MS) || 10000;
const out = { setup: {}, samples: [], errs: {}, nfail: {}, acts: {}, ms: {}, problems: [] };
const L = window.__lr91; const P = window.__soakProbe;
if (!L || !P) { out.problems.push('the probes are not in'); return out; }
await until(() => window.H?.config && H.claudeAgent?.() && document.querySelector('#panel .item'), 120000);
await wait(3000);
const test = (t) => window.hub.power.test(t);
const C = H.claudeAgent();
async function act(name, fn) {
  const t = Date.now();
  try { await fn(); } catch (err) { out.nfail[name] = (out.nfail[name] || 0) + 1; (out.errs[name] ||= []).push(String(err?.message || err).slice(0, 160)); if (out.errs[name].length > 3) out.errs[name].shift(); }
  out.acts[name] = (out.acts[name] || 0) + 1; out.ms[name] = (out.ms[name] || 0) + (Date.now() - t);
}
const need = (v, what) => { if (!v) throw new Error(what); return v; };
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + Math.min(r.width / 2, 200)), Math.round(r.top + Math.min(r.height / 2, 30))]; };
const click = async (n) => { n.scrollIntoView?.({ block: 'nearest' }); await frame(); const [x, y] = mid(n); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1, buttons: type === 'mousePressed' ? 1 : 0 }); };
const VK = { Escape: 27, Enter: 13 };
const key = async (k, mods = 0) => { const code = k.length === 1 ? `Key${k.toUpperCase()}` : k; const vk = VK[k] || k.toUpperCase().charCodeAt(0); await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, modifiers: mods, windowsVirtualKeyCode: vk }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers: mods, windowsVirtualKeyCode: vk }); };
const type = (text) => cdp('Input.insertText', { text });
async function calm() {
  try { hideMenu?.(); } catch { /* none */ }
  document.querySelectorAll('dialog[open]').forEach((d) => { try { d.close(); } catch { /* gone */ } });
  if (document.querySelector('.sync-panel')) { await key('Escape'); await wait(100); }
}

// ---------- setup: the chats, the projects, the Lab's scenes, sync with "the Mac" ----------
const RARE = 'zanzibar84quokka';
const GIANT = 'claude-giant0';
const chats = (await window.hub.listChats().catch(() => [])) || [];
const small = chats.filter((c) => c.agentId === C.id && !/giant/.test(c.id)).map((c) => c.id);
out.setup.chats = chats.length; out.setup.giant = chats.some((c) => c.id === GIANT);
if (!out.setup.giant || small.length < 6) { out.problems.push('the bigchat84 fixture is not here (dev/bigchat84-fixture.js)'); return out; }
const HOME = small[0];
activate(C.id); await until(() => Native.hasView(C.id)); await Native.open(C.id, HOME); await wait(600);
await until(() => window.Projects?.ready?.() !== false && Projects.all?.().length, 30000);
const projects = (window.Projects?.all?.() || []).filter((p) => !p.archived).map((p) => p.id).slice(0, 4);
out.setup.projects = projects.length;
const CLOUD = `${window.SMOKE_TMP}/lr91-cloud`;
const F = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const MAC = { id: 'lr91-mac-5e6f7a8b', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
if (window.hub.sync?.on) {
  await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
  await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
  const s0 = Date.now(); await window.hub.sync.on({ root: CLOUD });
  await window.hub.sync.autoResolve?.(true).catch(() => {});
  for (let i = 0; i < 600; i++) { const x = await window.hub.sync.status(); if (['synced', 'conflict', 'pending'].includes(x?.state)) break; await wait(500); }
  out.setup.syncFirstPassS = Math.round((Date.now() - s0) / 1000); out.setup.sync = (await window.hub.sync.status())?.state;
  const gotIt = await until(() => [...document.querySelectorAll('.two-welcome button')].find((b) => b.textContent.trim() === 'Got it'), 6000);
  if (gotIt) gotIt.click();
}
let today = null;
let sceneIds = [];
const badProjects = new Set();

// ---------- one cycle of the day ----------
const parts = {
  async project(c) {
    if (!projects.length) throw new Error('no projects');
    // (the fixture keeps one project whose scene hasn't arrived from the other computer: it says so and is left out)
    const ok = projects.filter((p) => !badProjects.has(p)); if (!ok.length) throw new Error('no project opens');
    const id = ok[c % ok.length];
    try { await ProjectWorkspace.open(id); } catch (err) { if (/not available on this computer/.test(err.message)) { badProjects.add(id); out.setup.projectsLeftOut = [...badProjects]; return; } throw err; }
    need(await until(() => ProjectWorkspace.state().phase === 'ready' && ProjectWorkspace.state().project === id, 30000), 'project ready');
    await wait(600);
    // its Desk: Find in this project
    const tab = [...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Desk');
    if (tab) {
      await click(tab);
      const box = await until(() => document.querySelector('.pw-desk .pf-input'), 8000);
      if (box) { box.focus(); box.select(); await type(['scene', 'loop', 'neon', 'take'][c % 4]); await until(() => document.querySelector('.pw-desk .pf-results .pf-row, .pw-desk .pf-results .pf-empty'), 8000); await wait(300); box.select(); await type(''); }
    }
    activate(C.id); await wait(300);
  },
  async giant(c) {
    activate(C.id); await wait(100);
    await Native.open(C.id, GIANT);
    const v = () => Native.view(C.id);
    need(await until(() => v()?.list?.querySelector('.msg'), 30000), 'giant drawn');
    await wait(800);
    const list = v().list;
    for (let s = 0; s < 5; s++) { list.scrollTop = Math.max(0, list.scrollTop - 2500); await wait(120); }
    if (c % 2 === 0) {
      v().input?.focus(); await key('f', 1); await wait(300);
      const bar = v().root.querySelector('.chat-find input');
      if (bar) { bar.focus(); await type(RARE); await wait(300); await key('Enter'); await until(() => list.querySelector('mark.find-hit'), 8000); await wait(300); bar.focus(); await key('Escape'); await wait(200); }
    }
    // other chats (the giant one closed)
    for (let k = 1; k <= 2; k++) { await Native.open(C.id, small[(c * 2 + k) % small.length]); await frame(); await wait(250); }
  },
  async send(c) {
    activate(C.id); await wait(100);
    // a new chat every 4 cycles, the day's last one deleted as the panel's Delete does (to the Trash: 30 days to undo)
    if (today && c % 4 === 0 && H.chats.some((x) => x.id === today)) { await Native.remove(today); today = null; await wait(200); }
    if (!today || !H.chats.some((x) => x.id === today)) { Native.newChat(C.id); await wait(300); today = Native.current?.(C.id)?.id || H.activeChat?.[C.id]; } else { await Native.open(C.id, today); await wait(200); }
    Native.sendText(C.id, `cycle ${c}: the fog in the intro scene, a table and some code`);
    await until(() => Native.isAgentBusy(C.id), 5000); need(await until(() => !Native.isAgentBusy(C.id), 90000), 'reply finished');
    today = H.activeChat?.[C.id] || today; // (a new chat's id is its saved one from its first message on)
  },
  async lab(c) {
    activate('tool:three'); await until(() => typeof ThreeLab !== 'undefined', 30000); await ThreeLab.cmd?.({ show: true });
    await until(() => ThreeLab.scenes?.all?.().length, 30000);
    if (!sceneIds.length) sceneIds = ThreeLab.scenes.all().slice(0, 10).map((s) => s.id);
    for (const k of [0, 1]) {
      const id = sceneIds[(c * 2 + k) % sceneIds.length];
      let drawn = false; const on = (e) => { if (e.data?.source === 'three-sandbox' && e.data.type === 'stack-drawn') drawn = true; };
      addEventListener('message', on); try { ThreeLab.scenes.open(id); await until(() => drawn, 20000); } finally { removeEventListener('message', on); }
      await wait(800);
    }
    activate(C.id); await wait(300);
  },
  async windows() {
    activate(C.id); await wait(100);
    await AppUI.openSettings(); need(await until(() => document.querySelector('dialog.settings-dialog[open]'), 6000), 'settings'); await wait(400);
    document.querySelector('dialog.settings-dialog[open]')?.close(); await wait(200);
    await Meter.dashboard(); need(await until(() => document.querySelector('dialog.meter-dlg[open]'), 8000), 'usage window'); await wait(600);
    document.querySelector('dialog.meter-dlg[open]')?.close(); await wait(200);
    const dot = document.getElementById('sync-dot');
    if (dot) { await click(dot); need(await until(() => document.querySelector('.sync-panel h2'), 10000), 'sync panel'); await wait(500); await key('Escape'); await until(() => !document.querySelector('.sync-panel'), 3000); }
  },
  async search(c) {
    activate(C.id); await wait(100);
    for (const q of ['sync', `?${RARE}`]) {
      await key('k', 2); await wait(300); await type(q); await wait(q.startsWith('?') ? 1200 : 400); await key('Escape'); await wait(200);
    }
    await window.hub.searchChatText(['intro', 'fog', 'neon'][c % 3]);
  },
  async sync(c) {
    if (!window.hub.sync?.now) return;
    // the Mac changed one of its chats (5 in turn), then a pass: pulled here, this computer's saves pushed
    const id = `lr91-mac-chat${c % 5}`;
    const chat = { id, agentId: C.id, title: `From the Mac ${c % 5}`, updatedAt: Date.now(), messages: Array.from({ length: 6 + (c % 7) }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', at: Date.now() - (20 - i) * 1000, text: `mac cycle ${c} line ${i}: lights, the reveal, the mix` })) };
    await window.hub.fs.write(F(`chats/${id}.json`), JSON.stringify(chat));
    await wait(2300); // the engine waits 2 s after a cloud file changes
    await window.hub.sync.now();
    await until(async () => ['synced', 'conflict'].includes((await window.hub.sync.status())?.state), 30000);
  },
};
const ORDER = window.LR91_PARTS ? String(window.LR91_PARTS).split(',') : ['project', 'giant', 'send', 'lab', 'windows', 'search', 'sync']; // (LR91_PARTS: only these, to find which part leaves a cost behind)
async function cycle(c) { for (const p of ORDER) { await act(p, () => parts[p](c)); await calm(); } }

// ---------- a sample: the same state every time, everything GC'd, then 10 s of quiet ----------
const gcWin = async () => { for (let i = 0; i < 3; i++) { await cdp('HeapProfiler.collectGarbage'); await wait(150); } };
const labHeap = async () => {
  const r = await smoke({ target: 'three-sandbox', cdp: 'HeapProfiler.collectGarbage' }).catch(() => null);
  if (!r || r.error) return null;
  await smoke({ target: 'three-sandbox', cdp: 'HeapProfiler.collectGarbage' }).catch(() => null);
  const h = await smoke({ target: 'three-sandbox', cdp: 'Runtime.getHeapUsage' }).catch(() => null);
  return h?.usedSize ?? null;
};
const listenersOn = async (expr) => { const o = await cdp('Runtime.evaluate', { expression: expr }); const id = o?.result?.objectId; if (!id) return null; const l = await cdp('DOMDebugger.getEventListeners', { objectId: id }); cdp('Runtime.releaseObject', { objectId: id }); const by = {}; for (const x of l?.listeners || []) by[x.type] = (by[x.type] || 0) + 1; return { n: (l?.listeners || []).length, by }; };
const cpuOf = (m) => { const by = {}; for (const p of m?.procs || []) { const k = p.type === 'Tab' || p.type === 'Renderer' ? `${p.type}` : p.type; by[k] = (by[k] || 0) + (p.cpuS || 0); } return by; };
let snapped = false;
async function sample(c) {
  await calm(); activate(C.id); await Native.open(C.id, HOME); await wait(1500);
  await gcWin();
  const heap = (await cdp('Runtime.getHeapUsage')) || {};
  const dom = (await cdp('Memory.getDOMCounters')) || {};
  let attached = 0; { const w = document.createTreeWalker(document, NodeFilter.SHOW_ALL); while (w.nextNode()) attached++; }
  // where the page's elements are: the chat list, each surface, each kept chat list (by chat), the rest
  const regions = {}; { const add = (k, n) => { regions[k] = (regions[k] || 0) + n; }; const all = document.getElementsByTagName('*').length; let named = 0;
    for (const n of document.querySelectorAll('#panel, #rail, section.surface, dialog, body > div')) { if (n.parentElement?.closest('#panel, #rail, section.surface, dialog')) continue; const c = n.getElementsByTagName('*').length; named += c; add(n.id ? `#${n.id}` : n.tagName === 'SECTION' ? `surface ${n.dataset.id || n.className.split(' ').slice(0, 3).join('.')}` : `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}`, c); }
    regions.other = all - named; regions.lists = [...document.querySelectorAll('.messages')].map((m) => `${(m.dataset.chat || m.closest('[data-chat]')?.dataset.chat || '?').slice(-14)}:${m.getElementsByTagName('*').length}${m.checkVisibility() ? '' : '(hidden)'}`); }
  const winL = await listenersOn('window'); const docL = await listenersOn('document');
  const lab = await labHeap();
  const main = (await test({ longrun: {} }).catch(() => null))?.longrun || null;
  const thr = (await test({ threadMem: window.LR91_STORESNAP ? { snap: `${window.LR91_STORESNAP}/store-${c}.heapsnapshot` } : true }).catch(() => null))?.threadMem || {};
  const live = P.live();
  if (window.LR91_SNAP && !snapped && out.samples.length === WARM) { snapped = true; await smoke({ snapshot: `${window.LR91_SNAP}/win-a.heapsnapshot` }); await test({ longrun: { snapshot: `${window.LR91_SNAP}/main-a.heapsnapshot` } }); }
  // idle CPU: 10 s with nothing asked of Hearth
  await wait(Number(window.LR91_IDLE_PRE) || 3500); // (past the 3 s hush above)
  await test({ metrics: true }).catch(() => null);
  const m0 = await test({ metrics: true }).catch(() => null);
  L.raf.clear(); L.fires.clear();
  if (window.LR91_TRACE) await smoke(window.LR91_TRACE === 'raw' ? { trace: 'start', tasks: true, cats: 'cc,viz,gpu,benchmark,disabled-by-default-devtools.timeline.frame,devtools.timeline' } : { trace: 'start' }); // (what is painted while nothing happens: costs CPU itself, so opt-in; 'raw': every compositor event to LR91_OUT/idle-trace-<cycle>.json)
  // (LR91_TRACE) the Lab page's WebGL draw calls over the quiet window: a hidden Lab should draw nothing
  const GLC = `(() => { if (window.__lrGl) { const n = window.__lrGl.n; window.__lrGl.n = 0; return n; } const g = window.__lrGl = { n: 0 }; for (const G of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) for (const f of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) { const o = G.prototype[f]; if (o) G.prototype[f] = function (...a) { g.n++; return o.apply(this, a); }; } return 0; })()`;
  if (window.LR91_TRACE) await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: GLC, returnByValue: true } }).catch(() => null);
  // animations running in the window while nothing happens (a composited one never paints, yet keeps the GPU drawing frames)
  const anims = document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const t = a.effect?.target; const vis = t?.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }); return `${a.animationName || a.constructor.name}${a.effect?.getTiming?.().iterations === Infinity ? ' ∞' : ''} on ${t?.tagName?.toLowerCase() || '?'}${t?.id ? `#${t.id}` : ''}${t?.classList?.length ? `.${[...t.classList].slice(0, 3).join('.')}` : ''}${vis ? '' : ' (not visible)'}${t?.isConnected ? '' : ' (detached)'}`; });
  const labState = { ...(window.ThreeLab?.workspace?.state?.() || {}), parkedPerf: window.ThreeLab?.perf?.()?.parked };
  await wait(IDLE_MS);
  const m1 = await test({ metrics: true }).catch(() => null);
  const syncSt = await window.hub.sync?.status?.().then((x) => x && { state: x.state, pending: x.pending, waiting: (x.waiting || x.pendingList || []).slice?.(0, 4), blocked: (x.blocked || []).length, chip: document.querySelector('#sync-dot .sync-chip')?.textContent, dot: document.getElementById('sync-dot')?.dataset.state }).catch(() => null);
  const progress = (() => { try { return (window.Progress?.list?.({ all: true }) || []).map((it) => `${it.key} ${it.state} ${Math.round(it.shown ?? it.pct ?? -1)}% ${String(it.title || it.label || '').slice(0, 40)}`); } catch { return null; } })();
  const fires = [...L.fires].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${n}× ${k}`);
  const rafs = [...L.raf].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${n}× ${k}`);
  const videos = [...document.querySelectorAll('video')].filter((v) => !v.paused).map((v) => `${v.className || v.id || 'video'}${v.isConnected ? '' : ' (detached)'}`);
  const paint = window.LR91_TRACE === 'raw' ? (await smoke({ trace: 'stop', tasks: {}, dump: `${window.LR91_OUT || window.SMOKE_TMP}/idle-trace-${c}.json` }), null) : window.LR91_TRACE ? await smoke({ trace: 'stop' }) : null;
  if (window.LR91_TRACE) labState.glDraws = (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: GLC, returnByValue: true } }).catch(() => null))?.result?.value ?? null;
  const idle = {};
  if (m0?.metrics && m1?.metrics) {
    const s = (m1.metrics.at - m0.metrics.at) / 1000;
    const a = cpuOf(m0.metrics); const b = cpuOf(m1.metrics);
    for (const k of Object.keys(b)) idle[k] = r1(((b[k] - (a[k] || 0)) / s) * 100);
    idle.total = r1(Object.keys(b).reduce((x, k) => x + (b[k] - (a[k] || 0)), 0) / s * 100);
    const t0 = m0.metrics.threads || {}; const t1 = m1.metrics.threads || {};
    for (const k of Object.keys(t1)) idle[`thread:${k}`] = r1(((t1[k].activeMs - (t0[k]?.activeMs || 0)) / (s * 1000)) * 100);
    // each renderer that used ≥ 1 % of a CPU, with the pages / frames it runs
    const before = new Map((m0.metrics.procs || []).map((p) => [p.pid, p.cpuS || 0]));
    idle.renderers = (m1.metrics.procs || []).filter((p) => p.type === 'Tab' || p.type === 'Renderer').map((p) => ({ pct: r1(((p.cpuS || 0) - (before.get(p.pid) || 0)) / s * 100), wake: p.wake, pages: (m1.metrics.pages || []).filter((g) => g.pid === p.pid).map((g) => `${g.type}:${String(g.url).replace(/^file:\/\/.*\//, '').slice(0, 60)}`) })).filter((x) => x.pct >= 1);
  }
  const s = {
    cycle: c, min: r1((Date.now() - T0) / 60000),
    win: { heap: heap.usedSize, nodes: dom.nodes, attached, regions, docs: dom.documents, js: dom.jsEventListeners, winL: winL?.n, docL: docL?.n, winBy: winL?.by, docBy: docL?.by, intervals: live.intervals, observers: live.observers, urls: live.urls, pending: L.pend.size, pendingTop: L.top(6), byInterval: live.byInterval, byObserver: live.byObserver, byListener: live.byListener, ipc: window.hub.ipcListeners?.()?.total ?? null, chats: H.chats?.length },
    lab,
    main: main && { heap: main.heap, rss: main.rss, timers: main.timers, timersN: Object.values(main.timers || {}).reduce((x, v) => x + v, 0), ipc: main.ipc?.total, handles: Object.values(main.handles || {}).reduce((x, v) => x + v, 0), contents: main.contents },
    store: thr.store ? { heap: thr.store.heap, caches: thr.store.caches } : null,
    files: thr.files ? { heap: thr.files.heap, caches: thr.files.caches } : null,
    idle, anims, rafs, fires, videos, progress, sync: syncSt, labState, ...(paint ? { idlePaint: { paints: paint.paints, px: paint.paintedPx, top: paint.top } } : {}),
  };
  out.samples.push(s);
  return s;
}

// ---------- the day ----------
const T0 = Date.now();
await sample(0);
for (let c = 1; c <= CYCLES; c++) {
  await cycle(c);
  if (c % EVERY === 0) await sample(c);
}
if (window.LR91_SNAP) { await calm(); activate(C.id); await Native.open(C.id, HOME); await wait(1500); await gcWin(); await smoke({ snapshot: `${window.LR91_SNAP}/win-b.heapsnapshot` }); await test({ longrun: { snapshot: `${window.LR91_SNAP}/main-b.heapsnapshot` } }); }
if (window.hub.sync?.off) await window.hub.sync.off().catch(() => {});
out.minutes = r1((Date.now() - T0) / 60000);

// ---------- the trend, by cycle, on post-GC numbers ----------
const S = out.samples;
// Theil–Sen: the median of every pair's slope (one odd sample doesn't tilt it)
const theil = (xy) => { const sl = []; for (let i = 0; i < xy.length; i++) for (let j = i + 1; j < xy.length; j++) if (xy[j][0] !== xy[i][0]) sl.push((xy[j][1] - xy[i][1]) / (xy[j][0] - xy[i][0])); sl.sort((a, b) => a - b); return sl.length ? (sl.length % 2 ? sl[(sl.length - 1) / 2] : (sl[sl.length / 2 - 1] + sl[sl.length / 2]) / 2) : 0; };
// [name, get, unit, divisor, max slope per cycle]
const KB = 1024;
const SLOPE = [
  ['window heap', (s) => s.win.heap, 'KB', KB, 150 * KB], // (its JIT code still grows ~80 KB/cycle as more of the day's features get used: no object behind it)
  ['window DOM nodes', (s) => s.win.nodes, '', 1, 60],
  ['window DOM nodes kept out of the page', (s) => s.win.nodes - s.win.attached, '', 1, 60],
  ['window JS listeners', (s) => s.win.js, '', 1, 8],
  ['window+document listeners', (s) => (s.win.winL || 0) + (s.win.docL || 0), '', 1, 0.5],
  ['window intervals', (s) => s.win.intervals, '', 1, 0.25],
  ['window pending timeouts', (s) => s.win.pending, '', 1, 0.5],
  ['window observers', (s) => s.win.observers, '', 1, 0.5],
  ['window IPC listeners', (s) => s.win.ipc, '', 1, 0.25],
  ['Lab page heap', (s) => s.lab, 'KB', KB, 120 * KB],
  ['main heap', (s) => s.main?.heap, 'KB', KB, 60 * KB],
  ['main timers alive', (s) => s.main?.timersN, '', 1, 0.5],
  ['main IPC listeners', (s) => s.main?.ipc, '', 1, 0.25],
  ['main handles', (s) => s.main?.handles, '', 1, 0.5],
  ['store thread heap', (s) => s.store?.heap, 'KB', KB, 60 * KB],
  ['files thread heap', (s) => s.files?.heap, 'KB', KB, 60 * KB],
];
const fails = [];
const after = S.slice(WARM);
out.trend = []; out.curves = {};
for (const [name, get, unit, div, max] of SLOPE) {
  out.curves[name] = S.map((s) => { const v = get(s); return Number.isFinite(v) ? r1(v / div) : null; });
  const xy = after.map((s) => [s.cycle, get(s)]).filter(([, y]) => Number.isFinite(y));
  if (xy.length < 3) { out.trend.push(`– ${name}: not enough samples`); continue; }
  const slope = theil(xy);
  const grows = slope > max;
  out.trend.push(`${grows ? '✖ GROWS' : 'ok'} ${name}: ${r1(xy[0][1] / div)} → ${r1(xy.at(-1)[1] / div)}${unit ? ` ${unit}` : ''} (${slope >= 0 ? '+' : ''}${r1(slope / div)}${unit ? ` ${unit}` : ''}/cycle, limit ${r1(max / div)})`);
  if (grows) fails.push(`grows: ${name} +${r1(slope / div)}${unit}/cycle`);
}
// idle CPU after the warm-up: the last third vs the first third (in percent of one CPU), and its slope
const idleOf = (s) => s.idle?.total;
const iy = after.map((s) => [s.cycle, idleOf(s)]).filter(([, y]) => Number.isFinite(y));
if (iy.length >= 3) {
  const slope = theil(iy); const span = iy.at(-1)[0] - iy[0][0];
  out.idleCpu = { first: iy[0][1], last: iy.at(-1)[1], slopePerCycle: r1(slope * 100) / 100, overRun: r1(slope * span) };
  if (slope * span > 3) fails.push(`idle CPU climbs: +${r1(slope * span)} % of a CPU over the run`);
}
// where the growth sits (first sample after the warm-up → the last)
const first = after[0] || S[0]; const last = S.at(-1);
const diff = (a, b, min) => Object.keys(b || {}).map((k) => [k, (b[k] || 0) - (a?.[k] || 0)]).filter(([, d]) => d >= min).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, d]) => `+${d} ${k}`);
out.where = {
  windowListeners: diff(first.win.byListener, last.win.byListener, 3),
  windowIntervals: diff(first.win.byInterval, last.win.byInterval, 1),
  windowObservers: diff(first.win.byObserver, last.win.byObserver, 1),
  windowWinDoc: [...diff(first.win.winBy, last.win.winBy, 1).map((x) => `window ${x}`), ...diff(first.win.docBy, last.win.docBy, 1).map((x) => `document ${x}`)],
  windowPending: diff(Object.fromEntries(first.win.pendingTop || []), Object.fromEntries(last.win.pendingTop || []), 2),
  mainTimers: diff(first.main?.timers, last.main?.timers, 2),
  storeCaches: diff(first.store?.caches, last.store?.caches, 1),
  filesCaches: diff(first.files?.caches, last.files?.caches, 1),
};
const errParts = Object.entries(out.errs).map(([k, v]) => `${k}: ${v[0]}`);
// a part that failed (nearly) every time didn't run: the day wasn't the day
const neverRan = ORDER.filter((p) => (out.acts[p] || 0) > 0 && (out.nfail[p] || 0) * 2 > out.acts[p]);
if (neverRan.length) out.problems.push(`parts that kept failing: ${neverRan.join(', ')}`);
try { const f = `${window.LR91_OUT || window.SMOKE_TMP}/longrun91.json`; await window.hub.fs.write(f, JSON.stringify(out, null, 1)); out.file = f; } catch (err) { out.file = `not written: ${err.message}`; }
const brief = { cycles: CYCLES, every: EVERY, minutes: out.minutes, setup: out.setup, acts: out.acts, msPerPart: Object.fromEntries(Object.entries(out.ms).map(([k, v]) => [k, Math.round(v / (out.acts[k] || 1))])), trend: out.trend, idleCpu: out.idleCpu, idle: S.map((s) => s.idle?.total), idleBy: S.map((s) => s.idle), anims: S.map((s) => s.anims), rafs: S.map((s) => s.rafs), fires: S.map((s) => s.fires), progress: S.map((s) => s.progress), where: out.where, curves: out.curves, lastCaches: { store: last.store?.caches, files: last.files?.caches }, file: out.file, partErrors: errParts, partFails: out.nfail };
brief.fails = window.LR91_REPORT ? [] : fails; if (window.LR91_REPORT) brief.wouldFail = fails;
brief.problems = out.problems;
brief.pass = !brief.fails.length && !brief.problems.length;
return brief;
