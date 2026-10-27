// App-wide features: settings, themes, command palette, find in page, text zoom, recent-surface
// switching, reply notifications, downloads, error toasts, resizable chats panel, usage stats.
const AppUI = (() => {
  // Theme presets. The first keys go into config.json → theme (colors, font, skin); `look: 'v2'` turns on
  // Forgeheart 2 (look.css), `vars` retint its CSS variables, `fx` are the preset's default appearance toggles
  // (your own /glow, /motion… choices win). look.js applies them; Settings → Appearance and /theme pick them.
  const OX = "'FH Oxanium', 'Segoe UI', sans-serif";
  const SYS = '"Segoe UI", system-ui, sans-serif';
  const forge2 = (label, group, colors, vars = {}, fx) => ({ label, group, scheme: 'dark', skin: 'forge', font: OX, ...colors, look: 'v2', vars, fx });
  const lightForge = { '--fh-ink': '#fffdf9', '--fh-strong': '#000000', '--fh-on-gold': '#1d1203', '--fh-stop': '#d12b2b', '--fh-ai': '#7a3fe0', '--fh-info': '#0a74b8', '--fh-hot': '#d6245f', '--fh-ember': '#d9580a' };
  const chrome = { '--m-primary': 'var(--m-chrome)', '--m-primary-ink': 'var(--m-chrome-ink)' };
  const THEMES = {
    forgeheart: forge2('Forgeheart', 'Forgeheart', { background: '#08090c', sidebar: '#0f1115', text: '#ece3d8', accent: '#ffc23d' }),
    classic: { label: 'Forgeheart Classic', group: 'Forgeheart', scheme: 'dark', skin: 'forge', background: '#0b0e10', sidebar: '#111518', text: '#eae0d5', accent: '#ffd75e', font: OX },
    swirl: { label: 'Forgeheart Swirl (curvy, flowing)', group: 'Forgeheart', scheme: 'dark', skin: 'forge swirl', background: '#0b0e10', sidebar: '#111518', text: '#eae0d5', accent: '#ffd75e', font: OX },
    'chrome-forge': forge2('Chrome Forge', 'Forgeheart', { background: '#0a0c0f', sidebar: '#12151a', text: '#e8ecf0', accent: '#ffc23d' },
      { ...chrome, '--fh-heat': '#7fa8c9', '--fh-iron-1': '#22262d', '--fh-iron-2': '#14171c', '--fh-iron-3': '#0c0e12', '--fh-line-base': '#2e333b' }),
    'glass-ember': forge2('Glass Ember', 'Forgeheart', { background: '#0b090a', sidebar: '#141012', text: '#f3e6dc', accent: '#ff9a3d' },
      { '--fh-gold': '#ff9a3d', '--fh-heat': '#ff5a1f', '--fh-pop': '#1c1315', '--fh-iron-1': '#1d1517', '--fh-iron-2': '#130e10', '--fh-iron-3': '#0d0a0b', '--fh-line-base': '#33272a' }, { corners: 'round' }),
    obsidian: forge2('Obsidian', 'Forgeheart', { background: '#000000', sidebar: '#07070a', text: '#e9e6f0', accent: '#e6c36a' },
      { '--fh-gold': '#e6c36a', '--fh-heat': '#6b4cff', '--fh-ink': '#000000', '--fh-iron-1': '#121217', '--fh-iron-2': '#08080b', '--fh-iron-3': '#040406', '--fh-line-base': '#1e1e26', '--fh-pop': '#0b0b10' }),
    molten: forge2('Molten', 'Bold', { background: '#0d0705', sidebar: '#160b08', text: '#f6e6da', accent: '#ffae2b' },
      { '--fh-gold': '#ffae2b', '--fh-ember': '#ff5a1a', '--fh-hot': '#ff2e63', '--fh-heat': '#ff3d1a', '--fh-iron-1': '#24140f', '--fh-iron-2': '#170c09', '--fh-iron-3': '#0f0806', '--fh-line-base': '#3b2017', '--fh-pop': '#1a0e0a' }, { glow: 70 }),
    'neon-anvil': forge2('Neon Anvil', 'Bold', { background: '#07060d', sidebar: '#0e0b18', text: '#eee9ff', accent: '#ff3ddc' },
      { '--fh-gold': '#ff3ddc', '--fh-ember': '#ffb020', '--fh-ai': '#8a6bff', '--fh-hot': '#00f0ff', '--fh-info': '#00e5ff', '--fh-heat': '#ff00c8', '--fh-iron-1': '#18142b', '--fh-iron-2': '#0f0c1c', '--fh-iron-3': '#08060f', '--fh-line-base': '#2b2445', '--fh-pop': '#110e20' }, { glow: 80 }),
    'synth-forge': forge2('Synth Forge', 'Bold', { background: '#0c0612', sidebar: '#150a1d', text: '#fbe9f4', accent: '#ff9f43' },
      { '--fh-gold': '#ff9f43', '--fh-ember': '#ff5e7e', '--fh-hot': '#ff2a9d', '--fh-ai': '#9d6bff', '--fh-info': '#4de1ff', '--fh-heat': '#ff2a9d', '--fh-iron-1': '#211330', '--fh-iron-2': '#160c21', '--fh-iron-3': '#0e0716', '--fh-line-base': '#36224a', '--fh-pop': '#1a0f26' }, { glow: 70 }),
    'frost-steel': forge2('Frost Steel', 'Bold', { background: '#0a0e12', sidebar: '#10161c', text: '#e3edf5', accent: '#9fdcff' },
      { ...chrome, '--fh-gold': '#9fdcff', '--fh-ember': '#ffb04a', '--fh-heat': '#5fb8ff', '--fh-iron-1': '#1b232c', '--fh-iron-2': '#11171e', '--fh-iron-3': '#0a0f14', '--fh-line-base': '#27323d', '--fh-pop': '#121a22' }),
    'gold-leaf': forge2('Gold Leaf', 'Bold', { background: '#0e0b07', sidebar: '#16110a', text: '#f3e7cf', accent: '#f0c04a' },
      { '--fh-gold': '#f0c04a', '--fh-ember': '#e0782a', '--fh-heat': '#c9902a', '--fh-iron-1': '#231b10', '--fh-iron-2': '#18120a', '--fh-iron-3': '#0f0b06', '--fh-line-base': '#3b2f1c', '--fh-pop': '#1b150c' }, { glow: 60 }),
    'midnight-violet': forge2('Midnight Violet', 'Bold', { background: '#0a0814', sidebar: '#110d20', text: '#ebe6ff', accent: '#ffc94d' },
      { '--fh-gold': '#ffc94d', '--fh-ai': '#b38cff', '--fh-heat': '#7c4dff', '--fh-iron-1': '#1b1531', '--fh-iron-2': '#120e22', '--fh-iron-3': '#0b0817', '--fh-line-base': '#2b2346', '--fh-pop': '#15102a' }, { glow: 60 }),
    'ash-copper': forge2('Ash & Copper', 'Bold', { background: '#121212', sidebar: '#1a1918', text: '#e8e2dc', accent: '#e3965c' },
      { '--fh-gold': '#e3965c', '--fh-ember': '#ff6a3a', '--fh-heat': '#c06a3a', '--fh-iron-1': '#262321', '--fh-iron-2': '#1b1918', '--fh-iron-3': '#141312', '--fh-line-base': '#34312e', '--fh-pop': '#1e1c1a' }),
    verdigris: forge2('Verdigris', 'Bold', { background: '#08100f', sidebar: '#0e1716', text: '#e2efe9', accent: '#e2b25a' },
      { '--fh-gold': '#e2b25a', '--fh-heat': '#2fbf9f', '--fh-info': '#4fe0c0', '--fh-iron-1': '#16221f', '--fh-iron-2': '#0e1716', '--fh-iron-3': '#091110', '--fh-line-base': '#223330', '--fh-pop': '#0f1a18' }),
    'jade-furnace': forge2('Jade Furnace', 'Bold', { background: '#060d09', sidebar: '#0b150f', text: '#e4f3e8', accent: '#5ee08f' },
      { '--fh-gold': '#5ee08f', '--fh-ember': '#ffb347', '--fh-heat': '#1fbf6a', '--fh-iron-1': '#13221a', '--fh-iron-2': '#0b1510', '--fh-iron-3': '#070e0a', '--fh-line-base': '#1e3327', '--fh-pop': '#0e1a13' }),
    bloodmoon: forge2('Blood Moon', 'Bold', { background: '#0d0607', sidebar: '#16090b', text: '#f2e2e2', accent: '#ffb347' },
      { '--fh-gold': '#ffb347', '--fh-hot': '#ff1f5a', '--fh-heat': '#ff1f3d', '--fh-iron-1': '#231012', '--fh-iron-2': '#170a0c', '--fh-iron-3': '#0f0607', '--fh-line-base': '#3a1a1e', '--fh-pop': '#1b0c0e' }, { glow: 65 }),
    'rose-gold': forge2('Rose Gold', 'Bold', { background: '#0f0a0b', sidebar: '#181012', text: '#f6e8e8', accent: '#f2a7a0' },
      { '--fh-gold': '#f2a7a0', '--fh-ember': '#ff8a5c', '--fh-hot': '#ff4f8b', '--fh-heat': '#e0707a', '--fh-iron-1': '#241a1c', '--fh-iron-2': '#181113', '--fh-iron-3': '#100b0c', '--fh-line-base': '#3a2a2d', '--fh-pop': '#1d1416' }, { corners: 'round' }),
    aurora: forge2('Aurora', 'Bold', { background: '#060b10', sidebar: '#0b131a', text: '#e4f2f0', accent: '#5cf2c5' },
      { '--fh-gold': '#5cf2c5', '--fh-ember': '#ffb347', '--fh-ai': '#b07cff', '--fh-heat': '#2ad1a3', '--fh-iron-1': '#13202a', '--fh-iron-2': '#0b141b', '--fh-iron-3': '#070d12', '--fh-line-base': '#1e2f3a', '--fh-pop': '#0e1820' }),
    abyss: forge2('Abyss', 'Bold', { background: '#050a14', sidebar: '#0a1222', text: '#e2ecff', accent: '#4fd2ff' },
      { '--fh-gold': '#4fd2ff', '--fh-heat': '#1f6bff', '--fh-iron-1': '#101b30', '--fh-iron-2': '#0a1222', '--fh-iron-3': '#060c18', '--fh-line-base': '#1b2a45', '--fh-pop': '#0c162a' }),
    sunforge: forge2('Sunforge', 'Bold', { background: '#120c06', sidebar: '#1b1209', text: '#fff1de', accent: '#ffb627' },
      { '--fh-gold': '#ffb627', '--fh-heat': '#ff9a1f', '--fh-iron-1': '#291c0f', '--fh-iron-2': '#1c130a', '--fh-iron-3': '#130d07', '--fh-line-base': '#40301c', '--fh-pop': '#20160c' }, { glow: 80 }),
    ironclad: forge2('Ironclad (calm, low glow)', 'Forgeheart', { background: '#111214', sidebar: '#17181b', text: '#dcdcdc', accent: '#d6b25e' },
      { '--fh-gold': '#d6b25e', '--fh-heat': '#8a8a8a', '--fh-iron-1': '#1f2024', '--fh-iron-2': '#16171a', '--fh-iron-3': '#111214', '--fh-line-base': '#2c2d31' }, { glow: 15, motion: 'calm' }),
    'hc-forge': forge2('High Contrast Forge', 'Forgeheart', { background: '#000000', sidebar: '#000000', text: '#ffffff', accent: '#ffd400' },
      { '--fh-gold': '#ffd400', '--fh-ink': '#000000', '--fh-iron-1': '#0d0d0d', '--fh-iron-2': '#000000', '--fh-iron-3': '#000000', '--fh-line-base': '#6a6a6a', '--fh-pop': '#050505' }, { glow: 40, texture: false }),
    'forge-light': forge2('Forge Light', 'Light', { scheme: 'light', background: '#f4efe6', sidebar: '#e8e0d2', text: '#221c14', accent: '#b97a00' },
      { ...lightForge, '--fh-gold': '#c98a00', '--fh-heat': '#ffb35a', '--fh-iron-1': '#fbf7f0', '--fh-iron-2': '#ede6d9', '--fh-iron-3': '#e3dacb', '--fh-line-base': '#cdc1ad', '--fh-pop': '#f8f3eb' }, { glow: 40 }),
    'chrome-light': forge2('Chrome Light', 'Light', { scheme: 'light', background: '#eef1f4', sidebar: '#dfe4e9', text: '#161a1f', accent: '#2f6fde' },
      { ...lightForge, ...chrome, '--fh-gold': '#2f6fde', '--fh-heat': '#8fb3ff', '--fh-iron-1': '#fbfcfd', '--fh-iron-2': '#e8ecf0', '--fh-iron-3': '#dde2e8', '--fh-line-base': '#c3cad3', '--fh-pop': '#f4f6f8' }, { glow: 35 }),
    parchment: forge2('Parchment', 'Light', { scheme: 'light', background: '#f3ead8', sidebar: '#e6dac2', text: '#2a2116', accent: '#9c5b12' },
      { ...lightForge, '--fh-gold': '#a8661a', '--fh-heat': '#e0a050', '--fh-iron-1': '#faf3e4', '--fh-iron-2': '#ece0c8', '--fh-iron-3': '#e2d4b8', '--fh-line-base': '#cbb994', '--fh-pop': '#f6eedd' }, { glow: 25 }),
    'frost-light': forge2('Frost Light', 'Light', { scheme: 'light', background: '#eef4f8', sidebar: '#dde8ef', text: '#14202a', accent: '#0a7fc2' },
      { ...lightForge, ...chrome, '--fh-gold': '#0a7fc2', '--fh-heat': '#7fc8ff', '--fh-iron-1': '#fafdff', '--fh-iron-2': '#e6eef4', '--fh-iron-3': '#dae5ed', '--fh-line-base': '#bfcfdb', '--fh-pop': '#f3f8fb' }, { glow: 35 }),
    dusk: forge2('Dusk (soft, muted)', 'Bold', { background: '#141218', sidebar: '#1b1820', text: '#e6e0ea', accent: '#e0a96d' },
      { '--fh-gold': '#e0a96d', '--fh-ember': '#e07a5f', '--fh-ai': '#9d84d9', '--fh-hot': '#d96a8c', '--fh-heat': '#9d84d9', '--fh-iron-1': '#221f28', '--fh-iron-2': '#1a171f', '--fh-iron-3': '#141218', '--fh-line-base': '#302c37', '--fh-pop': '#1d1a22' }, { glow: 30 }),
    midnight: { label: 'Midnight', group: 'Plain', scheme: 'dark', skin: '', background: '#0f1115', sidebar: '#15181e', text: '#e6e6e6', accent: '#7c5cff', font: SYS },
    graphite: { label: 'Graphite', group: 'Plain', scheme: 'dark', skin: '', background: '#18181b', sidebar: '#202024', text: '#ececec', accent: '#3b82f6', font: SYS },
    light: { label: 'Light', group: 'Plain', scheme: 'light', skin: '', background: '#f7f7f8', sidebar: '#e9e9ee', text: '#1d1d22', accent: '#6d4aff', font: SYS },
    contrast: { label: 'High contrast', group: 'Plain', scheme: 'dark', skin: '', background: '#000000', sidebar: '#0d0d0d', text: '#ffffff', accent: '#ffd400', font: SYS },
  };
  const SPELL_LANGS = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['fr-FR', 'French'], ['es-ES', 'Spanish'], ['de-DE', 'German']];

  // ---------- settings dialog ----------
  // (round 18, tidy) settings-find.js (search + every switch with its cost) loads the first time Settings opens
  let findLoad = null;
  const loadFind = () => (typeof SettingsFind !== 'undefined' ? Promise.resolve() : (findLoad ||= new Promise((res, rej) => {
    document.head.append(el('script', { src: 'settings-find.js', on: { load: res, error: () => { findLoad = null; rej(new Error('settings-find.js did not load')); } } }));
  })));
  window.loadSettingsFind = loadFind; // (round 26) options.js reads the switches' state from it
  async function openSettings(query = '') {
    try { await loadFind(); } catch (err) { console.warn(err); }
    if (typeof query !== 'string') query = '';
    document.querySelector('dialog.settings-dialog[open]')?.close();
    const s = { ...H.settings() };
    const hidden = new Set(H.config.tools?.hidden || []);
    // (round 27, simplify2) every row says what it does on hover (tip)
    const field = (label, input, hint, tip) => el('label', { title: tip || hint || '' }, label, input, hint ? el('span', { class: 'hint', text: hint }) : null);
    const check = (label, checked, hint, tip) => {
      const input = el('input', { type: 'checkbox', checked: Boolean(checked) });
      return [el('label', { class: 'check', title: tip || hint || '' }, input, label, hint ? el('span', { class: 'hint inline', text: hint }) : null), input];
    };
    const startOn = el('select', {}, el('option', { value: '', text: 'Projects' }), // (lazyfix66) no choice = Projects (Codex's projects-first start)
      H.agents().map((a) => el('option', { value: a.id, text: a.name, selected: s.startOn === a.id })),
      Tools.all().map((t) => el('option', { value: `tool:${t.id}`, text: t.name, selected: s.startOn === `tool:${t.id}` })));
    const hotkey = el('input', { value: s.hotkey ?? 'Control+Alt+H', placeholder: 'e.g. Control+Alt+H (empty = off)' });
    const ideaKey = el('input', { value: s.quickIdeaKey ?? 'Control+Alt+I', placeholder: 'e.g. Control+Alt+I (empty = off)' }); // (round 71, quickidea71) 💡 Quick idea from any app
    const ideaKeyNote = el('span', { class: 'hint' });
    window.hub.quickIdea?.op({ op: 'key' }).then((r) => { const k = r?.value; if (k && k.key && !k.ok && k.key === ideaKey.value.trim()) ideaKeyNote.textContent = `Off: ${k.why || 'another app uses it'}. Pick another key.`; }).catch(() => {});
    const [trayRow, trayIn] = check('Closing the window keeps Hearth running in the tray', s.closeToTray, '', 'The window closes but Hearth keeps going (replies, renders, sync); the tray icon brings it back');
    const isMac = /Mac/.test(navigator.platform);
    const [startupRow, startupIn] = check(isMac ? 'Start Hearth when you log in' : 'Start Hearth when Windows starts', s.launchAtStartup, '', isMac ? 'Hearth opens by itself when you sign in (on a Mac, also add Hearth.app in System Settings › General › Login Items)' : 'Hearth opens by itself when you sign in to this computer');
    const claudePath = el('input', { value: s.enginePaths?.claude || '', placeholder: 'Found automatically (Claude desktop app or the claude command)' });
    const codexPath = el('input', { value: s.enginePaths?.codex || '', placeholder: 'Found automatically (Codex / ChatGPT app or the codex command)' });
    const [notifyRow, notifyIn] = check('Desktop notifications while I\'m elsewhere', s.notify !== false, '', 'A system notification when an AI finishes, something needs you, or a long job ends while you are in another window or app');
    // (round 44, notify) Tell me when…: what notifies, five switches under the one above (notify-core.js SWITCHES)
    const NC = typeof NotifyCore !== 'undefined' ? NotifyCore : null;
    const whenBoxes = NC ? NC.SWITCHES.map((sw) => { const [row, input] = check(sw.label, NC.prefs(s)[sw.id], '', sw.tip); input.dataset.notify = sw.id; row.classList.add('nt-when'); return [row, input]; }) : [];
    const whenNow = () => ({ notify: notifyIn.checked, notifyWhen: Object.fromEntries(whenBoxes.map(([, i]) => [i.dataset.notify, i.checked])) });
    const whenDim = () => { for (const [row, i] of whenBoxes) { i.disabled = !notifyIn.checked; row.style.opacity = notifyIn.checked ? '' : '0.55'; } };
    notifyIn.addEventListener('change', whenDim); whenDim();
    const sleepSel = el('select', {}, [['0', 'Never'], ['10', 'after 10 minutes'], ['30', 'after 30 minutes'], ['60', 'after an hour']].map(([v, l]) => el('option', { value: v, text: l, selected: String(s.sleepWebsAfter || 0) === v })));
    const langs = new Set(s.spellLanguages || ['en-US']);
    const langBoxes = SPELL_LANGS.map(([code, label]) => {
      const input = el('input', { type: 'checkbox', checked: langs.has(code), dataset: { code } });
      return el('label', { class: 'check' }, input, label);
    });
    const toolBoxes = Tools.all().map((t) => {
      const input = el('input', { type: 'checkbox', checked: !hidden.has(t.id), dataset: { id: t.id } });
      return el('label', { class: 'check' }, input, `${t.icon} ${t.name}`);
    });
    const folderInput = (value, title) => {
      const input = el('input', { value: value || '', placeholder: 'Not set' });
      const pick = el('button', { type: 'button', class: 'ghost small', text: 'Choose…', on: { click: async () => { const f = await window.hub.pickFolder(input.value, title); if (f) input.value = f; } } });
      return [el('div', { class: 'folder-row' }, input, pick), input];
    };
    const [fhRow, fhIn] = folderInput(s.forgeheartFolder, 'Forgeheart project folder');
    const dbgIn = el('input', { value: s.forgeDebugBuild || '', placeholder: 'Default: forgeheart_music_test5.html on your Desktop' });
    const dbgRow = el('div', { class: 'folder-row' }, dbgIn, el('button', { type: 'button', class: 'ghost small', text: 'Choose…', on: { click: async () => {
      const [p] = await window.hub.openDialog({ filters: [{ name: 'Forgeheart build', extensions: ['html'] }] });
      if (p) dbgIn.value = p;
    } } }));
    const [aeRow, aeIn] = folderInput(s.aePath, 'After Effects "Support Files" folder');
    const aeDirs = el('textarea', { rows: 2, value: (s.aeProjectDirs || []).join('\n'), placeholder: 'One folder per line (default: your Documents)' });

    const dialog = el('dialog', { class: 'ui-modal settings-dialog' });
    const section = (title, ...kids) => el('section', { class: 'settings-section' }, el('h3', { text: title }), ...kids);
    const home = (sec, id) => { sec.dataset.home = id; return sec; }; // settings-find.js puts each switch in its home
    const gbtn = (text, title, fn, cls = 'ghost') => el('button', { type: 'button', class: cls, text, title, on: { click: fn } });
    const run = (line) => () => { dialog.close(); Commands.tryRun(line, H.claudeAgent()?.id); };
    // (round 27, simplify2) the owner found the app "way too complex… unclear" and loved how calm ⋯ AI setup is, so
    // Settings reads the same way. (round 39, settingscalm) "so much simpler": four plain sections read top to bottom
    // (Look & size · Your AIs · This computer & sync · Updates & what's new), one obvious control per row, the rest in
    // folds that say in one line where they stand (simplify3's pattern), the rarer folds under Advanced. Nothing left:
    // every row is still here (the search and Ctrl/⌘+K find it and open its folds), no command names on screen.
    const states = [];
    const openFolds = (() => { try { return new Set(store.get('settings.open', []) || []); } catch { return new Set(); } })();
    const keepOpen = (key, on) => { if (on) openFolds.add(key); else openFolds.delete(key); try { store.set('settings.open', [...openFolds]); } catch { /* no storage */ } };
    // a fold: its title, one line about where it stands (right), a one-sentence tooltip; the section inside keeps its
    // name (hidden: the fold shows it) so the search, the right-click "Go to" and Find anything find it by that name
    const fold = (key, title, tip, state, sec, cls = '') => {
      const line = el('span', { class: 'sc-state' });
      const sum = el('summary', { class: 'sc-sum', title: tip }, el('span', { class: 'sc-title', text: title }), line);
      const d = el('details', { class: `sc-fold ${cls}`.trim(), dataset: { fold: key } }, sum, sec);
      d.open = openFolds.has(key);
      sum.addEventListener('click', () => setTimeout(() => keepOpen(key, d.open), 0)); // only what you open yourself stays open
      states.push(() => { let t = ''; try { t = state() || ''; } catch { /* not ready */ } t = t.charAt(0).toUpperCase() + t.slice(1); if (line.textContent !== t) line.textContent = t; });
      return d;
    };
    const paintStates = () => { for (const f of states) f(); };
    const list3 = (names, none) => (names.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : none);
    const swOn = (cmd) => (typeof SettingsFind !== 'undefined' ? SettingsFind.state(cmd) : undefined);
    const lookName = () => { const t = THEMES[H.config.theme?.preset]; return t ? t.label.replace(/ \(.*\)$/, '') : 'Custom'; };

    // ---- Look & size ----
    const look = Look.picker({ split: true });
    const sizeRow = typeof Bigscreen !== 'undefined' ? Bigscreen.sizeRow({ compact: true }) : null;
    const lookSec = section('Look & size', look, sizeRow,
      fold('look', 'More looks and tweaks', 'Every other look, following your computer\'s light / dark mode, your saved looks, glow, motion, spacing, sparkles',
        () => [lookName(), window.NativeFeel?.following?.() ? 'follows your computer' : '', swOn('sparkles') === false ? 'no sparkles' : ''].filter(Boolean).join(' · '),
        home(section('More looks and tweaks', look.rest, el('span', { class: 'sf-slot' })), 'look')));

    // ---- Your AIs ----
    const aiSec = section('Your AIs',
      el('div', { class: 'settings-ai', title: 'Personality, standing instructions, what each AI can use (files, the board, the Lab, apps), memory, how hard it thinks' },
        el('span', { text: 'Who they are and what they can use' }), el('span', { class: 'spacer' }),
        gbtn('⋯ AI setup', 'Opens AI setup for the chat you are in', () => { dialog.close(); (window.Lazy?.load ? Lazy.load('options') : Promise.resolve()).then(() => Options.open({})).catch(() => activate('tool:options')); }, 'ghost small')),
      fold('programs', 'Claude and Codex programs', 'Where the Claude and Codex programs are, only when Hearth can\'t find them by itself',
        () => { const c = claudePath.value.trim(); const x = codexPath.value.trim(); return c || x ? [c ? 'Claude: your own path' : '', x ? 'Codex: your own path' : ''].filter(Boolean).join(' · ') : 'Found by themselves'; },
        section('Claude and Codex programs', field('Claude program (only if it isn\'t found)', claudePath, '', 'Where the Claude program is, when Hearth can\'t find it by itself'), field('Codex program (only if it isn\'t found)', codexPath, '', 'Where the Codex program is, when Hearth can\'t find it by itself'))));

    // ---- This computer & sync ----
    const syncSec = typeof Sync !== 'undefined' ? Sync.settingsSection(section) : null; // round 10: sync through your cloud drive
    const pcSec = syncSec || section('This computer & sync');
    pcSec.querySelector('h3').textContent = 'This computer & sync';
    if (syncSec) {
      for (const b of syncSec.querySelectorAll('.button-row > button:not([title])')) b.title = 'Keeps your Mac and PC the same through a cloud drive folder you already use (iCloud Drive, Google Drive, Dropbox, OneDrive)';
      syncSec.querySelector('label.check')?.setAttribute('title', 'Very big captures and renders travel too, in pieces that resume after a break');
      syncSec.querySelector('.two-here')?.setAttribute('title', 'The name this computer goes by in sync and in your chats');
    }
    pcSec.append(
      // (round 45, backupauto) "Last backup: 2 h ago ✓" with Backups… (backupauto.js; loaded right after the first screen)
      (() => { if (window.BackupAuto) return BackupAuto.line(); const slot = el('span', { class: 'sf-slot' }); window.Lazy?.load?.('backupauto').then(() => { if (window.BackupAuto) slot.replaceWith(BackupAuto.line()); }).catch(() => {}); return slot; })(),
      // (round 53, diskcalm) "Space Hearth uses: 2.4 GB: backups 1.2 GB · game cache 600 MB · …" with Free up per cache (diskcalm.js)
      (() => { if (window.DiskCalm) return DiskCalm.line(); const slot = el('span', { class: 'sf-slot' }); window.Lazy?.load?.('diskcalm').then(() => { if (window.DiskCalm) slot.replaceWith(DiskCalm.line()); }).catch(() => {}); return slot; })(),
      el('div', { class: 'button-row', title: 'Claude, Codex, ffmpeg, sync, folders from the other computer, permissions, updates: one list, one button each' },
        gbtn('Check this computer…', 'Is this computer ready? Each thing with its state and one button to fix it (nothing installs without your click)', () => { dialog.close(); (window.Lazy?.load ? Lazy.load('firstrun') : Promise.resolve()).then(() => FirstRun.open()); })), // (round 28, firstrun)
      fold('start', 'Starting and closing', 'What Hearth does when your computer starts, when it opens and when you close its window',
        () => [`Opens on ${startOn.value ? startOn.selectedOptions[0]?.text || '…' : 'Projects'}`, startupIn.checked ? 'starts with your computer' : '', trayIn.checked ? 'stays in the tray' : ''].filter(Boolean).join(' · '),
        home(section('Starting and closing', field('Open on start', startOn, '', 'What Hearth shows when it opens'), startupRow, trayRow, el('span', { class: 'sf-slot' })), 'start')));

    // ---- Updates & what's new ----
    const upLine = () => { const u = typeof Updater !== 'undefined' ? Updater.status : null; return !u ? 'Hearth looks for updates by itself every half hour.' : u.ok ? (u.behind ? `${u.behind} new change${u.behind === 1 ? '' : 's'} ready: ⬆ in the rail.` : 'Hearth is up to date.') : 'Could not look for updates just now.'; };
    const upText = el('span', { class: 'sc-line', text: upLine() });
    const upSec = section('Updates & what\'s new',
      el('div', { class: 'sc-row', title: 'Hearth looks for updates by itself; Look now asks at once (nothing is installed without you)' }, upText, el('span', { class: 'spacer' }),
        gbtn('Look now', 'Ask for updates now (nothing is installed without you)', async () => { await Updater.check({ loud: true }); upText.textContent = upLine(); }, 'ghost small')),
      el('div', { class: 'button-row', title: 'What changed lately, in plain words' },
        // (round 33, simplify3) one "What's new…" for the patch notes and what fits how you work (were two buttons)
        gbtn('What\'s new…', 'Shows what changed lately: every change in plain words, or only what fits how you work', (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, [
          { label: 'Since you were away', hint: 'the top changes of the rounds you missed, one page', action: () => { dialog.close(); Updater.sinceAway(); } }, // (round 42, whatsnew)
          { label: 'Patch notes', hint: 'every change, round by round', action: () => { dialog.close(); Updater.patchNotes(); } },
          { label: 'What\'s new for me', hint: 'what fits how you work', action: run('/whats-new') },
          { label: 'Try what\'s new', hint: 'hands-on: rounds 61–63, 30–60 s each', action: run('/try') }, // (round 64, newtour64)
          // (round 37, updatesafe) after an update: back to the version before it, chats and data kept
          ...(Updater.status?.back ? [{ label: 'Go back to the previous version', hint: `before the last update (${Updater.status.back.from})`, action: () => { dialog.close(); Updater.goBack(); } }] : [])]); })),
      fold('updates', 'Updates and tips', 'Whether updates install by themselves, and whether tips show by themselves',
        () => [swOn('update') === false ? 'Updates wait for your click' : 'Updates install by themselves', swOn('hints') === true ? 'no tips' : 'tips on'].join(' · '),
        home(section('Updates and tips', el('span', { class: 'sf-slot' })), 'updates')));

    // ---- Advanced: the rarer folds ----
    const onOf = (sec) => { const rows = [...sec.querySelectorAll('.sf-row')]; return { on: rows.filter((r) => r.querySelector('.sf-seg button.on')?.dataset.v === 'on').length, n: rows.length }; };
    const chatsSec = home(section('Chats', el('span', { class: 'sf-slot' })), 'chats');
    const notifySec = section('Tell me when…', notifyRow, ...whenBoxes.map(([row]) => row));
    const boardSec = home(section('Mood board', el('span', { class: 'sf-slot' })), 'board');
    // (round 52, gpu52) what draws Hearth: the card, the screen's refresh, hardware video (gpu52.js fills it)
    const gpuBox = el('div', { class: 'gpu52-box' });
    (window.Lazy?.load ? Lazy.load('glrecover') : Promise.resolve()).then(() => window.Gpu52?.mount(gpuBox)).catch(() => {});
    const adv = el('details', { class: 'settings-more sc-fold sc-adv', dataset: { fold: 'advanced' } },
      el('summary', { class: 'sc-sum', title: 'The rarer settings: chats, notifications, keys, the mood board, spelling, the rail, folders, backups and files' }, el('span', { class: 'sc-title', text: 'Advanced' }), el('span', { class: 'sc-state', text: 'Chats, notifications, keys, mood board, spelling, the rail, folders, backups' })),
      fold('chats', 'Chats', 'How the chats behave: Enter, long replies, sounds, notifications, spelling',
        () => { const c = onOf(chatsSec); return [swOn('enter-sends') === false ? 'Ctrl/⌘+Enter sends' : 'Enter sends', `${c.on} of ${c.n} on`].join(' · '); }, chatsSec),
      fold('notify', 'Tell me when…', 'Which desktop notifications Hearth shows while you are in another app (your computer\'s Focus / Do Not Disturb still holds them)',
        () => (NC ? NC.summary(whenNow()) : notifyIn.checked ? 'On' : 'Off'), notifySec),
      fold('keys', 'Keys', 'Your keyboard keys, and one key that shows or hides Hearth from anywhere',
        () => (hotkey.value.trim() ? `Show / hide: ${hotkey.value.trim()}` : 'No show / hide key'),
        home(section('Keys',
          el('div', { class: 'button-row', title: 'Your keyboard keys and what hides behind Alt (the keys button bottom left shows them too)' },
            gbtn('Keyboard keys…', 'Shows every key, what waits behind Alt, and every right-click menu', () => { dialog.close(); KeysUI.open(); })),
          field('Show / hide Hearth from anywhere', hotkey, '', 'A hotkey (key combination) that brings Hearth up or hides it, even from another app (e.g. Control+Alt+H; empty: off)'),
          el('label', { title: 'A key combination that opens the small 💡 Quick idea window from any app (the tray menu has it too). Empty: off. A key another app already uses stays off.' }, '💡 Quick idea from anywhere', ideaKey, ideaKeyNote)), 'keys')), // (round 71, quickidea71)
      fold('board', 'Mood board', 'How items snap while you drag them on the mood board, and its small map',
        () => { const g = swOn('board-snap'); const m = swOn('board-minimap'); return g === undefined ? 'Guides, grid, minimap' : `Guides ${g ? 'on' : 'off'} · grid ${swOn('board-grid') ? 'on' : 'off'} · minimap ${m || 'auto'}`; }, boardSec),
      fold('spell', 'Spell check languages', 'The languages the message box checks your spelling in',
        () => list3(langBoxes.filter((l) => l.querySelector('input').checked).map((l) => l.textContent), 'None'),
        section('Spell check languages', el('div', { class: 'check-grid', title: 'The languages the message box checks your spelling in' }, langBoxes))),
      fold('rail', 'Tools in the rail', 'Which tools have a button in the rail on the left',
        () => { const off = toolBoxes.filter((l) => !l.querySelector('input').checked).length; return off ? `${off} off the rail` : 'Every tool in the rail'; },
        section('Tools in the rail', el('div', { class: 'check-grid', title: 'Untick a tool to take it off the rail (it stays in the rail\'s ⋯)' }, toolBoxes))),
      fold('folders', 'Folders', 'Where the Forgeheart game and After Effects are, when they are somewhere unusual',
        () => list3([[fhIn, 'Forgeheart'], [dbgIn, 'debug build'], [aeIn, 'After Effects']].filter(([i]) => i.value.trim()).map(([, n]) => n).concat(aeDirs.value.trim() ? ['.aep folders'] : []), 'Found by themselves'),
        section('Folders', field('Forgeheart project', fhRow, '', 'The game project the Forge agents work in'), field('Forgeheart debug build', dbgRow, '', 'The game page the Forge Debug agent plays (beside the Forge Debug agent)'), field('After Effects install (only if it isn\'t found)', aeRow, '', 'Only when After Effects is installed somewhere unusual'), field('Where to look for .aep projects', aeDirs, '', 'Folders searched for After Effects projects'))),
      fold('hearth', 'Housekeeping', 'Memory, the weekly tidy of buttons you never press, timers, and the keys of services Hearth talks to',
        () => [swOn('habits') === false ? 'no weekly tidy' : 'weekly tidy on', swOn('timers-pause') ? 'timers paused' : '', Number(sleepSel.value) ? 'unloads idle websites' : ''].filter(Boolean).join(' · '),
        home(section('Housekeeping',
          field('Unload websites I haven\'t opened', sleepSel, '', 'Frees memory; a website loads again when you open it'),
          // (round 33, simplify3) moved from Keys: used once, when you subscribe to Meshy (Apps › Meshy › More has it too)
          el('div', { class: 'button-row', title: 'The keys of services Hearth talks to' },
            gbtn('Meshy key…', 'Paste your Meshy API key once (stored encrypted on this computer, never shown to a chat)', run('/meshy key')),
            gbtn('Paris Métro status key…', 'A free IDFM PRIM key: leave reminders check the Métro lines on your way (stored encrypted on this computer, sent only to PRIM)', () => { dialog.close(); Lazy.load('leavesoon').then(() => LeaveSoon.keyDialog()).catch((err) => toast(calmError(err), { type: 'error' })); })) /* (round 69, ratp69) */, el('span', { class: 'sf-slot' })), 'hearth')),
      fold('graphics', 'Graphics', 'The graphics card Hearth draws with, the screen\'s refresh rate and hardware video (ask in a chat to use another card or way of drawing)',
        () => (window.Gpu52 ? Gpu52.summary() : 'Graphics card, screen refresh, hardware video'), section('Graphics', gpuBox)),
      fold('files', 'Backup and files', 'Backups of your chats and settings, Hearth\'s shortcuts and its own files',
        () => { if (window.BackupAuto) return BackupAuto.lineText().text; const d = Number(H.settings().autoBackupDays) || 0; return d ? `Backs up by itself ${d === 1 ? 'daily' : d === 7 ? 'weekly' : d === 30 ? 'monthly' : `every ${d} days`}` : 'Backups when you ask'; },
        section('Backup and files',
          el('div', { class: 'button-row', title: 'Backups, shortcuts and Hearth\'s own files' },
            // (round 39) one Backups… (back up now, a copy as one file, restore, automatic backups) instead of "Back up hub data…"
            el('button', { type: 'button', class: 'ghost', text: 'Backups…', title: 'Back up now, save a copy as one file, restore, or back up by itself every day / week', on: { click: () => { dialog.close(); backupsDialog(); } } }),
            el('button', { type: 'button', class: 'ghost', text: isMac ? 'Create Hearth.app in Applications' : 'Create Start menu & desktop shortcuts', title: 'Open Hearth like any other app', on: { click: createShortcuts } }),
            el('button', { type: 'button', class: 'ghost', text: 'Pack Hearth for a Mac…', title: 'One zip with the app, your chats, sketches, settings and memory, plus the Mac setup script', on: { click: packForMac } }),
            el('button', { type: 'button', class: 'ghost', text: 'Open data folder', title: 'Where Hearth keeps your chats and files', on: { click: () => window.hub.openDataFolder() } }),
            el('button', { type: 'button', class: 'ghost', text: 'Edit config.json', title: 'Every setting as a text file (for experts)', on: { click: () => window.hub.openFile('config') } }),
            el('button', { type: 'button', class: 'ghost', text: 'Edit theme.css', title: 'Your own colours and styles as a text file (for experts)', on: { click: () => window.hub.openFile('theme') } })))));
    adv.open = openFolds.has('advanced');
    adv.querySelector(':scope > summary').addEventListener('click', () => setTimeout(() => keepOpen('advanced', adv.open), 0));
    const form = el('form', { method: 'dialog' },
      el('h2', { text: 'Settings' }),
      lookSec, aiSec, pcSec, upSec, adv,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
        el('button', { type: 'button', text: 'Cancel', on: { click: () => dialog.close() } }),
        el('button', { type: 'submit', class: 'primary', text: 'Save' })));
    // the fold lines follow what you change inside them (a switch answers a moment later: sf-changed)
    let paintSoon = 0;
    const later = () => { clearTimeout(paintSoon); paintSoon = setTimeout(paintStates, 250); };
    for (const t of ['change', 'input', 'click']) form.addEventListener(t, () => { requestAnimationFrame(paintStates); later(); });
    form.addEventListener('sf-changed', paintStates);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.config.settings = {
        ...H.config.settings,
        startOn: startOn.value || undefined,
        closeToTray: trayIn.checked,
        launchAtStartup: startupIn.checked,
        notify: notifyIn.checked,
        ...(NC ? { notifyWhen: whenNow().notifyWhen } : {}),
        sleepWebsAfter: Number(sleepSel.value) || undefined,
        hotkey: hotkey.value.trim(),
        quickIdeaKey: ideaKey.value.trim(), // (round 71, quickidea71) empty: off
        spellLanguages: langBoxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.dataset.code),
        forgeheartFolder: fhIn.value.trim() || undefined,
        forgeDebugBuild: dbgIn.value.trim() || undefined,
        aePath: aeIn.value.trim() || undefined,
        aeProjectDirs: aeDirs.value.split('\n').map((x) => x.trim()).filter(Boolean),
        enginePaths: claudePath.value.trim() || codexPath.value.trim() ? { claude: claudePath.value.trim() || undefined, codex: codexPath.value.trim() || undefined } : undefined,
      };
      H.config.tools = { ...H.config.tools, hidden: toolBoxes.map((l) => l.querySelector('input')).filter((i) => !i.checked).map((i) => i.dataset.id) };
      const result = await saveConfig();
      dialog.close();
      if (result && result.hotkeyOk === false) toast(`The hotkey "${hotkey.value}" couldn't be registered (another app may use it).`, { type: 'error' });
      else if (result && result.quickIdeaKeyOk === false) toast(`The 💡 Quick idea key "${result.quickIdeaKey}" is off: ${result.quickIdeaWhy || 'another app uses it'}. The tray menu still has 💡 Quick idea…`, { type: 'error' }); // (round 71, quickidea71)
      else toast('Settings saved', { timeout: 1500 });
    });
    dialog.append(form);
    if (typeof SettingsFind !== 'undefined') try { SettingsFind.mount(form, section, { query }); } catch (err) { console.warn(err); }
    for (const sec of form.querySelectorAll('.settings-section')) if (!sec.querySelector(':scope > :not(h3):not(.sf-slot)')) (sec.closest('details.sc-fold:not(.sc-adv)') || sec).remove(); // a home no switch came to
    paintStates();
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  async function createShortcuts() {
    const r = await window.hub.createShortcuts();
    if (r.error) toast(`Couldn't create shortcuts: ${r.error}`, { type: 'error' });
    else if (r.installed) toast(`Hearth is already installed as an app: ${r.installed}`);
    else if (/Mac/.test(navigator.platform)) toast('Made Hearth.app in your Applications folder. For a full install (out of Downloads, into /Applications), run mac/install-mac.sh.', { timeout: 10000 });
    else toast('Added Hearth to the Start menu and your desktop. Open it again any time to restart the app.');
  }
  async function packForMac() {
    const t = toast('Packing Hearth for your Mac…', { timeout: 60000 });
    try {
      const r = await window.hub.packForMac();
      t.remove();
      if (r?.path) toast(`Packed (${fmtBytes(r.size)}). Copy it to the Mac, unzip it, then run mac/setup-mac.sh (see mac/README.md inside).`, { timeout: 12000, action: { label: 'Show', fn: () => window.hub.fs.reveal(r.path) } });
    } catch (err) { t.remove(); toast(`Couldn't pack: ${err.message}`, { type: 'error' }); }
  }
  async function exportData() {
    const r = await window.hub.exportData();
    if (r?.path) toast(`Backup saved (${fmtBytes(r.size)})`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(r.path) } });
  }

  // ---------- command palette ----------
  const actions = [];
  function addAction(label, run, keys = '') { actions.push({ label, run, keys }); }
  // (round 29, fastboot) a big batch (every chat command as a "/name — what it does" line) keeps its place in the list
  // but is made when something first reads the actions (the palette), or in an idle moment: not at the first frame
  let later = 0;
  function addActionsLater(build) {
    actions.push({ label: '', later: build });
    later += 1;
    (window.requestIdleCallback || setTimeout)(flushLater, { timeout: 4000 });
  }
  function flushLater() {
    if (!later) return;
    for (let i = 0; i < actions.length; i += 1) {
      if (!actions[i].later) continue;
      const made = [];
      try { actions[i].later((label, run, keys = '') => made.push({ get label() { return typeof label === 'function' ? label() : label; }, run, keys })); } catch (err) { console.warn('palette actions', err); }
      actions.splice(i, 1, ...made);
      i += made.length - 1;
      later -= 1;
    }
  }
  addAction('Restart Hearth', () => window.hub.restartApp());

  function fuzzy(query, text) {
    if (!query) return 1;
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    const i = t.indexOf(q);
    if (i >= 0) return 100 - i;
    let ti = 0;
    let score = 0;
    for (const ch of q) {
      const found = t.indexOf(ch, ti);
      if (found < 0) return 0;
      score += found === ti ? 3 : 1;
      ti = found + 1;
    }
    return score;
  }

  function paletteItems() {
    const items = [];
    for (const a of H.agents()) items.push({ kind: 'Agent', label: a.name, keys: H.railKey?.(a.id) || '', run: () => activate(a.id) });
    for (const t of Tools.all()) { // (round 53) the tools off the rail too: Ctrl/⌘+K still opens them
      items.push({ kind: 'Tool', label: t.name, keys: H.railKey?.(`tool:${t.id}`) || '', run: () => activate(`tool:${t.id}`) });
      for (const c of t.commands || []) items.push({ kind: t.name, label: c.label, run: () => { activate(`tool:${t.id}`); setTimeout(c.run, 50); } });
    }
    for (const c of H.chats) {
      const a = H.agent(c.agentId);
      if (a) items.push({ kind: `${a.name} chat`, label: c.title, chat: true, run: () => Native.open(a.id, c.id) });
    }
    for (const [agentId, list] of Object.entries(H.history)) {
      const a = H.agent(agentId);
      if (a) for (const h of list.slice(0, 50)) items.push({ kind: `${a.name} chat`, label: h.title, run: () => openWebChat(agentId, h.url) });
    }
    flushLater();
    for (const act of actions) items.push({ kind: 'Action', label: act.label, keys: act.keys, run: act.run });
    const ranked = typeof SpeedRank !== 'undefined' ? SpeedRank.palette(items) : items; // (round 13) what you pick most here, now, first; ↻ Again on top
    // (round 37, appsearch) Find anything: rows say what they do (no "/name"), and it indexes them with everything else
    const f = finder();
    return f ? f.prepare(ranked) : ranked;
  }
  // (round 37, appsearch) Find anything (appsearch.js, lazy group "appsearch", loaded the first time the palette opens):
  // plain words, synonyms and typos over Settings, ⋯ AI setup, menus, missions, chats and their messages, the Lab, patch
  // notes and "how do I…"; until it's in, the plain match below
  const finder = () => (window.Lazy && !Lazy.isIn('appsearch') ? null : typeof AppSearch !== 'undefined' ? AppSearch : null);

  // (round 17, hz240) the palette is built once and reused: opening it fills the same rows (text written only where
  // it changed), one listener each for clicks and pointing (they were one pair per row, rebuilt per keystroke), the
  // items are gathered once per opening (twice before), and the arrow keys scroll the list in the next frame
  let pal = null;
  function paletteNode() {
    if (pal) return pal;
    // (round 40, a11y) a combobox over a listbox: the arrows move aria-activedescendant, screen readers read the row
    const input = el('input', { class: 'palette-input', placeholder: 'Find anything: a setting, a chat, an action, “how do I…”', attrs: { 'aria-label': 'Find anything', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', 'aria-autocomplete': 'list' } });
    const list = el('div', { class: 'palette-list', id: 'palette-list', attrs: { role: 'listbox', 'aria-label': 'Results' } });
    const box = el('div', { class: 'palette', attrs: { role: 'dialog', 'aria-label': 'Find anything' } }, el('div', { class: 'palette-card' }, input, list));
    pal = { box, input, list, items: [], shown: [], sel: 0, selEl: null, rows: [], empty: el('div', { class: 'palette-empty' }), scrollFrame: 0 };
    const close = () => box.remove();
    const run = (it) => { close(); it.run(); };
    const debounced = debounce(() => paletteRender(), 120);
    list.addEventListener('click', (e) => { const r = e.target.closest('.palette-item'); const it = r && pal.shown[r.__i]; if (it) run(it); });
    list.addEventListener('mousemove', (e) => { const r = e.target.closest('.palette-item'); if (r && r.__i !== pal.sel) { pal.sel = r.__i; paletteMark(); } }, { passive: true });
    input.addEventListener('input', () => {
      // "/" hands over to the command bar (chat commands over any tool, cmdbar.js)
      if (input.value.startsWith('/') && window.Lazy?.isIn && !Lazy.isIn('cmdbar')) { const t = input.value; close(); Lazy.load('cmdbar').then(() => CmdBar.open(t)).catch(() => {}); return; } // (round 29: it loads after the first screen)
      if (input.value.startsWith('/') && typeof CmdBar !== 'undefined') { const t = input.value; close(); CmdBar.open(t); return; }
      pal.sel = 0; if (input.value.startsWith('?')) debounced(); else paletteRender();
    });
    const step = (d) => { pal.sel = Math.max(0, Math.min(pal.sel + d, pal.shown.length - 1)); paletteMark(); pal.scrollFrame ||= requestAnimationFrame(() => { pal.scrollFrame = 0; pal.selEl?.scrollIntoView({ block: 'nearest' }); }); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = pal.shown[pal.sel]; if (it) { Usage.track(`Command palette › ${it.label}`); run(it); } }
    });
    box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
    return pal;
  }
  const setText = (n, t) => { if (n.textContent !== t) n.textContent = t; };
  function paletteMark() {
    const next = pal.shown.length ? pal.rows[pal.sel] : null;
    if (pal.selEl === next) return;
    pal.selEl?.classList.remove('sel'); pal.selEl?.setAttribute('aria-selected', 'false'); next?.classList.add('sel'); next?.setAttribute('aria-selected', 'true'); pal.selEl = next;
    if (next) pal.input.setAttribute('aria-activedescendant', next.id); else pal.input.removeAttribute('aria-activedescendant');
  }
  async function paletteRender() {
    const { input, list } = pal;
    const q = input.value.trim();
    if (q.startsWith('?')) {
      const hits = await window.hub.searchChatText(q.slice(1));
      pal.shown = hits.map((h) => ({ kind: `${H.agent(h.agentId)?.name || h.agentId} · ${h.count} match${h.count === 1 ? '' : 'es'}`, label: h.title, detail: h.snippet, run: () => Native.open(h.agentId, h.id) }));
    } else {
      // (each item's text is lower-cased once per opening, not on every keystroke)
      const ql = q.toLowerCase();
      // (round 18, tidy) nothing typed: a short list, not a thousand rows: ↻ Again, your agents and tools (with their
      // keys), what you pick most here, your latest chats; typing searches everything
      if (!ql) { let chats = 0; pal.shown = pal.items.filter((it) => ['Again', 'Agent', 'Tool'].includes(it.kind) || it.used || (it.chat && chats++ < 5)).slice(0, 30); }
      else if (finder()) pal.shown = finder().find(q);
      else pal.shown = pal.items.map((it) => ({ ...it, score: fuzzy(ql, it.hay ||= `${it.label} ${it.kind}`.toLowerCase()) })).filter((it) => it.score > 0)
        .sort((a, b) => b.score - a.score).slice(0, 60);
    }
    pal.sel = Math.min(pal.sel, Math.max(0, pal.shown.length - 1));
    if (!pal.shown.length) {
      setText(pal.empty, q.startsWith('?') ? 'No messages match' : 'Nothing matches');
      if (list.childElementCount !== 1 || list.firstChild !== pal.empty) list.replaceChildren(pal.empty);
      pal.selEl = null;
      return;
    }
    if (pal.empty.isConnected) pal.empty.remove();
    pal.shown.forEach((it, i) => {
      let r = pal.rows[i];
      if (!r) {
        r = el('div', { class: 'palette-item', id: `pal-row-${i}`, attrs: { role: 'option', 'aria-selected': 'false' } }, el('span', { class: 'p-label' }), el('span', { class: 'p-detail' }), el('span', { class: 'p-kind' }));
        r.__i = i; pal.rows[i] = r;
      }
      const [label, detail, kind] = r.children;
      setText(label, it.label.replace(/^\/[\w:.-]+\s+—\s+/, '')); // (round 37) never a "/name" on screen, even before Find anything is in
      setText(detail, it.detail || ''); if (detail.hidden !== !it.detail) detail.hidden = !it.detail;
      setText(kind, it.keys ? `${it.kind} · ${Commands.keyText(it.keys)}` : it.kind);
      if (r.parentNode !== list || list.children[i] !== r) list.insertBefore(r, list.children[i] || null);
    });
    while (list.childElementCount > pal.shown.length) list.lastElementChild.remove();
    pal.selEl?.classList.remove('sel'); pal.selEl?.setAttribute('aria-selected', 'false'); pal.selEl = null; paletteMark();
  }
  // opening is split in two: the card shows at once with the last opening's items (usually the same list), and the
  // fresh, ranked items arrive in the next task (gathering and ranking them is the long part); what you've typed by
  // then is kept and searched in them
  let palFresh = 0;
  function palette(initial = '') {
    const p = paletteNode();
    p.input.value = initial; p.sel = 0;
    if (!p.box.isConnected) document.body.append(p.box);
    p.input.focus();
    const n = ++palFresh;
    // (round 37, appsearch) the first opening loads Find anything; what's typed by then is searched in it
    if (window.Lazy && !Lazy.isIn('appsearch')) Lazy.load('appsearch').then(() => { AppSearch.warm(); if (!p.box.isConnected) return; p.items = paletteItems(); paletteRender(); }).catch(() => {});
    if (!p.items.length) { p.items = paletteItems(); paletteRender(); return; } // the first opening: all at once
    paletteRender();
    setTimeout(() => { if (n !== palFresh || !p.box.isConnected) return; p.items = paletteItems(); paletteRender(); }, 0);
  }

  // ---------- find in page ----------
  let findBar = null;
  function find() {
    if (findBar) { findBar.querySelector('input').select(); return; }
    const s = H.surfaces.get(H.activeId);
    const view = s?.webview || s?.el.querySelector('.tabpane:not([hidden]) webview');
    // (round 72, chatwindow72) on a chat: its own find (it reaches the resting messages of a long chat too)
    const cv = !view && typeof ChatUX !== 'undefined' && Native.view?.(H.activeId);
    if (cv?.root?.offsetParent) { ChatUX.find(H.activeId); return; }
    const input = el('input', { placeholder: 'Find…' });
    const count = el('span', { class: 'find-count' });
    const go = (forward = true, findNext = true) => {
      const text = input.value;
      if (!text) { count.textContent = ''; return; }
      if (view) view.findInPage(text, { forward, findNext });
      else window.hub.findStart(text, { forward, findNext });
    };
    const close = () => {
      if (view) view.stopFindInPage('keepSelection'); else window.hub.findStop();
      findBar.remove();
      findBar = null;
    };
    findBar = el('div', { class: 'find-bar' }, input, count,
      el('button', { text: '↑', title: 'Previous (Shift+Enter)', on: { click: () => go(false) } }),
      el('button', { text: '↓', title: 'Next (Enter)', on: { click: () => go(true) } }),
      el('button', { text: '×', title: 'Close (Esc)', on: { click: close } }));
    const onResult = (r) => { if (r.finalUpdate !== false && findBar) count.textContent = r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : 'No matches'; };
    if (view) view.addEventListener('found-in-page', (e) => onResult(e.result));
    else findResultHandler = onResult;
    input.addEventListener('input', () => go(true, false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); go(!e.shiftKey); }
      if (e.key === 'Escape') close();
    });
    document.body.append(findBar);
    input.focus();
  }
  let findResultHandler = null;
  window.hub.onFindResult((r) => findResultHandler?.(r));

  // ---------- shortcuts help ----------
  const SHORTCUTS = [
    ['Ctrl+K', 'Find anything: settings, AI setup, menus, chats and their messages, “how do I…”'], ['Ctrl+;', 'Command bar: run a /command over any tool (↑ history, ? help)'], ['Ctrl+1…9', 'The rail, top to bottom: agents, then tools'], ['Ctrl+Tab', 'Previous agent/tool (press again to go further back)'],
    ['Ctrl+N', 'New native chat'], ['Ctrl+F', 'Find in the current view'], ['Ctrl+J', 'Notes'], ['Ctrl+\\', 'Show/hide chats panel'],
    ['Ctrl+G', 'All agents side by side'], ['Ctrl+Shift+Space', 'Ask all agents'], ['Ctrl+B', 'Show/hide ask-all bar'],
    ['Ctrl + / − / 0', 'Text size'], ['Ctrl+R', 'Reload website'], ['Ctrl+Shift+R', 'Reload the hub itself'], ['Ctrl+,', 'Settings'], ['Ctrl+/', 'This list'],
    ['Enter / Shift+Enter', 'Send / new line in a chat'], ['/', 'Chat commands (at the start of the message box; /help lists them)'], ['Esc', 'Stop the reply being written'],
    ['Alt+T / Alt+R', 'In a chat box: open / close thinking · read the last reply aloud'], ['Alt+B / Alt+P / Alt+M', 'In a chat box: bookmark / pin / menu of the last reply'],
    ['Alt+F', 'Find in this chat'], ['Alt+↑ / Alt+↓', 'Messages you sent before (in the chat box)'], ['Ctrl+Shift+U', 'Token & usage dashboard'],
    ['Ctrl+V (image)', 'Attach a screenshot to a native chat'], ['Ctrl+Enter', 'Run code in Three.js Lab and shader playground'],
    ['Ctrl+/ (in code)', 'Toggle comment'], ['Ctrl+D (in code)', 'Duplicate line'], ['Ctrl+Alt+H', 'Show/hide the hub from anywhere (configurable)'],
    ['Ctrl+Shift+S', 'Snapshot the window into the chat you\'re using'], ['Ctrl+Shift+T', 'Keep Hearth on top of other windows'],
    ['Ctrl+Shift+L', 'Appearance: looks, textures, glow, motion (/theme, /appearance in any chat)'],
  ];
  // Keys inside the Three.js Lab sketch (when you're not typing).
  const LAB_SHORTCUTS = [
    ['Space', 'Play / pause'], ['← →', 'Nudge 10 ms (Alt 1 ms, Shift a grid step)'], ['[ ]', 'Loop start / end at the playhead'],
    ['K S H', 'Kick / snare / hit marker at the playhead'], ['C', 'Drop a hot cue'], ['1…9', 'Jump to cue 1…9'],
    ['A', 'Show / hide every animated curve'], ['W', 'Write: record slider / knob moves as curves while it plays'], ['N', 'Note with a screenshot'], ['F', 'Freeze the picture (Shift+F: Focus)'], ['P', 'Present: fullscreen preview'], ['R / Shift+R', 'Shuffle the sliders / the shuffle before'], ['Shift+1…5', 'Frame size: Fit, 9:16, 16:9, 4:5, 1:1'], ['T / Shift+T', 'Tap tempo / this tap is the 1'],
    ['X / Shift+X', 'FX picker: effects & layers / everything'], ['Shift+A / B / C', 'Recall slider slot A, B, C'], ['Alt+1…9', 'Hide / show layer 1…9 (Shift: solo)'],
    ['Ctrl+S / Ctrl+Shift+S', 'Save the sliders into the code / as a look (in the Lab)'], ['Alt+N', 'Code ⇄ nodes (in the Lab code view)'], ['O / `', 'Your sketches / console'], ['?', 'Every Lab key'],
    ['Shift+drag (lane)', 'Select points'], ['Ctrl+drag (lane)', 'Draw points'], ['Alt+drag (selection)', 'Stretch the swing'],
    ['Ctrl+C / V / D / A', 'Copy, paste at playhead, duplicate, select all points'], ['Delete', 'Delete selected points / marker'], ['Ctrl+Z', 'Undo grid, marker, cue or curve change'],
  ];
  function shortcutsHelp() {
    Modal.confirm('Keyboard shortcuts', '').then(() => {});
    const dlg = document.querySelector('dialog.ui-modal:last-of-type');
    const mac = /Mac/.test(navigator.platform);
    // (round 31, winmac) the global hotkey is the Control key on a Mac (⌃⌥H), not ⌘
    // (round 49) through WinMac.keyLabel: ⇧⌘U / Ctrl+Shift+U, ⌃Tab on the Mac (⌘Tab is the system's)
    const keyText = (k) => (typeof WinMac !== 'undefined' && WinMac.keyLabel ? WinMac.keyLabel(k, { mac }) : mac && k === 'Ctrl+Alt+H' ? '⌃⌥H' : mac ? k.replace(/Ctrl\+/g, '⌘').replace(/Ctrl /g, '⌘ ').replace(/Alt\+/g, '⌥') : k);
    const rows = (list) => list.map(([k, d]) => el('tr', {}, el('td', {}, el('kbd', { text: keyText(k) })), el('td', { text: d })));
    dlg.querySelector('.modal-text').replaceWith(el('div', { class: 'shortcut-cols' },
      el('div', {}, el('h4', { text: 'Everywhere' }), el('table', { class: 'shortcut-table' }, rows(SHORTCUTS))),
      el('div', {}, el('h4', { text: 'Three.js Lab' }), el('table', { class: 'shortcut-table' }, rows(LAB_SHORTCUTS)))));
    dlg.classList.add('wide');
    dlg.querySelector('.dialog-actions button[type=button]')?.remove();
  }

  // ---------- window snapshot → chat ----------
  // Ctrl+Shift+S: a picture of the window goes into the chat you're using (the docked director in a tool,
  // the agent you're on, or Claude), ready to send with a message.
  async function snapshotToChat() {
    const active = H.activeId || '';
    const toolId = active.startsWith('tool:') ? active.slice(5) : null;
    const agent = (toolId && H.agents().find((a) => a.dock === toolId && a.mode === 'native'))
      || (H.agent(active)?.mode === 'native' ? H.agent(active) : null) || H.claudeAgent();
    if (!agent) { toast('No chat agent to send it to', { type: 'error' }); return; }
    try {
      const p = await window.hub.captureWindow();
      await Native.attachPaths(agent.id, [p]);
      const visible = toolId || H.agent(active)?.id === agent.id;
      toast(`Window snapshot attached to ${agent.name}: write what you want and send`, {
        timeout: 4000,
        action: visible ? { label: 'Show file', fn: () => window.hub.fs.reveal(p) } : { label: `Open ${agent.name}`, fn: () => activate(agent.id) },
      });
    } catch (err) { toast(`Couldn't take the snapshot: ${err.message}`, { type: 'error' }); }
  }
  // Ctrl+Shift+T: keep the window above others (handy next to a game or a video).
  let onTop = false;
  async function toggleOnTop() {
    onTop = await window.hub.setOnTop(!onTop);
    document.body.classList.toggle('on-top', onTop);
    toast(onTop ? 'Hearth stays on top of other windows (Ctrl+Shift+T to stop)' : 'Hearth no longer stays on top', { timeout: 1800 });
  }

  // ---------- zoom ----------
  function zoom(delta) {
    // (round 38, bigscreen) the size of everything is kept per screen (Auto on a big monitor): bigscreen.js decides
    if (typeof Bigscreen !== 'undefined') { Bigscreen.zoomStep(delta); return; }
    const next = delta === 0 ? 1 : Math.min(2, Math.max(0.6, Math.round((window.hub.getZoom() + delta) * 10) / 10));
    window.hub.setZoom(next);
    store.set('zoom.app', next);
    toast(`Text size ${Math.round(next * 100)}%`, { timeout: 1000 });
  }

  // ---------- recent switcher ----------
  let mruIndex = 0;
  let mruTimer;
  let mruSnapshot = [];
  function switchRecent(back) {
    if (!mruIndex) mruSnapshot = [...H.mru];
    mruIndex = (mruIndex + (back ? -1 : 1) + mruSnapshot.length) % Math.max(mruSnapshot.length, 1);
    const id = mruSnapshot[mruIndex] || mruSnapshot[0];
    clearTimeout(mruTimer);
    mruTimer = setTimeout(() => { mruIndex = 0; }, 1200);
    if (!id) return;
    const s = H.surfaces.get(id);
    if (!s) return;
    const saved = H.mru;
    activate(id);
    H.mru = saved; // only commit to the MRU order once the switching pauses
    clearTimeout(mruTimer);
    mruTimer = setTimeout(() => { mruIndex = 0; H.mru = [id, ...saved.filter((m) => m !== id)]; }, 1200);
    const name = H.isTool(id) ? Tools.get(id.slice(5))?.name : H.agent(id)?.name;
    toast(`→ ${name}`, { timeout: 900 });
  }

  // ---------- reply notifications & unread badges ----------
  async function replyFinished(agentId, chatId, text, ms) {
    const agent = H.agent(agentId);
    if (!agent) return;
    const focused = await window.hub.isWindowFocused();
    // Docked chats count as on screen whenever their tool is.
    // ...except when Focus / Present hides the dock.
    const dockHidden = Boolean(agent.dock) && (document.body.classList.contains('lab-focus') || Boolean(document.fullscreenElement));
    const onScreen = H.surfaceIdFor(H.activeId) === H.surfaceIdFor(agentId) && !dockHidden;
    const visible = focused && (onScreen || H.grid) && H.activeChat[agentId] === chatId;
    if (visible) return;
    if (!(focused && onScreen)) { H.unread.add(agentId); renderRail(); }
    if (H.settings().notify === false) return;
    // In the app but looking elsewhere: a small note you can click.
    if (focused && !document.fullscreenElement) {
      const gist = (text || '').replace(/[#*`>_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
      const note = toast(`${agent.name} replied${gist ? `: ${gist}${gist.length >= 90 ? '…' : ''}` : ''}`, {
        timeout: 6000,
        action: { label: 'Open', fn: () => { if (dockHidden) document.querySelector('.lab-focus-exit')?.click(); Native.open(agentId, chatId); } },
      });
      if (typeof ChatScenes !== 'undefined') ChatScenes.markToast(note, chatId); // a director chat's color + mark
    }
    if (!focused) {
      window.hub.flashWindow();
      // (round 44, notify) Electron's own notification, only for a reply that took more than ~20 s (ms unknown: told),
      // one per chat (a newer one replaces it), under Settings › Advanced › Tell me when… › Replies
      if (window.Notify) { Notify.send({ type: 'reply', agentId, chatId, text, ms, failed: /^Error: /.test(text || ''), title: typeof ChatScenes !== 'undefined' ? ChatScenes.noteTitle(chatId, `${agent.name} replied`) : undefined }); return; }
      const n = new Notification(typeof ChatScenes !== 'undefined' ? ChatScenes.noteTitle(chatId, `${agent.name} replied`) : `${agent.name} replied`, { body: (text || '').replace(/[#*`>_]/g, '').slice(0, 160), silent: false });
      n.onclick = () => { window.hub.showWindow(); Native.open(agentId, chatId); };
    }
  }

  // ---------- downloads ----------
  // This session's downloads plus a log of the last 100 finished ones (kv 'downloads-log'), searchable.
  const downloads = new Map();
  let dlLog = null;
  let dlView = null; // the open Downloads dialog's repaint
  const dlHistory = async () => { dlLog ||= await window.hub.kvGet('downloads-log', []); return dlLog; };
  function onDownload(d) {
    const had = downloads.has(d.id);
    downloads.set(d.id, d);
    if (!had) toast(`Downloading ${d.name}…`, { timeout: 2500 });
    if (d.state === 'completed') toast(`Downloaded ${d.name}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(d.path) }, timeout: 8000 });
    if (d.state === 'interrupted' || d.state === 'cancelled') toast(`Download ${d.state}: ${d.name}`, { type: 'error' });
    if (d.state !== 'progressing') {
      dlHistory().then((list) => { dlLog = [{ ...d, at: Date.now() }, ...list.filter((x) => x.id !== d.id)].slice(0, 100); window.hub.kvSet('downloads-log', dlLog); });
    }
    dlView?.();
  }
  async function downloadsDialog({ query = '' } = {}) {
    const history = await dlHistory();
    const dlg = el('dialog', { class: 'ui-modal downloads-dialog' });
    const q = el('input', { type: 'search', placeholder: 'Search downloads…', value: query });
    const list = el('div', { class: 'download-list' });
    const folderOf = (p) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
    const paint = () => {
      const rows = [...new Map([...history, ...[...downloads.values()].reverse()].map((d) => [d.id, d])).values()]
        .sort((a, b) => (b.state === 'progressing') - (a.state === 'progressing') || (b.at || Date.now()) - (a.at || Date.now()))
        .filter((d) => !q.value || `${d.name} ${d.url || ''}`.toLowerCase().includes(q.value.toLowerCase()));
      list.replaceChildren(...(rows.length ? rows.map((d) => {
        const pct = d.total ? Math.round((d.received / d.total) * 100) : null;
        return el('div', { class: `download-row ${d.state}` },
          el('span', { class: 'dl-name', text: d.name, title: d.url || d.path }),
          d.state === 'progressing' ? el('span', { class: 'dl-bar', title: `${pct ?? '?'}%` }, el('span', { style: { width: `${pct ?? 30}%` } })) : null,
          el('span', { class: 'hint', text: d.state === 'completed' ? `${fmtBytes(d.total || d.received)}${d.at ? ` · ${timeAgo(d.at)}` : ''}` : d.state === 'progressing' ? `${pct ?? '?'}% of ${d.total ? fmtBytes(d.total) : '?'}` : d.state }),
          el('button', { type: 'button', class: 'ghost small', text: 'Open', disabled: d.state !== 'completed', on: { click: () => window.hub.fs.open(d.path) } }),
          el('button', { type: 'button', class: 'ghost small', text: 'Show', on: { click: () => window.hub.fs.reveal(d.path) } }),
          d.url && d.state !== 'completed' ? el('button', { type: 'button', class: 'ghost small', text: 'Try again', title: 'Opens the link in your browser', on: { click: () => window.hub.openExternal(d.url) } }) : null,
          d.url ? el('button', { type: 'button', class: 'ghost small', text: '🔗', title: 'Copy the link', on: { click: () => copyText(d.url, 'Link') } }) : null);
      }) : [el('p', { class: 'hint', text: history.length || downloads.size ? 'Nothing matches.' : 'Nothing downloaded yet. Files you download from website agents land in your Downloads folder and show up here.' })]));
    };
    q.addEventListener('input', paint);
    const latest = [...downloads.values()].at(-1) || history[0];
    dlg.append(el('form', { method: 'dialog', on: { keydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); } } }, el('h2', { text: 'Downloads' }), q, list,
      el('div', { class: 'dialog-actions' },
        latest ? el('button', { type: 'button', class: 'ghost small', text: 'Open the folder', on: { click: () => window.hub.fs.open(folderOf(latest.path)) } }) : null,
        el('button', { type: 'button', class: 'ghost small', text: 'Clear the list', title: 'Forgets the list (the files stay)', on: { click: async () => { dlLog = []; history.length = 0; for (const [id, d] of downloads) if (d.state !== 'progressing') downloads.delete(id); await window.hub.kvSet('downloads-log', []); paint(); } } }),
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => { dlg.remove(); dlView = null; });
    document.body.append(dlg);
    dlView = () => { if (dlg.isConnected) paint(); };
    paint();
    dlg.showModal();
    return dlg;
  }

  // ---------- recently deleted chats ----------
  const dataDir = async () => { const a = await window.hub.attachmentsDir(); return a.slice(0, Math.max(a.lastIndexOf('/'), a.lastIndexOf('\\'))); };
  const sepOf = (p) => (p.includes('\\') ? '\\' : '/');
  async function trashDialog({ query = '' } = {}) {
    let items = await window.hub.listChatTrash();
    const dlg = el('dialog', { class: 'ui-modal trash-dialog' });
    const q = el('input', { type: 'search', placeholder: 'Search deleted chats…', value: query });
    const list = el('div', { class: 'download-list' });
    const refreshChats = async () => { H.chats = await window.hub.listChats(); Panel.render(); };
    const restore = async (c) => { await window.hub.restoreChat(c.id); items = items.filter((x) => x !== c); };
    const forever = async (cs) => {
      const dir = await dataDir(); const sep = sepOf(dir);
      const r = await window.hub.fs.trash(cs.map((c) => `${dir}${sep}trash${sep}${c.id}.json`));
      const gone = new Set(r.done.map((p) => p.split(/[\\/]/).pop().replace(/\.json$/, '')));
      items = items.filter((x) => !gone.has(x.id));
      if (r.failed.length) toast(`${r.failed.length} couldn't be moved: ${r.failed[0].error}`, { type: 'error' });
      return r;
    };
    const peek = async (c) => {
      const dir = await dataDir();
      try {
        const chat = JSON.parse(await window.hub.fs.read(`${dir}${sepOf(dir)}trash${sepOf(dir)}${c.id}.json`));
        Modal.alert(c.title, chat.messages.slice(0, 6).map((m) => `${m.role === 'user' ? 'You' : H.agent(chat.agentId)?.name || 'Agent'}: ${(m.text || '').slice(0, 280)}`).join('\n\n') || '(empty)');
      } catch (err) { toast(err.message, { type: 'error' }); }
    };
    const paint = () => {
      const rows = items.filter((c) => !q.value || `${c.title} ${H.agent(c.agentId)?.name || ''}`.toLowerCase().includes(q.value.toLowerCase()));
      list.replaceChildren(...(rows.length ? rows.map((c) => el('div', { class: 'download-row' },
        el('span', { class: 'dl-name', text: c.title, title: c.title }),
        el('span', { class: 'hint', text: `${H.agent(c.agentId)?.name || c.agentId} · ${c.messages} msgs · deleted ${timeAgo(c.deletedAt)} · ${Math.max(0, 30 - Math.floor((Date.now() - c.deletedAt) / 864e5))} d left` }),
        el('button', { type: 'button', class: 'ghost small', text: 'Peek', on: { click: () => peek(c) } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Restore', on: { click: async () => { await restore(c); await refreshChats(); paint(); toast(`Restored "${c.title}"`, { timeout: 2000 }); } } }),
        el('button', { type: 'button', class: 'ghost small danger', text: '×', title: 'Delete for good (to the Recycle Bin / Trash)', on: { click: async () => { await forever([c]); paint(); } } })))
        : [el('p', { class: 'hint', text: items.length ? 'Nothing matches.' : 'Nothing deleted in the last 30 days.' })]));
    };
    q.addEventListener('input', paint);
    dlg.append(el('form', { method: 'dialog', on: { keydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); } } }, el('h2', { text: 'Recently deleted chats' }),
      el('p', { class: 'hint', text: 'Deleted chats are kept here for 30 days. Deleting them for good moves the files to your Recycle Bin / Trash.' }), q, list,
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'ghost small', text: 'Restore all', on: { click: async () => { for (const c of [...items]) await restore(c); await refreshChats(); paint(); } } }),
        el('button', { type: 'button', class: 'ghost small danger', text: 'Empty…', on: { click: async () => { if (!items.length || !(await Modal.confirm('Empty recently deleted?', `${items.length} chat(s) go to your Recycle Bin / Trash.`, { ok: 'Empty', danger: true }))) return; await forever([...items]); items = await window.hub.listChatTrash(); paint(); } } }),
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    paint();
    dlg.showModal();
    return dlg;
  }

  // ---------- backups ----------
  // One-click backups to a folder (settings.backupDir, default Documents/Hearth backups), the list of them, and a
  // restore that merges (adds what's missing; never deletes anything of yours). /backup, /restore.
  async function backupNow({ quiet = false } = {}) {
    // (round 45, backupauto) checked after it's written, big media once, the rotation, failures in plain words
    if (window.BackupAuto) { const r = await BackupAuto.backupNow({ quiet }); return r?.ok ? r : null; }
    const t = quiet ? null : toast('Backing up…', { timeout: 60000 });
    try {
      const r = await window.hub.backup.now({ keep: H.settings().backupKeep || 10 });
      t?.remove();
      store.set('backup.last', Date.now());
      if (!quiet) toast(`Backup saved (${fmtBytes(r.size)})${r.removed ? ` · ${r.removed} old one(s) to the bin` : ''}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(r.path) } });
      return r;
    } catch (err) { t?.remove(); toast(`Backup failed: ${err.message}`, { type: 'error' }); return null; }
  }
  function restoreText(r) {
    return [`Chats: ${r.chats.add} to add${r.chats.newer ? ` · ${r.chats.newer} newer in the backup` : ''}${r.chats.older ? ` · ${r.chats.older} older in the backup (yours kept)` : ''} · ${r.chats.same} identical`,
      r.kv.merge?.length ? `Brought back into your lists (what you don't have; nothing removed): ${r.kv.merge.map((m) => `${m.name === 'three-sketches' ? 'Lab scenes' : m.name} +${m.n}`).slice(0, 8).join(', ')}` : '',
      r.media?.add ? `Big media files to bring back: ${r.media.add}` : '',
      `Tool data (notes, prompts, sketches…): ${r.kv.add} to add${r.kv.differ.length ? ` · ${r.kv.differ.length} differ (yours kept): ${r.kv.differ.slice(0, 8).join(', ')}${r.kv.differ.length > 8 ? '…' : ''}` : ''}`,
      `Memory: ${r.memory.add} line(s) to add · Attachments: ${r.attachments.add} to add`,
      r.agentsMissing.length ? `Agents in the backup you don't have (add them by hand): ${r.agentsMissing.join(', ')}` : '',
      r.titles.length ? `\nFor example: ${r.titles.slice(0, 5).map((t) => `"${t}"`).join(', ')}` : ''].filter(Boolean).join('\n');
  }
  async function restoreBackup(file) {
    file ||= await window.hub.backup.pick();
    if (!file) return null;
    let r;
    try { r = await window.hub.backup.restore(file, { dryRun: true }); } catch (err) { toast(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), { type: 'error' }); return null; }
    const nothing = !r.chats.add && !r.chats.newer && !r.kv.add && !r.memory.add && !r.attachments.add && !r.kv.merge?.length && !r.media?.add;
    if (nothing) { Modal.alert('Nothing to restore', `Everything in that backup is already here.\n\n${restoreText(r)}`); return r; }
    const v = await new Promise((resolve) => {
      const newer = el('input', { type: 'checkbox' });
      const d = el('dialog', { class: 'ui-modal' });
      d.append(el('form', { method: 'dialog' }, el('h2', { text: 'Restore from backup' }),
        el('p', { class: 'modal-text pre-line', text: `Adds what's missing here; nothing of yours is deleted.\n\n${restoreText(r)}` }),
        r.chats.newer ? el('label', { class: 'check' }, newer, `Also replace ${r.chats.newer} chat(s) with the backup's newer version (yours are kept in data/trash first)`) : null,
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
          el('button', { type: 'button', text: 'Cancel', on: { click: () => d.close() } }),
          el('button', { type: 'submit', class: 'primary', text: 'Restore', value: 'ok' }))));
      d.addEventListener('close', () => { d.remove(); resolve(d.returnValue === 'ok' ? { newer: newer.checked } : null); });
      document.body.append(d);
      d.showModal();
    });
    if (!v) return null;
    const done = await window.hub.backup.restore(file, { dryRun: false, newer: Boolean(v.newer) });
    H.chats = await window.hub.listChats();
    Panel.render();
    toast(`Restored: ${done.chats.add} chat(s)${done.chats.replaced ? `, ${done.chats.replaced} updated` : ''}, ${done.kv.add} tool store(s)${done.kv.merge?.length ? `, ${done.kv.merge.reduce((a, m) => a + m.n, 0)} item(s) back in your lists` : ''}, ${done.memory.add} memory line(s), ${done.attachments.add} attachment(s). Reload to see restored tool data.`, { timeout: 9000, action: { label: 'Reload', fn: () => window.hub.reloadWindow() } });
    return done;
  }
  async function backupsDialog() {
    // (round 45, backupauto) Settings › Backups: by date, what's inside, checked, Restore missing things, Show in Finder /
    // Explorer, where this computer keeps them (backupauto.js); this older dialog only if that can't load
    if (!window.BackupAuto && window.Lazy?.load) { try { await Lazy.load('backupauto'); } catch { /* the older dialog */ } }
    if (window.BackupAuto) return BackupAuto.dialog();
    const dlg = el('dialog', { class: 'ui-modal backups-dialog' });
    const list = el('div', { class: 'download-list' });
    const dirLabel = el('code', {});
    const auto = el('select', { title: 'Back up automatically when the last backup is older than this' },
      [['0', 'Off'], ['1', 'Daily'], ['7', 'Weekly'], ['30', 'Monthly']].map(([v, t]) => el('option', { value: v, text: t, selected: String(H.settings().autoBackupDays || 0) === v })));
    auto.addEventListener('change', async () => { H.config.settings = { ...H.config.settings, autoBackupDays: Number(auto.value) || undefined }; await saveConfig(); toast('Saved', { timeout: 1000 }); });
    const paint = async () => {
      const { dir, items } = await window.hub.backup.list();
      dirLabel.textContent = dir;
      list.replaceChildren(...(items.length ? items.map((b) => el('div', { class: 'download-row' },
        el('span', { class: 'dl-name', text: b.name }), el('span', { class: 'hint', text: `${fmtBytes(b.size)} · ${timeAgo(b.mtime)}` }),
        el('button', { type: 'button', class: 'ghost small', text: 'Restore…', on: { click: async () => { await restoreBackup(b.path); } } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Show', on: { click: () => window.hub.fs.reveal(b.path) } })))
        : [el('p', { class: 'hint', text: 'No backups in this folder yet.' })]));
    };
    dlg.append(el('form', { method: 'dialog' }, el('h2', { text: 'Backups' }),
      el('p', { class: 'hint' }, 'Chats, notes, prompts, memory, tool data, settings and theme (never website logins). Folder: ', dirLabel, ' ',
        el('button', { type: 'button', class: 'ghost small', text: 'Change…', on: { click: async () => { const f = await window.hub.pickFolder(dirLabel.textContent, 'Backup folder'); if (f) { H.config.settings = { ...H.config.settings, backupDir: f }; await saveConfig(); setTimeout(paint, 300); } } } })),
      list,
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'primary small', text: 'Back up now', on: { click: async () => { await backupNow(); paint(); } } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Save a copy as…', on: { click: exportData } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Restore from a file…', on: { click: () => restoreBackup() } }),
        // (round 43, scenesafe → datasafe) 🛟 Recover…: lost chats, memory lines, settings, tool data and Lab scenes from
        // backups and every other copy, added next to yours (datasafe.js; the Lab scenes row opens tools/three-scenesafe.js)
        el('button', { type: 'button', class: 'ghost small', text: 'Recover…', title: 'Lost chats, memory, settings, tool data and Lab scenes from backups, automatic copies or sync, added next to yours', on: { click: async () => { dlg.close(); try { if (!window.DataSafe && window.Lazy) await window.Lazy.load('datasafe'); await window.DataSafe?.recover(); } catch (err) { toast(err.message, { type: 'error' }); } } } }),
        el('label', { class: 'hint' }, 'Auto ', auto),
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    await paint();
    dlg.showModal();
    return dlg;
  }
  // At start-up: a quiet backup when auto backup is on and the newest one is older than its interval.
  async function autoBackup() {
    if (window.hub?.backupauto) return false; // (round 45, backupauto) the main process backs up by itself (powerwise's schedule)
    const days = H.settings().autoBackupDays;
    if (!days) return false;
    const { items } = await window.hub.backup.list();
    const newest = Math.max(items[0]?.mtime || 0, store.get('backup.last', 0));
    if (Date.now() - newest < days * 864e5) return false;
    return Boolean(await backupNow({ quiet: true }));
  }

  // ---------- usage stats ----------
  async function usageDialog() {
    if (typeof Meter !== 'undefined') return Meter.dashboard(); // the token meter's dashboard replaces this list
    const usage = await window.hub.getUsage();
    const days = Object.keys(usage).sort().reverse().slice(0, 14);
    const agents = [...new Set(days.flatMap((d) => Object.keys(usage[d])))];
    const totals = Object.fromEntries(agents.map((a) => [a, days.reduce((s, d) => s + (usage[d][a]?.input || 0) + (usage[d][a]?.output || 0), 0)]));
    const max = Math.max(1, ...days.map((d) => agents.reduce((s, a) => s + (usage[d][a]?.input || 0) + (usage[d][a]?.output || 0), 0)));
    const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
    const body = el('div', { class: 'usage' },
      el('div', { class: 'usage-totals' }, agents.length ? agents.map((a) => el('div', { class: 'usage-total' },
        el('span', { class: 'dot', style: { background: H.agent(a)?.color || 'var(--accent)' } }),
        el('b', { text: H.agent(a)?.name || a }), el('span', { text: `${fmt(totals[a])} tokens · ${days.reduce((s, d) => s + (usage[d][a]?.replies || 0), 0)} replies (14 days)` }))) : el('p', { class: 'hint', text: 'No native replies recorded yet.' })),
      el('div', { class: 'usage-chart' }, days.map((d) => el('div', { class: 'usage-row' },
        el('span', { class: 'usage-day', text: new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) }),
        el('div', { class: 'usage-bar' }, agents.map((a) => {
          const v = (usage[d][a]?.input || 0) + (usage[d][a]?.output || 0);
          return v ? el('span', { title: `${H.agent(a)?.name || a}: ${fmt(v)} tokens`, style: { width: `${(v / max) * 100}%`, background: H.agent(a)?.color || 'var(--accent)' } }) : null;
        })),
        el('span', { class: 'usage-val', text: fmt(agents.reduce((s, a) => s + (usage[d][a]?.input || 0) + (usage[d][a]?.output || 0), 0)) })))));
    Modal.confirm('Token usage', '').then(() => {});
    const dlg = document.querySelector('dialog.ui-modal:last-of-type');
    dlg.querySelector('.modal-text').replaceWith(body);
    dlg.querySelector('.dialog-actions button[type=button]')?.remove();
  }

  // ---------- resizable chats panel ----------
  function setupPanelResize() {
    const panel = $('panel');
    const handle = el('div', { class: 'panel-resize', title: 'Drag to resize · double-click to reset' });
    panel.append(handle);
    const saved = store.get('panelWidth', null);
    if (saved) document.documentElement.style.setProperty('--panel-w', `${saved}px`);
    handle.addEventListener('pointerdown', (e) => {
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = panel.getBoundingClientRect().width;
      document.body.classList.add('resizing');
      // (round 17, hz240) while dragging only the panel's own width changes, once a frame; the page-wide --panel-w
      // (a restyle of every element when set on <html>) is written once, when you let go
      let w = startW; let frame = 0;
      const move = (ev) => {
        w = Math.min(520, Math.max(170, startW + ev.clientX - startX));
        frame ||= requestAnimationFrame(() => { frame = 0; panel.style.width = `${w}px`; });
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        cancelAnimationFrame(frame); frame = 0;
        document.body.classList.remove('resizing');
        document.documentElement.style.setProperty('--panel-w', `${Math.round(w)}px`);
        panel.style.width = '';
        store.set('panelWidth', Math.round(w));
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up, { once: true });
    });
    handle.addEventListener('dblclick', () => {
      store.set('panelWidth', null);
      document.documentElement.style.setProperty('--panel-w', `${H.config.theme?.panelWidth || 250}px`);
    });
  }

  // ---------- errors ----------
  let lastError = '';
  function reportError(message) {
    if (!message || message === lastError) return;
    lastError = message;
    setTimeout(() => { lastError = ''; }, 5000);
    toast(`Something went wrong: ${message}`, { type: 'error', action: { label: 'Copy details', fn: () => copyText(message, 'Error') }, timeout: 8000 });
  }
  window.addEventListener('error', (e) => reportError(e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason?.message || String(e.reason)));

  // One time: back to Forgeheart for whoever was moved to Swirl automatically (Swirl stays in Settings → Theme).
  function offerSwirl() {
    if (H.config?.theme?.preset !== 'swirl' || !store.get('theme.swirlOffered') || store.get('theme.forgeBack')) return;
    store.set('theme.forgeBack', true);
    Look.applyPreset('forgeheart', { quiet: true });
  }
  function init() {
    const z = store.get('zoom.app', 1);
    if (z !== 1 && !window.hub.big) window.hub.setZoom(z); // (round 38: with bigscreen, the zoom is per screen, set before the first frame)
    setupPanelResize();
    window.hub.onDownload(onDownload);
    window.hub.onTray((what) => {
      if (what === 'palette') palette();
      if (what === 'new-chat') { const a = H.claudeAgent(); if (a) { activate(a.id); Native.newChat(a.id); } }
      if (what === 'ideas' || what === 'ideas-open') Lazy.load('quickidea').then(() => (what === 'ideas' ? QuickIdeas.deliver() : QuickIdeas.open())).catch((err) => console.warn('[quick idea]', err)); // (round 71, quickidea71) 💡
    });
    window.hub.onContextAction((what, text) => {
      if (what === 'ask') draftToClaude(`About this:\n\n> ${text.replace(/\n/g, '\n> ')}\n\n`);
      if (what === 'note') Notes.append(text);
    });

    addAction('New chat with Claude', () => { const a = H.claudeAgent(); if (a) { activate(a.id); Native.newChat(a.id); } }, 'Ctrl+N');
    addAction('Settings', openSettings, 'Ctrl+,');
    addAction('Keyboard shortcuts', shortcutsHelp, 'Ctrl+/');
    addAction('Find in current view', find, 'Ctrl+F');
    addAction('Toggle side-by-side grid', () => handleShortcut({ key: 'g' }), 'Ctrl+G');
    addAction('Toggle chats panel', () => handleShortcut({ key: '\\' }), 'Ctrl+\\');
    addAction('Notes', () => Notes.toggle(), 'Ctrl+J');
    addAction('Prompt library', () => Prompts.manage());
    addAction('Memory', () => MemoryEditor.open());
    addAction('Token usage', usageDialog);
    addAction('Recently deleted chats', trashDialog);
    addAction('Downloads', downloadsDialog);
    addAction('Stop all replies', async () => { const n = await window.hub.stopAll(); toast(n ? `Stopped ${n} repl${n === 1 ? 'y' : 'ies'}` : 'Nothing was running'); });
    addAction('Import past chats…', () => $('import-btn').click());
    addAction('Add an agent or website', () => Manager.open());
    addAction('Back up hub data…', exportData);
    addAction('Create Start menu & desktop shortcuts', createShortcuts);
    addAction('Pack Hearth for a Mac (app + your data + settings)', packForMac);
    addAction('Reload the hub', () => window.hub.reloadWindow(), 'Ctrl+Shift+R');
    addAction('Snapshot the window into the chat', snapshotToChat, 'Ctrl+Shift+S');
    addAction('Your usage: what you use and what you never touch', () => Usage.dialog());
    addAction('Keep Hearth on top / stop', toggleOnTop, 'Ctrl+Shift+T');
    for (const [id, t] of Object.entries(THEMES)) addAction(`Theme: ${t.label}`, () => Look.applyPreset(id));
  }

  // (round 37, appsearch) what it shows, again (rows that joined: a chat's messages, the Lab's things, patch notes)
  const paletteRefresh = () => { if (pal?.box.isConnected && !pal.input.value.startsWith('?')) paletteRender(); };
  return { actions: () => { flushLater(); return actions.slice(); }, addActionsLater, paletteRefresh, init, offerSwirl, openSettings, palette, find, shortcutsHelp, zoom, switchRecent, replyFinished, usageDialog, downloadsDialog, trashDialog, addAction, THEMES, snapshotToChat, toggleOnTop, backupsDialog, backupNow, restoreBackup, autoBackup, exportData, downloadHistory: dlHistory };
})();
