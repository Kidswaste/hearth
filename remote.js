// Phone remote, Lab side (round 24, remote): a phone or a tablet on the same Wi-Fi plays the Lab and the live stage.
//   /remote on    starts the small local server (remotemain.js) and shows a card with a QR code, the address and a
//                 6-digit pairing code; the phone opens the page (remote-page.html), types the code once, and is
//                 remembered (its own key); /remote devices lists, kicks and forgets them
//   faders        the scene's sliders (the selected layer), grouped like the sliders panel, with the music meters of
//                 the ones that follow the music; moves are the hub's own slider moves (setNormalized, like a MIDI knob),
//                 batched per frame, with soft takeover per phone (a fader picks the value up before it moves it)
//   pads          shuffle / the shuffle before / freeze / tap / save / black-out / next look / play, an XY pad on two sliders
//   set list      GO, cut, next / previous, cue a scene (round 22 stage: ThreeStage), scenes to open or cue
//   preview       small JPEG frames (the Lab's thumbnail channel, ≈ 4 a second) while a phone shows it
//   two phones    at once: each has its own takeover; what one moves shows on the other (≈ 8 updates a second)
// Nothing runs while nobody is connected: no loop, no frames. The card sits bottom right while the remote is on.
const Remote = (() => {
  const R = window.hub.remote;
  const peers = new Map(); // peer id → { peer, dev, name, addr, preview, pick: Map, sent: { vals, meters, info } }
  let st = null; // remotemain's status
  let card = null; let pill = null;

  // ---------- the Lab, as the remote sees it ----------
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks : null);
  const lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.peek?.() : null);
  const stage = () => (typeof ThreeStage !== 'undefined' ? ThreeStage : null);
  const uOf = (x) => (x.options ? Math.max(0, x.options.indexOf(x.value)) / Math.max(1, x.options.length - 1) : typeof x.value === 'boolean' ? (x.value ? 1 : 0) : x.min != null ? (x.value - x.min) / ((x.max - x.min) || 1) : null);
  const r3 = (n) => Math.round(n * 1000) / 1000;
  function controls() {
    const c = hk()?.ctl(); if (!c) return [];
    return c.controls().flatMap((x) => {
      const u = uOf(x); if (u == null || !Number.isFinite(u)) return [];
      const kind = x.options ? 'opt' : typeof x.value === 'boolean' ? 'bool' : 'num';
      return [{ key: x.key, label: x.label || x.key, group: x.group || 'Controls', kind, u: r3(u), ...(kind === 'num' ? { min: x.min, max: x.max, step: x.step || 0, value: x.value } : {}), ...(x.options ? { options: x.options.map(String), value: String(x.value) } : {}), ...(x.followsMusic ? { music: true } : {}) }];
    });
  }
  function info() {
    const h = hk(); const S = stage(); const s = S?.state; const c = lab();
    return {
      scene: h ? { id: h.sketchId(), name: h.sketchName() } : null, frozen: Boolean(h?.frozen), black: Boolean(s?.black), bpm: S ? Math.round(S.bpm() * 10) / 10 : null, tempo: s?.tempo || null,
      cued: s?.cued || null, busy: Boolean(s?.busy), playing: Boolean(h?.player?.playing), show: Boolean(s?.show),
      setlist: (s?.setlist || []).map((x) => ({ n: x.n, id: x.id, name: x.name, current: x.current, cued: x.cued })),
      layers: c?.layers?.().map((L) => ({ name: L.name, selected: L.selected })) || [],
    };
  }
  function snapshot() {
    const c = lab();
    return { t: 'state', ...info(), controls: controls(), scenes: (c?.sketches?.() || []).slice(0, 120).map((x) => ({ id: x.id, name: x.name, current: x.current })), actions: ACTS };
  }
  const ACTS = ['go', 'cut', 'next', 'prev', 'shuffle', 'shuffleBack', 'freeze', 'tap', 'blackout', 'play', 'look', 'save', 'setadd'];
  const sendTo = (peer, msg) => R.send({ to: peer, msg });
  const toAll = (msg) => R.send({ to: null, msg });
  async function ready() {
    if (lab() && hk()) return true;
    try { await ThreeLab.cmd({ show: false }); } catch { return false; }
    return Boolean(hk());
  }

  // ---------- from the phones ----------
  const pending = new Map(); // `${peer}|${key}` → { peer, key, u, rel, jump }
  let raf = 0; let applied = 0; let skipped = 0;
  async function onMsg({ peer, msg }) {
    const p = peers.get(peer); if (!p) return;
    try {
      if (msg.t === 'state') { await ready(); sendTo(peer, snapshot()); return; }
      if (msg.t === 'preview') { p.preview = Boolean(msg.on); pumpFrames(); return; }
      if (!(await ready())) throw new Error('The Lab did not load');
      if (msg.t === 'set') {
        const list = Array.isArray(msg.v) ? msg.v.slice(0, 64) : [];
        for (const [key, u] of list) if (typeof key === 'string' && Number.isFinite(u)) pending.set(`${peer}|${key}`, { peer, key, u: Math.max(0, Math.min(1, u)), rel: Boolean(msg.rel), jump: Boolean(msg.jump) });
        if (!raf) raf = requestAnimationFrame(flush);
        return;
      }
      const S = stage();
      if (msg.t === 'act' || msg.t === 'go') {
        const a = msg.t === 'go' ? 'go' : String(msg.a || '');
        if (!ACTS.includes(a) && !/^scene[1-8]$/.test(a)) return;
        if (a === 'save') { const n = lab().save(); say(peer, n ? `Saved ${n} slider${n === 1 ? '' : 's'}` : 'Saved'); } else if (a === 'setadd') say(peer, `Set list: ${S.setlist.add()} scenes`);
        else if (a === 'go' || a === 'cut') { const name = await S.act(a); if (name) say(peer, `▸ ${name}`); } else await S.act(a);
        soon(); return;
      }
      if (msg.t === 'cue') { const name = msg.n ? await S.setlist.cueN(Number(msg.n)) : await S.cue(String(msg.id)); say(peer, `Cued ${name || ''}`); soon(); return; }
      if (msg.t === 'scene') { if (!ThreeLab.scenes?.open(String(msg.id))) throw new Error('That scene is gone'); soon(); return; }
      if (msg.t === 'layer') { lab().selectLayer(String(msg.name || '')); soon(); return; }
      if (msg.t === 'bpm') { say(peer, `${S.setBpm(msg.v)} BPM`); soon(); }
    } catch (err) { sendTo(peer, { t: 'toast', text: calmError(err), err: true }); }
  }
  const say = (peer, text) => sendTo(peer, { t: 'toast', text });
  // one frame applies every phone's latest value per slider (the same moves as the hub's sliders and MIDI knobs)
  function flush() {
    raf = 0;
    const list = [...pending.values()]; pending.clear();
    const h = hk(); const c = h?.ctl(); const L = h?.layer();
    if (!c || !L) return;
    const now = new Map(c.controls().map((x) => [x.key, x]));
    for (const m of list) {
      const x = now.get(m.key); const p = peers.get(m.peer); if (!x || !p) continue;
      const cur = uOf(x); if (cur == null) continue;
      const pk = `${h.sketchId()}|${L.id}|${m.key}`;
      // soft takeover (like the MIDI path): the phone picks the value up under the finger before it sends; here, a
      // slider moved by something else since this finger's last value (the other phone, a shuffle, your hand) has
      // to be passed through again before this finger moves it
      const s = p.pick.get(pk) || { picked: true, last: null, sent: null };
      if (s.picked && s.sent != null && Math.abs(cur - s.sent) > 0.03) s.picked = false;
      if (!s.picked && !m.jump && x.min != null) {
        const crossed = s.last != null && (s.last - cur) * (m.u - cur) <= 0;
        if (Math.abs(m.u - cur) <= 0.04 || crossed) s.picked = true;
        else { s.last = m.u; p.pick.set(pk, s); skipped += 1; continue; }
      }
      s.picked = true; s.last = m.u; s.sent = m.u; p.pick.set(pk, s);
      c.setNormalized(m.key, m.u, { release: m.rel });
      applied += 1;
      clearTimeout(p.rel?.[pk]);
      if (!m.rel) (p.rel ||= {})[pk] = setTimeout(() => { c.setNormalized(m.key, m.u, { release: true }); }, 300);
      if (m.rel) p.pick.delete(pk); // the finger is off: the next touch picks up again
    }
    soon(60);
  }

  // ---------- to the phones: what changed, ≈ 8 times a second while someone is connected (no DOM, no frames) ----------
  let tick = 0; let lastScene = ''; let soonT = 0;
  const soon = (ms = 120) => { clearTimeout(soonT); soonT = setTimeout(push, ms); };
  function push() {
    if (!peers.size) return;
    const h = hk(); if (!h) return;
    const sig = `${h.sketchId()}|${h.layer()?.id || ''}|${h.ctl()?.controls().length || 0}`;
    if (sig !== lastScene) { lastScene = sig; const snap = snapshot(); for (const p of peers.values()) p.sent = { vals: {}, meters: {}, info: '' }; toAll(snap); return; }
    const cs = controls();
    const inf = JSON.stringify(info());
    const meters = {};
    const M = typeof ThreeAudioMap !== 'undefined' ? ThreeAudioMap.lastMeter : null; const c = h.ctl();
    if (M && c) for (const x of cs) if (x.music) { const mid = c.mapping?.(x.key)?.mid; const v = mid && M.get(mid); if (v) meters[x.key] = Math.round(v[0] * 50) / 50; }
    for (const p of peers.values()) {
      p.sent ||= { vals: {}, meters: {}, info: '' };
      const dv = {}; let n = 0;
      for (const x of cs) if (p.sent.vals[x.key] !== x.u) { dv[x.key] = x.u; p.sent.vals[x.key] = x.u; n += 1; }
      if (n) sendTo(p.peer, { t: 'vals', v: dv });
      const dm = {}; let k = 0;
      for (const [key, v] of Object.entries(meters)) if (p.sent.meters[key] !== v) { dm[key] = v; p.sent.meters[key] = v; k += 1; }
      if (k) sendTo(p.peer, { t: 'meters', v: dm });
      if (p.sent.info !== inf) { p.sent.info = inf; sendTo(p.peer, { t: 'info', ...JSON.parse(inf) }); }
    }
  }
  function loop(on) { clearInterval(tick); tick = on ? setInterval(push, 125) : 0; }

  // ---------- the preview: small JPEGs from the Lab's thumbnail channel while a phone shows it ----------
  let pumping = false; let frames = 0;
  async function pumpFrames() {
    if (pumping) return;
    pumping = true;
    try {
      while ([...peers.values()].some((p) => p.preview)) {
        const t0 = performance.now();
        const d = ThreeLab.director;
        const url = d?.shotSmall && !document.hidden ? await Promise.race([d.shotSmall(360), new Promise((r) => setTimeout(() => r(null), 2500))]) : null;
        if (url) { R.frame(url); frames += 1; }
        await new Promise((r) => setTimeout(r, Math.max(url ? 60 : 1500, 250 - (performance.now() - t0)))); // ≤ 4 a second
      }
    } finally { pumping = false; }
  }

  // ---------- main's events ----------
  R.onJoin(async (p) => {
    peers.set(p.peer, { ...p, preview: false, pick: new Map(), sent: null });
    toast(`📱 ${p.name} ${p.paired ? 'paired and ' : ''}connected`, { timeout: 2200 });
    loop(true); refresh();
  });
  R.onLeave((p) => {
    const x = peers.get(p.peer); peers.delete(p.peer);
    if (x) toast(`📱 ${x.name} left`, { timeout: 1600 });
    if (!peers.size) loop(false);
    refresh();
  });
  R.onMsg((m) => onMsg(m));
  R.onCode(() => refresh());
  R.onDevices((s) => { st = s; paint(); });
  R.onAlert((a) => toast(`📱 ${a.text}`, { type: 'error', timeout: 6000 }));
  R.onStopped(({ why }) => {
    peers.clear(); loop(false);
    toast(why === 'idle' ? '📱 Phone remote off (nobody used it for a while): /remote on' : '📱 Phone remote off', { timeout: 3000 });
    refresh();
  });
  addEventListener('hearth:sketch', () => soon(200));

  // ---------- the card on the computer: QR, address, code, who's connected ----------
  async function refresh() { st = await R.status(); paint(); return st; }
  function paint() {
    if (!st?.on) { card?.remove(); card = null; pill?.remove(); pill = null; return; }
    const online = st.online || [];
    if (!pill) { pill = el('button', { class: 'remote-pill', type: 'button', title: 'Phone remote: who is connected, the QR code, the pairing code', on: { click: () => (card ? close() : open()) } }); document.body.append(pill); }
    const t = `📱 ${online.length || ''}`.trim();
    if (pill.textContent !== t) pill.textContent = t;
    pill.classList.toggle('live', online.length > 0);
    if (card) build();
  }
  function build() {
    const code = st.code; const online = st.online || [];
    const devs = (st.devices || []).slice().sort((a, b) => b.lastSeen - a.lastSeen);
    card.replaceChildren(
      el('div', { class: 'remote-head' }, el('b', { text: '📱 Phone remote' }), el('span', { class: 'remote-sub', text: `on this Wi-Fi · off after ${st.idleMin} min alone` }), el('button', { class: 'ghost small', type: 'button', text: '✕', title: 'Close (the remote stays on)', on: { click: close } })),
      el('div', { class: 'remote-pair' },
        el('div', { class: 'remote-qr', html: RemoteQR.svg(st.url, { px: 4 }) }),
        el('div', { class: 'remote-how' },
          el('div', { class: 'remote-url', text: st.url, title: 'Open this on the phone (same Wi-Fi), or scan the code' }),
          code ? el('div', { class: 'remote-code', text: `${code.code.slice(0, 3)} ${code.code.slice(3)}`, title: 'Type it on the phone (once per device, 5 minutes)' }) : el('button', { class: 'ghost small', type: 'button', text: 'Pair a new phone', on: { click: async () => { await R.pair(); refresh(); } } }),
          el('div', { class: 'remote-sub', text: code ? 'Pairing code: one phone, 5 minutes' : 'Paired phones just open the address' }))),
      online.length ? el('div', { class: 'remote-list' }, online.map((p) => el('div', { class: 'remote-dev on' }, el('span', { text: `● ${p.name}` }), el('span', { class: 'remote-sub', text: p.addr }), el('button', { class: 'ghost small', type: 'button', text: 'Kick', title: 'Disconnect it (it can come back)', on: { click: () => R.kick(String(p.peer)) } })))) : el('div', { class: 'remote-sub', text: 'Nobody connected yet' }),
      devs.length ? el('details', { class: 'remote-devs' }, el('summary', { text: `Paired devices (${devs.length})` }), devs.map((d) => el('div', { class: 'remote-dev' }, el('span', { text: d.name }), el('span', { class: 'remote-sub', text: d.lastSeen ? new Date(d.lastSeen).toLocaleString() : '' }), el('button', { class: 'ghost small', type: 'button', text: 'Forget', title: 'Revoke: it must pair again', on: { click: () => R.forget(d.id) } })))) : null,
      el('div', { class: 'remote-foot' }, el('button', { class: 'ghost small', type: 'button', text: 'Turn off', on: { click: () => off() } })),
    );
  }
  function open() {
    if (!st?.on) return;
    if (!card) { card = el('div', { class: 'remote-card', attrs: { role: 'dialog', 'aria-label': 'Phone remote' } }); document.body.append(card); }
    build();
  }
  function close() { card?.remove(); card = null; }
  async function on(o = {}) { st = await R.start(o); paint(); open(); return st; }
  async function off() { st = await R.stop(); paint(); return st; }

  return {
    on, off, refresh, open, close, devices: async () => (await refresh()).devices,
    kick: (id) => R.kick(String(id)), forget: (id) => R.forget(String(id)), pair: () => R.pair(), idle: (min) => R.idle(min),
    get status() { return st; }, get peers() { return [...peers.values()].map((p) => ({ peer: p.peer, name: p.name, addr: p.addr, preview: p.preview })); },
    get stats() { return { applied, skipped, frames }; },
    _push: push,
  };
})();
window.Remote = Remote;
