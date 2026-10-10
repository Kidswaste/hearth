// Commands page previews (round 11): every command's little animation renders (a few hundred sampled, every kind of
// scene, no errors, an SVG with something in it, paused until it plays, compositor-only motion), the principal
// commands' recorded clips play (and a broken clip falls back to the SVG), posters only drawn for rows scrolled into
// view, a picture of a wall of previews playing.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/commands-page-previews.js --shot /tmp/commands-page-previews.png
const SHOTS = window.CMDPAGE_SHOTS || '/tmp/hearth-checks/commands-page-previews';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
try {
  await until(() => typeof CmdPage !== 'undefined' && Commands.list().length > 900, 10000);
  const all = Commands.list();
  // a few hundred commands, spread over the whole list, plus every principal one
  const sample = [...new Set([...all.filter((_, i) => i % 3 === 0), ...[...FlowsUI.principal()].map((n) => Commands.get(n)).filter(Boolean)])];
  const bad = []; const kinds = new Map();
  const box = document.createElement('div');
  for (const d of sample) {
    try {
      box.innerHTML = CmdPreviews.svg(d);
      const svg = box.querySelector('svg');
      const kind = [...svg.classList].find((c) => c.startsWith('pv-') && c !== 'pv')?.slice(3);
      if (!svg || svg.querySelectorAll('rect, circle, path, text').length < 1 || !kind) bad.push(d.name);
      kinds.set(kind, (kinds.get(kind) || 0) + 1);
    } catch (err) { bad.push(`${d.name}: ${err.message}`); }
  }
  out.sampled = sample.length;
  out.kinds = Object.fromEntries(kinds);
  ok(sample.length >= 300 && !bad.length, `${sample.length} previews render (${bad.slice(0, 5)})`);
  ok(kinds.size >= 20, `every kind of scene shows up (${kinds.size})`);
  // the motion is transform / opacity only (no layout, no paint-heavy properties)
  const sheet = [...document.styleSheets].find((s) => /cmdpage\.css/.test(s.href || ''));
  const props = new Set();
  for (const r of sheet?.cssRules || []) if (r.type === CSSRule.KEYFRAMES_RULE) for (const k of r.cssRules) for (let i = 0; i < k.style.length; i++) props.add(k.style[i]);
  out.animated = [...props];
  ok(sheet && [...props].every((p) => /^(transform|opacity|translate|scale|rotate)$/.test(p)), `previews animate transform / opacity only (${[...props]})`);

  // the page: posters only for rows in view, playing only when pointed at
  activate('tool:commands');
  await until(() => document.querySelectorAll('.cp-row').length > 900, 8000);
  await wait(400);
  out.drawn = document.querySelectorAll('.cp-pv[data-drawn]').length;
  ok(out.drawn > 5 && out.drawn < 120, `posters drawn for the rows in view only (${out.drawn} of ${document.querySelectorAll('.cp-pv[data-name]').length})`);
  ok(!document.querySelector('.cp-list .pv-host.on'), 'nothing plays in the list until pointed at');
  const list = document.querySelector('.cp-list'); list.scrollTop = list.scrollHeight / 2; await wait(500);
  ok(document.querySelectorAll('.cp-pv[data-drawn]').length > out.drawn, 'scrolling draws the next posters');
  list.scrollTop = 0;

  // the clips: every principal command that has one plays it; a broken one falls back to the SVG
  const clips = Object.keys(typeof CmdClips !== 'undefined' ? CmdClips : {});
  out.clips = clips.length;
  const wall = document.createElement('div');
  wall.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b0c10;display:grid;grid-template-columns:repeat(8,1fr);gap:8px;padding:12px;overflow:hidden';
  document.body.append(wall);
  const played = []; const notPlayed = [];
  for (const n of clips) {
    const d = Commands.get(n);
    if (!d) { notPlayed.push(`${n}: no command`); continue; }
    const host = document.createElement('div'); host.style.cssText = 'aspect-ratio:5/3;border-radius:8px;overflow:hidden;background:#15161c';
    wall.append(host);
    const pv = CmdPreviews.mount(host, d, { clip: true });
    pv.play(true);
    const good = await until(() => host.dataset.clip === 'playing' && pv.video?.videoWidth > 0, 4000);
    (good ? played : notPlayed).push(n);
  }
  out.played = played.length;
  ok(clips.length >= 30, `recorded clips for most principal commands (${clips.length})`);
  ok(!notPlayed.length, `every clip plays (${notPlayed})`);
  // and the SVG ones fill the rest of the wall, playing
  for (const d of all.filter((x) => !clips.includes(x.name)).filter((_, i) => i % 29 === 0).slice(0, 64 - clips.length)) {
    const host = document.createElement('div'); host.style.cssText = 'aspect-ratio:5/3;border-radius:8px;overflow:hidden;background:#15161c;--text:#fff';
    wall.append(host); CmdPreviews.mount(host, d).play(true);
  }
  await wait(700);
  try { await smoke({ shot: `${SHOTS}-wall.png` }); } catch { /* pictures are optional */ }
  // a clip that can't load: the SVG stays
  const host = document.createElement('div'); wall.append(host);
  CmdClips.__broken = 'assets/cmd-clips/__missing__.mp4';
  const pv = CmdPreviews.mount(host, { name: '__broken', area: 'Chat', args: '' }, { clip: true }); pv.play(true);
  await until(() => host.dataset.clip === 'failed', 4000);
  ok(host.dataset.clip === 'failed' && host.querySelector('svg') && !host.querySelector('video'), 'a broken clip falls back to the SVG');
  delete CmdClips.__broken;
  for (const v of wall.querySelectorAll('video')) v.pause();
  wall.remove();
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
