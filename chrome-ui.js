// Hearth's Chrome in the hub (round 30, chrome stream). Google refuses sign-in inside Hearth's embedded pages
// ("Couldn't sign you in — This browser or app may not be secure"); the owner asked "could we just use Chrome and hook
// into Chrome?". So, in plain words and without commands:
//   ⋯ AI setup › What it can use › Chrome: found or not, Open the Hearth Chrome, Sign in to Google, what opens there
//   a website chat (Gemini, ChatGPT, claude.ai…) can live in Chrome: automatic for Google-only sites, else the
//   rail's right-click › Open in Chrome, or the one-click offer when Google's refusal page shows in it
//   an app window's ⋯ › Open in Chrome (apps-window.js) and the same offer there (appsmain.js)
// Hearth keeps its hand on the Chrome pages (chromemain.js: the DevTools protocol): asking everyone types into a
// website chat in Chrome too, the AI's app tools read / click / type / take pictures there. Passwords: never here.
const ChromeUI = (() => {
  const api = () => window.hub?.chrome || null;
  // sites whose only sign-in is Google's (chrome-cdp.js GOOGLE_ONLY: the same list)
  const GOOGLE_ONLY = /^(gemini|aistudio|notebooklm|labs|docs|drive|mail|photos|keep|calendar|meet|colab\.research|myaccount|accounts|cloud|console\.cloud|ads|analytics|search\.google|jules|stitch|whisk|flow)\.google(\.com)?$|^labs\.google$|^(studio|music)\.youtube\.com$/i;
  const hostOf = (u) => { try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ''; } };
  const googleOnly = (url) => GOOGLE_ONLY.test(hostOf(url));
  const wants = (agent) => agent?.chrome === 'on' || (agent?.chrome !== 'off' && googleOnly(agent?.url));
  const akey = (id) => `agent:${id}`;
  let st = null; let stAt = 0;
  async function status(fresh = false) {
    if (!api()) return { found: null };
    if (!fresh && st && Date.now() - stAt < 15000) return st;
    try { st = await api().status({ fresh }); stAt = Date.now(); } catch (err) { st = { found: null, error: err.message }; }
    return st;
  }
  const say = (r, okText) => { if (r?.ok) { if (okText) toast(okText, { timeout: 4500 }); } else toast(r?.error || 'Chrome didn\'t answer', { type: 'error', timeout: 9000 }); return r; };

  // ---------- website chats in Chrome ----------
  const covers = new Map(); // agent id → { host, view, card }
  async function saveAgent(agent, v) {
    for (const t of new Set([agent, H.agent(agent.id)].filter(Boolean))) { if (v) t.chrome = v; else delete t.chrome; }
    await saveConfig();
  }
  async function showAgent(agent) {
    toast(`Opening ${agent.name} in Chrome…`, { timeout: 2500 });
    return say(await api().open({ key: akey(agent.id), url: agent.url, app: true }));
  }
  function card(agent) {
    const b = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    return el('div', { class: 'chr-cover' },
      el('div', { class: 'chr-card' },
        el('div', { class: 'chr-icon', text: '◍' }),
        el('h3', { text: `${agent.name} opens in Chrome` }),
        el('p', { text: 'Google signs in there (it refuses inside Hearth). Hearth still reaches the page: asking everyone types into it, and it stays signed in.' }),
        el('div', { class: 'chr-acts' },
          b('Show it in Chrome', 'Open or bring forward its Chrome window', () => showAgent(agent), 'primary small'),
          b('Sign in to Google…', 'Google\'s own page, in the Hearth Chrome', () => signIn()),
          b('Use it inside Hearth instead', 'Back to the page inside Hearth (Google sign-in may refuse there)', () => setAgent(agent, 'off')))));
  }
  // a website chat set to Chrome: its page inside Hearth stays empty, a card says where it is
  async function cover(agent, host, view) {
    const s = await status();
    if (!wants(agent) || !s.found) {
      uncover(agent.id);
      if (view.dataset.chrome) { delete view.dataset.chrome; try { view.loadURL(agent.url); } catch { view.src = agent.url; } }
      if (agent.chrome === 'on' && !s.found) toast(`${agent.name}: Chrome isn't on this computer, so it opens inside Hearth (install Google Chrome, Edge or Brave for Google sign-in).`, { timeout: 9000 });
      return false;
    }
    uncover(agent.id);
    const c = card(agent);
    host.classList.add('chr-host');
    host.append(c);
    covers.set(agent.id, { host, view, card: c });
    return true;
  }
  function uncover(id) { const c = covers.get(id); if (!c) return; c.card.remove(); c.host.classList.remove('chr-host'); covers.delete(id); }
  // 'on': in Chrome from now on · 'off': inside Hearth · null: automatic
  async function setAgent(agent, v) {
    await saveAgent(agent, v);
    const s = H.surfaces.get(agent.id);
    const view = s?.webview;
    if (!view) return;
    if (wants(H.agent(agent.id) || agent)) {
      view.dataset.chrome = '1';
      try { view.loadURL('about:blank'); } catch { /* not ready */ }
      if (await cover(H.agent(agent.id) || agent, s.el, view)) await showAgent(agent);
    } else {
      uncover(agent.id);
      delete view.dataset.chrome;
      try { view.loadURL(agent.url); } catch { view.src = agent.url; }
      toast(`${agent.name} is back inside Hearth`, { timeout: 2500 });
    }
  }
  // its Chrome window comes forward when the owner opens the chat (once it has one: nothing starts by itself)
  document.addEventListener('hearth:activate', async (e) => {
    const id = e.detail?.id;
    if (!covers.has(id) || !api()) return;
    const w = (await status(true)).windows || [];
    if (w.some((x) => x.key === akey(id))) api().page(akey(id), 'show').catch(() => {});
  });
  // asking everyone (renderer.js sendToWebsite): type into its chat box in Chrome, then Enter
  async function sendTo(agent, text, { enter = true } = {}) {
    const k = akey(agent.id);
    const s = await status(true);
    if (!(s.windows || []).some((x) => x.key === k)) { const r = await api().open({ key: k, url: agent.url, app: true }); if (!r?.ok) throw new Error(r?.error || 'Chrome didn\'t open'); }
    const sel = agent.inputSelector || 'div[contenteditable="true"], textarea';
    await api().page(k, 'wait', { timeout: 15000 });
    if (!(await api().page(k, 'wait', { selector: sel, timeout: 15000 }))?.value) throw new Error('no chat box found (signed in?)');
    const r = await api().page(k, 'type', { selector: sel, text, append: true });
    if (!r?.ok) throw new Error(r?.error || 'Couldn\'t type into it');
    if (enter) { await new Promise((res) => setTimeout(res, 200)); await api().page(k, 'key', { key: 'Enter' }); }
    return true;
  }

  // ---------- Google refused somewhere (main.js → chrome:offer) ----------
  function banner(agent, s) {
    s.el.querySelector('.chr-offer')?.remove();
    const bar = el('div', { class: 'chr-offer', attrs: { role: 'alert' } },
      el('span', { text: 'Google won\'t sign you in inside Hearth. Your real Chrome works, and Hearth can still reach the page there.' }),
      el('button', { class: 'primary small', text: 'Sign in with Chrome instead', on: { click: () => { bar.remove(); setAgent(agent, 'on'); } } }),
      el('button', { class: 'ghost small', text: 'My everyday Chrome', title: 'Open it in the Chrome you use every day (your own logins; Hearth can\'t reach it there)', on: { click: async () => { bar.remove(); say(await api().everyday(agent.url), 'Opened in your everyday Chrome'); } } }),
      el('button', { class: 'ghost small', text: '✕', title: 'Not now', on: { click: () => bar.remove() } }));
    s.el.prepend(bar);
    return bar;
  }
  function offer(o = {}) {
    for (const a of H.agents()) {
      const s = H.surfaces.get(a.id);
      let id = null;
      try { id = s?.webview?.getWebContentsId?.(); } catch { /* not ready */ }
      if (id && id === o.wcId) { if (H.surfaceIdFor(H.activeId) !== a.id) activate(a.id); return banner(a, s); }
    }
    if (!/^https?:/i.test(String(o.url || ''))) return null;
    toast('Google won\'t sign you in inside Hearth.', { timeout: 15000, action: { label: 'Sign in with Chrome instead', fn: async () => say(await api().open({ url: o.url, app: true }), 'Open in Chrome: sign in there') } });
    return null;
  }

  // ---------- the owner's own buttons ----------
  async function signIn({ plain = false } = {}) {
    if (plain && !(await Modal.confirm('Sign in without Hearth\'s hand on Chrome?', 'The Hearth Chrome closes and opens again on Google\'s sign-in page with nothing of Hearth attached (for the rare time Google still refuses). Your sign-in stays; the next time Hearth needs that Chrome it opens it again.', { ok: 'Open it' }))) return null;
    toast('Opening Google\'s sign-in page in Chrome…', { timeout: 3000 });
    return say(await api().signIn({ plain }), plain ? 'Sign in there, then close that Chrome window when you\'re done' : 'Sign in on Google\'s page in Chrome: it stays signed in');
  }
  async function openHearthChrome(url = 'https://myaccount.google.com/') { return say(await api().open({ key: 'home', url, app: false })); }
  // ⋯ AI setup › What it can use › Chrome
  function section() {
    const box = el('div', { class: 'chr-row-box' });
    const paint = async (fresh) => {
      const s = await status(fresh);
      const b = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: async () => { await fn(); paint(true); } } });
      const inChrome = [
        ...H.agents().filter((a) => a.mode === 'web' && wants(a)).map((a) => ({ label: a.name, back: () => setAgent(a, 'off') })),
        ...Object.entries(s.prefs?.apps || {}).filter(([, v]) => v === 'chrome').map(([id]) => ({ label: window.Apps?.get(id)?.name || id, back: () => window.hub.apps.chrome(id, 'hearth') })),
      ];
      box.replaceChildren(
        el('div', { class: 'opt-row', title: s.found ? `${s.found.path}\nIts own profile: ${s.profile}` : 'Hearth looks for Google Chrome, then Microsoft Edge and Brave' },
          el('span', { class: 'opt-label', text: 'Chrome (for Google sign-in)' }),
          el('span', { class: `chr-state${s.found ? ' good' : ''}`, text: s.found ? `${s.found.name}${s.controlled ? ' · open' : ' · found'}` : 'not found' }),
          s.found ? b('Open', 'Open the Hearth Chrome (its own profile: your everyday Chrome isn\'t touched)', () => openHearthChrome()) : b('Get Chrome', 'Google Chrome\'s download page, in your browser', () => window.hub.openExternal('https://www.google.com/chrome/')),
          s.found ? b('Sign in…', 'Sign in to Google once in the Hearth Chrome: it stays signed in', () => signIn()) : null,
          el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'More', on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, moreItems(paint)); } } })),
        el('p', { class: 'opt-hint', text: s.found ? 'Google refuses sign-in inside Hearth, so pages that need it open in your real Chrome; Hearth still reaches them there (the AI can read, click and type in app windows).' : 'Install Google Chrome (or Edge / Brave) for Google sign-in: Google refuses it inside Hearth.' }),
        inChrome.length ? el('div', { class: 'chr-list' }, el('span', { class: 'opt-hint', text: 'Open in Chrome: ' }), inChrome.map((x) => el('button', { type: 'button', class: 'chr-chip', text: `${x.label} ✕`, title: 'Back inside Hearth', on: { click: async () => { await x.back(); paint(true); } } }))) : null);
    };
    paint(false);
    return box;
  }
  const moreItems = (paint = () => {}) => [
    { label: 'Sign in without Hearth\'s hand on Chrome…', hint: 'if Google still refuses', action: () => signIn({ plain: true }).then(() => paint(true)) },
    { label: 'Close the Hearth Chrome', action: async () => { say(await api().quit(), 'Closed'); paint(true); } },
    { label: 'Show its profile folder', action: () => api().profile() },
    { label: 'Look for Chrome again', action: () => paint(true) },
  ];

  // ---------- commands (the app's internal API; the owner uses the buttons above) ----------
  if (typeof Commands !== 'undefined' && !Commands.get('chrome')) {
    Commands.register({
      name: 'chrome', area: 'Apps', args: 'status | open [url] | sign-in [plain] | everyday <url> | app <app> chrome|hearth|auto | here on|off|auto | pages | quit',
      desc: 'Google sign-in in your real Chrome: the Hearth Chrome (its own profile), what opens there, your everyday Chrome',
      keywords: 'google sign in login chrome browser not secure couldn\'t sign you in edge brave gemini',
      examples: ['/chrome', '/chrome sign-in', '/chrome app suno chrome', '/chrome here on', '/chrome everyday https://gemini.google.com'],
      complete: () => ['status', 'open', 'sign-in', 'sign-in plain', 'everyday', 'app', 'here on', 'here off', 'here auto', 'pages', 'quit'].map((value) => ({ value })),
      run: async (args, ctx) => {
        const [sub = 'status', ...rest] = String(args || '').trim().split(/\s+/).filter(Boolean);
        const s = sub.toLowerCase();
        if (s === 'status') { const x = await status(true); return x.found ? `${x.found.name} found (${x.found.path}). The Hearth Chrome is ${x.controlled ? `open (${x.pages} page${x.pages === 1 ? '' : 's'})` : x.plain ? 'open without Hearth\'s hand on it' : 'closed'}; its profile: ${x.profile}.` : 'No Chrome on this computer (Google Chrome, Edge or Brave): Google sign-in needs one.'; }
        if (s === 'open') { const r = await openHearthChrome(rest[0] || undefined); return r?.ok ? null : r?.error; }
        if (s === 'sign-in' || s === 'signin') { await signIn({ plain: rest[0] === 'plain' }); return null; }
        if (s === 'everyday') { const r = await api().everyday(rest[0]); return r?.ok ? `Opened in ${r.how}.` : r?.error; }
        if (s === 'quit') return (await api().quit())?.ok ? 'Closed the Hearth Chrome.' : 'It isn\'t open.';
        if (s === 'pages') { const r = await api().page(null, 'pages'); return r?.ok ? (r.value.map((p) => `- ${p.title || '(untitled)'} · ${p.url}${p.key ? ` · ${p.key}` : ''}`).join('\n') || 'No pages.') : r?.error; }
        if (s === 'app') {
          const app = window.Apps?.get(rest[0]);
          if (!app) return `No app "${rest[0] || ''}".`;
          const v = { chrome: 'chrome', on: 'chrome', hearth: 'hearth', off: 'hearth' }[String(rest[1] || 'chrome').toLowerCase()] || null;
          await window.hub.apps.chrome(app.id, v);
          if (v === 'chrome') await Apps.open(app.id).catch(() => {});
          return `${app.name} opens ${v === 'chrome' ? 'in Chrome' : v === 'hearth' ? 'inside Hearth' : 'by itself (Chrome when its sign-in is Google\'s)'} from now on.`;
        }
        if (s === 'here') {
          const a = H.agent(ctx.agentId) || H.agent(H.activeId);
          if (a?.mode !== 'web') return 'This works on a website chat (Gemini, ChatGPT, claude.ai…): open one first.';
          const v = { on: 'on', off: 'off' }[String(rest[0] || 'on').toLowerCase()] || null;
          await setAgent(a, v);
          return null;
        }
        return 'Try: /chrome, /chrome sign-in, /chrome app <app> chrome, /chrome here on';
      },
    });
  }
  try { AppUI.addAction('Chrome: open the Hearth Chrome (Google sign-in)', () => openHearthChrome()); AppUI.addAction('Chrome: sign in to Google in Chrome', () => signIn()); } catch { /* no palette */ }

  return { status, wants, googleOnly, cover, uncover, setAgent, sendTo, offer, banner, signIn, openHearthChrome, section, moreItems };
})();
window.ChromeUI = ChromeUI;
