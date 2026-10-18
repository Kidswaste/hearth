// (round 64, audiodoctor64) The audio doctor where the owner already looks: the Sound desk (Codex's tools/workbench-vst.js,
// three additive hooks). A visible "🎚 Check my audio setup" button in the desk's top row (there even before the runtime
// is set up), a "🎚 Check setup" button right after the live controls (Audio output · Buffer · …), and, when live
// audio fails to start, the same check opening by itself as a friendly card in the desk (quick: no plugin loads, no
// tone; at most once per 15 s). The card itself is audiodoctor.js (lazy group 'audiodoctor', loaded on the first click).
const AudioDoctorDesk = (() => {
  let lastFail = 0;
  const open = (o = {}) => Lazy.load('audiodoctor').then(() => AudioDoctor.inDesk(o));
  function button(small = false) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = small ? 'ad-desk-check ad-desk-small' : 'ad-desk-check';
    b.textContent = small ? '🎚 Check setup' : '🎚 Check my audio setup';
    b.title = 'Checks the audio runtime, ASIO and your Universal Audio interface, MIDI, Serum 2 / Vital, and plays a quiet 2-second test — with a fix button on anything that needs one';
    b.onclick = () => { b.disabled = true; open({}).catch(err => toast(err.message, { type: 'error' })).finally(() => { b.disabled = false; }); };
    return b;
  }
  /** the desk's top row (Set up live audio · Plugin folder · Reset host · …) */
  function attach(row) { if (row && !row.querySelector('.ad-desk-check')) row.append(button()); }
  /** live audio didn't start (startLive / open with live): the card opens in the desk by itself */
  function failed(err) {
    if (Date.now() - lastFail < 15000) return;
    lastFail = Date.now();
    open({ reason: err, quick: true }).catch(() => { /* the desk's own message stays */ });
  }
  return { attach, button, failed, open };
})();
