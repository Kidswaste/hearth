// (round 148, look148) the Lab look's instrument panels (docs/upgrades/look148.md), ONE check on realscene-lib's real
// scene (its own temp data, never an owner's scene):
//   1. the headers: 01 PREVIEW above the picture, 02 TIMELINE in the timeline's handle row, 03 LAYERS & KNOBS on the
//      panel's head; numbered in order; nothing of the look on the preview's picture (no header inside the preview,
//      no scanlines / ticks on it, the header above the picture's top)
//   2. the meta updates: the preview's fps · quality from the stats line (a real one, then a given one), the
//      timeline's bar / time after a seek while stopped; while it plays the timeline's header holds still
//   3. motion: the live dot and the header sweep run while stopped, hold still while the scene plays (html.lab-playing),
//      are off under prefers-reduced-motion and Hearth's Motion: calm / off
//   4. Lab ⋯ › View & help › Lab look cycles Forgeheart → Plate → Plain → Forgeheart; Plain hides the headers
//   pictures: <out>/look148.png (Forgeheart), look148-plate.png (Plate)
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/realscene-lib.js --script dev/checks/look148.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const drawn = (n) => Boolean(n?.isConnected && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' && n.getBoundingClientRect().width > 0);
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(4000)]);
const SHOTS = window.LOOK148_SHOTS || '/tmp/hearth-checks';
const shot = (name) => smoke({ shot: `${SHOTS}/${name}.png` }).catch(() => {});

