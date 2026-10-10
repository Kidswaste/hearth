// Discover, favorites, search and "send to app" (round 14, apps stream; the owner: "feel free to make me discover
// things"). Discover surfaces a few apps you haven't opened yet that fit what you're doing right now (the Lab → 3D and
// video AI, the board → image AI, a song in the Lab → music AI, the editor → video editing AI, a chat → research and
// site builders), each with one line on why. At most once a day a quiet "Try this" note (dismiss it twice and that app
// is never suggested again; /apps discover off stops the notes). What you open is remembered (kv 'apps-habits'), so an
// app you know stops being suggested. Favorites (★) and recents come first in the Apps menu and the search picker.
// Send to app: a board picture, a Lab still, your newest render or a file goes on the clipboard (a picture as a
// picture, else its path, its folder shown) and the app's window opens with a hint to paste / upload: no private APIs.
const AppsDiscover = (() => {
  const KV = 'apps-habits';
  let S = null; // { opened: { id: { n, last } }, dismissed: { id: n }, chipDay, off, favs: [] }
  async function load() { S ||= { opened: {}, dismissed: {}, chipDay: '', off: false, favs: [], ...(await window.hub.kvGet(KV, {})) }; return S; }
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => window.hub.kvSet(KV, S), 300); };
  const today = () => new Date().toISOString().slice(0, 10);
  load();

  // ---------- habits ----------
  async function noteOpen(id) { await load(); const o = S.opened[id] || { n: 0, last: 0 }; S.opened[id] = { n: o.n + 1, last: Date.now() }; save(); }
  const opened = (id) => Boolean(S?.opened?.[id]);
  async function dismiss(id) { await load(); S.dismissed[id] = (S.dismissed[id] || 0) + 1; save(); }
  const isFav = (id) => Boolean(S?.favs?.includes(id));
  async function toggleFav(id, on) { await load(); const want = on ?? !S.favs.includes(id); S.favs = want ? [...S.favs.filter((x) => x !== id), id] : S.favs.filter((x) => x !== id); save(); return want; }
  const favs = () => (S?.favs || []).map((id) => Apps.get(id)).filter(Boolean);
  let songAt = 0;
  Apps.on('routed', (r) => { if (r.target === 'lab-song') songAt = Date.now(); });

  // ---------- what you're doing now ----------
  const WHY = { lab: 'You\'re in the Lab', song: 'A song is in the Lab', board: 'You\'re on the board', edit: 'You\'re cutting video', chat: 'You\'re chatting' };
  function context() {
    const id = H.activeId || '';
    const sid = H.surfaceIdFor?.(id) || id;
    const out = [];
    if (sid === 'tool:three') {
      const noSong = [...document.querySelectorAll('[data-id="tool:three"] button')].some((b) => /Load audio \/ video/.test(b.textContent));
      if (songAt || !noSong) out.push('song');
      out.push('lab');
    } else if (sid === 'tool:board') out.push('board');
    else if (sid === 'tool:ae') out.push('edit');
    else out.push('chat');
    return out;
  }
  // a stable order that changes each day, so the same three don't come back every time
  const rot = (s) => { let h = 2166136261; for (const ch of `${s}${today()}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  function suggest(n = 3, where = context()) {
    const pool = Apps.list().filter((a) => a.web && a.fits && !opened(a.id) && (S?.dismissed?.[a.id] || 0) < 2);
    const out = [];
    for (const w of [...where, 'lab', 'board', 'song', 'edit', 'chat']) {
      for (const a of pool.filter((x) => x.fits.includes(w)).sort((x, y) => rot(x.id) - rot(y.id))) {
        if (out.length >= n) break;
        if (!out.some((o) => o.app.id === a.id)) out.push({ app: a, where: w, why: `${WHY[w]}: ${a.desc}` });
      }
      if (out.length >= n) break;
    }
    return out;
  }

  // ---------- the quiet "Try this" note, at most once a day ----------
  async function maybeChip({ force = false } = {}) {
    await load();
    if (S.off || (!force && S.chipDay === today())) return null;
    if (!force && performance.now() < 120000) return null; // not while Hearth is starting
    if (!force && window.SMOKE_SAVES) return null; // never on its own in the headless test runs (their toasts are counted)
    const [s] = suggest(1);
    if (!s) return null;
    S.chipDay = today(); save();
    const node = toast(`✨ Try ${s.app.name}: ${s.why}`, { timeout: 15000, action: { label: `Open ${s.app.name}`, fn: () => Apps.open(s.app.id) } });
    node.classList.add('apps-try');
    node.querySelector('.toast-x')?.addEventListener('click', () => dismiss(s.app.id));
    return s;
  }
  let viewT = 0;
  addEventListener('hearth:view', () => { clearTimeout(viewT); viewT = setTimeout(() => maybeChip().catch(() => {}), 20000); });
  async function setOff(off) { await load(); S.off = off; save(); return off; }

  // ---------- pickers ----------
  const row = (a, why) => ({ label: `${a.icon} ${a.name}`, hint: why || a.desc || '', feature: `App: ${a.name}`, action: () => Apps.open(a.id).catch((err) => toast(err.message, { type: 'error' })) });
  // the top of the Apps menu: ✨ Discover (3), ★ favorites
  function menuTop() {
    const d = suggest(3);
    return [
      ...(d.length ? [{ label: '✨ Discover', hint: d.map((x) => x.app.name).join(', '), items: () => [...d.map((x) => row(x.app, x.why)), '-', { label: 'More to discover…', action: () => dialog() }] }] : []),
      ...favs().map((a) => ({ ...row(a), label: `★ ${a.icon} ${a.name}` })),
      { label: '🔎 Search every app…', action: () => searchDialog() },
    ];
  }
  const card = (a, extra = {}) => ({
    title: a.name, sub: `${a.group} · ${a.price || (a.web ? 'web' : '')}`, icon: a.icon, tip: a.desc, ...extra,
    actions: [{ label: 'Open', primary: true, run: () => Apps.open(a.id) }, { label: isFav(a.id) ? '★' : '☆', hint: 'Favorite: first in the Apps menu', close: false, run: async () => { await toggleFav(a.id); toast(isFav(a.id) ? `★ ${a.name}` : `${a.name} unstarred`, { timeout: 1200 }); } }, ...(extra.actions || [])],
  });
  function searchDialog(q = '') {
    const rec = new Set(store.get('apps.recent', []));
    const list = Apps.list().slice().sort((x, y) => (isFav(y.id) - isFav(x.id)) || (rec.has(y.id) - rec.has(x.id)) || Apps.GROUPS.indexOf(x.group) - Apps.GROUPS.indexOf(y.group) || x.name.localeCompare(y.name));
    const dlg = Apps.grid({ title: `▣ Apps (${list.length})`, items: list.map((a) => card(a, { sub: `${isFav(a.id) ? '★ ' : ''}${a.group} · ${a.desc || ''}` })) });
    const f = dlg.querySelector('.apps-filter');
    if (f && q) { f.value = q; f.dispatchEvent(new Event('input')); }
    return dlg;
  }
  function dialog() {
    const d = suggest(9);
    return Apps.grid({
      title: '✨ Discover', empty: 'You\'ve opened every app that fits: nothing new to suggest.',
      head: el('p', { class: 'hint', text: `Apps you haven't opened yet that fit what you're doing (${context().map((w) => WHY[w].toLowerCase()).join(', ')}).` }),
      items: d.map((x) => card(x.app, { sub: x.why, actions: [{ label: 'Not for me', run: () => dismiss(x.app.id).then(() => dismiss(x.app.id)) }] })),
    });
  }
  function text(n = 5) {
    const d = suggest(n);
    return d.length ? d.map((x) => `- ${x.app.icon} **${x.app.name}** (\`/apps ${x.app.id}\`, ${x.app.price || 'web'}): ${x.why}`).join('\n') : 'Nothing new to suggest: you\'ve opened every app that fits.';
  }

  // ---------- a chat suggests an app (a card with a button) ----------
  function suggestCard(agentId, id, why = '') {
    const a = Apps.get(id);
    if (!a) throw new Error(`No app "${id}"`);
    const msg = `✨ **${a.name}**${a.price ? ` (${a.price})` : ''}: ${why || a.desc || ''}`;
    if (agentId && typeof Native !== 'undefined') Native.note(agentId, msg, { actions: [{ label: `Open ${a.name}`, run: () => Apps.open(a.id) }, { label: 'Not for me', run: (box) => { dismiss(a.id); box?.remove?.(); } }] });
    else toast(msg.replace(/\*\*/g, ''), { timeout: 10000, action: { label: `Open ${a.name}`, fn: () => Apps.open(a.id) } });
    return msg;
  }

  // ---------- send to app ----------
  async function newestRender() {
    const done = (typeof Renders !== 'undefined' ? Renders.list?.() || [] : []).filter((j) => j.status === 'done' && j.output);
    return done.sort((a, b) => (b.ended || b.at || 0) - (a.ended || a.at || 0))[0]?.output || null;
  }
  async function sendTo(id, src = 'board') {
    const a = Apps.get(id);
    if (!a?.web) throw new Error(`No app window "${id}"`);
    let file = null; let pic = null; let what = '';
    const s = String(src || 'board').trim();
    if (s === 'board') { const b = await AppsMeshy.boardImage(); pic = b.path; what = `the board picture “${b.name}”`; }
    else if (s === 'lab' || s === 'still') { pic = await ThreeLab.shot(); if (!pic) throw new Error('The Lab isn\'t showing anything'); what = 'a still of the Lab'; }
    else if (s === 'render') { file = await newestRender(); if (!file) throw new Error('No finished render yet (/renders)'); what = 'your newest render'; }
    else file = s;
    if (file && AppsCore.kindOf(file) === 'image') { pic = file; file = null; what ||= `“${pic.split(/[\\/]/).pop()}”`; }
    if (pic) await window.hub.capture.copyImage(pic);
    else { await copyText(file, 'Path copied'); window.hub.fs.reveal(file); what ||= file.split(/[\\/]/).pop(); }
    await Apps.openWindow(a.id);
    const M = /Mac/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';
    const hint = pic ? `${what} is on the clipboard: click ${a.name}'s upload / prompt box and paste (${M})` : `${what}: its file is shown in your folder (path copied): drag it into ${a.name}'s upload box`;
    await window.hub.apps.nav(a.id, 'hint', hint);
    return hint;
  }
  const sendable = () => Apps.list().filter((a) => a.web && (a.takes || []).includes('image'));

  return { load, noteOpen, opened, dismiss, isFav, toggleFav, favs, context, suggest, maybeChip, setOff, isOff: () => Boolean(S?.off), menuTop, searchDialog, dialog, text, suggestCard, sendTo, sendable, habits: () => S };
})();
window.AppsDiscover = AppsDiscover;
