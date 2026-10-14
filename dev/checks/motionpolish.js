// Motion polish (round 36, motionpolish): every UI movement on the compositor, one tempo, reduced motion respected.
// Real input (CDP) under a timeline trace (dev/trace-stats.js, the hz240 machinery), in the owner's look (Forgeheart),
// one stretch per moving surface, each opened and closed several times:
//   ⋯ AI setup (the drawer) · its folds · ◎ missions · ◉ Activity · a right-click menu and its submenu · toasts · a
//   dialog · the chats panel · switching chats · switching windows from the rail · the docked chat collapsing ·
//   the chat box growing line by line
// For each: main-thread frames drawn while it moves (a compositor-only movement needs ~1–2: the first paint, the
// last), work per input, style / layout counts and elements, forced layouts with the JS line.
// Then what moves: every animation / transition running right after each opening (document.getAnimations()):
// its properties, duration and easing (fails when one moves anything but transform / opacity; a hover's color change
// repaints that control only and is fine), and the stylesheets' own animations / transitions on properties that
// aren't compositor-only (width, height, margins, box-shadow, filters…) — the check fails on a new one.
// Reduced motion (the OS setting, emulated) and /motion off: nothing slides or scales any more (a fade at most).
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/motionpolish.js
// window.MP_ONLY = ['menu', …] runs some stretches only.
const { wait, until } = M;
const out = {};
const claude = H.claudeAgent();
const cdp = (method, params) => smoke({ cdp: method, params });
const press = (x, y, clickCount = 1) => cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount });
const release = (x, y, clickCount = 1) => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount });
const move = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
const click = async (x, y) => { await press(x, y); await release(x, y); };
const dbl = async (x, y) => { await click(x, y); await press(x, y, 2); await release(x, y, 2); };
const rclick = async (x, y) => { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 }); };
const esc = async () => { const p = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }; await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...p }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...p }); };
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const shown = (n) => n && n.getBoundingClientRect().width > 0;
const ONLY = window.MP_ONLY || null;

H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);

// ---- a docked director in the Lab (for the dock), and three chats of 120 messages ----
if (!H.agents().some((a) => a.dock === 'three' && a.mode === 'native')) {
  H.config.agents.push({ id: 'mpdirector', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', enabled: true });
  await saveConfig(); await wait(1500);
}
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\n${i % 10 === 0 ? '```js\nconst x = 1;\nconsole.log(x);\n```' : 'Another paragraph of plain words to give it some height.'}`;
const mk = async (title, n) => {
  const at0 = Date.now() - 100000;
  const c = { id: `mp-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title, createdAt: at0, updatedAt: at0, messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at0 + i * 100 })) };
  await window.hub.saveChat(c); Native.save(c); return c;
};
const chats = [await mk('MP chat A', 120), await mk('MP chat B', 120), await mk('MP chat C', 120)];
activate(claude.id); await wait(400);
Native.open(claude.id, chats[0].id);
await until(() => Native.view(claude.id).list.querySelectorAll('.msg').length >= 20, 10000);
if (!H.panelOpen) { H.panelOpen = true; applyLayout(); }
await wait(1200);

// ---- what moves right after an opening: running animations / transitions, their properties, time and easing ----
const what = (a) => {
  const t = a.effect?.target; const kf = a.effect?.getKeyframes?.() || [];
  const props = [...new Set(kf.flatMap((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))))];
  const tm = a.effect?.getComputedTiming?.() || {};
  const cls = t ? `${t.tagName?.toLowerCase() || ''}${t.id ? `#${t.id}` : ''}${typeof t.className === 'string' && t.className ? `.${t.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}${a.effect?.pseudoElement || ''}` : '?';
  return { on: cls, name: a.animationName || a.transitionProperty || a.id || 'js', props: a.transitionProperty ? [a.transitionProperty] : props, ms: Math.round(tm.duration || 0), easing: (a.animationName && kf[0]?.easing) || a.effect?.getTiming?.().easing || '', /* a CSS animation's easing sits on its keyframes */ moves: props.some((p) => /transform|translate|scale|rotate/.test(p)) || /transform|translate|scale|rotate/.test(a.transitionProperty || '') };
};
const moving = () => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity && (a.effect?.getComputedTiming?.().duration || 0) < 5000).map(what);
const caught = {}; // stretch → [what moved]
const catchAnims = (name) => { const list = moving(); if (!caught[name]) caught[name] = []; for (const m of list) if (!caught[name].some((x) => x.on === m.on && x.name === m.name)) caught[name].push(m); };

