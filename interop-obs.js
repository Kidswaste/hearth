// OBS Studio and the Lab (round 25, interop): the Lab's picture as an OBS Browser Source, and OBS driven from Hearth.
//   output    /obs output on: a page on this computer only (http://127.0.0.1:47850/, interopmain.js) that shows the
//             Lab's picture on a transparent background, so OBS can stream / record it over anything. Frames are
//             the preview's own layers merged with their alpha (WebP, made off the page's thread by the preview,
//             ≈ 30 a second, up to 1280 px by default), sent only while OBS (or a tab) shows the page. Keys: the
//             Lab's alpha, black → transparent (luma), or opaque. "Add to OBS" makes the browser source in OBS.
//   control   /obs connect: obs-websocket v5 (OBS 28+: Tools → WebSocket Server Settings). The password is typed
//             once in a masked field (/obs password), kept encrypted by the main process, never shown, logged or
//             put in a chat. OBS follows Hearth's scenes (same name, or the ones you link), the set list's GO
//             switches OBS too; recording starts / stops from Hearth; streaming asks you first, every time.
// Nothing runs until used: no frames without a viewer, no socket until /obs connect.
const InteropObs = (() => {
  const I = window.hub.interop;
  const KEY = 'interop.obs';
  const data = () => ({ fps: 30, max: 1280, key: 'alpha', fit: 'contain', follow: true, map: {}, url: '', ...store.get(KEY, {}) });
  const save = (patch) => store.set(KEY, { ...data(), ...patch });
  const auto = (k, on) => store.set('interop.auto', { ...store.get('interop.auto', {}), [k]: Boolean(on) });
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks : null);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let page = null; let obs = null; let viewers = 0;
  const stats = { frames: 0, bytes: 0, missed: 0, switched: 0 };

  // ================= the Browser Source output =================
  let pumping = false; let waiting = null; let n = 0;
  // one frame from the preview: the merged layers with alpha, as WebP (the preview encodes it off its thread)
  function shot() {
    const h = hk(); const box = h?.box;
    if (!box?.send) return Promise.resolve(null);
    const d = data(); const id = (n += 1);
    return new Promise((res) => {
      waiting = { id, res };
      box.send({ type: 'obs-shot', id, max: d.max, alpha: d.key !== 'none', q: 0.85 });
      setTimeout(() => { if (waiting?.id === id) { waiting = null; stats.missed += 1; res(null); } }, 1000);
    });
  }
  // the preview's answer (tools/three.js hands it here)
  function frame(msg) {
    if (msg?.type !== 'obs-frame') return false;
    if (waiting && msg.id === waiting.id) { const w = waiting; waiting = null; w.res(msg.buf || null); }
    return true;
  }
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (viewers > 0 && page?.on) {
        const t0 = performance.now();
        const buf = await shot();
        if (buf) { I.frame(buf); stats.frames += 1; stats.bytes += buf.byteLength; }
        const gap = 1000 / Math.max(1, Math.min(60, data().fps));
        await sleep(Math.max(buf ? 1 : 500, gap - (performance.now() - t0))); // (no Lab yet / parked: look twice a second)
      }
    } finally { pumping = false; }
  }
  I.onViewers((k) => { const was = viewers; viewers = k; if (k && !was) toast(`🎥 OBS is showing the Lab (${k} viewer${k === 1 ? '' : 's'})`, { timeout: 1600 }); if (k) pump(); });
  async function output(on = true) {
    if (!on) { page = await I.pageStop(); auto('page', false); return page; }
    page = await I.pageStart({});
    const d = data(); await I.pageCfg({ key: d.key, fit: d.fit });
    auto('page', true);
    if (page.viewers) { viewers = page.viewers; pump(); }
    return page;
  }
  async function setKey(k) { if (!['alpha', 'luma', 'none'].includes(k)) throw new Error('Key: alpha (the Lab\'s transparency), luma (black → transparent) or none'); save({ key: k }); if (page?.on) page = await I.pageCfg({ key: k }); return k; }
  async function setFit(f) { if (!['contain', 'cover', 'stretch'].includes(f)) throw new Error('Fit: contain, cover or stretch'); save({ fit: f }); if (page?.on) page = await I.pageCfg({ fit: f }); return f; }
  function setFps(v) { const x = Number(v); if (!(x >= 5 && x <= 60)) throw new Error('5 to 60 frames a second'); save({ fps: x }); return x; }
  function setMax(v) { const x = Number(String(v).replace(/p$/i, '')) || ({ '4k': 3840, hd: 1280, fhd: 1920 })[String(v).toLowerCase()]; if (!(x >= 320 && x <= 3840)) throw new Error('A size from 320 to 3840 px (the longer side)'); save({ max: x }); return x; }

  // ================= obs-websocket =================
  I.onObs((st) => {
    const was = obs; obs = st;
    if (was?.state !== 'on' && st.state === 'on') toast(`🎥 OBS connected${st.version ? ` · ${st.version}` : ''}`, { timeout: 1800 });
    if (was?.state === 'on' && st.state !== 'on') toast(`🎥 OBS: ${st.why || 'disconnected'}`, { type: st.state === 'auth' ? 'error' : undefined, timeout: 3000 });
    if (st.state === 'auth' && was?.state !== 'auth') toast(`🎥 ${st.why}`, { type: 'error', timeout: 5000 });
    if (was && Boolean(was.rec?.active) !== Boolean(st.rec?.active)) toast(st.rec?.active ? '🎥 OBS is recording' : '🎥 OBS stopped recording', { timeout: 1800 });
    if (was && Boolean(was.stream?.active) !== Boolean(st.stream?.active)) toast(st.stream?.active ? '🔴 OBS is live (streaming)' : '🎥 OBS stopped streaming', { timeout: 2400 });
  });
  async function connect(url) {
    const u = url || data().url || undefined;
    if (url) save({ url });
    obs = await I.obsConnect(u ? { url: u } : {});
    auto('obs', obs.state === 'on' || obs.state === 'connecting');
    if (obs.state === 'on') followNow();
    return obs;
  }
  async function disconnect() { obs = await I.obsDisconnect(); auto('obs', false); return obs; }
  async function status() { obs = await I.obsStatus(); page = await I.pageStatus(); return { obs, page, cfg: data(), stats: { ...stats }, viewers }; }
  // the password: a masked field here, straight to the main process (never in a chat line, the console or a log)
  async function password() {
    const r = await Modal.form('OBS WebSocket password', [{ name: 'pw', label: 'Paste the password from OBS → Tools → WebSocket Server Settings → Show Connect Info', type: 'password', value: '' }], { ok: 'Save' });
    if (!r) return null;
    const st = await I.obsPassword(r.pw || null);
    toast(st.hasPassword ? (st.saved ? '🎥 Saved (encrypted with the system keychain)' : '🎥 Kept for this session only (no system keychain here)') : '🎥 Password forgotten', { timeout: 2600 });
    return st;
  }
  async function forgetPassword() { return I.obsPassword(null); }
  const req = (type, d) => I.obsReq(type, d);
  const on = () => obs?.state === 'on';
  async function scene(name) {
    const list = obs?.scenes || []; const q = String(name || '').toLowerCase();
    const hit = list.find((s) => s.toLowerCase() === q) || list.find((s) => s.toLowerCase().includes(q));
    if (!hit) throw new Error(list.length ? `OBS scenes: ${list.join(', ')}` : 'OBS is not connected: /obs connect');
    await req('SetCurrentProgramScene', { sceneName: hit });
    stats.switched += 1;
    return hit;
  }
  async function record(what = 'toggle') {
    const type = what === 'on' || what === 'start' ? 'StartRecord' : what === 'off' || what === 'stop' ? 'StopRecord' : what === 'pause' ? 'PauseRecord' : what === 'resume' ? 'ResumeRecord' : 'ToggleRecord';
    await req(type);
    return type;
  }
  // streaming is outward-facing: it always asks first (no "always allow"), stopping doesn't
  async function stream(what = 'on') {
    if (what === 'off' || what === 'stop') { await req('StopStream'); return 'stopped'; }
    if (!on()) throw new Error('OBS is not connected: /obs connect');
    if (obs.stream?.active) return 'already live';
    const ok = await Modal.confirm('Go live on OBS?', 'OBS will start streaming to the service set in OBS (Settings → Stream). Everyone watching your channel sees the Lab from now on.', { ok: '🔴 Start streaming', danger: true });
    if (!ok) return 'cancelled';
    await req('StartStream');
    return 'started';
  }
  // put Hearth's page in OBS's current scene as a browser source (the Lab's frame size)
  async function addSource() {
    if (!page?.on) await output(true);
    const z = hk()?.size; const w = z?.width || 1920; const h = z?.height || 1080;
    const inputs = (await req('GetInputList').catch(() => ({ inputs: [] }))).inputs || [];
    if (inputs.some((x) => x.inputName === 'Hearth Lab')) return { exists: true, scene: obs.scene };
    await req('CreateInput', { sceneName: obs.scene, inputName: 'Hearth Lab', inputKind: 'browser_source', inputSettings: { url: page.url, width: w, height: h, fps: data().fps, fps_custom: true, reroute_audio: false, shutdown: false, restart_when_active: false, css: '' }, sceneItemEnabled: true });
    return { scene: obs.scene, w, h, url: page.url };
  }

  // ---------- OBS follows the Lab's scenes ----------
  // a scene linked by hand wins; else an OBS scene with the same name; else the one linked as "any other scene"
  function targetFor(name) {
    const d = data(); const list = obs?.scenes || []; const q = String(name || '').toLowerCase();
    const linked = d.map[name] || Object.entries(d.map).find(([k]) => k.toLowerCase() === q)?.[1];
    if (linked && list.includes(linked)) return linked;
    return list.find((s) => s.toLowerCase() === q) || (d.map['*'] && list.includes(d.map['*']) ? d.map['*'] : null);
  }
  async function followNow() {
    if (!on() || !data().follow) return null;
    const name = hk()?.sketchName(); if (!name) return null;
    const t = targetFor(name);
    if (!t || t === obs.scene) return null;
    try { await req('SetCurrentProgramScene', { sceneName: t }); stats.switched += 1; return t; } catch (err) { console.warn('OBS follow:', err.message); return null; }
  }
  addEventListener('hearth:sketch', () => { followNow(); });
  function link(hearthScene, obsScene) {
    const d = data(); const map = { ...d.map };
    if (!obsScene) delete map[hearthScene]; else map[hearthScene] = obsScene;
    save({ map }); followNow(); return map;
  }

  function summary() {
    const bits = [];
    if (page?.on) bits.push(viewers ? `output · ${viewers} viewer${viewers === 1 ? '' : 's'}` : 'output (no viewer)');
    if (obs?.state === 'on') bits.push(`${obs.scene || 'connected'}${obs.rec?.active ? ' · ● rec' : ''}${obs.stream?.active ? ' · live' : ''}`);
    else if (obs?.state === 'auth') bits.push('needs the password');
    return bits.join(' · ') || 'off';
  }
  function menuItems() {
    const d = data(); const st = obs || {};
    const cur = hk()?.sketchName();
    return [
      `OBS · ${summary()}`,
      { label: page?.on ? 'Browser Source output: on' : 'Browser Source output', hint: page?.on ? page.url : 'the Lab with alpha, for OBS', checked: Boolean(page?.on), action: () => output(!page?.on).then((p) => { if (p.on) { copyText(p.url, 'OBS page address copied').catch(() => {}); } }).catch((err) => toast(err.message, { type: 'error' })) },
      { label: 'Output settings', items: () => [
        { label: 'Background', hint: d.key, items: () => [['alpha', 'Transparent (the Lab\'s alpha)'], ['luma', 'Black → transparent'], ['none', 'Opaque, as on screen']].map(([k, l]) => ({ label: l, checked: d.key === k, action: () => setKey(k) })) },
        { label: 'Fit', hint: d.fit, items: () => [['contain', 'Whole picture'], ['cover', 'Fill'], ['stretch', 'Stretch']].map(([k, l]) => ({ label: l, checked: d.fit === k, action: () => setFit(k) })) },
        { label: 'Frame rate', hint: `${d.fps} fps`, items: () => [60, 30, 25, 15].map((v) => ({ label: `${v} fps`, checked: d.fps === v, action: () => setFps(v) })) },
        { label: 'Size', hint: `${d.max} px`, items: () => [[960, '960 px'], [1280, '1280 px'], [1920, '1920 px (1080p)'], [3840, '3840 px (4K)']].map(([v, l]) => ({ label: l, checked: d.max === v, action: () => setMax(v) })) },
        'The picture is the preview\'s own pixels: a bigger preview or the Stage window at 1080p gives more',
      ] },
      '-',
      st.state === 'on' ? { label: 'Disconnect OBS', hint: st.version || '', action: () => disconnect() } : { label: 'Connect to OBS', hint: st.state === 'auth' ? 'needs the password' : st.why || (d.url || 'ws://127.0.0.1:4455'), action: () => connect().catch((err) => toast(err.message, { type: 'error' })) },
      { label: st.hasPassword ? 'Password: saved' : 'Password…', hint: 'from OBS → Tools → WebSocket Server Settings', action: () => password().then((r) => { if (r?.hasPassword && st.state !== 'on') connect().catch(() => {}); }) },
      st.state === 'on' ? { label: 'Scene', hint: st.scene || '', items: () => (st.scenes || []).map((s) => ({ label: s, checked: s === st.scene, action: () => scene(s).catch((err) => toast(err.message, { type: 'error' })) })) } : null,
      st.state === 'on' ? { label: 'Follow the Lab\'s scenes', hint: 'same name, or linked', checked: d.follow, action: () => { save({ follow: !d.follow }); followNow(); } } : null,
      st.state === 'on' && cur ? { label: `Link "${cur}" to…`, hint: targetFor(cur) || 'no OBS scene', items: () => [...(st.scenes || []).map((s) => ({ label: s, checked: d.map[cur] === s, action: () => link(cur, s) })), ...(d.map[cur] ? [{ label: 'Unlink', action: () => link(cur, null) }] : [])] } : null,
      st.state === 'on' ? { label: st.rec?.active ? '■ Stop recording' : '● Record', action: () => record(st.rec?.active ? 'off' : 'on').catch((err) => toast(err.message, { type: 'error' })) } : null,
      st.state === 'on' ? { label: st.stream?.active ? '■ Stop streaming' : '🔴 Start streaming…', hint: st.stream?.active ? '' : 'asks first', action: () => stream(st.stream?.active ? 'off' : 'on').catch((err) => toast(err.message, { type: 'error' })) } : null,
      st.state === 'on' ? { label: '＋ Add the Lab to OBS', hint: 'a browser source in this OBS scene', action: () => addSource().then((r) => toast(r.exists ? '🎥 "Hearth Lab" is already in OBS' : `🎥 Added "Hearth Lab" (${r.w}×${r.h}) to ${r.scene}`, { timeout: 2600 })).catch((err) => toast(err.message, { type: 'error' })) } : null,
    ];
  }

  async function resume() {
    const a = store.get('interop.auto', {});
    if (a.page) await output(true).catch(() => {});
    if (a.obs) await connect().catch(() => {});
  }

  return { output, setKey, setFit, setFps, setMax, connect, disconnect, status, password, forgetPassword, scene, record, stream, addSource, link, followNow, targetFor, frame, summary, menuItems, resume, get stats() { return { ...stats }; }, get viewers() { return viewers; }, get obs() { return obs; }, get page() { return page; } };
})();
window.InteropObs = InteropObs;
