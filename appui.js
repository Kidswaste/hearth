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
  async function openSettings() {
    const s = { ...H.settings() };
    const hidden = new Set(H.config.tools?.hidden || []);
    const field = (label, input, hint) => el('label', {}, label, input, hint ? el('span', { class: 'hint', text: hint }) : null);
    const check = (label, checked, hint) => {
      const input = el('input', { type: 'checkbox', checked: Boolean(checked) });
      return [el('label', { class: 'check' }, input, label, hint ? el('span', { class: 'hint inline', text: hint }) : null), input];
    };
    const startOn = el('select', {}, el('option', { value: '', text: 'Last used (first agent)' }),
      H.agents().map((a) => el('option', { value: a.id, text: a.name, selected: s.startOn === a.id })),
      Tools.all().map((t) => el('option', { value: `tool:${t.id}`, text: t.name, selected: s.startOn === `tool:${t.id}` })));
    const hotkey = el('input', { value: s.hotkey ?? 'Control+Alt+H', placeholder: 'e.g. Control+Alt+H (empty = off)' });
    const [trayRow, trayIn] = check('Closing the window keeps the hub running in the tray', s.closeToTray);
    const isMac = /Mac/.test(navigator.platform);
    const [startupRow, startupIn] = check(isMac ? 'Start Hearth when you log in (Mac: add Hearth.app in System Settings → General → Login Items)' : 'Start Hearth when Windows starts', s.launchAtStartup);
    const claudePath = el('input', { value: s.enginePaths?.claude || '', placeholder: 'Found automatically (Claude desktop app or the claude command)' });
    const codexPath = el('input', { value: s.enginePaths?.codex || '', placeholder: 'Found automatically (Codex / ChatGPT app or the codex command)' });
    const [notifyRow, notifyIn] = check('Notify me when a reply finishes while I\'m elsewhere', s.notify !== false);
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
    const form = el('form', { method: 'dialog' },
      el('h2', { text: 'Settings' }),
      // Round 4: what people change sits on top; the rest folds into "More settings" (all still here).
      section('General', field('Open on start', startOn), notifyRow),
      section('Appearance', Look.picker()),
      typeof Sync !== 'undefined' ? Sync.settingsSection(section) : null, // round 10: sync through your cloud drive
      el('details', { class: 'settings-more' }, el('summary', { text: 'More settings: startup, tray, hotkey, spell check, rail tools, engines, folders, backups' }),
      section('Startup and tray', trayRow, startupRow,
        field('Unload websites I haven\'t opened (frees memory; they load again when you open them)', sleepSel),
        field('Show/hide hotkey (works from anywhere)', hotkey, 'Uses Electron accelerator names: Control, Alt, Shift, Super, letters, Space, F1…')),
      section('Spell check languages', el('div', { class: 'check-grid' }, langBoxes)),
      section('Tools in the rail', el('div', { class: 'check-grid' }, toolBoxes)),
      section('Engines', field('Claude program (only if it isn\'t found)', claudePath), field('Codex program (only if it isn\'t found)', codexPath)),
      section('Folders', field('Forgeheart project', fhRow), field('Forgeheart debug build (runs beside the Forge Debug agent)', dbgRow), field('After Effects install (optional override)', aeRow), field('Where to look for .aep projects', aeDirs)),
      section('App',
        el('div', { class: 'button-row' },
          el('button', { type: 'button', class: 'ghost', text: isMac ? 'Create Hearth.app in Applications' : 'Create Start menu & desktop shortcuts', on: { click: createShortcuts } }),
          el('button', { type: 'button', class: 'ghost', text: 'Back up hub data…', on: { click: exportData } }),
          el('button', { type: 'button', class: 'ghost', text: 'Pack Hearth for a Mac…', title: 'One zip with the app, your chats, sketches, settings and memory, plus the Mac setup script', on: { click: packForMac } }),
          el('button', { type: 'button', class: 'ghost', text: 'Open data folder', on: { click: () => window.hub.openDataFolder() } }),
          el('button', { type: 'button', class: 'ghost', text: 'Edit config.json', on: { click: () => window.hub.openFile('config') } }),
          el('button', { type: 'button', class: 'ghost', text: 'Edit theme.css', on: { click: () => window.hub.openFile('theme') } })))),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
        el('button', { type: 'button', text: 'Cancel', on: { click: () => dialog.close() } }),
        el('button', { type: 'submit', class: 'primary', text: 'Save' })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.config.settings = {
        ...H.config.settings,
        startOn: startOn.value || undefined,
        closeToTray: trayIn.checked,
        launchAtStartup: startupIn.checked,
        notify: notifyIn.checked,
        sleepWebsAfter: Number(sleepSel.value) || undefined,
        hotkey: hotkey.value.trim(),
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
      else toast('Settings saved', { timeout: 1500 });
    });
    dialog.append(form);
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
    for (const a of H.agents()) items.push({ kind: 'Agent', label: a.name, run: () => activate(a.id) });
    for (const t of Tools.enabled()) {
      items.push({ kind: 'Tool', label: t.name, run: () => activate(`tool:${t.id}`) });
      for (const c of t.commands || []) items.push({ kind: t.name, label: c.label, run: () => { activate(`tool:${t.id}`); setTimeout(c.run, 50); } });
    }
    for (const c of H.chats) {
      const a = H.agent(c.agentId);
      if (a) items.push({ kind: `${a.name} chat`, label: c.title, run: () => Native.open(a.id, c.id) });
    }
    for (const [agentId, list] of Object.entries(H.history)) {
      const a = H.agent(agentId);
      if (a) for (const h of list.slice(0, 50)) items.push({ kind: `${a.name} chat`, label: h.title, run: () => openWebChat(agentId, h.url) });
    }
    for (const act of actions) items.push({ kind: 'Action', label: act.label, keys: act.keys, run: act.run });
    return items;
  }

  function palette(initial = '') {
    document.querySelector('.palette')?.remove();
    const input = el('input', { class: 'palette-input', placeholder: 'Jump to an agent, chat, tool or action…  (? searches chat messages · / chat commands)', value: initial });
    const list = el('div', { class: 'palette-list' });
    const box = el('div', { class: 'palette' }, el('div', { class: 'palette-card' }, input, list));
    let items = paletteItems();
    let shown = [];
    let sel = 0;
    const close = () => box.remove();
    const render = async () => {
      const q = input.value.trim();
      if (q.startsWith('?')) {
        const hits = await window.hub.searchChatText(q.slice(1));
        shown = hits.map((h) => ({ kind: `${H.agent(h.agentId)?.name || h.agentId} · ${h.count} match${h.count === 1 ? '' : 'es'}`, label: h.title, detail: h.snippet, run: () => Native.open(h.agentId, h.id) }));
      } else {
        shown = items.map((it) => ({ ...it, score: fuzzy(q, `${it.label} ${it.kind}`) })).filter((it) => it.score > 0)
          .sort((a, b) => b.score - a.score).slice(0, 60);
      }
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.replaceChildren(...(shown.length ? shown.map((it, i) => el('div', {
        class: `palette-item${i === sel ? ' sel' : ''}`,
        on: { click: () => { close(); it.run(); }, mousemove: () => { if (sel !== i) { sel = i; paint(); } } },
      }, el('span', { class: 'p-label', text: it.label }), it.detail ? el('span', { class: 'p-detail', text: it.detail }) : null,
      el('span', { class: 'p-kind', text: it.keys ? `${it.kind} · ${Commands.keyText(it.keys)}` : it.kind }))) : [el('div', { class: 'palette-empty', text: q.startsWith('?') ? 'No messages match' : 'Nothing matches' })]));
    };
    const paint = () => [...list.children].forEach((c, i) => c.classList.toggle('sel', i === sel));
    const debounced = debounce(render, 120);
    input.addEventListener('input', () => {
      // "/" hands over to the command bar (chat commands over any tool, cmdbar.js)
      if (input.value.startsWith('/') && typeof CmdBar !== 'undefined') { const t = input.value; close(); CmdBar.open(t); return; }
      sel = 0; if (input.value.startsWith('?')) debounced(); else render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); paint(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = shown[sel]; if (it) { close(); Usage.track(`Command palette › ${it.label}`); it.run(); } }
    });
    box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
    document.body.append(box);
    input.focus();
    items = paletteItems();
    render();
  }

  // ---------- find in page ----------
  let findBar = null;
  function find() {
    if (findBar) { findBar.querySelector('input').select(); return; }
    const s = H.surfaces.get(H.activeId);
    const view = s?.webview || s?.el.querySelector('.tabpane:not([hidden]) webview');
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
    ['Ctrl+K', 'Command palette (type ? to search messages, / for chat commands)'], ['Ctrl+;', 'Command bar: run a /command over any tool (↑ history, ? help)'], ['Ctrl+1…9', 'Switch agent'], ['Ctrl+Tab', 'Previous agent/tool (press again to go further back)'],
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
    const keyText = (k) => (mac ? k.replace(/Ctrl\+/g, '⌘').replace(/Ctrl /g, '⌘ ').replace(/Alt\+/g, '⌥') : k);
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
  async function replyFinished(agentId, chatId, text) {
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
    const nothing = !r.chats.add && !r.chats.newer && !r.kv.add && !r.memory.add && !r.attachments.add;
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
    toast(`Restored: ${done.chats.add} chat(s)${done.chats.replaced ? `, ${done.chats.replaced} updated` : ''}, ${done.kv.add} tool store(s), ${done.memory.add} memory line(s), ${done.attachments.add} attachment(s). Reload to see restored tool data.`, { timeout: 9000, action: { label: 'Reload', fn: () => window.hub.reloadWindow() } });
    return done;
  }
  async function backupsDialog() {
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
      const move = (ev) => {
        const w = Math.min(520, Math.max(170, startW + ev.clientX - startX));
        document.documentElement.style.setProperty('--panel-w', `${w}px`);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        document.body.classList.remove('resizing');
        store.set('panelWidth', Math.round(panel.getBoundingClientRect().width));
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
    if (z !== 1) window.hub.setZoom(z);
    setupPanelResize();
    window.hub.onDownload(onDownload);
    window.hub.onTray((what) => {
      if (what === 'palette') palette();
      if (what === 'new-chat') { const a = H.claudeAgent(); if (a) { activate(a.id); Native.newChat(a.id); } }
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

  return { actions: () => actions.slice(), init, offerSwirl, openSettings, palette, find, shortcutsHelp, zoom, switchRecent, replyFinished, usageDialog, downloadsDialog, trashDialog, addAction, THEMES, snapshotToChat, toggleOnTop, backupsDialog, backupNow, restoreBackup, autoBackup, exportData, downloadHistory: dlHistory };
})();