// ---- the stretches (each opens and closes its surface with real input) ----
const v = () => Native.view(claude.id);
const optBtn = () => [...v().root.querySelectorAll('.native-head button')].find((n) => n.getAttribute('aria-label') === 'Chat options' && shown(n));
const S = {
  'ai-setup': async () => {
    for (let i = 0; i < 5; i++) {
      await click(...mid(optBtn())); await until(() => document.querySelector('.opt-sheet'), 4000); await wait(20); catchAnims('ai-setup'); await wait(260);
      await click(...mid(optBtn())); await wait(260);
    }
  },
  folds: async () => {
    await click(...mid(optBtn())); await until(() => document.querySelector('.opt-sheet .opt-fold'), 4000); await wait(300);
    const sums = [...document.querySelectorAll('.opt-sheet details.opt-fold > summary')].slice(0, 4);
    for (let k = 0; k < 2; k++) for (const s of sums) { s.scrollIntoView({ block: 'nearest' }); await settle(); await click(...mid(s)); await wait(20); catchAnims('folds'); await wait(260); }
    Options.hide(); await wait(200);
  },
  missions: async () => {
    for (let i = 0; i < 5; i++) {
      await click(...mid(v().root.querySelector('.ms-btn'))); await until(() => document.querySelector('.ms-pop'), 3000); await wait(20); catchAnims('missions'); await wait(260);
      await esc(); await wait(200);
    }
  },
  activity: async () => {
    if (window.Lazy?.loaded?.('activity') === false) await Lazy.load('activity');
    for (let i = 0; i < 5; i++) {
      Activity.open(); await settle(); catchAnims('activity'); await wait(260);
      await esc(); await wait(200);
      if (document.querySelector('.ac-pop')) Activity.close();
    }
  },
  menu: async () => {
    for (let i = 0; i < 4; i++) {
      const row = [...document.querySelectorAll('#panel .item')].find(shown);
      await rclick(...mid(row)); await until(() => shown(document.getElementById('menu')), 2000); await wait(20); catchAnims('menu'); await wait(220);
      const sub = [...document.querySelectorAll('#menu > button')].find((b) => b.classList.contains('has-sub') || /›|▸/.test(b.textContent));
      if (sub) { await move(...mid(sub)); await wait(20); catchAnims('menu'); await wait(250); }
      await esc(); await wait(60); await esc(); await wait(200);
    }
  },
  toasts: async () => {
    for (let i = 0; i < 6; i++) { toast(`Motion check ${i}`, { timeout: 900 }); await wait(20); catchAnims('toasts'); await wait(240); }
    await wait(1200);
  },
  dialog: async () => {
    for (let i = 0; i < 4; i++) {
      const p = Modal.confirm('Motion check', 'A dialog opening and closing.');
      await until(() => document.querySelector('dialog[open]'), 2000); await wait(20); catchAnims('dialog'); await wait(300);
      await esc(); await p.catch(() => {}); await wait(200);
    }
  },
  panel: async () => {
    const b = document.getElementById('panel-btn');
    for (let i = 0; i < 4; i++) { await click(...mid(b)); await wait(20); catchAnims('panel'); await wait(320); }
    if (!H.panelOpen) { H.panelOpen = true; applyLayout(); await settle(); }
  },
  'switch-chats': async () => {
    for (let i = 0; i < 6; i++) {
      const c = chats[(i + 1) % 3];
      const row = [...document.querySelectorAll('#panel .item')].find((r) => (r.dataset.key || '').includes(c.id));
      if (row) { row.scrollIntoView({ block: 'nearest' }); await settle(); await click(...mid(row)); } else Native.open(claude.id, c.id);
      await wait(20); catchAnims('switch-chats'); await wait(380);
    }
  },
  rail: async () => {
    const railBtn = (id) => document.querySelector(`#agent-buttons .agent-btn[data-id="${id}"], #rail [data-id="${id}"]`);
    for (let i = 0; i < 2; i++) for (const id of ['tool:three', 'tool:board', claude.id]) {
      const b = railBtn(id); if (b && shown(b)) await click(...mid(b)); else activate(id);
      await wait(20); catchAnims('rail'); await wait(420);
    }
  },
  dock: async () => {
    activate('tool:three'); await wait(600);
    Tools.syncDocks?.(); await wait(200);
    const dv = () => [...document.querySelectorAll('.surface.active .tool-dock-divider')].find(shown);
    if (!dv()) { out.dockNote = 'no dock divider'; return; }
    for (let i = 0; i < 4; i++) { await dbl(...mid(dv())); await wait(20); catchAnims('dock'); await wait(320); }
    activate(claude.id); await wait(400);
  },
  // a reply finishing: nothing should play again on it (it was there all along)
  'stream-end': async () => {
    for (let i = 0; i < 2; i++) {
      Native.sendText(claude.id, 'hello there');
      await until(() => Native.isAgentBusy(claude.id), 5000);
      await until(() => !Native.isAgentBusy(claude.id), 30000);
      for (let k = 0; k < 6; k++) { await new Promise(requestAnimationFrame); catchAnims('stream-end'); }
      await wait(400);
    }
  },
  composer: async () => {
    const t = v().input; t.focus(); await settle();
    for (let i = 0; i < 8; i++) { await cdp('Input.insertText', { text: `line ${i}\n` }); await wait(20); catchAnims('composer'); await wait(120); }
    t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur(); await settle();
  },
};
const names = Object.keys(S).filter((n) => !ONLY || ONLY.includes(n));

