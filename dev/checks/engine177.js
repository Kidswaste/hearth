// (round 177, engine177) The engine update offer (docs/upgrades/engine177.md), in the real app on throwaway folders: a
// pretend app folder and a pretend release zip in the temp folder (engineup:test 'fixture'); never a real engine folder.
//   1. engine.json parses; the manifest refuses anything that isn't Electron's own release zip with a checksum
//   2. Settings › This computer & sync: "Engine: Electron <running>"; no button here (this test copy's engine isn't one
//      Hearth set up)
//   3. a newer engine approved for a Windows folder: one button, nothing downloaded before the click; the click
//      downloads, checks the SHA-256, unpacks it as electron-next\ beside electron\ (untouched); "Restart Hearth to
//      finish" runs Agent Hub.cmd (only said, not run, here)
//   4. Agent Hub.cmd's steps (engineup-core.js, the same as the .cmd): swapped in with a trial mark, electron-old\ kept;
//      the first screen confirms; the start after removes electron-old\ (the only thing ever deleted)
//   5. a first start that never reached its first screen: the next start goes back to the old engine, the new one kept
//      as electron-failed\ (nothing deleted); Settings says so, with "Remove the failed copy"
//   6. a wrong checksum / a zip without electron.exe: refused, nothing staged, electron\ untouched
//   7. the Mac: the restart runs mac/install-mac.sh with the checked zip and its checksum
//   8. Agent Hub.cmd itself has those steps in that order (it can't run here: no Windows)
//   node dev/smoke.js --check-timeout 180000 --script dev/checks/engine177.js --shot /tmp/engine177.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const roots = [];
const E = window.hub?.engineup;
const GH = (v, k) => `https://github.com/electron/electron/releases/download/v${v}/electron-v${v}-${k}.zip`;
const manifestOf = (fx, { v = '99.0.0', key = 'win32-x64', sha } = {}) => JSON.stringify({ version: v, why: 'Lighter on Hearth.', files: { [key]: { url: GH(v, key), sha256: sha || fx.sha, size: fx.size } } });
const setFor = async (fx, more = {}) => {
  await E.test('reset');
  await E.test('set', { appDir: fx.appDir, layout: 'win-folder', running: '44.5.1', platform: 'win32', arch: 'x64', dryRestart: true, manifestText: manifestOf(fx, more), urls: { [GH(more.v || '99.0.0', more.key || 'win32-x64')]: fx.url }, ...(more.set || {}) });
};
const openSettings = async () => {
  document.querySelector('dialog.settings-dialog[open]')?.close();
  await window.EngineUp?.refresh(); // (the line paints the last state it knows at once, then the fresh one)
  await AppUI.openSettings();
  return until(() => { const r = document.querySelector('dialog.settings-dialog[open] .eu-row'); return r && !/…$/.test(r.querySelector('.eu-line')?.textContent || '…') ? r : null; });
};
const btnOf = (row) => { const b = row?.querySelector('.eu-btn'); return b && !b.hidden ? b : null; };
try {
  await Lazy.load('engineup');
  const C = window.EngineUpCore;
  step(Boolean(C && window.EngineUp && E), 'the engineup group loads (EngineUpCore, EngineUp, hub.engineup)');

  // ---------- 1. the manifest ----------
  const s0 = await E.state();
  step(!s0.manifestError && /^\d+\.\d+\.\d+$/.test(s0.running), 'the repo\'s engine.json parses; the running engine is known', { running: s0.running, why: s0.why, err: s0.manifestError });
  const good = { version: '45.3.0', files: { 'win32-x64': { url: GH('45.3.0', 'win32-x64'), sha256: 'b'.repeat(64), size: 158018881 } } };
  step(C.parseManifest(JSON.stringify(good)).files['win32-x64'].sha256 === 'b'.repeat(64), 'a good manifest parses');
  const refuses = (label, j) => { let e = null; try { C.parseManifest(typeof j === 'string' ? j : JSON.stringify(j)); } catch (x) { e = x; } step(Boolean(e) && e.code === 'EENGINEMANIFEST', `refused: ${label}`, e?.message); };
  refuses('not JSON', '{ nope');
  refuses('another site', { ...good, files: { 'win32-x64': { ...good.files['win32-x64'], url: 'https://example.com/electron-v45.3.0-win32-x64.zip' } } });
  refuses('another version\'s zip', { ...good, files: { 'win32-x64': { ...good.files['win32-x64'], url: GH('45.2.0', 'win32-x64') } } });
  refuses('the wrong platform\'s zip', { ...good, files: { 'win32-x64': { ...good.files['win32-x64'], url: GH('45.3.0', 'darwin-x64') } } });
  refuses('plain http', { ...good, files: { 'win32-x64': { ...good.files['win32-x64'], url: GH('45.3.0', 'win32-x64').replace('https:', 'http:') } } });
  refuses('no checksum', { ...good, files: { 'win32-x64': { ...good.files['win32-x64'], sha256: '' } } });
  refuses('no version', { ...good, version: 'latest' });
  step(C.cmp('45.3.0', '44.5.1') === 1 && C.cmp('44.5.1', '44.5.1') === 0 && C.cmp('44.10.0', '44.9.9') === 1, 'versions compare by number');
  step(C.offer({ manifest: C.parseManifest(JSON.stringify(good)), running: '45.3.0', platform: 'win32', arch: 'x64', layout: 'win-folder' }).next === null, 'the same engine running: nothing offered');

  // ---------- 2. Settings, this test copy ----------
  let row = await openSettings();
  const t0 = row?.querySelector('.eu-line')?.textContent || '';
  step(Boolean(row) && t0.includes(`Engine: Electron ${s0.running}`), 'Settings › This computer & sync shows the engine running', t0);
  step(!btnOf(row), 'no button for an engine Hearth didn\'t set up (this test copy)');
  step(Boolean(row?.title), 'the row explains itself on hover');

  // ---------- 3. a newer engine approved, a Windows folder ----------
  const fx = await E.test('fixture'); roots.push(fx.root);
  await setFor(fx);
  row = await openSettings();
  const b1 = btnOf(row);
  step(Boolean(b1) && /^Update the engine \(≈ \d+ MB download\)$/.test(b1.textContent), 'one button: "Update the engine (≈ N MB download)"', b1?.textContent);
  await wait(1500);
  let ls = await E.test('ls');
  step(JSON.stringify(ls) === JSON.stringify({ 'Agent Hub.cmd': 'file', electron: 'old' }), 'nothing downloaded or unpacked before the click', ls);
  b1?.click();
  const ready = await until(async () => { const s = await E.state(); return s.phase === 'ready' || s.phase === 'error' ? s : null; });
  step(ready?.phase === 'ready', 'the click: downloaded, checksum checked, put in place', ready?.error || ready?.phase);
  ls = await E.test('ls');
  step(ls.electron === 'old' && ls['electron-next'] === 'new' && !ls['electron-next.partial'] && !ls['electron-old'], 'electron-next\\ beside electron\\ (untouched)', ls);
  await until(() => btnOf(row)?.textContent === 'Restart Hearth to finish', 4000);
  step(btnOf(row)?.textContent === 'Restart Hearth to finish', 'then: "Restart Hearth to finish"', btnOf(row)?.textContent);
  const plan = await E.restart();
  step(plan?.dry && /Agent Hub\.cmd""$/.test(plan.args.join(' ')) && plan.cwd === fx.appDir, 'the restart runs Agent Hub.cmd from the app folder (said here, not run)', plan);

  // ---------- 4. the swap at the next start ----------
  step(await E.test('launch') === 'swapped', 'the next start: swapped in');
  ls = await E.test('ls');
  step(ls.electron === 'new +trial' && ls['electron-old'] === 'old' && !ls['electron-next'], 'the new engine in electron\\ with its trial mark; the old one kept as electron-old\\', ls);
  const a1 = await E.test('afterStart');
  ls = await E.test('ls');
  step(a1?.confirmed && !a1.removedOld && ls.electron === 'new' && ls['electron-old'] === 'old', 'its first screen up: the trial confirmed; the old engine still kept for this start', { a1, ls });
  step(await E.test('launch') === 'as-is', 'a start after: nothing to swap');
  const a2 = await E.test('afterStart');
  ls = await E.test('ls');
  step(a2?.removedOld && !ls['electron-old'] && ls.electron === 'new', 'the start after a start that worked: the old engine removed', { a2, ls });

  // ---------- 5. a first start that failed ----------
  const fx2 = await E.test('fixture'); roots.push(fx2.root);
  await setFor(fx2);
  await E.get();
  const r2 = await until(async () => { const s = await E.state(); return s.phase === 'ready' || s.phase === 'error' ? s : null; });
  step(r2?.phase === 'ready' && await E.test('launch') === 'swapped', 'staged and swapped in again (a second folder)');
  // the new engine's first start never reaches its first screen: no afterStart; the next start
  step(await E.test('launch') === 'rolled-back', 'the next start: back to the engine before');
  ls = await E.test('ls');
  step(ls.electron === 'old' && ls['electron-failed'] === 'new +trial' && !ls['electron-old'], 'the old engine in electron\\ again; the new one kept as electron-failed\\ (nothing deleted)', ls);
  const a3 = await E.test('afterStart');
  step(!a3?.confirmed && !a3?.removedOld, 'the start after the rollback confirms nothing and removes nothing', a3);
  await setFor(fx2); // (the earlier download's job forgotten, as after a restart: the folders stay)
  row = await openSettings();
  const t5 = row?.querySelector('.eu-line')?.textContent || '';
  step(/didn't start, so Hearth went back/.test(t5) && btnOf(row)?.textContent === 'Remove the failed copy', 'Settings says so, with "Remove the failed copy"', { t5, b: btnOf(row)?.textContent });
  btnOf(row)?.click();
  await until(async () => !(await E.test('ls'))['electron-failed'], 5000);
  ls = await E.test('ls');
  step(!ls['electron-failed'] && ls.electron === 'old', 'the click removes only the failed copy', ls);

  // ---------- 6. refused downloads ----------
  const fx3 = await E.test('fixture'); roots.push(fx3.root);
  await setFor(fx3, { sha: '0'.repeat(64) });
  await E.get();
  const r3 = await until(async () => { const s = await E.state(); return s.phase === 'ready' || s.phase === 'error' ? s : null; });
  ls = await E.test('ls');
  step(r3?.phase === 'error' && /doesn't match the checksum/.test(r3.error) && !ls['electron-next'] && !ls['electron-next.partial'] && ls.electron === 'old', 'a wrong checksum: refused, nothing staged', { e: r3?.error, ls });
  row = await openSettings();
  step(btnOf(row)?.textContent === 'Try again' && /doesn't match/.test(row.querySelector('.eu-line').textContent), 'Settings: the reason in words, and Try again');
  const fx4 = await E.test('fixture', { noExe: true }); roots.push(fx4.root);
  await setFor(fx4);
  await E.get();
  const r4 = await until(async () => { const s = await E.state(); return s.phase === 'ready' || s.phase === 'error' ? s : null; });
  ls = await E.test('ls');
  step(r4?.phase === 'error' && /no electron\.exe/.test(r4.error) && !ls['electron-next'] && !ls['electron-next.partial'] && ls.electron === 'old', 'a zip without electron.exe: refused, nothing staged', { e: r4?.error, ls });
  await E.test('reset'); await E.test('set', { appDir: fx4.appDir, layout: 'win-folder', running: '99.0.0', platform: 'win32', arch: 'x64', manifestText: manifestOf(fx4) });
  const noClick = (await E.get())?.refused;
  step(/No engine update/.test(noClick || ''), 'nothing to get when the running engine is the approved one', noClick);

  // ---------- 7. the Mac ----------
  const fx5 = await E.test('fixture'); roots.push(fx5.root);
  await setFor(fx5, { key: 'darwin-arm64', set: { layout: 'mac-app', platform: 'darwin', arch: 'arm64' } });
  await E.get();
  const r5 = await until(async () => { const s = await E.state(); return s.phase === 'ready' || s.phase === 'error' ? s : null; });
  const mp = await E.restart();
  ls = await E.test('ls');
  step(r5?.phase === 'ready' && mp?.dry && /mac\/install-mac\.sh$/.test(mp.args[0]) && mp.env?.HEARTH_ELECTRON_SHA256 === fx5.sha && mp.env?.HEARTH_WAIT_QUIT === '1' && /\.zip$/.test(mp.env?.HEARTH_ELECTRON_ZIP || '') && !ls['electron-next'],
    'the Mac: the restart runs mac/install-mac.sh with the checked zip and its checksum (nothing beside the app)', { mp, ls });

  // ---------- 8. Agent Hub.cmd ----------
  const cmd = await E.test('cmdText');
  const order = ['if exist "electron\\.hearth-trial" if exist "electron-old\\electron.exe" call :rollback', 'if exist "electron-next\\electron.exe" if not exist "electron-old\\" call :swap', 'start "" "%HERE%electron\\electron.exe"',
    'ren "electron" "electron-old"', 'ren "electron-next" "electron"', 'echo trial> "electron\\.hearth-trial"', 'ren "electron" "electron-failed"', 'ren "electron-old" "electron" 2>nul || (ren "electron-failed" "electron"'];
  const at = order.map((l) => cmd.indexOf(l));
  step(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])), 'Agent Hub.cmd: rollback, swap, start, then the swap / rollback steps, in order', at);
  step(/\r\n/.test(cmd) && !/[^\r]\n/.test(cmd), 'Agent Hub.cmd keeps Windows line ends (its labels need them)');
  step(!/\b(rd|rmdir|del)\b/i.test(cmd), 'Agent Hub.cmd deletes nothing');
} catch (err) {
  out.problems.push(`threw: ${err.message}`);
} finally {
  document.querySelector('dialog.settings-dialog[open]')?.close();
  try { await E.test('reset'); for (const r of roots) await E.test('rmFixture', { root: r }); } catch { /* the run's temp root goes anyway */ }
}
return JSON.stringify(out, null, 1);
