// Chat commands for the editor pack (round 11, tools/video-pack.js and tools/video-sound.js). Area "Video"
// (`/help video`). Every one is also in a menu: ⋯ › Pro tools, right-click a clip (Look › LUT, Angle) or an audio
// track (the voice track), ＋ Add here › Adjustment layer, Export › Render queue; Alt+1…9 cut to a multicam angle.
const VideoPackCmds = (() => {
  const AREA = 'Video';
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const opts = (list, args) => { const q = String(args || '').toLowerCase().split(/\s+/).pop(); return list.map((x) => (typeof x === 'string' ? { value: x } : x)).filter((x) => !q || String(x.value).toLowerCase().startsWith(q)).slice(0, 16); };
  const editing = () => CutCmds.editing();
  const P = () => VideoPack;
  const isFile = (s) => /^([a-z]:)?[\\/]/i.test(String(s || '')) || /\.cube$/i.test(String(s || ''));
  const defs = [
    { name: 'duck', aliases: ['ducking'], desc: 'Duck the music under the voice: it dips where someone talks (a track named Voice, the Voice sound effect, else the main track\'s sound)', args: '[db|off]', examples: ['/duck', '/duck -18', '/duck off'],
      complete: (a) => opts(['-6', '-12', '-18', '-24', 'off'], a),
      run: async (args) => { await editing(); const w = words(args); const r = await P().duck({ db: Number(w.find((x) => /^-?\d+/.test(x))) || -12, off: w.includes('off') }); return r.off ? 'Ducking removed.' : `♪ The music dips ${Math.abs(r.db)} dB under ${r.ranges} spoken part${r.ranges === 1 ? '' : 's'} (${r.items} music item${r.items === 1 ? '' : 's'}; volume keyframes you can edit).`; } },
    { name: 'voice-track', desc: 'Mark an audio track as the voice (the music ducks under it)', args: '[track] [on|off]', examples: ['/voice-track A2'],
      complete: (a) => opts([...((VideoCut.edit?.tracks || []).filter((k) => k.type === 'audio').map((k) => k.name)), 'on', 'off'], a),
      run: async (args) => { await editing(); const w = words(args); const k = (VideoCut.edit.tracks || []).find((x) => x.type === 'audio' && w.some((y) => y.toLowerCase() === x.name.toLowerCase())) || (VideoCut.edit.tracks || []).find((x) => x.type === 'audio'); if (!k) return 'No audio track yet (＋ › Music or sound…).'; const on = P().setVoiceTrack(k.id, w.includes('off') ? false : w.includes('on') ? true : null); return `${k.name} ${on ? 'is the voice track' : 'isn\'t the voice track'}.`; } },
    { name: 'lut', aliases: ['cube'], desc: 'A .cube LUT on the selected clips (exact in the render, a close twin in the preview); a name from your LUTs, a file, or off', args: '<file.cube|name|off>', examples: ['/lut ~/LUTs/Kodak.cube', '/lut off'],
      complete: (a) => opts([...P().lutLibrary.map((x) => ({ value: x.name, hint: x.kind })), 'off'], a),
      run: async (args) => {
        await editing(); const s = String(args || '').trim().replace(/^["']|["']$/g, '');
        if (!s) { const r = await P().pickLut(null); return r ? `LUT **${r.name}** on the clip.` : (P().lutLibrary.length ? `Your LUTs: ${P().lutLibrary.map((x) => x.name).join(', ')}` : 'Give a .cube file: /lut <path>'); }
        if (s === 'off') { await P().setLut('off'); return 'LUT removed.'; }
        const path = isFile(s) ? s.replace(/^~(?=[\\/])/, await window.hub.fs.home()) : P().findLut(s)?.path;
        if (!path) return `No LUT “${s}” (/lut with a .cube path imports one).`;
        const r = await P().setLut(path);
        return `LUT **${r.name}** (${r.kind.toUpperCase()}) on the clip: exact in the render; the preview's twin is within ${Math.round(r.previewError * 255)} levels.`;
      } },
    { name: 'adjustment-layer', aliases: ['adjust-layer'], desc: 'An adjustment layer at the playhead (or over in–out): its look, effects and LUT apply to everything under it', args: '[look] [for <secs>]', examples: ['/adjustment-layer teal-orange for 4'],
      complete: (a) => opts(EditFX.LOOKS.slice(0, 40).map((l) => ({ value: l.id, hint: l.name })), a),
      run: async (args) => { await editing(); const w = words(args); const i = w.indexOf('for'); const dur = i >= 0 ? Number(w[i + 1]) || null : null; const look = w.filter((x, j) => x !== 'for' && j !== i + 1)[0] || null; P().addAdjustment({ dur, look }); return `◐ Adjustment layer added${look ? ` (${look})` : ''}: right-click it for a look, effects or a LUT.`; } },
    { name: 'multicam', desc: 'Make a multicam from two or more takes of one moment (the selected clips, or files): synced by their sound; then /angle or Alt+1…9', args: '[files…]', examples: ['/multicam'],
      run: async (args) => { await editing(); const files = String(args || '').match(/"[^"]+"|\S+/g)?.map((x) => x.replace(/^"|"$/g, '')) || []; const a = await P().makeMulticam(files); return `🎥 ${a.length} angles: ${a.map((x, i) => `${i + 1}. ${x.name}${i ? ` (${x.synced ? `${x.offset > 0 ? '+' : ''}${x.offset} s` : 'not synced'})` : ''}`).join(' · ')}. Alt+1…${a.length} (or /angle 2) cuts to one at the playhead.`; } },
    { name: 'angle', desc: 'Cut to a multicam angle at the playhead (Alt+1…9 in the editor)', args: '<n> [at <time>]', examples: ['/angle 2'],
      complete: (a) => opts((VideoCut.edit?.multicam?.angles || []).map((x, i) => ({ value: String(i + 1), hint: x.name })), a),
      run: async (args) => { await editing(); const w = words(args); const i = w.indexOf('at'); const at = i >= 0 ? VideoData.parseTime(w[i + 1], VideoCut.fps, VideoCut.time, CutData.total(VideoCut.edit)) : null; const n = await P().angleAt(Number(w[0]) || 1, { at }); return `🎥 Angle ${w[0] || 1}: ${n}.`; } },
    { name: 'edit-proxy', aliases: ['proxies'], desc: 'Proxies: light copies of heavy files for a smooth preview (renders use the originals): make, all, on, off, clear', args: '[make|all|on|off|clear]', examples: ['/edit-proxy make', '/edit-proxy off'],
      complete: (a) => opts(['make', 'all', 'on', 'off', 'clear'], a),
      run: async (args) => {
        const v = words(args)[0] || 'make';
        if (v === 'on' || v === 'off') return `Proxies ${P().setProxies(v === 'on') ? 'on: the preview plays the light copies' : 'off: the preview plays the originals'}.`;
        if (v === 'clear') return `${await P().clearProxies()} proxies moved to the Trash.`;
        await editing(); const r = await P().proxyAll({ all: v === 'all' });
        return r.made.length ? `Proxies ready: ${r.made.join(', ')}.` : `No heavy files here (${r.skipped.length} light enough); /edit-proxy all makes them anyway.`;
      } },
    { name: 'render-queue', aliases: ['export-queue'], desc: 'The render queue: add renders of this edit (presets), run them one after another, list, clear', args: '[add <preset…>|run|list|clear]', examples: ['/render-queue add reels square', '/render-queue run'],
      complete: (a) => opts(['add', 'run', 'list', 'clear', ...VideoData.EXPORT_PRESETS.map((p) => ({ value: p.id, hint: p.name }))], a),
      run: async (args) => {
        const w = words(args); const v = w[0] || 'list';
        if (v === 'add') { await editing(); const n = P().queueAdd(w.slice(1).length ? w.slice(1) : [null]); return `${n} render${n === 1 ? '' : 's'} waiting: /render-queue run.`; }
        if (v === 'run') { const r = await P().queueRun(); return r.running ? 'The queue is already rendering.' : `Rendered ${r.done.length}${r.failed.length ? `; failed: ${r.failed.join('; ')}` : ''}.`; }
        if (v === 'clear') { const n = P().queueClear(w[1] === 'all'); return `${n} left in the queue.`; }
        const q = P().queueList(); return q.length ? q.map((x) => `${{ waiting: '◌', rendering: '◔', done: '✓', failed: '✕' }[x.state]} ${x.name} · ${x.preset || 'new version'}${x.error ? ` (${x.error})` : ''}`).join('\n') : 'The queue is empty: /render-queue add reels.';
      } },
    { name: 'cut-to-vibe', aliases: ['vibe-cuts'], desc: 'Suggest cuts paced like the mood board\'s clips (their seconds per shot), on the music\'s beats; Enter applies', args: '[board]', examples: ['/cut-to-vibe'],
      run: async (args) => { await editing(); const r = await P().cutToVibe({ board: String(args || '').trim() || null }); return r.cuts ? `✂ ${r.cuts} cuts suggested at ≈${r.pace} s a shot (${r.clips ? `from ${r.clips} board clip${r.clips === 1 ? '' : 's'}` : 'from the board\'s motion'}${r.beats ? ', on the beats' : ''}): Enter (or /cut-auto apply) makes them.` : 'No new cuts at that pacing.'; } },
    { name: 'chapters-to-markers', aliases: ['chapters'], desc: 'The chapters of the recordings in this edit (capture markers) become editor markers', run: async () => { await editing(); const n = await P().chaptersToMarkers(); return n ? `◆ ${n} marker${n === 1 ? '' : 's'} from the recordings' chapters.` : 'No chapters on these clips (capture marks them while recording: /rec mark, and a chapter at every tool or chat change).'; } },
    { name: 'preview-sound', desc: 'Hear sound effects, reversed sound and audio tracks in the editor preview (on by default), or only the decoders\' clean sound', args: '[on|off|status]', complete: (a) => opts(['on', 'off', 'status'], a),
      run: async (args) => { const v = words(args)[0]; if (v === 'status') { const s = VideoSound.status(); return `Preview sound ${s.enabled ? 'on' : 'off'} · ${s.voices} effect voice${s.voices === 1 ? '' : 's'} · ${s.items} audio item${s.items === 1 ? '' : 's'} playing · ${s.decoded} decoded${s.failed.length ? ` · couldn't decode ${s.failed.length}` : ''}`; } const on = VideoSound.setEnabled(v === 'on' ? true : v === 'off' ? false : null); return on ? 'Preview sound on: sound effects and audio tracks are heard while you edit.' : 'Preview sound off: the decoders\' clean sound only (effects are still in the render).'; } },
  ];
  function registerAll() {
    for (const d of defs) {
      if (Commands.get(d.name)) continue;
      Commands.register({ area: AREA, ...d, aliases: (d.aliases || []).filter((a) => !Commands.get(a)) });
    }
    try {
      Keys.add({ area: 'Video editor', keys: 'Alt+1…9', what: 'Cut to multicam angle 1…9 at the playhead (/angle)' });
    } catch { /* keys list is optional */ }
  }
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();
  return { defs };
})();
