// (round 153c, labwin153) ⧉ Open in its own window: the Lab scene in a lean window of its own (labwinmain.js,
// lab-window.html). This is Hearth's side (lazy group 'lab'):
//   - open(id): the scene saved, Hearth's Lab let go of it (its preview page released: no second preview of the same
//     scene), the Lab window opened on it; the Lab shows "Open in Lab window ↗" while that scene is away
//   - the director's calls for that scene (its chat stays here) go to the Lab window (bridge.js asks route() first)
//   - what the Lab window's drawer sends goes to the scene's chat here; the reply's first words go back to the drawer
//   - the Lab window closed: the scene read again from disk (what was changed there), the Lab back on it
// In the Lab window itself (hub.labwin.scene set) none of this runs.
const LabWinHost = (() => {
  const HUB = window.hub?.labwin;
  const inLabWindow = Boolean(HUB?.scene);
  let away = null; // the scene the Lab window owns, or null
  let cover = null;
  let releasing = null;
  const st = { opens: 0, forwarded: 0, local: 0, asks: 0, closed: 0 };
  const store2 = { get: (k, d) => (typeof store !== 'undefined' ? store.get(k, d) : d), set: (k, v) => { if (typeof store !== 'undefined') store.set(k, v); } };
  const hideMainPref = () => Boolean(store2.get('labwin.hideMain', false));
  const lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const sceneName = (id) => lab()?.scenes?.get?.(id)?.name || 'This scene';

  // ---------- the "away" card over Hearth's Lab ----------
  function paintCover() {
    const surface = H.surfaces?.get('tool:three')?.el;
    const host = surface?.querySelector('.tool-main') || surface;
    const show = Boolean(away && host && lab()?.scenes?.currentId?.() === away);
    if (!show) { cover?.remove(); cover = null; document.documentElement.classList.remove('labwin-away-on'); return; }
    if (!cover || cover.dataset.scene !== away || !host.contains(cover)) {
      cover?.remove();
      cover = el('div', { class: 'labwin-away', dataset: { scene: away }, attrs: { role: 'status' } },
        el('div', { class: 'lwa-box' },
          el('div', { class: 'lwa-k', text: '⧉ Lab window' }),
          el('div', { class: 'lwa-name', text: sceneName(away) }),
          el('div', { class: 'lwa-hint', text: 'This scene is open in its own window, so it gets the computer. Its chat stays here: what the AI changes shows there.' }),
          el('div', { class: 'lwa-row' },
            el('button', { type: 'button', class: 'primary lwa-go', text: 'Open in Lab window ↗', title: 'Bring the Lab window to the front', on: { click: () => HUB.focus() } }),
            el('button', { type: 'button', class: 'ghost lwa-back', text: 'Bring it back here', title: 'Close the Lab window: the scene comes back to this Lab, with everything changed there', on: { click: () => HUB.close() } }))));
      host.style.position ||= 'relative';
      host.append(cover);
    }
    document.documentElement.classList.add('labwin-away-on');
  }

  // Hearth's Lab lets go of the scene: saved, its preview page released (WebGL, sound, timers), nothing runs it here
  function release() {
    const L = lab();
    if (!L?.workspace || releasing) return releasing;
    releasing = (async () => { try { if (!L.workspace.state?.().released) await L.workspace.close(); window.LabSafe?.handOff?.(away); } catch (err) { console.warn('labwin: release', err); } finally { releasing = null; } })();
    return releasing;
  }

  async function open(id = null, { hideMain = hideMainPref() } = {}) {
    if (inLabWindow || !HUB) return { ok: false, error: 'Already in the Lab window.' };
    const L = lab();
    if (!L) throw new Error('Open the Lab first.');
    id ||= L.scenes?.currentId?.();
    if (!id) throw new Error('No scene to open.');
    const now = await HUB.state().catch(() => null);
    if (now?.open && now.scene !== id) { toast(`The Lab window has “${sceneName(now.scene)}” open. Close it first (or bring it back here).`, { type: 'error', timeout: 6000 }); return { ok: false, error: 'busy' }; }
    if (now?.open) { HUB.focus(); return { ok: true, again: true }; }
    // the scene on disk as it is here (a scene never saved yet too), then this Lab lets go of it (away first: opening it
    // here on the way, for a project's menu, runs nothing in this window's preview)
    away = id;
    if (L.scenes.currentId?.() !== id && !L.scenes.open(id)) { away = null; throw new Error('That scene is not on this computer.'); }
    await L.scenes.saveNow?.(id);
    await release();
    const r = await HUB.open({ scene: id, hideMain });
    if (!r?.ok) { away = null; paintCover(); L.workspace?.resume?.(); throw new Error(r?.error || 'The Lab window could not open.'); }
    st.opens += 1;
    paintCover();
    if (!hideMain) toast(`“${sceneName(id)}” is open in its own window. Hearth goes quiet meanwhile.`, { timeout: 7000, action: { label: 'Hide Hearth too', fn: () => { store2.set('labwin.hideMain', true); HUB.hideMain(); } } });
    dispatchEvent(new CustomEvent('hearth:labwin', { detail: { open: true, scene: id } }));
    return { ok: true, scene: id };
  }

  // the Lab window closed: what was changed there read from disk, the Lab here back on that scene
  async function closed({ scene } = {}) {
    const id = scene || away;
    away = null; st.closed += 1;
    cover?.remove(); cover = null; document.documentElement.classList.remove('labwin-away-on');
    const L = lab();
    try { await L?.scenes?.refreshOne?.(id); } catch (err) { console.warn('labwin: refresh', err); }
    if (L && id) {
      if (H.surfaceIdFor?.(H.activeId) !== 'tool:three') activate('tool:three', { focus: false });
      if (L.scenes?.currentId?.() !== id) L.scenes?.open(id); else L.workspace?.resume?.();
    }
    dispatchEvent(new CustomEvent('hearth:labwin', { detail: { open: false, scene: id } }));
  }

  // ---------- the director's calls (bridge.js): this scene's go to the Lab window ----------
  async function route(tool, args, ctx = {}) {
    if (!away || inLabWindow) return null;
    let target = null;
    if (ctx.chatId && typeof ChatScenes !== 'undefined') {
      try { await Promise.race([ChatScenes.ready?.(), new Promise((r) => setTimeout(r, 5000))]); } catch { /* as it is */ }
      const r = ChatScenes.routeThree(tool, ctx.chatId);
      if (r && !r.sketchId) return null; // (the Lab's own words for "this chat has no scene")
      target = r?.sketchId || null;
    }
    target ||= lab()?.scenes?.currentId?.() || null;
    if (target !== away) { st.local += 1; return null; }
    const r = await HUB.call(tool, args, ctx);
    if (r) st.forwarded += 1;
    return r;
  }

  // the scene is away: nothing runs it in Hearth's window (tools/three.js run() asks), the card shows
  function holds(id) {
    if (!away || id !== away || inLabWindow) return false;
    queueMicrotask(() => { release(); paintCover(); });
    return true;
  }

  // ---------- the drawer's messages → the scene's chat here ----------
  const asked = new Set(); // the chats the drawer's messages went to: their replies go back to it
  const director = () => (typeof Tools !== 'undefined' ? Tools.dockedAgent?.('three') : null) || H.claudeAgent?.();
  async function ask({ agentId, text, images, scene } = {}) {
    if (!text || typeof Native === 'undefined') return;
    st.asks += 1;
    const chatId = typeof ChatScenes !== 'undefined' ? ChatScenes.ownerOf?.(scene || away) : null;
    const chat = chatId ? (H.chats || []).find((c) => c.id === chatId) : null;
    const aid = chat?.agentId || (H.agent?.(agentId) ? agentId : director()?.id);
    if (!aid) { HUB.note({ text: 'No director in Hearth to send this to (add a Claude agent in Hearth first).', kind: 'err' }); return; }
    try {
      const sending = Native.send(aid, text, chatId ? { chatId, images: images || [] } : {});
      asked.add(chatId || H.activeChat?.[aid]); // (a new chat gets its id as it is sent)
      await sending;
      asked.add(chatId || H.activeChat?.[aid]);
      HUB.note({ text: `${H.agent?.(aid)?.name || 'The director'} is working on it…`, kind: 'ai' });
    } catch (err) { HUB.note({ text: err.message, kind: 'err' }); }
  }
  if (!inLabWindow && HUB) {
    HUB.onClosed((d) => { closed(d).catch((err) => console.warn('labwin', err)); });
    HUB.onAsk((o) => { ask(o).catch((err) => console.warn('labwin: ask', err)); });
    HUB.onShowChat(({ agentId } = {}) => { const a = director(); const id = agentId && H.agent?.(agentId) ? agentId : a?.id; if (id) activate(id); });
    // the scene's chat answered: its first words for the drawer
    try {
      Native.hooks?.finish?.push((event, chat) => {
        if (!away || !chat?.id || !(asked.has(chat.id) || (typeof ChatScenes !== 'undefined' && ChatScenes.linkOf?.(chat.id) === away))) return;
        setTimeout(() => { const m = chat.messages?.at?.(-1); if (m?.role === 'assistant' && m.text) HUB.note({ text: `✦ ${String(m.text).replace(/\s+/g, ' ').slice(0, 300)}`, kind: 'ai' }); }, 0);
      });
    } catch { /* no chats here */ }
    addEventListener('hearth:view', () => { if (away) paintCover(); });
    // Hearth's window reloaded while the Lab window is open: the scene is still away
    HUB.state().then((s) => { if (s?.open && s.scene && !away) { away = s.scene; release(); paintCover(); } }).catch(() => {});
    addEventListener('hearth:lab-ran', () => { if (away) paintCover(); });
  }

  // ⧉ rows for the Lab's menus: [label, hint, run, checked]
  function rows() {
    if (inLabWindow) return [['↩ Back to Hearth', 'Close this window: the scene goes back to Hearth\'s Lab, with everything changed here', () => HUB.close()]];
    if (!HUB) return [];
    return [
      ['⧉ Open in its own window', 'A lighter window just for this scene: the Lab only, full speed even behind other apps', () => open().catch((err) => toast(err.message, { type: 'error' }))],
      ['Hide Hearth while the Lab window is open', 'Hearth comes back when you close the Lab window', () => { const on = !hideMainPref(); store2.set('labwin.hideMain', on); toast(on ? 'Hearth hides while the Lab window is open' : 'Hearth stays in the taskbar while the Lab window is open', { timeout: 2200 }); }, hideMainPref()],
    ];
  }
  if (typeof AppUI !== 'undefined' && !inLabWindow) AppUI.addAction('Lab: ⧉ Open in its own window', () => (typeof ThreeLab !== 'undefined' ? ThreeLab.cmd({ show: true }) : Promise.resolve()).then(() => open()).catch((err) => toast(err.message, { type: 'error' })));
  if (typeof Commands !== 'undefined' && !inLabWindow) {
    Commands.register({
      name: 'labwin', area: 'Lab', aliases: ['lab-window', 'open-lab-window'], args: '[hide|show|close]',
      desc: 'Open the Lab scene in its own lighter window (the Lab only, full speed): hide = also hide Hearth meanwhile, close = bring it back',
      keywords: 'open lab window own window separate window lighter window detach pop out full speed',
      examples: ['/labwin', '/labwin hide'],
      run: async (arg = '') => {
        const a = String(arg).trim().toLowerCase();
        if (a === 'close') { await HUB?.close(); return 'The Lab window is closing: the scene comes back here.'; }
        if (typeof ThreeLab !== 'undefined') await ThreeLab.cmd({ show: true });
        const r = await open(null, a === 'hide' ? { hideMain: true } : a === 'show' ? { hideMain: false } : {});
        return r?.ok ? `“${sceneName(r.scene || away)}” is open in its own window.` : 'The Lab window did not open.';
      },
    });
  }

  // Lite mode (another round's switch: window.HearthLite, or the 'lite' setting): its 30 fps cap wins over the Lab
  // window's full rate behind other apps. Read defensively: absent means off.
  function lite() {
    try {
      const L = window.HearthLite;
      if (L) { const v = typeof L.on === 'function' ? L.on() : typeof L.isOn === 'function' ? L.isOn() : L.on ?? L.enabled ?? L.active; if (v != null) return Boolean(v); }
      const s = store2.get('lite', null);
      return Boolean(s && (s === true || s.on === true));
    } catch { return false; }
  }

  return {
    open, route, holds, release, rows, lite,
    away: () => away, active: () => Boolean(away) && !inLabWindow,
    hideMain: (on) => { if (on !== undefined) store2.set('labwin.hideMain', Boolean(on)); return hideMainPref(); },
    state: () => ({ away, cover: Boolean(cover?.isConnected), inLabWindow, ...st }),
  };
})();
window.LabWinHost = LabWinHost;
