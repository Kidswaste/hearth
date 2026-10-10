// /renders: the render queue from chat (round 13, renders.js). Everything the list and its menus do:
//   /renders                       what renders now and the last ones (the list opens)
//   /renders render reels square   render presets of the open video (or: seq, a file path); no preset: the panel
//   /renders socials               Reels / TikTok / Shorts 9:16 · Feed 4:5 · Square · YouTube 16:9, one after the other
//   /renders presets               the presets with their sizes, frame rates and tips
//   /renders pause | resume | cancel [n | all | last]   /renders retry [n] · again [n] (re-render, same settings)
//   /renders open | reveal | copy | review | trash [n]  /renders history · clear [all] · parallel 1-3
// n is the number /renders shows (1 = the first in the list), "last" the newest finished one, or words of its name.
(() => {
  const R = () => Renders;
  const C = () => RendersCore;
  const SUBS = [
    ['list', 'what renders now'], ['render', 'render <presets…> [seq | <file>]'], ['socials', 'all socials of the open video / sequence'], ['presets', 'sizes, frame rates, tips'],
    ['pause', 'pause [n|all]'], ['resume', 'resume [n|all]'], ['cancel', 'cancel [n|all]'], ['retry', 'retry [n]: a failed one again'], ['again', 'again [n]: re-render, same settings'],
    ['open', 'open [n]'], ['reveal', 'reveal [n]: in Finder / Explorer'], ['copy', 'copy [n]: its path'], ['review', 'review [n]: in Video Review'], ['trash', 'trash [n]: to the Trash'],
    ['history', 'past renders'], ['clear', 'clear [all]: finished ones off the list'], ['parallel', 'parallel 1-3: renders at once'],
  ];
  // the numbered list: live jobs, this session's ended ones (newest first), then the history
  function items() {
    const live = R().list().filter((j) => ['queued', 'starting', 'running', 'paused'].includes(j.status));
    const ended = R().list().filter((j) => !live.includes(j)).reverse();
    const seen = new Set([...live, ...ended].map((j) => j.id));
    return [...live, ...ended, ...R().history().filter((h) => !seen.has(h.id))];
  }
  function pickOne(ref, want = null) {
    const all = items();
    const s = String(ref || '').trim().toLowerCase();
    const ok = (j) => !want || want(j);
    if (!s || s === 'last') return all.find((j) => ok(j) && (want ? true : j.status === 'done')) || all.find(ok) || null;
    if (/^\d+$/.test(s)) return all[Number(s) - 1] || null;
    return all.find((j) => ok(j) && `${j.title} ${j.output || ''}`.toLowerCase().includes(s)) || null;
  }
  const line = (j, i) => `${i + 1}. ${C().ICON[j.status] || '·'} ${j.make ? `${j.make.glyph || '■'} ` : ''}**${j.status === 'done' && j.output ? C().base(j.output) : j.title}** · ${R().list().includes(j) ? R().words(j) : `${C().fmtAgo(j.ended || 0)}${j.trashed ? ' · in the Trash' : ''}`}${j.status === 'failed' && j.error ? `\n   ${j.error.reason} Fix: ${j.error.fix}` : ''}`;
  function listText(hist = false) {
    const all = items();
    const shown = hist ? all : all.slice(0, 12);
    if (!shown.length) return 'Nothing rendered yet. `/renders render reels` renders the open video for Reels / TikTok / Shorts; `/renders presets` lists the presets.';
    return `${hist ? 'Past renders' : 'Renders'}:\n${shown.map(line).join('\n')}${!hist && all.length > shown.length ? `\n… ${all.length - shown.length} more: /renders history` : ''}`;
  }
  function presetsText() {
    return `Output presets (/renders render <name…>; the ⇪ Render… panel has them as chips, with frame rate, quality and size):\n${C().PRESETS.map((p) => `- **${p.id}** · ${p.name} (${p.short})${p.w ? ` · ${p.w}${p.h ? `×${p.h}` : ' wide'}` : ' · same size'}${p.fps ? ` · ${p.fps} fps` : ''}${p.limit ? ` · first ${p.limit} s` : ''}: ${p.tip}`).join('\n')}\n- **socials** = ${C().SOCIALS.join(' + ')}\nAlso: fps=24|30|60, quality=draft|high|best, size=full|2/3|half, fit=crop|blur|fit.`;
  }
  // "reels square fps=60 quality=best seq" → { presets, opts, source, file }
  function parseRender(rest) {
    const toks = String(rest || '').match(/"[^"]+"|'[^']+'|\S+/g) || [];
    const opts = {}; let source = null; let file = null; const words = [];
    for (const t0 of toks) {
      const t = t0.replace(/^["']|["']$/g, '');
      const kv = t.match(/^(fps|quality|size|fit)=(.+)$/i);
      if (kv) { opts[kv[1].toLowerCase()] = kv[1].toLowerCase() === 'fps' ? Number(kv[2]) || 0 : kv[2].toLowerCase(); continue; }
      if (/^(\d\d)fps$/i.test(t)) { opts.fps = Number(t.slice(0, 2)); continue; }
      if (/^(draft|high|best)$/i.test(t)) { opts.quality = t.toLowerCase(); continue; }
      if (/^(seq|sequence|lab)$/i.test(t)) { source = 'seq'; continue; }
      if (/^(video|this)$/i.test(t)) { source = 'video'; continue; }
      if (/^([A-Za-z]:\\|\/|~)/.test(t)) { source = 'file'; file = t; continue; }
      words.push(t);
    }
    return { presets: C().pick(words.join(' ')), opts, source, file };
  }
  async function each(ref, fn, filter) {
    if (/^all$/i.test(ref || '')) { const js = R().list().filter(filter); for (const j of js) await fn(j.id); return js.length; }
    const j = pickOne(ref, filter);
    if (!j) return 0;
    await fn(j.id);
    return 1;
  }
  const isLive = (j) => ['queued', 'starting', 'running', 'paused'].includes(j.status);
  async function run(args, ctx) {
    const [sub0, ...restW] = String(args || '').trim().split(/\s+/);
    const sub = (sub0 || 'list').toLowerCase();
    const rest = restW.join(' ');
    if (sub === 'list' || sub === 'queue' || sub === 'status') { R().open(); return listText(); }
    if (sub === 'history') { R().open({ tab: 'history' }); return listText(true); }
    if (sub === 'presets') return presetsText();
    if (sub === 'render' || sub === 'socials' || C().pick(sub0).length) {
      const p = parseRender(sub === 'socials' ? `socials ${rest}` : sub === 'render' ? rest : args);
      if (!p.presets.length) { await R().panel(p.source ? { source: p.source } : {}); return undefined; }
      const st = { presets: new Set(p.presets), fps: p.opts.fps ?? 0, quality: p.opts.quality || 'high', size: p.opts.size || 'full', fit: p.opts.fit || 'crop', sound: true, open: false, source: p.source, file: p.file };
      const src = R().sources();
      if (!st.source) st.source = src[0]?.id || null;
      if (!st.source) return 'Nothing to render: open a video in Video Review, a sequence in the Lab (▤ Sequence), or give a file path (/renders render reels /path/to/video.mp4).';
      const made = await R().go(st, src);
      return `⇪ In the queue: ${made.map((j) => j.title).join(' · ')}. They render in the background (⇪ at the bottom of the rail; /renders to follow).`;
    }
    if (sub === 'pause') { const n = await each(rest, (id) => R().pause(id), (j) => isLive(j) && j.status !== 'paused'); return n ? `❚❚ Paused ${n}.${R().platform === 'win32' ? ' (On Windows a paused ffmpeg render starts again from the top when resumed.)' : ''}` : 'Nothing to pause.'; }
    if (sub === 'resume') { const n = await each(rest, (id) => R().resume(id), (j) => j.status === 'paused'); return n ? `▶ Resumed ${n}.` : 'Nothing is paused.'; }
    if (sub === 'cancel' || sub === 'stop') { const n = await each(rest, (id) => R().cancel(id), isLive); return n ? `■ Cancelled ${n}.` : 'Nothing to cancel.'; }
    if (sub === 'retry' || sub === 'again' || sub === 'rerender') {
      const j = pickOne(rest, sub === 'retry' ? (x) => ['failed', 'cancelled'].includes(x.status) : (x) => x.status === 'done' || x.status === 'failed');
      if (!j) return sub === 'retry' ? 'No failed or cancelled render to retry.' : 'No finished render to make again.';
      const nj = await R().retry(j.id);
      return nj ? `↻ ${nj.title} is in the queue again (same settings).` : `↻ Running \`${j.again?.line || ''}\` again.`;
    }
    if (['open', 'reveal', 'copy', 'review', 'trash'].includes(sub)) {
      const j = pickOne(rest, (x) => x.status === 'done' && x.output && !x.trashed);
      if (!j) return 'No finished render with a file (yet).';
      if (sub === 'open') await window.hub.fs.open(j.output);
      if (sub === 'reveal') await window.hub.fs.reveal(j.output);
      if (sub === 'copy') await copyText(j.output, 'Path copied');
      if (sub === 'review') { activate('tool:ae'); await Review.ensureMounted?.(); await Review.open(j.output); }
      if (sub === 'trash') { await R().trash(j.id); return `${C().base(j.output)} moved to the ${R().platform === 'win32' ? 'Recycle Bin' : 'Trash'}.`; }
      return sub === 'copy' ? `Copied: \`${j.output}\`` : `${sub === 'reveal' ? C().revealLabel(R().platform) : sub === 'review' ? 'Opened in Video Review' : 'Opened'}: ${C().base(j.output)}`;
    }
    if (sub === 'clear') { const n = R().clear({ all: /^all$/i.test(rest) }); return /^all$/i.test(rest) ? 'The list and the history are empty (the files stay where they are).' : `${n} finished render${n === 1 ? '' : 's'} off the list (the history keeps them).`; }
    if (sub === 'parallel') { const n = Math.max(1, Math.min(3, Number(rest) || 1)); store.set('renders.parallel', n); R().start(); return `${n} render${n === 1 ? '' : 's'} at once${n === 1 ? ' (the smoothest)' : ' (the app may feel heavier while they run)'}.`; }
    return `Unknown: ${sub}. ${SUBS.map(([s]) => s).join(' · ')}`;
  }
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('renders')) return;
    Commands.register({
      name: 'renders', aliases: ['rq', 'render-list'], area: 'Video', args: '[render <presets…> | socials | presets | pause|resume|cancel [n|all] | retry|again [n] | open|reveal|copy|review|trash [n] | history | clear | parallel n]',
      desc: 'The render queue: everything Hearth renders, records or exports (progress, time left, pause / cancel / retry), output presets (Reels / TikTok / Shorts, YouTube, Square, Story, GIF, WebM, ProRes, audio) and the history',
      keywords: 'render queue export presets reels tiktok shorts youtube 4k square story gif webm prores master audio socials history reveal finder explorer',
      examples: ['/renders', '/renders render reels square', '/renders socials', '/renders render gif seq', '/renders pause all', '/renders reveal last'],
      complete: (a) => {
        const w = String(a || '').split(/\s+/);
        if (w.length > 1 && /^render$/i.test(w[0])) return [...C().PRESETS.map((p) => ({ value: `render ${p.id}`, hint: `${p.name} · ${p.short}` })), { value: 'render socials', hint: 'all socials' }, { value: 'render gif seq', hint: 'the Lab sequence as a GIF' }];
        if (w.length > 1 && /^(open|reveal|copy|review|trash|again|retry|pause|resume|cancel)$/i.test(w[0])) return [...items().slice(0, 8).map((j, i) => ({ value: `${w[0]} ${i + 1}`, hint: j.title })), { value: `${w[0]} last` }, ...(/^(pause|resume|cancel)$/i.test(w[0]) ? [{ value: `${w[0]} all` }] : [])];
        return SUBS.map(([value, hint]) => ({ value, hint })).filter((x) => x.value.startsWith((w[0] || '').toLowerCase()));
      },
      run,
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();
})();