try {
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false } });
  const info = await RS.open({ play: false });
  step('the real scene is open with its song', info.song && document.querySelector('.surface.active .media-bar:not(.mb-empty)'), { layers: info.layers });
  await wait(1500);
  document.documentElement.dataset.motion = '';
  const lab = () => document.querySelector('.surface.active') || document;
  const one = (sel) => lab().querySelector(sel);
  step('Forgeheart is the default look', LabRegroup.look() === 'forge' && document.documentElement.dataset.lablook === 'forge');

  // ---------- 1. the headers ----------
  const pvH = one('.ih-pv'); const tlH = one('.media-bar > .mb-handle > .ih-tl'); const lyB = one('.lk-merged .layers > .tw-head > b');
  const pv = one('.three-preview'); const frame = pv?.querySelector('.three-frame');
  const no = (h) => h?.querySelector('.ih-no')?.textContent; const nm = (h) => h?.querySelector('.ih-name')?.textContent;
  const lyNo = lyB ? getComputedStyle(lyB, '::before').content.replace(/"/g, '') : '';
  step('three numbered headers: 01 Preview, 02 Timeline, 03 Layers & knobs', no(pvH) === '01' && /preview/i.test(nm(pvH)) && no(tlH) === '02' && /timeline/i.test(nm(tlH)) && lyNo === '03' && /layers/i.test(lyB.textContent) && drawn(pvH) && drawn(tlH.querySelector('.ih-name')), { pv: pvH?.textContent, tl: tlH?.textContent, lyNo });
  const fontOf = (n) => getComputedStyle(n).fontFamily; const caps = (n) => getComputedStyle(n).textTransform;
  step('headers in a mono face, small caps, tabular numbers on the meta', /mono|consolas|menlo/i.test(fontOf(pvH)) && caps(pvH) === 'uppercase' && /tabular-nums/.test(getComputedStyle(pvH.querySelector('.ih-meta')).fontVariantNumeric), { font: fontOf(pvH), caps: caps(pvH) });
  const rH = pvH.getBoundingClientRect(); const rF = frame.getBoundingClientRect(); const rP = pv.getBoundingClientRect();
  const pvBefore = getComputedStyle(pv, '::before'); const pvAfter = getComputedStyle(pv, '::after');
  step('nothing of the look on the picture: 01 sits above the preview (not in it), no scanlines / ticks / header inside it', !pv.contains(pvH) && rH.bottom <= rP.top + 0.5 && rH.bottom <= rF.top + 0.5 && !pv.querySelector('.ih') && !/gradient/.test(pvBefore.backgroundImage + pvAfter.backgroundImage), { header: [rH.top, rH.bottom], preview: rP.top, frame: rF.top });

  // ---------- 2. the meta ----------
  const pvMeta = () => pvH.querySelector('.ih-meta').textContent;
  const real = await until(() => /\d+.*quality.*\w/i.test(pvMeta()) && !/—/.test(pvMeta()), 15000);
  const statsFps = (one('.three-stats > b')?.textContent || '').match(/\d+/)?.[0];
  step('the preview\'s meta shows the stats line\'s fps and quality', Boolean(real) && pvMeta().includes(statsFps), { meta: pvMeta(), stats: statsFps });
  LabRegroup.stats({ fps: 59.6 }, 'Quality: high');
  step('…and follows a new reading (60 fps · high, a bar more in the sparkline)', /60/.test(pvMeta()) && /high/.test(pvMeta()) && pvH.querySelector('.ih-spark > i:last-child').dataset.s === '1.00', { meta: pvMeta(), s: pvH.querySelector('.ih-spark > i:last-child').dataset.s });
  const media = LabRegroup.hud.media;
  const tlMeta = () => tlH.querySelector('.ih-meta').textContent;
  const before = tlMeta();
  media.seek(10); await wait(500);
  const m = media.meta;
  const wantBar = String(m.bar).padStart(3, '0');
  step('the timeline\'s meta: tempo, meter, bar and time follow a seek while stopped', new RegExp(`${Math.round(m.bpm)}`).test(tlMeta()) && tlMeta().includes(wantBar) && /0:10/.test(tlMeta()) && tlMeta() !== before, { before, after: tlMeta(), bar: m.bar, beat: m.beat });
  step('the beat meter lights the beats of the bar so far', tlH.querySelectorAll('.ih-beats > i.on').length === m.beat, { on: tlH.querySelectorAll('.ih-beats > i.on').length, beat: m.beat });

  // ---------- 3. motion ----------
  const live = pvH.querySelector('.ih-live'); const sweep = pvH.querySelector('.ih-sweep');
  const anim = () => [getComputedStyle(live), getComputedStyle(sweep, '::after')].map((s) => ({ name: s.animationName, state: s.animationPlayState }));
  const stopped = anim();
  step('stopped: the live dot pulses and the header sweep moves', stopped.every((a) => a.name !== 'none' && a.state === 'running'), stopped);
  (await ThreeLab.cmd()).play(true);
  const playing = await until(() => LabPlay.playing && document.documentElement.classList.contains('lab-playing'), 8000);
  await wait(200);
  const whilePlaying = anim();
  const tlPlay0 = tlMeta(); await wait(1500); const tlPlay1 = tlMeta();
  step('while the scene plays: they hold still (html.lab-playing)', playing && whilePlaying.every((a) => a.state === 'paused'), whilePlaying);
  step('while the scene plays: the timeline\'s header is not rewritten', tlPlay0 === tlPlay1, { tlPlay0, tlPlay1 });
  (await ThreeLab.cmd()).play(false);
  await until(() => !LabPlay.playing, 5000); await wait(400);
  step('stopped again: they move again and the header catches up', anim().every((a) => a.state === 'running') && tlMeta() !== tlPlay1, { now: tlMeta() });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await wait(200);
  const reduced = anim();
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }); await wait(150);
  document.documentElement.dataset.motion = 'calm'; await wait(100);
  const calm = anim();
  document.documentElement.dataset.motion = 'off'; await wait(100);
  const off = anim();
  document.documentElement.dataset.motion = ''; await wait(100);
  step('off under reduced motion and Hearth\'s Motion: calm / off', [...reduced, ...calm, ...off].every((a) => a.name === 'none'), { reduced, calm, off });

  // ---------- 4. the look's three settings ----------
  media.seek(0); await wait(300);
  await shot('look148');
  const row = () => LabRegroup.lookRow();
  const seen = [row()[0]];
  row()[2](); await wait(150); seen.push(row()[0]);
  const plateOk = document.documentElement.dataset.lablook === 'plate' && drawn(pvH) && /PL\./.test(getComputedStyle(pvH.querySelector('.ih-no'), '::before').content);
  await wait(400); await shot('look148-plate');
  row()[2](); await wait(150); seen.push(row()[0]);
  const plainOk = document.documentElement.dataset.lablook === 'plain' && !drawn(pvH) && getComputedStyle(lyB, '::before').content === 'none';
  row()[2](); await wait(150); seen.push(row()[0]);
  step('Lab look cycles Forgeheart → Plate → Plain → Forgeheart (Plate: "PL." plates; Plain: no headers)', seen.join('|') === 'Lab look: Forgeheart|Lab look: Plate|Lab look: Plain|Lab look: Forgeheart' && plateOk && plainOk && store.get('three.labLook') === 'forge', { seen, plateOk, plainOk });
} catch (err) { step(`threw: ${err.stack || err.message}`, false); }
await RS.close?.();
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
