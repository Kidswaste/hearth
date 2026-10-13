// Camera and body tracking as a live Lab input (round 25, "motion"). Not the motion-design kit (three-motion.js):
// this one is the camera IN. A webcam, a capture card or a video file becomes:
//   · a layer's picture (as a background, a cut-out, a glowing silhouette, motion trails, a mask), mirrored or not
//   · numbers the Lab can follow like the sound's: motion energy (overall, regions, a 3 × 3 grid), where and which way
//     it moves, a colour blob, hands (place, open / closed, pinch), body (head, wrists, centre, turn, arms up), face
//     (mouth open, smile, blink, brows), the person's mask: a slider's ♪ react-to and its curve, particles' emitters,
//     shader uniforms (webcam.texture(), webcam.feat.*)
// Tracking runs in the Lab preview, in a Worker (tools/three-sandbox.html "camera input"; the math is
// tools/three-motion-in-core.js): a light tracker always (frame difference, flow-lite, colour blob), MediaPipe Tasks
// once its files are in the data folder (motionmain.js: one download of ≈ 27 MB after a yes, never by itself).
// Privacy: off by default, every time Hearth starts; a red ● Camera pill on the preview while it's on; it pauses (the
// camera light goes off) while the Lab isn't on screen; nothing is recorded or sent (frames go to the preview and are
// dropped); the director's pictures are pixelated while the camera shows unless /webcam share on; a director asks
// before turning the camera on.
// Where: right-click the preview › 📷 Camera ›, /webcam (alias /camera-in, /tracking), Ctrl/⌘+K "Lab: 📷 …", the
// curve editor's sound picker (📷 groups), directors: three_do motion { op: camera | track | follow | look }.
const LabMotionIn = (() => {
  const C = MotionInCore;
  const AREA = 'Three.js Lab';
  const PREF = 'lab.motionIn';
  const RES = { 480: [640, 480], 720: [1280, 720], 1080: [1920, 1080] };
  const prefs = () => ({ res: 720, mirror: null, engine: 'auto', hue: null, trail: 0.35, device: null, share: false, ...(store.get(PREF, {}) || {}) });
  const setPref = (o) => { store.set(PREF, { ...prefs(), ...o }); };
  const st = {
    lab: null, on: false, paused: false, kind: null, label: '', path: null, stream: null, video: null, mirror: true,
    coreSent: false, busy: false, lastAt: 0, frames: 0, rv: 0, timer: 0, want: [], wantAt: 0, mp: 'none', tasks: [], error: null,
    devs: [], filesSent: false, offered: false, hinted: false, probes: new Map(), probeN: 0, pill: null, hideT: 0, starting: null,
  };
  const S = () => st.lab;

  // ---------- the preview (tools/three.js attaches it) ----------
  // o: { send(msg), frame: () => iframe, onStage: () => bool, ready: () => bool, host: preview element }
  function attach(o) {
    st.lab = o; st.coreSent = false; st.filesSent = false;
    for (const ev of ['hearth:view', 'hearth:activate']) addEventListener(ev, () => setTimeout(syncShown, 0));
    document.addEventListener('visibilitychange', syncShown);
    try { new IntersectionObserver(() => syncShown()).observe(o.host); } catch { /* events only */ }
  }
  // straight to the iframe with a transfer list (frames are moved, not copied); null when it can't take them now
  function deliver(msg, transfer = []) {
    const l = S(); if (!l || !l.ready() || l.onStage()) return false;
    const f = l.frame(); if (!f?.contentWindow) return false;
    f.contentWindow.postMessage({ target: 'three-sandbox', ...msg }, '*', transfer);
    return true;
  }
  const send = (m) => S()?.send(m);
  function onReady() {
    st.coreSent = false; st.filesSent = false; st.busy = false;
    if (st.on) { sendCore(); send({ type: 'motionin-share', on: prefs().share }); if (st.mp !== 'none') sendFiles().catch(() => {}); }
  }
  function sendCore() { if (st.coreSent) return; send({ type: 'motionin-core', src: String(hearthMotionCore) }); st.coreSent = true; }
  function onBox(msg) {
    if (msg.type === 'motionin-want') {
      st.want = msg.tasks || []; st.wantAt = Date.now();
      if (!st.on) { hintOff(); return; }
      const mpWanted = st.want.some((t) => t !== 'light');
      if (mpWanted && prefs().engine !== 'light') useModels().catch((err) => console.warn('Camera tracking:', err.message));
      return;
    }
    if (msg.type === 'motionin-state') { st.mp = msg.mp || st.mp; st.tasks = msg.tasks || []; st.error = msg.error || null; if (msg.error) console.warn('Camera tracking:', msg.error); paintPill(); return; }
    if (msg.type === 'motionin-probe-result') { st.probes.get(msg.id)?.(msg); st.probes.delete(msg.id); }
  }
  // a scene reads the camera while it's off: say so once (never turned on by itself)
  function hintOff() {
    if (st.hinted || !S()?.host?.checkVisibility?.({ visibilityProperty: true })) return;
    st.hinted = true;
    toast('📷 This scene can follow the camera (it\'s off).', { timeout: 7000, action: { label: 'Turn the camera on', fn: () => start().catch((e) => toast(e.message, { type: 'error' })) } });
  }

  // ---------- sources: a camera (webcam, capture card), a video file ----------
  async function devices() {
    try { st.devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}`, capture: /capture|elgato|cam ?link|hdmi|usb video|blackmagic|magewell|avermedia|obs virtual/i.test(d.label || '') })); } catch { st.devs = []; }
    return st.devs;
  }
  async function findDevice(q) {
    const w = String(q || '').toLowerCase().trim(); const list = await devices();
    if (!w) return null;
    if (/^\d+$/.test(w)) return list[Number(w) - 1] || null;
    return list.find((d) => d.label.toLowerCase() === w) || list.find((d) => d.label.toLowerCase().includes(w)) || (/capture|card/.test(w) ? list.find((d) => d.capture) : null) || null;
  }
  // { device: id | null, file: path | null }: turns the camera on (or a file plays); resolves with what plays
  async function start({ device, file } = {}) {
    await ThreeLab.cmd?.();
    for (let i = 0; i < 40 && !S(); i += 1) await new Promise((r) => setTimeout(r, 50));
    if (!S()) throw new Error('Open the Three.js Lab first');
    if (st.starting) return st.starting;
    st.starting = (async () => {
      stopSource();
      const p = prefs();
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.className = 'motion-in-src';
      v.style.cssText = 'position:fixed;left:-10px;top:-10px;width:2px;height:2px;opacity:0;pointer-events:none';
      document.body.append(v);
      st.video = v;
      if (file) {
        st.kind = 'file'; st.path = file; st.label = String(file).split(/[\\/]/).pop();
        v.src = /^(blob:|https?:|file:)/.test(file) ? file : WinMac.fileUrl(file); // (round 31, winmac)
        v.loop = true;
        st.mirror = p.mirror ?? false;
      } else {
        if (await window.hub?.motion?.camera?.() === 'denied') throw new Error('The camera is blocked for Hearth: System Settings › Privacy & Security › Camera');
        const id = device !== undefined ? device : p.device;
        const [w, h] = RES[p.res] || RES[720];
        const ask = (exact) => navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(exact ? { deviceId: { exact } } : {}), width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30 } } });
        let s;
        try { s = await ask(id); } catch (err) { if (!id) throw err; s = await ask(null); } // (a camera that went away: the default one)
        st.stream = s; v.srcObject = s;
        st.kind = 'camera'; st.path = null;
        const tr = s.getVideoTracks()[0];
        st.label = tr?.label || 'Camera';
        st.deviceId = tr?.getSettings?.().deviceId || id || null;
        const capture = /capture|elgato|cam ?link|hdmi|usb video|blackmagic|magewell|avermedia/i.test(st.label);
        st.mirror = p.mirror ?? !capture; // a webcam is a mirror by default; a capture card isn't
      }
      await v.play().catch((err) => { throw new Error(`The ${st.kind === 'file' ? 'video' : 'camera'} didn't start: ${err.message}`); });
      st.on = true; st.paused = false;
      sendCore();
      send({ type: 'motionin-share', on: p.share });
      pump();
      paintPill();
      if (st.want.some((t) => t !== 'light') && p.engine !== 'light') useModels().catch(() => {});
      return { source: st.label, kind: st.kind, mirror: st.mirror, size: `${v.videoWidth}×${v.videoHeight}` };
    })();
    try { return await st.starting; } catch (err) { stopSource(); paintPill(); throw err; } finally { st.starting = null; }
  }
  function stopSource() {
    cancelFrames();
    for (const t of st.stream?.getTracks() || []) t.stop();
    st.stream = null;
    if (st.video) { st.video.pause(); st.video.removeAttribute('src'); st.video.srcObject = null; st.video.load?.(); st.video.remove(); st.video = null; }
    st.busy = false;
  }
  function stop() {
    const was = st.on;
    stopSource(); st.on = false; st.paused = false;
    send({ type: 'motionin-off' });
    paintPill();
    return was;
  }

  // ---------- frames → the preview (two ImageBitmaps a frame, moved; ≤ 30 a second) ----------
  function cancelFrames() {
    if (st.rv && st.video?.cancelVideoFrameCallback) st.video.cancelVideoFrameCallback(st.rv);
    st.rv = 0; clearInterval(st.timer); st.timer = 0;
  }
  function pump() {
    cancelFrames();
    const v = st.video; if (!v) return;
    const tick = () => {
      if (st.video !== v || !st.on || st.paused) return;
      if (v.requestVideoFrameCallback) st.rv = v.requestVideoFrameCallback(tick);
      frame(v);
    };
    if (v.requestVideoFrameCallback) st.rv = v.requestVideoFrameCallback(tick); else st.timer = setInterval(() => frame(v), 33);
  }
  async function frame(v) {
    const t = performance.now();
    if (st.busy || t - st.lastAt < 30 || !v.videoWidth) return;
    const l = S(); if (!l?.ready() || l.onStage()) return;
    st.busy = true; st.lastAt = t;
    try {
      const vw = v.videoWidth; const vh = v.videoHeight;
      const cap = (RES[prefs().res] || RES[720])[0];
      const w = Math.min(vw, cap); const h = Math.round((vh * w) / vw);
      const sw = Math.min(vw, 256); const sh = Math.round((vh * sw) / vw);
      const [bmp, small] = await Promise.all([createImageBitmap(v, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }), createImageBitmap(v, { resizeWidth: sw, resizeHeight: sh, resizeQuality: 'low' })]);
      const p = prefs();
      if (!st.on || !deliver({ type: 'motionin-frame', bmp, small, at: t, mirror: st.mirror, cfg: { engine: p.engine, hue: p.hue, trail: p.trail } }, [bmp, small])) { bmp.close(); small.close(); return; }
      st.frames += 1;
    } catch (err) { if (st.frames === 0) console.warn('Camera frame:', err.message); } finally { st.busy = false; }
  }

  // ---------- pause while the Lab isn't on screen (the camera light goes off), on again when it is ----------
  function syncShown() {
    if (!st.on || !S()) return;
    const hidden = document.visibilityState !== 'visible' || !S().host?.checkVisibility?.({ visibilityProperty: true });
    clearTimeout(st.hideT);
    if (hidden && !st.paused) st.hideT = setTimeout(() => pause(true), 1500);
    else if (!hidden && st.paused && !st.userPaused) pause(false);
  }
  async function pause(on, byUser = false) {
    if (!st.on) return false;
    st.userPaused = on && byUser;
    if (on === st.paused) return on;
    st.paused = on;
    if (on) {
      cancelFrames();
      if (st.kind === 'camera') { for (const t of st.stream?.getTracks() || []) t.stop(); st.stream = null; } else st.video?.pause();
    } else if (st.kind === 'camera') {
      const keep = { mirror: st.mirror };
      try { await start({ device: st.deviceId }); st.mirror = keep.mirror; } catch (err) { toast(`📷 ${err.message}`, { type: 'error' }); stop(); }
    } else { await st.video?.play().catch(() => {}); pump(); }
    paintPill();
    return st.paused;
  }

  // ---------- the camera-on pill on the preview (click: its menu) ----------
  function css() {
    if (document.getElementById('motion-in-css')) return;
    document.head.append(el('style', { id: 'motion-in-css', text: `
.motion-in-pill { position: absolute; left: 8px; top: 8px; z-index: 6; display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px 2px 7px; border-radius: 999px; border: 0; font: 600 11px/18px system-ui, sans-serif; color: #fff; background: rgba(170, 20, 28, 0.86); cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.motion-in-pill i { width: 7px; height: 7px; border-radius: 50%; background: #ff4d4d; animation: motion-in-rec 1.6s ease-in-out infinite; }
.motion-in-pill.paused { background: rgba(60, 60, 66, 0.86); } .motion-in-pill.paused i { animation: none; background: #aaa; }
@keyframes motion-in-rec { 50% { opacity: .35; } }` }));
  }
  function paintPill() {
    const host = S()?.host;
    if (!st.on) { st.pill?.remove(); st.pill = null; return; }
    if (!host) return;
    css();
    if (!st.pill || !st.pill.isConnected) {
      st.pill = el('button', { class: 'motion-in-pill', type: 'button', title: 'The camera is on (nothing is recorded or sent). Click: its menu', on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, menuItems()); }, contextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, menuItems()); } } }, el('i'), el('span'));
      host.append(st.pill);
    }
    const txt = `${st.paused ? 'Camera paused' : 'Camera'}${st.mp === 'ready' && st.tasks.length ? ' · tracking' : ''}`;
    const sp = st.pill.lastChild; if (sp.textContent !== txt) sp.textContent = txt;
    st.pill.classList.toggle('paused', st.paused);
  }

  // ---------- MediaPipe's files: asked once, downloaded once, handed to the preview ----------
  const mb = (b) => `${Math.round(b / 1e5) / 10} MB`;
  async function status() { try { return await window.hub.motion.status(); } catch { return null; } }
  async function sendFiles() {
    const files = await window.hub.motion.read();
    if (!files?.bundle) return false;
    const buf = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)]));
    if (!deliver({ type: 'motionin-mp', files: buf }, Object.values(buf))) send({ type: 'motionin-mp', files: buf });
    st.filesSent = true; st.mp = 'loading';
    return true;
  }
  // what the scene reads needs MediaPipe: hand the files over if they're here, else offer the download once
  async function useModels() {
    if (st.filesSent) return true;
    const s = await status();
    if (s?.ready) return sendFiles();
    if (st.offered) return false;
    st.offered = true;
    toast(`📷 Hands, body and face tracking need a one-time download (${mb(s?.bytes || 27e6)}): until then the camera follows movement.`, { timeout: 9000, action: { label: 'Download…', fn: () => download().catch((e) => toast(e.message, { type: 'error' })) } });
    return false;
  }
  async function download({ ask = true } = {}) {
    const s = await status();
    if (!s) throw new Error('Tracking downloads need the desktop app');
    if (s.ready && !s.missing.length) { if (st.on) await sendFiles(); return 'Hand, body and face tracking are already here.'; }
    if (ask) {
      const ok = await Modal.confirm('Download hand, body and face tracking?', `MediaPipe (Google's on-device trackers): the library and four small models, ${mb(s.bytes)}, saved once in Hearth's data folder (${s.version}). Tracking then runs on this computer only: no picture or number from your camera ever leaves it.`, { ok: `Download ${mb(s.bytes)}` });
      if (!ok) return 'Not downloaded: the camera keeps following movement (the light tracker).';
    }
    const t = toast(`Downloading tracking (${mb(s.bytes)})…`, { timeout: 0 });
    const off = window.hub.motion.onProgress?.((p) => { const sp = t?.querySelector('span'); if (sp && p.total) sp.textContent = `Downloading tracking… ${Math.round((p.got / p.total) * 100)}%`; });
    const r = await window.hub.motion.download({});
    try { off?.(); } catch { /* listener gone */ } t?.remove();
    if (!r.ok) throw new Error(`The tracking download failed: ${r.error}`);
    if (st.on) await sendFiles();
    return `📷 Tracking downloaded (${mb(s.bytes)}): hands, body, face and the person's mask now follow you${st.on ? '' : ' once the camera is on'}.`;
  }
  // the checks: a fake MediaPipe bundle through the same path
  function stub(src) { send({ type: 'motionin-stub', src }); st.filesSent = true; st.mp = 'loading'; }

  // ---------- what it sees now (/webcam now, the director, the checks) ----------
  function probe(names = null) {
    const id = `m${(st.probeN += 1)}`;
    return new Promise((resolve) => {
      const t = setTimeout(() => { st.probes.delete(id); resolve(null); }, 2500);
      st.probes.set(id, (m) => { clearTimeout(t); resolve(m); });
      send({ type: 'motionin-probe', id, names });
    });
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  const bar = (x, n = 8) => { const k = Math.round(Math.max(0, Math.min(1, x || 0)) * n); return `${'█'.repeat(k)}${'░'.repeat(n - k)}`; };
  async function nowText() {
    if (!st.on) return '📷 The camera is off (/webcam on).';
    const p = await probe();
    if (!p) return '📷 The preview didn\'t answer (is the Lab open?)';
    const v = p.values;
    const lines = [`**📷 ${st.label}** (${st.kind === 'file' ? 'video file' : 'camera'}${st.mirror ? ', mirrored' : ''}) · ${p.fps || 0} fps · ${p.engine === 'mediapipe' ? `MediaPipe: ${p.tasks.join(', ')}` : 'light tracker'} · ${p.ms} ms a frame${st.paused ? ' · paused' : ''}`,
      `Movement ${bar(v.camMotion)} ${r2(v.camMotion)} · left ${r2(v.camLeft)} right ${r2(v.camRight)} top ${r2(v.camTop)} bottom ${r2(v.camBottom)} · where (${r2(v.camX)}, ${r2(v.camY)})`];
    if (p.tasks.includes('hands') || p.engine === 'light') lines.push(`Hand (${r2(v.handX)}, ${r2(v.handY)})${p.tasks.includes('hands') ? ` · open ${r2(v.handOpen)} · pinch ${r2(v.pinch)} · hands ${v.hands * 2}` : ' (where it moves)'}`);
    if (p.tasks.includes('pose')) lines.push(`Body: head (${r2(v.headX)}, ${r2(v.headY)}) turn ${r2(v.headTurn)} · arms up ${r2(v.armsUp)} · someone ${v.person ? 'there' : 'not there'}`);
    if (p.tasks.includes('face')) lines.push(`Face: mouth ${r2(v.mouthOpen)} · smile ${r2(v.smile)} · blink ${r2(v.blink)}`);
    if (p.error) lines.push(`⚠ ${p.error}`);
    return lines.join('\n');
  }

  // ---------- following: a slider ← a camera feature (the labaudio mapping: curve editor, meters, /react-to) ----------
  const ALIAS = { motion: 'camMotion', movement: 'camMotion', move: 'camMotion', moving: 'camMotion', left: 'camLeft', right: 'camRight', top: 'camTop', bottom: 'camBottom', center: 'camCenter', middle: 'camCenter', flowx: 'camFlowX', flowy: 'camFlowY', blob: 'camBlob', color: 'camBlob', bright: 'camBright', brightness: 'camBright', hand: 'handX', handx: 'handX', handy: 'handY', open: 'handOpen', fist: 'handOpen', spread: 'handSpread', apart: 'handSpread', speed: 'handSpeed', head: 'headTurn', turn: 'headTurn', tilt: 'headTilt', mouth: 'mouthOpen', jaw: 'mouthOpen', brows: 'browUp', eyebrows: 'browUp', mask: 'maskArea', silhouette: 'maskArea', body: 'bodyX', arms: 'armsUp', someone: 'person' };
  function resolve(word) {
    const w = String(word || '').trim(); if (!w) return null; const lw = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    return ALIAS[lw] || C.NAMES.find((n) => n.toLowerCase() === lw) || C.NAMES.find((n) => C.LABEL[n]?.toLowerCase().startsWith(w.toLowerCase())) || null;
  }
  async function labApi() {
    await ThreeLab.cmd?.();
    const A = () => (typeof ThreeAudio !== 'undefined' ? ThreeAudio.lab : null);
    for (let i = 0; i < 40 && !A(); i += 1) await new Promise((r) => setTimeout(r, 50));
    if (!A()) throw new Error('Open the Three.js Lab first');
    return ThreeAudio.lab;
  }
  // a slider: by name (the selected layer first), or the first whose name matches a pattern; { ctl, key, label, layer, min, max }
  async function slider(q, { re = null, layer = null } = {}) {
    const l = await labApi();
    const all = l.layers();
    const named = all.filter((L) => !layer || L.name === layer || L.id === layer).map((L) => L.ctl);
    const order = (layer ? named : [l.selCtl?.(), ...named]).filter(Boolean);
    const nameOf = (ctl) => all.find((L) => L.ctl === ctl)?.name;
    for (const ctl of order) {
      if (q) { const h = ctl.resolve?.(q); if (h?.kind === 'number') return { ctl, key: h.key, label: h.label, layer: nameOf(ctl) }; continue; }
      const c = (ctl.controls?.() || []).find((x) => x.min != null && re.test(`${x.key} ${x.label}`));
      if (c) return { ctl, key: c.key, label: c.label, layer: nameOf(ctl), min: c.min, max: c.max };
    }
    return null;
  }
  async function follow(sliderName, feature, amount = 0.5, { c = null, layer = null } = {}) {
    const f = resolve(feature);
    if (!f) throw new Error(`Which camera feature? ${C.NAMES.slice(0, 20).join(', ')}… (/webcam names)`);
    const s = await slider(sliderName, { layer });
    if (!s) throw new Error(`No slider "${sliderName}"`);
    s.ctl.bind(s.key, f, Math.max(-1, Math.min(1, Number(amount) || 0.5)), c || { att: 40, rel: 160 });
    return `📷 ${s.label}${s.layer ? ` [${s.layer}]` : ''} follows ${C.LABEL[f] || f} (${Math.round(amount * 100)}%) · /react-curve ${s.label} to shape it · /react-to ${s.label} off`;
  }

  // ---------- looks (presets): one searchable list ----------
  const D = () => ThreeLab.director;
  const call = async (tool, args) => { const r = await HubBridge.call(tool, args); if (!r || r.ok === false) throw new Error(r?.error || `${tool} failed`); return r.value; };
  const tw = (o) => Object.entries(o).map(([k, v]) => `  ${k}: ${typeof v === 'string' ? `{ value: '${v}'` : `{ value: ${v[0]}, min: ${v[1]}, max: ${v[2]}`}, label: '${v[3] || k}', group: 'Camera' },`).join('\n');
  // a camera layer's code: its sliders and one call
  function layerCode(mode, sliders, note) {
    return `// 📷 Camera ${mode} (round 25: /webcam). The camera's picture, live, mirrored like a webcam; nothing is recorded.\n// ${note}\n// webcam.layer(P, { mode: 'video' | 'cutout' | 'silhouette' | 'trails' | 'mask' | 'debug' }) · webcam.feat.handX… · webcam.texture()\nconst P = tweak({\n${tw(sliders)}\n});\n\nwebcam.layer(P, { mode: '${mode}' });\n`;
  }
  const VIDEO = { opacity: [1, 0, 1, 'Opacity'], zoom: [1, 0.5, 3, 'Zoom'], bright: [1, 0, 2, 'Brightness'], contrast: [1, 0, 2, 'Contrast'], sat: [1, 0, 2, 'Saturation'], hue: [0, -180, 180, 'Hue'], blur: [0, 0, 20, 'Blur'] };
  async function addCamLayer(name, mode, sliders, note, settings = {}, position) {
    const out = await call('three_add_layer', { name, code: layerCode(mode, sliders, note), ...(position ? { position } : {}), settings, wait: 1 });
    return out?.added || name;
  }
  async function bindFirst(re, feature, amount, c, fallback) {
    let s = await slider(null, { re });
    if (!s && fallback) { await fallback(); s = await slider(null, { re }); }
    if (!s) throw new Error(`No slider to follow ${C.LABEL[feature]} in this scene (looked for ${re.source.replace(/\\b|[()]/g, '').split('|').slice(0, 5).join(', ')}): /webcam follow <slider> ${feature}`);
    s.ctl.bind(s.key, feature, amount, c);
    return `${s.label}${s.layer ? ` [${s.layer}]` : ''} ← ${C.LABEL[feature]}`;
  }
  const SMOOTH = { att: 60, rel: 220 };
  const LOOKS = [
    { id: 'hands-particles', name: 'Particles follow my hands', hint: 'a particle cloud on your hand (both: where you move)', tasks: ['hands'], run: async () => {
      if (typeof LabParticles === 'undefined') throw new Error('GPU particles aren\'t loaded');
      const r = await LabParticles.add('embers', { name: '✦ Hand sparks', sliders: { emitSize: 0.25, emitX: -3, emitY: -2, gravity: -0.2, speed: 0.4, life: 1.6 }, opts: { emitter: 'ball' } });
      // (the new layer's sliders show up in the hub a moment after it's added)
      let s = null; let s2 = null;
      for (let i = 0; i < 30 && !(s && s2); i += 1) { s = await slider('emitX', { layer: r.layer }); s2 = await slider('emitY', { layer: r.layer }); if (!(s && s2)) await new Promise((res) => setTimeout(res, 150)); }
      if (!s || !s2) throw new Error(`"${r.layer}" has no emitter sliders yet: /webcam follow emitX handX`);
      s.ctl.bind(s.key, 'handX', 0.5, { att: 30, rel: 90 }); s2.ctl.bind(s2.key, 'handY', 1 / 3, { att: 30, rel: 90 });
      return `✦ "${r.layer}": its emitter follows your hand (Emitter left / right ← hand x, down / up ← hand y)`;
    } },
    { id: 'body-sparks', name: 'Sparks off my silhouette', hint: 'particles rise from your body\'s shape', tasks: ['mask'], run: async () => {
      const L = await addCamLayer('📷 Silhouette', 'silhouette', { color: '#ff8a3d', glow: [18, 0, 80, 'Glow'], soft: [3, 0, 20, 'Soft edge'], opacity: [0.8, 0, 1, 'Opacity'] }, 'Your shape, glowing (the person\'s mask; the light tracker: what moves).', { blend: 'add' });
      if (typeof LabParticles === 'undefined') return `📷 "${L}" (no particles loaded)`;
      const r = await LabParticles.add('glowrise', { source: L, name: '✦ Sparks off me' });
      return `📷 "${L}" + ✦ "${r.layer}": sparks born on your silhouette`;
    } },
    { id: 'silhouette-glow', name: 'Silhouette glow', hint: 'your shape as a glowing light (add blend)', tasks: ['mask'], run: async () => `📷 "${await addCamLayer('📷 Silhouette glow', 'silhouette', { color: '#48ddff', glow: [30, 0, 80, 'Glow'], soft: [4, 0, 20, 'Soft edge'], opacity: [1, 0, 1, 'Opacity'] }, 'Your shape as light: the person\'s mask (MediaPipe) or, in light mode, what moves.', { blend: 'add' })}": your silhouette glows` },
    { id: 'motion-trails', name: 'Motion trails', hint: 'what moves leaves a fading trail', tasks: [], run: async () => `📷 "${await addCamLayer('📷 Motion trails', 'trails', { fade: [0.1, 0.01, 1, 'Fade (fast → slow)'], color: '#ff6b9d', opacity: [1, 0, 1, 'Opacity'] }, 'What moves now, over the faded frames before it.', { blend: 'screen' })}": move to paint trails` },
    { id: 'head-camera', name: 'Head turns the camera', hint: 'turn your head: the scene turns (orbit / spin / turn slider)', tasks: ['pose', 'face'], run: async () => `📷 ${await bindFirst(/\b(orbit|turn|rotat|yaw|angle|camera|cam|spin|swing|pan)/i, 'headTurn', 0.5, SMOOTH)}` },
    { id: 'mouth-bloom', name: 'Mouth opens the bloom', hint: 'open your mouth: it glows (bloom / glow slider, else a glow layer)', tasks: ['face'], run: async () => `📷 ${await bindFirst(/\b(bloom|glow|exposure|flare|bright)/i, 'mouthOpen', 0.6, { att: 30, rel: 200 }, () => call('three_add_layer', { template: 'glow', wait: 1 }))}` },
    { id: 'camera-bg', name: 'Camera as the background', hint: 'the live picture under everything', tasks: [], run: async () => `📷 "${await addCamLayer('📷 Camera', 'video', VIDEO, 'The camera under the scene (Zoom, Brightness… are live sliders).', {}, 'bottom')}": the camera, at the bottom` },
    { id: 'cutout', name: 'Me, cut out', hint: 'only you, over the scene (no green screen)', tasks: ['mask'], run: async () => `📷 "${await addCamLayer('📷 Me', 'cutout', { ...VIDEO, soft: [4, 0, 20, 'Soft edge'] }, 'You without the room: the person\'s mask (MediaPipe; light mode shows what moves).')}": you, cut out` },
    { id: 'move-grow', name: 'Move to grow', hint: 'movement makes it bigger (size / scale)', tasks: [], run: async () => `📷 ${await bindFirst(/\b(size|scale|zoom|grow|radius)/i, 'camMotion', 0.5, { att: 20, rel: 400 })}` },
    { id: 'pinch-zoom', name: 'Pinch to zoom', hint: 'pinch thumb and index: zoom', tasks: ['hands'], run: async () => `📷 ${await bindFirst(/\b(zoom|scale|size|distance)/i, 'pinch', 0.5, SMOOTH)}` },
    { id: 'hands-apart', name: 'Hands apart, bigger', hint: 'move your hands apart', tasks: ['hands'], run: async () => `📷 ${await bindFirst(/\b(size|scale|spread|radius|zoom)/i, 'handSpread', 0.6, SMOOTH)}` },
    { id: 'smile-color', name: 'Smile shifts the colour', hint: 'a smile turns the hue', tasks: ['face'], run: async () => `📷 ${await bindFirst(/\b(hue|tint|color|colour|sat)/i, 'smile', 0.4, { att: 120, rel: 600 })}` },
    { id: 'blink-flash', name: 'Blink flash', hint: 'a blink flashes it', tasks: ['face'], run: async () => `📷 ${await bindFirst(/\b(flash|bright|glow|exposure|bloom|opacity)/i, 'blink', 0.6, { att: 0, rel: 250 })}` },
    { id: 'wave-speed', name: 'Wave to speed up', hint: 'movement makes it faster (speed / spin)', tasks: [], run: async () => `📷 ${await bindFirst(/\b(speed|spin|rate|tempo|flow)/i, 'camMotion', 0.5, { att: 40, rel: 800 })}` },
    { id: 'debug', name: 'What the tracker sees', hint: 'the camera with the mask, the grid and the points', tasks: ['hands'], run: async () => `📷 "${await addCamLayer('📷 Tracker view', 'debug', { opacity: [0.85, 0, 1, 'Opacity'] }, 'The camera with what the tracker sees: the mask, the 3 × 3 motion grid, where it moves, hands, head.')}": what the tracker sees (remove it when done)` },
  ];
  const lookOf = (q) => { const w = String(q || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (!w) return null; return LOOKS.find((l) => l.id.replace(/-/g, '') === w) || LOOKS.find((l) => l.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(w)) || LOOKS.find((l) => l.id.includes(String(q).toLowerCase())) || null; };
  async function look(q, { on = true } = {}) {
    const L = lookOf(q);
    if (!L) throw new Error(`No camera look "${q}". ${LOOKS.map((l) => l.id).join(', ')}`);
    await labApi();
    const out = await L.run();
    if (on && !st.on) { try { await start(); } catch (err) { return `${out}\n📷 The camera didn't start: ${err.message}`; } }
    if (L.tasks.length && prefs().engine !== 'light') useModels().catch(() => {});
    return out;
  }
  function picker() {
    const items = LOOKS.map((l) => [l.name, l.hint, () => look(l.id).then((t) => toast(t, { timeout: 3500 })).catch((e) => toast(e.message, { type: 'error' }))]);
    const r = S()?.host?.getBoundingClientRect?.() || { left: 200, top: 120 };
    return showMenu(r.left + 40, r.top + 40, items.map(([label, hint, action]) => ({ label, hint, action })));
  }

  // ---------- menus (right-click the preview › 📷 Camera, the pill) ----------
  function menuItems() {
    const p = prefs();
    return [
      st.on ? { label: '■ Turn the camera off', action: () => stop() } : { label: '● Turn the camera on', hint: 'off by default · nothing recorded', action: () => start().then((r) => toast(`📷 ${r.source}`, { timeout: 2000 })).catch((e) => toast(e.message, { type: 'error' })) },
      ...(st.on ? [{ label: st.paused ? '▶ Resume' : '❚❚ Pause', action: () => pause(!st.paused, true) }] : []),
      { label: 'Looks', hint: `${LOOKS.length}`, items: () => LOOKS.map((l) => ({ label: l.name, hint: l.hint, action: () => look(l.id).then((t) => toast(t, { timeout: 3500 })).catch((e) => toast(e.message, { type: 'error' })) })) },
      { label: 'Source', hint: st.on ? st.label : '', items: () => {
        devices(); // (refreshed for the next time: the menu is drawn now)
        const list = st.devs.filter((d) => d.id);
        return [...(list.length ? list.map((d) => ({ label: `${d.capture ? '🎛 ' : ''}${d.label}`, checked: st.kind === 'camera' && st.deviceId === d.id, action: () => { setPref({ device: d.id }); start({ device: d.id }).catch((e) => toast(e.message, { type: 'error' })); } })) : [{ label: 'The default camera', checked: st.kind === 'camera', action: () => start({ device: null }).catch((e) => toast(e.message, { type: 'error' })) }]),
          '-', { label: 'Video file…', hint: 'plays as the camera', action: () => pickFile().catch((e) => toast(e.message, { type: 'error' })) }];
      } },
      { label: 'Mirror', checked: st.on ? st.mirror : p.mirror !== false, action: () => setMirror(!(st.on ? st.mirror : p.mirror !== false)) },
      { label: 'Resolution', hint: `${p.res}p`, items: () => [480, 720, 1080].map((r) => ({ label: `${r}p`, checked: p.res === r, action: () => setRes(r) })) },
      { label: 'Tracking', hint: p.engine === 'light' ? 'light' : st.mp === 'ready' ? 'MediaPipe' : 'auto', items: () => [
        { label: 'Auto', hint: 'MediaPipe when downloaded, else movement', checked: p.engine !== 'light', action: () => setEngine('auto') },
        { label: 'Movement only (light)', hint: 'no models: motion, flow, colour blob', checked: p.engine === 'light', action: () => setEngine('light') },
        '-', { label: 'Download hand, body & face tracking…', hint: '≈ 27 MB, once', action: () => download().then((t) => toast(t, { timeout: 4000 })).catch((e) => toast(e.message, { type: 'error' })) },
        { label: 'Follow a colour…', hint: p.hue != null ? `hue ${p.hue}` : 'off', action: () => Promise.resolve(Modal.prompt('Follow a colour', { value: p.hue != null ? String(p.hue) : '#ff2a2a', label: 'A colour (#hex) or a hue 0–360; empty: off' })).then((v) => v !== null && toast(setHue(v), { timeout: 2500 })) },
      ] },
      { label: 'Share the camera with the director', hint: 'its pictures are pixelated otherwise', checked: p.share, action: () => setShare(!p.share) },
      { label: 'What it sees now', action: () => nowText().then((t) => toast(t.replace(/\*\*/g, ''), { timeout: 7000 })) },
    ];
  }
  function previewItem() { return { label: '📷 Camera', hint: st.on ? (st.paused ? 'paused' : 'on') : 'off', items: () => menuItems() }; }
  async function pickFile() {
    const [p] = (await window.hub.openDialog({ title: 'A video to use as the camera', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv'] }] })) || [];
    if (!p) return null;
    const out = await start({ file: p }); toast(`📷 ${out.source} plays as the camera`, { timeout: 2200 }); return out;
  }
  function setMirror(on) { setPref({ mirror: Boolean(on) }); st.mirror = Boolean(on); return `📷 Mirror ${on ? 'on' : 'off'}`; }
  async function setRes(r) { const n = Number(String(r).replace(/p$/i, '')); if (!RES[n]) throw new Error('480, 720 or 1080'); setPref({ res: n }); if (st.on && st.kind === 'camera') await start({ device: st.deviceId }); return `📷 ${n}p`; }
  function setEngine(e) { const v = /light|move|motion|off/i.test(e) ? 'light' : 'auto'; setPref({ engine: v }); if (v === 'auto' && st.on && st.want.some((t) => t !== 'light')) useModels().catch(() => {}); return v === 'light' ? '📷 Tracking: movement only (no models)' : '📷 Tracking: auto (MediaPipe when downloaded)'; }
  function setShare(on) { setPref({ share: Boolean(on) }); send({ type: 'motionin-share', on: Boolean(on) }); return on ? '📷 The director sees the camera in its pictures' : '📷 The director\'s pictures are pixelated while the camera shows'; }
  function setHue(v) {
    const s = String(v ?? '').trim();
    if (!s || /^off|none$/i.test(s)) { setPref({ hue: null }); return '📷 Colour blob off'; }
    let h = Number(s);
    if (!Number.isFinite(h)) { const m = /^#?([0-9a-f]{6})$/i.exec(s); if (!m) return 'A colour like #ff2a2a or a hue 0–360'; const n = parseInt(m[1], 16); const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn || 1; h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
    setPref({ hue: Math.round(((h % 360) + 360) % 360) });
    return `📷 Following the colour at hue ${prefs().hue}° (camBlob, camBlobX, camBlobY)`;
  }

  // ---------- the curve editor's sound picker and /react-to know the camera's features ----------
  function joinAudio() {
    if (typeof ThreeAudio === 'undefined' || !Array.isArray(ThreeAudio.GROUPS) || ThreeAudio.GROUPS.some((g) => g[0].startsWith('📷'))) return;
    for (const [g, list] of C.GROUPS) ThreeAudio.GROUPS.push([`📷 ${g}`, list]);
  }

  // ---------- directors: three_do motion { op: camera | track | follow | look } (help webcam) ----------
  const OPS = new Set(['camera', 'webcam', 'track', 'follow', 'look', 'looks']);
  const owns = (op) => OPS.has(String(op || '').toLowerCase());
  const HELP = `CAMERA IN (round 25): the owner's webcam / capture card / a video file as a live Lab input, tracked on this computer (light tracker: movement; MediaPipe after the owner's one-time download: hands, body, face, mask). Off by default; turning it on asks the owner. Tool: three_do { cmd: "motion", op } — camera {on: true|false, device, file, mirror, res: 480|720|1080, tracker: auto|light} (status without args) · track {names} (the values now) · follow {slider, feature, amount, layer} (a slider follows a feature: the ♪ react-to mapping) · look {preset} (${LOOKS.map((l) => l.id).join(', ')}) · looks. Features (0..1, x left→right on screen, y bottom→top, turns 0.5 = straight): ${C.GROUPS.map(([g, l]) => `${g}: ${l.map((x) => x[0]).join(' ')}`).join(' · ')} · camZ0…camZ8 (3×3 movement grid). In code: webcam.feat.handX (also audio.feat.handX, onHit('pinch')), webcam.layer(P, {mode: 'video'|'cutout'|'silhouette'|'trails'|'mask'|'debug'}) shows the camera in a layer (sliders opacity zoom x y fit bright contrast sat hue blur color glow soft fade), webcam.texture() / webcam.maskTexture() (THREE textures that follow it), webcam.points (hands). Particles from the body: a 'mask' or 'silhouette' layer + particles emitter 'layer' (source: it). Your screenshots are pixelated while the camera shows unless the owner shares it. The owner: /webcam, right-click the preview › 📷 Camera.`;
  async function op(a = {}, ctx = {}) {
    const o = String(a.op || '').toLowerCase();
    if (o === 'camera' || o === 'webcam') {
      if (a.mirror != null) setMirror(Boolean(a.mirror));
      if (a.res != null) await setRes(a.res);
      if (a.tracker) setEngine(String(a.tracker));
      if (a.on === false) { stop(); return { camera: 'off' }; }
      if (a.on === true || a.device || a.file) {
        if (!st.on || a.device || a.file) {
          const yes = window.Access?.ask ? await Access.ask({ agentId: ctx.agentId || null, action: 'camera', target: a.file || a.device || 'the camera', risk: 'high', detail: 'The director wants to use your camera as a live input in the Lab (tracked on this computer; nothing recorded or sent).' })
            : await Modal.confirm('Turn the camera on?', 'The director wants to use your camera as a live input in the Lab: tracked on this computer, nothing recorded or sent.', { ok: 'Turn it on' });
          if (!yes) return { camera: 'off', note: 'The owner said no.' };
          const dev = a.device ? (await findDevice(a.device))?.id : undefined;
          await start({ device: dev, file: a.file || null });
        }
      }
      return { camera: st.on ? (st.paused ? 'paused' : 'on') : 'off', source: st.label || null, kind: st.kind, mirror: st.mirror, res: prefs().res, tracker: prefs().engine, mediapipe: st.mp, tasks: st.tasks, devices: (await devices()).map((d) => d.label) };
    }
    if (o === 'track') {
      if (!st.on) return { camera: 'off', note: 'Turn it on first: op camera {on: true} (the owner is asked).' };
      const p = await probe(a.names ? [].concat(a.names) : null);
      return p ? { engine: p.engine, tasks: p.tasks, fps: p.fps, values: p.values } : { error: 'The preview didn\'t answer' };
    }
    if (o === 'follow') return follow(a.slider, a.feature, a.amount ?? 0.5, { layer: a.layer || null });
    if (o === 'look') return look(a.preset || a.name);
    if (o === 'looks') return LOOKS.map((l) => `${l.id}: ${l.name} (${l.hint})`).join('\n');
    throw new Error(`motion ops for the camera: camera · track · follow · look · looks (help webcam)`);
  }

  // ---------- /webcam ----------
  const pick = (list, q) => list.filter((x) => x.value.startsWith(q)).slice(0, 30);
  function registerCommands() {
    if (typeof Commands === 'undefined' || Commands.get('webcam')) return;
    Commands.register({
      name: 'webcam', area: AREA, aliases: ['camera-in', 'tracking'],
      desc: 'The camera (webcam, capture card, a video file) as a live Lab input: on / off, looks (particles follow my hands, silhouette glow, motion trails…), sliders following your hands, head, face or movement; tracked on this computer, nothing recorded',
      args: '[on|off|pause|now|looks|look <name>|follow <slider> <feature> [amount]|devices|use <camera>|file <path>|mirror on|off|res 480|720|1080|tracker auto|light|download|color <#hex|off>|share on|off|names|help]',
      keywords: 'camera webcam capture card video input tracking body hands pose face mediapipe motion energy silhouette mask segmentation optical flow privacy',
      examples: ['/webcam on', '/webcam look particles follow my hands', '/webcam follow size pinch 60%'],
      undo: '/webcam off',
      complete: (a) => {
        const w = String(a || '').toLowerCase();
        if (/^look /.test(w)) return pick(LOOKS.map((l) => ({ value: `look ${l.id}`, hint: l.name })), w);
        if (/^follow \S+ /.test(w)) { const head = w.split(/\s+/).slice(0, 2).join(' '); return C.NAMES.filter((n) => !/^camZ|tracked/.test(n)).map((n) => ({ value: `${head} ${n}`, hint: C.LABEL[n] })).filter((x) => x.value.toLowerCase().startsWith(w)).slice(0, 30); }
        const verbs = [['on', 'turn the camera on'], ['off', 'turn it off'], ['pause', 'pause / resume'], ['now', 'what it sees now'], ['looks', `${LOOKS.length} looks`], ['look ', 'a look'], ['follow ', 'a slider follows a feature'], ['devices', 'cameras and capture cards'], ['use ', 'a camera by name or number'], ['file ', 'a video file as the camera'], ['mirror on', ''], ['mirror off', ''], ['res 720', '480 | 720 | 1080'], ['tracker auto', 'MediaPipe when downloaded'], ['tracker light', 'movement only'], ['download', 'hand, body & face tracking (≈ 27 MB, once)'], ['color ', 'follow a colour (#hex | hue | off)'], ['share on', 'the director sees it'], ['share off', 'pixelated for the director'], ['names', 'every feature'], ['help', '']];
        return pick(verbs.map(([value, hint]) => ({ value, hint })), w);
      },
      run: async (args) => {
        const w = String(args || '').trim(); const [verb0, ...rest] = w.split(/\s+/); const verb = (verb0 || '').toLowerCase(); const tail = rest.join(' ');
        if (!verb) return st.on ? nowText() : `📷 The camera is off. **/webcam on** turns it on (nothing is recorded or sent; it pauses when the Lab isn't on screen). Looks: /webcam looks · features: /webcam names`;
        if (verb === 'help') return `\`\`\`\n${HELP}\n\`\`\``;
        if (verb === 'on' || verb === 'start') { const r = await start(); return `📷 ${r.source} (${r.size}${r.mirror ? ', mirrored' : ''}): the Lab can follow it. /webcam looks · /webcam now`; }
        if (verb === 'off' || verb === 'stop') return stop() ? '📷 Camera off' : '📷 The camera was off';
        if (verb === 'pause' || verb === 'resume') { if (!st.on) return '📷 The camera is off'; const p = await pause(verb === 'pause' ? !st.paused : false, true); return p ? '📷 Paused (the camera light goes off)' : '📷 Resumed'; }
        if (verb === 'now' || verb === 'status') return nowText();
        if (verb === 'looks' || (verb === 'look' && !tail)) { await labApi(); picker(); return LOOKS.map((l) => `- **${l.name}** (\`/webcam look ${l.id}\`): ${l.hint}`).join('\n'); }
        if (verb === 'look' || lookOf(w)) return look(verb === 'look' ? tail : w);
        if (verb === 'follow') { const ws = rest; let fi = -1; for (let i = 1; i < ws.length; i += 1) if (resolve(ws[i])) { fi = i; break; } if (fi < 0) return 'Usage: /webcam follow <slider> <feature> [amount%] (/webcam names)'; const amt = ws[fi + 1] ? Number(ws[fi + 1].replace('%', '')) : 50; return follow(ws.slice(0, fi).join(' '), ws[fi], Math.abs(amt) > 1 ? amt / 100 : amt); }
        if (verb === 'devices' || verb === 'list') { const l = await devices(); return l.length ? l.map((d, i) => `${i + 1}. ${d.capture ? '🎛 ' : '📷 '}${d.label}${st.deviceId === d.id ? ' (on)' : ''}`).join('\n') : 'No camera found (the names show once the camera was allowed: /webcam on)'; }
        if (verb === 'use') { const d = await findDevice(tail); if (!d) return `No camera "${tail}" (/webcam devices)`; setPref({ device: d.id }); const r = await start({ device: d.id }); return `📷 ${r.source}`; }
        if (verb === 'file' || verb === 'video') { if (!tail) { const r = await pickFile(); return r ? `📷 ${r.source} plays as the camera` : null; } const r = await start({ file: tail.replace(/^["']|["']$/g, '') }); return `📷 ${r.source} plays as the camera (looped)`; }
        if (verb === 'mirror') return setMirror(!/off|no|false/i.test(tail));
        if (verb === 'res' || verb === 'resolution') return setRes(tail);
        if (verb === 'tracker' || verb === 'engine') return setEngine(tail);
        if (verb === 'download' || verb === 'models') return download();
        if (verb === 'remove-models') { await window.hub.motion.remove(); st.filesSent = false; return '📷 Tracking files removed (the camera follows movement only).'; }
        if (verb === 'color' || verb === 'colour') return setHue(tail);
        if (verb === 'share') return setShare(!/off|no|false/i.test(tail));
        if (verb === 'names' || verb === 'features') return `${C.GROUPS.map(([g, l]) => `**${g}**: ${l.map(([n, lb]) => `${n} (${lb})`).join(' · ')}`).join('\n')}\n**Grid**: camZ0…camZ8 (3 × 3, from the top left)\nIn a sketch: webcam.feat.handX · audio.env('pinch', 20, 200) · onHit('pinch', fn) · webcam.layer(P, { mode }) · webcam.texture(). Sliders: /react-to <slider> handX, or /webcam follow.`;
        return `Unknown: ${verb0}. /webcam help`;
      },
    });
  }
  registerCommands();
  joinAudio();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Lab: 📷 Camera on / off (live input)', () => (st.on ? stop() : start().catch((e) => toast(e.message, { type: 'error' }))));
    AppUI.addAction('Lab: 📷 Camera looks (hands, silhouette, trails…)…', () => labApi().then(() => picker()).catch((e) => toast(e.message, { type: 'error' })));
    AppUI.addAction('Lab: 📷 Camera source (webcam, capture card, video file)…', () => labApi().then(() => { const r = S()?.host?.getBoundingClientRect?.() || { left: 200, top: 120 }; showMenu(r.left + 40, r.top + 40, menuItems()); }).catch((e) => toast(e.message, { type: 'error' })));
  }

  return { attach, onReady, onBox, previewItem, menuItems, owns, op, start, stop, pause, devices, findDevice, look, follow, resolve, probe, nowText, download, stub, picker, LOOKS, HELP, get state() { return { on: st.on, paused: st.paused, kind: st.kind, label: st.label, mirror: st.mirror, frames: st.frames, mp: st.mp, tasks: st.tasks.slice(), want: st.want.slice(), error: st.error, offered: st.offered, busy: st.busy, video: st.video ? { w: st.video.videoWidth, paused: st.video.paused, ready: st.video.readyState } : null }; } };
})();
window.LabMotionIn = LabMotionIn;
