// Capture from chat, keys, the palette, the rail's ⋯ menu, and the agents' capture_* tools (mcp/capture-mcp.js).
// Commands: /capture, /screenshot (/shot) with targets / social frames, /record (outside the Lab, or "/record app …")
// and /rec, /tour, /frames, /captures, /annotate, /beautify, /crop-shot, /copy-shot, /frame-at, /scenes, /contact,
// /pacing, /motion-curve, /frame-palette, /clean-ui, /cursor-fx, /keys-overlay, /window-size, /capture-tools,
// /capture-folder, /capture-last, /record-presets, /capture-help. All local: no tokens.
(() => {
  const D = CaptureData;
  const AREA = 'Capture';
  const IS_MAC = /Mac/.test(navigator.platform);
  const M = IS_MAC ? '⌘' : 'Ctrl';
  const base = Capture.base;
  const words = (s) => (String(s || '').match(/"[^"]*"|'[^']*'|\S+/g) || []).map((w) => w.replace(/^["']|["']$/g, ''));
  const opts = (list) => (args) => { const last = String(args || '').split(/\s+/).pop().toLowerCase(); return list.filter((o) => String(o.value).toLowerCase().startsWith(last)).slice(0, 40); };
  // register, or share a taken name (`when`), never silently replacing another stream's command
  function reg(def) {
    const taken = Commands.get(def.name);
    if (taken && !def.when && !taken.variants?.some((v) => v.area === AREA)) { console.warn(`capture: /${def.name} is taken by ${taken.area}`); return; }
    for (const a of def.aliases || []) if (Commands.get(a)) def.aliases = def.aliases.filter((x) => x !== a);
    Commands.register({ area: AREA, ...def });
  }

  // ---------- argument words ----------
  const TARGET_WORDS = [...Object.keys(Capture.TARGETS), 'app', 'hearth', 'full', 'messages', 'director', 'preview', 'area', 'thing', 'tall', 'sidebar'];
  function shotArgs(args) {
    const o = {};
    const w = words(args);
    for (let i = 0; i < w.length; i += 1) {
      const x = w[i]; const lx = x.toLowerCase();
      if (Capture.targetId(lx)) o.target = Capture.targetId(lx);
      else if (/^(sel|selector|css):/.test(lx)) o.selector = x.replace(/^[a-z]+:/i, '');
      else if (/^[.#[]/.test(x)) o.selector = x;
      else if (lx === 'clean') o.clean = true;
      else if (lx === 'norail' || lx === 'no-rail' || lx === 'hide-rail' || lx === 'bare') { o.hideRail = true; o.clean = true; }
      else if (lx === 'copy') o.copy = true;
      else if (lx === 'annotate' || lx === 'draw' || lx === 'mark-up') o.annotate = true;
      else if (lx === 'attach' || lx === 'chat-attach' || lx === 'send') o.attach = true;
      else if (['png', 'jpg', 'jpeg', 'webp'].includes(lx)) o.format = lx === 'jpeg' ? 'jpg' : lx;
      else if (lx === '1x') o.scale = 1;
      else if (lx === '2x' || lx === 'retina' || lx === 'native') o.scale = 'native';
      else if (lx === 'fit') o.fit = 'fit';
      else if (lx === 'fill' || lx === 'crop') o.fit = 'crop';
      else if (lx === 'delay' || lx === 'in') { o.delay = Number.parseFloat(w[i + 1]) || 3; i += 1; }
      else if (/^\d+s$/.test(lx)) o.delay = Number.parseFloat(lx);
      else if (lx === 'pretty' || lx === 'post' || lx === 'beautify') o.beautify = 'forge';
      else if (lx.startsWith('beautify:') || lx.startsWith('look:')) o.beautify = lx.split(':')[1];
      else if (D.BEAUTIFY.some((b) => b.id === lx) && !D.parseFrame(lx)) o.beautify = lx;
      else if (lx === 'last' && /^\d+$/.test(w[i + 1] || '')) { o.lastN = Number(w[i + 1]); i += 1; }
      else if (D.parseFrame(lx)) o.crop = D.parseFrame(lx).id;
      else if (lx === 'full' || lx === 'fullres') o.full = true;
    }
    if (o.lastN && !o.target) o.target = 'transcript';
    return o;
  }
  function recArgs(args) {
    const o = {}; let action = 'start';
    const w = words(args);
    for (let i = 0; i < w.length; i += 1) {
      const lx = w[i].toLowerCase();
      if (['start', 'stop', 'pause', 'resume', 'status', 'toggle', 'mark', 'marker', 'end', 'done'].includes(lx) && i === 0) { action = { marker: 'mark', end: 'stop', done: 'stop' }[lx] || lx; if (action === 'mark') { o.label = w.slice(1).join(' '); break; } continue; }
      if (D.RECORD.some((p) => p.id === lx)) o.preset = lx;
      else if (Capture.targetId(lx)) o.target = Capture.targetId(lx);
      else if (/^(sel|selector|css):/.test(lx)) o.target = `selector:${w[i].replace(/^[a-z]+:/i, '')}`;
      else if (/^\d+\s*fps$/.test(lx)) o.fps = Number.parseInt(lx, 10);
      else if (/^\d+(\.\d+)?(s|sec|m|min)$/.test(lx)) o.max = Number.parseFloat(lx) * (/m/.test(lx) ? 60 : 1);
      else if (['hq', 'high'].includes(lx)) o.mbps = 16;
      else if (['max', 'master', 'best'].includes(lx)) o.mbps = 40;
      else if (['draft', 'small', 'low'].includes(lx)) o.mbps = 3;
      else if (['sound', 'audio', 'app-sound'].includes(lx)) o.audio = 'app';
      else if (['mic', 'voice', 'microphone'].includes(lx)) o.audio = 'mic';
      else if (['both', 'sound+mic', 'app+mic'].includes(lx)) o.audio = 'app+mic';
      else if (['system', 'computer', 'loopback'].includes(lx)) o.audio = 'system';
      else if (['mute', 'silent', 'nosound'].includes(lx)) o.audio = 'none';
      else if (lx === 'mp4') o.mp4 = true;
      else if (lx === 'webm') o.mp4 = false;
      else if (lx === 'now') o.countdown = 0;
      else if (lx === 'countdown') { o.countdown = Number(w[i + 1]) || 3; i += 1; }
      else if (D.CURSORS.some((c) => c.id === lx) && lx !== 'off') o.cursor = lx;
      else if (lx === 'cursor') o.cursor = 'halo';
      else if (lx === 'clicks') o.clicks = 'ring';
      else if (lx === 'keys') o.keys = true;
      else if (lx === 'clean') o.clean = true;
      else if (lx === '1080p' || lx === '720p' || lx === '2160p' || lx === '4k') o.size = lx === '4k' ? '2160p' : lx;
      else if (D.parseFrame(lx)) o.size = D.parseFrame(lx).id;
      else if (/^\d+$/.test(lx) && D.FPS.includes(Number(lx))) o.fps = Number(lx);
    }
    return { action, o };
  }
  const fail = (e) => toast(e.message || String(e), { type: 'error' });
  const say = (ctx, text) => (ctx?.say ? ctx.say(text) : toast(text));

  // ---------- running a recording command ----------
  async function recCommand(args, ctx) {
    const { action, o } = recArgs(args);
    if (action === 'status') { const s = Capture.status(); return s.recording ? `● Recording ${Capture.fmtClock(s.seconds)}${s.paused ? ' (paused)' : ''} · ${s.target} · ${s.size} · ${s.fps} fps${s.marks ? ` · ${s.marks} markers` : ''}` : `Not recording.${s.last ? ` Last: \`${s.last.path}\`` : ''}`; }
    if (action === 'pause') { Capture.pause(); return Capture.recording ? 'Paused (/record resume)' : 'Not recording.'; }
    if (action === 'resume') { Capture.resume(); return Capture.recording ? 'Recording again' : 'Not recording.'; }
    if (action === 'mark') { const m = Capture.mark(o.label); return m ? `◆ Marker at ${m.time.toFixed(2)}s: ${m.label}` : 'Not recording.'; }
    if (action === 'stop' || (action === 'toggle' && Capture.recording)) {
      if (!Capture.recording) {
        // the Lab's own recording, when that's what is running
        const lab = Commands.get('record')?.variants?.find((v) => v.area !== AREA);
        if (lab && ctx?.place === 'three') return lab.run('stop', ctx);
        return 'Not recording.';
      }
      const r = await Capture.stop();
      return `🎬 Saved \`${r.path}\` (${r.duration}s, ${r.size}${r.mp4 ? ', MP4' : ''})`;
    }
    if (Capture.recording) return `Already recording (${Capture.fmtClock(Capture.status().seconds)}). /record stop`;
    const s = await Capture.record(o);
    if (s.cancelled) return 'Cancelled.';
    return null; // the REC window says the rest
  }

  // ---------- commands ----------
  const targetOpts = TARGET_WORDS.map((t) => ({ value: t, hint: Capture.TARGETS[t]?.label || '' }));
  const frameOpts = D.SOCIAL.map((f) => ({ value: f.id, hint: `${f.label} · ${f.w}×${f.h}` }));
  const shotWordOpts = [...targetOpts, ...frameOpts, { value: 'clean', hint: 'no toasts, menus, scrollbars' }, { value: 'norail', hint: 'without the rail and chats list' }, { value: 'copy' }, { value: 'annotate', hint: 'draw arrows / boxes first' }, { value: 'attach', hint: 'put it in this chat' }, { value: 'pretty', hint: 'on a gradient, for posts' }, { value: 'fit', hint: 'fit inside the frame (no crop)' }, { value: 'jpg' }, { value: 'webp' }, { value: '1x', hint: 'CSS size on a Retina screen' }, { value: '3s', hint: 'after a countdown' }];
  const recWordOpts = [{ value: 'stop' }, { value: 'pause' }, { value: 'resume' }, { value: 'mark' }, { value: 'status' }, ...D.RECORD.map((p) => ({ value: p.id, hint: p.label })), ...targetOpts.filter((t) => t.value !== 'transcript'), { value: '60fps' }, { value: '30fps' }, { value: 'hq' }, { value: 'sound', hint: 'Hearth\'s own sound' }, { value: 'mic' }, { value: 'both' }, { value: 'mp4' }, { value: '10s', hint: 'stop after 10 seconds' }, { value: 'now', hint: 'no countdown' }, { value: 'clicks' }, { value: 'keys' }, ...frameOpts.slice(0, 8)];
  const SHOT_WORDS = /^(burst|tool|panel|view|chat|messages|dock|director|lab|preview|canvas|region|area|element|thing|pick|transcript|tall|scroll|composer|rail|panel|sidebar|clean|norail|bare|copy|annotate|draw|attach|pretty|post|beautify|fit|jpg|webp|png|1x|delay|in|\d+s|last|sel:|selector:|css:|[.#[])/i;
  const isShotArgs = (args) => { const w = words(args); return w.length > 0 && w.some((x) => SHOT_WORDS.test(x) || D.parseFrame(x) || D.BEAUTIFY.some((b) => b.id === x.toLowerCase())) && !/^(window|lab)$/i.test(String(args).trim()); };

  reg({
    name: 'capture', aliases: ['cap'], args: '[shot | record | stop | library | tour | frames | settings | folder]', desc: 'Screenshots and recordings of Hearth itself, and the frame reader: the capture menu, or one of its actions',
    keys: `${M}+Alt+S`, examples: ['/capture', '/capture record', '/capture library'], keywords: 'screenshot record video screen capture self',
    complete: opts(['shot', 'record', 'stop', 'library', 'tour', 'frames', 'settings', 'folder'].map((v) => ({ value: v }))),
    run: async (args, ctx) => {
      const a = String(args || '').trim().toLowerCase();
      if (!a || a === 'menu') { Capture.menu(Math.max(8, innerWidth / 2 - 130), 90, Capture.mainItems()); return null; }
      if (a.startsWith('shot')) { const r = await Capture.shot(shotArgs(a.slice(4))); return r ? `📷 \`${r.path}\` (${r.w}×${r.h})` : 'Cancelled.'; }
      if (a.startsWith('rec') || a === 'stop') return recCommand(a === 'stop' ? 'stop' : a.replace(/^rec(ord)?/, ''), ctx);
      if (a.startsWith('lib') || a === 'captures') { CaptureView.library(); return null; }
      if (a.startsWith('tour')) { CaptureTour.picker(); return null; }
      if (a.startsWith('frame') || a.startsWith('read')) { FrameRead.pickAndRead(); return null; }
      if (a.startsWith('set')) { Capture.menu(Math.max(8, innerWidth / 2 - 130), 90, Capture.settingsItems()); return null; }
      if (a.startsWith('folder')) { window.hub.fs.open((await Capture.info()).dir); return null; }
      return 'Try /capture, /capture shot, /capture record, /capture library, /capture tour, /capture frames.';
    },
  });
  // /screenshot (/shot): the chat stream's version attaches the window or the Lab to your message; with a target,
  // a social frame or an option word, this one takes the capture into the captures folder (attach to attach it too)
  reg({
    name: 'screenshot', when: (_ctx, args) => isShotArgs(args), whenLabel: 'with a target, a frame or options',
    args: '[tool|chat|transcript|dock|lab|region|element|.selector] [9:16|4:5|1:1|16:9…] [clean|norail|copy|annotate|attach|pretty|fit|jpg|3s]',
    desc: 'A screenshot of part of Hearth into your captures: a tool, the chat (or all of it as a tall picture), a region you drag, a social frame, clean, beautified',
    examples: ['/screenshot tool 9:16 clean', '/shot transcript', '/shot region copy', '/shot lab', '/shot window pretty'], keywords: 'capture snapshot picture image png',
    complete: opts(shotWordOpts),
    run: async (args) => {
      // burst: N shots every S seconds (hover states, a changing Lab, a timelapse of a build)
      const b = String(args || '').match(/\bburst\s+(\d+)(?:\s+(?:every\s+)?(\d+(?:\.\d+)?)\s*s?)?/i);
      if (b) {
        const n = Math.min(60, Number(b[1])); const every = Number(b[2] || 1);
        const o = shotArgs(String(args).replace(b[0], ''));
        const paths = [];
        for (let k = 0; k < n; k += 1) { paths.push((await Capture.shot({ ...o, quiet: true }))?.path); if (k < n - 1) await new Promise((r) => setTimeout(r, every * 1000)); }
        toast(`📷 ${paths.length} shots`, { timeout: 3000, action: { label: 'Show', fn: () => CaptureView.library({ kind: 'shot' }) } });
        return `${paths.length} shots, every ${every}s:\n${paths.map((p) => `- \`${p}\``).join('\n')}`;
      }
      const r = await Capture.shot(shotArgs(args)); return r ? `📷 \`${r.path}\` (${r.w}×${r.h})` : 'Cancelled.';
    },
  });
  // /record: the Lab's /record records the sketch; outside the Lab (or with a Hearth word) this one records Hearth itself
  const recWhen = (ctx, args) => ctx?.place !== 'three' || /^(app|hearth|window|tool|chat|dock|region|element|composer|panel|rail|selector:|sel:|status|pause|resume|mark|marker|toggle)\b/i.test(String(args || '').trim()) || (Capture.recording && /^(stop|end|done)\b/i.test(String(args || '').trim()));
  reg({
    name: 'record', when: recWhen, whenLabel: 'outside the Lab (or /record app …)',
    args: '[stop|pause|resume|mark|status] [preset] [tool|chat|lab|region] [60fps] [9:16] [sound|mic|both] [10s] [hq] [mp4] [now]',
    desc: 'Record Hearth itself (window, a tool, a region), with a countdown, its own sound, clicks shown; the REC light stays out of the picture',
    keys: `${M}+Alt+R`, examples: ['/record', '/record promo', '/record lab 9:16 60fps', '/record tool 15s', '/record stop', '/record mark drop'], keywords: 'video screen recording capture self intro',
    complete: opts(recWordOpts), run: recCommand,
  });
  reg({
    name: 'rec', args: '[same as /record]', desc: 'Record Hearth itself (the same as /record outside the Lab, anywhere)', keys: `${M}+Alt+R`,
    examples: ['/rec', '/rec stop', '/rec reel'], complete: opts(recWordOpts), run: recCommand,
  });
  reg({
    name: 'tour', aliases: ['tours'], args: '[name | list | new | edit <name> | stop | steps | run "<steps>"]', desc: 'Hands-free scripted recordings: open tools, run commands, type, click, zoom, captions, titles (for an intro video)',
    keys: `${M}+Alt+T`, examples: ['/tour', '/tour intro', '/tour hello', '/tour edit intro', '/tour stop'], keywords: 'demo script automated walkthrough intro video',
    complete: (args) => { const last = String(args || '').toLowerCase(); return [{ value: 'list' }, { value: 'new' }, { value: 'edit' }, { value: 'stop' }, { value: 'steps' }, ...D.TOURS.map((t) => ({ value: t.id, hint: t.label }))].filter((o) => o.value.startsWith(last)); },
    run: async (args, ctx) => {
      const a = String(args || '').trim();
      const [w0, ...rest] = words(a);
      const lw = String(w0 || '').toLowerCase();
      if (!a) { CaptureTour.picker(); return null; }
      if (lw === 'stop') { CaptureTour.stop(); return CaptureTour.running() ? 'Stopping the tour…' : 'No tour is running.'; }
      if (lw === 'list') { const l = await CaptureTour.list(); return l.map((t) => `- **${t.id}**: ${t.label}${t.own ? ' (yours)' : ''}`).join('\n'); }
      if (lw === 'new') { CaptureTour.edit(); return null; }
      if (lw === 'edit') { CaptureTour.edit(rest.join(' ') || null); return null; }
      if (lw === 'steps' || lw === 'help') return D.TOUR_STEPS.map(([k, d]) => `- \`${k}\`: ${d}`).join('\n');
      if (lw === 'run') { const text = a.slice(3).trim().replace(/^["']|["']$/g, '').replace(/\s*;\s*/g, '\n'); const r = await CaptureTour.run(text, { name: 'from chat' }); return tourText(r); }
      const t = await CaptureTour.get(a);
      if (!t) return `No tour called "${a}". /tour list`;
      say(ctx, `▶ Running "${t.label}" (Esc stops it)`);
      return tourText(await CaptureTour.run(t.id));
    },
  });
  const tourText = (r) => `${r.aborted ? 'Stopped' : 'Done'}: ${r.steps} steps in ${(r.ms / 1000).toFixed(1)}s${r.recording ? ` · 🎬 \`${r.recording.path}\`` : ''}${r.shots.length ? ` · ${r.shots.length} shots` : ''}${r.skipped.length ? `\nSkipped:\n${r.skipped.map((s) => `- ${s}`).join('\n')}` : ''}`;

  // /frames <video|last|open> [mode] [args]: the frame reader from chat
  const modeOpts = D.READ_MODES.map((m) => ({ value: m.id, hint: m.label }));
  async function framesCommand(args, ctx, forced = null) {
    const w = words(args);
    let file = null; let i = 0;
    if (w[0] && (/[\\/]/.test(w[0]) || /\.(mp4|mov|webm|m4v|mkv)$/i.test(w[0]) || /^(last|latest|open|review|current)$/i.test(w[0]))) { file = await FrameRead.resolveFile(w[0]); i = 1; } else file = await FrameRead.resolveFile('');
    if (!file) return 'Which video? Give a path, `last` (your newest recording) or open one in Video Review.';
    const mode = forced || FrameRead.modeOf(w[i]) || 'sheet';
    if (!forced && FrameRead.modeOf(w[i])) i += 1;
    const rest = w.slice(i);
    const toChat = rest.some((x) => /^(chat|attach|send)$/i.test(x));
    const nums = rest.filter((x) => !/^(chat|attach|send)$/i.test(x));
    const a = {};
    // times stay text: the reader parses timecodes / f12 with the video's real frame rate
    if (mode === 'at') { a.times = nums.filter((x) => FrameRead.parseTime(x)); if (!a.times.length) a.times = [0]; }
    if (mode === 'every') a.every = Number(nums[0]) || 10;
    if (mode === 'spread') a.count = Number(nums[0]) || 12;
    if (mode === 'scenes' || mode === 'pacing') a.sensitivity = nums.find((x) => D.SENSITIVITY.some((s) => s.id === x)) || 'normal';
    if (mode === 'sheet') { a.layout = nums.find((x) => D.SHEETS.some((s) => s.id === x)) || '4x3'; a.theme = nums.find((x) => D.SHEET_THEMES.some((s) => s.id === x)); const lab = nums.find((x) => /^(tc|frame|both|time|none)$/.test(x)); if (lab) a.labels = lab; }
    if (mode === 'palette' && nums[0]) a.time = FrameRead.parseTime(nums[0])?.time ?? null;
    if (mode === 'verify') a.frame = Number(String(nums[0] || '0').replace(/^f/, '')) || 0;
    if (mode === 'diff') { a.a = Number(String(nums[0] || 0).replace(/^f/, '')); a.b = Number(String(nums[1] || 1).replace(/^f/, '')); }
    const busy = toast(`Reading ${base(file)}…`, { timeout: 0 });
    let r;
    try { r = await FrameRead.read(file, mode, a); } finally { busy.remove(); }
    if (toChat && r.images?.length) await FrameRead.toChatImages(r.images, file, ctx?.agentId);
    else if (r.images?.length) FrameRead.show(r, file, `${base(file)} · ${D.READ_MODES.find((x) => x.id === mode)?.label}`);
    return r.text.length > 1800 ? `${r.text.slice(0, 1800)}…` : r.text;
  }
  reg({
    name: 'frames', aliases: ['read-frames'], args: '[video | last | open] [at|every|spread|scenes|sheet|motion|pacing|palette|light|info|verify|diff] [values…] [chat]',
    desc: 'Read frames of any video exactly: a frame at a time / frame / timecode, every N, scene changes, a contact sheet, motion, pacing, palette',
    examples: ['/frames last sheet', '/frames last at 1.5 f120 00:00:02:12', '/frames open scenes sensitive', '/frames last motion', '/frames last every 12 chat'], keywords: 'frame accurate reference footage analyze contact sheet scene detection',
    complete: opts([{ value: 'last', hint: 'your newest recording' }, { value: 'open', hint: 'the video in Video Review' }, ...modeOpts, ...D.SHEETS.map((s) => ({ value: s.id, hint: s.label })), ...D.SENSITIVITY.map((s) => ({ value: s.id, hint: s.label })), { value: 'chat', hint: 'attach the pictures to this chat' }]),
    run: (args, ctx) => framesCommand(args, ctx),
  });
  reg({ name: 'frame-at', args: '<1.5 | 0:02.250 | 00:00:01:12 | f36> [video]', desc: 'The exact frame of a video at a time, timecode or frame number (opens it; add chat to attach it)', examples: ['/frame-at 2.5', '/frame-at f120 last chat'],
    run: async (args, ctx) => { const w = words(args); const t = w.shift() || '0'; const file = w.find((x) => !/^chat$/i.test(x)); return framesCommand(`${file || 'last'} at ${t}${w.includes('chat') ? ' chat' : ''}`, ctx); } });
  reg({ name: 'scenes', args: '[video | last | open] [gentle|normal|sensitive|every] [chat]', desc: 'Scene changes in a video: one exact frame per shot with its timecode and length', examples: ['/scenes', '/scenes open sensitive'],
    complete: opts(D.SENSITIVITY.map((s) => ({ value: s.id, hint: s.label }))), run: (args, ctx) => framesCommand(args, ctx, 'scenes') });
  reg({ name: 'contact', aliases: ['contact-sheet-of'], args: '[video | last | open] [layout] [dark|light|forge|film] [tc|frame|both|none] [chat]', desc: 'A contact sheet of any video with timecodes (15 layouts: 4x3, strip, storyboard, polaroid, one per shot…)', examples: ['/contact', '/contact open 5x4 film', '/contact last story chat'],
    complete: opts([...D.SHEETS.map((s) => ({ value: s.id, hint: s.label })), ...D.SHEET_THEMES.map((t) => ({ value: t.id, hint: t.label }))]), run: (args, ctx) => framesCommand(args, ctx, 'sheet') });
  reg({ name: 'pacing', args: '[video | last | open] [sensitivity]', desc: 'How a video is cut: shots, average shot length, cuts per minute, in words (a reference\'s rhythm, not its footage)', examples: ['/pacing open'], run: (args, ctx) => framesCommand(args, ctx, 'pacing') });
  reg({ name: 'motion-curve', args: '[video | last | open] [chat]', desc: 'Motion energy over a video as a chart (busy / calm moments, the busiest timecodes)', examples: ['/motion-curve open'], run: (args, ctx) => framesCommand(args, ctx, 'motion') });
  reg({ name: 'frame-palette', args: '[video | last | open] [time]', desc: 'The main colors of a video (or of the frame at a time)', examples: ['/frame-palette open', '/frame-palette last 2.5'], run: (args, ctx) => framesCommand(args, ctx, 'palette') });

  // /make gif|trim|timelapse|… [video|last|open] [from] [to]: a new file next to the video (the source never changes)
  const MAKE_WORDS = { gif: 'gif', 'small-gif': 'gif-small', trim: 'trim', cut: 'trim', timelapse: 'speed4', '2x': 'speed2', '4x': 'speed4', '8x': 'speed8', slow: 'slow', 'slow-mo': 'slow', boomerang: 'boomerang', frames: 'sequence', png: 'sequence', jpg: 'sequence-jpg', sequence: 'sequence', reels: 'reels', 'reels-fit': 'reels-fit', '9:16': 'reels-fit', square: 'square', '1:1': 'square', feed: 'feed', '4:5': 'feed', wide: 'wide', '16:9': 'wide', mute: 'mute', silent: 'mute', sound: 'audio', audio: 'audio', poster: 'poster', still: 'poster', loop: 'loop' };
  reg({
    name: 'make', when: (_ctx, args) => Boolean(MAKE_WORDS[String(args || '').trim().split(/\s+/)[0]?.toLowerCase()]) || !String(args || '').trim(), whenLabel: 'from a video (gif, trim, timelapse…)',
    args: '<gif|trim|timelapse|2x|slow|boomerang|frames|9:16|1:1|4:5|16:9|mute|sound|poster|loop> [video | last | open] [from] [to]',
    desc: 'Make something from a video: a GIF, a frame-exact trim, a timelapse, a boomerang, PNG frames for After Effects, a 9:16 / 1:1 / 4:5 copy, the sound, a poster frame, a seamless loop',
    examples: ['/make gif last 1 3.5', '/make timelapse', '/make frames open 0 2', '/make 9:16 last', '/make loop'], keywords: 'export convert gif mp4 social reels after effects png sequence',
    complete: opts(Object.keys(MAKE_WORDS).map((k) => ({ value: k, hint: (D.EDITS.find((e) => e.id === MAKE_WORDS[k])?.label) || (k === 'loop' ? 'find and cut the best seamless loop' : '') }))),
    run: async (args) => {
      const w = words(args);
      if (!w.length) return D.EDITS.map((e) => `- ${e.label}`).join('\n') + '\nUse: /make gif [video | last | open] [from] [to]';
      const what = MAKE_WORDS[w[0].toLowerCase()];
      let i = 1; let file = null;
      if (w[1] && !FrameRead.parseTime(w[1])) { file = await FrameRead.resolveFile(w[1]); i = 2; } else file = await FrameRead.resolveFile('');
      if (!file) return 'Which video? A path, `last` or `open`.';
      const fps = (await FrameRead.info(file)).fps;
      const t = (x) => { const p = FrameRead.parseTime(x, fps); return p ? (p.frame != null ? p.frame / fps : p.time) : undefined; };
      const range = { ...(w[i] ? { from: t(w[i]) } : {}), ...(w[i + 1] ? { to: t(w[i + 1]) } : {}) };
      if (what === 'loop') {
        const l = (await FrameRead.read(file, 'loop', { from: range.from || 0 })).value;
        const r = await FrameRead.edit(file, 'trim', { from: l.from, to: l.to });
        return `Seamless loop ${l.from}s → ${l.to}s (${Math.round(l.match * 100)} % alike): \`${r.path}\``;
      }
      const e = D.EDITS.find((x) => x.id === what);
      const r = await FrameRead.edit(file, e.op || e.id, { ...(e.args || {}), ...range });
      return `${e.label}: \`${r.path}\`${r.files ? ` (${r.files} files)` : ''}`;
    },
  });

  reg({ name: 'captures', aliases: ['shots'], args: '[pictures | videos]', desc: 'Your screenshots and recordings (double-click opens, right-click for more, drag into a chat or another app)', keys: `${M}+Alt+V`,
    complete: opts([{ value: 'pictures' }, { value: 'videos' }]),
    run: async (args) => { const a = String(args || '').toLowerCase(); CaptureView.library(a.startsWith('pic') || a.startsWith('shot') ? { kind: 'shot' } : a.startsWith('vid') ? { kind: 'video' } : {}); return null; } });
  const lastOr = async (arg, kind = null) => {
    const a = String(arg || '').trim().replace(/^["']|["']$/g, '');
    if (a && a !== 'last') return a;
    const l = Capture.recent().find((x) => !kind || x.kind === kind);
    if (l) return l.path;
    const list = await window.hub.capture.list({ kind: kind || 'all', limit: 1 });
    return list[0]?.path || null;
  };
  reg({ name: 'capture-last', args: '', desc: 'Open your newest capture (screenshot or recording)', run: async () => { const p = await lastOr(''); if (!p) return 'No captures yet.'; CaptureView.open(p); return null; } });
  reg({ name: 'annotate', args: '[last | path]', desc: 'Draw on a screenshot: arrows, boxes, text, numbered badges, blur / pixelate private bits, spotlight, crop', examples: ['/annotate'],
    run: async (args) => { const p = await lastOr(args, 'shot'); if (!p) return 'No screenshot yet: /shot first.'; const out = await CaptureAnnotate.open(p); return out ? `✎ Saved \`${out}\`` : null; } });
  reg({ name: 'beautify', args: '[look] [bg:… pad:… corners:… shadow:… bar:…] [last | path]', desc: 'Your screenshot on a gradient with padding, rounded corners, a shadow and a window bar, for posts (15 looks, 59 backgrounds, or your own mix)', examples: ['/beautify', '/beautify violet', '/beautify bg:nebula pad:l corners:24 bar:mac'],
    complete: opts([...D.BEAUTIFY.map((b) => ({ value: b.id, hint: b.label })), ...D.BACKGROUNDS.map((b) => ({ value: `bg:${b.id}`, hint: b.label })), ...D.PADS.map((x) => ({ value: `pad:${x.id}`, hint: `padding ${x.label}` })), ...D.CORNERS.map((x) => ({ value: `corners:${x.id}`, hint: x.label })), ...D.SHADOWS.map((x) => ({ value: `shadow:${x.id}`, hint: x.label })), ...D.CHROME.map((x) => ({ value: `bar:${x.id}`, hint: x.label }))]),
    run: async (args) => {
      const w = words(args);
      const look = w.find((x) => D.BEAUTIFY.some((b) => b.id === x.toLowerCase()) || x.toLowerCase() === 'mine') || (w.some((x) => x.includes(':')) ? 'mine' : 'forge');
      const over = Capture.beautyArgs(w);
      const p = await lastOr(w.find((x) => x !== look && !x.includes(':')), 'shot');
      if (!p) return 'No screenshot yet: /shot first.';
      const out = await CaptureView.derive(p, (img) => Capture.beautify(img, look.toLowerCase(), over), look === 'mine' ? 'beautified' : look);
      return `✨ \`${out}\``;
    } });
  reg({ name: 'crop-shot', args: '<9:16|4:5|1:1|16:9|…> [fit] [last | path]', desc: 'Your screenshot cropped (or fitted) to a social frame at its exact size (23 frames)', examples: ['/crop-shot 9:16', '/crop-shot 4:5 fit'],
    complete: opts([...frameOpts, { value: 'fit' }]),
    run: async (args) => { const w = words(args); const f = w.map((x) => D.parseFrame(x)).find(Boolean); if (!f) return 'Which frame? 9:16, 4:5, 1:1, 16:9, reels, og…'; const fit = w.includes('fit') ? 'fit' : 'crop'; const p = await lastOr(w.find((x) => !D.parseFrame(x) && x !== 'fit'), 'shot'); if (!p) return 'No screenshot yet: /shot first.'; const out = await CaptureView.derive(p, (img) => Capture.socialCrop(img, f, { fit }), `${f.id.replace(':', 'x')}${fit === 'fit' ? ' fit' : ''}`); return `⬚ \`${out}\` (${f.w}×${f.h})`; } });
  reg({ name: 'copy-shot', args: '[last | path]', desc: 'Copy your newest screenshot to the clipboard', run: async (args) => { const p = await lastOr(args, 'shot'); if (!p) return 'No screenshot yet.'; await Capture.copyImage(p); return `Copied ${base(p)}`; } });
  reg({ name: 'clean-ui', args: '[on | off]', desc: 'Hide toasts, menus, scrollbars and carets (for your own screenshots or screen recorders); norail also hides the rail and chats list', examples: ['/clean-ui', '/clean-ui norail', '/clean-ui off'],
    complete: opts([{ value: 'on' }, { value: 'off' }, { value: 'norail' }]),
    run: async (args) => {
      const a = String(args || '').toLowerCase().trim();
      const on = a === 'off' ? false : a === 'on' || a === 'norail' ? true : !document.documentElement.classList.contains('cap-clean-sticky');
      document.documentElement.classList.toggle('cap-clean-sticky', on);
      Capture.clean(on, { hideRail: a === 'norail' });
      return on ? `Clean UI on${a === 'norail' ? ' (no rail)' : ''}. /clean-ui off brings everything back.` : 'Clean UI off.';
    } });
  reg({ name: 'cursor-fx', args: '<dot|ring|halo|spotlight|arrow|off> [ring|burst|pulse|off]', desc: 'Show the cursor and clicks in the picture (recordings and tours); stays until off', examples: ['/cursor-fx halo ring', '/cursor-fx off'],
    complete: opts([...D.CURSORS.map((c) => ({ value: c.id, hint: c.label })), ...D.CLICKS.map((c) => ({ value: c.id, hint: c.label }))]),
    run: async (args) => { const w = words(args).map((x) => x.toLowerCase()); const style = w.find((x) => D.CURSORS.some((c) => c.id === x)) || 'halo'; const clicks = w.find((x, i) => i > 0 && D.CLICKS.some((c) => c.id === x)) || (style === 'off' ? 'off' : 'ring'); Capture.cursorFx.set(style, { clicks }); Capture.setPref('rec', 'cursor', style); Capture.setPref('rec', 'clicks', clicks); return style === 'off' ? 'Cursor effects off.' : `Cursor: ${style}, clicks: ${clicks}.`; } });
  reg({ name: 'keys-overlay', args: '[on | off]', desc: 'Show the keys you press at the bottom of the window (for tutorial recordings)', complete: opts([{ value: 'on' }, { value: 'off' }]),
    run: async (args) => { const on = !/off/i.test(args || '') && (/on/i.test(args || '') || !Capture.cursorFx.keys); Capture.cursorFx.set(Capture.cursorFx.style, { keys: on }); Capture.setPref('rec', 'keys', on); return on ? 'Keys overlay on.' : 'Keys overlay off.'; } });
  reg({ name: 'window-size', args: '<1920x1080 | 1280x720 | 1080x1350 | reset>', desc: 'Make the window\'s content an exact size (clean 16:9 / 4:5 recordings); reset goes back', examples: ['/window-size 1920x1080', '/window-size reset'],
    complete: opts([{ value: '1920x1080' }, { value: '1280x720' }, { value: '1440x900' }, { value: '1080x1350' }, { value: '1080x1080' }, { value: 'reset' }]),
    run: async (args) => {
      const a = String(args || '').trim().toLowerCase();
      if (!a) { const r = await window.hub.capture.windowSize({}); return `The window's content is ${r.now.width}×${r.now.height}.`; }
      if (a === 'reset') { const b = store.get('capture.windowBefore', null); if (!b) return 'Nothing to reset.'; await window.hub.capture.windowSize(b); store.set('capture.windowBefore', null); return `Back to ${b.width}×${b.height}.`; }
      const m = a.match(/^(\d+)\s*[x×]\s*(\d+)$/); if (!m) return 'Give WIDTHxHEIGHT, e.g. 1920x1080.';
      const r = await window.hub.capture.windowSize({ width: Number(m[1]), height: Number(m[2]) });
      if (!store.get('capture.windowBefore', null)) store.set('capture.windowBefore', r.before);
      return `Content is now ${r.now.width}×${r.now.height}${r.now.width !== Number(m[1]) || r.now.height !== Number(m[2]) ? ' (the screen is too small for the full size)' : ''}. /window-size reset`;
    } });
  reg({ name: 'capture-tools', args: '[on | off | agent on | agent off]', desc: 'Let this chat\'s AI take screenshots, record Hearth and read video frames (capture_* tools; adds their short descriptions to each message while on)', examples: ['/capture-tools on', '/capture-tools agent on'],
    complete: opts([{ value: 'on' }, { value: 'off' }, { value: 'agent on', hint: 'every chat of this agent' }, { value: 'agent off' }]),
    run: async (args, ctx) => {
      const a = String(args || '').trim().toLowerCase();
      const agent = H.agent(ctx.agentId);
      if (a.startsWith('agent')) {
        if (!agent || agent.mode !== 'native') return 'Run it in a chat.';
        const on = !/off/.test(a);
        const cfg = H.config.agents.find((x) => x.id === agent.id);
        if (on) cfg.captureTools = true; else delete cfg.captureTools;
        await saveConfig();
        return on ? `${agent.name} can capture in every chat (capture_* tools).` : `${agent.name}'s chats no longer get the capture tools (unless you turn them on per chat).`;
      }
      const chat = ctx.chat;
      if (!chat) return 'Run it in a chat.';
      const on = a === 'off' ? false : a === 'on' ? true : !chat.captureTools;
      if (on) chat.captureTools = true; else delete chat.captureTools;
      Native.save(chat);
      return on ? 'This chat\'s AI can now take screenshots, record Hearth and read video frames (from your next message).' : 'Capture tools off for this chat.';
    } });
  reg({ name: 'capture-folder', args: '[open | choose | <path>]', desc: 'Where screenshots and recordings are saved (open it, or choose another folder)', complete: opts([{ value: 'open' }, { value: 'choose' }]),
    run: async (args) => {
      const a = String(args || '').trim();
      if (!a) return `Captures go to \`${(await Capture.info()).dir}\`.`;
      if (a === 'open') { window.hub.fs.open((await Capture.info()).dir); return null; }
      if (a === 'choose') { const p = await Capture.chooseFolder(); return p ? `Captures go to \`${p}\`.` : null; }
      H.config.settings = { ...H.config.settings, captureDir: a }; await saveConfig(); return `Captures go to \`${a}\`.`;
    } });
  reg({ name: 'record-presets', args: '[preset]', desc: 'Recording presets (Promo, Reel 9:16, Tutorial, YouTube…): pick the default, or record with one', complete: opts(D.RECORD.map((p) => ({ value: p.id, hint: p.label }))),
    run: async (args) => {
      const a = String(args || '').trim().toLowerCase();
      if (a) { const p = D.RECORD.find((x) => x.id === a); if (!p) return 'Unknown preset.'; Capture.setPref('rec', 'preset', p.id); return `Default recording: ${p.label}.`; }
      return D.RECORD.map((p) => `- **${p.id}**${Capture.prefs.rec.preset === p.id ? ' (default)' : ''}: ${p.label}`).join('\n');
    } });
  reg({ name: 'capture-help', args: '', desc: 'Everything capture can do, with its keys and commands', run: async () => [
    `**Capture** (one menu: ${M}+Alt+S, or ⋯ in the rail → Capture)`,
    `- Screenshot: \`/shot tool\` · \`/shot transcript\` (the whole chat) · \`/shot lab\` (full size) · \`/shot region\` (${M}+Alt+A) · add \`9:16\`, \`clean\`, \`norail\`, \`pretty\`, \`copy\`, \`annotate\`, \`attach\``,
    `- Record: \`/record\` (${M}+Alt+R; ${M}+Alt+P pauses) · \`/record promo\` · \`/record lab 9:16 60fps\` · \`/record mark drop\` · the REC light is its own little window, never in the picture`,
    '- Tours: `/tour intro` records a scripted walkthrough hands-free; `/tour edit` · `/tour steps`',
    `- Captures: \`/captures\` (${M}+Alt+V) · \`/annotate\` · \`/beautify\` · \`/crop-shot 4:5\` · drag a capture into a chat or another app`,
    '- Read any video: `/frames last sheet` · `/frame-at f120` · `/scenes` · `/contact open 5x4` · `/pacing` · `/motion-curve` · `/frame-palette`',
    '- For the AI: `/capture-tools on` lets this chat\'s Claude / Astra screenshot, record and read frames itself.',
  ].join('\n') });

  // ---------- keys (registered for the keys list; the main ones work anywhere through capturemain.js) ----------
  const K = (keys, what) => Capture.keyAdd({ keys, what });
  K(`${M}+Alt+S`, 'Capture menu (screenshots, recording, tours, captures)');
  K(`${M}+Alt+A`, 'Screenshot of a region you drag (or a thing you click)');
  K(`${M}+Alt+R`, 'Start / stop recording Hearth');
  K(`${M}+Alt+P`, 'Pause / resume the recording');
  K(`${M}+Alt+V`, 'Your captures');
  K(`${M}+Alt+T`, 'Tours: pick one / stop the running one');
  K('Esc', 'Stops a running tour');
  K('Shift (drag a region)', 'Keep the ratio of the chosen social frame');
  K('Alt (drag a region)', 'Draw the region from its center');
  K('Space (drag a region)', 'Move the region while dragging');
  K(`${M}+release (drag a region)`, 'Keep adjusting: arrows move, Alt+arrows resize, Enter takes it');
  K('Click (region picker)', 'Capture the thing under the pointer');
  K('← / → (player)', 'One frame back / on (Shift: 10)');
  K(', / . (player)', 'One frame back / on');
  K('Space / K (player)', 'Play / pause');
  K('J / L (player)', 'Half a second back / play faster');
  K('Home / End (player)', 'First / last frame');
  K('M (player)', 'Next recording marker');
  K('R (player)', 'Read frames: contact sheet, scenes, motion…');
  K('C (player)', 'Copy the frame on screen');
  K('S (player)', 'Save the frame on screen');
  K('Enter (player)', 'Send the frame on screen to the chat');
  K('Right-click (speed button)', 'Pick a playback speed');
  K('I / O (player)', 'Set the start / end of a part (for Make…: a GIF, a trim, a loop)');
  K('X (player)', 'Clear the I / O part');
  K('G (player)', 'A GIF of the I / O part (or of the whole video)');
  K('Wheel / double-click (picture)', 'Zoom / fit');
  K('A (picture)', 'Annotate');
  K('C (picture)', 'Copy');
  K('Enter (picture)', 'Attach to the chat');
  for (const t of D.TOOLS) K(`${t.key} (annotate)`, t.label);
  K('1–9, 0 (annotate)', 'Colors');
  K('[ / ] (annotate)', 'Thinner / thicker');
  K('Shift (annotate)', 'Straight lines at 45°, square boxes');
  K(`${M}+Z / ${M}+Shift+Z (annotate)`, 'Undo / redo');
  K(`${M}+S (annotate)`, 'Save as a new picture');
  K(`${M}+C (annotate)`, 'Copy the result');
  K('Delete (annotate)', 'Remove the selected shape');
  K('Double-click text (annotate)', 'Edit the text');
  K('Double-click (captures)', 'Open');
  K('Alt+click (captures)', 'Attach to the chat');
  K('Right-click (captures, frames, player)', 'Everything for that capture: copy, chat, Video Review, editor, Lab, read frames, beautify, social frame…');
  K('Drag (captures, frames)', 'Into a chat, the board, Finder / Explorer or another app as a real file');

  // ---------- palette (Ctrl+K) ----------
  const act = (label, fn, keys) => AppUI.addAction?.(`Capture: ${label}`, () => Promise.resolve().then(fn).catch(fail), keys);
  act('screenshot of this tool', () => Capture.shot({ target: 'tool' }));
  act('screenshot of the whole window', () => Capture.shot({ target: 'window' }));
  act('screenshot of a region…', () => Capture.shot({ target: 'region' }), `${M}+Alt+A`);
  act('the whole chat as one tall picture', () => Capture.shot({ target: 'transcript' }));
  act('the Lab preview at full size', () => Capture.shot({ target: 'lab' }));
  act('beautified screenshot for a post', () => Capture.shot({ target: 'window', beautify: 'forge', clean: true }));
  act('screenshot in 9:16', () => Capture.shot({ target: 'tool', crop: '9:16' }));
  act('record Hearth / stop', () => Capture.toggleRecord(), `${M}+Alt+R`);
  act('record a region…', () => Capture.record({ target: 'region' }));
  act('pause / resume the recording', () => (Capture.status().paused ? Capture.resume() : Capture.pause()), `${M}+Alt+P`);
  act('your captures', () => CaptureView.library(), `${M}+Alt+V`);
  act('read frames of a video', () => FrameRead.pickAndRead());
  act('tours (hands-free recordings)', () => CaptureTour.picker(), `${M}+Alt+T`);
  act('make a GIF of the newest recording', async () => { const f = await FrameRead.resolveFile('last'); if (!f) throw new Error('No recording yet'); return FrameRead.edit(f, 'gif', { fps: 15 }); });
  act('PNG frames of the newest recording (for After Effects)', async () => { const f = await FrameRead.resolveFile('last'); if (!f) throw new Error('No recording yet'); return FrameRead.edit(f, 'sequence', {}); });
  act('the newest recording in 9:16', async () => { const f = await FrameRead.resolveFile('last'); if (!f) throw new Error('No recording yet'); return FrameRead.edit(f, 'reframe', { w: 1080, h: 1920, fit: 'fit' }); });
  act('the capture menu', () => Capture.menu(Math.max(8, innerWidth / 2 - 130), 90, Capture.mainItems()), `${M}+Alt+S`);

  // ---------- the one entry on screen: "Capture" in the rail's ⋯ menu (a hidden rail button it clicks) ----------
  function railEntry() {
    if (document.getElementById('capture-btn')) return;
    const anchor = document.getElementById('config-btn');
    if (!anchor) return;
    const btn = el('button', { class: 'tool-btn', id: 'capture-btn', hidden: true, text: '◉', title: 'Capture', dataset: { feature: 'Capture' } });
    btn.addEventListener('click', () => { const r = (document.getElementById('rail-more') || anchor).getBoundingClientRect(); Capture.menu(r.right + 6, Math.max(8, r.top - 200), Capture.mainItems()); });
    anchor.before(btn);
    if (typeof Simplify !== 'undefined' && Array.isArray(Simplify.TUCKED) && !Simplify.TUCKED.some(([id]) => id === 'capture-btn')) Simplify.TUCKED.push(['capture-btn', `◉ Capture: screenshot, record, tours  ${M}+Alt+S`]);
  }
  addEventListener('DOMContentLoaded', railEntry);
  railEntry();

  // ---------- the agents' tools (mcp/capture-mcp.js → gamebridge.js → here) ----------
  // pictures go back inline (small JPEGs both Claude and Astra can see) and as paths
  async function inline(paths, { max = 4, long = 1024 } = {}) {
    const out = [];
    for (const p of paths.filter(Boolean).slice(0, max)) {
      try {
        const img = await Capture.loadImage(p);
        const k = Math.min(1, long / Math.max(img.naturalWidth, img.naturalHeight));
        const c = el('canvas', { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out.push({ data: c.toDataURL('image/jpeg', 0.82).split(',')[1], mime: 'image/jpeg' });
      } catch { /* a missing picture is skipped */ }
    }
    return out;
  }
  async function handle(tool, a) {
    if (tool === 'capture_shot') {
      const target = Capture.targetId(a.target || 'window') || 'window';
      if (target === 'region' || target === 'element') return { ok: false, error: 'region / element need the owner\'s mouse: use selector (CSS) or a named target.' };
      const r = await Capture.shot({ target, selector: a.selector || undefined, crop: a.crop || '', clean: a.clean !== false, quiet: true, full: target === 'lab' ? true : undefined, lastN: a.last || 0 });
      return { ok: true, value: { path: r.path, size: `${r.w}×${r.h}`, target }, ...(a.see === false ? {} : { images: await inline([r.path], { max: 1, long: a.target === 'transcript' ? 1568 : 1024 }) }) };
    }
    if (tool === 'capture_record') {
      const act = String(a.action || 'status');
      if (act === 'status') return { ok: true, value: Capture.status() };
      if (act === 'pause') return { ok: true, value: Capture.pause() };
      if (act === 'resume') return { ok: true, value: Capture.resume() };
      if (act === 'mark') { const m = Capture.mark(a.label || ''); return m ? { ok: true, value: m } : { ok: false, error: 'Not recording.' }; }
      if (act === 'stop') { if (!Capture.recording) return { ok: false, error: 'Not recording.' }; return { ok: true, value: await Capture.stop({ quiet: true }) }; }
      if (act === 'tour') {
        const r = await CaptureTour.run(a.steps ? String(a.steps) : String(a.name || ''), { name: a.name || 'from chat' });
        return { ok: true, value: { steps: r.steps, recording: r.recording?.path || null, duration: r.recording?.duration, shots: r.shots, skipped: r.skipped, aborted: r.aborted } };
      }
      if (act === 'start') {
        if (Capture.recording) return { ok: false, error: 'Already recording: stop first.' };
        const target = Capture.targetId(a.target || 'window') || 'window';
        if (target === 'region' || target === 'element') return { ok: false, error: 'region / element need the owner\'s mouse: use selector or a named target.' };
        const s = await Capture.record({ target: a.selector ? `selector:${a.selector}` : target, preset: a.preset, fps: a.fps, size: a.size, audio: a.sound, countdown: 0, mp4: a.mp4 });
        const secs = Number(a.seconds) || 0;
        if (secs > 0) { await new Promise((r) => setTimeout(r, Math.min(600, secs) * 1000)); if (Capture.recording) return { ok: true, value: await Capture.stop({ quiet: true }) }; }
        return { ok: true, value: s };
      }
      return { ok: false, error: 'action: start, stop, status, pause, resume, mark or tour' };
    }
    if (tool === 'capture_frames') {
      const file = await FrameRead.resolveFile(a.path || 'last');
      if (!file) return { ok: false, error: 'No video: give a path ("last" = the newest recording, "open" = Video Review\'s).' };
      if (String(a.mode) === 'make') {
        const e = D.EDITS.find((x) => x.id === a.op || x.op === a.op);
        if (!e) return { ok: false, error: `op: ${[...new Set(D.EDITS.map((x) => x.op || x.id))].join(', ')}` };
        const r = await FrameRead.edit(file, e.op || e.id, { ...(e.args || {}), ...(a.from != null ? { from: a.from } : {}), ...(a.to != null ? { to: a.to } : {}), ...(a.width ? { width: a.width } : {}) }, { quiet: true });
        return { ok: true, value: { made: r.path, ...(r.files ? { files: r.files } : {}) } };
      }
      const mode = FrameRead.modeOf(a.mode || 'sheet');
      if (!mode) return { ok: false, error: `mode: ${D.READ_MODES.map((m) => m.id).join(', ')}` };
      const args = { ...a };
      if (mode === 'at' && !a.times && !a.frames) args.times = [0];
      const r = await FrameRead.read(file, mode, args);
      const pics = (r.images || []).map((x) => x.path);
      const see = a.see !== false && pics.length;
      // many frames: the model sees one labelled sheet instead of each picture
      let images = [];
      if (see) images = pics.length > 6 && mode !== 'sheet' ? await inline([(await FrameRead.sheet(file, { layout: pics.length > 12 ? '5x4' : '4x3', width: 1600 })).path], { max: 1, long: 1568 }) : await inline(pics, { max: 6, long: pics.length > 1 ? 768 : 1280 });
      return { ok: true, value: { video: file, text: r.text }, images };
    }
    if (tool === 'capture_list') {
      const list = await window.hub.capture.list({ kind: a.kind || 'all', limit: Math.min(50, a.limit || 12) });
      return { ok: true, value: list.map((x) => `${x.kind === 'video' ? '🎬' : '📷'} ${x.path} · ${fmtBytes(x.size)} · ${timeAgo(x.mtime)}`).join('\n') || 'No captures yet.' };
    }
    return { ok: false, error: `Unknown capture tool ${tool}` };
  }
  HubBridge.register(['capture_'], handle);
  window.CaptureCmds = { shotArgs, recArgs, handle, inline, isShotArgs };
})();
