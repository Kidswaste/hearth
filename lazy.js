// Lazy loading (round 16, boot): feature modules the first screen (chats + rail) doesn't need load after it, or the
// first time they're used, so Hearth starts faster and keeps less in memory.
//
// Each group of files (lazy-data.js: LazyData.GROUPS) is listed with what it registers at load (LazyData.META, written
// by `node dev/lazy-manifest.js`): its chat commands, Ctrl/⌘+K actions, keys-sheet lines, agent tool prefixes
// (HubBridge), app windows (Apps) and rail tools. Stand-ins for all of them are registered at once, so
// Commands.list(), the "/" menu, /help, the palette, the keys sheet and the Apps list show everything from the start;
// using one loads its group (in the original order, with its CSS) and hands over to the real thing.
//   tier 'soon': loads right after the first screen, one group per idle moment (background hooks keep working)
//   tier 'use':  loads only when one of its commands / actions / tools / globals is first used
// (round 52) the stand-in commands' descriptions / examples / keywords come from lazy-meta.js right after the first frame
// (Lazy.text()); lazy-data.js keeps only what registering them needs.
// Lazy.load(name) → Promise · Lazy.when(name, fn) (fn once the group is in) · Lazy.state() · Lazy.misses() (globals touched before their group loaded: a dev aid,
// each one also loads its group) · Lazy.report(name) (what a group registered while loading: the manifest's source).
const Lazy = (() => {
  const D = typeof LazyData !== 'undefined' ? LazyData : { GROUPS: [], META: {} };
  const groups = new Map(); // name → { name, files, css, tier, after, state: 'stub' | 'loading' | 'loaded' | 'failed', promise, at, ms }
  const stubCmds = new Map(); // 'group|name' → command name (stand-ins not taken over yet)
  const realActions = new Map(); // palette label → the real run (the stand-in action calls it)
  const realBridge = new Map(); // tool prefix → the real handler
  const stubKeys = new Map(); // 'area|keys' → the stand-in keys-sheet line (the real one fills it in)
  const stubTools = new Map(); // tool id → stand-in tool
  const actOf = new Map(); // a stand-in Ctrl/⌘+K line → its group (round 94: Lazy.groupOfAction)
  const unregs = new Map(); // 'group|name' → its stand-in's unregister (what Commands.register returns)
  const reports = new Map(); // group → { commands: [defs], actions: [labels], keys: [lines], bridge: [prefixes], apps: [defs], tools: [defs] }
  const missLog = []; // { name, group, at, where }
  let chain = Promise.resolve(); // loads run one at a time (the registry patches below are shared)
  let readyAt = 0;
  let namesAtReady = null; // the command names when the first screen was up (dev/checks/lazy.js: all of them are there)

  const say = (msg) => { try { console.warn(`Lazy: ${msg}`); } catch { /* no console */ } };
  const ofGlobal = new Map(); // global name → group
  for (const g of D.GROUPS || []) {
    groups.set(g.name, { tier: 'soon', after: [], css: [], ...g, state: 'stub', promise: null });
    for (const n of g.globals || []) ofGlobal.set(n, g.name);
  }
  // (round 94, labload94) a 'soon' group that needs a 'use' one (the Lab's direction / finish lines need the Lab) follows
  // it: it loads once that one is in (and the start is calm), never pulling it in itself
  for (const g of groups.values()) if (g.tier === 'soon' && g.after.some((d) => groups.get(d)?.tier === 'use')) { g.tier = 'use'; g.follow = true; }

  // ---------- globals: touching one before its group loaded loads it (and is noted for the developer) ----------
  // A configurable accessor on window: `typeof Studio` reads it (undefined, as before the group loads) and asks for the
  // group; the group's own `const Studio = …` then shadows it, and the accessor is removed once the group is in.
  function guardGlobals(g) {
    for (const name of g.globals || []) {
      if (Object.prototype.hasOwnProperty.call(window, name)) continue;
      try {
        Object.defineProperty(window, name, {
          configurable: true, enumerable: false,
          get() {
            if (g.state === 'stub') {
              missLog.push({ name, group: g.name, at: Math.round(performance.now()), where: (new Error().stack || '').split('\n').slice(2, 4).map((l) => l.trim().replace(/^at /, '').replace(/\(?file:\/\/\S*\/([^/]+:\d+):\d+\)?/, '$1')).join(' < ') });
              if (missLog.length > 200) missLog.shift();
              want(g);
            }
            return undefined;
          },
          set(v) { Object.defineProperty(window, name, { value: v, writable: true, configurable: true, enumerable: true }); },
        });
      } catch { /* a name the page already owns */ }
    }
  }
  function unguardGlobals(g) {
    for (const name of g.globals || []) {
      const d = Object.getOwnPropertyDescriptor(window, name);
      if (d && d.get && !('value' in d)) { try { delete window[name]; } catch { /* kept */ } }
    }
  }

  // ---------- stand-ins ----------
  // (round 25, diet) the manifest names a group's usual command / keys area once (area, karea): put it back on each entry
  const groupMeta = (name) => {
    const m = (D.META || {})[name];
    if (!m) return {};
    if (m.area || m.karea) {
      const put = (x, area) => { if (x.area === undefined) return { ...x, area }; if (x.area !== null) return x; const { area: _, ...r } = x; return r; }; // null: had none
      if (m.area) m.commands = (m.commands || []).map((c) => put(c, m.area));
      if (m.karea) m.keys = (m.keys || []).map((k) => put(k, m.karea));
      delete m.area; delete m.karea;
    }
    return m;
  };
  // A stand-in command is a def whose run / complete / when hand over to its own object once the real def has filled it
  // in (takeOver): a module that copied it meanwhile ({ ...Commands.get('director'), run: … }) reaches the real one too.
  // Its mark (__lazy) isn't enumerable, so copies and combined shared names don't carry it.
  const stubSelf = new Map(); // 'group|name' → the stand-in's def object in the registry
  function stubCommand(g, c) {
    const name = String(c.name).toLowerCase();
    if (typeof Commands === 'undefined') return;
    // a name an eager command already has: only a `when` variant shares it (combined as before; it holds once loaded)
    if (Commands.get(name) && !c.when) return;
    const key = `${g.name}|${name}`;
    const self = () => stubSelf.get(key);
    const run = async (args, ctx) => {
      await load(g.name);
      const d = self();
      if (!d || d.run === run) throw new Error(`/${name} isn't available (its module didn't load)`);
      return d.run(args, ctx);
    };
    // argument suggestions arrive once the group is in (the "/" menu asks again as you type)
    const complete = (args, ctx) => {
      const d = self();
      if (d && d.complete !== complete) return d.complete ? d.complete(args, ctx) : [];
      if (g.state === 'stub') want(g);
      return [];
    };
    const when = (ctx, args) => {
      const d = self();
      if (d && d.when !== when) return d.when ? d.when(ctx, args) : true;
      if (g.state === 'stub') want(g);
      return false;
    };
    const { when: shared, dcl, ...rest } = c;
    try {
      // the aliases as the module gave them where it used to register (it filtered them itself if it does)
      // (round 52) its words (lazy-meta.js) when they're in already; otherwise fillText puts them in when they come
      const un = Commands.register({ ...(textOf(g.name, name) || {}), ...rest, ...(shared ? { when } : {}), aliases: c.aliases || [], run, complete });
      const cur = Commands.get(name);
      const obj = cur && (cur.run === run ? cur : cur.variants?.find((v) => v.run === run));
      if (!obj) { un?.(); return; }
      Object.defineProperty(obj, '__lazy', { value: g.name, configurable: true, enumerable: false, writable: true });
      unregs.set(key, un);
      stubSelf.set(key, obj);
      stubCmds.set(key, name);
    } catch (err) { say(`stub /${name}: ${err.message}`); }
  }
  function stubAction(g, label, keys) {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    const have = (seen.actions ||= new Set((AppUI.actions?.() || []).map((a) => a.label)));
    if (have.has(label)) return;
    have.add(label);
    actOf.set(label, g.name);
    AppUI.addAction(label, async () => {
      try { await load(g.name); } catch (err) { toast(err.message, { type: 'error' }); return; }
      const fn = realActions.get(label);
      if (fn) fn(); else say(`no action "${label}" after loading ${g.name}`);
    }, keys || '');
  }
  function stubKey(g, k) {
    if (typeof Keys === 'undefined') return;
    const id = `${k.area}|${k.keys}`;
    const have = (seen.keys ||= new Set(Keys.all().map((x) => `${x.area}|${x.keys}`)));
    if (have.has(id)) return; // an eager line has these keys
    have.add(id);
    // (round 73) a line's words come with lazy-meta.js right after the first frame: '…' until then (Keys.add skips a line without words)
    Keys.add({ area: k.area, keys: k.keys, what: k.what || '…', sel: k.sel || null, run: () => load(g.name).then(() => { const e = stubKeys.get(id); if (e?.run && !e.run.__lazy) e.run(); }) });
    const e = Keys.all().at(-1);
    if (e && `${e.area}|${e.keys}` === id) { e.run.__lazy = true; if (!k.what) e.wordsLater = true; stubKeys.set(id, e); }
  }
  function stubBridge(g, prefix) {
    if (typeof HubBridge === 'undefined') return;
    HubBridge.register([prefix], async (tool, args, ctx) => {
      await load(g.name);
      const fn = realBridge.get(prefix);
      return fn ? fn(tool, args, ctx) : { ok: false, error: `Nothing in the hub handles ${tool}.` };
    });
  }
  function stubApp(g, a) {
    if (typeof Apps === 'undefined' || Apps.get(a.id)?.id === a.id) return;
    const real = () => { const x = Apps.get(a.id); return x && !x.__lazy ? x : null; };
    Apps.register({ ...a, __lazy: g.name,
      open: async (o) => { await load(g.name); const x = real(); if (!x) throw new Error(`${a.name} isn't available`); return x.open(o); },
      describe: () => `${a.name}${a.desc ? `: ${a.desc}` : ''}` });
  }
  function stubTool(g, t) {
    if (typeof Tools === 'undefined' || Tools.get(t.id)) return;
    const real = () => { const x = Tools.get(t.id); return x && x !== stub ? x : null; };
    const stub = {
      ...t, __lazy: g.name,
      // the surface counts as unmounted until the real tool is in, so tools.js doesn't dock a chat beside a tool that
      // isn't there yet (the director's dock hooks into the Lab when it attaches); then it mounts, docks, shows
      mount(body, head) {
        const s = H.surfaces?.get(`tool:${t.id}`);
        if (s) s.mounted = false;
        if (body.querySelector('.lazy-wait')) return;
        const wait = el('p', { class: 'hint lazy-wait', text: `Loading ${t.name}…` });
        body.append(wait);
        load(g.name).then(() => {
          wait.remove();
          const r = real();
          if (!r) return;
          // (bugbash) already mounted meanwhile (ThreeLab.cmd() → Tools.shown() with the real tool, while this load was
          // still settling): a second mount made a second, hidden Lab in the same body, two preview pages, and keys
          // from the visible preview went to the hidden one's pane
          if (s?.mounted) { if (s) s.tool = r; Tools.syncDocks?.(); return; }
          if (s) { s.tool = r; s.mounted = true; }
          r.mount(body, head);
          Tools.syncDocks?.();
          if (!s || H.surfaceIdFor?.(H.activeId) === s.el.dataset.id || H.grid) r.onShow?.();
        }).catch((err) => { wait.textContent = `${t.name} didn't load: ${calmError(err)}`; });
      },
      onShow() { real()?.onShow?.(); },
      commands: (t.commands || []).map((c) => ({ label: c.label, run: () => load(g.name).then(() => real()?.commands?.find((x) => x.label === c.label)?.run()) })),
    };
    Tools.define(stub);
    stubTools.set(t.id, stub);
  }
  // (never throws: a stand-in that fails is only a missing menu line, and the rest of the app must start)
  // Two moments, both where the group's files used to be (lazy-at.js): its commands and agent tools right there, its
  // rail tool, keys-sheet lines, palette actions and app windows at DOMContentLoaded, in the old order of handlers
  const each = (g, list, fn) => { for (const x of list || []) { try { fn(x); } catch (err) { say(`${g.name}: ${err.message}`); } } };
  function stubNow(g) {
    const m = groupMeta(g.name);
    each(g, (m.commands || []).filter((c) => !c.dcl), (c) => stubCommand(g, c));
    each(g, m.bridge, (p) => stubBridge(g, p));
  }
  // (what the palette / keys sheet already list, read once per moment: their lists are copied on every read)
  let seen = {};
  function stubLater(g) {
    if (g.state !== 'stub') return;
    seen = {};
    const m = groupMeta(g.name);
    each(g, (m.commands || []).filter((c) => c.dcl), (c) => stubCommand(g, c));
    each(g, m.tools, (t) => stubTool(g, t));
    each(g, m.keys, (k) => stubKey(g, k));
    each(g, m.actions, (a) => stubAction(g, a.label || a, a.keys));
    each(g, m.apps, (a) => stubApp(g, a));
  }
  // ---------- (round 52, lazymeta) the stand-ins' words come right after the first frame ----------
  // lazy-data.js (read before the first frame) keeps what a stand-in command is registered with: name, aliases, args,
  // area, keys…; its description, examples, keywords and undo line are in lazy-meta.js (LazyText, written by
  // dev/lazy-manifest.js), read once right after the first frame, before any group loads (load() waits for it), and put
  // into the stand-ins still waiting for their group. Lazy.text() → Promise (the same one each time).
  // (round 73, startfast73) + the commands' argument hints and the keys-sheet lines' words ('#keys': { 'area|keys': what })
  const TEXT_KEYS = ['desc', 'examples', 'keywords', 'undo', 'args'];
  const textOf = (group, name) => (typeof LazyText !== 'undefined' && LazyText[group]?.[name]) || null;
  let textP = null;
  function fillText() {
    let n = 0;
    for (const [key, name] of stubCmds) {
      const t = textOf(key.slice(0, key.indexOf('|')), name);
      const obj = t && stubSelf.get(key);
      if (!obj) continue;
      for (const k of TEXT_KEYS) if (t[k] != null && (obj[k] == null || obj[k] === '')) { obj[k] = t[k]; n += 1; }
    }
    for (const g of groups.values()) {
      const w = typeof LazyText !== 'undefined' && LazyText[g.name]?.['#keys'];
      if (w) for (const [id, what] of Object.entries(w)) { const e = stubKeys.get(id); if (e && (e.wordsLater || !e.what)) { e.what = what; delete e.wordsLater; } }
    }
    if (n) { try { Commands.addInfo?.({}); } catch { /* the search index rebuilds on its own */ } }
  }
  function text() {
    return (textP ||= inject('lazy-meta.js').then(fillText).catch((err) => say(`words: ${err.message}`)));
  }
  // The group's own files register the real commands: each fills in its stand-in's object in the registry (takeOver),
  // so names, aliases, shared `when` variants and their order stay exactly as the stand-ins laid them out. While they
  // load, Commands.get doesn't see the group's own stand-ins ("is /studio taken?" checks, alias filters).
  function takeOver(g, def) {
    const name = String(def?.name || '').toLowerCase();
    const key = `${g.name}|${name}`;
    const target = stubCmds.has(key) && stubSelf.get(key);
    if (!target) return null;
    Object.assign(target, { area: 'Other', desc: '', args: '', ...def, name, aliases: target.aliases, complete: def.complete, when: def.when });
    if (!def.when) delete target.when;
    delete target.__lazy;
    stubCmds.delete(key);
    try { Commands.addInfo?.({}); } catch { /* the search index rebuilds on its own */ }
    return () => unregs.get(key)?.();
  }
  // a stand-in the group didn't register this time (a condition at load): it goes (or, shared, never holds)
  function dropLeftovers(g) {
    for (const [key, name] of [...stubCmds]) {
      if (!key.startsWith(`${g.name}|`)) continue;
      stubCmds.delete(key);
      const self = stubSelf.get(key);
      if (Commands.get(name) === self) unregs.get(key)?.();
      else if (self) self.when = () => false;
      say(`/${name} (${g.name}) wasn't registered by its module`);
    }
  }

  // ---------- loading ----------
  // While a group's files run, the registries are patched so its registrations replace the stand-ins instead of adding
  // duplicates, and its DOMContentLoaded handlers (the page fired that long ago) run once its files are in.
  function patch(g, rep) {
    const undo = [];
    const swap = (obj, key, fn) => { if (!obj || typeof obj[key] !== 'function') return; const orig = obj[key]; const own = Object.prototype.hasOwnProperty.call(obj, key); obj[key] = fn(orig.bind(obj)); undo.push(() => { if (own) obj[key] = orig; else delete obj[key]; }); };
    const ready = [];
    const onLoad = (orig) => (type, fn, opts) => ((type === 'DOMContentLoaded' || type === 'load') && typeof fn === 'function' ? ready.push(fn) : orig(type, fn, opts));
    swap(window, 'addEventListener', onLoad);
    swap(document, 'addEventListener', onLoad);
    if (typeof Commands !== 'undefined') {
      // (the module registered these names where it used to load, before anything shared them: they read as free)
      swap(Commands, 'get', (orig) => (n) => { const d = orig(n); return d && (d.__lazy === g.name || d.variants?.some((v) => v.__lazy === g.name)) ? undefined : d; });
      swap(Commands, 'register', (orig) => (def) => {
        if (!def) return orig(def);
        rep.commands.push(cmdMeta(def));
        if (!def.name || typeof def.run !== 'function') return orig(def); // its own error, as before
        return takeOver(g, def) || orig(def);
      });
    }
    if (typeof AppUI !== 'undefined') swap(AppUI, 'addAction', (orig) => (label, run, keys) => {
      rep.actions.push(keys ? { label, keys } : label);
      if (AppUI.actions?.().some((a) => a.label === label)) { realActions.set(label, run); return undefined; }
      realActions.set(label, run);
      return orig(label, run, keys);
    });
    if (typeof Keys !== 'undefined') swap(Keys, 'add', (orig) => (...entries) => {
      const pass = [];
      for (const e of entries.flat()) {
        if (!e?.keys) continue;
        rep.keys.push({ area: e.area || 'General', keys: e.keys, what: e.what, ...(e.sel ? { sel: e.sel } : {}) });
        const s = stubKeys.get(`${e.area || 'General'}|${e.keys}`);
        if (s) Object.assign(s, { what: e.what, when: e.when || null, run: e.run || null, sel: e.sel || null }); else pass.push(e);
      }
      return pass.length ? orig(...pass) : undefined;
    });
    if (typeof HubBridge !== 'undefined') swap(HubBridge, 'register', (orig) => (prefixes, fn) => {
      const rest = [];
      for (const p of prefixes || []) { rep.bridge.push(p); if ((groupMeta(g.name).bridge || []).includes(p)) realBridge.set(p, fn); else rest.push(p); }
      return rest.length ? orig(rest, fn) : undefined;
    });
    // a stand-in (fallback or not) always gives way to the group's own registration; a fallback stays marked as one
    if (typeof Apps !== 'undefined') swap(Apps, 'register', (orig) => (def) => {
      if (!def || def.__lazy) return orig(def);
      rep.apps.push(appMeta(def));
      const prev = Apps.get(def.id);
      if (!(prev?.__lazy && prev.id === String(def.id).toLowerCase() && def.fallback)) return orig(def);
      const app = orig({ ...def, fallback: false });
      if (app) app.fallback = true;
      return app;
    });
    if (typeof Tools !== 'undefined') swap(Tools, 'define', (orig) => (tool) => { if (tool && !tool.__lazy) rep.tools.push({ id: tool.id, name: tool.name, icon: tool.icon, color: tool.color, description: tool.description || '', ...(tool.offRail ? { offRail: true } : {}), commands: (tool.commands || []).map((c) => ({ label: c.label })) }); return orig(tool); });
    return { ready, restore: () => { for (const u of undo.reverse()) u(); } };
  }
  const CMD_KEYS = ['name', 'aliases', 'args', 'desc', 'area', 'hidden', 'keys', 'examples', 'keywords', 'undo', 'whenLabel', 'fallback'];
  function cmdMeta(def) {
    const o = {};
    for (const k of CMD_KEYS) if (def[k] != null && def[k] !== '' && !(Array.isArray(def[k]) && !def[k].length)) o[k] = def[k];
    if (def.when) o.when = true;
    return o;
  }
  const APP_KEYS = ['id', 'name', 'icon', 'group', 'desc', 'url', 'partition', 'keywords', 'hosts', 'price', 'fits', 'hidden', 'fallback'];
  function appMeta(def) { const o = {}; for (const k of APP_KEYS) if (def[k] != null) o[k] = def[k]; return o; }

  function inject(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      // (handlers dropped once fired: nothing stays attached to the ~100 tags)
      s.onload = () => { s.onload = s.onerror = null; res(); };
      s.onerror = () => { s.onload = s.onerror = null; rej(new Error(`couldn't load ${src}`)); };
      document.head.append(s);
    });
  }
  // (round 29, fastboot) a big group's tags go in a few at a time, a task each (the Lab's 74 files were one ≈ 0.1–0.5 s
  // task right after the first frame); they still run in their order (async = false keeps insertion order)
  // (round 94, labload94) a group loading in the background (g.pace: Lazy.prefetch) goes 4 files at a time, each four
  // run before the next go in, in idle moments; any real use (a load asked without idle) puts it back at full speed
  const CHUNK = 8;
  const yieldTask = () => (globalThis.scheduler?.yield ? scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
  const idleWait = (g) => new Promise((r) => { g.wake = r; if (window.requestIdleCallback) requestIdleCallback(() => r(), { timeout: 1500 }); else setTimeout(r, 50); });
  async function injectAll(files, g) {
    const all = [];
    for (let i = 0; i < files.length; i += 1) {
      if (i && i % (g?.pace ? 4 : CHUNK) === 0) await (g?.pace ? Promise.all(all.slice(-4)).then(() => g.pace && idleWait(g), () => {}) : yieldTask());
      const p = inject(files[i]); p.catch(() => {}); // (Promise.all below reports a failure; no "unhandled" meanwhile)
      all.push(p);
    }
    return Promise.all(all);
  }
  function css(href, before) {
    if (document.querySelector(`link[rel=stylesheet][href="${href}"]`)) return Promise.resolve();
    return new Promise((res) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      l.onload = l.onerror = () => { l.onload = l.onerror = null; res(); };
      // after the eager sheets, before the user theme (<style id="user-theme"> keeps the last word); (round 19) a group's
      // `cssBefore` puts it back where index.html had it, so later sheets keep overriding it as before
      const at = (before && document.querySelector(`link[rel=stylesheet][href="${before}"]`)) || document.getElementById('user-theme');
      if (at) at.before(l); else document.head.append(l);
    });
  }

  function load(name, o) {
    const g = groups.get(name);
    if (!g) return Promise.reject(new Error(`No lazy group "${name}"`));
    if (!o?.idle) { for (const x of groups.values()) if (x.pace) { x.pace = null; x.wake?.(); } } else if (!g.promise) g.pace = 'idle';
    if (g.promise) return g.promise;
    g.by = (new Error().stack || '').split('\n').slice(2, 5).map((l) => l.trim().replace(/^at /, '').replace(/\(?file:\/\/\S*\/([^/]+:\d+):\d+\)?/, '$1')).join(' < '); // (round 94) who asked first (Lazy.by(name))
    g.promise = (async () => {
      for (const dep of g.after || []) await load(dep, o);
      const go = chain.then(text).then(async () => {
        g.state = 'loading';
        const t0 = performance.now();
        const rep = { commands: [], actions: [], keys: [], bridge: [], apps: [], tools: [] };
        reports.set(g.name, rep);
        const p = patch(g, rep);
        try {
          await Promise.all([...(g.css || []).map((h) => css(h, g.cssBefore)), injectAll(g.files, g)]);
          for (const fn of p.ready) { try { fn.call(window, new Event('DOMContentLoaded')); } catch (err) { console.error(err); } }
        } catch (err) {
          g.state = 'failed';
          p.restore();
          console.error(`Lazy: ${g.name}: ${err.message}`);
          throw err;
        }
        p.restore();
        dropLeftovers(g);
        if (D.META) delete D.META[g.name]; // its manifest isn't needed any more
        unguardGlobals(g);
        // a tool already on screen with the stand-in: the rail keeps the stand-in object (it hands over to the real one)
        g.state = 'loaded';
        g.pace = null;
        g.ms = Math.round(performance.now() - t0);
        g.at = Math.round(performance.now());
        dispatchEvent(new CustomEvent('hearth:lazy', { detail: { group: g.name } }));
      });
      chain = go.catch(() => {});
      return go;
    })();
    return g.promise;
  }

  // ---------- (round 29, fastboot) a group's own keys work before it's in ----------
  // g.keys: [{ key, code, mod (Ctrl/⌘), shift, typing: false (not while typing in a field), run(shift) }]: a press while
  // the group is still a stand-in loads it, then does what the key does; the hub's 'shortcut' messages (main.js: the
  // same keys pressed in the Lab's frame or a website) too. Once the group is in (or loading), its own handlers answer.
  function earlyKeys(g) {
    if (!g.keys?.length) return;
    const go = (k, shift) => load(g.name).then(() => k.run(shift)).catch((err) => say(`${g.name}: ${err.message}`));
    const typing = (t) => /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || '') || t?.isContentEditable;
    document.addEventListener('keydown', (e) => {
      if (g.state !== 'stub' || e.defaultPrevented || e.altKey) return; // (a press is a use: held groups load too)
      // (round 54, fixes54) the Mac's mod is ⌘ only (a real Control press is the text field's own: ⌃P moves the caret up),
      // and a key by the letter printed on it (AZERTY's M sits on QWERTY's ";": WinMac.layoutCode)
      const mac = /Mac/.test(navigator.platform || '');
      const modOn = mac ? e.metaKey : (e.ctrlKey || e.metaKey);
      if (mac && e.ctrlKey && !e.metaKey) return;
      let code = e.code; try { if (typeof WinMac !== 'undefined' && WinMac.layoutCode) code = WinMac.layoutCode(e, null, { mac }); } catch { /* as pressed */ }
      const k = g.keys.find((x) => (e.key.toLowerCase() === x.key.toLowerCase() || code === x.code) && Boolean(x.mod) === modOn
        && (x.shift == null || Boolean(x.shift) === e.shiftKey) && !(x.typing === false && typing(e.target)));
      if (!k) return;
      e.preventDefault(); e.stopPropagation();
      go(k, e.shiftKey);
    }, true);
    try { window.hub?.onShortcut?.((sc) => { if (g.state !== 'stub') return; const k = g.keys.find((x) => x.mod && x.key.toLowerCase() === String(sc?.key || '').toLowerCase() && (x.shift == null || Boolean(x.shift) === Boolean(sc.shift))); if (k) go(k, Boolean(sc.shift)); }); } catch { /* no hub */ }
  }

  // ---------- after the first screen: the 'soon' groups, one per idle moment ----------
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 30));
  // (round 83, idleburst83) a calm start: what you do first gets the computer. The asap groups (the Lab, the chat's own
  // commands…) and the ones that keep your work (safetynet: drafts / Lab work journaled from the first key) load right
  // after the first frame as before; every other 'soon' group waits until the start is over (CALM.after ms after the
  // first screen) AND nothing was typed / clicked / scrolled for CALM.quiet ms, or CALM.cap ms at most; then one at a
  // time, each in an idle moment, CALM.gap ms apart (they used to load back to back ~6 s in: the window and the main
  // process busy together for ~2 s, every start). Using a feature still loads its group at once (its stand-ins).
  // Lazy.calmNow() opens the gate (dev/smoke.js: checks start as they always did); localStorage 'lazy.calmMs' sets after.
  const CALM = { after: 10000, quiet: 3000, cap: 30000, gap: 120, open: false, last: 0, waiters: [] };
  try { const v = Number(localStorage.getItem('lazy.calmMs')); if (Number.isFinite(v) && localStorage.getItem('lazy.calmMs') !== null) CALM.after = Math.max(0, v); } catch { /* no storage */ }
  const KEEPS = new Set(['safetynet']);
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { CALM.last = performance.now(); }, { capture: true, passive: true });
  function calmGate() {
    if (CALM.open) return Promise.resolve();
    return new Promise((resolve) => {
      CALM.waiters.push(resolve);
      if (CALM.waiters.length > 1) return;
      const check = () => {
        if (CALM.open) return;
        const now = performance.now();
        const due = Math.max(readyAt + CALM.after, CALM.last + CALM.quiet);
        if (now >= due || now >= readyAt + CALM.cap) { openGate(); return; }
        setTimeout(check, Math.min(due, readyAt + CALM.cap) - now + 20);
      };
      check();
    });
  }
  function openGate() { if (CALM.open) return; CALM.open = true; for (const w of CALM.waiters.splice(0)) w(); }
  function soon() {
    const all = [...groups.values()].filter((g) => g.tier === 'soon');
    const early = (g) => g.asap || KEEPS.has(g.name);
    const queue = [...all.filter(early), ...all.filter((g) => !early(g))]; // (deps still load first: load() waits for g.after)
    let lastEnd = 0;
    const next = () => {
      const g = queue.shift();
      if (!g) return;
      // (round 20) not mid-gesture: a load waits for typing / a drag / a scroll to end (≤ 4 s; jank.js)
      // (round 29, fastboot) g.asap (the Lab, what you open most): right after the first frame, without waiting for an idle
      // moment (with a busy start those come seconds later); still never mid-gesture
      const go = () => (window.Jank?.calm?.(4000, 'feature load') ?? Promise.resolve()).then(() => (g.state === 'stub' ? load(g.name) : null)).catch(() => {}).finally(() => { lastEnd = performance.now(); next(); });
      if (g.asap) { go(); return; }
      if (KEEPS.has(g.name)) { idle(go); return; }
      calmGate().then(() => setTimeout(() => idle(go), CALM.open && !CALM.fast ? Math.max(0, CALM.gap - (performance.now() - lastEnd)) : 0));
    };
    next();
  }
  // a group asked for before the first screen is up waits for it (the first screen comes first), then goes first
  // (round 29, fastboot) and after the window's first frame: a module that peeks at a lazy global while it builds the
  // first screen (typeof ThreeLab) no longer has the whole group parsed in front of the first paint (the Lab: ≈ 0.4 s)
  const wanted = new Set();
  let painted = false;
  function want(g) {
    if (hold) return;
    if (painted) queueMicrotask(() => load(g.name).catch(() => {}));
    else wanted.add(g.name);
  }
  // one frame drawn (rAF, then the task after it), or 300 ms at most (a hidden window draws no frames)
  // (round 40, firstscreen) and that frame on screen (its 'paint' entry), ≤ 600 ms after it was made: on a busy CPU the
  // groups parsed right after the frame was made held back its drawing (first paint ≈ +75 ms on a reload here)
  function afterPaint(fn) {
    let done = false;
    let po = null;
    let t = 0;
    const go = () => { if (done) return; done = true; clearTimeout(t); try { po?.disconnect(); } catch { /* gone */ } fn(); };
    t = setTimeout(go, 300);
    const shown = () => performance.getEntriesByType('paint').length > 0;
    try {
      requestAnimationFrame(() => setTimeout(() => {
        if (done || shown()) { go(); return; }
        clearTimeout(t); t = setTimeout(go, 600);
        try { po = new PerformanceObserver(go); po.observe({ type: 'paint' }); } catch { go(); }
      }, 0));
    } catch { /* no frames */ }
  }
  // (tests: localStorage 'lazy.hold' = '1' keeps every group a stand-in until it's used, to prove first use works)
  let hold = false;
  try { hold = localStorage.getItem('lazy.hold') === '1'; } catch { /* no storage */ }
  // (round 94) a following group: once what it needs is in, after the calm start, in an idle moment
  addEventListener('hearth:lazy', () => {
    for (const f of groups.values()) if (f.follow === true && f.state === 'stub' && !f.promise && !hold && f.after.every((d) => groups.get(d)?.state === 'loaded')) { f.follow = 'due'; calmGate().then(() => idle(() => (f.state === 'stub' && !f.promise ? load(f.name) : null)?.catch(() => {}))); }
  });
  function start() {
    if (readyAt) return;
    readyAt = performance.now();
    try { namesAtReady = Commands.list().map((d) => d.name); } catch { /* no commands */ }
    if (hold) { afterPaint(text); return; }
    afterPaint(() => {
      painted = true;
      text();
      for (const n of wanted) load(n).catch(() => {});
      soon();
    });
  }

  // ---------- stand-ins ----------
  // index.html has a tiny <script src="lazy-at.js#lab"> where a group's files used to be: its stand-ins are registered
  // there (and its DOMContentLoaded ones queue there), so names, aliases and orders come out as before
  const placed = new Set();
  function at(names) {
    for (const n of String(names || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      const g = groups.get(n);
      if (!g || placed.has(n)) continue;
      placed.add(n);
      stubNow(g);
      addEventListener('DOMContentLoaded', () => stubLater(g), { once: true }); // (on window, like most modules' handlers: in their order)
    }
  }
  // a group without a lazy-at.js tag gets its stand-ins at the end
  document.addEventListener('DOMContentLoaded', () => { for (const g of groups.values()) if (!placed.has(g.name)) { placed.add(g.name); stubNow(g); stubLater(g); } }, { once: true });
  for (const g of groups.values()) { try { guardGlobals(g); earlyKeys(g); } catch (err) { say(`${g.name}: ${err.message}`); } }
  // start.js fires 'hearth:ready' once the first screen is up: the cue for the 'soon' groups
  addEventListener('hearth:ready', start, { once: true });
  // start.js never got there (an error during startup): don't leave the features unloaded
  addEventListener('DOMContentLoaded', () => setTimeout(start, 6000), { once: true });
  const state = () => [...groups.values()].map((g) => ({ name: g.name, tier: g.tier, state: g.state, files: g.files.length, ms: g.ms ?? null, at: g.at ?? null, ...(g.prefetch ? { prefetch: true, pace: g.pace || null } : {}), ...(g.follow ? { follow: true } : {}) }));
  return {
    load, state, start, at, text,
    // (round 94, labload94) prefetch(name): load it in the background, paced (lab-intent.js decides when) · groupOfAction(label)
    prefetch: (name) => load(name, { idle: true }), groupOfAction: (label) => actOf.get(label) || null, by: (name) => groups.get(name)?.by || null,
    calmNow: () => { CALM.fast = true; openGate(); }, // (round 83) the rest of the 'soon' groups now, back to back (tests)
    calm: () => ({ open: CALM.open, after: CALM.after, quiet: CALM.quiet, waiting: [...groups.values()].filter((g) => g.tier === 'soon' && g.state === 'stub').length }),
    loaded: (name) => groups.get(name)?.state === 'loaded',
    // (round 29) in yet, without asking for it: false while the group is a stand-in or loading (true for a name that
    // isn't lazy). For code that only decorates a lazy feature (`Lazy.isIn('lab') && ThreeLab…`): no miss, no load
    isIn: (name) => !groups.has(name) || groups.get(name).state === 'loaded',
    // when(group, fn): fn() now if the group is in (or isn't lazy), else once it has loaded; for hooks an eager module
    // puts into a lazy one (window.Lazy?.when('lab', () => ThreeSeq.on(…)) ?? …)
    when(name, fn) {
      const g = groups.get(name);
      if (!g || g.state === 'loaded') { fn(); return; }
      const on = (e) => { if (e.detail?.group !== name) return; removeEventListener('hearth:lazy', on); try { fn(); } catch (err) { console.error(err); } };
      addEventListener('hearth:lazy', on);
    },
    groupOf: (cmd) => { const n = String(cmd || '').toLowerCase(); for (const [k, v] of stubCmds) if (v === n) return k.split('|')[0]; return null; },
    misses: () => missLog.slice(),
    namesAtReady: () => namesAtReady && namesAtReady.slice(),
    report: (name) => (name ? reports.get(name) : Object.fromEntries(reports)),
    loadAll: () => Promise.all([...groups.keys()].map((n) => load(n).catch((err) => ({ name: n, error: err.message })))),
    groups: () => [...groups.values()].map((g) => ({ name: g.name, files: g.files.slice(), css: (g.css || []).slice(), tier: g.tier })),
  };
})();
window.Lazy = Lazy; // window.Lazy?.… works from anywhere, even if this file never loaded
