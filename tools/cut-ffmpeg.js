// The ffmpeg render of a full edit (Video Review ✂ editor): the main track with its transitions (xfade /
// acrossfade), keyframed position / scale / rotation / opacity / volume, color looks, reverse, stills and colors,
// then every overlay track on top (overlay, or blend modes), titles as PNG frame sequences drawn by the same code
// that draws the preview (tools/video-comp.js), audio tracks mixed in, and the export preset at the end.
// Plain cut-only edits keep using CutData.ffmpegArgs (tools/cut-data.js); this file takes the rest.
// No DOM: loads in Node for tests (module.exports at the bottom).
const CutFF = (() => {
  const C = typeof CutData !== 'undefined' ? CutData : require('./cut-data.js');
  const FX = typeof EditFX !== 'undefined' ? EditFX : require('./cut-presets.js');
  const num = (x) => String(Number(Number(x).toFixed(4)));
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const q = (s) => `'${s}'`; // quote an expression for the filter graph (keeps its commas)

  // Titles drawn as PNG sequences: the renderer writes one PNG per frame for each of these, then passes
  // { [id]: { pattern: '/dir/t_%05d.png', count } } as opts.titles.
  function titleJobs(e) {
    const out = [];
    for (const x of C.layout(e)) if (x.clip.kind === 'title' && (x.clip.style || x.clip.anim || x.clip.lower || !x.clip.img)) out.push({ id: x.clip.id, clip: x.clip, start: x.start, dur: x.end - x.start, where: 'main' });
    for (const k of C.tracksOf(e, 'text').concat(C.tracksOf(e, 'video'))) {
      if (k.hide) continue;
      for (const it of k.items) if (it.kind === 'title') out.push({ id: it.id, clip: it, start: it.start, dur: C.itemDur(it), where: 'item' });
    }
    return out;
  }

  // The picture of a clip fitted (contain) into W×H at scale 1.
  function fitSize(sw, sh, W, H) {
    if (!sw || !sh) return { w: W, h: H };
    const k = Math.min(W / sw, H / sh);
    return { w: even(sw * k), h: even(sh * k) };
  }
  const hasTransform = (c) => Boolean(c.keys && ['opacity', 'x', 'y', 'scale', 'rotate'].some((p) => c.keys[p]?.length)) || (c.opacity != null && c.opacity !== 1) || (c.scale != null && c.scale !== 1) || c.x || c.y || c.rotate;
  // An expression for a clip property over the local time variable tv (keys, else the constant), and its range.
  function propExpr(c, prop, tv, shift = 0) {
    const keys = c.keys?.[prop];
    if (keys?.length) {
      const vals = keys.map((k) => k.v);
      // eased curves can overshoot: sample for the true range
      const lo = Math.min(...vals); const hi = Math.max(...vals);
      let mn = lo; let mx = hi;
      const t0 = keys[0].t; const t1 = keys[keys.length - 1].t;
      for (let i = 0; i <= 60; i += 1) { const v = FX.keyValue(keys, t0 + ((t1 - t0) * i) / 60, lo); mn = Math.min(mn, v); mx = Math.max(mx, v); }
      return { expr: FX.keyExpr(keys, tv, { shift }), anim: true, min: mn, max: mx };
    }
    const v = c[prop] ?? C.KEY_DEF[prop];
    return { expr: num(v), anim: false, min: v, max: v };
  }
  // Filters that turn a clip's picture (any size, rgba) into a layer for overlay, plus the overlay x / y.
  // tvLayer: the layer's own time variable shift (0: the layer starts at 0); tShift: start of the layer on the main
  // timeline (overlay's t).
  function layerFilters(c, srcW, srcH, W, H, tShift) {
    const f = [];
    const fit = fitSize(srcW, srcH, W, H);
    const S = propExpr(c, 'scale', 't');
    const R = propExpr(c, 'rotate', 't');
    const O = propExpr(c, 'opacity', 'T');
    const X = propExpr(c, 'x', 't', tShift);
    const Y = propExpr(c, 'y', 't', tShift);
    if (S.anim) f.push(`scale=w=${q(`max(2,trunc(${fit.w}*(${S.expr})/2)*2)`)}:h=${q(`max(2,trunc(${fit.h}*(${S.expr})/2)*2)`)}:eval=frame`);
    else f.push(`scale=${even(fit.w * Math.max(0.01, S.min))}:${even(fit.h * Math.max(0.01, S.min))}`);
    if (R.anim || Math.abs(R.min) > 1e-3) {
      const big = Math.max(Math.abs(S.max), Math.abs(S.min), 0.01);
      const side = even(Math.hypot(fit.w * big, fit.h * big) + 4);
      f.push(`rotate=a=${q(`(${R.expr})*PI/180`)}:ow=${side}:oh=${side}:c=none`);
    }
    if (O.anim) f.push(`geq=r=${q('r(X,Y)')}:g=${q('g(X,Y)')}:b=${q('b(X,Y)')}:a=${q(`alpha(X,Y)*clip(${O.expr},0,1)`)}`);
    else if (O.min < 0.999) f.push(`colorchannelmixer=aa=${num(clamp(O.min, 0, 1))}`);
    const x = `(W-w)/2+(${X.expr})*W`; const y = `(H-h)/2+(${Y.expr})*H`;
    return { f, x, y, anim: S.anim || R.anim || X.anim || Y.anim };
  }
  const fadeF = (c, d, alpha) => [c.fadeIn > 0 ? `fade=t=in:st=0:d=${num(c.fadeIn)}${alpha ? ':alpha=1' : ''}` : '', c.fadeOut > 0 ? `fade=t=out:st=${num(Math.max(0, d - c.fadeOut))}:d=${num(c.fadeOut)}${alpha ? ':alpha=1' : ''}` : ''].filter(Boolean);
  const afadeF = (c, d) => [c.fadeIn > 0 ? `afade=t=in:st=0:d=${num(c.fadeIn)}` : '', c.fadeOut > 0 ? `afade=t=out:st=${num(Math.max(0, d - c.fadeOut))}:d=${num(c.fadeOut)}` : ''].filter(Boolean);
  const colorF = (c) => FX.colorFilters(FX.colorMath(FX.grade(c.color)));
  function volumeF(c) {
    const V = propExpr(c, 'volume', 't');
    if (V.anim) return [`volume=volume=${q(`max(0,${V.expr})`)}:eval=frame`];
    return Math.abs(V.min - 1) > 1e-3 ? [`volume=${num(Math.max(0, V.min))}`] : [];
  }

  // The full ffmpeg argument list for a rich edit (same contract as CutData.ffmpegArgs).
  //   info: { [src]: { w, h, fps, audio } }   canvas: { w, h, fps }
  //   opts: { preset, fit, offset, range: { a, b }, stills, out, presetFilters, codecArgs, titles: { [id]: { pattern, count } },
  //           xfadeOk (set of xfade names this ffmpeg knows; others fall back to a dissolve) }
  function args(edit, info, canvas, opts = {}) {
    const e = C.normalize(edit);
    const W = even(e.seq?.w || canvas.w); const H = even(e.seq?.h || canvas.h); const F = e.seq?.fps || canvas.fps || 30;
    const out = ['-hide_banner', '-y'];
    const inputs = [];
    const inputOf = (p, extra = []) => { const key = `${p}|${extra.join(' ')}`; let k = inputs.findIndex((x) => x.key === key); if (k < 0) { inputs.push({ key, p, extra }); k = inputs.length - 1; } return k; };
    const parts = [];
    const AF = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
    const silence = (d) => `anullsrc=r=48000:cl=stereo,atrim=duration=${num(d)},asetpts=PTS-STARTPTS`;
    const fitTo = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    const padTo = (d) => `tpad=stop_mode=clone:stop_duration=${num(2 / F)},trim=duration=${num(d)},setpts=PTS-STARTPTS`;
    const norm = `format=yuv420p,setsar=1,fps=${num(F)},settb=AVTB`;
    const mainTotal = C.mainTotal(e);
    const TALL = C.total(e);
    let lab = 0;
    const L = () => `l${(lab += 1)}`;

    // ----- a clip's picture as a raw stream (any size) and its size -----
    function source(c, d) {
      const s = c.speed || 1;
      if (c.kind === 'video') {
        const k = inputOf(c.src);
        const m = info[c.src] || {};
        return { v: `[${k}:v]trim=start=${num(c.in)}:end=${num(c.out)},setpts=PTS-STARTPTS${c.reverse ? ',reverse' : ''},setpts=PTS/${num(s)},fps=${num(F)}`, w: m.w, h: m.h };
      }
      if (c.kind === 'freeze') {
        const k = inputOf(c.src); const m = info[c.src] || {};
        return { v: `[${k}:v]trim=start=${num(c.at)},setpts=PTS-STARTPTS,trim=end_frame=1,fps=${num(F)},tpad=stop_mode=clone:stop_duration=${num(d + 1)},trim=duration=${num(d)},setpts=PTS-STARTPTS`, w: m.w, h: m.h };
      }
      if (c.kind === 'image') {
        const k = inputOf(c.src, ['-loop', '1', '-framerate', num(F), '-t', num(d + 0.5)]); const m = info[c.src] || {};
        return { v: `[${k}:v]fps=${num(F)},trim=duration=${num(d)},setpts=PTS-STARTPTS`, w: m.w, h: m.h };
      }
      if (c.kind === 'title') {
        const t = opts.titles?.[c.id];
        if (t) { const k = inputOf(t.pattern, ['-framerate', num(F), '-start_number', '0']); return { v: `[${k}:v]fps=${num(F)},trim=duration=${num(d)},setpts=PTS-STARTPTS`, w: W, h: H, full: true, alpha: true }; }
        if (c.img) { const k = inputOf(c.img, ['-loop', '1', '-framerate', num(F), '-t', num(d + 0.5)]); return { v: `[${k}:v]fps=${num(F)},trim=duration=${num(d)},setpts=PTS-STARTPTS`, w: W, h: H, full: true }; }
      }
      const col = /^#[0-9a-f]{6}$/i.test(c.fill || c.bg || '') ? `0x${(c.fill || c.bg).slice(1)}` : 'black';
      return { v: `color=c=${col}:s=${W}x${H}:r=${num(F)}:d=${num(d)}`, w: W, h: H, full: true };
    }
    function audioOf(c, d) {
      const s = c.speed || 1;
      if ((c.kind === 'video' || c.kind === 'audio') && !c.mute && (info[c.src]?.audio ?? true)) {
        const k = inputOf(c.src);
        return `[${k}:a]atrim=start=${num(c.in)}:end=${num(c.out)},asetpts=PTS-STARTPTS${c.reverse ? ',areverse' : ''}${C.atempo(s).map((x) => `,${x}`).join('')},${AF},apad,atrim=duration=${num(d)}${[...volumeF(c), ...afadeF(c, d)].map((x) => `,${x}`).join('')}`;
      }
      return null;
    }

    // ----- the main track: one W×H stream per clip -----
    const L0 = C.layout(e);
    const mains = L0.map((x, i) => {
      const c = x.clip; const d = x.end - x.start;
      const src = source(c, d);
      const color = [...colorF(c), ...FX.effectFilters(c.fx, `c${i}`)];
      const v = `mv${i}`; const a = `ma${i}`;
      if (hasTransform(c) || FX.needsAlpha(c.fx)) {
        const lay = layerFilters(c, src.w, src.h, W, H, 0);
        const bg = L(); const ly = L();
        parts.push(`color=c=black:s=${W}x${H}:r=${num(F)}:d=${num(d)}[${bg}]`);
        parts.push(`${src.v}${color.length ? `,${color.join(',')}` : ''},format=rgba,${lay.f.join(',')}[${ly}]`);
        parts.push(`[${bg}][${ly}]overlay=x=${q(lay.x)}:y=${q(lay.y)}:eval=frame:eof_action=pass,${norm},${padTo(d)}${fadeF(c, d).map((f) => `,${f}`).join('')}[${v}]`);
      } else {
        // the look and effects work on the picture itself (then it is fitted into the frame), like the preview
        parts.push(`${src.v}${color.length ? `,${color.join(',')}` : ''}${src.full ? (src.alpha ? `,format=rgba,pad=${W}:${H}:0:0:color=black,format=yuv420p` : '') : `,${fitTo}`},${norm},${padTo(d)}${fadeF(c, d).map((f) => `,${f}`).join('')}[${v}]`);
      }
      const au = audioOf(c, d);
      parts.push(au ? `${au}[${a}]` : `${silence(d)},${AF}[${a}]`);
      return { v, a, d, td: x.td, c };
    });
    let accV; let accA;
    if (!mains.length) {
      accV = L(); accA = L();
      parts.push(`color=c=black:s=${W}x${H}:r=${num(F)}:d=${num(TALL || 1)},${norm}[${accV}]`, `${silence(TALL || 1)},${AF}[${accA}]`);
    } else {
      accV = mains[0].v; accA = mains[0].a;
      let len = mains[0].d;
      for (let i = 1; i < mains.length; i += 1) {
        const m = mains[i]; const nv = L(); const na = L();
        if (m.td > 0) {
          const t = FX.TRANS[m.c.trans.type] || FX.TRANS.dissolve;
          let tr = t.ff ? `transition=${t.ff}` : t.expr ? `transition=custom:expr=${q(t.expr)}` : 'transition=fade';
          if (t.ff && opts.xfadeOk && !opts.xfadeOk.has(t.ff)) tr = 'transition=fade';
          parts.push(`[${accV}][${m.v}]xfade=${tr}:duration=${num(m.td)}:offset=${num(Math.max(0, len - m.td))},settb=AVTB[${nv}]`);
          parts.push(`[${accA}][${m.a}]acrossfade=d=${num(m.td)}:c1=tri:c2=tri[${na}]`);
          len += m.d - m.td;
        } else {
          const cv = L();
          parts.push(`[${accV}][${accA}][${m.v}][${m.a}]concat=n=2:v=1:a=1[${cv}][${na}]`, `[${cv}]${norm}[${nv}]`);
          len += m.d;
        }
        accV = nv; accA = na;
      }
      if (TALL > mainTotal + 1e-3) {
        const nv = L(); const na = L();
        parts.push(`[${accV}]tpad=stop_mode=add:stop_duration=${num(TALL - mainTotal + 0.1)}:color=black,trim=duration=${num(TALL)},setpts=PTS-STARTPTS[${nv}]`, `[${accA}]apad,atrim=duration=${num(TALL)}[${na}]`);
        accV = nv; accA = na;
      }
    }

    // ----- overlay tracks (V2… then text), bottom first -----
    const audioMix = [accA];
    const layers = C.tracksOf(e, 'video').concat(C.tracksOf(e, 'text'));
    for (const k of layers) {
      for (const it of k.items) {
        const d = C.itemDur(it); const S0 = it.start;
        if (!k.hide) {
          const src = source(it, d);
          const color = [...colorF(it), ...FX.effectFilters(it.fx, `i${lab}`)];
          const ly = L(); const nb = L();
          if (src.full && it.kind === 'title') {
            parts.push(`${src.v},format=rgba${fadeF(it, d, true).map((f) => `,${f}`).join('')},setpts=PTS-STARTPTS+${num(S0)}/TB[${ly}]`);
            parts.push(`[${accV}][${ly}]overlay=x=0:y=0:eof_action=pass:enable=${q(`between(t,${num(S0)},${num(S0 + d)})`)},${norm}[${nb}]`);
          } else {
            const lay = layerFilters(it, src.w, src.h, W, H, S0);
            const blend = FX.BLEND[it.blend] || FX.BLEND.normal;
            parts.push(`${src.v}${color.length ? `,${color.join(',')}` : ''},format=rgba,${lay.f.join(',')}${fadeF(it, d, true).map((f) => `,${f}`).join('')},setpts=PTS-STARTPTS+${num(S0)}/TB[${ly}]`);
            if (!blend.ff) {
              parts.push(`[${accV}][${ly}]overlay=x=${q(lay.x)}:y=${q(lay.y)}:eval=frame:eof_action=pass:enable=${q(`between(t,${num(S0)},${num(S0 + d)})`)},${norm}[${nb}]`);
            } else {
              const neutral = blend.neutral === 'white' ? 'white' : blend.neutral === 'gray' ? '0x808080' : 'black';
              const pad = L(); const full = L(); const base0 = L(); const mixd = L();
              parts.push(`color=c=${neutral}:s=${W}x${H}:r=${num(F)}:d=${num(TALL)},format=rgba[${pad}]`);
              parts.push(`[${pad}][${ly}]overlay=x=${q(lay.x)}:y=${q(lay.y)}:eval=frame:eof_action=pass:enable=${q(`between(t,${num(S0)},${num(S0 + d)})`)},format=gbrp[${full}]`);
              parts.push(`[${accV}]format=gbrp[${base0}]`);
              parts.push(`[${base0}][${full}]blend=all_mode=${blend.ff}:all_opacity=${num(clamp(it.opacity ?? 1, 0, 1))}[${mixd}]`, `[${mixd}]${norm}[${nb}]`);
            }
          }
          accV = nb;
        }
        if (!k.mute && (it.kind === 'video')) {
          const au = audioOf(it, d);
          if (au) { const al = L(); parts.push(`${au},adelay=delays=${Math.round(S0 * 1000)}:all=1[${al}]`); audioMix.push(al); }
        }
      }
    }
    for (const k of C.tracksOf(e, 'audio')) {
      if (k.mute) continue;
      for (const it of k.items) {
        const d = C.itemDur(it);
        const au = audioOf({ ...it, kind: 'audio' }, d);
        if (au) { const al = L(); parts.push(`${au},adelay=delays=${Math.round(it.start * 1000)}:all=1[${al}]`); audioMix.push(al); }
      }
    }
    if (audioMix.length > 1) {
      const na = L();
      parts.push(`${audioMix.map((x) => `[${x}]`).join('')}amix=inputs=${audioMix.length}:duration=longest:dropout_transition=0:normalize=0,apad,atrim=duration=${num(TALL)}[${na}]`);
      accA = na;
    }

    // ----- in–out range, then the preset -----
    let duration = TALL;
    const r = opts.range;
    if (r && r.b > r.a + 1e-3) {
      const nv = L(); const na = L();
      parts.push(`[${accV}]trim=start=${num(r.a)}:end=${num(r.b)},setpts=PTS-STARTPTS[${nv}]`, `[${accA}]atrim=start=${num(r.a)}:end=${num(r.b)},asetpts=PTS-STARTPTS[${na}]`);
      accV = nv; accA = na; duration = r.b - r.a;
    }
    for (const x of inputs) out.push(...x.extra, '-i', x.p);
    const p = opts.preset || null;
    let w = W; let h = H; let ext = 'mp4';
    const special = p && FX.exportCodec ? FX.exportCodec(p, duration) : null;
    if (opts.stills) {
      const rate = typeof opts.stills === 'number' ? opts.stills : 0;
      parts.push(`[${accV}]${rate ? `fps=${num(rate)}` : 'null'}[outv]`, `[${accA}]anullsink`);
      out.push('-filter_complex', parts.join(';'), '-map', '[outv]', '-start_number', '1');
      ext = opts.stillsExt || 'png';
    } else if (special?.audioOnly) {
      parts.push(`[${accV}]nullsink`, `[${accA}]anull[outa]`);
      out.push('-filter_complex', parts.join(';'), '-map', '[outa]', ...special.args);
      ext = special.ext; w = 0; h = 0;
    } else if (p && p.codec === 'gif') {
      const pf = opts.presetFilters ? opts.presetFilters(p, { w: W, h: H, fps: F }, { fit: opts.fit, offset: opts.offset }) : { vf: [], w: W, h: H };
      w = pf.w; h = pf.h;
      const chain = [...pf.vf.filter((x) => !x.startsWith('fps')), `fps=${p.fps || 15}`];
      parts.push(`[${accV}]${chain.join(',')},split[gx][gy];[gx]palettegen=stats_mode=diff[gpal];[gy][gpal]paletteuse=dither=sierra2_4a[outv]`, `[${accA}]anullsink`);
      out.push('-filter_complex', parts.join(';'), '-map', '[outv]', '-loop', '0');
      ext = 'gif';
    } else {
      let vf = [];
      if (p && opts.presetFilters) { const pf = opts.presetFilters(p, { w: W, h: H, fps: F }, { fit: opts.fit, offset: opts.offset }); vf = pf.vf; w = pf.w; h = pf.h; }
      parts.push(`[${accV}]${vf.length ? vf.join(',') : 'null'}[outv]`);
      out.push('-filter_complex', parts.join(';'), '-map', '[outv]', '-map', `[${accA}]`);
      if (special) { out.push(...special.args); ext = special.ext; } else if (p && opts.codecArgs) { const ca = opts.codecArgs(p); out.push(...ca.args); ext = ca.ext; } else out.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '256k');
    }
    if (opts.out) out.push(opts.out);
    return { args: out, duration, ext, w, h, inputs: inputs.map((x) => x.p), fps: F };
  }

  return { args, titleJobs, fitSize, layerFilters, hasTransform };
})();
if (typeof module !== 'undefined') module.exports = CutFF;
