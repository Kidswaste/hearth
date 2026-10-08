// Look: theme presets (AppUI.THEMES), the Forgeheart 2 materials and the appearance toggles (textures, glow,
// motion, density, corners, accent, chat font, forged tooltips). Everything is reachable from Settings → Appearance,
// the Ctrl+K palette and chat commands (/theme, /themes, /look, /texture, /glow, /motion, /density, /corners,
// /accent, /chatfont, /tips, /sparkles, /classic). Presentation only: config.json → theme.preset and theme.fx hold
// the choices, look.css draws them through <html data-look / data-tex / data-motion / data-density / data-corners>.
const Look = (() => {
  const root = document.documentElement;
  const DEFAULTS = { texture: true, glow: 50, motion: 'full', density: 'normal', corners: 'cut', accent: '', chatfont: 'game', tips: true };
  const CHOICES = {
    motion: [['full', 'Full'], ['calm', 'Calm'], ['off', 'Off']],
    density: [['compact', 'Compact'], ['normal', 'Normal'], ['comfortable', 'Roomy']],
    corners: [['cut', 'Cut'], ['round', 'Round'], ['square', 'Square']],
    chatfont: [['game', 'Oxanium'], ['clean', 'Clean']],
  };
  const READ_FONTS = { clean: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" };
  const NAMED = { gold: '#ffc23d', ember: '#ff7a1a', orange: '#ff8c42', violet: '#a970ff', purple: '#a970ff', magenta: '#ff3ddc', pink: '#ff4f8b', red: '#ff4b4b', cyan: '#48ddff', blue: '#56c6ff', mint: '#5cf2c5', green: '#5ee08f', lime: '#b6f24a', silver: '#c9ced3', white: '#ffffff', copper: '#e3965c', rose: '#f2a7a0' };
  const GROUPS = ['Forgeheart', 'Bold', 'Light', 'Plain'];
  let applied = []; // CSS variables we set inline on <html>

  const themes = () => AppUI.THEMES;
  const presetId = () => H.config?.theme?.preset || '';
  const preset = () => themes()[presetId()] || null;
  const fx = () => ({ ...DEFAULTS, ...(preset()?.fx || {}), ...(H.config?.theme?.fx || {}) });
  const setAttr = (name, value) => { if (value) root.setAttribute(name, value); else root.removeAttribute(name); };
  const ids = () => Object.keys(themes());

  // ---------- applying ----------
  function apply() {
    const p = preset();
    const f = fx();
    setAttr('data-look', p?.look || '');
    setAttr('data-tex', f.texture ? '' : 'off');
    setAttr('data-motion', f.motion === 'full' ? '' : f.motion);
    setAttr('data-density', f.density === 'normal' ? '' : f.density);
    setAttr('data-corners', f.corners === 'cut' ? '' : f.corners);
    for (const k of applied) root.style.removeProperty(k);
    const vars = { ...(p?.vars || {}), '--glow': String(Math.max(0, Math.min(100, Number(f.glow) || 0)) / 50) };
    if (f.accent) vars['--fh-gold'] = f.accent;
    if (READ_FONTS[f.chatfont]) vars['--font-read'] = READ_FONTS[f.chatfont];
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    applied = Object.keys(vars);
    refresh();
  }
  // renderer.js applyTheme() writes data-skin on every config load: that's our cue
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-skin'] });

  // saved right away: the config file watcher reloads whatever was written last, so a delayed save could lose a change
  const save = () => saveConfig();
  function setFx(patch) {
    const theme = H.config.theme || (H.config.theme = {});
    const next = { ...(theme.fx || {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    theme.fx = next;
    apply();
    save();
  }

  function applyPreset(id, { quiet = false } = {}) {
    const t = themes()[id];
    if (!t) return false;
    const { label, group, look, vars, fx: presetFx, ...base } = t;
    const accent = H.config.theme?.fx?.accent;
    H.config.theme = { ...H.config.theme, ...base, preset: id };
    if (accent) H.config.theme.accent = accent;
    applyTheme($('user-theme')?.textContent || '');
    apply();
    saveConfig();
    if (!quiet) toast(`Look: ${label}`, { timeout: 1400 });
    return true;
  }

  // ---------- your saved looks (config.json → theme.saved: { name: { preset, fx } }) ----------
  const saved = () => H.config?.theme?.saved || {};
  const savedKey = (name) => Object.keys(saved()).find((k) => k.toLowerCase() === String(name || '').trim().toLowerCase());
  function saveLook(name) {
    const n = String(name || '').trim().slice(0, 40);
    if (!n) throw new Error('Name it: /look save <name>');
    if (!presetId()) throw new Error('Pick a preset first (/theme), then save your tweaks on top of it');
    H.config.theme.saved = { ...saved(), [savedKey(n) || n]: { preset: presetId(), fx: { ...(H.config.theme.fx || {}) } } };
    save();
    refresh();
    return `Saved this look as "${n}" (/look load ${n})`;
  }
  function loadLook(name, { quiet = true } = {}) {
    const k = savedKey(name);
    if (!k) return false;
    const { preset: id, fx: f = {} } = saved()[k];
    if (!themes()[id]) throw new Error(`"${k}" was built on a preset that no longer exists`);
    H.config.theme.fx = { ...f };
    applyPreset(id, { quiet: true });
    if (f.accent) { H.config.theme.accent = f.accent; applyTheme($('user-theme')?.textContent || ''); apply(); save(); }
    if (!quiet) toast(`Look: ${k}`, { timeout: 1400 });
    return k;
  }
  function deleteLook(name) {
    const k = savedKey(name);
    if (!k) throw new Error(`No saved look called "${name}"`);
    const next = { ...saved() };
    delete next[k];
    H.config.theme.saved = next;
    save();
    refresh();
    return `Deleted "${k}"`;
  }

  // "chrome forge", "Chrome-Forge", "chromeforge", "chrome" → 'chrome-forge'
  function resolve(name) {
    const squash = (x) => String(x || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
    const q = squash(name);
    if (!q) return null;
    const list = Object.entries(themes());
    const hit = list.find(([id, t]) => squash(id) === q || squash(t.label) === q)
      || list.find(([id, t]) => squash(id).startsWith(q) || squash(t.label).startsWith(q))
      || list.find(([id, t]) => squash(t.label).includes(q));
    return hit ? hit[0] : null;
  }
  function cycle(step) {
    const all = ids();
    const i = all.indexOf(presetId());
    return all[(i + step + all.length) % all.length];
  }

  function color(value) {
    const v = String(value || '').trim().toLowerCase();
    if (NAMED[v]) return NAMED[v];
    if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/.test(v)) return v.startsWith('#') ? v : `#${v}`;
    return CSS.supports('color', v) ? v : null;
  }
  function setAccent(value) {
    if (!value || /^(reset|off|none|default)$/i.test(value)) {
      const t = preset();
      setFx({ accent: undefined });
      if (t) { H.config.theme.accent = t.accent; applyTheme($('user-theme')?.textContent || ''); saveConfig(); }
      return 'Accent back to the preset\'s own.';
    }
    const c = color(value);
    if (!c) throw new Error(`"${value}" isn't a color (try #ff8c42, ember, violet, mint…)`);
    H.config.theme.accent = c;
    setFx({ accent: c });
    applyTheme($('user-theme')?.textContent || '');
    return `Accent → ${c}`;
  }

  // ---------- the picker (Settings → Appearance and the /look dialog) ----------
  const pickers = new Set();
  function refresh() { for (const p of pickers) { if (p.isConnected) p.refresh(); else pickers.delete(p); } }
  const swatch = (t) => {
    const v = t.vars || {};
    return el('span', { class: 'look-sw' },
      el('i', { style: { background: `linear-gradient(160deg, ${v['--fh-iron-1'] || t.sidebar}, ${t.background})` } }),
      el('i', { style: { background: v['--fh-gold'] || t.accent } }),
      el('i', { style: { background: t.look ? (v['--fh-heat'] || v['--fh-ai'] || '#a970ff') : t.text } }));
  };
  function seg(key, options, title, parse = (v) => v) {
    const box = el('span', { class: 'seg', title });
    for (const [value, label] of options) {
      box.append(el('button', { type: 'button', text: label, dataset: { value }, on: { click: () => setFx({ [key]: parse(value) }) } }));
    }
    box.sync = () => { const cur = String(fx()[key]); for (const b of box.children) b.classList.toggle('on', b.dataset.value === cur); };
    return box;
  }
  function picker() {
    const search = el('input', { type: 'search', placeholder: 'Find a look…' });
    const now = el('span', { class: 'look-now' });
    const grid = el('div', { class: 'look-grid' });
    const tiles = [];
    const mine = el('div', { class: 'look-mine' });
    const fillMine = () => {
      const names = Object.keys(saved());
      mine.replaceChildren(...(names.length ? [el('div', { class: 'look-group', text: 'Yours' }), ...names.map((n) => {
        const t = themes()[saved()[n].preset] || {};
        return el('button', { type: 'button', class: 'look-tile mine', title: `${n} (${t.label || '?'} + your tweaks) · /look load ${n} · right-click to delete`, dataset: { saved: n },
          on: { click: () => loadLook(n, { quiet: false }), contextmenu: (e) => { e.preventDefault(); Modal.confirm(`Delete the look "${n}"?`, 'Only your saved tweaks go; the preset stays.', { ok: 'Delete', danger: true }).then((ok) => { if (ok) deleteLook(n); }); } } },
        swatch({ ...t, accent: saved()[n].fx?.accent || t.accent }), el('span', { text: n }));
      })] : []));
    };
    grid.append(mine);
    for (const g of GROUPS) {
      const items = Object.entries(themes()).filter(([, t]) => (t.group || 'Plain') === g);
      if (!items.length) continue;
      const head = el('div', { class: 'look-group', text: g });
      grid.append(head);
      for (const [id, t] of items) {
        const tile = el('button', { type: 'button', class: 'look-tile', title: `${t.label}  ·  /theme ${id}`, dataset: { id }, on: { click: () => applyPreset(id) } }, swatch(t), el('span', { text: t.label.replace(/ \(.*\)$/, '') }));
        tile.head = head;
        tiles.push(tile);
        grid.append(tile);
      }
    }
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const tile of tiles) tile.hidden = q && !`${tile.title} ${tile.dataset.id}`.toLowerCase().includes(q);
      for (const head of grid.querySelectorAll('.look-group')) head.hidden = Boolean(q) && !tiles.some((t) => t.head === head && !t.hidden);
    });
    const bool = (v) => v === 'true';
    const tex = seg('texture', [['true', 'On'], ['false', 'Off']], 'Brushed metal, grain and glass (/texture)', bool);
    const glow = el('input', { type: 'range', min: 0, max: 100, step: 5, title: 'Glow intensity (/glow 0-100)', on: { input: () => setFx({ glow: Number(glow.value) }) } });
    const motion = seg('motion', CHOICES.motion, 'Ambient animation (/motion)');
    const density = seg('density', CHOICES.density, 'Spacing (/density)');
    const corners = seg('corners', CHOICES.corners, 'Corner style (/corners)');
    const font = seg('chatfont', CHOICES.chatfont, 'Font for chat text (/chatfont)');
    const tips = seg('tips', [['true', 'On'], ['false', 'Off']], 'Forged tooltips (/tips)', bool);
    const accentIn = el('input', { type: 'color', title: 'Accent color (/accent)', on: { input: debounce(() => setAccent(accentIn.value), 150) } });
    const accentReset = el('button', { type: 'button', class: 'ghost small', text: 'Reset', title: 'Back to the preset\'s accent', on: { click: () => setAccent('reset') } });
    const ctl = el('div', { class: 'look-ctl' },
      el('span', { text: 'Textures' }), tex, el('span', { text: 'Glow' }), glow,
      el('span', { text: 'Motion' }), motion, el('span', { text: 'Density' }), density,
      el('span', { text: 'Corners' }), corners, el('span', { text: 'Chat font' }), font,
      el('span', { text: 'Accent' }), el('span', { class: 'look-accent' }, accentIn, accentReset), el('span', { text: 'Tooltips' }), tips);
    const box = el('div', { class: 'look-picker' }, el('div', { class: 'look-top' }, search, now), grid, ctl);
    box.refresh = () => {
      const f = fx();
      const t = preset();
      now.replaceChildren('Now: ', el('b', { text: t ? t.label.replace(/ \(.*\)$/, '') : 'Custom' }));
      for (const tile of tiles) tile.classList.toggle('on', tile.dataset.id === presetId());
      fillMine();
      for (const s of [tex, motion, density, corners, font, tips]) s.sync();
      if (document.activeElement !== glow) glow.value = f.glow;
      accentIn.value = /^#[0-9a-f]{6}$/i.test(f.accent || H.config?.theme?.accent || '') ? (f.accent || H.config.theme.accent) : '#ffc23d';
      accentReset.disabled = !f.accent;
    };
    box.refresh();
    pickers.add(box);
    requestAnimationFrame(() => grid.querySelector('.look-tile.on')?.scrollIntoView({ block: 'nearest' }));
    return box;
  }
  function openDialog() {
    document.querySelector('dialog.look-dialog')?.close();
    const dialog = el('dialog', { class: 'ui-modal look-dialog' });
    dialog.append(el('form', { method: 'dialog' }, el('h2', { text: 'Appearance' }), picker(),
      el('div', { class: 'dialog-actions' }, el('button', { type: 'button', class: 'ghost small', text: 'Save as…', title: 'Keep this preset + your tweaks under a name (/look save <name>)',
        on: { click: async () => { const n = await Modal.prompt('Save this look as', { placeholder: 'e.g. Night session' }); if (n) toast(saveLook(n), { timeout: 1600 }); } } }),
      el('span', { class: 'hint', text: '/theme name · /themes · /look reset · Ctrl+Shift+L' }), el('span', { class: 'spacer' }),
        el('button', { type: 'submit', class: 'primary', text: 'Done' }))));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  // ---------- chat commands ----------
  const area = 'Look';
  const onOff = (v, cur) => (/^(on|yes|true|1)$/i.test(v) ? true : /^(off|no|false|0)$/i.test(v) ? false : !cur);
  const pick = (key, value) => {
    const opts = CHOICES[key].map(([v]) => v);
    const v = String(value || '').toLowerCase();
    const hit = opts.find((o) => o.startsWith(v)) || (key === 'density' && /^room/.test(v) ? 'comfortable' : null);
    if (!v) { const i = opts.indexOf(String(fx()[key])); return opts[(i + 1) % opts.length]; }
    if (!hit) throw new Error(`Choose ${opts.join(', ')}`);
    return hit;
  };
  const opts = (key) => () => CHOICES[key].map(([value, label]) => ({ value, label: `${value}`, hint: label }));
  const label = (id) => themes()[id]?.label || id;
  function themeList() {
    const cur = presetId();
    return GROUPS.map((g) => {
      const rows = Object.entries(themes()).filter(([, t]) => (t.group || 'Plain') === g)
        .map(([id, t]) => `${id === cur ? '▸ ' : '  '}${id.padEnd(16)} ${t.label}`);
      return rows.length ? `${g}\n${rows.join('\n')}` : '';
    }).filter(Boolean).concat(Object.keys(saved()).length ? [`Yours\n${Object.entries(saved()).map(([n, v]) => `  ${n.padEnd(16)} ${label(v.preset)} + your tweaks`).join('\n')}`] : []).join('\n\n');
  }
  function status() {
    const f = fx();
    return `Look: ${preset()?.label || 'custom'} · textures ${f.texture ? 'on' : 'off'} · glow ${f.glow} · motion ${f.motion} · density ${f.density} · corners ${f.corners}${f.accent ? ` · accent ${f.accent}` : ''} · chat font ${f.chatfont} · tooltips ${f.tips ? 'on' : 'off'}`;
  }
  function register() {
    if (typeof Commands === 'undefined') return;
    // suggestions narrow to what's typed after the command
    const narrow = (fn) => fn && ((args, ctx) => {
      const q = String(args || '').trim().toLowerCase();
      return fn(args, ctx).filter((o) => !q || `${o.value} ${o.hint || ''}`.toLowerCase().includes(q));
    });
    const reg = (def) => Commands.register({ area, ...def, complete: narrow(def.complete) });
    reg({
      name: 'theme', aliases: ['skin'], override: true, /* replaces the chat stream's simpler /theme */ args: '<name | next | prev | random>', desc: 'Switch the look (Forgeheart, Classic, Chrome Forge, Molten…)',
      complete: () => [...ids().map((id) => ({ value: id, label: id, hint: label(id) })), { value: 'next', hint: 'Next preset' }, { value: 'prev', hint: 'Previous preset' }, { value: 'random', hint: 'Surprise me' }],
      run: (args) => {
        const a = args.trim().toLowerCase();
        if (!a) return `${status()}\nType /theme <name> or /themes for the list.`;
        let id = a === 'next' ? cycle(1) : a === 'prev' || a === 'previous' ? cycle(-1) : null;
        if (a === 'random' || a === 'shuffle') { const all = ids().filter((x) => x !== presetId()); id = all[Math.floor(Math.random() * all.length)]; }
        if (!id && savedKey(a)) return `Look → ${loadLook(a)} (yours)`;
        id = id || resolve(a);
        if (!id) throw new Error(`No look called "${args}". /themes lists them.`);
        applyPreset(id, { quiet: true });
        return `Look → ${label(id)}`;
      },
    });
    reg({ name: 'themes', desc: 'List every look preset (▸ = current)', run: () => `${themeList()}\n\n/theme <name> switches · /appearance (or /look outside the Lab) opens the picker` });
    // /look is shared with the Three.js Lab's saved looks (the Lab's wins in the Lab and its docked chats);
    // /appearance is always this one.
    const lookDef = {
      name: 'appearance', args: '[reset | status | save <name> | load <name> | delete <name>]', desc: 'Open the Appearance picker (presets, textures, glow, motion…)',
      complete: () => [{ value: 'reset', hint: 'Textures, glow, motion, density, corners and accent back to the preset' }, { value: 'status', hint: 'What is set now' },
        { value: 'save ', hint: 'Keep this preset + your tweaks under a name' }, ...Object.keys(saved()).flatMap((n) => [{ value: `load ${n}`, hint: 'Your look' }, { value: `delete ${n}`, hint: 'Forget it' }])],
      run: (args) => {
        const a = args.trim().toLowerCase();
        const m = args.trim().match(/^(save|load|delete|remove)\s+(.+)$/i);
        if (m && /save/i.test(m[1])) return saveLook(m[2]);
        if (m && /load/i.test(m[1])) { const k = loadLook(m[2]); if (!k) throw new Error(`No saved look called "${m[2]}"`); return `Look → ${k}`; }
        if (m) return deleteLook(m[2]);
        if (a === 'reset') { const accent = fx().accent; H.config.theme.fx = {}; if (accent && preset()) H.config.theme.accent = preset().accent; applyTheme($('user-theme')?.textContent || ''); saveConfig(); return `Appearance toggles reset. ${status()}`; }
        if (a === 'status' || a === 'now') return status();
        openDialog();
        return '';
      },
    };
    reg(lookDef);
    reg({ ...lookDef, name: 'look' });
    reg({ name: 'classic', args: '[off]', desc: 'Forgeheart Classic (the original look); /classic off → Forgeheart',
      run: (args) => {
        const id = /^(off|no|new)$/i.test(args.trim()) ? 'forgeheart' : 'classic';
        applyPreset(id, { quiet: true });
        const tweaks = Object.keys(H.config.theme.fx || {}).length;
        return `Look → ${label(id)}${tweaks ? ' (your tweaks still apply: /look reset for the exact original)' : ''}`;
      } });
    reg({ name: 'texture', aliases: ['textures'], args: 'on | off', desc: 'Brushed metal, grain and glass on or off',
      complete: () => [{ value: 'on' }, { value: 'off' }],
      run: (args) => { const v = onOff(args.trim(), fx().texture); setFx({ texture: v }); return `Textures ${v ? 'on' : 'off'}`; } });
    reg({ name: 'glow', args: '<0-100 | + | ->', desc: 'Glow intensity (0 flat … 50 default … 100 blazing)',
      complete: () => [0, 25, 50, 75, 100].map((n) => ({ value: String(n) })),
      run: (args) => {
        const a = args.trim(); const cur = Number(fx().glow);
        const v = a === '+' ? cur + 10 : a === '-' ? cur - 10 : a ? Number(a.replace('%', '')) : null;
        if (v == null) return `Glow ${cur} (try /glow 80)`;
        if (!Number.isFinite(v)) throw new Error('Give a number from 0 to 100');
        const n = Math.max(0, Math.min(100, Math.round(v)));
        setFx({ glow: n });
        return `Glow ${n}`;
      } });
    reg({ name: 'motion', args: 'full | calm | off', desc: 'Animation: full, calm (no ambient loops) or off', complete: opts('motion'),
      run: (args) => { const v = pick('motion', args.trim()); setFx({ motion: v }); return `Motion ${v}`; } });
    reg({ name: 'density', args: 'compact | normal | comfortable', desc: 'Spacing and text size', complete: opts('density'),
      run: (args) => { const v = pick('density', args.trim()); setFx({ density: v }); return `Density ${v}`; } });
    reg({ name: 'corners', args: 'cut | round | square', desc: 'Corner style: forge cut, rounded or square', complete: opts('corners'),
      run: (args) => { const v = pick('corners', args.trim()); setFx({ corners: v }); return `Corners ${v}`; } });
    reg({ name: 'accent', args: '<color | reset>', desc: 'Your own accent (the "active" gold): #hex or ember, violet, mint…',
      complete: () => [...Object.entries(NAMED).map(([value, hex]) => ({ value, hint: hex })), { value: 'reset', hint: 'Preset accent' }],
      run: (args) => setAccent(args.trim()) });
    reg({ name: 'chatfont', args: 'game | clean', desc: 'Chat text in Oxanium (game) or a clean system font', complete: opts('chatfont'),
      run: (args) => { const v = pick('chatfont', args.trim()); setFx({ chatfont: v }); return `Chat font: ${v === 'clean' ? 'clean system font' : 'Oxanium'}`; } });
    reg({ name: 'tips', aliases: ['tooltips'], args: 'on | off', desc: 'Forged tooltips instead of the system ones', complete: () => [{ value: 'on' }, { value: 'off' }],
      run: (args) => { const v = onOff(args.trim(), fx().tips); setFx({ tips: v }); return `Forged tooltips ${v ? 'on' : 'off'}`; } });
    reg({ name: 'sparkles', aliases: ['juice'], args: 'on | off', desc: 'Click sparks, glints and embers on or off', complete: () => [{ value: 'on' }, { value: 'off' }],
      run: (args) => {
        const on = onOff(args.trim(), store.get('juice.off', false));
        store.set('juice.off', !on); root.toggleAttribute('data-calm', !on);
        return `Sparkles ${on ? 'on ✦' : 'off'}`;
      } });
  }

  // ---------- start ----------
  function init() {
    register();
    AppUI.addAction('Appearance: looks, textures, glow, motion…', openDialog);
    AppUI.addAction('Theme: next look', () => applyPreset(cycle(1)));
    AppUI.addAction('Theme: random look', () => { const all = ids().filter((x) => x !== presetId()); applyPreset(all[Math.floor(Math.random() * all.length)]); });
    AppUI.addAction('Textures on / off', () => { const v = !fx().texture; setFx({ texture: v }); toast(`Textures ${v ? 'on' : 'off'}`, { timeout: 1200 }); });
    AppUI.addAction('Motion: full → calm → off', () => { const v = pick('motion', ''); setFx({ motion: v }); toast(`Motion ${v}`, { timeout: 1200 }); });
    AppUI.addAction('Density: compact → normal → roomy', () => { const v = pick('density', ''); setFx({ density: v }); toast(`Density ${v}`, { timeout: 1200 }); });
    AppUI.addAction('Corners: cut → round → square', () => { const v = pick('corners', ''); setFx({ corners: v }); toast(`Corners ${v}`, { timeout: 1200 }); });
    // Forgeheart users still on the first Forgeheart colors move to the new ones once (Classic keeps them).
    const once = () => {
      const t = H.config?.theme;
      if (!t) return setTimeout(once, 300);
      if (!store.get('look.v2', false) && t.preset === 'forgeheart' && t.background === '#0b0e10') applyPreset('forgeheart', { quiet: true });
      store.set('look.v2', true);
    };
    once();
  }
  // Ctrl+Shift+L (⌘⇧L on a Mac): the Appearance picker
  addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyL') { e.preventDefault(); if (document.querySelector('dialog.look-dialog')) document.querySelector('dialog.look-dialog').close(); else openDialog(); }
  });
  init();

  return { apply, applyPreset, setFx, fx, picker, openDialog, resolve, status, setAccent, saveLook, loadLook, deleteLook };
})();
