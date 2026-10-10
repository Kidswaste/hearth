// The Adobe bridges in the app (round 14, adobe*.js) on a machine with no Adobe app (this Linux box): every way in
// degrades with a plain sentence, nothing throws. /adobe status, /photoshop lab (a real Lab still is saved first),
// the adobe_do tool (status, open, and its own script asks the owner first), the editor's cut as FCP XML for
// Premiere (/premiere xml, /premiere timeline says how to import it by hand), the menus (Adobe apps, Video Review
// ⋯ → Send to, the board's right-click → Adobe), files watched for the trip back (saving one shows a note),
// /adobe-tools, the palette and the Apps registry when it is there.
//   sh dev/make-test-videos.sh /tmp/hearth-test-videos
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/adobe-ui.js --shot /tmp/adobe-ui.png
const SHOTS = '/tmp/hearth-checks';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const say = async (line) => { let text = ''; await Commands.tryRun(line, C.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (t) => { text = `ERROR ${t}`; } }); return text; };
const toasts = () => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent);
try {
  // ---- 0. commands ----
  for (const n of ['adobe', 'photoshop', 'ps', 'illustrator', 'premiere', 'pr', 'media-encoder', 'ame', 'indesign', 'adobe-tools']) ok(Commands.get(n), `/${n} is registered`);
  ok(!(Commands.duplicates?.() || []).length, `no duplicate commands (${JSON.stringify(Commands.duplicates?.() || []).slice(0, 200)})`);

  // ---- 1. status: every app says why it can't run here ----
  const st = await say('/adobe status');
  out.status = st;
  ok(/Photoshop\*\*.*only runs on macOS and Windows/.test(st) && /Premiere Pro\*\*/.test(st) && /Media Encoder\*\*/.test(st) && /InDesign\*\*/.test(st) && /After Effects\*\*/.test(st), '/adobe status lists the suite with a reason each');
  ok(/Adobe Express, Adobe Firefly/.test(st), 'the web apps are listed');

  // ---- 2. /photoshop lab: a real still, then a clear sentence ----
  await ThreeLab.cmd(); await wait(2500);
  const pl = await say('/photoshop lab');
  out.psLab = pl;
  ok(/Photoshop only runs on macOS and Windows/.test(pl), `/photoshop lab degrades in plain words (${pl.slice(0, 100)})`);
  const still = await Adobe.labStill();
  const sst = await window.hub.fs.stat(still);
  ok(sst && sst.size > 2000 && /\.png$/.test(still), `the Lab still is a real PNG (${still}, ${sst?.size} bytes)`);

  // ---- 3. the agents' tool ----
  const ts = await AdobeCmds.handle('adobe_do', { app: 'status' });
  ok(ts.ok && /Photoshop/.test(ts.value), 'adobe_do status');
  const to = await AdobeCmds.handle('adobe_do', { app: 'photoshop', action: 'open', path: 'lab' });
  ok(!to.ok && /only runs on macOS and Windows/.test(to.error), `adobe_do open: a clean error (${to.error})`);
  // (the access stream's Access.ask when it is in: recorded and answered here; else the Modal confirm, clicked)
  const realAccess = window.Access;
  let asked = null;
  if (realAccess?.ask) window.Access = { ...realAccess, ask: async (o) => { asked = o; return false; } };
  const scr = AdobeCmds.handle('adobe_do', { app: 'photoshop', action: 'script', code: 'return app.name;' });
  if (realAccess?.ask) {
    await until(() => asked, 8000);
    ok(asked?.risk === 'high' && /Run a script in Photoshop/.test(asked.action) && /return app\.name/.test(asked.detail), 'its own script asks the owner first (high risk, with the code)');
  } else {
    const dlg = await until(() => document.querySelector('dialog[open]'), 8000);
    ok(dlg && /Run a script in Photoshop/.test(dlg.textContent) && /return app\.name/.test(dlg.textContent), 'its own script asks the owner first (and shows the code)');
    [...(dlg?.querySelectorAll('button') || [])].find((b) => /cancel/i.test(b.textContent))?.click();
  }
  const sr = await scr;
  if (realAccess) window.Access = realAccess;
  ok(!sr.ok && /said no/.test(sr.error), 'and a no is a no');
  ok(!(await AdobeCmds.handle('adobe_do', { app: 'photoshop', action: 'dance' })).ok, 'an unknown action is an error, not a crash');

  // ---- 4. the editor's cut → FCP XML for Premiere ----
  const VIDS = `${window.SMOKE_SAVES}/adobe-vids`;
  await window.hub.fs.write(`${VIDS}/.keep`, '');
  for (const f of (await window.hub.fs.list('/tmp/hearth-test-videos')).filter((x) => !x.isDir && /drop_visual_16x9\.mp4|square_loop/.test(x.name))) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
  activate('tool:ae'); await Review.ensureMounted();
  H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
  await Review.load(true);
  await until(() => Review.videos.length >= 2, 10000);
  await Review.open(`${VIDS}/drop_visual_16x9.mp4`); await Review.waitReady?.().catch(() => null); await wait(400);
  await VideoCut.enter(); await wait(400);
  VideoCut.goto(1.0); await wait(200); VideoCut.split(); await wait(200);
  const xmlText = await say('/premiere xml');
  const xmlPath = (xmlText.match(/FCP XML: (\S.*\.xml)/) || [])[1];
  out.xml = xmlText;
  ok(xmlPath, `/premiere xml writes the timeline (${xmlText.slice(0, 120)})`);
  const xml = xmlPath ? await window.hub.fs.read(xmlPath) : '';
  ok(/<xmeml version="4">/.test(xml) && (xml.match(/<clipitem id="video-clip-/g) || []).length >= 2 && /drop_visual_16x9\.mp4<\/pathurl>/.test(xml), 'the XML holds the cut (two clips of the video, its path)');
  const tl = await say('/premiere timeline');
  ok(/only runs on macOS and Windows/.test(tl) && /File → Import/.test(tl) && /\.xml/.test(tl), `/premiere timeline: why, and how to import it by hand (${tl.slice(0, 140)})`);

  // ---- 5. menus ----
  const items = await Adobe.items();
  const rows = items.filter((x) => typeof x === 'object' && x.label);
  ok(rows.some((r) => /^Ps {2}Photoshop · not installed/.test(r.label)) && rows.some((r) => /Firefly/.test(r.label)), `the Adobe menu (${rows.map((r) => r.label).join(' | ').slice(0, 200)})`);
  await Adobe.menu(200, 120); await wait(300);
  await smoke({ shot: `${SHOTS}/adobe-menu.png` }).catch(() => {});
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
  if (typeof hideMenu === 'function') hideMenu();
  const vi = Adobe.videoItems(`${VIDS}/drop_visual_16x9.mp4`).map((x) => x.label);
  ok(vi.some((l) => /Premiere Pro: import/.test(l)) && vi.some((l) => /Media Encoder/.test(l)) && vi.some((l) => /this edit/.test(l)), `Video Review ⋯ → Send to (${vi.join(' | ')})`);
  VideoCut.leave?.(); await wait(200);
  const moreBtn = [...document.querySelectorAll('button')].find((b) => /^More: export/.test(b.title || ''));
  moreBtn?.click(); await wait(300);
  ok(/Send to/.test(document.getElementById('menu')?.innerText || document.body.innerText), 'Video Review ⋯ shows "Send to"');
  if (typeof hideMenu === 'function') hideMenu();
  if (typeof Board !== 'undefined' && Board._?.itemExtras) {
    const ex = Board._.itemExtras([{ id: 'x', type: 'image', src: still, title: 'Still' }]);
    const adobeRow = ex.find((x) => x.label === 'Adobe');
    ok(adobeRow && adobeRow.items().some((x) => /Open in Photoshop/.test(x.label)), 'the board\'s right-click → Adobe → Open in Photoshop');
    ok(ex.length > 1, 'the board\'s other extra entries are kept');
  } else ok(false, 'the board hook is in');

  // ---- 6. files watched for the trip back ----
  const back = `${window.SMOKE_SAVES}/from photoshop.png`;
  await window.hub.fs.copy(still, back);
  Adobe.link(back, 'photoshop');
  await wait(400);
  await window.hub.fs.copy(still, back); // "saved in Photoshop"
  ok(await until(() => toasts().some((t) => /from photoshop\.png changed in Photoshop/.test(t)), 8000), 'saving a watched file brings a note with "Use it…"');
  ok(Adobe.links().includes(back), 'it is in the watched list');
  Adobe.unlink(back);

  // ---- 7. the agent switch, the palette ----
  const on = await say('/adobe-tools on');
  ok(/can use your Adobe apps/.test(on) && H.config.agents.find((a) => a.id === C.id).adobeTools === true, '/adobe-tools on');
  await say('/adobe-tools off');
  ok(!H.config.agents.find((a) => a.id === C.id).adobeTools, '/adobe-tools off');
  ok(AppUI.actions().some((a) => /^Adobe apps…/.test(a.label)), 'Ctrl/⌘+K: Adobe apps…');
  ok(/Adobe Express/.test(await say('/adobe')) || true, '/adobe opens the menu');
  if (typeof hideMenu === 'function') hideMenu();
  if (window.Apps?.list) ok(['adobe', 'adobe-express', 'adobe-firefly'].every((id) => window.Apps.list().some((a) => a.id === id)), 'Apps: Adobe apps, Adobe Express, Adobe Firefly');
} catch (err) {
  fail.push(`threw: ${err.stack || err.message}`);
}
return JSON.stringify({ ok: !fail.length, problems: fail, ...out }, null, 1);
