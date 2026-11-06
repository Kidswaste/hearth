// (round 137, tour137) ◈ What's new in the Lab (docs/upgrades/tour137.md), in one check, on a scene it makes (never an
// owner's scene: smoke.js runs a throwaway copy with its own data):
//   1. the note: offered through Hints, shown once ("New in the Lab: 12 things · Show me (2 min) · Later · ✕"); after
//      Later, and again after ✕, it never comes back (offered again, flushed: nothing)
//   2. the tour, every step: its control exists, is ringed (the ring on it, in the window), a folded menu opened first;
//      Show me opens the feature (on the scene when it only shows, on a demo copy when it could change something)
//   3. Show me changes nothing in the scene (its layers, code and sliders byte for byte), the demo copy is gone at the
//      end and the scene is open again, and nothing is sent (no engine event, no reply running)
//   4. Skip tour ends it (no card, no ring, no menu left)
//   5. Lab features…: every feature listed, each one's Open is really there (a Ctrl/⌘+K action, a command, a tour
//      place), every part of the round 128–136 patch notes has a line, search works, and Open opens it (an action,
//      a command, a tour place); the ways in: Ctrl/⌘+K and the ✦ Since you were away dialog
//   6. a small window (860 × 560): every step's control ringed inside the window, the card inside it; the list fits
//   node dev/smoke.js --fake-engines --check-timeout 420000 --script dev/checks/tour137.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const SHOTS = window.TOUR137_SHOTS || '';
const shot = async (name) => { if (SHOTS) await smoke({ shot: `${SHOTS}/tour137-${name}.png` }).catch(() => {}); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const drawn = (n) => Boolean(n?.isConnected && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const inWin = (r) => r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
let sent = 0;
try {
  window.hub.onEngineEvent?.(() => { sent += 1; });
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  activate('tool:three');
  await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && document.querySelector('.ly-row[data-id]'), 60000);
  const S = ThreeLab.scenes;
  const code = (c) => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const P = tweak({ glow: [0.5, 0, 1], speed: [1, 0, 4] });
const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3, 24, 64), new THREE.MeshBasicMaterial({ color: '${c}' }));
scene.add(m);
renderer.setAnimationLoop((t) => { m.rotation.y = t / 1000 * P.speed; m.scale.setScalar(0.5 + P.glow); renderer.render(scene, cam); });
`;
  const layers = [['t1', 'Ring', '#ff3366'], ['t2', 'Halo', '#33ccff']].map(([id, name, c], i) => ThreeLayers.defaults({ id, name, code: code(c), slot: i, color: c }));
  const own = S.create({ name: 'T137 mine', code: layers[0].code, layers, frame: '16:9', open: true });
  await until(() => S.currentId() === own.id && document.querySelectorAll('.ly-row[data-id]').length === 2, 15000);
  await wait(1500);
  const snap = () => JSON.stringify({ s: S.get(own.id), l: S.layersOf(S.get(own.id)), ex: S.extrasOf(own.id) });
  const before = snap();
  const nScenes = S.all().length;

  // ---- 1. the note, once ----
  Hints.config({ start: 0, gap: 0, startNotice: 0, quiet: 0 });
  store.set('labtour137.auto', true);
  const reset = () => { store.set('labtour137.note', null); Hints.forget('labtour:137'); };
  reset();
  await Lazy.load('labtour137');
  const noteNow = async () => { LabTour.offer(); Hints.flush(); return until(() => [...document.querySelectorAll('.lt-note')].find(drawn), 6000); };
  let n1 = await noteNow();
  step('the note shows in the Lab', n1 && /New in the Lab: 12 things/.test(n1.textContent) && n1.querySelector('.lt-go')?.textContent === 'Show me (2 min)' && n1.querySelector('.lt-later') && n1.querySelector('.lt-x'), n1?.textContent);
  step('it is small: one line, inside the window', n1 && n1.getBoundingClientRect().height < 60 && inWin(n1.getBoundingClientRect()), Math.round(n1?.getBoundingClientRect().height || 0));
  await shot('note');
  n1?.querySelector('.lt-later').click();
  await until(() => !document.querySelector('.lt-note'), 2000);
  step('Later closes it and remembers', !document.querySelector('.lt-note') && LabTour.decided() && store.get('labtour137.note')?.how === 'later');
  let again = LabTour.offer(); Hints.flush(); await wait(1200);
  step('after Later it never comes back', !again && !document.querySelector('.lt-note'));
  reset();
  n1 = await noteNow();
  n1?.querySelector('.lt-x').click();
  await until(() => !document.querySelector('.lt-note'), 2000);
  again = LabTour.offer(); Hints.flush(); await wait(1200);
  step('after ✕ it never comes back', n1 && !again && !document.querySelector('.lt-note') && store.get('labtour137.note')?.how === 'closed');
  Hints.config(null);

  // ---- 2. + 3. the tour: every step ringed, Show me ----
  const card = () => document.querySelector('.tour-card');
  const ringOn = (target) => { const r = [...document.querySelectorAll('.tour-ring:not(.tour-ring-solo)')].find((x) => !x.hidden); return r && target ? overlap(r.getBoundingClientRect(), target.getBoundingClientRect()) && inWin(r.getBoundingClientRect()) : false; };
  const PROBE = {
    critique: () => drawn(document.querySelector('.crit-card')) && LabCritique.state().phase !== 'running',
    explain: () => drawn(LabExplain.card),
    layers: () => [...document.querySelectorAll('#menu > button')].some((b) => drawn(b) && /Name these for me/.test(b.textContent)),
    versions: () => LabVersions.isOpen(),
    speed: () => LabSpeed.isOpen(),
    render: () => [...document.querySelectorAll('dialog.lx-panel[open] .rp-row')].some(drawn),
    perform: () => [...document.querySelectorAll('.mb-menu.lab-pop .menu-item, #menu > button')].some((b) => drawn(b) && /Live on my phone/.test(b.textContent)),
    mywork: () => drawn(document.querySelector('dialog.mw[open]')),
    dials: () => drawn(document.querySelector('.md-pop')),
    follow: () => drawn(document.querySelector('.fm-pop')),
    blocks: () => LabBlocks.isOpen(),
    campath: () => CamPath.on,
  };
  const walk = async ({ show, small = false }) => {
    await LabTour.start({ restart: true });
    const res = [];
    for (let i = 0; i < LabTourData.STEPS.length; i += 1) {
      const id = LabTourData.STEPS[i].id;
      const c = await until(() => Tour.current?.id === 'lab137' && Tour.current.step === i && card()?.dataset.step === String(i) && card(), 8000);
      const target = c && await until(() => { const t = LabTour._test.at[id]; return drawn(t) && ringOn(t) ? t : null; }, 5000);
      const menu = Boolean(target?.closest('.mb-menu, #menu'));
      const r = { id, target: Boolean(target), menu, ring: Boolean(target && ringOn(target)), card: Boolean(c && inWin(c.getBoundingClientRect()) && (!document.querySelector('dialog[open]') || c.closest('dialog[open]'))), btns: c ? ['.tour-demo', '.tour-next', '.tour-skip'].every((s) => c.querySelector(s)) : false };
      if (show && (id === 'explain' || id === 'dials')) await shot(`step-${id}`);
      if (small && id === 'perform') await shot('small-perform');
      if (show && c) {
        await wait(400); // (the step may paint its card again once its control settles: the button is read fresh)
        const n0 = LabTour.stats.shows.length;
        card()?.querySelector('.tour-demo')?.click();
        // (a click on a button the card had just painted again went nowhere: once more, on the card as it is now)
        if (!(await until(() => LabTour.stats.shows.length > n0, 2000))) card()?.querySelector('.tour-demo')?.click();
        r.shown = Boolean(await until(PROBE[id], 15000));
        if (!r.shown) out[`dbg_${id}`] = [...document.querySelectorAll('.mb-menu, #menu:not([hidden])')].map((m) => `${m.className}|${drawn(m)}|${m.textContent.slice(0, 120)}`).concat(LabTour.stats.errors || [], [`shows: ${LabTour.stats.shows.join(" ")}`], [...document.querySelectorAll('dialog')].map((d) => `${d.className}|${d.open}`), [JSON.stringify(Lazy.state().filter((g) => /renderpre|lab$/.test(g.name)))], [...document.querySelectorAll('.toast')].map((t) => t.textContent.slice(0, 100)));
        r.demo = S.currentId() !== own.id;
        r.wantDemo = LabTourData.STEPS[i].show === 'demo';
      }
      res.push(r);
      const cc = card();
      if (!cc) break;
      cc.querySelector('.tour-next').click();
      await wait(small ? 250 : 350);
    }
    return res;
  };
  const big = await walk({ show: true });
  out.tour = big.map((r) => `${r.id}:${r.target ? 'T' : '-'}${r.ring ? 'R' : '-'}${r.menu ? 'M' : ''}${r.shown ? 'S' : '-'}${r.demo ? 'd' : ''}`).join(' ');
  step('12 steps', big.length === 12, big.length);
  step('every step\'s control exists and is ringed', big.every((r) => r.target && r.ring), big.filter((r) => !(r.target && r.ring)).map((r) => r.id));
  step('folded menus are opened first', big.filter((r) => r.menu).length >= 5, big.filter((r) => r.menu).map((r) => r.id));
  step('each step has Show me, Next and Skip tour, the card in the window', big.every((r) => r.btns && r.card));
  step('Show me opens each feature', big.every((r) => r.shown), big.filter((r) => !r.shown).map((r) => r.id));
  step('on the scene when it only shows, on a demo copy when it could change something', big.every((r) => r.demo === r.wantDemo), big.map((r) => `${r.id}:${r.demo ? 'demo' : 'mine'}`));
  const ended = await until(() => !Tour.current && !card(), 4000);
  await until(() => S.currentId() === own.id && !LabTour.demo.id, 8000);
  await wait(600);
  step('Done ends it; the scene is open again, the demo copy removed', ended && S.currentId() === own.id && S.all().length === nScenes && !S.all().some((x) => /Tour demo/.test(x.name)), { cur: S.currentId() === own.id, scenes: S.all().length - nScenes });
  const diff = (a, b) => { const A = JSON.parse(a); const B = JSON.parse(b); const o = []; const go = (x, y, p) => { if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) go(x[k], y[k], `${p}.${k}`); return; } o.push(`${p}: ${JSON.stringify(x)?.slice(0, 60)} → ${JSON.stringify(y)?.slice(0, 60)}`); }; go(A, B, ''); return o.slice(0, 8); };
  step('Show me changed nothing in the scene', snap() === before, diff(before, snap()));
  out.errors = LabTour.stats.errors;
  step('and sent nothing (no engine event, no reply running)', sent === 0 && !H.agents().some((a) => Native.isAgentBusy?.(a.id)), sent);

  // ---- 4. Skip tour ----
  await LabTour.start({ restart: true });
  await until(() => Tour.current?.step === 0 && card());
  card().querySelector('.tour-next').click();
  await until(() => Tour.current?.step === 1 && card()?.dataset.step === '1');
  await until(() => document.querySelector('.mb-menu.lab-pop'), 3000); // explain: its menu is open
  card().querySelector('.tour-skip').click();
  await wait(500);
  step('Skip tour ends it: no card, no ring, no menu', !Tour.current && !card() && !document.querySelector('.tour-ring') && !document.querySelector('.mb-menu.lab-pop') && LabTour.stats.ended === 'skip');

  // ---- 5. Lab features… ----
  const acts = AppUI.actions().map((a) => a.label);
  step('Ctrl/⌘+K: Lab: what\'s new and Lab features…', acts.some((l) => /^Lab: what's new/.test(l)) && acts.some((l) => /^Lab features…/.test(l)));
  const dlg = LabTour.index();
  await shot('index');
  const rows = [...dlg.querySelectorAll('.lt-row')];
  step('the list has every feature, one line and Open each', rows.length === LabTourData.FEATURES.length && rows.every((r) => r.querySelector('.lt-line').textContent && r.querySelector('.lt-open')), rows.length);
  const has = LabTour._test.has;
  const bad = LabTourData.FEATURES.filter((f) => { const o = f.open; if (o.action) return !has.action(o.action); if (o.cmd) return !has.cmd(o.cmd.slice(1).split(' ')[0]); if (o.step) return !LabTour.places[o.step]; return !o.place; });
  step('each Open is really there (an action, a command, a tour place)', !bad.length, bad.map((f) => f.id));
  const missing = [];
  for (let r = LabTourData.FROM; r <= LabTourData.TO; r += 1) {
    const text = await (await fetch(`docs/patch-notes/round-${r}.md`, { cache: 'no-store' })).text();
    for (const p of LabTourData.parts(text)) if (!LabTourData.FEATURES.some((f) => f.part === p) && !LabTourData.IGNORED.includes(p)) missing.push(`${r}: ${p}`);
  }
  step('every part of the round 128–136 notes has a line', !missing.length, missing);
  const qIn = dlg.querySelector('.lt-q');
  const search = (v) => { qIn.value = v; qIn.dispatchEvent(new Event('input')); return [...dlg.querySelectorAll('.lt-row')].map((r) => r.dataset.id); };
  const sr = { slow: search('slow'), phone: search('phone'), knob: search('knob'), typo: search('critque'), none: search('zzqx') };
  step('search works (plain words, other words, a typo)', sr.slow[0] === 'speed' && sr.phone[0] === 'phone' && sr.knob[0] === 'dials' && sr.typo[0] === 'critique' && !sr.none.length && dlg.querySelector('.lt-none'), sr);
  search('versions');
  dlg.querySelector('.lt-row[data-id="versions"] .lt-open').click();
  step('Open: an action (Scene versions)', await until(() => LabVersions.isOpen(), 8000));
  LabVersions.close();
  LabTour.index({ query: 'render' }).querySelector('.lt-row[data-id="renderpre"] .lt-open').click();
  step('Open: a tour place (Render presets, ringed and open)', await until(() => [...document.querySelectorAll('dialog.lx-panel[open] .rp-row')].some(drawn) && document.querySelector('.tour-ring-solo'), 8000));
  await LabTour.tidy();
  step('and nothing is left open', !document.querySelector('dialog[open]'));
  LabTour.index({ query: 'slow' }).querySelector('.lt-row[data-id="speed"] .lt-open').click();
  step('Open: a command (Why is this slow?)', await until(() => LabSpeed.isOpen(), 8000));
  LabSpeed.close();
  await LabTour.tidy();
  await Lazy.load('whatsnew');
  const wd = await WhatsNew.open({ since: 127 });
  step('the ✦ Since you were away dialog has ◈ New in the Lab', Boolean(wd?.querySelector('.wn-lab')));
  wd?.close();

  // ---- 6. a small window ----
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 860, height: 560, deviceScaleFactor: 1, mobile: false } });
  await until(() => innerWidth === 860, 4000);
  await wait(1200);
  const small = await walk({ show: false, small: true });
  out.small = small.map((r) => `${r.id}:${r.target ? 'T' : '-'}${r.ring ? 'R' : '-'}${r.card ? 'C' : '-'}`).join(' ');
  step('small window: every step ringed in the window, the card in it', small.length === 12 && small.every((r) => r.target && r.ring && r.card), small.filter((r) => !(r.target && r.ring && r.card)).map((r) => r.id));
  await until(() => !Tour.current, 3000);
  const sd = LabTour.index();
  await shot('small-index');
  step('small window: the list fits', inWin(sd.getBoundingClientRect()), [innerWidth, innerHeight]);
  sd.close();
  await shot('small-index');
  await smoke({ cdp: 'Emulation.clearDeviceMetricsOverride', params: {} });
  step('the scene is still untouched, nothing sent', snap() === before && sent === 0, sent);
} catch (err) { step(`threw: ${err.stack || err.message}`, false); }
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