// warm-up: first opens load their code (lazy groups) — timed on their own, then the measured run
const first = {};
for (const [n, fn] of [['ai-setup', async () => { await click(...mid(optBtn())); await until(() => document.querySelector('.opt-sheet'), 6000); }], ['missions', async () => { await click(...mid(v().root.querySelector('.ms-btn'))); await until(() => document.querySelector('.ms-pop'), 6000); }]]) {
  const t = performance.now(); await fn(); first[n] = Math.round(performance.now() - t); await wait(300);
  if (n === 'ai-setup') { await click(...mid(optBtn())); } else await esc();
  await wait(300);
}
out.firstOpenMs = first;

await smoke({ trace: 'start', detail: true });
const t0 = performance.now();
performance.mark('hz240:idle'); await wait(800);
for (const n of names) { performance.mark(`hz240:${n}`); try { await S[n](); } catch (err) { out[`${n}Error`] = String(err.stack || err.message || err).slice(0, 300); } await settle(); }
performance.mark('hz240:end');
await settle();
const tr = await smoke({ trace: 'stop', detail: true });
const dd = tr.detail || {};
out.ms = Math.round(performance.now() - t0);
out.all = `tasks>4.2ms ${dd.tasks?.over4} (>8.3 ${dd.tasks?.over8}, >50 ${dd.tasks?.over50}, max ${dd.tasks?.maxMs}) · frames ${dd.frames?.n} over4.2 ${dd.frames?.over4} over8.3 ${dd.frames?.over8} p95 ${dd.frames?.p95} · forced ${dd.forced?.n}/${dd.forced?.ms}ms · style ${dd.style?.n}× ${dd.style?.elements}el ${dd.style?.ms}ms · layout ${dd.layout?.n}× ${dd.layout?.objects}obj ${dd.layout?.ms}ms`;
const line = (s) => `in ${s.inputs} · work p50 ${s.work.p50} p95 ${s.work.p95} max ${s.work.max} · frames ${s.frames.n} >4.2 ${s.frames.over4} >8.3 ${s.frames.over8} worst ${s.frames.worst} · tasks>4.2 ${s.longTasks.over4} max ${s.longTasks.max} · style ${s.style.n}×${s.style.elements}el ${s.style.ms}ms · layout ${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms · forced ${s.forced.n}/${s.forced.ms}ms`;
out.segments = {};
for (const n of names) { const s = dd.segments?.[n]; if (!s) continue; out.segments[n] = line(s); out.segments[`${n} time`] = `${s.phases}`; if (s.forced.n) out.segments[`${n} forced`] = s.forced.top.slice(0, 4).join(' | '); }

// ---- the tempo: durations / easings of what moved ----
const fmt = (m) => `${m.on} ${m.name} [${m.props.join(',')}] ${m.ms}ms ${m.easing}`;
out.moved = Object.fromEntries(Object.entries(caught).map(([k, l]) => [k, l.map(fmt)]));
const tempo = {}; for (const l of Object.values(caught)) for (const m of l) { const k = `${m.ms}ms ${m.easing}`; tempo[k] = (tempo[k] || 0) + 1; }
out.tempo = tempo;
const notCompositor = Object.values(caught).flat().filter((m) => m.props.some((p) => !/^(opacity|transform|translate|scale|rotate|visibility|color|background-color|border(-(top|right|bottom|left))?-color|outline-color|fill|stroke|--.*)$/.test(p)));
out.movedNotCompositor = notCompositor.map(fmt);

// ---- the stylesheets: animations / transitions of properties that aren't compositor-only ----
const BAD = /^(width|height|min-height|max-height|min-width|max-width|top|left|right|bottom|inset|margin.*|padding.*|box-shadow|filter|backdrop-filter|clip-path|background-position|grid-template-rows|grid-template-columns|flex-basis|font-size|letter-spacing|stroke-dashoffset|mask-position|all)$/;
const sheetBad = [];
const walk = (rules, file) => {
  for (const r of rules) {
    if (r.type === CSSRule.KEYFRAMES_RULE) {
      const props = new Set(); for (const k of r.cssRules) for (const p of k.style) if (BAD.test(p)) props.add(p);
      if (props.size) sheetBad.push(`${file} @keyframes ${r.name}: ${[...props].join(',')}`);
    } else if (r.cssRules) walk(r.cssRules, file);
    if (r.style?.transitionProperty && r.style.transitionDuration && !/^0s(, 0s)*$/.test(r.style.transitionDuration)) {
      const props = r.style.transitionProperty.split(',').map((x) => x.trim()).filter((p) => BAD.test(p));
      if (props.length) sheetBad.push(`${file} ${r.selectorText.slice(0, 60)}: transition ${props.join(',')}`);
    }
  }
};
for (const sh of document.styleSheets) { try { walk(sh.cssRules, (sh.href || 'inline').split('/').pop()); } catch { /* not readable */ } }
out.sheetsNotCompositor = sheetBad;

