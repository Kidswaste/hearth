// dev/lazy-manifest.js puts this in a throwaway copy of index.html (after commands.js, apps.js and appui.js) where the
// lazy groups' files are back at their original places: it notes what each group's files register until the first
// screen is up (by the file in the call stack), which is what lazy.js's stand-ins must offer from the start.
(() => {
  const R = (window.__lazyRec ||= { files: new Map(), out: {}, wrapped: new Set(), on: true });
  if (!R.files.size && typeof LazyData !== 'undefined') for (const g of LazyData.GROUPS) for (const f of g.files) R.files.set(f, g.name);
  const groupOf = () => {
    for (const line of (new Error().stack || '').split('\n').slice(2)) {
      const m = line.match(/file:\/\/\S*?\/hearth-[^/]+\/(.+?):\d+:\d+/) || line.match(/file:\/\/\S+?\/([^/]+?\.js):\d+:\d+/);
      if (!m) continue;
      const rel = m[1].replace(/^.*?\/(tools\/[^/]+)$/, '$1');
      const g = R.files.get(rel) || R.files.get(rel.split('/').pop());
      if (g) return g;
    }
    return null;
  };
  const rep = (g) => (R.out[g] ||= { commands: [], actions: [], keys: [], bridge: [], apps: [], tools: [] });
  const CMD_KEYS = ['name', 'aliases', 'args', 'desc', 'area', 'hidden', 'keys', 'examples', 'keywords', 'undo', 'whenLabel', 'fallback'];
  const APP_KEYS = ['id', 'name', 'icon', 'group', 'desc', 'url', 'partition', 'keywords', 'hosts', 'price', 'fits', 'hidden', 'fallback'];
  const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] != null && o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length)) r[k] = o[k]; return r; };
  const wrap = (name, obj, key, note) => {
    if (!obj || R.wrapped.has(name) || typeof obj[key] !== 'function') return;
    R.wrapped.add(name);
    const orig = obj[key];
    obj[key] = function (...a) {
      const g = R.on ? groupOf() : null;
      const out = orig.apply(this, a);
      if (g) { try { note(rep(g), a, out); } catch (err) { console.warn('lazy-record', err); } }
      return out;
    };
  };
  // (no eval under the page's CSP: each registry by name)
  const REG = {
    Commands: () => (typeof Commands !== 'undefined' ? Commands : null), Keys: () => (typeof Keys !== 'undefined' ? Keys : null),
    HubBridge: () => (typeof HubBridge !== 'undefined' ? HubBridge : null), Tools: () => (typeof Tools !== 'undefined' ? Tools : null),
    AppUI: () => (typeof AppUI !== 'undefined' ? AppUI : null), Apps: () => (typeof Apps !== 'undefined' ? Apps : null),
  };
  const G = (n) => REG[n]();
  // commands: what ended up registered under the name (the record keeps the def as given)
  wrap('Commands', G('Commands'), 'register', (r, [def]) => { const d = { ...pick(def, CMD_KEYS) }; if (def.when) d.when = true; r.commands.push(d); });
  wrap('Keys', G('Keys'), 'add', (r, entries) => { for (const e of entries.flat()) if (e?.keys) r.keys.push({ area: e.area || 'General', keys: e.keys, what: e.what, ...(e.sel ? { sel: e.sel } : {}) }); });
  wrap('HubBridge', G('HubBridge'), 'register', (r, [prefixes]) => r.bridge.push(...(prefixes || [])));
  wrap('Tools', G('Tools'), 'define', (r, [t]) => r.tools.push({ id: t.id, name: t.name, icon: t.icon, color: t.color, description: t.description || '', commands: (t.commands || []).map((c) => ({ label: c.label })) }));
  wrap('AppUI', G('AppUI'), 'addAction', (r, [label, , keys]) => r.actions.push(keys ? { label, keys } : label));
  wrap('Apps', G('Apps'), 'register', (r, [def]) => r.apps.push(pick(def, APP_KEYS)));
  if (!R.stop) { R.stop = true; addEventListener('hearth:ready', () => { R.on = false; }, { once: true }); }
})();
