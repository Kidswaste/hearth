// (round 153c, labwin153) The Lab window's start (lab-window.html, in place of start.js): the settings for the look,
// one surface (the Lab), the scene this window owns, the director's calls relayed from Hearth's window, and the slim
// drawer where the Lab's chat would be. No chats, boards, projects, usage scanners or background features load here.
const LabWinDrawer = (() => {
  const scene = HearthLabWindow.scene;
  let host = null; let agentId = null; let lines = null; let box = null; let status = null;
  const notes = [];
  const say = (text, kind = '') => {
    notes.push({ text: String(text).slice(0, 400), kind, at: Date.now() });
    if (notes.length > 40) notes.shift();
    paint();
  };
  function paint() {
    if (!lines) return;
    lines.replaceChildren(...notes.slice(-14).map((n) => el('div', { class: `lw-line ${n.kind}`, text: n.text })));
    lines.scrollTop = lines.scrollHeight;
  }
  function mount(id, where) {
    agentId = id || agentId;
    if (host && host.parentElement === where) return host;
    const agent = H.agent?.(agentId);
    lines = el('div', { class: 'lw-lines', attrs: { role: 'log', 'aria-live': 'polite' } });
    box = el('textarea', { class: 'lw-ask', attrs: { rows: '3', placeholder: `Ask ${agent?.name || 'the director'} about this scene…  (Enter sends)`, 'aria-label': 'Message for the director' } });
    status = el('div', { class: 'lw-status', text: 'Its chat stays in Hearth: what you send here goes to it, and its changes show here live.' });
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } });
    host = el('div', { class: 'lw-drawer' },
      el('div', { class: 'lw-head' },
        el('span', { class: 'lw-title', text: `✦ ${agent?.name || 'Director'}` }),
        el('button', { type: 'button', class: 'ghost small lw-show', text: 'Show the chat in Hearth ↗', title: 'Bring Hearth\'s window to the front, on this scene\'s chat', on: { click: () => window.hub.labwin.showMain({ agentId, scene }) } })),
      status, lines,
      el('div', { class: 'lw-row' }, box, el('button', { type: 'button', class: 'primary small lw-send', text: 'Send', on: { click: () => go() } })));
    where.replaceChildren(host);
    paint();
    return host;
  }
  async function send(id, text, o = {}) {
    const r = await window.hub.labwin.ask({ agentId: id || agentId, text: String(text || ''), images: o.images || null, scene });
    if (!r?.ok) throw new Error(r?.error || 'Hearth did not take the message.');
    say(`→ ${String(text).split('\n')[0].slice(0, 140)}`, 'me');
    return r;
  }
  function go() {
    const text = box?.value.trim();
    if (!text) return;
    box.value = '';
    send(agentId, text).catch((err) => { say(err.message, 'err'); box.value = text; });
  }
  window.hub.labwin.onNote?.((n) => { if (n?.text) say(n.text, n.kind || ''); });
  return { mount, send, say, draft: (t) => { if (box) { box.value = String(t || ''); box.focus(); } }, notes: () => notes.slice() };
})();

const LabWin = (() => {
  const scene = HearthLabWindow.scene;
  const t = { start: Math.round(HearthLabWindow.t0) };
  // the scene's first run here, and its first frame drawn (the preview page says 'stack-drawn')
  const first = (e) => { if (e?.detail?.id && e.detail.id !== scene) return; t.ran ??= Math.round(performance.now()); removeEventListener('hearth:lab-ran', first); };
  addEventListener('hearth:lab-ran', first);
  // the preview's own stats (fps over the last second, its frame cap): what dev/checks/labwin153.js reads while unfocused
  let stats = null;
  addEventListener('message', (e) => {
    const d = e.data; if (!d || typeof d !== 'object') return;
    if (t.frame == null && d.type === 'stack-drawn') t.frame = Math.round(performance.now());
    if (d.type === 'stats' && d.source === 'three-sandbox') stats = { fps: Math.round(d.fps * 10) / 10, cap: d.cap, at: Date.now(), focused: document.hasFocus() };
  });
  // the director's calls from Hearth's window (its chat), for this scene: run here exactly as an agent's call
  window.hub.labwin.onCall(async ({ id, tool, args, ctx }) => {
    let r;
    try { r = await HubBridge.call(tool, args || {}, { chatId: ctx?.chatId || null }); } catch (err) { r = { ok: false, error: err.message }; }
    if (tool && !/^three_(seen|console|read_code|search_code|get_code|sliders|layers)$/.test(tool)) LabWinDrawer.say(`✦ ${String(tool).replace(/^three_/, '')}${r?.ok === false ? ` — ${String(r.error || '').slice(0, 120)}` : ''}`, r?.ok === false ? 'err' : 'ai');
    window.hub.labwin.result(id, r || { ok: false, error: `${tool} returned nothing.` });
  });
  async function boot() {
    H.chats = []; H.history = {};
    const cfg = await window.hub.getConfig();
    if (cfg?.error || !cfg?.config) { showError(`Couldn't read settings — ${cfg?.error || 'no settings'}`); return; }
    H.config = cfg.config;
    // the drawer sits where the Lab's chat would: the Lab's own director, else the first native Claude (as "Ask Claude"
    // does in Hearth); only in this window's view of the agents, never saved (Hearth's window owns the settings)
    const agents0 = H.agents;
    H.agents = () => {
      const list = agents0();
      if (list.some((a) => a.dock === 'three' && a.mode === 'native')) return list;
      const c = list.find((a) => a.mode === 'native' && a.engine === 'claude' && !a.dock) || list.find((a) => a.mode === 'native' && !a.dock);
      return c ? list.map((a) => (a === c ? { ...a, dock: 'three' } : a)) : list;
    };
    applyTheme(cfg.themeCss || '');
    try { Look.apply?.(); } catch (err) { console.warn('look', err); }
    t.config = Math.round(performance.now());
    // the Lab's tool surface, on its own (no rail, no chats list)
    const tool = Tools.get('three');
    if (!tool) { showError('The Lab could not be loaded in this window.'); return; }
    const s = Tools.createSurface(tool);
    H.surfaces.set('tool:three', s);
    $('surfaces').append(s.el);
    dispatchEvent(new Event('hearth:ready'));
    window.Lazy?.calmNow?.();
    await window.Lazy?.load('lab');
    t.lab = Math.round(performance.now());
    await ThreeLab.cmd({ show: true, sketch: scene });
    if (scene && ThreeLab.scenes?.currentId?.() !== scene) ThreeLab.scenes?.open(scene);
    t.open = Math.round(performance.now());
    document.title = `${ThreeLab.scenes?.get?.(scene)?.name || 'Scene'} · Hearth Lab`;
  }
  // (Ctrl/⌘+; from the Lab's preview frame reaches the command bar as in Hearth: labwinmain.js sends 'shortcut', cmdbar.js
  // listens for it)
  addEventListener('DOMContentLoaded', () => { boot().catch((err) => { console.error(err); showError(`The Lab window could not start: ${err.message}`); }); });
  return {
    scene, times: () => ({ ...t }), stats: () => stats && { ...stats, ago: Date.now() - stats.at },
    // the lazy groups in this window and which are in (dev/checks/labwin153.js)
    groups: () => (window.Lazy ? Lazy.state() : []),
  };
})();
