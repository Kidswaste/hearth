// (round 160, boot160) The Appearance picker (Settings → Appearance and the /appearance dialog, Ctrl/⌘+Shift+L), out
// of look.js: the first frame only applies the look (look.js), the picker is read the first time it opens (lazy group
// 'lookpicker'; Settings' dialogs load it first: appdialogs after lookpicker). Look.picker / Look.openDialog hand over to it.
const LookPicker = (() => {
  const root = document.documentElement;
  const { themes, presetId, preset, fx, setFx, applyPreset, saved, saveLook, loadLook, deleteLook, setAccent, CHOICES, GROUPS, FEATURED, pickers } = Look._kit;
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
  // (round 39, settingscalm) picker({ split: true }): Settings shows the three looks on one row (box) and folds the
  // rest (box.rest: Now / Match my computer / Let Astra pick, yours, every look, the tweaks shown at once: the fold is
  // their "Advanced" already). The Appearance dialog keeps the whole picker.
  function picker({ split = false } = {}) {
    const search = el('input', { type: 'search', placeholder: 'Find a look…' });
    const now = el('span', { class: 'look-now' });
    const grid = el('div', { class: 'look-grid' });
    const tiles = [];
    const mine = el('div', { class: 'look-mine' });
    const fillMine = () => {
      const names = Object.keys(saved());
      mine.replaceChildren(...(names.length ? [el('div', { class: 'look-group', text: 'Yours' }), ...names.map((n) => {
        const t = themes()[saved()[n].preset] || {};
        return el('button', { type: 'button', class: 'look-tile mine', title: `${n} (${t.label || '?'} + your tweaks) · right-click to delete`, dataset: { saved: n },
          on: { click: () => loadLook(n, { quiet: false }), contextmenu: (e) => { e.preventDefault(); Modal.confirm(`Delete the look "${n}"?`, 'Only your saved tweaks go; the preset stays.', { ok: 'Delete', danger: true }).then((ok) => { if (ok) deleteLook(n); }); } } },
        swatch({ ...t, accent: saved()[n].fx?.accent || t.accent }), el('span', { text: n }));
      })] : []));
    };
    // Round 4: three looks up front (Forgeheart, Classic, one light) plus the one you're on; the other presets
    // wait under "More looks" (searchable), the toggles under "Advanced". /theme <name> reaches every one.
    const tile = (id, t, head) => {
      const b = el('button', { type: 'button', class: 'look-tile', title: t.label, dataset: { id }, on: { click: () => applyPreset(id) } }, swatch(t), el('span', { text: t.label.replace(/ \(.*\)$/, '') }));
      b.head = head;
      return b;
    };
    const featured = el('div', { class: 'look-featured' });
    const fillFeatured = () => {
      const ids = [...FEATURED, presetId()].filter((id, i, a) => themes()[id] && a.indexOf(id) === i);
      featured.replaceChildren(...ids.map((id) => tile(id, themes()[id], null)));
    };
    const moreLooks = el('details', { class: 'look-more' }, el('summary', { text: `${split ? 'Every look' : 'More looks'} (${Object.keys(themes()).length - FEATURED.length})`, title: 'Every other look, by group, with a search' }), search, grid);
    for (const g of GROUPS) {
      const items = Object.entries(themes()).filter(([id, t]) => (t.group || 'Plain') === g && !FEATURED.includes(id));
      if (!items.length) continue;
      const head = el('div', { class: 'look-group', text: g });
      grid.append(head);
      for (const [id, t] of items) {
        const b = tile(id, t, head);
        tiles.push(b);
        grid.append(b);
      }
    }
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      for (const b of tiles) b.hidden = q && !`${b.title} ${b.dataset.id}`.toLowerCase().includes(q);
      for (const head of grid.querySelectorAll('.look-group')) head.hidden = Boolean(q) && !tiles.some((t) => t.head === head && !t.hidden);
    });
    const bool = (v) => v === 'true';
    const tex = seg('texture', [['true', 'On'], ['false', 'Off']], 'Brushed metal, grain and glass', bool);
    // (round 17, hz240) dragging shows the glow live once per frame (one CSS variable); it's saved (and every other
    // part of the look re-applied) when you let go: saving on every step made the app reload its config 30× a drag
    let glowFrame = 0;
    const glowLive = () => { glowFrame = 0; root.style.setProperty('--glow', String(Math.max(0, Math.min(100, Number(glow.value) || 0)) / 50)); };
    const glow = el('input', { type: 'range', min: 0, max: 100, step: 5, title: 'How much the edges and buttons glow', on: { input: () => { glowFrame ||= requestAnimationFrame(glowLive); }, change: () => { cancelAnimationFrame(glowFrame); glowFrame = 0; setFx({ glow: Number(glow.value) }); } } });
    const motion = seg('motion', CHOICES.motion, 'How much the app moves by itself (calm or off: lighter)');
    const density = seg('density', CHOICES.density, 'How much room between things');
    const corners = seg('corners', CHOICES.corners, 'How round the corners are');
    const font = seg('chatfont', CHOICES.chatfont, 'The font of chat messages');
    const tips = seg('tips', [['true', 'On'], ['false', 'Off']], 'Styled tooltips like this one', bool);
    const accentIn = el('input', { type: 'color', title: 'The highlight colour', on: { input: debounce(() => setAccent(accentIn.value), 150) } });
    const accentReset = el('button', { type: 'button', class: 'ghost small', text: 'Reset', title: 'Back to the preset\'s accent', on: { click: () => setAccent('reset') } });
    const ctl = el('div', { class: 'look-ctl' },
      el('span', { text: 'Textures' }), tex, el('span', { text: 'Glow' }), glow,
      el('span', { text: 'Motion' }), motion, el('span', { text: 'Density' }), density,
      el('span', { text: 'Corners' }), corners, el('span', { text: 'Chat font' }), font,
      el('span', { text: 'Accent' }), el('span', { class: 'look-accent' }, accentIn, accentReset), el('span', { text: 'Tooltips' }), tips,
      el('span', { text: 'Your looks' }), el('span', {}, el('button', { type: 'button', class: 'ghost small', text: 'Save as…', title: 'Keep this look and your tweaks under a name',
        on: { click: async () => { const n = await Modal.prompt('Save this look as', { placeholder: 'e.g. Night session' }); if (n) toast(saveLook(n), { timeout: 1600 }); } } })));
    // (round 96, firstscreen96) decide.js loads with the 'assist' group, right after the first frame
    const decide = el('button', { type: 'button', class: 'ghost small decide-btn', text: '✦ Let Astra pick', title: 'Astra picks a look for you (Undo puts yours back)', on: { click: () => (window.Lazy ? Lazy.load('assist') : Promise.resolve()).then(() => Decide.run('theme')).catch((err) => toast(err.message, { type: 'error' })) } });
    const top = el('div', { class: 'look-top' }, now, el('span', { class: 'spacer' }), typeof NativeFeel !== 'undefined' ? NativeFeel.followButton() : null, decide);
    let box;
    if (split) {
      box = el('div', { class: 'look-picker look-split', title: 'The colours of Hearth: click one (the fold below has every other look)' }, featured);
      top.title = 'The look in use; ◐ makes it follow your computer\'s light / dark mode, ✦ lets Astra pick one';
      ctl.title = 'Finer touches of the look: textures, glow, motion, spacing, corners, chat font, accent, tooltips';
      box.rest = el('div', { class: 'look-rest' }, top, mine, moreLooks, ctl);
    } else {
      box = el('div', { class: 'look-picker' }, top, typeof Bigscreen !== 'undefined' ? Bigscreen.sizeRow() : null, featured, mine, moreLooks, // (round 38: the size of everything, per screen)
        el('details', { class: 'look-adv' }, el('summary', { text: 'Advanced: textures, glow, motion, density, corners…' }), ctl));
    }
    box.refresh = () => {
      const f = fx();
      const t = preset();
      now.replaceChildren('Now: ', el('b', { text: t ? t.label.replace(/ \(.*\)$/, '') : 'Custom' }));
      fillFeatured();
      for (const b of [...tiles, ...featured.children]) b.classList.toggle('on', b.dataset.id === presetId());
      fillMine();
      for (const s of [tex, motion, density, corners, font, tips]) s.sync();
      if (document.activeElement !== glow) glow.value = f.glow;
      accentIn.value = /^#[0-9a-f]{6}$/i.test(f.accent || H.config?.theme?.accent || '') ? (f.accent || H.config.theme.accent) : '#ffc23d';
      accentReset.disabled = !f.accent;
    };
    box.refresh();
    box.made = Date.now(); for (const p of pickers) if (!p.isConnected && Date.now() - (p.made || 0) > 10000) pickers.delete(p); // (round 72, longrun72) a closed Settings' picker goes now (it waited for the next look change: one whole Settings kept per opening)
    pickers.add(box);
    return box;
  }
  function openDialog() {
    document.querySelector('dialog.look-dialog')?.close();
    const dialog = el('dialog', { class: 'ui-modal look-dialog' });
    dialog.append(el('form', { method: 'dialog' }, el('h2', { text: 'Appearance' }), picker(),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'hint', text: '/theme name · Ctrl+Shift+L' }), el('span', { class: 'spacer' }),
        el('button', { type: 'submit', class: 'primary', text: 'Done' }))));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }
  return { picker, openDialog };
})();
