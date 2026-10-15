// The graphics card going away, the pure parts (round 43, glrecover): no Electron, no files. Required by
// glrecovermain.js and dev/glrecover-test.js.
//
// On Windows (and now and then on a Mac) the GPU can reset under Hearth: a driver update or crash (Windows' TDR), sleep /
// wake, a monitor plugged in, another app taking the GPU. Chromium restarts its GPU process and the pages get their
// WebGL contexts back (the Lab rebuilds itself: tools/three-sandbox.html "the graphics card coming back"). After a few
// crashes in a row Chromium may stop using the GPU for the rest of the session and draw in software (SwiftShader):
// everything works, much slower, until Hearth restarts. These rules say what the owner is told:
//   · the GPU process went away (not at quit) → "The graphics card restarted — …", at most once in 10 minutes
//   · drawing went from the GPU to software during this session → "Hearth is drawing without the graphics card right
//     now — Restart Hearth to get it back", with a Restart button, once (again only after the GPU came back)
//   · a computer that never had the GPU in this session (a VM, a remote desktop, a test machine) is never told
(function () {
  const RESTARTED_GAP = 10 * 60000;

  // app.getGPUFeatureStatus() → 'gpu' | 'software' | 'none' | 'unknown'. Its values: 'enabled', 'enabled_on',
  // 'enabled_readback', 'enabled_force', 'disabled_software', 'unavailable_software', 'disabled_off', 'unavailable_off'…
  function kind(st) {
    if (!st || typeof st !== 'object' || !Object.keys(st).length) return 'unknown';
    const gc = String(st.gpu_compositing || ''); const wg = String(st.webgl || st.webgl2 || '');
    if (/software/.test(gc) || /software/.test(wg)) return 'software';
    if (/^enabled/.test(gc) && (!wg || /^enabled/.test(wg))) return 'gpu';
    if (/^(disabled|unavailable)/.test(gc) && (!wg || /^(disabled|unavailable)/.test(wg))) return 'none';
    return 'unknown';
  }

  // a GPU process gone that is a crash (not the app quitting, not a clean exit)
  const isCrash = (d, quitting = false) => Boolean(d && d.type === 'GPU' && !quitting && d.reason !== 'clean-exit');

  function init(first) { const k = kind(first); return { kind: k, sawGpu: k === 'gpu', crashes: 0, last: { restarted: 0, software: 0 }, notes: [], seq: 0 }; }

  // st: the state above · ev: { type: 'crash' | 'check', status, now } → the note to show, or null (st is updated)
  function step(st, ev) {
    const now = ev.now ?? Date.now();
    if (ev.type === 'crash') { st.crashes += 1; st.lastCrash = now; return null; }
    const prev = st.kind;
    const k = kind(ev.status);
    if (k !== 'unknown') st.kind = k;
    if (k === 'gpu') { st.sawGpu = true; st.last.software = 0; } // (back on the GPU: a later fall to software is told again)
    let note = null;
    if ((k === 'software' || k === 'none') && st.sawGpu && !st.last.software && (prev === 'gpu' || ev.after === 'crash')) {
      st.last.software = now;
      note = { kind: 'software', restart: true };
    } else if (ev.after === 'crash' && k !== 'software' && k !== 'none' && now - (st.last.restarted || -1e12) > RESTARTED_GAP) {
      st.last.restarted = now;
      note = { kind: 'restarted', restart: false };
    }
    if (!note) return null;
    st.seq += 1;
    const n = { id: `gpu-${st.seq}`, ...note, at: now, crashes: st.crashes, shown: false };
    st.notes.push(n); if (st.notes.length > 10) st.notes.shift();
    return n;
  }

  // the words (the window shows them through Hints; lab: the Lab is open, it rebuilt itself)
  function text(k, { lab = false } = {}) {
    if (k === 'software') return 'Hearth is drawing without the graphics card right now — Restart Hearth to get it back';
    return lab ? 'The graphics card restarted — the Lab picked up where it was' : 'The graphics card restarted — Hearth picked up where it was';
  }
  const view = (st) => ({ kind: st.kind, sawGpu: st.sawGpu, crashes: st.crashes, notes: st.notes.map((n) => ({ ...n })) });

  module.exports = { kind, isCrash, init, step, text, view, RESTARTED_GAP };
}());
