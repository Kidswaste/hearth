#!/usr/bin/env node
// (round 103, syncstall103) A settings file that can't be read is never "empty". The other computer changes a shared
// setting; while this computer's settings file is held (EBUSY: another program; EPERM: Windows / an antivirus) or half
// written (doesn't parse), the pull of app/config.json must not write the shared settings over {} (this computer's own
// ones, engine paths and hotkey, were lost): it waits, nothing is written, and once the file reads again the change
// arrives with this computer's own settings kept. Through the two-computer simulator (dev/sync-sim.js).
//   node dev/syncstall103-test.js [--keep]
// Never touches real data: a temp folder.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./sync72-test');
const Sim = require('./sync-sim');

const raw = Sim.raw;
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); } };
async function rounds(w, n) { for (let i = 0; i < n; i++) await T.round(w); }

async function heldSettings(how) {
  const w = T.world(`ss103-${how}`);
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  ok(await T.converge(w) > 0, `${how}: first sync`, T.why(w));
  const mine = pc.cfg();
  ok(mine.settings.hotkey === 'PC+H' && /PC/.test(mine.settings.enginePaths.claude), `${how}: the PC has its own hotkey and engine path`, mine.settings);
  // the Mac changes a shared setting (its accent colour, a notification switch)
  mac.setCfg((c) => { c.theme.accent = '#00aaff'; c.settings.notify = false; });
  w.clock.advance(3000); mac.view.tick(); await mac.e.pass(); mac.view.tick(); // the Mac's change goes up to the server…
  // …and the PC's settings file can't be read while the change comes down
  const before = raw.readFileSync(pc.config);
  if (how === 'half') { raw.writeFileSync(pc.config, before.subarray(0, Math.floor(before.length / 2))); const t = new Date(pc.now() - 60000); raw.utimesSync(pc.config, t, t); }
  else Sim.T.hook = (op, p) => (op === 'open' && path.resolve(p) === path.resolve(pc.config) ? how : null); // every read of it fails (the engine's stat still works, as on Windows)
  let tried = false;
  for (let i = 0; i < 4; i++) { w.clock.advance(3000); pc.view.tick(); pc.last = await pc.e.pass(); tried ||= (pc.last.blocked || []).some((x) => x.rel === 'app/config.json') || (pc.last.waiting || []).some((x) => x.rel === 'app/config.json'); }
  Sim.T.hook = null;
  ok(tried, `${how}: the pull of the settings was tried and waits (said by name)`, { blocked: pc.last.blocked, waiting: pc.last.waiting, last: pc.last.last });
  const during = raw.readFileSync(pc.config, 'utf8');
  if (how === 'half') ok(during === before.subarray(0, Math.floor(before.length / 2)).toString(), `${how}: the half-written settings file is left as it is (not replaced by the shared settings alone)`, during.slice(0, 200));
  else ok(Buffer.compare(Buffer.from(during), before) === 0, `${how}: nothing written over the PC's settings while they can't be read`, during.slice(0, 300));
  if (how !== 'half') ok(/"hotkey": "PC\+H"/.test(during), `${how}: the PC's hotkey still in its settings file`, during.slice(0, 300));
  // readable again: the change arrives, the PC's own settings stay
  if (how === 'half') { raw.writeFileSync(pc.config, before); const t = new Date(pc.now() - 60000); raw.utimesSync(pc.config, t, t); }
  ok(await T.converge(w) > 0, `${how}: converges once the file reads again`, T.why(w));
  const after = pc.cfg();
  ok(after.theme.accent === '#00aaff' && after.settings.notify === false, `${how}: the Mac's shared settings arrived on the PC`, { theme: after.theme, notify: after.settings.notify });
  ok(after.settings.hotkey === 'PC+H' && after.settings.enginePaths.claude === mine.settings.enginePaths.claude, `${how}: the PC kept its own hotkey and engine path`, after.settings);
  ok(mac.cfg().settings.hotkey === 'Mac+H', `${how}: the Mac kept its own hotkey`, mac.cfg().settings.hotkey);
}

async function main() {
  const t0 = Date.now();
  for (const how of ['EBUSY', 'EPERM', 'half']) {
    const before = failures; const t = Date.now();
    try { await heldSettings(how); } catch (err) { ok(false, `${how} threw`, err.stack); }
    Sim.T.hook = null;
    console.log(`${failures > before ? 'FAIL' : 'ok  '} settings ${how} (${Date.now() - t} ms)`);
  }
  console.log(`\nsyncstall103: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  const w = T.world('ss103-end'); if (!process.argv.includes('--keep')) fs.rmSync(path.dirname(w.dir), { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
