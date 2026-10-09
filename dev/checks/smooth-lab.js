// Smoothness of the Three.js Lab with the docked director while a song plays: slider drags (messages to the
// sandbox, picture frames), knob turns, a reply streaming in the dock, the FX picker's live thumbnails, Present.
// "sandbox" lines are the preview's own frames (rAF gaps inside the sandbox) and the tweak messages it received.
//   node dev/make-test-song.js /tmp/hearth-test-song.wav
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth-lab.js
const { wait, until, measure, brief, mouse } = M;
const out = {};
const claude = H.claudeAgent();
const lab = () => H.surfaces.get('tool:three')?.el;
activate(claude.id); await wait(300);
Commands.tryRun('/director-setup', claude.id);
await until(() => [...document.querySelectorAll('dialog[open] button, .modal button')].some((b) => /Add it/.test(b.textContent)) || H.agents().some((a) => a.dock === 'three'), 6000);
[...document.querySelectorAll('dialog[open] button, .modal button')].find((b) => /Add it/.test(b.textContent))?.click();
await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
const dir = H.agents().find((a) => a.dock === 'three');
const c = await ThreeLab.cmd();
// a template with named sliders
const tpl = ThreeData.TEMPLATES.find((t) => (t.code || '').split('tweak(').length > 4) || ThreeData.TEMPLATES[0];
c.newSketch(tpl.name); await wait(2500);
await c.loadSong('/tmp/hearth-test-song.wav'); await wait(1200);
c.play(true);
await until(() => c.state.playing, 3000);
const L = lab();
// the preview's own frame gaps and the tweak messages it gets
const sbx = (code) => ThreeLab.director.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
await sbx(`window.__sm = { gaps: [], tw: 0, last: 0, on: false }; addEventListener('message', (e) => { if (e.data?.type === 'tweak') __sm.tw += 1; }); return 1`);
const sbxStart = () => sbx(`__sm.gaps = []; __sm.tw = 0; __sm.last = 0; __sm.on = true; const f = (t) => { if (!__sm.on) return; if (__sm.last) __sm.gaps.push(t - __sm.last); __sm.last = t; R(f); }; const R = typeof realRAF === "function" ? realRAF : requestAnimationFrame; R(f); return 1`);
const sbxStop = () => sbx(`__sm.on = false; const g = __sm.gaps.slice().sort((a, b) => a - b); return { frames: g.length, worst: Math.round(g.at(-1) || 0), p95: Math.round(g[Math.floor(g.length * 0.95)] || 0), drops: g.filter((x) => x > 25).length, tweaks: __sm.tw }`);
const both = async (ms, during) => { await sbxStart(); const r = await measure(ms, during); const s = await sbxStop(); const b = brief(r); return typeof b === 'string' ? `${b} | sandbox ${JSON.stringify(s)}` : { ...b, sandbox: s }; };
out.sketch = tpl.name;
out.playing = await both(2500);
// slider drag: the slider's own input events, two per frame (a fast mouse), with the preview on screen (an iframe
// scrolled out of view stops drawing, so a real drag down in the panel would measure nothing in the sandbox)
c.panel(true); await wait(600);
const preview = () => L.querySelector('.three-preview');
const range = [...L.querySelectorAll('.tw-range input[type=range]')][0];
if (range) {
  preview().scrollIntoView({ block: 'start' }); await wait(300);
  const lo = Number(range.min); const hi = Number(range.max);
  out.sliderDrag = await both(1500, async () => {
    for (let f = 0; f < 60; f++) {
      await new Promise((r) => requestAnimationFrame(r));
      for (let k = 0; k < 2; k++) { range.value = String(lo + ((f * 2 + k) / 120) * (hi - lo)); range.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    range.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
// knob turn: Knobs or sliders → knobs, drag one up
const knobToggle = [...L.querySelectorAll('button')].find((b) => /Knobs or sliders|knobs/i.test(b.title || '') && b.getBoundingClientRect().width);
knobToggle?.click(); await wait(500);
const knob = [...L.querySelectorAll('svg.tw-knob')].find((n) => n.getBoundingClientRect().width > 10);
if (knob) {
  knob.scrollIntoView({ block: 'center' }); await wait(300);
  const r = knob.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2;
  out.knobTurn = await both(1500, async () => {
    await mouse('mouseMoved', x, y, { button: 'none' }); await mouse('mousePressed', x, y);
    for (let i = 1; i <= 60; i++) await mouse('mouseMoved', x, y - i * 2, { buttons: 1 });
    await mouse('mouseReleased', x, y - 120);
  });
  knobToggle?.click(); await wait(300);
}
// a reply streaming in the docked director chat while the song plays
preview().scrollIntoView({ block: 'start' }); await wait(300);
if (dir) {
  Native.send(dir.id, 'long');
  await until(() => document.querySelector(`.tool-dock .msg.streaming .body p`), 8000);
  out.dockStream = await both(2500);
  await window.hub.stop(H.activeChat[dir.id]);
  await until(() => !Native.isBusy(H.activeChat[dir.id]), 8000);
}
// the FX picker with its live thumbnails
preview().scrollIntoView({ block: 'start' }); await wait(300);
if (typeof ThreeFX !== 'undefined') {
  out.fxPicker = await both(2500, async () => { ThreeFX.openPicker('filter'); });
  document.querySelector('.fx-picker')?.remove();
}
// Present (fullscreen preview) and back
const pres = [...L.querySelectorAll('button')].find((b) => /Present/.test(b.textContent) && b.getBoundingClientRect().width);
if (pres) {
  const r = pres.getBoundingClientRect();
  out.present = await both(2000, async () => { await mouse('mousePressed', r.left + r.width / 2, r.top + r.height / 2); await mouse('mouseReleased', r.left + r.width / 2, r.top + r.height / 2); });
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => null);
  await wait(500);
}
out.stillPlaying = c.state.playing;
return JSON.stringify(out, null, 1);
