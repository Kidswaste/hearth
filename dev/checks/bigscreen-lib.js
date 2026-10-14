// Shared body of the big-screen checks (round 38, bigscreen): dev/checks/bigscreen.js (a 4K screen at 100 %, then an
// ultrawide window) and dev/checks/bigscreen-hidpi.js (a 4K screen at 200 %). smoke.js adds it when a check uses BS.
// Pictures land in /tmp/hearth-bigscreen/ (look at them).
const BS = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
  const DIR = '/tmp/hearth-bigscreen/';
  const out = { steps: [], shots: [] };
  const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); return Boolean(ok); };
  const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
  const shot = async (name) => { const f = `${DIR}${name}.png`; await smoke({ shot: f }); out.shots.push(f); };
  const big = window.hub.big;
  const z = () => Math.round(window.hub.getZoom() * 100) / 100;
  // no sideways scrolling anywhere on screen: the page, the app, every visible surface and its header / messages
  function overflow() {
    const bad = [];
    const se = document.scrollingElement;
    if (se.scrollWidth > innerWidth + 1) bad.push(`page ${se.scrollWidth} > ${innerWidth}`);
    for (const e of document.querySelectorAll('#app, #rail, #panel, main, #surfaces, .surface, .native-head, .tool-head, .messages, .composer, .three-toolbar, .three-split, .options-drawer, dialog[open]')) {
      if (!e.checkVisibility?.({ visibilityProperty: true })) continue;
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2) bad.push(`${e.id || e.className.toString().split(' ')[0]} scrolls sideways ${e.scrollWidth} > ${e.clientWidth}`);
      const r = e.getBoundingClientRect();
      if (r.width && r.right > innerWidth + 2) bad.push(`${e.id || e.className.toString().split(' ')[0]} past the right edge (${Math.round(r.right)} > ${innerWidth})`);
    }
    return [...new Set(bad)].slice(0, 8);
  }
  async function chat() {
    const a = H.claudeAgent(); activate(a.id); await wait(300);
    if (document.querySelectorAll('.surface.active .msg').length >= 2) return;
    const ta = document.querySelector('.surface.active .composer textarea');
    ta.value = 'long table code please'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.closest('form').requestSubmit();
    await until(() => !document.querySelector('.msg.streaming') && document.querySelectorAll('.surface.active .msg').length >= 2, 40000);
    await wait(400);
  }
  // frame gaps inside the Lab preview (its own clock), the adaptive step, the canvas' pixels
  const sbx = async (code) => { for (let i = 0; i < 6; i++) { const r = await ThreeLab.director.evalInSketch(code); if (r?.ok) return r.value; await wait(700); } return null; };
  async function labFrames(ms = 4000) {
    await sbx('window.__bsg = []; window.__bsl = 0; window.__bson = true; (function f(t) { if (!window.__bson) return; if (window.__bsl) window.__bsg.push(t - window.__bsl); window.__bsl = t; requestAnimationFrame(f); })(performance.now()); return 1');
    await wait(ms);
    const r = await sbx('window.__bson = false; const c = [...document.querySelectorAll("canvas")].filter((x) => x.width * x.height > 1000); const g = window.__bsg.slice().sort((a, b) => a - b); return { n: g.length, p50: g[Math.floor(g.length / 2)] || null, p95: g[Math.floor(g.length * 0.95)] || null, adapt: window.__labAdapt?.state?.(), px: c.reduce((a, x) => a + x.width * x.height, 0), css: c[0] ? [c[0].clientWidth, c[0].clientHeight] : null, dpr: devicePixelRatio }');
    return r;
  }

  async function run(kind) {
    out.kind = kind;
    const i0 = await big.info();
    out.screen = { name: i0.name, sig: i0.sig, auto: i0.auto, start: big.startZoom, zoomNow: z(), dpr: devicePixelRatio };
    const hidpi = kind === 'hidpi';
    // ---- 1) the size of everything: Auto from the screen, set before the first frame ----
    if (hidpi) step('a 4K screen at 200 %: Auto keeps 100 % (the system already scales it)', i0.auto === 1 && z() === 1 && i0.sig === '3840x2160@2', out.screen);
    else step('a 4K screen at 100 %: Auto is 150 %, already in the first frame (preload)', i0.auto === 1.5 && big.startZoom === 1.5 && z() === 1.5 && i0.pref === 'auto', out.screen);
    // the window as big as the screen (points)
    const W = hidpi ? 1920 : 3840; const Hh = hidpi ? 1080 : 2160;
    await big.testBounds({ width: W, height: Hh }); await wait(900);
    out.window = [innerWidth, innerHeight, devicePixelRatio];
    // ---- 2) chats, grid view, the Lab, AI setup at this size ----
    await safe('chat', async () => {
      await chat();
      const m = document.querySelector('.surface.active .messages .msg:not(.user) .body');
      const w = m?.getBoundingClientRect().width || 0;
      step('a chat keeps a comfortable reading width (≤ 900 px of text, centred)', w > 400 && w <= 900, { textWidth: Math.round(w), window: innerWidth });
      step('chat: nothing scrolls sideways', !overflow().length, overflow());
      await shot(`${kind}-chat-auto`);
    });
    await safe('grid', async () => {
      H.grid = true; applyLayout(); await wait(700);
      step('grid view: nothing scrolls sideways', !overflow().length, overflow());
      await shot(`${kind}-grid`);
      H.grid = false; applyLayout(); await wait(300);
    });
    await safe('ai setup', async () => {
      if (window.Lazy && !Lazy.isIn?.('options')) await Lazy.load('options');
      Options.open({}); await wait(900);
      const d = [...document.querySelectorAll('.options-drawer, .opt-drawer, aside, dialog[open]')].find((e) => e.checkVisibility?.() && /AI setup|Personality|instructions/i.test(e.textContent || ''));
      const w = d ? d.getBoundingClientRect().width : 0;
      step('AI setup: a drawer, not stretched across the screen', d && w > 280 && w < Math.max(900, innerWidth * 0.5), { width: Math.round(w) });
      await shot(`${kind}-ai-setup`);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
      document.querySelector('.options-drawer .close, .opt-close')?.click();
      await wait(300);
    });
    await safe('lab', async () => {
      activate('tool:three'); await until(() => window.ThreeLab?.director, 15000); await wait(5000);
      const f = await labFrames(4000);
      const side = [...document.querySelectorAll('.tw-column')].find((e) => e.checkVisibility?.());
      const pv = document.querySelector('.three-preview');
      out.lab = { frames: f, preview: pv ? [Math.round(pv.clientWidth), Math.round(pv.clientHeight)] : null, side: side ? Math.round(side.getBoundingClientRect().width) : null };
      step('the Lab: the preview takes the room, the side panel doesn\'t stretch (≤ 460 px)', pv && side && pv.clientWidth > innerWidth * 0.55 && side.getBoundingClientRect().width <= 460, out.lab);
      step('the Lab draws at the screen\'s ratio (crisp)', f && Math.abs(f.dpr - devicePixelRatio) < 0.01, f && { inside: f.dpr, page: devicePixelRatio });
      step('the Lab: nothing scrolls sideways', !overflow().length, overflow());
      await shot(`${kind}-lab`);
      // smooth enough: a slow, huge preview steps its resolution down by itself (labadapt + the big-preview rule)
      if (f && f.p50 > 40) {
        // from full quality again: how long until it steps down, and the pixels it draws then
        await sbx('window.__labAdapt.set({ level: 0, hold: false }); return 1');
        await wait(600);
        const full = await sbx('return [...document.querySelectorAll("canvas")].reduce((a, x) => a + (x.width * x.height > 1000 ? x.width * x.height : 0), 0)');
        const t0 = performance.now();
        const ok = await until(async () => ((await sbx('return window.__labAdapt.state().level')) || 0) > 0, 20000);
        const took = Math.round(performance.now() - t0);
        const f2 = await labFrames(3000);
        out.lab.after = { ...f2, fullPx: full, stepDownMs: took };
        step('a slow huge preview lowers its resolution by itself', ok && f2 && f2.px < full, { fullPx: full, after: [f2?.p50, f2?.px, f2?.adapt?.level], stepDownMs: took });
      } else step('the Lab keeps up at this size', f && f.p50 && f.p50 <= 40, f);
    });
    // ---- 3) the size of everything: a pick per screen, ⌘/Ctrl + / − / 0, the Appearance row ----
    await safe('size', async () => {
      await Bigscreen.setSize(1); await wait(500);
      let i = await big.info();
      step('100 %: kept for this screen', z() === 1 && i.pref === 1 && Math.abs(innerWidth - W) <= 2, { zoom: z(), pref: i.pref, w: innerWidth });
      AppUI.zoom(0.1); await until(async () => z() === 1.1, 3000);
      i = await big.info();
      step('Ctrl + : 110 % on this screen', z() === 1.1 && i.pref === 1.1, { zoom: z(), pref: i.pref });
      AppUI.zoom(0); await until(async () => (await big.info()).pref === 'auto', 3000);
      step('Ctrl 0 : back to Auto', z() === i0.auto, { zoom: z() });
      Look.openDialog(); await wait(500);
      const row = document.querySelector('dialog.look-dialog .big-size');
      step('Appearance has one "Size of everything" row: Auto · 100 · 125 · 150 · 175 · 200', row && row.querySelectorAll('button').length === 6, row?.textContent);
      row?.querySelector('button[data-v="1.25"]')?.click();
      await until(async () => z() === 1.25, 3000);
      step('picking 125 in Appearance sizes everything at once', z() === 1.25 && row.querySelector('button[data-v="1.25"]').classList.contains('on'), { zoom: z() });
      await shot(`${kind}-appearance-125`);
      const lab = await sbx('return devicePixelRatio');
      step('the Lab follows the new size crisply (its ratio = the page\'s)', lab && Math.abs(lab - devicePixelRatio) < 0.01, { lab, page: devicePixelRatio });
      document.querySelector('dialog.look-dialog')?.close();
      await Bigscreen.setSize('auto'); await wait(400);
    });
    // ---- 4) full screen: ⛶, remembered for this screen, Esc doesn't leave it, the first-time hint, the rail peek ----
    await safe('fullscreen', async () => {
      activate(H.claudeAgent().id); await wait(300);
      const b = document.getElementById('full-btn');
      step('⛶ in the rail, under ☰', b && b.previousElementSibling?.id === 'panel-btn' && /Full screen/.test(b.title), b?.title);
      const toasts0 = document.querySelectorAll('.toast').length;
      b.click();
      const on = await until(async () => (await big.info()).fullscreen === true, 5000);
      await wait(400);
      const hint = [...document.querySelectorAll('.toast')].some((t) => /Esc doesn't/.test(t.textContent));
      step('⛶ goes full screen (the window\'s own, remembered for this screen) and says once how to leave', on && document.documentElement.hasAttribute('data-bigfull') && hint, { on, toasts0, hint });
      // Esc while typing never leaves it
      const ta = document.querySelector('.surface.active .composer textarea'); ta.focus();
      await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } });
      await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } });
      await wait(500);
      step('Esc in the chat box doesn\'t leave full screen', (await big.info()).fullscreen === true);
      step('the button says how to leave', b.classList.contains('on') && /Leave full screen/.test(b.title), b.title);
      // the chats list hidden: resting on the rail shows it over the page
      H.panelOpen = false; applyLayout(); await wait(200);
      document.getElementById('rail').dispatchEvent(new PointerEvent('pointerenter'));
      const peeked = await until(() => document.getElementById('panel').classList.contains('big-peek'), 2000);
      await wait(250);
      await shot(`${kind}-fullscreen-peek`);
      document.getElementById('rail').dispatchEvent(new PointerEvent('pointerleave', { relatedTarget: document.querySelector('main') }));
      const gone = await until(() => !document.getElementById('panel').classList.contains('big-peek'), 2000);
      step('full screen, chats list hidden: resting on the rail shows it, leaving hides it', peeked && gone);
      H.panelOpen = true; applyLayout();
      const r = await Commands.tryRun('/fullscreen status', H.claudeAgent().id);
      step('/fullscreen status', true, typeof r === 'string' ? r : undefined);
      await Commands.tryRun('/fullscreen off', H.claudeAgent().id);
      const off = await until(async () => (await big.info()).fullscreen === false, 5000);
      step('/fullscreen off: windowed again', off && !document.documentElement.hasAttribute('data-bigfull'));
    });
    // ---- 5) an ultrawide window (3440 × 1440 points) on the same screen ----
    if (!hidpi) {
      await safe('ultrawide', async () => {
        await big.testBounds({ width: 3440, height: 1440 }); await wait(900);
        out.ultrawide = [innerWidth, innerHeight];
        step('ultrawide 3440 × 1440: chat without sideways scrolling', !overflow().length, overflow());
        await shot(`${kind}-ultrawide-chat`);
        activate('tool:three'); await wait(2500);
        step('ultrawide: the Lab without sideways scrolling', !overflow().length, overflow());
        await shot(`${kind}-ultrawide-lab`);
      });
    }
    out.ok = out.steps.every((s) => s.ok);
    return JSON.stringify(out, null, 1);
  }
  return { run, overflow };
})();