// ---- reduced motion (emulated OS setting), then /motion off: what still moves ----
const quick = async (label) => {
  const got = [];
  const grab = () => { for (const m of moving()) got.push({ ...m, at: label }); };
  await click(...mid(optBtn())); await until(() => document.querySelector('.opt-sheet'), 3000); await wait(16); grab(); await wait(200);
  const sum = document.querySelector('.opt-sheet details.opt-fold > summary'); if (sum) { await click(...mid(sum)); await wait(16); grab(); await wait(150); }
  await click(...mid(optBtn())); await wait(150);
  await click(...mid(v().root.querySelector('.ms-btn'))); await wait(16); grab(); await wait(200); await esc(); await wait(150);
  const row = [...document.querySelectorAll('#panel .item')].find(shown); await rclick(...mid(row)); await wait(16); grab(); await wait(200); await esc(); await wait(150);
  toast('Reduced motion check', { timeout: 600 }); await wait(16); grab(); await wait(200);
  const p = Modal.confirm('Motion', 'check'); await wait(16); grab(); await wait(200); await esc(); await p.catch(() => {}); await wait(150);
  await click(...mid(document.getElementById('panel-btn'))); await wait(16); grab(); await wait(250); await click(...mid(document.getElementById('panel-btn'))); await wait(16); grab(); await wait(250);
  Native.open(claude.id, chats[1].id); await wait(16); grab(); await wait(300);
  return got;
};
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await settle();
const rm = await quick('reduce');
await cdp('Emulation.setEmulatedMedia', { features: [] });
out.reducedMotion = { moving: rm.filter((m) => m.moves && m.ms > 1).map(fmt), fades: rm.filter((m) => !m.moves && m.ms > 1).length, longest: Math.max(0, ...rm.map((m) => m.ms)) };
document.documentElement.dataset.motion = 'off';
await settle();
const off = await quick('off');
delete document.documentElement.dataset.motion;
out.motionOff = { running: off.filter((m) => m.ms > 1).map(fmt) };

// ---- verdict ----
const fail = [];
for (const k of Object.keys(out)) if (k.endsWith('Error')) fail.push(`${k}: ${out[k]}`);
if (out.movedNotCompositor.length) fail.push(`moves off the compositor: ${out.movedNotCompositor.slice(0, 4).join(' · ')}`);
if (out.reducedMotion.moving.length) fail.push(`reduced motion still slides / scales: ${out.reducedMotion.moving.slice(0, 4).join(' · ')}`);
if (out.reducedMotion.longest > 200) fail.push(`reduced motion: a ${out.reducedMotion.longest} ms animation`);
if (out.motionOff.running.length) fail.push(`/motion off still animates: ${out.motionOff.running.slice(0, 4).join(' · ')}`);
const replayed = (caught['stream-end'] || []).filter((m) => /^div\.msg/.test(m.on));
if (replayed.length) fail.push(`a finished reply played its entrance again: ${replayed.map(fmt).join(' · ')}`);
// left as they are (docs/upgrades/motionpolish.md): one-shot attention flashes on one element (a found message, a
// control the keys sheet points at, ↻ Again, a Lab slider the director moved), thin progress fills that change a few
// times per task (widths set by their makers), the node editor's own wires and bars (measured in the nodes checks)
const ALLOWED = window.MP_ALLOW || /three-lab\.css @keyframes tw-flash|nodes\.css |@keyframes (flash-msg|ks-flash|speed-flash)|features\.css \.(bar span|progress-bar i)|meter\.css \.ms-gauge i|addons\.css \.dl-bar span/;
const newBad = sheetBad.filter((s) => !ALLOWED.test(s));
if (!window.MP_REPORT && newBad.length) fail.push(`stylesheets animate layout / paint properties: ${newBad.slice(0, 6).join(' · ')}`);
out.verdict = fail.length ? fail : 'ok';
if (fail.length && !window.MP_REPORT) throw new Error(`motionpolish: ${fail.join(' || ')}\n${JSON.stringify(out, null, 1)}`);
return JSON.stringify(out, null, 1);
