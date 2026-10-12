// /lab-export (alias /lx): the Lab's best-quality output from chat (round 22, labexport; tools/three-export.js).
//   /lab-export                         the Export panel
//   /lab-export mp4 4k ss2 60fps        a format, then any of: a size (frame, 1080p, 4k, 8k, 8k-square, a4, poster,
//                                       2x, 3840x2160…), 24–120fps, ss2 / ss3 / ss4 (supersampling), blur / blur16
//                                       (motion blur sub-frames), shutter=180, draft|high|best, 10s | 4bars |
//                                       120frames, at=12.5, seq | scene, alpha | opaque, mute, seed=7
//   /lab-export gif 2bars · loop detect   perfect loops (on the bars, or the loop the frames make)
//   /lab-export still16 a3 · glb · html · preset · sheet 16tiles   stills for print and the scene itself
//   /lab-export load <file.hearth-preset.json>   a preset back onto the scene
//   /lab-export status | pause | resume | cancel | gpu <megapixels> | formats | speed
(() => {
  const X = () => LabExport;
  const C = () => LabExportCore;
  const SUBS = [['formats', 'what it can make'], ['status', 'the render running, its speed'], ['pause', 'pause the export'], ['resume', 'go on'], ['cancel', 'stop it'], ['load', 'load <preset file>: sliders back'], ['gpu', 'gpu <MP>: the GPU memory cap (default 64)'], ['speed', 'frames a second of the last renders']];
  const fmtLine = (f) => `- **${f.id}** · ${f.name}: ${f.tip}`;
  const done = (r) => {
    if (!r) return 'Done.';
    const name = r.path ? r.path.split(/[\\/]/).pop() : '';
    if (r.format === 'glb') return `🧊 ${name}: ${r.meshes} meshes, ${r.triangles.toLocaleString()} triangles${r.animations ? `, ${r.animations} animations` : ''} (at ${r.at.toFixed(2)} s).\n\`${r.path}\``;
    if (r.format === 'html') return `Web page: ${name} (${C().fmtSize(r.size)}, one file, opens offline).${r.notes?.length ? `\n${r.notes.join('\n')}` : ''}\n\`${r.path}\``;
    if (r.format === 'preset') return `Slider preset: ${name} (${r.sliders} sliders on ${r.layers} layer${r.layers === 1 ? '' : 's'}).\n\`${r.path}\``;
    if (r.format === 'sheet') return `Contact sheet: ${name} (${r.tiles} frames, ${r.w}×${r.h}).\n\`${r.path}\``;
    return `⇪ ${name}: ${r.w}×${r.h}, ${r.frames} frame${r.frames === 1 ? '' : 's'} at ${r.fps} fps in ${r.seconds} s (${r.speed} frames/s drawn)${r.size ? `, ${C().fmtSize(r.size)}` : ''}${r.loop ? ` · loop ${r.loop.secs} s${r.loop.natural ? ' (found in the frames)' : r.loop.fade ? `, ${r.loop.fade}-frame cross-fade` : ''}` : ''}${r.capped?.length ? ` · ${r.capped.join(', ')}` : ''}.\n\`${r.path}\``;
  };
  async function run(args) {
    if (typeof ThreeLab !== 'undefined') await ThreeLab.cmd?.({ show: false }).catch(() => null);
    if (typeof LabExport === 'undefined') return 'The Lab isn\'t loaded yet: open the Three.js Lab once.';
    const a = String(args || '').trim();
    const [sub0, ...rest] = a.split(/\s+/);
    const sub = (sub0 || '').toLowerCase();
    if (!sub) { await X().panel(); return undefined; }
    if (sub === 'formats' || sub === 'help') return `The Lab exports (hidden page, frame-exact, seeded):\n${C().FORMATS.map(fmtLine).join('\n')}\nOptions: a size (frame, 1080p, 4k, 8k, 8k-square, a4, a3, poster, 2x, 3840x2160), 24–120fps, ss2–ss4 (supersampling), blur / blur16 (motion blur), shutter=180, draft|high|best, 10s / 4bars / 120frames, at=12.5, seq | scene, alpha | opaque, mute, seed=7.`;
    if (sub === 'status') { const s = X().status(); return s.running ? `⇪ Exporting: frame ${s.running.frames} / ${s.running.total}${s.running.paused ? ' (paused)' : ''}${s.waiting ? ` · ${s.waiting} waiting` : ''}.` : s.last ? `Nothing running. Last: ${done(s.last)}` : 'Nothing exported yet. /lab-export mp4 4k ss2 renders the scene in 4K, supersampled.'; }
    if (sub === 'speed') { const s = X().status().speeds; return s.length ? `Frames a second (drawn + written, last renders):\n${s.map((x) => `- ${x.format} ${x.w}×${x.h}${x.ss > 1 ? ` ss${x.ss}` : ''}${x.blur > 1 ? ` blur ${x.blur}` : ''}: ${x.fps} fps (${x.frames} frames in ${(x.ms / 1000).toFixed(1)} s)`).join('\n')}` : 'No render yet.'; }
    if (sub === 'pause') return X().pause(true) ? '❚❚ Export paused (/lab-export resume).' : 'Nothing is exporting.';
    if (sub === 'resume') return X().pause(false) ? '▶ Export going on.' : 'Nothing is exporting.';
    if (sub === 'cancel' || sub === 'stop') return X().cancel() ? '■ Export cancelled.' : 'Nothing is exporting.';
    if (sub === 'gpu') { if (rest[0]) X().setGpuCap(rest[0]); return `GPU memory cap: ${X().gpuCap()} MP a frame (supersampling steps down to stay under it).`; }
    if (sub === 'load') { const f = rest.join(' ').replace(/^["']|["']$/g, ''); if (!f) return 'Which file? /lab-export load /path/to/scene sliders.hearth-preset.json'; const r = await X().loadPreset(f); return `Preset loaded: ${r.changed} slider${r.changed === 1 ? '' : 's'} moved on ${r.layers} layer${r.layers === 1 ? '' : 's'}.`; }
    const frame = (() => { const z = typeof ThreeSeq !== 'undefined' ? ThreeSeq._S?.L?.stage?.size : null; return z?.w ? { w: z.w, h: z.h } : { w: 1920, h: 1080 }; })();
    const p = C().parse(a, frame);
    if (!p.format) return `Export what? ${C().FORMATS.map((f) => f.id).join(', ')} (/lab-export formats).`;
    const o = { format: p.format, size: p.size, fps: p.fps, ss: p.ss, blur: p.blur, shutter: p.shutter, quality: p.quality, secs: p.secs, bars: p.bars, frames: p.frames, at: p.at, source: p.source, detect: p.detect, sound: p.sound, alpha: p.alpha, seed: p.seed, tiles: p.tiles };
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    const r = await X().render(o);
    return done(r);
  }
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('lab-export')) return;
    Commands.register({
      name: 'lab-export', aliases: Commands.get('lx') ? [] : ['lx'], area: 'Lab',
      args: '[mp4|hevc|prores|webm|png|gif|loop|still|still16|glb|html|preset|sheet] [size] [fps] [ss2] [blur] [draft|high|best] [10s|4bars] [seq] | status | pause | resume | cancel | load <file> | gpu <MP>',
      desc: 'Best-quality Lab output in a hidden page (the Lab stays usable): any size up to 8K, any fps, supersampling, motion blur, ProRes 4444 / WebM / PNG with alpha, perfect-loop GIF / MP4, 16-bit stills; GLB, one-file web page, slider preset, contact sheet',
      keywords: 'export render 4k 8k prores alpha transparent png sequence webm gif loop seamless still print 16-bit supersampling antialias motion blur glb gltf html preset contact sheet master hevc',
      examples: ['/lab-export mp4 4k ss2', '/lab-export prores 60fps blur', '/lab-export gif 2bars', '/lab-export loop detect', '/lab-export still16 a3', '/lab-export glb', '/lab-export sheet 16tiles', '/lab-export png seq'],
      complete: (a) => {
        const w = String(a || '').split(/\s+/);
        if (w.length <= 1) return [...C().FORMATS.map((f) => ({ value: f.id, hint: f.name })), ...SUBS.map(([value, hint]) => ({ value, hint }))].filter((x) => x.value.startsWith((w[0] || '').toLowerCase()));
        const pre = w.slice(0, -1).join(' ');
        const opts = ['1080p', '4k', '8k', '8k-square', 'a3', '2x', '24fps', '30fps', '60fps', 'ss2', 'ss4', 'blur', 'blur16', 'draft', 'best', '10s', '2bars', '4bars', 'seq', 'detect', 'opaque', 'mute'];
        return opts.filter((x) => x.startsWith(w[w.length - 1].toLowerCase())).map((x) => ({ value: `${pre} ${x}` }));
      },
      run,
    });
  }
  // Ctrl/⌘+K
  function actions() {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    const go = (o) => () => ThreeLab.cmd({ show: true }).then(() => X().render(o)).catch((e) => toast(e.message, { type: 'error' }));
    AppUI.addAction('Lab: Export… (4K, ProRes + alpha, loops, stills)', () => ThreeLab.cmd({ show: true }).then(() => X().panel()));
    AppUI.addAction('Lab: Export 4K MP4, supersampled', go({ format: 'mp4', size: '4k', ss: 2 }));
    AppUI.addAction('Lab: Export ProRes 4444 with alpha', go({ format: 'prores' }));
    AppUI.addAction('Lab: Export a perfect-loop GIF', go({ format: 'gif' }));
    AppUI.addAction('Lab: Export a 16-bit still for print', go({ format: 'still16', size: '4x', ss: 2 }));
    AppUI.addAction('Lab: Export the 3D content as GLB', go({ format: 'glb' }));
    AppUI.addAction('Lab: Export the scene as one web page', go({ format: 'html' }));
    AppUI.addAction('Lab: Save the sliders as a preset file', go({ format: 'preset' }));
  }
  function init() { register(); actions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
