// (round 37, labboot) The Lab's preview page, warmed while nothing happens. Opening the Lab used to start its preview
// page on the click: load the page, three.js, make the WebGL contexts, run the scene and compile its shaders (≈ 2.3 s
// here, most of it the GPU's first steps and three.js from the network on a real computer). Now, in an idle moment
// after the start, a hidden preview page loads and runs the scene the Lab will open with (no music, no references:
// its contexts and compiled shaders are what's kept), draws it once and goes to sleep (parked: no frames). The Lab's
// first run takes that page over in place (moveBefore keeps it running) and swaps its own run in over the warm
// picture, with the contexts and programs already made (tools/three.js sandboxFrame `warmed`, run()).
//   · only for someone who opened the Lab in the last 14 days (localStorage 'labboot.used'); once per start
//   · let go after 15 minutes unused (its process and GPU memory go); never while the Lab is already up
//   · the page is loaded for the query the Lab will ask (three.js version, exact-size pixels): a different one is a
//     normal load, as before
//   · tests: localStorage 'labboot.warm' = '1' warms whatever was used, '0' never warms
const LabBoot = (() => {
  const SANDBOX = 'tools/three-sandbox.html';
  const USED_DAYS = 14;
  const LET_GO_MS = 15 * 60000;
  let w = null; // { host, frame, n, query, sketch, ready, ran, drawn, taken, t0, times }
  let started = false;
  const st = { warmed: 0, taken: 0, dropped: 0, skipped: null, times: null };
  const flag = () => { try { return localStorage.getItem('labboot.warm'); } catch { return null; } };
  const can = () => typeof Element !== 'undefined' && typeof Element.prototype.moveBefore === 'function';
  const labUp = () => Boolean(H.surfaces?.get?.('tool:three')?.mounted);
  const usedRecently = () => { const t = Number(store.get('labboot.used', 0)) || 0; return t > Date.now() - USED_DAYS * 864e5; };

  // the query the Lab's preview will load with (tools/three.js sandboxFrame queryNow): the last one it used for this
  // scene, else this three.js version at screen pixels
  function queryFor(sketchId) {
    const last = store.get('labboot.last', null);
    if (last?.id === sketchId && typeof last.query === 'string') return last.query;
    const v = store.get('three.version', typeof ThreeData !== 'undefined' ? ThreeData.VERSIONS[0] : null);
    return v ? `?mode=sketch&v=${v}` : null;
  }
  // the layers as the Lab sends them (tools/three-backstage.js specOf), plain code: no sliders, no music
  function specs(s) {
    const Ls = Array.isArray(s.layers) && s.layers.length ? s.layers : [{ id: 'main', name: 'Layer 1', code: s.code || '', slot: 0 }];
    return Ls.filter((L) => !L.precomp && typeof L.code === 'string').map((L, z) => ({ id: L.id, code: L.code, z, slot: L.slot ?? z, name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, overrides: L.overrides || null }));
  }
  const post = (m) => { try { w?.frame.contentWindow?.postMessage({ target: 'three-sandbox', ...m }, '*'); } catch { /* gone */ } };
  const mark = (k) => { if (w && w.times[k] == null) w.times[k] = Math.round(performance.now() - w.t0); };
  function onMsg(e) {
    if (!w || e.source !== w.frame.contentWindow) return;
    const d = e.data;
    if (d?.source !== 'three-sandbox') return;
    if (d.type === 'lib-need') { if (typeof ThreeLab !== 'undefined') ThreeLab._lib?.(d.name, (m) => post(m)); return; } // motion / lab3d kits (tools/three.js)
    if (d.type === 'gpu-lost') { drop('gpu lost'); return; } // (round 43, glrecover) the GPU took its contexts: the Lab opens the usual way, on a clean page
    if (d.type === 'ready') {
      if (d.n && d.n !== w.n) return;
      w.ready = d; mark('ready');
      if (w.taken || !w.layers?.length) return;
      post({ type: 'tweak-init', values: {}, keys: {}, mods: {} });
      post({ type: 'run-layers', layers: w.layers });
      w.ran = true;
    }
    if (d.type === 'stack-drawn' && w.ran) {
      w.drawn = true; mark('drawn');
      // drawn once: the page sleeps until the Lab takes it (a frame or two more for late shaders first)
      setTimeout(() => { if (w && !w.taken) post({ type: 'park', on: true }); }, 400);
    }
  }
  function drop(why) {
    if (!w || w.taken) return;
    removeEventListener('message', onMsg);
    try { w.frame.src = 'about:blank'; } catch { /* gone */ }
    w.host.remove();
    w = null; st.dropped += 1; st.skipped = why;
  }

  async function warm() {
    if (started) return;
    started = true;
    const f = flag();
    // (round 39, powerwise) no warm page on battery / battery saver: the Lab opens the usual way
    const why = f === '0' ? 'off' : !can() ? 'no moveBefore' : labUp() ? 'lab already up' : (f !== '1' && !usedRecently()) ? 'lab not used lately' : (f !== '1' && window.Power?.warm?.() === false) ? 'on battery' : null;
    if (why) { st.skipped = why; return; }
    let sketches = [];
    try { sketches = await window.hub.kvGet('three-sketches', []); } catch { /* none */ }
    if (labUp() || !Array.isArray(sketches) || !sketches.length) { st.skipped = labUp() ? 'lab already up' : 'no scenes'; return; }
    const ids = sketches.map((x) => x.id);
    const cur = store.get('three.current');
    const want = (typeof ChatScenes !== 'undefined' ? ChatScenes.startSketch?.(ids) : null) || (ids.includes(cur) ? cur : ids[0]);
    const s = sketches.find((x) => x.id === want);
    const query = queryFor(want);
    if (!s || !query) { st.skipped = 'no query'; return; }
    const size = store.get('labboot.size', null);
    const [fw, fh] = Array.isArray(size) && size[0] > 40 && size[1] > 40 ? size : [960, 540];
    // behind the app (not off screen: a cross-origin frame outside the viewport stops drawing), at the preview's size
    const host = el('div', { class: 'lab-boot', attrs: { 'aria-hidden': 'true' }, style: { position: 'fixed', left: '0', top: '0', width: `${fw}px`, height: `${fh}px`, zIndex: '-1', opacity: '0', pointerEvents: 'none', overflow: 'hidden', contain: 'strict' } });
    // the same frame the Lab makes (sandboxFrame): no allow-same-origin, sketch code can't reach the hub
    const frame = el('iframe', { class: 'three-frame', attrs: { sandbox: 'allow-scripts allow-pointer-lock allow-downloads', allow: 'display-capture; microphone; autoplay' }, style: { width: '100%', height: '100%', border: '0' } });
    host.append(frame);
    const n = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    w = { host, frame, n, query, sketch: want, layers: specs(s), ready: null, ran: false, drawn: false, taken: false, t0: performance.now(), times: {} };
    st.times = w.times;
    addEventListener('message', onMsg);
    document.body.append(host);
    frame.src = `${SANDBOX}${query}&n=${n}`;
    st.warmed += 1;
    setTimeout(() => drop('unused'), LET_GO_MS);
  }

  // The Lab's preview frame takes the warm page (tools/three.js sandboxFrame): the iframe itself (moved, not
  // reloaded) and, at its first load, adopt(query) says whether it fits and in what state it is.
  function take(parent) {
    if (!w || w.taken || !can() || !parent?.isConnected) return null;
    const frame = w.frame;
    try { parent.moveBefore(frame, null); } catch (err) { st.skipped = `move: ${err.message}`; return null; }
    w.taken = true; st.taken += 1;
    frame.style.width = ''; frame.style.height = ''; frame.style.border = '';
    w.host.remove();
    const mine = w;
    return {
      frame,
      // at the Lab's first load: { n, ready, ran } when the page was loaded for this query, else null (a normal load)
      adopt(query) {
        removeEventListener('message', onMsg);
        if (w === mine) w = null;
        if (query !== mine.query) { st.skipped = 'other query'; return null; }
        return { n: mine.n, ready: mine.ready, ran: mine.ran && mine.drawn ? 'drawn' : mine.ran, sketch: mine.sketch, times: mine.times };
      },
    };
  }

  // used: the Lab was opened (the warm-up is for people who use it); its preview's size and query for the next start
  function used(frameEl) {
    store.set('labboot.used', Date.now());
    if (!frameEl || used.ro) return;
    let t = 0;
    const keep = () => { const r = [frameEl.clientWidth, frameEl.clientHeight]; if (r[0] > 40 && r[1] > 40) store.set('labboot.size', r); };
    try { used.ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(keep, 1500); }); used.ro.observe(frameEl); } catch { /* no observer */ }
  }
  let lastRan = '';
  const ran = (id, query) => { const k = `${id}${query}`; if (!id || !query || k === lastRan) return; lastRan = k; store.set('labboot.last', { id, query }); };
  addEventListener('hearth:lab-ready', () => used(document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame')));

  // after the start: once every 'soon' group is in (or 6 s), in an idle moment
  function schedule() {
    const t0 = performance.now();
    const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
    const tick = () => {
      const busy = window.Lazy?.state?.().some((g) => g.tier === 'soon' && g.state !== 'loaded' && g.state !== 'failed');
      if (busy && performance.now() - t0 < 6000) { setTimeout(tick, 400); return; }
      idle(() => warm().catch((err) => { st.skipped = err.message; }));
    };
    setTimeout(tick, 300);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', schedule, { once: true }); else schedule();

  return { take, used, ran, warm, state: () => ({ ...st, up: Boolean(w), ready: Boolean(w?.ready), drawn: Boolean(w?.drawn), sketch: w?.sketch || null }) };
})();
window.LabBoot = LabBoot;
