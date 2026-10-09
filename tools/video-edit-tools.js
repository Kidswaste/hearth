// The video editor for the agents (Claude and Astra): video_edit_read, video_edit_frame and video_edit (MCP tools
// in mcp/video-mcp.js, routed here by HubBridge's longest prefix 'video_edit'). The agent reads the edit as
// compact text (timecodes, clips, transitions, layers, titles, keyframes, markers with notes), looks at any exact
// frame of the composited program, and changes the edit one undo step at a time through the same functions the
// owner's clicks and chat commands use (tools/video-cut.js). Results stay short (token frugality).
const VideoEditTools = (() => {
  const C = CutData;
  const FX = EditFX;
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const r3 = (x) => Math.round(Number(x) * 1000) / 1000;
  async function ready() {
    await Review.ensureMounted();
    if (!VideoCut.active) {
      if (!Review.current && !VideoCut.sequences().length) throw new Error('No video is open and there is no sequence. video_list + video_open, or video_edit { op: "new", name } / { op: "template", template }.');
      if (Review.current) await Review.waitReady();
      const ok = Review.current ? await VideoCut.enter() : await VideoCut.enter({ path: VideoCut.sequences()[0].key });
      if (!ok) throw new Error('The editor could not open.');
    }
    return VideoCut;
  }
  const F = () => VideoCut.fps;
  const tc = (t) => VideoData.tc(t, F());
  // seconds, "00:00:04:12", "f120", "1:02.5" → seconds
  function T(v, def = null) {
    if (v == null || v === '') return def;
    if (typeof v === 'number') return v;
    const t = VideoData.parseTime(String(v), F(), VideoCut.time, C.total(VideoCut.edit));
    if (t == null) throw new Error(`Can't read the time "${v}" (seconds, 00:00:04:12 or f120).`);
    return t;
  }
  // clip: 3 (main track, 1-based), "V2.1" / "T1.2" (track.item), an id; none = the selection / under the playhead
  function ids(clip) {
    const e = VideoCut.edit;
    const list = clip == null || clip === '' ? [] : [].concat(clip);
    const out = [];
    for (const c of list) {
      if (typeof c === 'number' || /^\d+$/.test(String(c))) { const x = e.clips[Number(c) - 1]; if (!x) throw new Error(`No clip ${c}; the main track has ${e.clips.length}.`); out.push(x.id); continue; }
      const m = /^([VTA]\d+)\.(\d+)$/i.exec(String(c));
      if (m) { const k = (e.tracks || []).find((x) => x.name.toLowerCase() === m[1].toLowerCase()); const it = k?.items[Number(m[2]) - 1]; if (!it) throw new Error(`No ${c}.`); out.push(it.id); continue; }
      if (C.find(e, String(c))) out.push(String(c)); else throw new Error(`No clip ${c}.`);
    }
    if (out.length) return out;
    if (VideoCut.selection.length) return VideoCut.selection;
    const x = C.at(e, Math.min(VideoCut.time, Math.max(0, C.mainTotal(e) - 1e-4)));
    if (x) return [x.clip.id];
    throw new Error('Name a clip (clip: 3 or "V2.1").');
  }
  const preset = (list, q, what) => { const p = FX.find(list, q); if (!p) throw new Error(`Unknown ${what} "${q}". video_edit_read { what: "presets", kind: "${what}" } lists them.`); return p; };
  async function pathOf(q) {
    const s = String(q || '');
    if (/^([a-z]:)?[\\/]/i.test(s) && (await window.hub.fs.stat(s))) return s;
    const v = VideoCmds.findVideo(s);
    if (v) return v.path;
    throw new Error(`No file or library video "${s}" (video_list).`);
  }
  // ---------- reading ----------
  function readEdit({ what = 'all', kind, search } = {}) {
    const e = VideoCut.edit; const s = VideoCut.frameSize();
    if (what === 'presets') {
      const map = { transition: FX.TRANSITIONS, look: FX.LOOKS, effect: FX.EFFECTS, sound: FX.AUDIO_FX, title: FX.TITLE_STYLES, anim: FX.TITLE_ANIMS, lower: FX.LOWER_THIRDS, motion: FX.MOTIONS, ramp: FX.RAMPS, format: FX.FORMATS, template: FX.TEMPLATES, export: [...VideoData.EXPORT_PRESETS, ...FX.EXPORTS], easing: FX.EASES, blend: FX.BLENDS, adjust: FX.ADJ };
      const k = String(kind || '').replace(/s$/, '');
      if (!map[k]) return `kinds: ${Object.keys(map).join(', ')}`;
      const q = String(search || '').toLowerCase();
      return map[k].filter((x) => !q || x.id.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)).map((x) => `${x.id}${x.group ? ` (${x.group})` : ''}`).join(', ');
    }
    const head = `${VideoCut.path?.startsWith('seq:') ? `sequence ${VideoCut.path.slice(4)}` : base(VideoCut.path)} · ${s.W}x${s.H} · ${r3(s.F)} fps · ${tc(C.total(e))} (${r3(C.total(e))} s) · playhead ${tc(VideoCut.time)} f${C.frameOf(VideoCut.time, s.F)}${e.mark ? ` · in–out ${tc(e.mark.a)}–${tc(e.mark.b)}` : ''}${VideoCut.selection.length ? ` · selected ${VideoCut.selection.length}` : ''}`;
    const lines = [head];
    const all = VideoCut.describeAll();
    const mainN = e.clips.length;
    if (what === 'all' || what === 'clips') lines.push('V1:', ...all.slice(0, mainN).map((l) => `  ${l}`));
    if (what === 'all' || what === 'tracks') lines.push(...all.slice(mainN));
    if (what !== 'markers') {
      const keyed = [...e.clips.map((c, i) => [String(i + 1), c]), ...(e.tracks || []).flatMap((k) => k.items.map((x, j) => [`${k.name}.${j + 1}`, x]))].filter(([, c]) => c.keys);
      if (keyed.length) lines.push('keyframes (t from the clip start):', ...keyed.map(([n, c]) => `  ${n}: ${Object.entries(c.keys).map(([p, l]) => `${p} ${l.map((k) => `${r3(k.t)}s=${r3(k.v)}${k.ease && k.ease !== 'ease' ? `/${k.ease}` : ''}`).join(' ')}`).join('; ')}`));
    }
    if ((what === 'all' || what === 'markers') && e.markers.length) lines.push('markers:', ...e.markers.map((m, i) => `  ${i + 1}. ${tc(m.t)} ${m.label || ''}${m.note ? ` — ${m.note}` : ''}`));
    return lines.join('\n');
  }
  async function frame({ frame: n, time, width = 720 } = {}) {
    if (n != null) await VideoCut.goFrame(Number(n)); else if (time != null) await VideoCut.goto(T(time));
    const im = await VideoComp.frameImage(VideoCut.time, { maxW: Math.max(160, Math.min(1280, Number(width) || 720)), edit: VideoCut.edit, q: 0.82 });
    const fr = C.frameOf(VideoCut.time, F());
    const checks = im.checks.map((x) => `${base(x.src)} f${x.got}${x.got === x.want ? '' : ` (want f${x.want})`}`).join(', ');
    return { image: { data: im.url.split(',')[1], mime: 'image/jpeg' }, text: `frame f${fr} · ${tc(VideoCut.time)} · ${im.w}x${im.h}${checks ? ` · layers: ${checks}` : ''}` };
  }
  // ---------- changing ----------
  const HELP = `ops (one undo step each; clip = 3 or "V2.1"; times in s, "00:00:04:12" or "f120"):
open {path?|sequence?} · new {name, format?} · template {template, keep?} · format {format: 9:16|4:5|1:1|16:9|WxH|source, fps?}
add {kind: video|overlay|image|audio|title|lower|color, path?, text?, at?, dur?, from?, to?, style?, anim?, out?, track?, main?} (video = main track; overlay/image/title above)
split {at?, all?} · trim {clip?, edge: in|out, at?} · move {clip, at?|to (main-track position)} · delete {clip?, ripple?} · roll|slip|slide {clip?, frames}
transition {clip?|all, type|off, dur?} · look {clip?, look|off, amt?} · effect {clip?, effect|off, amt? (0 removes)} · sound {clip?, effect|off, on?} · adjust {clip?, prop, value} · keyframe {clip?, prop: opacity|x|y|scale|rotate|volume, value?, at?, ease?}
motion {clip?, preset} · speed {clip?, value} · ramp {clip?, preset} · reverse {clip?, on?} · set {clip?, props: {opacity, scale, x, y, rotate, volume, blend, mute, fadeIn, fadeOut, text, style, anim, out}}
marker {at?, label?, note?, color?} · range {in, out}|{off} · select {clip} · undo · redo · render {preset?, fit?} · command {line: "/chat-command …"}
presets: video_edit_read {what:"presets", kind}`;
  async function op(a) {
    const o = String(a.op || '').toLowerCase();
    if (o === 'help') return HELP;
    if (o === 'new') { await Review.ensureMounted(); const key = await VideoCut.newSequence(a.name || 'Sequence', { format: a.format || '9:16', template: a.template ? preset(FX.TEMPLATES, a.template, 'template').id : null }); return `new sequence ${key.slice(4)} · ${readEdit({ what: 'clips' }).split('\n')[0]}`; }
    if (o === 'open') {
      await Review.ensureMounted();
      if (a.sequence) { const s = VideoCut.sequences().find((x) => x.name.toLowerCase() === String(a.sequence).toLowerCase()); if (!s) throw new Error(`No sequence ${a.sequence}.`); await VideoCut.enter({ path: s.key }); return readEdit({ what: 'clips' }); }
      if (a.path) { const p = await pathOf(a.path); if (VideoCut.active) VideoCut.leave(); await Review.open(p); await Review.waitReady(); }
      await ready(); return readEdit({ what: 'clips' });
    }
    if (o === 'template' && !VideoCut.active && !Review.current) { await Review.ensureMounted(); const t = preset(FX.TEMPLATES, a.template, 'template'); await VideoCut.newSequence(t.name, { template: t.id, format: t.fmt }); return `sequence ${t.name} from the template · ${tc(C.total(VideoCut.edit))}`; }
    await ready();
    const cut = VideoCut;
    const sum = () => `${cut.edit.clips.length} clips${(cut.edit.tracks || []).length ? `, ${(cut.edit.tracks || []).reduce((n, k) => n + k.items.length, 0)} layers` : ''} · ${tc(C.total(cut.edit))}`;
    switch (o) {
      case 'template': { const t = preset(FX.TEMPLATES, a.template, 'template'); cut.applyTemplate(t.id, { keep: Boolean(a.keep) }); return `template ${t.name} · ${sum()}`; }
      case 'format': { const s = cut.setFormat(a.format === 'source' ? null : a.format, a.fps); return `format ${s.W}x${s.H} ${s.F} fps`; }
      case 'add': {
        const at = T(a.at, cut.time); const k = String(a.kind || (a.text ? 'title' : 'video'));
        if (k === 'title') { const id = cut.addTitleItem(String(a.text || 'Title').replace(/\\n/g, '\n'), { at, dur: Number(a.dur) || 3, style: a.style || 'bold', anim: a.anim || 'fade-up', out: a.out || 'fade', track: a.track || null }); return `title ${id ? 'added' : 'failed'} at ${tc(at)} · ${sum()}`; }
        if (k === 'lower') { cut.addTitleItem(String(a.text || 'Name\nRole').replace(/\\n/g, '\n'), { at, dur: Number(a.dur) || 4, lower: a.style || a.preset || 'bar-gold' }); return `lower third at ${tc(at)}`; }
        if (k === 'color') { cut.addColor(a.color || '#000000', { at, dur: Number(a.dur) || 2, main: a.main !== false }); return `color at ${tc(at)} · ${sum()}`; }
        const p = await pathOf(a.path);
        if (k === 'video' && a.track == null) { const mode = a.mode || (a.at != null ? 'insert' : 'append'); if (mode === 'overwrite') await cut.overwriteClip(p, { a: Number(a.from) || 0, b: a.to != null ? Number(a.to) : null, at }); else if (mode === 'insert') await cut.insertClip(p, { a: Number(a.from) || 0, b: a.to != null ? Number(a.to) : null, at }); else await cut.addClip(p, { a: Number(a.from) || 0, b: a.to != null ? Number(a.to) : null }); return `${base(p)} on the main track (${mode}) · ${sum()}`; }
        if (k === 'image') { await cut.addImage(p, { at, dur: Number(a.dur) || 3, main: Boolean(a.main) }); return `still ${base(p)} at ${tc(at)} · ${sum()}`; }
        if (k === 'audio') { await cut.addAudio(p, { at: T(a.at, 0), a: Number(a.from) || 0, b: a.to != null ? Number(a.to) : null, volume: a.volume ?? 1 }); return `audio ${base(p)} · ${sum()}`; }
        await cut.addOverlay(p, { at, a: Number(a.from) || 0, b: a.to != null ? Number(a.to) : null, track: a.track || null }); return `overlay ${base(p)} at ${tc(at)} · ${sum()}`;
      }
      case 'split': { const at = T(a.at, cut.time); if (a.all) { await cut.goto(at); cut.splitAll(); } else cut.split(at); return `split at ${tc(at)} · ${sum()}`; }
      case 'trim': { const [id] = ids(a.clip); if (a.at != null) await cut.goto(T(a.at)); cut.selectIds([id]); cut.trimTo(a.edge === 'out' ? 'out' : 'in'); return `trimmed · ${sum()}`; }
      case 'move': {
        const [id] = ids(a.clip); const f = C.find(cut.edit, id);
        if (f.where === 'item') { cut.commit(C.moveItem(cut.edit, id, T(a.at, f.clip.start), a.track ? (cut.edit.tracks || []).find((k) => k.name === a.track)?.id : undefined), 'Moved'); return `moved to ${tc(T(a.at, f.clip.start))}`; }
        const to = Number(a.to); if (!(to >= 1)) throw new Error('to: the new position (1 = first).'); cut.move(f.i, to > f.i + 1 ? to : to - 1); return `clip now at ${to} · ${sum()}`;
      }
      case 'delete': { cut.selectIds(ids(a.clip)); cut.del(a.ripple !== false); return `deleted · ${sum()}`; }
      case 'roll': { const [id] = ids(a.clip); const i = cut.edit.clips.findIndex((c) => c.id === id); cut.commit(C.roll(cut.edit, i, Number(a.frames) / F()), 'Rolled'); return `rolled ${a.frames} frames`; }
      case 'slip': { cut.commit(C.slip(cut.edit, ids(a.clip), Number(a.frames) / F()), 'Slipped'); return `slipped ${a.frames} frames`; }
      case 'slide': { const [id] = ids(a.clip); cut.commit(C.slide(cut.edit, id, Number(a.frames) / F()), 'Slid'); return `slid ${a.frames} frames`; }
      case 'transition': {
        const off = !a.type || a.type === 'off' || a.type === 'cut';
        if (a.all || a.clip === 'all') { const t = off ? null : preset(FX.TRANSITIONS, a.type, 'transition'); cut.commit(C.transAll(cut.edit, t?.id || null, off ? 0 : Number(a.dur) || t.d), 'Transitions'); return `${off ? 'no transitions' : `${t.id} on every cut`} · ${sum()}`; }
        const t = off ? null : preset(FX.TRANSITIONS, a.type, 'transition');
        const r = cut.setTransition(t?.id || null, off ? 0 : a.dur != null ? Number(a.dur) : null, ids(a.clip));
        return r ? `${r.type} ${r.dur}s · ${sum()}` : off ? 'straight cut' : 'needs a clip after a cut';
      }
      case 'look': { const off = !a.look || a.look === 'off'; const l = off ? null : preset(FX.LOOKS, a.look, 'look'); cut.setLook(l?.id || null, ids(a.clip), a.amt != null ? Number(a.amt) : null); return off ? 'look removed' : `look ${l.id}`; }
      case 'effect': { const off = !a.effect || a.effect === 'off'; if (off) { cut.setEffect('off', ids(a.clip)); return 'effects removed'; } const f = preset(FX.EFFECTS, a.effect, 'effect'); cut.setEffect(f.id, ids(a.clip), a.amt != null ? Number(a.amt) : 1); return `effect ${f.id}${a.amt === 0 ? ' removed' : ''}`; }
      case 'sound': { if (a.effect === 'off') { cut.setAudioFx('off', ids(a.clip)); return 'sound effects removed'; } const x = preset(FX.AUDIO_FX, a.effect, 'sound'); cut.setAudioFx(x.id, ids(a.clip), a.on ?? null); return `sound ${x.id} toggled`; }
      case 'adjust': { const k = FX.ADJ.find((x) => x.id === a.prop); if (!k) throw new Error(`prop: ${FX.ADJ.map((x) => x.id).join(', ')}`); cut.adjust(k.id, Number(a.value), ids(a.clip)); return `${k.id} ${a.value}`; }
      case 'keyframe': {
        if (!C.KEY_PROPS.includes(a.prop)) throw new Error(`prop: ${C.KEY_PROPS.join(', ')}`);
        const [id] = ids(a.clip); if (a.at != null) await cut.goto(T(a.at));
        const ease = a.ease ? preset(FX.EASES, a.ease, 'easing').id : 'ease';
        const r = cut.keyHere(a.prop, a.value != null ? Number(a.value) : null, id, ease);
        return r ? `key ${a.prop}=${r3(r.v)} at ${r3(r.t)}s in the clip (${tc(cut.time)})` : 'no key';
      }
      case 'motion': { const m = preset(FX.MOTIONS, a.preset, 'motion'); cut.applyMotion(m.id, ids(a.clip)); return `motion ${m.id}`; }
      case 'speed': { const v = cut.setSpeed(Number(a.value), ids(a.clip)); return v ? `speed ${v}x · ${sum()}` : 'not a video clip'; }
      case 'ramp': { const r = preset(FX.RAMPS, a.preset, 'ramp'); return cut.rampClip(r.id, ids(a.clip)[0]) ? `ramp ${r.id} · ${sum()}` : 'ramps need a main-track video'; }
      case 'reverse': { cut.commit(C.setReverse(cut.edit, ids(a.clip), a.on), 'Reverse'); return 'reverse toggled'; }
      case 'set': {
        const p = a.props || {};
        const allowed = ['opacity', 'scale', 'x', 'y', 'rotate', 'volume', 'blend', 'mute', 'fadeIn', 'fadeOut', 'text', 'style', 'anim', 'out', 'animDur', 'size', 'color', 'fill', 'dur', 'lower', 'align'];
        const bad = Object.keys(p).filter((k) => !allowed.includes(k));
        if (bad.length) throw new Error(`props can be: ${allowed.join(', ')}`);
        cut.commit(C.patchAny(cut.edit, ids(a.clip), (c) => { for (const [k, v] of Object.entries(p)) { if (k === 'color' && typeof v === 'object') continue; c[k] = typeof v === 'string' && k === 'text' ? v.replace(/\\n/g, '\n') : v; } }), 'Changed');
        return `set ${Object.keys(p).join(', ')}`;
      }
      case 'marker': {
        if (a.at != null) await cut.goto(T(a.at));
        cut.marker(a.label || '');
        const m = cut.edit.markers.reduce((x, y) => (Math.abs(y.t - cut.time) < Math.abs(x.t - cut.time) ? y : x));
        const patch = {}; if (a.note) patch.note = String(a.note); if (a.color) patch.color = (FX.MARKER_COLORS.find(([n]) => n === a.color) || [0, a.color])[1];
        if (Object.keys(patch).length) cut.commit(C.patchMarker(cut.edit, m.id, patch), 'Marker');
        return `marker at ${tc(m.t)}`;
      }
      case 'range': { if (a.off) { cut.setMark(null); return 'in–out cleared'; } const m = cut.setMark(T(a.in, 0), T(a.out, C.total(cut.edit))); return m ? `in–out ${tc(m.a)}–${tc(m.b)}` : 'empty range'; }
      case 'select': { const l = cut.selectIds(ids(a.clip)); return `${l.length} selected`; }
      case 'undo': return cut.undo() ? `undone · ${sum()}` : 'nothing to undo';
      case 'redo': return cut.redo() ? `redone · ${sum()}` : 'nothing to redo';
      case 'render': {
        const what = String(a.preset || 'new');
        const job = await cut.exportCut(what === 'record' ? { record: true } : what === 'stills' ? { stills: true } : what === 'new' ? {} : { preset: what, fit: a.fit || 'crop' });
        if (!job) return 'render did not start (ffmpeg missing? then preset "record")';
        const ev = await job.done;
        if (ev.code !== 0) throw new Error(`render failed: ${ev.error || ev.code}`);
        return `rendered ${ev.output}`;
      }
      case 'command': {
        const line = String(a.line || '').trim();
        const name = line.replace(/^\//, '').split(/\s+/)[0];
        const def = Commands.get(name);
        if (!def || !['Video', 'Three.js Lab'].includes(def.area)) throw new Error('Only Video (editor / review) commands run here.');
        let out = ''; let err = '';
        await Commands.tryRun(line.startsWith('/') ? line : `/${line}`, H.claudeAgent()?.id, null, { say: (t) => { out += `${String(t)}\n`; }, note: (t) => { out += `${String(t)}\n`; }, error: (m) => { err = m; }, history: false, source: 'code' });
        if (err) throw new Error(err);
        return out.trim().slice(0, 1500) || 'done';
      }
      default: throw new Error(`Unknown op "${a.op}". video_edit { op: "help" }`);
    }
  }
  async function handle(tool, args = {}) {
    try {
      if (tool === 'video_edit_read') { await ready(); return { ok: true, value: readEdit(args) }; }
      if (tool === 'video_edit_frame') { await ready(); const r = await frame(args); return { ok: true, value: r.text, images: [r.image] }; }
      if (tool === 'video_edit') { const v = await op(args); return { ok: true, value: v }; }
      return { ok: false, error: `Unknown tool ${tool}` };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  HubBridge.register(['video_edit'], handle);
  return { handle, readEdit, HELP };
})();
