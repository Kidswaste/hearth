// An app window's chrome (round 14, apps stream): the slim bar above an app's website. Back, reload, the app's name
// (a click lists the other apps), where you are, downloads from this app (each with "→ Lab / board / Video Review"),
// send this page to the chat, open it in your browser, ⋯ for the rest. The website itself runs in a <webview> in
// its own persistent session; nothing on the page can reach Hearth. Keys: Ctrl/⌘+R reload, Alt+← / ⌘[ back,
// Alt+→ / ⌘] forward, Ctrl/⌘+L copy the address, Ctrl/⌘+Shift+Enter send to the chat, Ctrl/⌘+W hide.
(() => {
  const $ = (id) => document.getElementById(id);
  const mk = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'on') for (const [e, f] of Object.entries(v)) n.addEventListener(e, f); else n[k] = v;
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  };
  let spec = {}; let view = null; let downloads = []; let catalog = []; let url = ''; let title = '';
  let toastTimer = 0;
  function toast(text, ms = 2600) { const t = $('aw-toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }
  const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  // ---------- popovers (one at a time) ----------
  function pop(anchor, rows) {
    const p = $('aw-pop');
    if (!p.hidden && p.__anchor === anchor) { closePop(); return; }
    p.replaceChildren(...rows);
    p.__anchor = anchor;
    p.hidden = false;
    const r = anchor.getBoundingClientRect();
    p.style.top = `${r.bottom + 4}px`;
    p.style.left = `${Math.max(6, Math.min(r.left, innerWidth - p.offsetWidth - 8))}px`;
  }
  function closePop() { const p = $('aw-pop'); p.hidden = true; p.__anchor = null; }
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#aw-pop, .aw-btn, .aw-app')) closePop(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  const item = (label, run, hint) => mk('button', { class: 'aw-item', on: { click: () => { closePop(); run(); } } }, mk('span', { text: label }), hint ? mk('small', { text: hint }) : null);
  const head = (text) => mk('div', { class: 'aw-head', text });

  // ---------- the page ----------
  function where() {
    let host = '';
    try { const u = new URL(url); host = `${u.hostname.replace(/^www\./, '')}${u.pathname.length > 1 ? u.pathname : ''}`; } catch { host = url; }
    $('aw-where').textContent = title ? `${title} — ${host}` : host;
    $('aw-back').disabled = !view?.canGoBack?.();
  }
  function state() { window.appWin.state({ url, title }); where(); }
  function go(op) {
    if (!view) return;
    if (op === 'back' && view.canGoBack()) view.goBack();
    else if (op === 'forward' && view.canGoForward()) view.goForward();
    else if (op === 'reload') view.reload();
    else if (op === 'home') view.loadURL(spec.url);
    else if (op === 'close') window.appWin.hide();
    else if (op === 'to-chat') toChat();
    else if (op === 'copy-link') { navigator.clipboard.writeText(url).then(() => toast('Address copied')); }
    else if (op?.op === 'url' && /^https?:/i.test(op.url)) view.loadURL(op.url).catch(() => {});
    else if (op?.op === 'hint') toast(op.text, 9000);
  }
  async function toChat() {
    let selection = '';
    try { selection = await view.executeJavaScript('String(getSelection() || "")', false); } catch { /* the page may block it */ }
    toast('Sending to the chat…');
    await window.appWin.toChat({ url, title, selection });
    toast('Sent: it waits in the chat\'s composer');
  }

  // ---------- downloads ----------
  function paintDl() {
    const live = downloads.filter((d) => d.state === 'progressing').length;
    $('aw-dl').hidden = !downloads.length;
    $('aw-dl-n').textContent = live ? String(live) : downloads.length ? String(downloads.length) : '';
    $('aw-dl').classList.toggle('busy', live > 0);
    if (!$('aw-pop').hidden && $('aw-pop').__anchor === $('aw-dl')) dlPop(true);
  }
  function dlPop(refresh) {
    const rows = downloads.length ? downloads.map((d) => {
      const done = d.state === 'completed';
      const routes = done ? AppsCore.routesFor(d.name, spec.routes || {}).slice(0, 4) : [];
      return mk('div', { class: 'aw-dl' },
        mk('div', { class: 'aw-dl-name', text: d.name, title: d.path }),
        mk('div', { class: 'aw-dl-sub', text: done ? `${fmtBytes(d.total || d.received)} · in Downloads/Hearth/${d.appName}` : d.state === 'progressing' ? `${d.total ? Math.round(100 * d.received / d.total) : '…'} %` : d.state }),
        done ? mk('div', { class: 'aw-dl-go' }, routes.map((r) => mk('button', { class: 'aw-chip', text: r.label, on: { click: () => { closePop(); window.appWin.route(d.id, r.id); toast(r.id === 'reveal' ? 'Showing it' : 'Sent to Hearth'); } } }))) : null);
    }) : [mk('div', { class: 'aw-empty', text: 'Nothing downloaded from this app yet.' })];
    const all = [head(`Downloads · ${spec.name}`), ...rows, item('📂 Open the downloads folder', () => window.appWin.reveal(''))];
    if (refresh) { $('aw-pop').replaceChildren(...all); return; }
    pop($('aw-dl'), all);
  }

  // ---------- menus ----------
  function appsPop() {
    const groups = {};
    for (const a of catalog) if (a.id !== spec.id && !a.hidden) (groups[a.group || 'More'] ||= []).push(a);
    const rows = [head('Open another app')];
    for (const [g, list] of Object.entries(groups)) { rows.push(mk('div', { class: 'aw-sub', text: g })); for (const a of list) rows.push(item(`${a.icon || '▣'} ${a.name}`, () => window.appWin.openApp(a.id), a.hint || '')); }
    pop($('aw-app'), rows);
  }
  function morePop() {
    const zoom = (d) => { const z = d ? Math.max(0.3, Math.min(3, view.getZoomFactor() + d)) : 1; view.setZoomFactor(z); toast(`Zoom ${Math.round(z * 100)} %`, 1200); };
    pop($('aw-more'), [
      ...(spec.actions || []).map((a) => item(a.label, () => window.appWin.action(a.id, { url, title }), a.hint)),
      (spec.actions || []).length ? mk('hr') : null,
      item('Copy the address', () => go('copy-link'), '⌘L'.replace('⌘', spec.mac ? '⌘' : 'Ctrl+')),
      item('Forward', () => go('forward')),
      item(`Back to ${spec.name}'s start page`, () => go('home')),
      item('Zoom in', () => zoom(0.1)), item('Zoom out', () => zoom(-0.1)), item('Actual size', () => zoom(0)),
      item('📂 Downloads folder', () => window.appWin.reveal('')),
      mk('hr'),
      item(`Sign out of ${spec.name} here…`, async () => { if (confirm(`Sign out of ${spec.name} in Hearth? Its saved login and site data in this window are cleared (nothing else).`)) { await window.appWin.signOut(); toast('Signed out'); } }),
      item('Hide this window', () => go('close'), spec.mac ? '⌘W' : 'Ctrl+W'),
    ]);
  }

  // ---------- text into the page (Suno's boxes): fill a box like typing, read it back ----------
  const FILL = (text, field, strict) => `(() => {
    const text = ${JSON.stringify(text)}; const field = ${JSON.stringify(field)}; const strict = ${strict ? 'true' : 'false'};
    const vis = (n) => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width > 20 && r.height > 10 && s.visibility !== 'hidden' && s.display !== 'none' && !n.disabled && !n.readOnly; };
    const all = [...document.querySelectorAll('textarea, input[type=text], input:not([type]), input[type=search], [contenteditable=""], [contenteditable="true"]')].filter(vis);
    const label = (n) => [n.placeholder, n.getAttribute('aria-label'), n.name, n.id, n.getAttribute('data-testid'), n.closest('label') && n.closest('label').textContent].filter(Boolean).join(' ').toLowerCase();
    const re = { lyrics: /lyric|song text|words/, style: /style|genre|tags|sound/, title: /title|song name/, prompt: /prompt|describe|description|idea/ }[field];
    const act = document.activeElement && all.includes(document.activeElement) ? document.activeElement : null;
    const hit = re && all.find((n) => re.test(label(n)));
    if (strict && re && !hit) return { ok: false, error: 'no ' + field + ' box' };
    const t = hit || act || all.find((n) => n.tagName === 'TEXTAREA') || all[0];
    if (!t) return { ok: false, error: 'no text box on this page' };
    t.focus();
    if (t.isContentEditable) { document.execCommand('selectAll'); document.execCommand('insertText', false, text); }
    else {
      const proto = t.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(t, text);
      t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { ok: true, field, box: label(t).trim().slice(0, 60), length: String(t.value != null ? t.value : t.textContent).length };
  })()`;
  async function pasteIn({ reqId, text, field, strict }) {
    let r = { ok: false, error: 'The page isn\'t ready' };
    for (let i = 0; i < 20 && view?.isLoading?.(); i += 1) await new Promise((res) => setTimeout(res, 300));
    try { r = await view.executeJavaScript(FILL(text, field, strict), true); } catch (err) { r = { ok: false, error: err.message }; }
    if (!r?.ok && strict) { /* the caller tries another box */ } else if (!r?.ok) {
      try { await navigator.clipboard.writeText(text); r = { ...r, copied: true }; } catch { /* no clipboard */ }
      toast(r.copied ? `Copied: click ${field ? `the ${field} box` : 'the box'} and paste (${spec.mac ? '⌘V' : 'Ctrl+V'})` : 'Couldn\'t find a text box on this page', 5000);
    } else toast(`Pasted into ${field || 'the page'} ✓`);
    window.appWin.pasteResult(reqId, r);
  }

  // ---------- start ----------
  (async () => {
    const init = await window.appWin.init();
    if (!init) return;
    spec = { ...init.spec, mac: init.mac }; downloads = init.downloads || []; catalog = init.catalog || []; url = init.url;
    document.body.classList.toggle('mac', Boolean(init.mac));
    for (const [k, v] of Object.entries(spec.theme || {})) if (/^--[\w-]+$/.test(k)) document.documentElement.style.setProperty(k, String(v));
    if (spec.color) document.documentElement.style.setProperty('--aw-app', spec.color);
    document.title = `${spec.name} · Hearth`;
    $('aw-icon').textContent = spec.icon || '▣';
    $('aw-name').textContent = spec.name;
    view = document.createElement('webview');
    view.setAttribute('partition', spec.partition);
    view.setAttribute('allowpopups', '');
    view.setAttribute('src', url || spec.url);
    view.className = 'aw-view';
    $('aw-main').append(view);
    const nav = (e) => { if (e.isMainFrame === false) return; url = e.url || view.getURL(); state(); };
    view.addEventListener('did-navigate', nav);
    view.addEventListener('did-navigate-in-page', nav);
    view.addEventListener('page-title-updated', (e) => { title = e.title || ''; state(); });
    view.addEventListener('did-start-loading', () => { $('aw-load').hidden = false; });
    view.addEventListener('did-stop-loading', () => { $('aw-load').hidden = true; where(); });
    view.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3 || !e.isMainFrame) return; // -3: a navigation replaced by another
      toast(`${spec.name} didn't load (${e.errorDescription || e.errorCode}). Offline? ↻ tries again.`, 6000);
    });
    $('aw-back').addEventListener('click', () => go('back'));
    $('aw-back').addEventListener('contextmenu', (e) => { e.preventDefault(); go('forward'); });
    $('aw-reload').addEventListener('click', () => go('reload'));
    $('aw-ext').addEventListener('click', () => window.appWin.external(url));
    $('aw-chat').addEventListener('click', toChat);
    $('aw-dl').addEventListener('click', () => dlPop());
    $('aw-more').addEventListener('click', morePop);
    $('aw-app').addEventListener('click', appsPop);
    $('aw-where').addEventListener('click', () => go('copy-link'));
    window.appWin.onDownloads((list) => { downloads = list || []; paintDl(); });
    window.appWin.onCatalog((list) => { catalog = list || []; });
    window.appWin.onNavigate((u) => { if (/^https?:/i.test(u)) view.loadURL(u).catch(() => {}); });
    window.appWin.onKey(go);
    window.appWin.onPaste(pasteIn);
    addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
      if ((mod && k === 'r') || e.key === 'F5') { e.preventDefault(); go('reload'); } else if ((e.altKey && e.key === 'ArrowLeft') || (mod && k === '[')) go('back');
      else if ((e.altKey && e.key === 'ArrowRight') || (mod && k === ']')) go('forward'); else if (mod && k === 'w') { e.preventDefault(); go('close'); } else if (mod && k === 'l') go('copy-link');
    });
    paintDl();
    where();
  })();
})();
