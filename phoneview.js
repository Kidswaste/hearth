// 📱 See it on my phone (round 136, phone136), the window side: the owner checks a render or the Lab's live preview on
// his phone over his own Wi-Fi. The server is phoneviewmain.js; the phone's page is phoneview-page.html.
//   PhoneView.render(file)  a finished render (the render queue's done note and its row menu: 📱 Open on my phone)
//   PhoneView.live()        the Lab's preview, streamed (▣ Present's right-click menu: 📱 Live on my phone); the song
//                           plays on the computer; frames are taken only while a phone is watching
// The card (bottom right): the QR code (it carries a one-time token), the local address, "1 phone connected", Stop.
// One phone at a time (round 148b): another phone opening the link takes the view over (phoneviewmain.js).
// Closing the card stops the server. Nothing is uploaded and nothing leaves the local network. The AI is not involved.
const PhoneView = (() => {
  const A = window.hub.phone;
  const IS_WIN = /Win/.test(navigator.platform);
  let st = { on: false };
  let card = null;
  const stats = { frames: 0, skipped: 0, pumps: 0 };

  // ---------- Windows Firewall: said in plain words before the first time ----------
  async function firewallOk() {
    if (!IS_WIN || store.get('phone.firewallTold', false)) return true;
    const ok = await Modal.confirm('Windows may ask about your network', 'The first time, Windows Firewall may ask whether Hearth can use your network. Tick "Private networks" (your home Wi-Fi) and click Allow.\n\nHearth only opens to phones on your own Wi-Fi, with a code in the QR. Never to the internet.', { ok: 'Go on' });
    if (ok) store.set('phone.firewallTold', true);
    return ok;
  }

  // ---------- the two modes ----------
  async function render(file, o = {}) {
    if (!file) throw new Error('No video to open');
    if (!(await firewallOk())) return null;
    return begin({ mode: 'render', file, title: o.title, ...test(o) });
  }
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks : null);
  function sizeLabel() {
    const h = hk(); const s = h?.size;
    if (s?.width && s?.height && s.id !== 'fit') return `${s.width}×${s.height}`;
    const r = h?.frameRect; if (!r?.width) return '';
    const k = devicePixelRatio || 1;
    return `${Math.round(r.width * k)}×${Math.round(r.height * k)}`;
  }
  async function live(o = {}) {
    if (!hk()) { try { await ThreeLab.cmd({ show: true }); } catch { /* said below */ } }
    if (!hk()) throw new Error('Open the Three.js Lab first');
    if (!(await firewallOk())) return null;
    return begin({ mode: 'live', label: sizeLabel(), title: hk().sketchName() || 'Live', ...test(o) });
  }
  async function begin(o) {
    const r = await A.start(o);
    if (r?.error) { toast(`📱 ${r.error}`, { type: 'error', timeout: 9000 }); st = await A.status(); paint(); return null; } // (no Wi-Fi, a video that moved: said as it is)
    st = r; open();
    return st;
  }
  // (dev/checks/phone136.js: the loopback, any port, a short idle)
  const test = (o) => ({ ...(o.host ? { host: o.host } : {}), ...(o.port != null ? { port: o.port } : {}), ...(o.idleMs ? { idleMs: o.idleMs } : {}) });
  async function stop(why = 'off') { st = await A.stop(why); paint(); return st; }

  // ---------- live frames: the preview's own small JPEGs, only while a phone watches ----------
  let want = false; let pumping = false; let lastLabel = '';
  const MAX_SIDE = 720; // long side sent to the phone (the label says the frame's real size)
  async function pump() {
    if (pumping) return;
    pumping = true; stats.pumps += 1;
    try {
      while (want && st.on && st.mode === 'live') {
        const t0 = performance.now();
        const d = typeof ThreeLab !== 'undefined' ? ThreeLab.director : null;
        const url = d?.shotSmall && !document.hidden ? await Promise.race([d.shotSmall(MAX_SIDE), new Promise((r) => setTimeout(() => r(null), 2500))]).catch(() => null) : null;
        if (url && want) { A.frame(url); stats.frames += 1; } else stats.skipped += 1;
        const label = sizeLabel(); if (label && label !== lastLabel) { lastLabel = label; A.label(label); }
        // ≤ 12 a second, one in flight (the next is taken only once this one is sent)
        await new Promise((r) => setTimeout(r, Math.max(url ? 10 : 600, 83 - (performance.now() - t0))));
      }
    } finally { pumping = false; }
  }
  A.onWant((w) => { want = Boolean(w?.frames); if (want) pump(); });
  A.onStatus((s) => { st = s; paint(); });
  A.onStopped(({ why }) => {
    st = { on: false }; want = false; close();
    if (why === 'idle') toast('📱 Phone view stopped: nobody watched for 30 minutes', { timeout: 4000 });
    else if (why === 'window') { /* the window is reloading */ } else toast('📱 Phone view stopped', { timeout: 1800 });
  });

  // ---------- the card ----------
  function paint() { if (!st?.on) { close(); return; } if (card) build(); }
  function build() {
    const n = st.phones || 0;
    const head = st.mode === 'live' ? '📱 Live on my phone' : '📱 Open on my phone';
    const line = st.mode === 'live' ? `Live from the preview${st.label ? ` · ${st.label}` : ''} · the song plays here` : `Plays “${st.title}” on a loop`;
    card.replaceChildren(
      el('div', { class: 'remote-head' }, el('b', { text: head }), el('span', { class: 'remote-sub', text: 'your Wi-Fi only' }), el('button', { class: 'ghost small', type: 'button', text: '✕', title: 'Close and stop', on: { click: () => stop('card') } })),
      el('div', { class: 'remote-pair' },
        el('div', { class: 'remote-qr', html: RemoteQR.svg(st.url, { px: 4 }), title: 'Scan with the phone\'s camera (same Wi-Fi)' }),
        el('div', { class: 'remote-how' },
          el('div', { class: 'pv-line', text: line }),
          el('div', { class: 'remote-url', text: st.address, title: 'This computer on your Wi-Fi. The QR code also carries a one-time code, so scan it rather than typing this.' }),
          el('div', { class: `pv-conn${n ? ' on' : ''}`, text: n ? '● 1 phone connected' : 'waiting for your phone…', title: 'One phone at a time: opening the link on another phone moves the view there' }),
          el('div', { class: 'remote-sub', text: `Stops when you close this, or after ${st.idleMin} min with nobody watching` }))),
      el('div', { class: 'remote-foot' }, el('button', { class: 'small', type: 'button', text: '■ Stop', on: { click: () => stop('off') } })),
    );
  }
  function open() {
    if (!st?.on) return;
    const host = document.fullscreenElement || document.body; // (over ▣ Present when it's full screen)
    if (!card) { card = el('div', { class: 'remote-card pv-card', attrs: { role: 'dialog', 'aria-label': 'See it on my phone' } }); }
    if (card.parentNode !== host) host.append(card);
    build();
  }
  function close() { card?.remove(); card = null; }
  async function refresh() { st = await A.status(); paint(); return st; }

  return { render, live, stop, refresh, open, get status() { return st; }, get stats() { return { ...stats, want }; }, get card() { return card; }, sizeLabel };
})();
window.PhoneView = PhoneView;
