// 🐢 That was slow (round 67, slowbutton67): the plain-words summariser behind the card. Pure functions (no DOM, no
// clock of its own: `snap.now`), so dev/slowcard-test.js runs it in Node. Its input is SlowCard.snapshot(): what the
// jank watch already kept for the last minute — the window's long frames (Long Animation Frames: script / layout forced
// by script / style-layout-paint / other), slow inputs (Event Timing: input → next paint), WebGL context losses and the
// Lab preview's slow frames — plus the main process's (jankmain.js recent()): IPC handlers that ran long (by channel),
// the window's messages arriving late (the main process stuck), background jobs starting, GPU / page events, the loop-lag
// sampler's worst. Nothing here measures anything, and nothing is sent anywhere: the report goes to the clipboard only.
//   summarise(snap) → { found, last, worst, count, headline, cause, lines[], tip, day }
//   dayLine(day)    → "Hiccups over 500 ms today: N (yesterday: M)"
//   report(snap)    → the text for a Claude dev session (numbers, files, channels; no prose)
const SlowCardCore = (() => {
  const GAP = 400; // ms: events this close (or overlapping) are one hiccup seen from several sides
  const MIN = 200; // ms: shorter isn't a hiccup anyone feels as one
  const NEAR = 3000; // ms: a background job / GPU event this close to a freeze is named with it

  // where the owner was, in their words (jank.js areas)
  const AREA = { chat: 'a chat', Lab: 'the Lab', board: 'the mood board', menus: 'a menu', dialogs: 'a dialog', 'Commands page': 'the Commands page',
    apps: 'an app window', rail: 'the rail', start: 'Hearth starting up', Forge: 'Forgeheart', quests: 'Sidequest Studio', creative: 'the Sound desk',
    home: 'Projects', capture: 'a capture', three: 'the Lab', options: 'Settings' };
  const where = (a) => AREA[a] || (a ? `the ${a} page` : 'Hearth');
  // what an IPC channel does, in the owner's words (the longest match wins; unknown ones keep their name)
  const IPC = [
    [/^jank:test-stall/, 'a test freeze (made on purpose)'], [/^jank:/, 'the smoothness watch'],
    [/^kv:|^data:/, 'reading or saving app data'], [/^config:/, 'your settings'], [/^(chats?|store|history|chatkeep|attachments?)[:-]/, 'your chats'],
    [/^(sync|cloud|icloud)/, 'cloud sync'], [/^usage|^tokenaudit|^usagelimits/, 'token counts'], [/^memory/, 'memory'], [/^notes?:/, 'notes'],
    [/^(game|gameready|playbudget|gpu52)/, '▶ Play'], [/^(capture|renders|motion|stage)/, 'capture and renders'],
    [/^(creative-vst|soundbank|audiodoctor|bouncelog|vst)/, 'the Sound desk'], [/^board/, 'the mood board'],
    [/^(fs|files?|reach|dragdrop|fw|diskcalm|refs)[:-]/, 'files on disk'], [/^(engine|codex|astra|claude|connectors?|connections)/, 'the AI engines'],
    [/^(update|updater)/, 'updates'], [/^(backup|safetynet|crashsafe|datasafe)/, 'backups and safety copies'], [/^(shows|showsync)/, 'the shows list'],
    [/^(quest|weekquest|questguide)/, 'quests'], [/^(native|window|big|power|volume|notify)/, 'the window and system'], [/^voice/, 'voice'],
    [/^(chrome|cview|apps?)[:-]/, 'the built-in browser'], [/^(deploy|remote|interop|adobe|ae)/, 'connections to other apps'], [/^(two|twocopies)/, 'the other Hearth copy'],
  ];
  function plainIpc(ch) { const s = String(ch || ''); for (const [re, w] of IPC) if (re.test(s)) return w; return s ? `“${s}”` : 'something'; }
  // what a renderer file is, in short (jank-report.js has the long list; the card only needs the gist)
  const FILE = [[/^tools\/three|^tools\/cut|three-sandbox/, 'the Lab'], [/^native|^panel|^chat-|^md\.js|^director-dock/, 'the chat view'], [/^board/, 'the mood board'],
    [/^tools\/quest|^quest|^weekquest/, 'quests'], [/^tools\/(creative|workbench|preset|soundbank)/, 'the Sound desk'], [/^jank/, 'the smoothness watch'],
    [/^renderer\.js|^ui\.js|^tools\.js/, 'the app shell'], [/^sync/, 'cloud sync'], [/^lazy/, 'feature loading']];
  function plainFile(f) { const s = String(f || ''); for (const [re, w] of FILE) if (re.test(s)) return w; return s ? s.replace(/\.js$/, '') : ''; }

  const secs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
  const ago = (ms) => (ms < 2000 ? 'just now' : ms < 90e3 ? `${Math.round(ms / 1000)} s ago` : `${Math.round(ms / 60e3)} min ago`);
  const clock = (t) => { const d = new Date(t); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':'); };

  // every sighting of a freeze, from either side, as one list of spans
  function sightings(snap) {
    const out = [];
    for (const e of snap.events || []) {
      if (e.kind === 'gpu') { out.push({ t: e.t, ms: 0, end: e.t, src: 'gpu', e }); continue; }
      if (!(e.ms >= MIN)) continue;
      out.push({ t: e.t, ms: e.ms, end: e.t + e.ms, src: e.kind, e });
    }
    const m = snap.main || {};
    for (const x of m.slow || []) if (x.ms >= MIN) out.push({ t: x.t, ms: x.ms, end: x.t + x.ms, src: 'ipc', e: x });
    for (const x of m.late || []) if (x.ms >= MIN) out.push({ t: x.t, ms: x.ms, end: x.t + x.ms, src: 'late', e: x });
    for (const x of m.events || []) if (/gpu|page|hang/.test(x.kind) && x.kind !== 'unhang') out.push({ t: x.t, ms: 0, end: x.t, src: x.kind === 'gpu' ? 'gpu' : 'mainev', e: x });
    return out.sort((a, b) => a.t - b.t);
  }
  // sightings that overlap (or nearly) are one hiccup; its length is its longest sighting (they see the same freeze)
  function hiccups(snap) {
    const out = [];
    for (const s of sightings(snap)) {
      const h = out[out.length - 1];
      if (h && s.t <= h.end + GAP) { h.parts.push(s); h.end = Math.max(h.end, s.end); h.ms = Math.max(h.ms, s.ms); continue; }
      out.push({ t: s.t, end: s.end, ms: s.ms, parts: [s] });
    }
    // a lone GPU / page event isn't a hiccup by itself unless it lands inside or next to one (it's a detail then)
    return out.filter((h) => h.ms >= MIN || h.parts.some((p) => p.src === 'gpu' || (p.src === 'mainev' && /hang/.test(p.e.kind))));
  }

  // why: the strongest witness wins (the main process named > the main process late > the GPU > the Lab > the window)
  function explain(h, snap) {
    const P = (src) => h.parts.filter((p) => p.src === src).sort((a, b) => b.ms - a.ms);
    const ipc = P('ipc'); const late = P('late'); const gpu = P('gpu'); const lab = P('lab'); const frames = P('frame'); const inputs = P('input'); const mev = P('mainev');
    const jobs = (snap.main?.jobs || []).filter((j) => j.t >= h.t - NEAR && j.t <= h.end + 500);
    const area = (frames[0] || inputs[0] || lab[0] || gpu[0])?.e.area || snap.view || '';
    const labOn = h.parts.some((p) => p.e.lab) || (area === 'Lab' && snap.labOn);
    let kind; let cause; let detail = '';
    if (ipc.length) {
      kind = 'main'; cause = `main process busy with ${plainIpc(ipc[0].e.what)}`;
      detail = `Hearth's main process (the part that reads and writes files and talks to the AIs) spent ${secs(ipc[0].ms)} on ${plainIpc(ipc[0].e.what)} (${ipc[0].e.what}); every window waits for it meanwhile.`;
    } else if (late.length) {
      kind = 'main';
      cause = jobs.length ? `main process busy, around ${jobs[jobs.length - 1].what}` : 'main process busy';
      detail = `Hearth's main process didn't answer the window for ${secs(late[0].ms)}${jobs.length ? `; ${jobs.map((j) => j.what).join(', ')} had just started` : ''}.`;
    } else if (gpu.length || mev.some((p) => p.e.kind === 'gpu')) {
      kind = 'gpu'; cause = 'the graphics card reset a drawing';
      detail = `${(gpu[0] || mev[0]).e.what}. The view redraws from scratch after that, which takes a moment.`;
    } else if (lab.length && lab[0].ms >= (frames[0]?.ms || 0)) {
      kind = 'lab'; cause = `the Lab preview's drawing took ${secs(lab[0].ms)}`;
      detail = `The Lab preview drew one frame in ${secs(lab[0].ms)} (${lab[0].e.fps} fps around then): that is the scene's own work on the graphics card.`;
    } else if (frames.length) {
      const f = frames[0].e;
      const parts = [['script', f.s], ['layout', f.f], ['paint', f.r], ['other', f.o]].sort((a, b) => b[1] - a[1]);
      const what = plainFile(f.file);
      kind = 'page';
      if (parts[0][0] === 'script') cause = `the window busy running ${what || 'scripts'}${f.fn ? ` (${f.fn})` : ''}`;
      else if (parts[0][0] === 'layout') cause = `the window re-measuring its layout${what ? ` for ${what}` : ''}`;
      else if (parts[0][0] === 'paint') cause = 'the window redrawing (style, layout and paint)';
      else cause = 'the window busy with browser work';
      detail = `One frame of the window took ${secs(f.ms)}: scripts ${secs(f.s)}, layout forced by scripts ${secs(f.f)}, style / layout / paint ${secs(f.r)}, other ${secs(f.o)}.`;
    } else if (inputs.length) {
      const i = inputs[0].e;
      const verb = /key/.test(i.type) ? 'key press' : /pointer|click|mouse|tap/.test(i.type) ? 'click' : 'input';
      kind = 'input'; cause = `your ${verb} waited for the screen, the window itself was free`;
      detail = `Your ${verb} took ${secs(i.ms)} to show on screen while the window's own code was idle: usually the main process or the graphics card.`;
    } else if (mev.length) {
      kind = 'main'; cause = mev[0].e.what; detail = mev[0].e.what;
    } else { kind = 'unknown'; cause = 'unknown'; }
    return { kind, cause, detail, area, labOn, jobs };
  }

  function dayLine(day = {}) {
    const n = Number(day.today) || 0; const m = Number(day.yesterday) || 0;
    return `Hiccups over 500 ms today: ${n} (yesterday: ${m})`;
  }

  function summarise(snap = {}) {
    const now = snap.now || Date.now(); const win = snap.win || 30e3;
    const all = hiccups(snap);
    const inWin = all.filter((h) => h.end >= now - win);
    const pool = inWin.length ? inWin : all; // nothing in the last 30 s: the last minute's, said with its age
    const last = pool[pool.length - 1] || null;
    const worst = pool.reduce((w, h) => (!w || h.ms > w.ms ? h : w), null);
    const out = { found: Boolean(last), count: inWin.length, day: dayLine(snap.day), lines: [], tip: '', last: null, worst: null };
    const labNow = snap.labOn ? `the Lab preview is drawing${snap.lab ? ` (${snap.lab.fps} fps, worst frame ${secs(snap.lab.worst)})` : ''}` : 'the Lab preview is not drawing';
    if (snap.off) { out.headline = 'The smoothness watch is off, so nothing was recorded.'; out.tip = 'Turn it back on with the button below to catch the next one.'; out.cause = ''; return out; }
    if (!last) {
      out.headline = `No hiccup in the last ${Math.round(win / 1000)} s: nothing over ${MIN} ms in this window or in Hearth's main process.`;
      out.cause = '';
      out.lines.push(`Right now you're in ${where(snap.view)}; ${labNow}.`);
      if (snap.main?.lag?.max >= 500) out.lines.push(`Hearth's main process was late by up to ${secs(snap.main.lag.max)} at some point since ${clock(snap.main.lag.since)}.`);
      out.tip = 'If it just froze, it may have been outside Hearth (Windows, another app or the graphics driver), or longer ago than a minute. Click this right after the next one.';
      return out;
    }
    const x = explain(last, snap);
    out.last = { t: last.t, ms: last.ms, ago: now - last.end, kind: x.kind, cause: x.cause, area: x.area, labOn: x.labOn };
    const len = last.ms >= MIN ? secs(last.ms) : 'a moment';
    const age = now - last.end > win ? `, ${ago(now - last.end)}` : '';
    const context = `while you were in ${where(x.area)}${x.area !== 'Lab' && x.labOn ? ' with the Lab drawing' : ''}`;
    out.headline = `The last hiccup: ${len}${age}, ${context} (${x.cause}).`;
    out.cause = x.cause;
    if (x.detail) out.lines.push(x.detail);
    out.lines.push(`It happened at ${clock(last.t)} (${ago(now - last.end)}). The Lab was ${x.labOn ? 'open and drawing' : 'not drawing'} then; now ${labNow}.`);
    if (inWin.length > 1) out.lines.push(`${inWin.length} hiccups in the last ${Math.round(win / 1000)} s, the worst ${secs(worst.ms)} (${explain(worst, snap).cause}).`);
    if (snap.main?.lag?.max >= 500 && x.kind !== 'main') out.lines.push(`Hearth's main process was also late by up to ${secs(snap.main.lag.max)} at some point since ${clock(snap.main.lag.since)}.`);
    out.worst = worst ? { t: worst.t, ms: worst.ms } : null;
    out.tip = {
      main: 'Copy the report for Claude: it names what the main process was doing, so the next update can move that work off it.',
      gpu: 'If the graphics card keeps resetting, update its driver; the Lab’s 🪶 Light mode (button below) also asks less of it.',
      lab: 'If the Lab stutters often, 🪶 Light mode (button below) draws 30 steady frames per second; recordings and stills stay full size.',
      page: 'Copy the report for Claude: it has the file and the kind of work that ran long.',
      input: 'Copy the report for Claude: a slow answer with the window idle points at the main process or the graphics card.',
    }[x.kind] || 'Copy the report for Claude.';
    return out;
  }

  // for a Claude dev session: numbers, files, channels, times
  function report(snap = {}, s = summarise(snap)) {
    const now = snap.now || Date.now(); const env = snap.env || {};
    const rel = (t) => `${((t - now) / 1000).toFixed(1)}s`;
    const o = ['Hearth "That was slow" report (clicked by the owner right after a hiccup; measured by jank.js / jankmain.js in the running app; nothing profiled).',
      `When: ${new Date(now).toISOString()} · machine: ${[env.platform || '?', env.hz ? `${env.hz} Hz` : '', env.gpu || ''].filter(Boolean).join(' ')} · Electron ${env.electron || '?'} · Hearth ${env.version || '?'}`,
      `View now: ${snap.view || '?'} · Lab preview drawing: ${snap.labOn ? `yes${snap.lab ? ` (${snap.lab.fps} fps, worst ${snap.lab.worst} ms, cap ${snap.lab.cap || 'none'}${snap.lab.light ? ', Light mode' : ''})` : ''}` : 'no'}`,
      `Card said: ${s.headline}`, s.day, ''];
    const hs = hiccups(snap);
    o.push(`Hiccups (≥ ${MIN} ms, sightings within ${GAP} ms merged), times relative to the click:`);
    if (!hs.length) o.push('- none in the last minute');
    for (const h of hs) {
      const x = explain(h, snap);
      o.push(`- ${rel(h.t)} ${h.ms} ms — ${x.kind}: ${x.cause}; area ${x.area || '?'}; Lab drawing ${x.labOn ? 'yes' : 'no'}`);
      for (const p of h.parts) {
        const e = p.e;
        if (p.src === 'frame') o.push(`    frame ${e.ms} ms: script ${e.s}, forced layout ${e.f}, style/layout/paint ${e.r}, other ${e.o}; top script ${e.file || '(unnamed: file:// scripts are not attributed by LoAF)'} ${e.fn || ''}`);
        else if (p.src === 'input') o.push(`    input ${e.type} → paint ${e.ms} ms (area ${e.area})`);
        else if (p.src === 'lab') o.push(`    Lab preview frame ${e.ms} ms (${e.fps} fps window)`);
        else if (p.src === 'ipc') o.push(`    main IPC handler "${e.what}" ran ${e.ms} ms synchronously`);
        else if (p.src === 'late') o.push(`    main process took the window's message ${e.ms} ms late`);
        else o.push(`    event: ${e.kind || p.src}: ${e.what || ''}`);
      }
      if (x.jobs.length) o.push(`    main jobs started nearby: ${x.jobs.map((j) => `${j.what} @${rel(j.t)}`).join(', ')}`);
    }
    const m = snap.main || {};
    if (m.lag) o.push('', `Main event-loop delay (100 ms sampler) since ${new Date(m.lag.since).toISOString()}: p99 ${Math.round(m.lag.p99)} ms, max ${Math.round(m.lag.max)} ms`);
    if ((m.slow || []).length) o.push(`Slow main IPC handlers (≥ 100 ms) in the window: ${m.slow.map((x) => `${x.what} ${x.ms} ms @${rel(x.t)}`).join(', ')}`);
    if ((m.jobs || []).length) o.push(`Main background jobs started: ${m.jobs.map((j) => `${j.what} @${rel(j.t)}`).join(', ')}`);
    if (!m.lag && !m.slow) o.push('', 'Main process: no data (an older main.js, or the watch is off).');
    o.push('', 'Daily counts (hiccups ≥ 500 ms, local): ' + (Object.entries(snap.day?.days || {}).map(([d, n]) => `${d} ${n}`).join(', ') || 'none yet'));
    return o.join('\n');
  }

  return { summarise, report, dayLine, hiccups, explain, plainIpc, plainFile, where, secs, MIN, GAP };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SlowCardCore;
else window.SlowCardCore = SlowCardCore;
