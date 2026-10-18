// Inspo drop, the pure part (round 65, inspodrop65): which board items are real media, how many pictures a drop may
// cost, which moments of a clip become its key frames, and the one line that tells the chat what the clip is.
// No DOM, no Hearth globals: board-drop.js uses it in the window, dev/inspodrop-test.js in Node.
const BoardDropCore = (() => {
  const MAX_ITEMS = 10; // media items per drop (the rest: a plain note)
  const MAX_PICS = 24; // pictures per drop in all (a clip's frames count)
  const FRAME_PX = 768; // a frame's long side
  const FRAMES_MIN = 2; const FRAMES_MAX = 8;
  const r1 = (v) => Math.round(v * 10) / 10;
  const r3 = (v) => Math.round(v * 1000) / 1000;

  // image, gif, a website's snapshot → a picture; video → a clip; notes / colors / text → not media (their vibe)
  function kindOf(it) {
    if (!it || it.hidden) return null;
    if (it.type === 'video') return it.src ? 'video' : it.poster ? 'image' : null;
    if (it.type === 'image' || it.type === 'gif') return it.src || it.thumb ? 'image' : null;
    if (it.type === 'web') return it.src || it.thumb || it.tiny ? 'image' : null;
    return null;
  }
  // which items a drop attaches: the media ones (capped) and what is left out
  function plan(items, { maxItems = MAX_ITEMS, maxPics = MAX_PICS } = {}) {
    const list = (items || []).filter(Boolean);
    const media = list.filter((it) => kindOf(it));
    const other = list.filter((it) => !kindOf(it) && it.type !== 'frame' && it.type !== 'link');
    const take = media.slice(0, maxItems);
    const pics = take.filter((it) => kindOf(it) === 'image').length;
    const clips = take.filter((it) => kindOf(it) === 'video').length;
    return { take, over: media.length - take.length, other, pics, clips, framesPerClip: clips ? framesPerClip(clips, pics, maxPics) : 0 };
  }
  // the picture budget left after the stills, shared by the clips (at least 2 frames each, at most 8)
  function framesPerClip(clips, pics = 0, maxPics = MAX_PICS) {
    if (!clips) return 0;
    return Math.max(FRAMES_MIN, Math.min(FRAMES_MAX, Math.floor((maxPics - pics) / clips)));
  }
  // how many key frames a clip of this length deserves: 4 for a short one, 6 up to 15 s, 8 beyond (never above max)
  function frameCount(duration, max = FRAMES_MAX) {
    const d = Number(duration) || 0;
    const want = d <= 4 ? 4 : d <= 15 ? 6 : 8;
    return Math.max(1, Math.min(want, max));
  }
  // The key frames' times: n evenly spaced moments starting at the first frame, n even so the exact middle is one of
  // them (0, d/n, …, d/2, …). fps known: snapped to a frame, never past the last one, never two on the same frame.
  function frameTimes(duration, { max = FRAMES_MAX, fps = 0 } = {}) {
    const d = Number(duration) || 0;
    if (!(d > 0)) return [0];
    let n = frameCount(d, max);
    if (n > 1 && n % 2) n -= 1; // even → the middle is a pick
    const step = fps > 0 ? 1 / fps : 0;
    const last = step ? Math.max(0, d - step) : d;
    const out = [];
    for (let i = 0; i < n; i++) {
      let t = (d * i) / n;
      if (step) t = Math.round(t / step) * step;
      t = r3(Math.min(last, Math.max(0, t)));
      if (!out.some((x) => Math.abs(x - t) < (step || 1e-3) * 0.5)) out.push(t);
    }
    return out;
  }
  // a frame's size: the long side at most px (a portrait clip stays portrait), even numbers (encoders like them)
  function frameSize(w, h, px = FRAME_PX) {
    const W = Number(w) || 0; const H = Number(h) || 0;
    if (!W || !H) return { width: px };
    const k = Math.min(1, px / Math.max(W, H));
    const even = (v) => Math.max(2, Math.round((v * k) / 2) * 2);
    return { width: even(W), height: even(H) };
  }
  const clock = (t) => { const s = Math.max(0, Number(t) || 0); const m = Math.floor(s / 60); const r = r1(s - m * 60); return `${m}:${(r < 10 ? '0' : '') + r.toFixed(1)}`; };
  // the one short line the chat gets with a clip's frames
  function videoLine({ name, duration, w, h, times = [], path = '', canOpen = false } = {}) {
    const size = w && h ? `, ${w}×${h}` : '';
    const at = times.length ? `; ${times.length} frame${times.length === 1 ? '' : 's'} attached as pictures, at ${times.map(clock).join(', ')}` : '';
    const file = path ? ` File: ${path}${canOpen ? '' : ' (for reference)'}` : '';
    return `${name || 'clip'}: video, ${r1(Number(duration) || 0)} s${size}${at}.${file}`;
  }
  // a file name that works on Windows and a Mac
  const safeName = (s, fallback = 'reference') => String(s || fallback).replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback;
  const extOf = (p, fallback = '.jpg') => { const m = String(p || '').split(/[?#]/)[0].match(/\.(png|jpe?g|gif|webp|avif|bmp|mp4|webm|mov|m4v|mkv)$/i); return m ? `.${m[1].toLowerCase()}` : fallback; };
  const isUrl = (p) => /^https?:\/\//i.test(String(p || ''));
  const isData = (p) => /^data:/i.test(String(p || ''));

  return { MAX_ITEMS, MAX_PICS, FRAME_PX, kindOf, plan, framesPerClip, frameCount, frameTimes, frameSize, clock, videoLine, safeName, extOf, isUrl, isData };
})();
if (typeof module !== 'undefined') module.exports = BoardDropCore;
